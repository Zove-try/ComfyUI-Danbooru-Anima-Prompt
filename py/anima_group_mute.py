"""Anima group mute manager.

Same canvas helper as the ignore manager, but the off state is ComfyUI mute
(mode NEVER) instead of bypass. Boolean links are forwarded by emit_group_bools.
"""

from .anima_group_ignore import emit_group_bools


class AnimaGroupMuteManager:
    CATEGORY = "Danbooru Anima"
    FUNCTION = "noop"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "可视化开关画布分组的禁用（mute）状态，并可以用布尔值联动。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def noop(self, unique_id=None, **kwargs):
        emit_group_bools(unique_id, kwargs)
        return ()


NODE_CLASS_MAPPINGS = {
    "AnimaGroupMuteManager": AnimaGroupMuteManager,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaGroupMuteManager": "组禁用管理",
}
