"""
AnimaRandomPrompt — 随机提示词生成器节点
锁定：复用 last_roll_json；未锁定且无缓存时由引擎抽一次。
试抽 / 分维重抽走同一套 compose 引擎。
"""
from .random_compose import (
    compose_roll, parse_roll, assemble_prompt, apply_roll_flags,
)

_LAST_SEED = {}


class AnimaRandomPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "characters_json": ("STRING", {"multiline": True, "default": "[]"}),
            "lock_mode": ("BOOLEAN", {"default": False, "label_on": "锁定", "label_off": "随机"}),
            "nsfw_mode": ("INT", {"default": 0, "min": 0, "max": 2}),
            "context_random": ("BOOLEAN", {"default": True, "label_on": "G站上下文", "label_off": "全随机"}),
            "roll_attire": ("BOOLEAN", {"default": True, "label_on": "服装", "label_off": "关"}),
            "roll_posture": ("BOOLEAN", {"default": True, "label_on": "姿势", "label_off": "关"}),
            "roll_expression": ("BOOLEAN", {"default": True, "label_on": "表情", "label_off": "关"}),
            "roll_background": ("BOOLEAN", {"default": False, "label_on": "背景", "label_off": "关"}),
            "roll_accessories": ("BOOLEAN", {"default": False, "label_on": "配饰", "label_off": "关"}),
            "roll_lighting": ("BOOLEAN", {"default": False, "label_on": "光影", "label_off": "关"}),
            "roll_visual": ("BOOLEAN", {"default": False, "label_on": "视觉", "label_off": "关"}),
            "attire_n": ("INT", {"default": 1, "min": 1, "max": 8}),
            "posture_n": ("INT", {"default": 1, "min": 1, "max": 8}),
            "expression_n": ("INT", {"default": 1, "min": 1, "max": 5}),
            "background_n": ("INT", {"default": 1, "min": 1, "max": 5}),
            "accessories_n": ("INT", {"default": 1, "min": 1, "max": 4}),
            "lighting_n": ("INT", {"default": 1, "min": 1, "max": 3}),
            "visual_n": ("INT", {"default": 1, "min": 1, "max": 3}),
            "count_tags": ("STRING", {"default": "1girl"}),
            "artist_tags": ("STRING", {"default": ""}),
            "custom_tags": ("STRING", {"multiline": True, "default": ""}),
            "model_mode": ("INT", {"default": 0, "min": 0, "max": 2, "tooltip": "0=Anima, 1=Noob, 2=Aesthetic"}),
            "outfit_mode": ("INT", {"default": 0, "min": 0, "max": 2, "tooltip": "0=自动 1=保留原装 2=换装"}),
            "identity_lock": ("BOOLEAN", {"default": True, "label_on": "身份锁定", "label_off": "不锁定"}),
            "last_roll_json": ("STRING", {"multiline": True, "default": ""}),
        }}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "run"
    CATEGORY = "Danbooru Anima"

    @classmethod
    def IS_CHANGED(cls, lock_mode=False, last_roll_json="", **kwargs):
        if lock_mode:
            return str(last_roll_json or "") or "locked-empty"
        return float("NaN")

    @staticmethod
    def _safe_int(val, default=1):
        try:
            return int(val)
        except Exception:
            return default

    def run(self, characters_json="[]", lock_mode=False, nsfw_mode=0, context_random=True,
            roll_attire=True, roll_posture=True, roll_expression=True,
            roll_background=False, roll_accessories=False,
            roll_lighting=False, roll_visual=False,
            attire_n=1, posture_n=1, expression_n=1,
            background_n=1, accessories_n=1, lighting_n=1, visual_n=1,
            count_tags="1girl", artist_tags="", custom_tags="", model_mode=0,
            outfit_mode=0, identity_lock=True, last_roll_json=""):

        nsfw_mode = max(0, min(2, self._safe_int(nsfw_mode, 0)))
        outfit_mode = max(0, min(2, self._safe_int(outfit_mode, 0)))
        model_mode = max(0, min(2, self._safe_int(model_mode, 0)))
        attire_n = self._safe_int(attire_n, 1)
        posture_n = self._safe_int(posture_n, 1)
        expression_n = self._safe_int(expression_n, 1)
        background_n = self._safe_int(background_n, 1)
        accessories_n = self._safe_int(accessories_n, 1)
        lighting_n = self._safe_int(lighting_n, 1)
        visual_n = self._safe_int(visual_n, 1)
        identity_lock = bool(identity_lock if identity_lock is not None else True)

        roll = parse_roll(last_roll_json)
        if roll is None:
            roll = compose_roll(
                characters_json=characters_json,
                nsfw_mode=nsfw_mode,
                context_random=context_random,
                roll_attire=roll_attire, roll_posture=roll_posture, roll_expression=roll_expression,
                roll_background=roll_background, roll_accessories=roll_accessories,
                roll_lighting=roll_lighting, roll_visual=roll_visual,
                attire_n=attire_n, posture_n=posture_n, expression_n=expression_n,
                background_n=background_n, accessories_n=accessories_n,
                lighting_n=lighting_n, visual_n=visual_n,
                count_tags=count_tags, custom_tags=custom_tags,
                outfit_mode=outfit_mode, identity_lock=identity_lock,
            )
        else:
            roll = apply_roll_flags(
                roll,
                roll_attire=roll_attire, roll_posture=roll_posture, roll_expression=roll_expression,
                roll_background=roll_background, roll_accessories=roll_accessories,
                roll_lighting=roll_lighting, roll_visual=roll_visual, nsfw_mode=nsfw_mode,
            )
        prompt = assemble_prompt(
            roll,
            characters_json=characters_json,
            artist_tags=artist_tags,
            custom_tags=custom_tags,
            model_mode=model_mode,
            outfit_mode=outfit_mode,
            identity_lock=identity_lock,
        )
        _LAST_SEED[AnimaRandomPrompt] = (roll or {}).get("pool_key") or 1
        return (prompt,)


NODE_CLASS_MAPPINGS = {"AnimaRandomPrompt": AnimaRandomPrompt}
NODE_DISPLAY_NAME_MAPPINGS = {"AnimaRandomPrompt": "🎲 随机提示词 (Random Prompt)"}
