"""ComfyUI UI language for this plugin: zh-CN or en-US only.

Chinese only when Comfy.Locale starts with zh. Every other locale
(including empty / unknown) is English.
"""
import json
import os


def normalize_ui_lang(lang):
    s = (lang or "").strip().replace("_", "-")
    if s.lower().startswith("zh"):
        return "zh-CN"
    return "en-US"


def detect_ui_lang(cache_path=None):
    """JS cache first, then Comfy.Locale in comfy.settings.json. Never use OS locale."""
    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            lang = cached.get("language") or ""
            if lang:
                return normalize_ui_lang(lang)
        except Exception:
            pass
    try:
        from folder_paths import get_user_directory
        user = get_user_directory()
    except Exception:
        user = ""
    if user:
        for rel in (
            os.path.join("default", "comfy.settings.json"),
            "comfy.settings.json",
            "comfyui.settings.json",
        ):
            path = os.path.join(user, rel)
            if not os.path.isfile(path):
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                lang = settings.get("Comfy.Locale") or settings.get("language") or ""
                if lang:
                    return normalize_ui_lang(lang)
            except Exception:
                continue
    return "en-US"
