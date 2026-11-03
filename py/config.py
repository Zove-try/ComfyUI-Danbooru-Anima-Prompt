"""
设置管理 - Danbooru / Gelbooru 连接配置
"""
import json
import os

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(PLUGIN_DIR, "settings.json")

# 常用 OpenAI 兼容模型预设
MODEL_PRESETS = {
    # 新模型
    "deepseek-v4-flash": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash"},
    "deepseek-v4-pro": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-pro"},
    "deepseek-v4-flash-vision-exp": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash-vision-exp"},
    # 旧模型（兼容历史设置）
    "deepseek-flash": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash"},
    "deepseek-pro": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-pro"},
    "deepseek-vision": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash-vision-exp"},
    "deepseek-v4-flash": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-flash"},
    "deepseek-v4-pro": {"base_url": "https://api.deepseek.com/v1", "model": "deepseek-v4-pro"},
    "custom": {"base_url": "", "model": ""},
}

DEFAULT_SETTINGS = {
    # Danbooru
    "danbooru_username": "",
    "danbooru_api_key": "",
    # Gelbooru (注册后在 My Account 页面获取)
    "gelbooru_api_key": "",
    "gelbooru_user_id": "",
    # 通用
    "page_size": 20,
    "blacklist_tags": "",
    "original_resolution": False,
    "translation_provider": "google",
    "translation_api_key": "",
    "translation_model": "",
    "translation_base_url": "",
    "translation_baidu_appid": "",
}

def load_settings():
    """从本地文件加载所有设置"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for key, value in DEFAULT_SETTINGS.items():
                    data.setdefault(key, value)
                return data
    except Exception as e:
        print(f"[DanbooruAnima] 加载设置失败: {e}")
    return dict(DEFAULT_SETTINGS)

def save_settings(settings):
    """保存所有设置到本地文件"""
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[DanbooruAnima] 保存设置失败: {e}")
        return False
