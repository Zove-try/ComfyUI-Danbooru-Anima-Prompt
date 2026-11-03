"""
NewBie 提示词创作器 (NewBie Prompt Composer)
—— 可视化组合 XML 格式提示词，支持多角色
"""
import re
import json

# ── 分类定义（集中管理，方便扩展预制 tag）──

CHARACTER_FIELDS = [
    ("n",       "角色名",   "如: dusk \\(arknights\\)"),
    ("gender",  "类型",     "1girl, 1boy"),
    ("appearance", "外貌",  "发色/瞳色/体型等，逗号分隔"),
    ("clothing","服装",     "逗号分隔"),
    ("expression","表情",   "逗号分隔"),
    ("action",  "姿势/动作","逗号分隔"),
    ("interaction","互动",  "与角色/物体/环境的互动"),
    ("position","画面位置", "center, left, right, foreground, background..."),
]

GENERAL_FIELDS = [
    ("count",       "计数",     "1girl, 2girls, solo..."),
    ("artists",     "画师",     "artist:name，逗号分隔"),
    ("style",       "风格",     "anime style, digital art..."),
    ("background",  "背景类型", "white_background, indoors, cityscape..."),
    ("perspective", "视角",     "from_above, close-up, wide_angle..."),
    ("atmosphere",  "氛围",     "cheerful, dark, romantic..."),
    ("lighting",    "光照",     "sunlight, candlelight, neon_lights..."),
    ("quality",     "质量",     "high resolution, detailed"),
    ("objects",     "物品",     "furniture, weapons, tools..."),
    ("other",       "其他",     "上述类别未涵盖的其他标签"),
]

DEFAULT_QUALITY = "high resolution, detailed"

class NewbiePromptCreator:
    CATEGORY = "Anima"
    FUNCTION = "compose"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)

    @classmethod
    def INPUT_TYPES(cls):
        """动态生成 INPUT_TYPES，基于 CATEGORIES 定义"""
        required = {}
        # General fields — 简单 string widgets
        for key, label, placeholder in GENERAL_FIELDS:
            multiline = key in ("objects", "other", "caption")
            default = DEFAULT_QUALITY if key == "quality" else ""
            required[f"nb_{key}"] = ("STRING", {
                "multiline": multiline,
                "default": default,
                "placeholder": placeholder,
            })
        # Characters — JSON 序列化
        required["nb_characters"] = ("STRING", {
            "multiline": True,
            "default": "[]",
            "placeholder": "JSON: [{n:\"...\",gender:\"1girl\",appearance:\"...\",...}]",
        })
        # Caption / 自然语言
        required["nb_caption"] = ("STRING", {
            "multiline": True,
            "default": "",
            "placeholder": "用自然语言描述画面内容",
        })
        return {"required": required}

    def _parse_tags(self, text):
        if not text or not text.strip():
            return []
        return [t.strip() for t in re.split(r'[,，]+', text) if t.strip()]

    @staticmethod
    def _norm_tags(val):
        """逗号分隔的 tag 中的空格转为下划线（danbooru 格式）"""
        if isinstance(val, list):
            val = ", ".join(str(v) for v in val if str(v).strip())
        if not val or not val.strip():
            return ""
        tags = [t.strip() for t in re.split(r'[,，]+', val) if t.strip()]
        return ", ".join(t.replace(" ", "_") for t in tags)

    def _build_char_xml(self, char, index):
        """构建单个角色的 XML 块。空字段跳过。"""
        lines = [f"  <character_{index}>"]
        for key, _label, _ph in CHARACTER_FIELDS:
            val = self._norm_tags(char.get(key) or "")
            if val:
                lines.append(f"    <{key}>{val}</{key}>")
        lines.append(f"  </character_{index}>")
        return "\n".join(lines)

    def _build_general_xml(self, data):
        """构建 <general_tags> 块。空字段跳过。"""
        lines = ["  <general_tags>"]
        for key, _label, _ph in GENERAL_FIELDS:
            val = self._norm_tags(data.get(key) or "")
            if val:
                lines.append(f"    <{key}>{val}</{key}>")
        lines.append("  </general_tags>")
        return "\n".join(lines)

    def compose(self, **kwargs):
        # 收集 general fields
        general_data = {}
        for key, _label, _ph in GENERAL_FIELDS:
            general_data[key] = kwargs.get(f"nb_{key}", "")

        # 解析角色 JSON
        chars = []
        raw_json = kwargs.get("nb_characters", "[]")
        try:
            chars = json.loads(raw_json)
            if not isinstance(chars, list):
                chars = []
        except Exception:
            chars = []

        # 构建 XML
        parts = ["<img>"]
        for i, char in enumerate(chars, start=1):
            parts.append(self._build_char_xml(char, i))
        parts.append(self._build_general_xml(general_data))

        # caption 放在 XML 内
        caption = kwargs.get("nb_caption", "").strip()
        if caption:
            parts.append("  <caption>" + caption + "</caption>")

        parts.append("</img>")

        prompt = "\n".join(parts)
        return (prompt,)


NODE_CLASS_MAPPINGS = {"NewbiePromptCreator": NewbiePromptCreator}
NODE_DISPLAY_NAME_MAPPINGS = {"NewbiePromptCreator": "🎨 NewBie 提示词创作器"}
