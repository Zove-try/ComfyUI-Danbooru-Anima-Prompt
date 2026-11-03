"""Anima group ignore manager.

Canvas-only helper: toggle groups between ALWAYS and BYPASS (ignore),
plus color/custom lists and on-enable / on-disable linkage.
No Danbooru Gallery / Swwan / rgthree imports.
"""


def _as_bool(value):
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def emit_group_bools(unique_id, kwargs):
    """Forward linked BOOLEAN inputs to the canvas. Values apply on the next queue."""
    vals = {}
    for key, value in (kwargs or {}).items():
        if isinstance(key, str) and key.startswith("bool_"):
            vals[key] = _as_bool(value)
    if not vals or unique_id is None:
        return
    try:
        from server import PromptServer
        PromptServer.instance.send_sync("anima-group-bool", {
            "node_id": str(unique_id),
            "values": vals,
        })
    except Exception:
        pass


class AnimaGroupIgnoreManager:
    CATEGORY = "Danbooru Anima"
    FUNCTION = "noop"
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    OUTPUT_NODE = True
    DESCRIPTION = "可视化开关画布分组的忽略（bypass）状态，可以用布尔值或组与组的联动来控制。"

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
    "AnimaGroupIgnoreManager": AnimaGroupIgnoreManager,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaGroupIgnoreManager": "组忽略管理",
}
