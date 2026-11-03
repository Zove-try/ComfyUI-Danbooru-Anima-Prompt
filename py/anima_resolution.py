"""Anima resolution selector.

Same job as TT分辨率选择器: pick a preset or type a custom width/height,
output INT width and INT height. Presets are Anima / Illustrious XL sizes
(mostly multiples of 64). Unique class_type so it does not collide with TT.
"""
from __future__ import annotations


class AnimaResolutionSelector:
    CATEGORY = "Danbooru Anima"
    FUNCTION = "get_resolution"
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("宽度", "高度")
    DESCRIPTION = "选择 Anima 常用分辨率，或开启自定义宽高。"

    # Labels stay Chinese like TT; stored value is the full label string.
    RESOLUTIONS = {
        "1024x1024 (1:1) (方形)": (1024, 1024),
        "1344x896 (3:2) (横屏)": (1344, 896),
        "896x1344 (2:3) (竖屏)": (896, 1344),
        "1216x832 (19:13) (横屏)": (1216, 832),
        "832x1216 (13:19) (竖屏)": (832, 1216),
        "1152x896 (9:7) (横屏)": (1152, 896),
        "896x1152 (7:9) (竖屏)": (896, 1152),
        "1536x1024 (3:2) (横屏)": (1536, 1024),
        "1024x1536 (2:3) (竖屏)": (1024, 1536),
        "1344x768 (7:4) (横屏)": (1344, 768),
        "768x1344 (4:7) (竖屏)": (768, 1344),
        "1280x720 (16:9) (横屏)": (1280, 720),
        "720x1280 (9:16) (竖屏)": (720, 1280),
        "1408x704 (2:1) (横屏)": (1408, 704),
        "704x1408 (1:2) (竖屏)": (704, 1408),
        "1536x640 (12:5) (横屏)": (1536, 640),
        "640x1536 (5:12) (竖屏)": (640, 1536),
        "768x768 (1:1) (方形)": (768, 768),
        "1536x1536 (1:1) (方形)": (1536, 1536),
    }

    @classmethod
    def INPUT_TYPES(cls):
        labels = list(cls.RESOLUTIONS.keys())
        return {
            "required": {
                "使用自定义分辨率": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "label_on": "开启自定义",
                        "label_off": "关闭自定义",
                    },
                ),
                "分辨率": (
                    labels,
                    {"default": "1344x896 (3:2) (横屏)"},
                ),
                "自定义宽度": ("INT", {"default": 1344, "min": 64, "max": 8192, "step": 8}),
                "自定义高度": ("INT", {"default": 896, "min": 64, "max": 8192, "step": 8}),
            }
        }

    def get_resolution(self, **kwargs):
        use_custom = kwargs.get("使用自定义分辨率", kwargs.get("use_custom_resolution", False))
        resolution = kwargs.get("分辨率", kwargs.get("resolution", ""))
        custom_width = kwargs.get("自定义宽度", kwargs.get("custom_width", 1024))
        custom_height = kwargs.get("自定义高度", kwargs.get("custom_height", 1024))
        if use_custom:
            w = max(64, min(8192, int(custom_width)))
            h = max(64, min(8192, int(custom_height)))
            return (w, h)
        w, h = self.RESOLUTIONS.get(resolution, (1024, 1024))
        return (int(w), int(h))


NODE_CLASS_MAPPINGS = {
    "AnimaResolutionSelector": AnimaResolutionSelector,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaResolutionSelector": "Anima 分辨率选择器",
}
