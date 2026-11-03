import re
"""
节点③：提示词组合器
接收 6 路分类 tags，按模型格式转换并拼接

Anima模式：艺术家标签自动加 @（已有@不重复），顺序：quality→count→character→series→artist→general
Noob/CKNoob模式：艺术家标签不加 @（检测到@自动去除），顺序：count→character→artist→general→quality
         general 内部：场景/其他→动作→表情→服装→配饰
"""

# ── 复用标签分类器的子分类逻辑（tag_groups.json + 后缀规则） ──
from .tag_classifier import classify_general, ALL_SUB_KEYS

# Noob 模式的子分类→排序映射
# 场景/其他=0, 动作=1, 表情=2, 服装=3, 配饰=4
_NOOB_CAT_PRIORITY = {
    "background": 0,      # 场景/背景
    "other": 0,           # 其他
    "body_features": 0,   # 身体特征（归入场景/其他）
    "pose": 1,            # 动作/姿势
    "expression": 2,      # 表情
    "clothing": 3,        # 服装
    "accessories": 4,     # 配饰
}

def _get_tag_order(tag_text):
    """获取 tag 在 Noob 模式下的排序编号（基于 classify_general）"""
    result, uncat = classify_general([tag_text])
    for cat_name, tags in result.items():
        if tag_text in tags:
            return _NOOB_CAT_PRIORITY.get(cat_name, 0)
    return 0

class PromptCombinator:
    """
    按顺序拼接: 
    Anima: [quality] [count] [character] [series] [artist] [general]
    Noob:  [count] [character] [artist] [general] [quality]
           general 内部: 场景/其他→动作→表情→服装→配饰
    """

    _KEEP_UNDERSCORE_PREFIXES = ("score_", "rating_", "source_", "year_")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # ── 标签输入 ──
                "quality_meta_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "质量/评分标签（为空时自动按模型模式填充预制词）"
                }),
                "time_tag": (["year 2025", "year 2024", "year 2023", "year 2022", "year 2021", "year 2020", "newest", "recent", "mid", "early", "old"], {
                    "default": "year 2025",
                    "tooltip": "时间词：默认 year 2025（Anima 官方推荐保守时间）"
                }),
                "safety_tag": (["(无)", "safe", "sensitive", "nsfw", "explicit"], {
                    "default": "(无)",
                    "tooltip": "安全词：safe/sensitive/nsfw/explicit"
                }),
                "meta_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "元标签（可多选/多填）：highres, absurdres, anime screenshot, official art…"
                }),
                "count_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "人物计数 (1girl, 1boy...)"
                }),
                "character_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "角色标签"
                }),
                "series_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "系列/版权标签"
                }),
                "artist_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "画师标签"
                }),
                "general_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "通用标签"
                }),
                # ── 格式设置 ──
                "model_type": (["Anima", "Noob", "CKNoob", "Aesthetic"], {
                    "default": "Anima",
                    "tooltip": "Aesthetic：去评分词；Anima：艺术家加@；Noob：艺术家不加@"
                }),
                "underscore_mode": (["保留下划线", "转空格"], {
                    "default": "转空格",
                    "tooltip": "转空格时自动跳过评分/评分/来源等保留前缀的标签"
                }),
                "escape_parens": ("BOOLEAN", {
                    "default": True,
                    "label_on": "转义 ()",
                    "label_off": "不转义"
                }),
                "artist_at_prefix": ("BOOLEAN", {
                    "default": False,
                    "label_on": "强制加 @",
                    "label_off": "由模型模式控制"
                }),
                "separator": ("STRING", {"default": ", "}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "convert"
    CATEGORY = "Danbooru Anima"

    def _process_single(self, tag_str, is_artist, model_type, underscore_mode, escape_parens, artist_at_prefix, separator):
        """处理单个分类的 tag 字符串：格式转换"""
        if not tag_str.strip():
            return []
        raw_tags = [t.strip() for t in tag_str.split(",") if t.strip()]
        processed = []
        for t in raw_tags:
            # ── 检测权重格式 (tag:1.2) 或 (@tag:1.2) ──
            weight_match = re.match(r'^\((@?)(.+):(-?\d+\.?\d*)\)$', t)
            if weight_match:
                has_at = weight_match.group(1) == "@"
                inner_tag = weight_match.group(2)
                weight_val = weight_match.group(3)
                # 内部 tag 正常处理
                saved = inner_tag
                if underscore_mode in ("转空格", "Convert to spaces") and not self._should_keep_underscore(inner_tag):
                    inner_tag = inner_tag.replace("_", " ")
                if escape_parens:
                    inner_tag = re.sub(r'(?<!\\)\(', '\\(', inner_tag)
                    inner_tag = re.sub(r'(?<!\\)\)', '\\)', inner_tag)
                # @ 处理
                if is_artist:
                    if model_type in ("Noob", "CKNoob"):
                        has_at = False  # 去除 @
                    elif artist_at_prefix or model_type == "Anima":
                        has_at = True   # 添加 @
                t = "(" + ("@" if has_at else "") + inner_tag + ":" + weight_val + ")"
                processed.append(t)
                continue
            # 转下划线 → 空格，但跳过白名单标签
            if underscore_mode in ("转空格", "Convert to spaces") and not self._should_keep_underscore(t):
                t = t.replace("_", " ")
            # 转义括号
            if escape_parens:
                t = re.sub(r'(?<!\\)\(', '\\(', t)
                t = re.sub(r'(?<!\\)\)', '\\)', t)
            # 艺术家 @ 处理
            if is_artist:
                if model_type in ("Noob", "CKNoob"):
                    t = t.lstrip("@")
                elif artist_at_prefix or model_type == "Anima":
                    if not t.startswith("@"):
                        t = "@" + t
            processed.append(t)
        return processed

    def _should_keep_underscore(self, tag):
        tag_lower = tag.lower()
        for prefix in self._KEEP_UNDERSCORE_PREFIXES:
            if tag_lower.startswith(prefix):
                return True
        return False

    # 各模型模式的默认质量预制词
    _QUALITY_PRESETS = {
        "Anima": "masterpiece, best quality, score_7, score_9, very aesthetic, ultra detailed",
        "Noob": "masterpiece, best quality, newest, absurdres, highres",
        "Aesthetic": "masterpiece, best quality, very aesthetic, ultra detailed",
    }

    def convert(self,
                quality_meta_tags="", count_tags="", character_tags="",
                series_tags="", artist_tags="", general_tags="",
                model_type="Anima", underscore_mode="转空格", escape_parens=True,
                artist_at_prefix=False, separator=", ",
                time_tag="year 2025", safety_tag="(无)", meta_tags=""):

        # 0. 质量框为空时自动填充模型预制词
        if not quality_meta_tags or not quality_meta_tags.strip():
            quality_meta_tags = self._QUALITY_PRESETS.get(model_type, "")

        # 1. 处理各分类的 tag（格式转换）
        q_tags = self._process_single(quality_meta_tags, False, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)
        c_tags = self._process_single(count_tags, False, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)
        ch_tags = self._process_single(character_tags, False, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)
        s_tags = self._process_single(series_tags, False, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)
        a_tags = self._process_single(artist_tags, True, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)
        g_tags = self._process_single(general_tags, False, model_type, underscore_mode, escape_parens, artist_at_prefix, separator)

        if model_type in ("Noob", "CKNoob"):
            # ── Noob/CKNoob 模式：自定义排序 ──
            # count → character → series → artist → general(sorted) → quality+meta+year+safety
            # 先把质量组准备好（最后放）
            q_meta = []
            if q_tags: q_meta.extend(q_tags)
            if meta_tags.strip():
                q_meta.extend([t.strip() for t in meta_tags.split(',') if t.strip()])
            else:
                q_meta.extend(['highres','absurdres'])
            
            if time_tag and time_tag not in ("(无)", "(none)"):
                q_meta.append(time_tag)
            if safety_tag and safety_tag not in ("(无)", "(none)"):
                q_meta.append(safety_tag)
            # 用 classify_general 一次分类所有 general tag
            if g_tags:
                cat_result, uncat = classify_general(g_tags)
                # 建立 tag → 优先级 映射
                tag_order = {}
                for cat_name, tags in cat_result.items():
                    pri = _NOOB_CAT_PRIORITY.get(cat_name, 0)
                    for t in tags:
                        tag_order[t] = pri
                for t in uncat:
                    tag_order[t] = 0
                g_sorted = sorted(g_tags, key=lambda t: tag_order.get(t, 0))
            else:
                g_sorted = []
            
            # 最终顺序：count → character → artist → general(sorted) → quality
            ordered_groups = []
            if c_tags: ordered_groups.append(separator.join(c_tags))
            if ch_tags: ordered_groups.append(separator.join(ch_tags))
            if s_tags: ordered_groups.append(separator.join(s_tags))
            if a_tags: ordered_groups.append(separator.join(a_tags))
            if g_sorted: ordered_groups.append(separator.join(g_sorted))
            if q_meta: ordered_groups.append(separator.join(q_meta))
        else:
            # ── Anima / Aesthetic 模式：原始顺序 ──
            # 按 Anima 官方：quality → meta → year → safety → count → character → series → artist → general
            q_meta = []
            if q_tags: q_meta.extend(q_tags)
            if meta_tags.strip():
                q_meta.extend([t.strip() for t in meta_tags.split(',') if t.strip()])
            else:
                q_meta.extend(['highres','absurdres'])
            
            if time_tag and time_tag not in ("(无)", "(none)"):
                q_meta.append(time_tag)
            if safety_tag and safety_tag not in ("(无)", "(none)"):
                q_meta.append(safety_tag)
            ordered_groups = []
            if q_meta: ordered_groups.append(separator.join(q_meta))
            if c_tags: ordered_groups.append(separator.join(c_tags))
            if ch_tags: ordered_groups.append(separator.join(ch_tags))
            if s_tags: ordered_groups.append(separator.join(s_tags))
            if a_tags: ordered_groups.append(separator.join(a_tags))
            if g_tags: ordered_groups.append(separator.join(g_tags))

        prompt = separator.join(ordered_groups)
        return (prompt,)


NODE_CLASS_MAPPINGS = {
    "AnimaPromptConverter": PromptCombinator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaPromptConverter": "提示词组合器",
}
