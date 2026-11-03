"""
gelbooru_browser.py - Gelbooru Browser ComfyUI 节点
====================================================
对标 DanbooruBrowser，提供 Gelbooru 图站搜索浏览能力。
API 需要 api_key + user_id 认证（在 config.py 的设置中填写）。
"""
import json
import os
import time
import asyncio
import base64
import hashlib
import threading

import requests
from requests.adapters import HTTPAdapter
from io import BytesIO

import torch
import numpy as np
from PIL import Image
from server import PromptServer
from aiohttp import web

from .gelbooru_api import (
    search_posts, get_post, get_tags_batch,
    set_credentials, _request as gel_request,
)
from .tag_utils import classify_tags

# G站通用标签子分类器（仅基于关键词/后缀，不依赖D站标签组）
# 规则基于 gelbooru_tags.csv 中 23.4万 标签命名习惯扩展

_GEL_SUFFIX_RULES = [
    # body_features — 身体特征（毛发/五官/体型）
    (["_hair", "_haired", "twintails", "ponytail", "ahoge", "bangs", "braid", "drill_hair",
      "bob_cut", "pixie_cut", "hime_cut", "messy_hair", "wavy_hair", "curly_hair", "straight_hair",
      "spiked_hair", "floating_hair", "streaked_hair", "gradient_hair", "multicolored_hair", "two-tone_hair",
      "_eyes", "_eyebrow", "_eyelash", "heterochromia",
      "_ear", "_ears", "_nose", "_lip", "_lips", "_tongue", "_fang", "_fangs", "sharp_teeth",
      "_breast", "_breasts", "_nipple", "_nipples", "_chest",
      "_hand", "_hands", "_finger", "_fingers", "_arm", "_arms",
      "_foot", "_feet", "_leg", "_legs", "_thigh", "_thighs", "thick_thighs",
      "_skin", "dark_skin", "pale_skin", "shiny_skin", "wet_skin",
      "_tail", "_wing", "_wings", "_horn", "_horns", "_claw", "_claws",
      "_cheek", "_chin", "_neck", "_waist", "_hip", "_hips",
      "_belly", "bellybutton", "_navel", "_abs", "muscular", "_muscle", "_muscles",
      "_fur", "_scales", "_fin", "_tentacle", "_tentacles", "_feather", "_feathers",
      "mole", "freckles", "scar", "scar_on_face", "facial_hair", "beard", "mustache",
      "heterochromia", "monster_girl", "elf", "demon", "angel", "furry", "kemonomimi",
      "halo", "detached_sleeves", "collarbone", "cleft_of_venus", "gluteal_fold",
      "wide_hips", "big_hips", "thick_thighs", "huge_breasts", "large_breasts", "small_breasts", "flat_chest"], "body_features"),

    # clothing — 服装/鞋袜/饰品
    (["_shirt", "_skirt", "_dress", "_boots", "_sleeves", "_necktie", "_collar",
      "_uniform", "serafuku", "school_uniform", "maid", "military_uniform",
      "_socks", "_stockings", "_pants", "_shorts", "_gloves", "fingerless_gloves",
      "_ribbon", "hair_ribbon", "neck_ribbon", "_jacket", "_coat", "_cape", "_hat", "_scarf", "_belt",
      "_bow", "bowtie", "hair_bow", "_apron", "_shoe", "_shoes", "_sandals", "_loafers", "_heels",
      "_thighhighs", "_pantyhose", "_choker", "_bracelet", "_ring", "earrings",
      "_trim", "_lace", "_frill", "frills", "frilled",
      "_leotard", "bodysuit", "crop_top", "tank_top", "hoodie", "sweater", "cardigan", "blouse",
      "swimsuit", "bikini", "one-piece_swimsuit", "school_swimsuit",
      "_panties", "_underwear", "bra", "no_bra", "no_panties",
      "kimono", "yukata", "chinese_clothes", "japanese_clothes",
      "suit", "tuxedo", "vest", "suspenders", "garter", "garter_belt",
      "armor", "helmet", "crown", "tiara", "veil",
      "mask", "eyepatch", "bandaid", "bandages",
      "tattoo", "piercing", "nail_polish", "makeup", "lipstick",
      "see-through_clothes", "sheer_clothes", "wet_clothes", "torn_clothes",
      "denim", "jeans", "plaid", "striped", "floral_print",
      "halterneck", "strapless", "off_shoulder", "bare_shoulders",
      "elbow_gloves", "wrist_cuffs", "leg_warmers", "kneehighs",
      "barefoot", "no_shoes", "bare_legs", "zettai_ryouiki",
      "ascot", "cravat", "neckerchief", "bandana",
      "hood", "hood_down", "hood_up", "capelet",
      "beret", "witch_hat", "cowboy_hat", "sombrero",
      "sunglasses", "goggles", "glasses", "monocle",
      "bag", "backpack", "purse", "suitcase",
      "headphones", "headset", "cellphone", "phone",
      "stuffed_toy", "stuffed_animal", "plushie",
      "weapon", "sword", "gun", "firearm", "shield", "spear", "dagger", "bow_(weapon)",
      "umbrella", "parasol", "cane", "crutch",
      "ribbon-trimmed", "lace-trimmed", "frilled_sleeves", "frilled_skirt", "frilled_dress",
      "fishnets", "mesh", "netting", "chain", "handcuffs", "shackles", "rope", "bound", "tied",
      "crop_top_overhang", "bra_strap", "panty_strap", "thigh_strap", "garter_straps"], "clothing"),

    # pose — 姿势/动作
    (["_pose", "sitting", "standing", "lying", "kneeling", "crouching", "squatting", "straddling",
      "spread_legs", "leg_up", "arms_up", "arm_up", "hand_up", "hands_up",
      "arms_behind_back", "arms_above_head", "hands_above_head", "hands_on_hips", "hand_on_hip",
      "crossed_arms", "crossed_legs", "one_leg_up", "leg_lift",
      "pointing", "waving", "gesture", "salute", "thumbs_up", "peace_sign", "v_sign",
      "from_side", "from_behind", "from_above", "from_below", "from_front",
      "full_body", "upper_body", "lower_body", "cowboy_shot", "headshot", "portrait",
      "looking_back", "looking_down", "looking_up", "looking_to_the_side", "looking_afar",
      "looking_at_viewer", "looking_at_another", "facing_viewer",
      "on_back", "on_stomach", "on_side", "on_bed", "on_chair", "on_floor",
      "bent_over", "leaning_forward", "leaning_back", "head_tilt",
      "all_fours", "on_hands_and_knees", "upside-down", "inverted",
      "stretching", "reaching", "grabbing", "holding", "carrying", "lifting",
      "wariza", "seiza", "indian_style", "fetal_position",
      "jumping", "running", "walking", "flying", "floating", "falling", "diving",
      "fighting", "punching", "kicking", "blocking", "defending",
      "hug", "embrace", "cuddling", "snuggling", "holding_hands",
      "kiss", "kissing", "licking", "biting", "nibbling",
      "dancing", "singing", "eating", "drinking", "reading", "writing", "drawing",
      "sleeping", "waking", "yawning", "stretching",
      "turning", "twisting", "bending", "arching",
      "spread_arms", "outstretched_arms", "arms_out",
      "hand_on_chest", "hand_on_face", "hand_on_head", "hand_behind_head",
      "leg_cross", "ankle_cross", "feet_together",
      "pov", "pov_hands", "selfie", "mirror_selfie",
      "dutch_angle", "dynamic_pose", "action_pose", "relaxed_pose"], "pose"),

    # expression — 表情/情绪
    (["smile", "smirk", "grin", "frown", "pout", "blush", "blushing",
      "angry", "anger", "mad", "furious", "annoyed", "irritated",
      "sad", "crying", "tears", "tear", "sob", "sobbing", "weeping",
      "happy", "joy", "laughing", "giggling", "excited", "cheerful", "delighted",
      "teeth", "bared_teeth", "clenched_teeth", "tongue_out", "tongue",
      "open_mouth", "closed_mouth", "parted_lips", "licking_lips",
      "expressionless", "blank_expression", "stoic", "serious", "stern",
      "surprised", "shocked", "stunned", "amazed", "astonished",
      "embarrassed", "shy", "bashful", "timid", "nervous",
      "disgust", "disgusted", "grossed_out", "nauseated",
      "confused", "puzzled", "perplexed", "bewildered",
      "scared", "afraid", "frightened", "terrified", "horrified",
      "sleepy", "tired", "drowsy", "exhausted", "dazed",
      "drunk", "intoxicated", "drunkard",
      "pain", "hurt", "suffering", "agony",
      "love-struck", "heart_eyes", "sparkling_eyes",
      "pleading", "begging", "puppy_eyes",
      "mischievous", "sly", "sneaky", "evil_grin",
      "pensive", "thoughtful", "contemplative",
      "blush_stickers", "nose_blush", "embarrassed_blush",
      "light_smile", "seductive_smile", "forced_smile", "fake_smile",
      "wink", "winking", "one_eye_closed"], "expression"),

    # background — 背景/环境
    (["_background", "simple_background", "white_background", "black_background", "grey_background",
      "gradient_background", "transparent_background", "blurry_background", "pattern_background",
      "outdoors", "indoors", "outdoor", "indoor",
      "night", "day", "dawn", "dusk", "sunset", "sunrise", "twilight",
      "cityscape", "city", "urban", "street", "alley", "road", "highway",
      "nature", "forest", "woods", "jungle", "garden", "park", "meadow", "field",
      "beach", "ocean", "sea", "lake", "river", "stream", "pond", "waterfall", "shore",
      "mountain", "hill", "cliff", "canyon", "desert", "tundra", "snowscape",
      "sky", "cloud", "cloudy_sky", "blue_sky", "starry_sky", "night_sky",
      "room", "bedroom", "bathroom", "classroom", "office", "kitchen", "living_room",
      "school", "library", "hospital", "church", "temple", "castle",
      "underwater", "under_water", "space", "void", "dimension",
      "ruins", "abandoned", "destroyed", "post-apocalyptic",
      "spring", "summer", "autumn", "fall", "winter", "snow", "rain", "fog", "mist",
      "plant", "tree", "flower", "grass", "bush", "vine", "leaf", "petal",
      "fire", "flame", "smoke", "steam", "explosion", "sparkle", "glow", "light_particles",
      "moon", "sun", "star", "planet", "galaxy", "nebula",
      "bokeh", "depth_of_field", "motion_lines", "speed_lines",
      "chair", "table", "bed", "desk", "sofa", "couch", "window", "door", "mirror",
      "book", "bookshelf", "curtain", "carpet", "rug", "pillow", "blanket",
      "food", "drink", "cup", "plate", "bowl", "bottle", "glass"], "background"),

    # accessories — 配饰/装饰品
    (["_ornament", "hair_ornament", "hair_accessory", "hairclip", "hairpin", "barrette", "scrunchie",
      "_band", "hairband", "headband", "headgear", "headpiece",
      "_glass", "_glasses", "_headphone", "_headset", "earbuds",
      "_ribbon", "hair_ribbon", "hair_bow", "ribbon_hair_ornament",
      "_pin", "_brooch", "badge", "medal", "emblem",
      "sunglasses", "goggles", "monocle", "eyepatch", "blindfold",
      "necklace", "pendant", "locket", "charm", "amulet",
      "bracelet", "wristband", "watch", "bangle", "cuff",
      "ring", "earring", "earrings", "ear_piercing", "nose_ring", "lip_ring",
      "anklet", "toe_ring", "belly_ring", "navel_piercing",
      "bell", "jingle_bell", "cat_bell", "collar_bell",
      "chain", "chains", "handcuffs", "shackles", "collar_(bdsm)",
      "bandaid", "band-aid", "bandage", "bandaged",
      "flower", "rose", "lily", "daisy", "sunflower", "cherry_blossom", "sakura",
      "butterfly", "wing_accessory", "feather_accessory",
      "cane", "walking_stick", "staff", "scepter",
      "bag", "backpack", "satchel", "purse", "wallet", "pouch",
      "umbrella", "parasol",
      "stuffed_toy", "stuffed_animal", "plushie", "doll",
      "cigarette", "cigar", "pipe", "lollipop", "candy", "pocky",
      "instrument", "guitar", "violin", "piano", "flute", "trumpet", "drum",
      "microphone", "headset_mic",
      "pet", "cat", "dog", "bird", "rabbit", "hamster",
      "flag", "banner", "sign", "poster"], "accessories"),

    # other — 构图/光影/风格/颜色
    (["monochrome", "greyscale", "sepia", "duotone",
      "sketch", "lineart", "line_art", "watercolor_(medium)", "oil_painting",
      "digital_media", "traditional_media", "photo", "3d", "cg",
      "anime", "manga", "cartoon", "chibi", "realistic", "semi-realistic",
      "highres", "absurdres", "lowres", "wide_image", "tall_image",
      "border", "framed", "white_border", "black_border", "rounded_corners",
      "vignette", "letterbox", "split_screen", "multiple_views", "variations",
      "censored", "mosaic_censoring", "bar_censor", "uncensored", "no_censor",
      "signature", "watermark", "dated", "stamp", "logo",
      "text", "speech_bubble", "thought_bubble", "dialogue", "caption",
      "translated", "english_text", "japanese_text", "chinese_text",
      "comic", "4koma", "doujin", "fanart", "official_art", "redraw",
      "parody", "crossover", "reference", "tribute", "homage",
      "close-up", "detail", "macro", "zoom", "wide_shot", "long_shot",
      "panorama", "fisheye", "tilt-shift",
      "bloom", "glow", "glare", "lens_flare", "shaft_of_light", "god_rays",
      "dark", "dim", "bright", "backlit", "silhouette", "shadow",
      "sunlight", "moonlight", "candlelight", "neon_light", "colored_lighting",
      "warm_colors", "cool_colors", "pastel_colors", "vibrant_colors", "muted_colors",
      "blue_theme", "red_theme", "pink_theme", "purple_theme", "green_theme", "gold_theme",
      "pattern", "plaid", "striped", "polka_dot", "checkered", "argyle", "houndstooth",
      "abstract", "surreal", "minimalist", "detailed", "highly_detailed",
      "erotic", "ecchi", "suggestive", "lewd", "hentai", "porn",
      "no_humans", "solo", "duo", "trio", "group", "crowd",
      "character_name", "artist_name", "series_name",
      "commentary", "commentary_request", "english_commentary", "chinese_commentary",
      "tagme", "bad_id", "translation_request", "character_request", "artist_request"], "other"),
]

def classify_general_gelbooru(tags):
    """将 G站 general 标签按关键词/后缀分成 7 个子类（仅基于命名规则，不依赖外部数据）"""
    sub = {
        "body_features": [], "clothing": [], "pose": [],
        "expression": [], "background": [], "accessories": [], "other": []
    }
    uncategorized = []
    for t in tags:
        tl = t.lower()
        matched = False
        for keywords, cat in _GEL_SUFFIX_RULES:
            for kw in keywords:
                kwl = kw.lower()
                if tl == kwl or tl.endswith(kwl) or tl.startswith(kwl) or kwl in tl:
                    sub[cat].append(t)
                    matched = True
                    break
            if matched:
                break
        if not matched:
            # fallback: check ending patterns more aggressively
            if any(tl.endswith(s) for s in ['_hair','_eyes','_ears','_nose','_mouth','_breasts','_nipple','_hips','_legs','_arms','_tail','_horn']):
                sub["body_features"].append(t)
            elif any(tl.endswith(s) for s in ['_shirt','_dress','_skirt','_shorts','_pants','_gloves','_shoes','_boots','_socks','_hat','_jacket','_coat','_belt','_scarf']):
                sub["clothing"].append(t)
            elif any(kw in tl for kw in ['sitting','standing','lying','pose','hands_on','arms_crossed','looking_at']):
                sub["pose"].append(t)
            elif any(kw in tl for kw in ['smile','blush','angry','crying','tears','expression']):
                sub["expression"].append(t)
            elif any(kw in tl for kw in ['background','sky','night','day','outdoor','indoor']):
                sub["background"].append(t)
            elif any(kw in tl for kw in ['ribbon','ornament','necklace','earring','glasses','headphones','hat','crown']):
                sub["accessories"].append(t)
            elif any(kw in tl for kw in ['light','shadow','color','resolution','media','style','filter']):
                sub["other"].append(t)
            else:
                uncategorized.append(t)
    return sub, uncategorized

def add_set(d, k, vals):
    """向 dict 的 list 值追加元素，保留插入顺序并去重"""
    if k not in d:
        d[k] = []
    for v in vals:
        if v not in d[k]:
            d[k].append(v)
from .config import load_settings, save_settings
from .cloud_translate import (
    cloud_translate, load_user_translations,
    save_user_translation, clear_cloud_cache,
)

# ── 图片代理信号量：缩略图 16 路，原图 12 路 ──
_image_proxy_semaphore = None
_thumb_proxy_semaphore = None
_PROXY_SESSION = None

def _is_gel_thumb_url(url):
    u = str(url or "").lower()
    return "/thumbnails/" in u or "thumbnail_" in u

def _get_image_proxy_semaphore():
    global _image_proxy_semaphore
    if _image_proxy_semaphore is None:
        _image_proxy_semaphore = asyncio.Semaphore(12)
    return _image_proxy_semaphore

def _get_thumb_proxy_semaphore():
    global _thumb_proxy_semaphore
    if _thumb_proxy_semaphore is None:
        _thumb_proxy_semaphore = asyncio.Semaphore(16)
    return _thumb_proxy_semaphore

def _get_proxy_session():
    global _PROXY_SESSION
    if _PROXY_SESSION is None:
        import requests as _req
        _PROXY_SESSION = _req.Session()
        _PROXY_SESSION.headers.update({
            "User-Agent": "Gelbooru-Gallery/1.0",
            "Referer": "https://gelbooru.com/",
        })
    return _PROXY_SESSION

def _gel_read_cache(path):
    with open(path, "rb") as f:
        return f.read()

def _gel_write_cache(path, data):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


# ── 中文→英文 tag 索引（模块级缓存） ────────────────
_CN_INDEX = {}
_EN_TO_CN = {}
_CN_INDEX_LOADED = False
_CHAR_INDEX = {}

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY_DIR = os.path.dirname(os.path.abspath(__file__))

# ── 语言存储 ─────────────────────────────────────────
from .ui_lang import detect_ui_lang, normalize_ui_lang
_LANG_STORE_PATH = os.path.join(PLUGIN_DIR, ".gelbooru_lang.json")
_COMFY_LANG = detect_ui_lang(_LANG_STORE_PATH)

def _tl(key: str) -> str:
    """Unused for ports. Kept so old callers do not crash."""
    return key

_PORT_ALL = "全部标签"
_PORT_QM = "质量/元标签"
_PORT_CNT = "数量标签"
_PORT_CHR = "角色标签"
_PORT_SRS = "系列标签"
_PORT_ART = "画师标签"
_PORT_GEN = "常规标签"
_PORT_UNCLASSIFIED = "未分类标签"


# ── 收藏夹（独立于 D 站）──────────────────────────
GEL_FAVORITES_FILE = os.path.join(PLUGIN_DIR, "gelbooru_favorites.json")

DEFAULT_FAVORITES = {
    "artists": {}, "characters": {}, "series": {}, "general": {}, "images": {},
}

def _load_gel_favs():
    try:
        if os.path.exists(GEL_FAVORITES_FILE):
            with open(GEL_FAVORITES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for key in DEFAULT_FAVORITES:
                data.setdefault(key, {})
            return data
    except Exception:
        pass
    return dict(DEFAULT_FAVORITES)

def _save_gel_favs(data):
    try:
        with open(GEL_FAVORITES_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def _gel_split_fav_tags(raw):
    if isinstance(raw, dict):
        s = raw.get("tags") or ""
    else:
        s = (raw or "").strip()
        if s[:1] == "{":
            try:
                p = json.loads(s)
                if isinstance(p, dict):
                    s = p.get("tags") or ""
            except Exception:
                pass
    s = (s or "").strip()
    if not s:
        return []
    if "," in s:
        return [t.strip().replace(" ", "_") for t in s.split(",") if t.strip()]
    return [t.strip() for t in s.split() if t.strip()]


def _gel_fav_cn_lookup(tag):
    t = (tag or "").strip()
    if not t:
        return ""
    return (
        _EN_TO_CN.get(t)
        or _EN_TO_CN.get(t.lower())
        or _EN_TO_CN.get(t.lower().replace(" ", "_"))
        or ""
    )


def _gel_image_needs_classified(item):
    if not isinstance(item, dict):
        return False
    return not isinstance(item.get("series"), list)


def _gel_image_fav_need_list(images):
    need = []
    unique_tags = set()
    total = 0
    if not isinstance(images, dict):
        return need, unique_tags, total
    for key, item in list(images.items()):
        if key == "_order" or not isinstance(item, dict):
            continue
        total += 1
        if not _gel_image_needs_classified(item):
            continue
        tags = _gel_split_fav_tags(item.get("cn") or "")
        unique_tags.update(tags)
        need.append((key, item, tags))
    return need, unique_tags, total


def _gel_classify_image_item(item):
    from . import tag_db
    if not isinstance(item, dict):
        return item
    tags = _gel_split_fav_tags(item.get("cn") or "")
    source, db = _gel_load_tag_db()
    if not db:
        item.setdefault("series", [])
        item.setdefault("character", [])
        item.setdefault("artist", [])
        return item
    _ensure_cn_index()
    cat_map = tag_db.batch_lookup(list(tags), source=source)
    groups = classify_tags(tags, cat_map)
    item["series"] = groups.get("series") or []
    item["character"] = groups.get("character") or []
    item["artist"] = groups.get("artist") or []
    trans = dict(item.get("translations") or {}) if isinstance(item.get("translations"), dict) else {}
    for t in list(item["series"]) + list(item["character"]) + list(item["artist"]):
        cn = _gel_fav_cn_lookup(t)
        if cn:
            trans[t] = cn
    if trans:
        item["translations"] = trans
    return item


def gel_favorites_backfill_status():
    favs = _load_gel_favs()
    need, _, total = _gel_image_fav_need_list(favs.get("images"))
    return {"success": True, "need": len(need), "total": total}


def _gel_load_tag_db():
    from . import tag_db
    db = tag_db.load_db("gelbooru")
    if db:
        return "gelbooru", db
    db = tag_db.load_db("danbooru")
    if db:
        return "danbooru", db
    return None, None


def backfill_gel_favorites_classified(limit=0):
    """Local classify of old Gelbooru image favorites. Writes top-level series/character."""
    from . import tag_db
    favs = _load_gel_favs()
    images = favs.get("images")
    if not isinstance(images, dict):
        return {"success": True, "updated": 0, "remaining": 0, "pending": 0}
    need, unique_tags, _total = _gel_image_fav_need_list(images)
    pending = len(need)
    source, db = _gel_load_tag_db()
    if not db:
        return {"success": True, "updated": 0, "remaining": pending, "pending": pending, "reason": "tag_db_unavailable"}
    if not need:
        return {"success": True, "updated": 0, "remaining": 0, "pending": 0}
    try:
        limit = int(limit or 0)
    except Exception:
        limit = 0
    if limit > 0:
        need = need[:limit]
        unique_tags = set()
        for _k, _i, tags in need:
            unique_tags.update(tags)
    _ensure_cn_index()
    cat_map = tag_db.batch_lookup(list(unique_tags), source=source)
    updated = 0
    for key, item, tags in need:
        groups = classify_tags(tags, cat_map)
        series = groups.get("series") or []
        character = groups.get("character") or []
        artist = groups.get("artist") or []
        trans = {}
        for t in list(series) + list(character) + list(artist):
            cn = _gel_fav_cn_lookup(t)
            if cn:
                trans[t] = cn
        item["series"] = series
        item["character"] = character
        item["artist"] = artist
        if trans:
            existing_t = item.get("translations")
            if isinstance(existing_t, dict):
                merged = dict(existing_t)
                merged.update(trans)
                item["translations"] = merged
            else:
                item["translations"] = trans
        updated += 1
    if updated:
        _save_gel_favs(favs)
    remaining_need, _, _ = _gel_image_fav_need_list(favs.get("images"))
    return {"success": True, "updated": updated, "remaining": len(remaining_need), "pending": pending}


# ── 中文索引 ─────────────────────────────────────────

_BUILTIN_CN_MAP = {
    "初音未来": ["hatsune_miku"],
    "博丽灵梦": ["hakurei_reimu"],
    "雾雨魔理沙": ["kirisame_marisa"],
    "十六夜咲夜": ["izayoi_sakuya"],
    "蕾米莉亚": ["remilia_scarlet"],
    "芙兰朵露": ["flandre_scarlet"],
    "射命丸文": ["shameimaru_aya"],
    "东风谷早苗": ["kochiya_sanae"],
    "古明地恋": ["komeiji_koishi"],
    "古明地觉": ["komeiji_satori"],
    "秦心": ["hata_no_kokoro"],
    "魂魄妖梦": ["konpaku_youmu"],
    "西行寺幽幽子": ["saigyouji_yuyuko"],
    "八云紫": ["yakumo_yukari"],
    "八云蓝": ["yakumo_ran"],
    "橙": ["chen"],
    "铃仙": ["reisen_udongein_inaba"],
    "因幡帝": ["inaba_tewi"],
    "蓬莱山辉夜": ["houraisan_kaguya"],
    "藤原妹红": ["fujiwara_no_mokou"],
    "爱丽丝": ["alice_margatroid"],
    "帕秋莉": ["patchouli_knowledge"],
    "红美玲": ["hong_meiling"],
    "小恶魔": ["koakuma"],
    "琪露诺": ["cirno"],
    "大妖精": ["daiyousei"],
    "露米娅": ["rumia"],
    "莉格露": ["wriggle_nightbug"],
    "米斯蒂娅": ["mystia_lorelei"],
    "上白泽慧音": ["kamishirasawa_keine"],
    "姬海棠羽立": ["himekaidou_hatate"],
    "犬走椛": ["inubashiri_momiji"],
    "河城荷取": ["kawashiro_nitori"],
    "键山雏": ["kagiyama_hina"],
    "秋穰子": ["aki_minoriko"],
    "秋静叶": ["aki_shizuha"],
    "水桥帕露西": ["mizuhashi_parsee"],
    "星熊勇仪": ["hoshiguma_yuugi"],
    "黑谷山女": ["kurodani_yamame"],
    "火焰猫燐": ["kaenbyou_rin"],
    "灵乌路空": ["reiuji_utsuho"],
    "娜兹玲": ["nazrin"],
    "多多良小伞": ["tatara_kogasa"],
    "村纱水蜜": ["murasa_minamitsu"],
    "寅丸星": ["toramaru_shou"],
    "圣白莲": ["hijiri_byakuren"],
    "封兽鵺": ["houjuu_nue"],
    "物部布都": ["mononobe_no_futo"],
    "苏我屠自古": ["soga_no_tojiko"],
    "丰聪耳神子": ["toyosatomimi_no_miko"],
    "霍青娥": ["kaku_seiga"],
    "宫古芳香": ["miyako_yoshika"],
    "二岩猯藏": ["futatsuiwa_mamizou"],
}

def _ensure_cn_index(force_reload=False):
    global _CN_INDEX, _CN_INDEX_LOADED, _CHAR_INDEX, _EN_TO_CN
    if _CN_INDEX_LOADED and not force_reload:
        return

    # 内置映射
    for cn_name, en_tags in _BUILTIN_CN_MAP.items():
        for tag in en_tags:
            _CN_INDEX.setdefault(cn_name, []).append(tag)
            _EN_TO_CN[tag] = cn_name
            for ch in cn_name:
                _CHAR_INDEX.setdefault(ch, set()).add(cn_name)

    # 尝试加载现有的中文索引文件 (D站 + 本地)
    for fn in ["all_tags_cn.json", "translations.json"]:
        fp = os.path.join(PY_DIR, fn)
        if os.path.isfile(fp):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        tag = (item.get("name") or item.get("tag") or "").strip().lower()
                        cn = (item.get("cn_name") or item.get("translation") or "").strip()
                        if tag and cn:
                            _CN_INDEX.setdefault(cn, []).append(tag)
                            _EN_TO_CN[tag] = cn
                            for ch in cn:
                                _CHAR_INDEX.setdefault(ch, set()).add(cn)
                elif isinstance(data, dict):
                    for tag, cn in data.items():
                        tag = tag.strip().lower()
                        cn = str(cn).strip()
                        if tag and cn:
                            _CN_INDEX.setdefault(cn, []).append(tag)
                            _EN_TO_CN[tag] = cn
                            for ch in cn:
                                _CHAR_INDEX.setdefault(ch, set()).add(cn)
            except Exception:
                pass

    # 额外加载 zh_cn/all_tags_cn.json 和 zh_cn/wai_characters.csv
    # 优先用本目录的，再用 Gallery 的大表
    search_dirs = [os.path.join(PY_DIR, "zh_cn")]
    gallery_zh = os.path.abspath(os.path.join(PY_DIR, "..", "..", "ComfyUI-Danbooru-Gallery", "py", "danbooru_gallery", "zh_cn"))
    if os.path.isdir(gallery_zh):
        search_dirs.append(gallery_zh)
    for src_dir in search_dirs:
        for fn in ["all_tags_cn.json"]:
            fp = os.path.join(src_dir, fn)
            if os.path.isfile(fp):
                try:
                    with open(fp, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            tag = (item.get("name") or item.get("tag") or "").strip().lower()
                            cn = (item.get("cn_name") or item.get("translation") or "").strip()
                            if tag and cn:
                                _CN_INDEX.setdefault(cn, []).append(tag)
                                _EN_TO_CN[tag] = cn
                                for ch in cn:
                                    _CHAR_INDEX.setdefault(ch, set()).add(cn)
                except Exception:
                    pass
        # CSV 角色名
        csv_path = os.path.join(src_dir, "wai_characters.csv")
        if os.path.isfile(csv_path):
            try:
                import csv as _csv
                with open(csv_path, "r", encoding="utf-8") as f:
                    reader = _csv.reader(f)
                    for row in reader:
                        if len(row) >= 2:
                            cn_name = row[0].strip()
                            en_tag = row[1].strip().lower().replace(" ", "_")
                            if cn_name and en_tag:
                                _CN_INDEX.setdefault(cn_name, []).append(en_tag)
                                _EN_TO_CN[en_tag] = cn_name
                                for ch in cn_name:
                                    _CHAR_INDEX.setdefault(ch, set()).add(cn_name)
            except Exception:
                pass

    # 加载 tags_enhanced.csv（云端 sakizuki 同源精校翻译，覆盖 json 的机械翻译）
    _enh_paths = [
        os.path.join(os.path.dirname(PY_DIR), "tags_enhanced.csv"),   # 插件根目录
        os.path.join(PY_DIR, "..", "..", "tags_enhanced.csv"),
    ]
    for enhp in _enh_paths:
        enhp = os.path.normpath(enhp)
        if not os.path.isfile(enhp):
            continue
        try:
            import csv as _csv2
            _enc2 = None
            for _e2 in ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1", "cp1252"]:
                try:
                    with open(enhp, "r", encoding=_e2) as f2:
                        f2.read(1024)
                    _enc2 = _e2
                    break
                except (UnicodeDecodeError, UnicodeError):
                    continue
            if _enc2 is None:
                continue
            with open(enhp, "r", encoding=_enc2, newline="") as f2:
                reader2 = _csv2.DictReader(f2)
                for row2 in reader2:
                    en_tag = (row2.get("name") or "").strip().lower().replace(" ", "_")
                    cn_raw = (row2.get("cn_name") or "").strip()
                    if not en_tag or not cn_raw:
                        continue
                    cn_first = cn_raw.split(",")[0].strip()
                    if not cn_first:
                        continue
                    # 覆盖：CSV 精校翻译优先于 json
                    _EN_TO_CN[en_tag] = cn_first
                    _CN_INDEX.setdefault(cn_first, []).append(en_tag)
                    for ch in cn_first:
                        _CHAR_INDEX.setdefault(ch, set()).add(cn_first)
            break
        except Exception:
            continue

    _CN_INDEX_LOADED = True
    total = sum(len(v) for v in _CN_INDEX.values())
    print(f"[Gelbooru] 中文索引就绪: {len(_CN_INDEX)} 词条, {total} 标签, {len(_CHAR_INDEX)} 汉字")

_GEL_KEYS = None
_GEL_KEYS_N = -1


def _gel_keys(gdb):
    global _GEL_KEYS, _GEL_KEYS_N
    from .tag_utils import fuzzy_norm_tag
    n = (len(gdb or {}), len(_EN_TO_CN))
    if _GEL_KEYS is None or _GEL_KEYS_N != n:
        names = set()
        for tag in (gdb or {}):
            k = fuzzy_norm_tag(tag)
            if k:
                names.add(k)
        for tag in _EN_TO_CN:
            k = fuzzy_norm_tag(tag)
            if k:
                names.add(k)
        _GEL_KEYS = sorted(names)
        _GEL_KEYS_N = n
    return _GEL_KEYS


def _search_local(query: str) -> list:
    """本地模糊搜索。完全一致排最前，粘连词缀靠后。"""
    _ensure_cn_index()
    from .tag_utils import collect_prefix_and_rank, rank_cn_hits
    raw = (query or "").strip()
    if not raw:
        return []
    if any("\u4e00" <= c <= "\u9fff" for c in raw):
        return rank_cn_hits(raw, _CN_INDEX, _CHAR_INDEX, 24)
    try:
        from . import tag_db
        gdb = tag_db.load_db("gelbooru") or {}
        extra = tag_db.cn_dict("gelbooru")
    except Exception:
        gdb = {}
        extra = {}

    def cn_of(tag):
        return _EN_TO_CN.get(tag) or extra.get(tag) or ""

    return collect_prefix_and_rank(raw, _gel_keys(gdb), cn_of, 24)


# ── GelbooruBrowser 节点 ────────────────────────────

class GelbooruBrowser:
    """G 站浏览器节点：搜索 Gelbooru 图片 → 获取标签 → 分类输出"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selection_data": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "从浏览器面板选择图片后自动填充"
                }),
            },
            "optional": {
                "search_tags": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "搜索标签（空格分隔，支持中文）"
                }),
                "rating_filter": ("STRING", {"default": ""}),
                "page": ("INT", {"default": 0, "min": 0, "max": 9999}),
                "page_size": ("INT", {"default": 20, "min": 1, "max": 100}),
                "blacklist": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "排除标签（逗号或空格分隔）"
                }),
                "_tag_fusion": ("STRING", {
                    "multiline": True, "default": "{}",
                }),
                "来自AnimaDex": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "来自 AnimaDex 浏览器的搜索任务"
                }),
            },
            "hidden": {
                "gelbooru_api_key": ("STRING", {"default": ""}),
                "gelbooru_user_id": ("STRING", {"default": ""}),
                "node_settings": ("STRING", {"default": "{}", "multiline": True}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("image", _PORT_ALL, _PORT_QM, _PORT_CNT,
                    _PORT_CHR, _PORT_SRS, _PORT_ART, _PORT_GEN, _PORT_UNCLASSIFIED)
    FUNCTION = "browse"
    CATEGORY = "Danbooru Anima"

    @classmethod
    def IS_CHANGED(cls, selection_data="{}", _tag_fusion="{}", **kwargs):
        return selection_data + _tag_fusion

    def _download_first(self, urls):
        """依次尝试多个 URL 下载图片，全部失败才返回占位图（解决黑图问题）"""
        for _u in urls:
            if not _u or not isinstance(_u, str) or not _u.strip():
                continue
            try:
                resp = requests.get(_u.strip(), headers={"User-Agent": "Gelbooru-Gallery/1.0", "Referer": "https://gelbooru.com/"}, timeout=30)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    _im = Image.open(BytesIO(resp.content)).convert("RGB")
                    _arr = np.array(_im).astype(np.float32) / 255.0
                    return torch.from_numpy(_arr).unsqueeze(0)
            except Exception:
                continue
        return torch.zeros(1, 64, 64, 3)

    @staticmethod
    def _cover_resize(img, tw, th):
        """居中裁剪缩放：把图片统一到 (tw, th) 尺寸（保持比例不拉伸）"""
        w, h = img.size
        scale = max(tw / w, th / h)
        nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
        img = img.resize((nw, nh), Image.LANCZOS)
        x = (nw - tw) // 2
        y = (nh - th) // 2
        return img.crop((x, y, x + tw, y + th))

    def _download_url(self, url):
        """下载图片URL并返回tensor"""
        try:
            print(f"[Gelbooru] 下载图片: {url[:80]}...")
            resp = requests.get(url, headers={
                "User-Agent": "Gelbooru-Gallery/1.0",
                "Referer": "https://gelbooru.com/",
            }, timeout=30)
            print(f"[Gelbooru] 下载响应: {resp.status_code}, size={len(resp.content)}")
            if resp.status_code == 200:
                img = Image.open(BytesIO(resp.content)).convert("RGB")
                img_np = np.array(img).astype(np.float32) / 255.0
                return torch.from_numpy(img_np).unsqueeze(0)
        except Exception as e:
            print(f"[Gelbooru] 下载失败: {e}")
        return torch.zeros(1, 64, 64, 3)

    def browse(self, selection_data="", search_tags="", rating_filter="",
               page=0, page_size=20, blacklist="", unique_id=None, extra_pnginfo=None, _tag_fusion="{}", **kwargs):
        print(f"[Gelbooru] browse selection_data={repr(selection_data)[:300]}")
        print(f"[Gelbooru] browse search_tags={repr(search_tags)[:80]} _tag_fusion={repr(_tag_fusion)[:120]}")
        # 确保 API 凭证已设置
        settings = load_settings()
        api_key = settings.get("gelbooru_api_key", "")
        user_id = settings.get("gelbooru_user_id", "")
        if api_key and user_id:
            set_credentials(api_key, user_id)

        image_list = []
        all_tags = []
        quality_meta_tags = []
        count_tags = []
        character_tags = []
        series_tags = []
        artist_tags = []
        general_tags = []
        unclassified_tags = []

        # 获取黑名单（节点widget + 全局设置）
        blacklist_set = set()
        if blacklist:
            blacklist_set = set(t.strip().lower() for t in blacklist.replace(",", " ").split() if t.strip())
        # 合并全局设置中的黑名单
        try:
            bl_settings = load_settings().get("blacklist_tags", "")
            if bl_settings:
                for t in bl_settings.replace(",", " ").split():
                    t = t.strip().lower()
                    if t:
                        blacklist_set.add(t)
        except Exception:
            pass

        # ── 分序号融合模式 ──
        fusion_data = {}
        if _tag_fusion and _tag_fusion.strip():
            try:
                fusion_data = json.loads(_tag_fusion)
            except (json.JSONDecodeError, ValueError, TypeError):
                fusion_data = {}
        # Debug
        print(f"[Gelbooru] browse called, _tag_fusion raw: {repr(_tag_fusion)[:200]}")
        _fusion_has_posts = any(isinstance(v, list) and len(v) > 0 for v in fusion_data.values()) if fusion_data else False
        if fusion_data and _fusion_has_posts:
            slot_counts = {k: len(v) if isinstance(v, list) else 0 for k, v in fusion_data.items()}
            print(f"[Gelbooru] 融合模式: {slot_counts}")
            if slot_counts:
                first_post = None
                for sk in ("1","2","3"):
                    posts = fusion_data.get(sk,[])
                    if posts and isinstance(posts,list) and posts:
                        first_post = posts[0]
                        break
                print(f"[Gelbooru] 首帖数据: {repr(first_post)[:200] if first_post else 'None'}")
        if fusion_data and _fusion_has_posts:
            # 确定展示图片：优先级 1 > 2 > 3，每槽取第一张
            display_post = None
            for slot_key in ("1", "2", "3"):
                posts = fusion_data.get(slot_key, [])
                if posts and isinstance(posts, list) and len(posts) > 0:
                    display_post = posts[0]
                    break
            # 下载展示图片
            img_tensor = torch.zeros(1, 64, 64, 3)
            if display_post:
                url = ""
                if isinstance(display_post, dict):
                    url = display_post.get("file_url", "") or display_post.get("sample_url", "") or display_post.get("preview_url", "")
                if url:
                    img_tensor = self._download_url(url)
            # 收集标签（按槽 + classify_general_gelbooru）
            result_groups = {}
            SUB_ORDER = ["body_features", "clothing", "pose", "expression", "background", "accessories", "other"]
            for slot_key in ("1", "2", "3"):
                posts = fusion_data.get(slot_key, [])
                if not isinstance(posts, list):
                    continue
                for p in posts:
                    if not isinstance(p, dict):
                        continue
                    # 优先用前端传来的预分类（来自搜索响应的大类 + 本地子分类）
                    classified = p.get("classified", {})
                    if classified:
                        # 用本地子分类器处理 general 标签
                        general_tags = classified.get("general", [])
                        sub, _ = classify_general_gelbooru(general_tags)
                        if slot_key == "1":
                            add_set(result_groups, "quality_meta", classified.get("quality_meta", []))
                            add_set(result_groups, "count", classified.get("count", []))
                            for sk in ("pose", "expression", "background", "other"):
                                add_set(result_groups, sk, sub.get(sk, []))
                        elif slot_key == "2":
                            add_set(result_groups, "character", classified.get("character", []))
                            add_set(result_groups, "series", classified.get("series", []))
                            for sk in ("body_features", "clothing", "accessories"):
                                add_set(result_groups, sk, sub.get(sk, []))
                        elif slot_key == "3":
                            add_set(result_groups, "artist", classified.get("artist", []))
                    else:
                        # 降级：从 tags 字符串分类
                        tags_str = p.get("tags", "")
                        tag_list = [t.strip() for t in tags_str.split() if t.strip()]
                        category_map = {}
                        try:
                            from . import tag_db
                            category_map = tag_db.batch_lookup(tag_list, source="gelbooru")
                        except Exception:
                            pass
                        groups = classify_tags(tag_list, category_map)
                        if slot_key == "1":
                            add_set(result_groups, "quality_meta", groups.get("quality_meta", []))
                            add_set(result_groups, "count", groups.get("count", []))
                            sub, _ = classify_general_gelbooru(groups.get("general", []))
                            for sk in ("pose", "expression", "background", "other"):
                                add_set(result_groups, sk, sub.get(sk, []))
                        elif slot_key == "2":
                            add_set(result_groups, "character", groups.get("character", []))
                            add_set(result_groups, "series", groups.get("series", []))
                            sub, _ = classify_general_gelbooru(groups.get("general", []))
                            for sk in ("body_features", "clothing", "accessories"):
                                add_set(result_groups, sk, sub.get(sk, []))
                        elif slot_key == "3":
                            add_set(result_groups, "artist", groups.get("artist", []))
            # 合并通用标签
            general_tags = []
            for sk in SUB_ORDER:
                general_tags.extend(result_groups.get(sk, []))
            general_tags = list(dict.fromkeys(general_tags))
            # 收集 all
            all_tags_list = []
            for cat in ("quality_meta", "count", "character", "series", "artist"):
                all_tags_list.extend(result_groups.get(cat, []))
            all_tags_list.extend(general_tags)
            all_tags_list = list(dict.fromkeys(all_tags_list))
            # 黑名单过滤
            all_tags_list = [t for t in all_tags_list if t.lower() not in blacklist_set]
            quality_meta = [t for t in result_groups.get("quality_meta", []) if t.lower() not in blacklist_set]
            count_tags_out = [t for t in result_groups.get("count", []) if t.lower() not in blacklist_set]
            character_tags_out = [t for t in result_groups.get("character", []) if t.lower() not in blacklist_set]
            series_tags_out = [t for t in result_groups.get("series", []) if t.lower() not in blacklist_set]
            artist_tags_out = [t for t in result_groups.get("artist", []) if t.lower() not in blacklist_set]
            general_tags_out = [t for t in general_tags if t.lower() not in blacklist_set]
            uncategorized = [t for t in result_groups.get("_uncategorized", []) if t.lower() not in blacklist_set]
            return (
                img_tensor,
                ", ".join(all_tags_list),
                ", ".join(dict.fromkeys(quality_meta)),
                ", ".join(dict.fromkeys(count_tags_out)),
                ", ".join(dict.fromkeys(character_tags_out)),
                ", ".join(dict.fromkeys(series_tags_out)),
                ", ".join(dict.fromkeys(artist_tags_out)),
                ", ".join(dict.fromkeys(general_tags_out)),
                ", ".join(dict.fromkeys(uncategorized)),
            )

        # ── 正常选择模式 ──
        # 解析选择数据
        post_ids = []
        multi_mode = False
        merged_tags_str = ""
        if selection_data and selection_data.strip():
            try:
                sel = json.loads(selection_data)
                if isinstance(sel, dict) and sel.get("mode") == "multi":
                    # 多选模式
                    multi_mode = True
                    post_ids = [int(pid) for pid in sel.get("ids", [])]
                    merged_tags_str = sel.get("merged_tags", "")
                    print(f"[Gelbooru] 多选模式 ids={post_ids[:5]} merged_tags={repr(merged_tags_str)[:100]}")
                elif isinstance(sel, list):
                    post_ids = [int(s.get("id", 0)) if isinstance(s, dict) else int(s) for s in sel]
                elif isinstance(sel, dict):
                    post_ids = [int(sel.get("id", 0))]
                    print(f"[Gelbooru] 单选模式 id={post_ids} has_tags={bool(sel.get('tags'))} has_groups={bool(sel.get('groups'))} url={repr(sel.get('sample_url') or sel.get('file_url'))[:80]}")
                elif isinstance(sel, (int, str)):
                    post_ids = [int(sel)]
            except (json.JSONDecodeError, ValueError, TypeError):
                post_ids = []

        # 多选模式：直接使用前端传来的合并标签
        if multi_mode and merged_tags_str:
            tag_list = [t.strip() for t in merged_tags_str.replace(",", " ").split() if t.strip()]
            tag_list = [t for t in tag_list if t.lower() not in blacklist_set]
            # 查询分类
            category_map = {}
            try:
                from . import tag_db
                local_hits = tag_db.batch_lookup(tag_list, source="gelbooru")
                category_map.update(local_hits)
                remaining = [t for t in tag_list if t not in category_map]
                if remaining:
                    api_hits = get_tags_batch(remaining)
                    category_map.update(api_hits)
            except Exception:
                pass
            groups = classify_tags(tag_list, category_map)
            all_tags = groups.get("all", [])
            quality_meta_tags = groups.get("quality_meta", [])
            count_tags = groups.get("count", [])
            character_tags = groups.get("character", [])
            series_tags = groups.get("series", [])
            artist_tags = groups.get("artist", [])
            general_tags = groups.get("general", [])
            # 多选模式：输出所有选中帖子的图片（前端传 urls 数组，统一尺寸后堆叠成 batch）
            _multi_img = torch.zeros(1, 64, 64, 3)
            try:
                _urls = (sel.get("urls") or []) if isinstance(sel, dict) else []
                _urls = [u for u in _urls if isinstance(u, str) and u.strip()]
                if _urls:
                    _imgs = []
                    _tw = _th = None
                    for _u in _urls:
                        try:
                            resp = requests.get(_u, headers={"User-Agent": "Gelbooru-Gallery/1.0", "Referer": "https://gelbooru.com/"}, timeout=30)
                            if resp.status_code == 200:
                                _im = Image.open(BytesIO(resp.content)).convert("RGB")
                                if _tw is None:
                                    _tw, _th = _im.size
                                else:
                                    _im = self._cover_resize(_im, _tw, _th)
                                _arr = np.array(_im).astype(np.float32) / 255.0
                                _imgs.append(torch.from_numpy(_arr).unsqueeze(0))
                        except Exception:
                            pass
                    if _imgs:
                        _multi_img = torch.cat(_imgs, dim=0)
            except Exception:
                pass
            return (
                _multi_img,
                ", ".join(all_tags),
                ", ".join(quality_meta_tags),
                ", ".join(count_tags),
                ", ".join(character_tags),
                ", ".join(series_tags),
                ", ".join(artist_tags),
                ", ".join(general_tags),
                "",
            )

        # 如果有搜索标签但没有选择数据，先搜帖子再取第一个的结果标签
        if search_tags and not post_ids:
            try:
                results = search_posts(tags=search_tags, page=page, limit=min(page_size, 20))
                if results:
                    post_ids = [results[0].get("id", 0)]
            except Exception:
                pass

        if not post_ids:
            return (torch.zeros(1, 64, 64, 3), "", "", "", "", "", "", "", "")

        for post_id in post_ids[:1]:  # 单图模式
            # 检查是否有预缓存的分类标签组
            pre_groups = None
            if isinstance(sel, dict):
                pre_groups = sel.get("groups")
            
            if pre_groups and isinstance(pre_groups, dict):
                # 快速路径：使用前端传来的分类 + URL，完全跳过 API 查询
                filtered_groups = {}
                for cat, cat_tags in pre_groups.items():
                    if isinstance(cat_tags, list):
                        filtered = [t for t in cat_tags if t.lower() not in blacklist_set]
                        filtered_groups[cat] = filtered
                    else:
                        filtered_groups[cat] = cat_tags
                tag_list = []
                for cat_tags in filtered_groups.values():
                    if isinstance(cat_tags, list):
                        tag_list.extend(cat_tags)
                all_tags_str = ", ".join(tag_list)
                quality_meta_tags = ", ".join(filtered_groups.get("quality_meta", []))
                count_tags = ", ".join(filtered_groups.get("count", []))
                character_tags = ", ".join(filtered_groups.get("character", []))
                series_tags = ", ".join(filtered_groups.get("series", []))
                artist_tags = ", ".join(filtered_groups.get("artist", []))
                general_tags = ", ".join(filtered_groups.get("general", []))
                
                # 分辨率逻辑（用户设定）：
                #   未开原图 → 默认缩略图（快），失败回退 sample
                #   开启原图 → 原图分辨率（file_url），失败回退 sample（绝不用缩略图冒充原图）
                use_orig = sel.get("use_original", False)
                if use_orig:
                    img_tensor = self._download_first([sel.get("file_url"), sel.get("sample_url")])
                else:
                    img_tensor = self._download_first([sel.get("preview_url"), sel.get("sample_url")])
                return (
                    img_tensor,
                    all_tags_str, quality_meta_tags, count_tags,
                    character_tags, series_tags, artist_tags, general_tags, ""
                )
            
            # 中速路径：无预缓存分组，但有tags字符串，用本地数据库分类（不调API）
            if isinstance(sel, dict) and sel.get("tags"):
                print(f"[Gelbooru] 中速路径 tags={repr(sel.get('tags'))[:100]}")
                tag_list = [t.strip() for t in sel["tags"].replace(",", " ").split() if t.strip()]
                tag_list = [t for t in tag_list if t.lower() not in blacklist_set]
                if tag_list:
                    category_map = {}
                    try:
                        from . import tag_db
                        category_map = tag_db.batch_lookup(tag_list, source="gelbooru")
                    except Exception:
                        pass
                    groups = classify_tags(tag_list, category_map)
                    use_orig = sel.get("use_original", False)
                    img_url = (sel.get("file_url") if use_orig else "") or sel.get("sample_url") or sel.get("file_url") or sel.get("preview_url", "")
                    img_tensor = self._download_url(img_url) if img_url else torch.zeros(1, 64, 64, 3)
                    return (
                        img_tensor,
                        ", ".join(groups.get("all", tag_list)),
                        ", ".join(groups.get("quality_meta", [])),
                        ", ".join(groups.get("count", [])),
                        ", ".join(groups.get("character", [])),
                        ", ".join(groups.get("series", [])),
                        ", ".join(groups.get("artist", [])),
                        ", ".join(groups.get("general", [])),
                        "",
                    )
            
            post = get_post(post_id)
            if not post:
                continue

            # 下载图片
            img_tensor = None
            file_url = post.get("file_url", "")
            if file_url:
                try:
                    resp = requests.get(file_url, headers={
                        "User-Agent": "Gelbooru-Gallery/1.0",
                        "Referer": "https://gelbooru.com/",
                    }, timeout=30)
                    if resp.status_code == 200:
                        img = Image.open(BytesIO(resp.content)).convert("RGB")
                        img_np = np.array(img).astype(np.float32) / 255.0
                        img_tensor = torch.from_numpy(img_np).unsqueeze(0)
                except Exception as e:
                    print(f"[Gelbooru] 下载图片失败: {e}")

            if img_tensor is None:
                img_tensor = torch.zeros(1, 64, 64, 3)

            image_list.append(img_tensor)

            # 获取标签并分类
            tags_str = post.get("tags", "")
            tag_list = [t.strip() for t in tags_str.split() if t.strip()]

            # 过滤黑名单
            tag_list = [t for t in tag_list if t.lower() not in blacklist_set]

            # 查询标签分类
            category_map = {}
            try:
                # 优先查本地 Gelbooru 标签数据库
                from . import tag_db
                local_hits = tag_db.batch_lookup(tag_list, source="gelbooru")
                category_map.update(local_hits)
                # 未命中的查 API
                remaining = [t for t in tag_list if t not in category_map]
                if remaining:
                    api_hits = get_tags_batch(remaining)
                    category_map.update(api_hits)
            except Exception:
                pass

            # 使用现有分类引擎
            groups = classify_tags(tag_list, category_map)
            all_tags.extend(groups.get("all", []))
            quality_meta_tags.extend(groups.get("quality_meta", []))
            count_tags.extend(groups.get("count", []))
            character_tags.extend(groups.get("character", []))
            series_tags.extend(groups.get("series", []))
            artist_tags.extend(groups.get("artist", []))
            general_tags.extend(groups.get("general", []))

        # 合并图片
        if image_list:
            final_img = torch.cat(image_list, dim=0)
        else:
            final_img = torch.zeros(1, 64, 64, 3)

        return (
            final_img,
            ", ".join(all_tags),
            ", ".join(quality_meta_tags),
            ", ".join(count_tags),
            ", ".join(character_tags),
            ", ".join(series_tags),
            ", ".join(artist_tags),
            ", ".join(general_tags),
            "",  # unclassified — Gelbooru tags get classified above
        )


# ── 注册路由 ─────────────────────────────────────────

def register_routes():
    @PromptServer.instance.routes.post("/gelbooru_anima/search")
    async def gel_search(request):
        """搜索 Gelbooru 帖子 + 返回分类标签"""
        try:
            data = await request.json()
            tags = data.get("tags", "")
            page = int(data.get("page", 0))
            limit = min(int(data.get("limit", 20)), 100)
            rating = data.get("rating", None)
            order = data.get("order", None)
            cursor = data.get("cursor", None)
            before_id = data.get("before_id", None)

            settings = load_settings()
            set_credentials(
                settings.get("gelbooru_api_key", ""),
                settings.get("gelbooru_user_id", ""),
            )

            meta = {}

            def _gel_search_blocking():
                # 同步 HTTP 不能占着事件循环，否则加载下一页时 /prompt 进不了队列。
                return search_posts(
                    tags=tags, page=page, limit=limit, rating=rating,
                    order=order, cursor=cursor, before_id=before_id, out=meta,
                )

            results = await asyncio.to_thread(_gel_search_blocking)

            # 格式化结果，与 D 站前端兼容的字段名
            formatted = []
            # 批量分类标签（内嵌到搜索结果中，避免 JS 二次请求 /post/{id}）
            all_tags_set = set()
            for post in results:
                for t in post.get("tags", "").split():
                    if t.strip():
                        all_tags_set.add(t.strip())
            all_tags_list = list(all_tags_set)
            category_map = {}
            translations = {}
            if all_tags_list:
                try:
                    from . import tag_db
                    category_map = tag_db.batch_lookup(all_tags_list, source="gelbooru")
                    remaining = [t for t in all_tags_list if t not in category_map]
                    if remaining:
                        loop = asyncio.get_event_loop()
                        api_hits = await loop.run_in_executor(None, get_tags_batch, remaining)
                        category_map.update(api_hits)
                except Exception:
                    pass
                try:
                    _ensure_cn_index()
                    # _EN_TO_CN 在本模块内（加载自 all_tags_cn.json 等）
                    for t in all_tags_list:
                        cn = _EN_TO_CN.get(t.lower(), "")
                        if cn:
                            translations[t] = cn
                except Exception:
                    pass
            
            for post in results:
                tags_str = post.get("tags", "")
                tag_list = [t.strip() for t in tags_str.split() if t.strip()]
                groups = classify_tags(tag_list, category_map)
                post["classified"] = groups
                post["translations"] = {t: translations.get(t, "") for t in tag_list if translations.get(t)}
                formatted.append({
                    "id": post.get("id"),
                    "tags": post.get("tags", ""),
                    "preview_url": post.get("preview_url", ""),
                    "file_url": post.get("file_url", ""),
                    "sample_url": post.get("sample_url", ""),
                    "rating": post.get("rating", "general"),
                    "score": post.get("score", 0),
                    "width": post.get("width", 0),
                    "height": post.get("height", 0),
                    "source": post.get("source", ""),
                    "classified": groups,
                    "translations": post["translations"],
                })

            return web.json_response({
                "success": True,
                "posts": formatted,
                "total": int(meta.get("total") or 0),
                "pages": int(meta.get("pages") or 0),
                "page": page,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/gelbooru_anima/post/{post_id}")
    async def gel_post(request):
        """获取帖子详情 + 分类标签"""
        post_id = int(request.match_info["post_id"])
        settings = load_settings()
        set_credentials(
            settings.get("gelbooru_api_key", ""),
            settings.get("gelbooru_user_id", ""),
        )
        loop = asyncio.get_event_loop()
        post = await loop.run_in_executor(None, get_post, post_id)
        if not post:
            return web.json_response({"success": False, "error": "帖子未找到"}, status=404)

        tags_str = post.get("tags", "")
        tag_list = [t.strip() for t in tags_str.split() if t.strip()]

        category_map = {}
        try:
            from . import tag_db
            local_hits = tag_db.batch_lookup(tag_list, source="gelbooru")
            category_map.update(local_hits)
            remaining = [t for t in tag_list if t not in category_map]
            if remaining:
                api_hits = get_tags_batch(remaining)
                category_map.update(api_hits)
        except Exception:
            pass

        groups = classify_tags(tag_list, category_map)

        # 添加翻译
        _ensure_cn_index()
        translations = {}
        for tag in tag_list:
            cn = _EN_TO_CN.get(tag.lower(), "")
            if cn:
                translations[tag] = cn

        return web.json_response({
            "success": True,
            "post": {
                "id": post.get("id"),
                "tags": tags_str,
                "preview_url": post.get("preview_url", ""),
                "file_url": post.get("file_url", ""),
                "sample_url": post.get("sample_url", ""),
                "rating": post.get("rating", "general"),
                "score": post.get("score", 0),
                "width": post.get("width", 0),
                "height": post.get("height", 0),
            },
            "groups": groups,
            "translations": translations,
        })

    @PromptServer.instance.routes.post("/gelbooru_anima/translate_tags")
    async def gel_translate_tags(request):
        """批量标签翻译"""
        try:
            data = await request.json()
            tags = data.get("tags", [])
            translations = {}
            user_trans = load_user_translations()
            for tag in tags:
                tag_lower = tag.strip().lower()
                cn = user_trans.get(tag_lower, "")
                if not cn:
                    cn = _EN_TO_CN.get(tag_lower, "")
                    if not cn:
                        from . import tag_db as tdb
                        # 尝试从本地标签数据库获取中文名
                        pass  # Gelbooru CSV 没有中文名字段，暂时跳过
                translations[tag] = cn
            return web.json_response({"success": True, "translations": translations})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/gelbooru_anima/cloud_translate")
    async def gel_cloud_translate(request):
        """云翻译"""
        try:
            data = await request.json()
            text = data.get("text", "")
            provider = data.get("provider", "google")
            result = cloud_translate(text, provider)
            return web.json_response({"success": True, "translation": result})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/gelbooru_anima/save_translation")
    async def gel_save_translation(request):
        """保存用户翻译"""
        try:
            data = await request.json()
            tag = data.get("tag", "")
            cn = data.get("cn", "")
            save_user_translation(tag, cn)
            _EN_TO_CN[tag.lower()] = cn
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/gelbooru_anima/local_tags")
    async def gel_local_tags(request):
        """本地模糊搜索 tag"""
        query = ""
        if request.method == "POST":
            try:
                data = await request.json()
                query = data.get("query", "")
            except Exception:
                query = request.query.get("query", "")
        else:
            query = request.query.get("query", "")
        results = _search_local(query) if query else []
        return web.json_response({"success": True, "tags": results[:15]})

    @PromptServer.instance.routes.post("/gelbooru_anima/tag_categories")
    async def gel_tag_categories(request):
        """批量查询 tag 分类"""
        try:
            data = await request.json()
            tags = data.get("tags", [])
            settings = load_settings()
            set_credentials(
                settings.get("gelbooru_api_key", ""),
                settings.get("gelbooru_user_id", ""),
            )
            categories = get_tags_batch(tags)
            return web.json_response({"success": True, "categories": categories})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/gelbooru_anima/image_proxy")
    async def gel_image_proxy(request):
        """图片代理 — 转发图片，设置缓存头，带磁盘缓存"""
        url = request.query.get("url", "")
        if not url:
            raise web.HTTPBadRequest(text="缺少 url 参数")
        # SSRF 防护
        from urllib.parse import urlparse
        parsed = urlparse(url)
        allowed_hosts = {"gelbooru.com", "us.rule34.xxx", "api.rule34.xxx", "simg4.gelbooru.com", "img3.gelbooru.com", "video-cdn3.gelbooru.com", "videos-cdn.gelbooru.com"}
        host = parsed.hostname or ""
        if not any(host == h or host.endswith('.' + h) for h in allowed_hosts):
            raise web.HTTPForbidden(text="invalid host")

        # 磁盘缓存（异步读写，避免收藏夹一次弹出几十张时卡住事件循环）
        import hashlib
        cache_key = hashlib.md5(url.encode()).hexdigest()
        cache_dir = os.path.join(PY_DIR, "cdn_cache")
        os.makedirs(cache_dir, exist_ok=True)
        cache_ext = ".jpg" if ".jpg" in url else ".png" if ".png" in url else ".jpg"
        cache_path = os.path.join(cache_dir, cache_key + cache_ext)
        if os.path.exists(cache_path):
            try:
                cached_data = await asyncio.to_thread(_gel_read_cache, cache_path)
                if cached_data:
                    return web.Response(
                        body=cached_data,
                        content_type="image/jpeg" if cache_ext == ".jpg" else "image/png",
                        headers={"Cache-Control": "public, max-age=2592000, immutable"},
                    )
            except Exception:
                pass

        sem = _get_thumb_proxy_semaphore() if _is_gel_thumb_url(url) else _get_image_proxy_semaphore()
        async with sem:
            try:
                loop = asyncio.get_event_loop()
                session = _get_proxy_session()
                resp = await loop.run_in_executor(
                    None,
                    lambda: session.get(url, timeout=30)
                )
                if resp.status_code == 200:
                    try:
                        await asyncio.to_thread(_gel_write_cache, cache_path, resp.content)
                    except Exception:
                        pass
                    return web.Response(
                        body=resp.content,
                        content_type=resp.headers.get("Content-Type", "image/jpeg"),
                        headers={"Cache-Control": "public, max-age=2592000, immutable"},
                    )
            except Exception:
                pass
        raise web.HTTPNotFound(text="图片加载失败")

    @PromptServer.instance.routes.post("/gelbooru_anima/set_language")
    async def gel_set_language(request):
        """设置 UI 语言"""
        global _COMFY_LANG
        try:
            data = await request.json()
            lang = normalize_ui_lang(data.get("language", "en-US") or "en-US")
            with open(_LANG_STORE_PATH, "w", encoding="utf-8") as f:
                json.dump({"language": lang}, f)
            _COMFY_LANG = lang
            return web.json_response({"success": True, "language": lang})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/gelbooru_anima/settings")
    async def gel_get_settings(request):
        return web.json_response({"success": True, "settings": load_settings()})

    @PromptServer.instance.routes.post("/gelbooru_anima/settings")
    async def gel_update_settings(request):
        try:
            data = await request.json()
            settings = load_settings()
            allowed_keys = (
                "gelbooru_api_key", "gelbooru_user_id",
                "blacklist_tags", "original_resolution",
                "translation_provider", "translation_api_key",
                "translation_model", "translation_base_url",
            )
            for key in allowed_keys:
                if key in data:
                    settings[key] = data[key]
            save_settings(settings)
            # 同步凭证到 API 模块
            if "gelbooru_api_key" in data or "gelbooru_user_id" in data:
                set_credentials(
                    settings.get("gelbooru_api_key", ""),
                    settings.get("gelbooru_user_id", ""),
                )
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    # ── 收藏夹路由 ────────────────────────────────

    @PromptServer.instance.routes.get("/gelbooru_anima/favorites")
    async def gel_get_favs(request):
        favs = _load_gel_favs()
        raw_cats = (request.query.get("cats") or "").strip()
        cats = [c.strip() for c in raw_cats.split(",") if c.strip()] if raw_cats else None
        try:
            from favorites import sync_folder_lists, slice_favorites
            if cats:
                favs = slice_favorites(favs, cats)
                for cat in cats:
                    sync_folder_lists(favs, cat, ensure=False)
            else:
                sync_folder_lists(favs, "images", ensure=False)
        except Exception:
            pass
        return web.json_response({"success": True, "favorites": favs})

    @PromptServer.instance.routes.get("/gelbooru_anima/favorites/backfill_classified/status")
    async def gel_favorites_backfill_classified_status(request):
        try:
            return web.json_response(gel_favorites_backfill_status())
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/backfill_classified")
    async def gel_favorites_backfill_classified_route(request):
        try:
            try:
                data = await request.json()
            except Exception:
                data = {}
            if not isinstance(data, dict):
                data = {}
            result = backfill_gel_favorites_classified(data.get("limit", 0))
            return web.json_response(result)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/add")
    async def gel_add_fav(request):
        try:
            data = await request.json()
            tag = data.get("tag", "").strip()
            category = data.get("category", "").strip()
            thumb = data.get("thumb", "")
            cn = data.get("cn", "")
            if not tag or not category:
                return web.json_response({"success": False, "error": "需要 tag 和 category"})
            favs = _load_gel_favs()
            cat_data = favs.setdefault(category, {})
            prev = cat_data.get(tag) if isinstance(cat_data.get(tag), dict) else {}
            item = dict(prev)
            item["thumb"] = thumb if thumb else prev.get("thumb", "")
            item["cn"] = cn if cn != "" else prev.get("cn", "")
            title = (data.get("title") or "").strip()
            item["title"] = title if title else prev.get("title", "")
            file_url = (data.get("file_url") or "").strip()
            item["file_url"] = file_url if file_url else prev.get("file_url", "")
            sample_url = (data.get("sample_url") or "").strip()
            item["sample_url"] = sample_url if sample_url else prev.get("sample_url", "")
            source = (data.get("source") or "").strip()
            item["source"] = source if source else prev.get("source", "")
            item["width"] = data.get("width", 0) or prev.get("width", 0)
            item["height"] = data.get("height", 0) or prev.get("height", 0)
            tr = data.get("translations")
            if isinstance(tr, dict):
                item["translations"] = tr
            elif isinstance(prev.get("translations"), dict):
                item["translations"] = prev["translations"]
            if category == "images":
                for fld in ("series", "character", "artist"):
                    val = data.get(fld)
                    if isinstance(val, list):
                        item[fld] = val
                    elif isinstance(prev.get(fld), list):
                        item[fld] = prev[fld]
                if data.get("cache_classified") and not isinstance(item.get("series"), list):
                    _gel_classify_image_item(item)
            cat_data[tag] = item
            order = cat_data.setdefault("_order", [])
            if tag not in order:
                order.append(tag)
            _save_gel_favs(favs)
            if category in ("artists", "characters", "series", "general") and item.get("thumb"):
                try:
                    from fav_thumbs import maybe_cache_on_add
                    maybe_cache_on_add("g", tag, item.get("thumb"))
                except Exception:
                    pass
            out = {"success": True}
            if category == "images":
                for fld in ("series", "character", "artist"):
                    if isinstance(item.get(fld), list):
                        out[fld] = item[fld]
                if isinstance(item.get("translations"), dict):
                    out["translations"] = item["translations"]
            return web.json_response(out)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/remove")
    async def gel_remove_fav(request):
        try:
            data = await request.json()
            tag = data.get("tag", "").strip()
            category = data.get("category", "").strip()
            favs = _load_gel_favs()
            if category in favs and tag in favs[category]:
                del favs[category][tag]
                _order = favs[category].get("_order", [])
                if tag in _order:
                    _order.remove(tag)
                _save_gel_favs(favs)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/update_thumb")
    async def gel_update_thumb(request):
        """更新标签缩略图"""
        try:
            data = await request.json()
            tag = data.get("tag", "").strip()
            category = data.get("category", "").strip()
            thumb_url = data.get("thumb_url", "").strip()
            if not tag or not category:
                return web.json_response({"success": False, "error": "需要 tag 和 category"})
            favs = _load_gel_favs()
            if category in favs and tag in favs[category]:
                favs[category][tag]["thumb"] = thumb_url
                _save_gel_favs(favs)
                return web.json_response({"success": True})
            return web.json_response({"success": False, "error": "标签不存在"})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/star")
    async def gel_star_fav(request):
        try:
            data = await request.json()
            tag = data.get("tag", "").strip()
            category = data.get("category", "").strip()
            star = data.get("star", True)
            favs = _load_gel_favs()
            if category in favs and tag in favs[category]:
                favs[category][tag]["star"] = star
                _save_gel_favs(favs)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/rate")
    async def gel_rate_fav(request):
        """Set 0-5 rating on a Gelbooru favorite {tag, category, rating}."""
        try:
            data = await request.json()
            tag = data.get("tag", "").strip()
            category = data.get("category", "").strip()
            try:
                rating = int(data.get("rating", 0))
            except (TypeError, ValueError):
                rating = 0
            if rating < 0:
                rating = 0
            if rating > 5:
                rating = 5
            if not tag or not category:
                return web.json_response({"success": False, "error": "invalid params"})
            favs = _load_gel_favs()
            if category not in favs or tag not in favs[category]:
                return web.json_response({"success": False, "error": "tag not found"})
            info = favs[category][tag]
            if not isinstance(info, dict):
                favs[category][tag] = {"star": True, "rating": rating}
            else:
                info["rating"] = rating
            _save_gel_favs(favs)
            return web.json_response({"success": True, "rating": rating})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.get("/gelbooru_anima/favorites/export")
    async def gel_export_favs(request):
        favs = _load_gel_favs()
        return web.json_response(favs, headers={
            "Content-Disposition": "attachment; filename=gelbooru_favorites.json"
        })

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/import")
    async def gel_import_favs(request):
        try:
            data = await request.json()
            mode = data.get("mode", "merge")
            imported = data.get("data", {})
            if mode == "overwrite":
                _save_gel_favs(imported)
            else:
                existing = _load_gel_favs()
                for cat in DEFAULT_FAVORITES:
                    if cat in imported:
                        existing.setdefault(cat, {}).update(imported[cat])
                # 合并文件夹结构
                if "_folders" in imported:
                    existing.setdefault("_folders", {}).update(imported["_folders"])
                try:
                    from favorites import merge_folder_name_maps, sync_folder_lists
                    existing["_folder_order"] = merge_folder_name_maps(existing.get("_folder_order"), imported.get("_folder_order"))
                    existing["_folder_pinned"] = merge_folder_name_maps(existing.get("_folder_pinned"), imported.get("_folder_pinned"))
                    sync_folder_lists(existing, "images", ensure=False)
                except Exception:
                    pass
                if "_order" in imported and "images" in imported:
                    existing.setdefault("images", {}).setdefault("_order", [])
                    for pid in imported["images"].get("_order", []):
                        if pid not in existing["images"].get("_order", []) and pid in existing.get("images", {}):
                            existing["images"]["_order"].append(pid)
                _save_gel_favs(existing)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/folder")
    async def gel_fav_folder(request):
        """文件夹操作：create / rename / delete / move / remove_from_all / pin / unpin / reorder"""
        try:
            from favorites import (
                folder_create, folder_rename, folder_delete,
                folder_move, folder_remove_from_all, folder_pin, folder_unpin, folder_reorder,
            )
            data = await request.json()
            action = data.get("action")
            category = data.get("category", "images")
            if not action:
                return web.json_response({"success": False, "error": "action required"})
            if category != "images":
                return web.json_response({"success": False, "error": "invalid category"})
            favs = _load_gel_favs()
            extra = {}
            if action == "create":
                ok, err = folder_create(favs, category, data.get("name", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "rename":
                ok, err = folder_rename(favs, category, data.get("name", ""), data.get("new_name", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "delete":
                ok, err = folder_delete(favs, category, data.get("name", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "move":
                ok, err = folder_move(favs, category, data.get("item_keys", []), data.get("target_folder", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "remove_from_all":
                ok, err = folder_remove_from_all(favs, category, data.get("item_keys", []))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "pin":
                ok, err = folder_pin(favs, category, data.get("name", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "unpin":
                ok, err = folder_unpin(favs, category, data.get("name", ""))
                if not ok: return web.json_response({"success": False, "error": err})
            elif action == "reorder":
                ok, err = folder_reorder(favs, category, data.get("pinned"), data.get("order"))
                if not ok: return web.json_response({"success": False, "error": err})
                extra["pinned"] = (favs.get("_folder_pinned") or {}).get(category, [])
                extra["order"] = (favs.get("_folder_order") or {}).get(category, [])
            else:
                return web.json_response({"success": False, "error": f"未知 action: {action}"})
            _save_gel_favs(favs)
            extra["success"] = True
            return web.json_response(extra)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.post("/gelbooru_anima/favorites/repair")
    async def gel_fav_repair(request):
        """修复：把没有分类的图片和 __tmp 里的图片都移到未分类"""
        try:
            favs = _load_gel_favs()
            cat_data = favs.get("images", {})
            folders = favs.setdefault("_folders", {}).setdefault("images", {})
            all_keys = [k for k in cat_data if k != "_order"]
            in_any_folder = set()
            for items in folders.values():
                in_any_folder.update(items)
            # 找出未分类的图（不在任何文件夹也不在 __tmp）
            uncat = [k for k in all_keys if k not in in_any_folder]
            # 把 __tmp 里的也移出来合并
            tmp = folders.pop("__tmp", [])
            all_orphans = list(set(uncat + tmp))
            if all_orphans:
                folders.setdefault("__tmp", [])  # 清空后重建
                # 直接删掉 __tmp，让它们变成未分类
                if "__tmp" in folders:
                    del folders["__tmp"]
                _save_gel_favs(favs)
                return web.json_response({"success": True, "fixed": len(all_orphans), "message": f"已修复 {len(all_orphans)} 张图片，它们现在在「未分类」中"})
            return web.json_response({"success": True, "fixed": 0, "message": "没有需要修复的图片"})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})

    @PromptServer.instance.routes.get("/gelbooru_anima/export")
    async def gel_export_all(request):
        """导出插件数据（可选指定要导出的模块）"""
        import os as _os
        parts = request.rel_url.query.get("parts", "all")
        if parts == "all":
            part_set = {"danbooru_favs", "gelbooru_favs", "tag_mappings"}
        else:
            part_set = set(p for p in parts.split(",") if p in ("danbooru_favs", "gelbooru_favs", "tag_mappings"))
        data = {"exported_at": time.strftime("%Y-%m-%d %H:%M:%S"), "plugin": "ComfyUI-Danbooru-Anima-Prompt"}
        py_dir = _os.path.dirname(_os.path.abspath(__file__))
        # 始终导出设置（含 API Key、黑名单、排除图片等）
        sfp = _os.path.join(py_dir, "..", "settings.json")
        if not _os.path.isfile(sfp):
            sfp = _os.path.join(py_dir, "settings.json")
        if _os.path.isfile(sfp):
            try:
                with open(sfp, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                    for k in list(settings.keys()):
                        if "key" in k or "secret" in k or "token" in k: settings[k] = "***"
                    data["settings"] = settings
            except Exception:
                pass
        if "danbooru_favs" in part_set:
            try:
                from favorites import load_favorites
                data["danbooru_favorites"] = load_favorites()
            except Exception:
                try:
                    dfav = _os.path.join(py_dir, "..", "favorites.json")
                    if not _os.path.isfile(dfav):
                        dfav = _os.path.join(py_dir, "favorites.json")
                    if _os.path.isfile(dfav):
                        with open(dfav, "r", encoding="utf-8") as f:
                            data["danbooru_favorites"] = json.load(f)
                except Exception:
                    pass
        if "gelbooru_favs" in part_set:
            gfav = _os.path.join(py_dir, "..", "gelbooru_favorites.json")
            if _os.path.isfile(gfav):
                try:
                    with open(gfav, "r", encoding="utf-8") as f:
                        data["gelbooru_favorites"] = json.load(f)
                except Exception:
                    pass
        if "danbooru_favs" in part_set:
            dfav = _os.path.join(py_dir, "danbooru_favorites.json")
            if _os.path.isfile(dfav):
                try:
                    with open(dfav, "r", encoding="utf-8") as f:
                        data["danbooru_favorites"] = json.load(f)
                except Exception:
                    pass
        if "tag_mappings" in part_set:
            for fname in ["tag_mappings.json", "user_tag_patterns.json", "tag_groups.json"]:
                fp = _os.path.join(py_dir, fname)
                if _os.path.isfile(fp):
                    try:
                        with open(fp, "r", encoding="utf-8") as f:
                            data[fname.replace(".json", "")] = json.load(f)
                    except Exception:
                        pass
        return web.Response(
            body=json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
            content_type="application/json",
            headers={"Content-Disposition": "attachment; filename=danbooru_anima_export.json"}
        )

    print("[Gelbooru] API 路由已注册")


# ── 节点映射 ─────────────────────────────────────────

NODE_CLASS_MAPPINGS = {"GelbooruBrowser": GelbooruBrowser}
NODE_DISPLAY_NAME_MAPPINGS = {"GelbooruBrowser": "G站浏览器 (Gelbooru Browser)"}
