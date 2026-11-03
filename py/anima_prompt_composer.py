"""
Anima 提示词创作器 (Prompt Composer)
—— 可视化组合各分类标签，按模型模式（Anima/Noob/Aesthetic）输出格式化 prompt
"""
import re

DEFAULT_QUALITY = {
    "Anima": "masterpiece, best quality, score_7, score_9, very aesthetic, ultra detailed",
    "Noob": "masterpiece, best quality, newest, absurdres, highres",
    "Aesthetic": "masterpiece, best quality, very aesthetic, ultra detailed",
}
MODES = ["Anima", "Noob", "Aesthetic"]
_KEEP_UNDERSCORE_PREFIXES = ("score_", "absurdres", "highres", "newest", "masterpiece",
                              "best quality", "very aesthetic", "ultra detailed")

class AnimaPromptCreator:
    CATEGORY = "Anima"
    FUNCTION = "compose"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "quality_tags": ("STRING", {"multiline": True, "default": "",
                    "placeholder": "留空自动用模型默认质量词"}),
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
                    "placeholder": "元标签（用逗号分隔，可多填）：highres, absurdres…"
                }),
                "count_tags": ("STRING", {"multiline": False, "default": "",
                    "placeholder": "如: 1girl, 2girls, 1boy, 1girl 1boy"}),
                "character_tags": ("STRING", {"multiline": True, "default": "",
                    "placeholder": "角色名 + 特征标签，逗号分隔"}),
                "series_tags": ("STRING", {"multiline": False, "default": "",
                    "placeholder": "系列/作品名，逗号分隔"}),
                "artist_tags": ("STRING", {"multiline": False, "default": "",
                    "placeholder": "画师标签，逗号分隔；Anima模式自动加@"}),
                "general_tags": ("STRING", {"multiline": True, "default": "",
                    "placeholder": "通用标签（服装/姿势/表情/背景等），逗号分隔"}),
                "model_mode": ("INT", {"default": 0, "min": 0, "max": 2,
                    "tooltip": "0=Anima, 1=Noob, 2=Aesthetic"}),
                "natural_language": ("STRING", {"multiline": True, "default": "[]",
                    "placeholder": "自然语言 JSON: [{\"cn\":\"中文\",\"en\":\"english\",\"position\":\"end\"}]"}),
            }
        }

    def _parse_tags(self, text):
        if not text or not text.strip(): return []
        return [t.strip() for t in re.split(r'[,，]+', text) if t.strip()]

    def _format_tag(self, tag, mode="Anima"):
        """下划线→空格，保留白名单前缀"""
        t = tag.strip()
        if not t: return t
        tl = t.lower()
        keep = any(tl.startswith(p) for p in _KEEP_UNDERSCORE_PREFIXES)
        if not keep:
            t = t.replace("_", " ")
        return t

    def _format_text(self, text, mode="Anima"):
        tags = self._parse_tags(text)
        result = []
        for t in tags:
            # 权重标签不处理括号
            is_weight = t.startswith("(") and t.endswith(")") and ":" in t
            t = self._format_tag(t, mode)
            if not is_weight:
                # 转义括号（权重标签除外，所有模式）
                t = re.sub(r'(?<!\\)\(', '\\(', t)
                t = re.sub(r'(?<!\\)\)', '\\)', t)
            result.append(t)
        return ", ".join(result)

    def compose(self, quality_tags="", count_tags="", character_tags="",
                series_tags="", artist_tags="", general_tags="",
                model_mode=0, natural_language="[]",
                time_tag="year 2025", safety_tag="(无)", meta_tags=""):
        mode = MODES[max(0, min(2, int(model_mode)))]
        is_noob = mode == "Noob"

        # 质量词
        q = quality_tags.strip() if quality_tags.strip() else DEFAULT_QUALITY[mode]
        q_parsed = self._parse_tags(q)
        q_out = self._format_text(q, mode)
        # 追加元标签 / 时间词 / 安全词
        q_parts = [q_out] if q_out else []
        if meta_tags.strip():
            q_parts.extend([t.strip() for t in meta_tags.split(",") if t.strip()])
        if time_tag and time_tag != "(无)":
            q_parts.append(time_tag)
        if safety_tag and safety_tag != "(无)":
            q_parts.append(safety_tag)
        q_out = ", ".join(q_parts)

        # 拆分质量组以便 NL 插入
        q_quality = [q_parts[0]] if len(q_parts) > 0 else []
        q_meta = []; q_time = []; q_safety = []
        for i in range(1, len(q_parts)):
            p = q_parts[i]
            if p == time_tag: q_time.append(p)
            elif p == safety_tag: q_safety.append(p)
            else: q_meta.append(p)

        # 计数
        ct_out = count_tags.strip()

        # 角色
        ch_raw = self._parse_tags(character_tags)
        ch_out = self._format_text(", ".join(ch_raw), mode)

        # 系列
        s_out = self._format_text(series_tags, mode)

        # 画师：Noob 去 @，Anima/Aesthetic 加 @
        a_raw = self._parse_tags(artist_tags)
        a_formatted = []
        for a in a_raw:
            af = a.lstrip("@")
            af = self._format_tag(af, mode)
            # 转义括号（权重括号除外）
            is_w = af.startswith("(") and af.endswith(")") and ":" in af
            if not is_w:
                af = re.sub(r'(?<!\\)\(', '\\(', af)
                af = re.sub(r'(?<!\\)\)', '\\)', af)
            a_formatted.append(af)
        if is_noob:
            a_out = ", ".join(a_formatted)
        else:
            a_out = ", ".join(("@" + a) if not a.startswith("@") else a for a in a_formatted)

        # 通用
        g_raw = self._parse_tags(general_tags)
        if is_noob:
            g_out = self._format_text(general_tags, mode)
        else:
            g_out = self._format_text(general_tags, mode)
        

        # 自然语言
        import json
        nl_items = []
        try:
            nl_items = json.loads(natural_language) if natural_language.strip() else []
        except Exception:
            nl_items = []
        # 按位置分组
        nl_after_quality = []
        nl_after_meta = []
        nl_after_time = []
        nl_after_count = []
        nl_after_character = []
        nl_after_safety = []
        nl_after_artist = []
        nl_start = []
        nl_end = []
        for nl in nl_items:
            en = (nl.get("en") or "").strip().rstrip(".").strip()
            if not en:
                continue
            pos = nl.get("position", "end")
            if pos == "after_quality":
                nl_after_quality.append(en)
            elif pos == "after_meta":
                nl_after_meta.append(en)
            elif pos == "after_time":
                nl_after_time.append(en)
            elif pos == "after_count":
                nl_after_count.append(en)
            elif pos == "after_character":
                nl_after_character.append(en)
            elif pos == "after_safety":
                nl_after_safety.append(en)
            elif pos == "after_artist":
                nl_after_artist.append(en)
            elif pos == "start":
                nl_start.append(en)
            else:
                nl_end.append(en)

        # 组装
        if is_noob:
            # Noob: count → char → series → artist → general → quality
            groups = []
            if nl_start:
                groups.append(", ".join(nl_start))
            if ct_out:
                groups.append(ct_out)
            if nl_after_count:
                groups.append(", ".join(nl_after_count))
            if ch_out:
                groups.append(ch_out)
            if nl_after_character:
                groups.append(", ".join(nl_after_character))
            if nl_after_safety:
                groups.append(", ".join(nl_after_safety))
            if s_out:
                groups.append(s_out)
            if a_out:
                groups.append(a_out)
            if nl_after_artist:
                groups.append(", ".join(nl_after_artist))
            if g_out:
                groups.append(g_out)
            if q_out:
                groups.append(q_out)
            if nl_after_quality:
                groups.append(", ".join(nl_after_quality))
            if q_meta:
                groups.append(", ".join(q_meta))
            if nl_after_meta:
                groups.append(", ".join(nl_after_meta))
            if q_time:
                groups.append(", ".join(q_time))
            if nl_after_time:
                groups.append(", ".join(nl_after_time))
            if q_safety:
                groups.append(", ".join(q_safety))
            if nl_after_safety:
                groups.append(", ".join(nl_after_safety))
            if nl_end:
                groups.append(", ".join(nl_end))
        else:
            # Anima/Aesthetic: quality → count → char → series → artist → general
            groups = []
            if nl_start:
                groups.append(", ".join(nl_start))
            if q_quality:
                groups.append(", ".join(q_quality))
            if nl_after_quality:
                groups.append(", ".join(nl_after_quality))
            if q_meta:
                groups.append(", ".join(q_meta))
            if nl_after_meta:
                groups.append(", ".join(nl_after_meta))
            if q_time:
                groups.append(", ".join(q_time))
            if nl_after_time:
                groups.append(", ".join(nl_after_time))
            if q_safety:
                groups.append(", ".join(q_safety))
            if nl_after_safety:
                groups.append(", ".join(nl_after_safety))
            if ct_out:
                groups.append(ct_out)
            if nl_after_count:
                groups.append(", ".join(nl_after_count))
            if ch_out:
                groups.append(ch_out)
            if nl_after_character:
                groups.append(", ".join(nl_after_character))
            if nl_after_safety:
                groups.append(", ".join(nl_after_safety))
            if s_out:
                groups.append(s_out)
            if a_out:
                groups.append(a_out)
            if nl_after_artist:
                groups.append(", ".join(nl_after_artist))
            if g_out:
                groups.append(g_out)
            if nl_end:
                groups.append(", ".join(nl_end))

        # 去重：按分组顺序，后面的 tag 遇到前面的就跳过
        seen = set()
        deduped = []
        for g in groups:
            tags = [t.strip() for t in g.split(",")]
            keep = []
            for t in tags:
                key = t.lower().replace("_", " ").lstrip("@")
                if key not in seen:
                    seen.add(key)
                    keep.append(t)
            if keep:
                deduped.append(", ".join(keep))
        
        prompt = ", ".join(deduped)
        return (prompt,)


NODE_CLASS_MAPPINGS = {"AnimaPromptCreator": AnimaPromptCreator}
NODE_DISPLAY_NAME_MAPPINGS = {"AnimaPromptCreator": "✏️ 提示词创作器"}
