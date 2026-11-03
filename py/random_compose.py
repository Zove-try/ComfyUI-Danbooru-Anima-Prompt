"""
随机提示词抽卡引擎：人数签名对齐、单帖种子、槽位互斥、身份锁定。
供 AnimaRandomPrompt.run 与 /anima_random/compose 共用。
"""
import json
import os
import random
import re

from .tag_conflicts import (
    filter_conflicts, is_nsfw, get_trait_exclusions, is_excluded_by_traits,
    get_conflict_group, NSFW_POSTURE_SET, MALE_ORGANS, FEMALE_ORGANS,
    GENDER_NEUTRAL_ORGANS,
)

_DIR = os.path.dirname(os.path.abspath(__file__))

_POOL = {}
_GEL = {}

RANDOM_MAP = {
    "attire": ["attire"],
    "posture": ["posture", "gestures"],
    "expression": ["face_tags"],
    "background": ["backgrounds"],
    "accessories": ["accessories"],
    "lighting": ["lighting"],
    "visual": ["visual_aesthetic"],
    "body": ["body_parts", "skin_color"],
}

JUNK_TAGS = {
    "animated", "gif", "animated_gif", "video", "highres", "absurdres", "pixel_art",
    "everyone", "absolutely_everyone", "commentary", "english_text", "translated",
    "translation_request", "third-party_edit", "official_art", "scan", "comic",
    "multiple_views", "character_sheet", "sketch", "greyscale", "monochrome",
    "photo", "cosplay", "watermark", "signature", "artist_name", "twitter_username",
    "patreon_username", "mosaic_censoring", "censored", "uncensored", "text_focus",
    "speech_bubble", "4koma", "manga", "animated_png", "webm",
}

INTERACTION_TAGS = {
    "hug", "holding_hands", "kissing", "kiss", "french_kiss", "princess_carry",
    "bridal_carry", "piggyback", "fighting", "back-to-back", "interlocked_fingers",
    "incoming_hug", "glomp", "carrying", "arm_around_waist", "arm_around_shoulder",
    "head_on_chest", "sitting_on_lap", "lap_pillow", "couple", "eye_contact",
    "facing_another", "holding_another", "grabbing", "shared_clothing",
    "hands_on_another's_face", "hand_on_another's_head", "cheek-to-cheek",
    "back-to-back", "forehead-to-forehead", "nuzzle", "spooning",
}

SHOT_TAGS = {
    "cowboy_shot", "full_body", "upper_body", "close-up", "portrait",
    "from_side", "from_behind", "from_above", "from_below", "dutch_angle",
    "wide_shot", "feet_out_of_frame", "profile", "three_quarter_view",
}

GESTURE_MUTEX = [
    ["arms_up", "arm_up", "arms_behind_head"],
    ["arms_crossed", "arm_crossed"],
    ["arms_behind_back"],
    ["hand_on_hip", "hands_on_hips"],
    ["hands_in_pockets"],
    ["waving", "wave"],
]

EXPR_MUTEX = [
    ["smile", "grin", "smirk", "smiling", ":d", ":)", "^_^"],
    ["crying", "tears", "sad", "frown", "streaming_tears"],
    ["angry", "anger", "scowl", "annoyed"],
    ["neutral", "expressionless", "blank_stare"],
    ["open_mouth", ":o", ":o"],
]

BG_MUTEX = [
    ["indoors", "bedroom", "classroom", "kitchen", "bathroom", "office", "hallway", "library", "cafe"],
    ["outdoors", "street", "city", "sky", "forest", "mountain", "field", "park"],
    ["beach", "ocean", "water", "pool", "seaside"],
    ["simple_background", "white_background", "grey_background", "gradient_background"],
]

BG_KEEP = (
    "background", "indoors", "outdoors", "sky", "cloud", "night", "day", "sunset",
    "sunrise", "beach", "ocean", "water", "forest", "tree", "city", "street",
    "building", "room", "bedroom", "kitchen", "bathroom", "classroom", "school",
    "library", "cafe", "garden", "park", "rooftop", "window", "scenery",
    "landscape", "mountain", "snow", "rain", "star", "moon", "field", "grass",
    "onsen", "hot_spring", "shrine", "temple", "castle", "bridge", "train",
    "station", "office", "hallway", "door", "wall", "bokeh", "night_sky",
)

LIGHT_KEEP = (
    "light", "lighting", "shade", "shadow", "sun", "backlight", "cinematic",
    "dark", "neon", "lamp", "glow", "rim_light", "daylight", "moonlight",
    "spotlight", "overcast", "volumetric", "god_rays", "lens_flare",
)

IDENTITY_SUFFIX = (
    "hair", "haired", "eyes", "pupils", "skin", "ears", "tail", "tails",
    "horns", "horn", "wings", "fang", "fangs", "whiskers", "antennae",
)
IDENTITY_EXACT = {
    "heterochromia", "ahoge", "bangs", "blunt_bangs", "sidelocks", "twintails",
    "ponytail", "braid", "braids", "long_hair", "short_hair", "medium_hair",
    "very_long_hair", "absurdly_long_hair", "hair_between_eyes", "messy_hair",
    "animal_ears", "cat_ears", "fox_ears", "dog_ears", "rabbit_ears",
    "pointy_ears", "elf_ears", "cat_tail", "fox_tail", "demon_horns",
    "halo", "colored_skin", "dark_skin", "pale_skin", "mole", "freckles",
    "scar", "eyepatch", "glasses", "loli", "shota", "mature_female",
}
CLOTHING_KW = (
    "skirt", "dress", "pants", "jeans", "shorts", "shirt", "blouse", "jacket",
    "coat", "hoodie", "sweater", "vest", "socks", "shoes", "boots", "sandals",
    "hat", "cap", "uniform", "kimono", "yukata", "swimsuit", "bikini",
    "pantyhose", "thighhighs", "kneehighs", "gloves", "scarf", "tie", "bowtie",
    "apron", "cape", "cloak", "armor", "leotard", "bodysuit", "jumpsuit",
    "robe", "serafuku", "sailor", "footwear", "barefoot", "sneakers",
)
POSE_KW = (
    "standing", "sitting", "lying", "kneeling", "seiza", "wariza", "all_fours",
    "looking_at", "looking_to", "looking_back", "looking_away", "looking_up",
    "looking_down", "arms_", "arm_up", "hand_on", "hands_", "holding",
    "on_back", "on_stomach", "on_side", "leaning", "walking", "running",
    "jumping", "floating", "from_behind", "contrapposto",
)
EXPR_KW = (
    "smile", "grin", "smirk", "blush", "crying", "tears", "angry", "open_mouth",
    "closed_eyes", "closed_mouth", "expressionless", "frown", "tongue", "wink",
    "one_eye_closed", "wide-eyed", "naughty_face", "embarrassed",
)

TOP_KW = (
    "shirt", "blouse", "jacket", "coat", "hoodie", "sweater", "vest", "cardigan",
    "tank_top", "crop_top", "t-shirt", "tshirt", "serafuku", "sailor_collar",
    "uniform", "hoodie", "blazer", "camisole", "tube_top",
)
SOCK_KW = ("socks", "pantyhose", "thighhighs", "kneehighs", "barefoot", "bare_legs", "tights", "stockings")
SHOE_KW = ("shoes", "boots", "sandals", "sneakers", "heels", "loafers", "slippers", "footwear")
HEAD_KW = ("hat", "cap", "beret", "hood", "headwear", "hair_ornament", "hairband", "headband")


def _norm(tag):
    return (tag or "").strip().lower().replace(" ", "_")


def _disp(tag):
    t = (tag or "").strip()
    if not t:
        return t
    tl = t.lower()
    if tl.startswith(("score_", "rating_", "source_", "year_")):
        return t.replace(" ", "_")
    return t.replace("_", " ")


def _parse_tag_list(text):
    if not text or not str(text).strip():
        return []
    return [t.strip() for t in re.split(r"[,，、\n]+", str(text)) if t.strip()]


def _get_pool():
    global _POOL
    if _POOL:
        return _POOL
    fp = os.path.join(_DIR, "tag_groups.json")
    if os.path.isfile(fp):
        with open(fp, "r", encoding="utf-8") as f:
            _POOL = json.load(f).get("group_to_tags", {})
    return _POOL


def _load_gel():
    global _GEL
    if _GEL:
        return _GEL
    fp = os.path.join(_DIR, "g_context.json")
    if os.path.isfile(fp):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                _GEL = json.load(f)
        except Exception:
            _GEL = {}
    return _GEL


def parse_characters(characters_json):
    chars = []
    try:
        raw = json.loads(characters_json) if characters_json and str(characters_json).strip() else []
    except Exception:
        raw = []
    if not isinstance(raw, list):
        return chars
    for r in raw:
        if not isinstance(r, dict):
            continue
        nm = str(r.get("name", "")).strip()
        if not nm:
            continue
        traits = _parse_tag_list(r.get("traits", ""))
        gender = str(r.get("gender") or "").strip().lower()
        if gender not in ("girl", "boy", "other", "unknown"):
            gender = infer_gender_from_tags(traits + _parse_tag_list(r.get("tags", "")))
        chars.append({
            "name": nm,
            "series": str(r.get("series", "")).strip(),
            "traits": traits,
            "gender": gender,
        })
    return chars


def infer_gender_from_tags(tags):
    blob = " ".join(_norm(t) for t in tags)
    if re.search(r"(^|_)1boy($|_)", blob) or "male_focus" in blob:
        return "boy"
    if re.search(r"(^|_)1other($|_)", blob):
        return "other"
    if re.search(r"(^|_)1girl($|_)", blob) or "female_focus" in blob:
        return "girl"
    return "unknown"


def parse_count_signature(count_tags, chars):
    """人数签名。用户下拉优先；空则从角色卡推断。未知性别当女孩。"""
    g = b = o = 0
    user_set = bool(count_tags and str(count_tags).strip())
    text = (count_tags or "").strip().lower()
    if user_set:
        if "multiple" in text:
            g = 5
        elif text == "solo":
            g = 1
        else:
            for tok in re.split(r"[,，\s]+", text):
                tok = tok.replace(" ", "_").strip("_")
                if not tok:
                    continue
                m = re.match(r"^(\d+)_?(girls?|boys?|others?)$", tok)
                if not m:
                    continue
                n = int(m.group(1))
                k = m.group(2)
                if k.startswith("girl"):
                    g += n
                elif k.startswith("boy"):
                    b += n
                else:
                    o += n
        if g + b + o == 0:
            user_set = False
    if not user_set:
        for ch in chars:
            gd = ch.get("gender") or "unknown"
            if gd == "boy":
                b += 1
            elif gd == "other":
                o += 1
            else:
                g += 1
        if g + b + o == 0:
            g = 1
    people = g + b + o
    display_parts = []
    if g == 1:
        display_parts.append("1girl")
    elif g > 1:
        display_parts.append("%dgirls" % g)
    if b == 1:
        display_parts.append("1boy")
    elif b > 1:
        display_parts.append("%dboys" % b)
    if o == 1:
        display_parts.append("1other")
    elif o > 1:
        display_parts.append("%dothers" % o)
    if text == "solo" and people == 1 and g == 1 and b == 0:
        display = "solo"
    else:
        display = ", ".join(display_parts) or "1girl"
    pool_parts = []
    if b:
        pool_parts.append("1boy" if b == 1 else "%dboys" % b)
    if g:
        pool_parts.append("1girl" if g == 1 else "%dgirls" % g)
    if o:
        pool_parts.append("1other" if o == 1 else "%dothers" % o)
    pool_key = "_".join(pool_parts) or "1girl"
    return {
        "girls": g, "boys": b, "others": o, "people": people,
        "display": display, "pool_key": pool_key,
    }


def classify_trait(tag):
    t = _norm(tag)
    if t in IDENTITY_EXACT:
        return "identity"
    for sfx in IDENTITY_SUFFIX:
        if t == sfx or t.endswith("_" + sfx):
            return "identity"
    if any(k in t for k in EXPR_KW) or t in EXPR_KW:
        return "expression"
    if any(k in t for k in POSE_KW):
        return "pose"
    if any(k in t for k in CLOTHING_KW) or get_conflict_group(t, "下装") >= 0:
        return "clothing"
    return "other"


def split_traits(traits, people, outfit_mode, identity_lock):
    """
    outfit_mode: 0=auto, 1=keep clothes, 2=change clothes
    auto: 2+ 人保留原装；单人换装。
    """
    change = (outfit_mode == 2) or (outfit_mode == 0 and people <= 1)
    keep_clothes = not change
    identity, clothing, pose_expr, other = [], [], [], []
    for tr in traits:
        kind = classify_trait(tr)
        if kind == "identity":
            identity.append(tr)
        elif kind == "clothing":
            clothing.append(tr)
        elif kind in ("pose", "expression"):
            pose_expr.append(tr)
        else:
            other.append(tr)
    kept = list(identity) + list(other)
    if keep_clothes:
        kept.extend(clothing)
    stripped = list(pose_expr)
    if not keep_clothes:
        stripped.extend(clothing)
    if not identity_lock:
        pass
    return {
        "identity": identity,
        "clothing": clothing,
        "pose_expr": pose_expr,
        "other": other,
        "kept": kept,
        "stripped": stripped,
        "change_clothes": change,
        "keep_clothes": keep_clothes,
    }


def _is_junk(tag):
    t = _norm(tag)
    if t in JUNK_TAGS:
        return True
    if t.endswith("_censor") or t.endswith("_censoring"):
        return True
    return False


def _clean_list(tags, nsfw_mode):
    out, seen = [], set()
    for t in tags or []:
        tu = _norm(t)
        if not tu or tu in seen or _is_junk(tu):
            continue
        nsfw = is_nsfw(tu)
        if nsfw_mode == 0 and nsfw:
            continue
        if nsfw_mode == 2 and not nsfw:
            continue
        seen.add(tu)
        out.append(tu)
    return out


def _same_cast_keys(pool_key):
    if pool_key in ("1girl", "solo"):
        return ["1girl", "solo"]
    return [pool_key]


def pick_seed_post(pool_key, nsfw_mode, rng, context_random):
    gel = _load_gel()
    warning = ""
    posts = []
    used_key = pool_key
    if context_random:
        for k in _same_cast_keys(pool_key):
            bucket = gel.get(k) or []
            if bucket:
                posts = bucket
                used_key = k
                break
        if not posts:
            warning = "本人数没有语境，已用本地槽位"
    if not posts:
        return None, used_key, warning
    if nsfw_mode == 0:
        cand = [p for p in posts if p.get("rating") == "general"]
    elif nsfw_mode == 2:
        cand = [p for p in posts if p.get("rating") in ("explicit", "questionable")]
    else:
        cand = list(posts)
    if not cand:
        cand = list(posts)
    post = rng.choice(cand)
    seed = {}
    for cat in ("attire", "posture", "expression", "background", "accessories", "lighting", "visual"):
        seed[cat] = _clean_list(post.get(cat, []), nsfw_mode)
    seed["rating"] = post.get("rating") or ""
    return seed, used_key, warning


def _mutex_pick(tags, groups, keep_extra=()):
    """每组最多留 1 个；未入组的可按 keep_extra 保留。"""
    chosen = []
    used = set()
    extra = []
    for t in tags:
        tu = _norm(t)
        hit = None
        for i, grp in enumerate(groups):
            if any(tu == g or tu.endswith("_" + g) or g in tu for g in grp):
                hit = i
                break
        if hit is None:
            extra.append(tu)
            continue
        if hit in used:
            continue
        used.add(hit)
        chosen.append(tu)
    if keep_extra:
        for t in extra:
            if t in keep_extra or any(k in t for k in keep_extra):
                chosen.append(t)
    return chosen


def _local_candidates(category, exclude, nsfw_mode, trait_exclusions):
    pool = _get_pool()
    out, seen = [], set()
    for g in RANDOM_MAP.get(category, []):
        for t in pool.get(g, []):
            if t == "tag_groups":
                continue
            tu = _norm(t)
            if tu in seen or tu in exclude or _is_junk(tu):
                continue
            if trait_exclusions and is_excluded_by_traits(tu, trait_exclusions):
                continue
            nsfw = is_nsfw(tu)
            if nsfw_mode == 0 and nsfw:
                continue
            if nsfw_mode == 2 and not nsfw:
                continue
            seen.add(tu)
            out.append(tu)
    if nsfw_mode >= 1 and category == "posture":
        for t in NSFW_POSTURE_SET:
            tu = _norm(t)
            if tu in seen or tu in exclude:
                continue
            if trait_exclusions and is_excluded_by_traits(tu, trait_exclusions):
                continue
            seen.add(tu)
            out.append(tu)
    return out


def _pick_n(cands, n, rng, exclude, extra_mutex_fn=None):
    if n <= 0 or not cands:
        return []
    avail = [t for t in cands if _norm(t) not in exclude]
    rng.shuffle(avail)
    chosen = []
    for t in avail:
        if len(chosen) >= n:
            break
        if extra_mutex_fn and extra_mutex_fn(chosen, t):
            continue
        chosen.append(t)
    return chosen


def _attire_kind(tag):
    t = _norm(tag)
    g = get_conflict_group(t, "下装")
    if g == 3:
        return "onesie"
    if g == 4:
        return "swimsuit"
    if g >= 0:
        return "bottom"
    if any(k in t for k in SOCK_KW):
        return "socks"
    if any(k in t for k in SHOE_KW):
        return "shoes"
    if any(k in t for k in HEAD_KW):
        return "head"
    if any(k in t for k in TOP_KW):
        return "top"
    return "other"


def slot_attire(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions, people, change_clothes):
    if not change_clothes:
        return []
    tags = [t for t in (seed_tags or []) if _norm(t) not in exclude and not _is_junk(t)]
    tags, _ = filter_conflicts(tags, "下装", max_per_group=2)
    tags, _ = filter_conflicts(tags, "腿袜", max_per_group=2)
    slots = {"onesie": [], "swimsuit": [], "bottom": [], "top": [], "head": [], "socks": [], "shoes": [], "other": []}
    for t in tags:
        slots[_attire_kind(t)].append(t)
    picked = []
    if slots["onesie"]:
        picked.append(slots["onesie"][0])
        if slots["top"]:
            picked.append(slots["top"][0])
    elif slots["swimsuit"]:
        picked.append(slots["swimsuit"][0])
    else:
        if slots["top"]:
            picked.extend(slots["top"][:2])
        if slots["bottom"]:
            picked.append(slots["bottom"][0])
    if slots["head"]:
        picked.append(slots["head"][0])
    if slots["socks"]:
        picked.append(slots["socks"][0])
    if slots["shoes"]:
        picked.append(slots["shoes"][0])
    for t in slots["other"][:2]:
        if t not in picked:
            picked.append(t)
    cap = max(3, min(8, int(n) + 2))
    picked = picked[:cap]
    need_bottom = not any(_attire_kind(t) in ("onesie", "swimsuit", "bottom") for t in picked)
    need_top = not any(_attire_kind(t) in ("onesie", "swimsuit", "top") for t in picked)
    if need_bottom or need_top:
        local = _local_candidates("attire", exclude | {_norm(x) for x in picked}, nsfw_mode, trait_exclusions)
        rng.shuffle(local)
        for t in local:
            kind = _attire_kind(t)
            if need_bottom and kind in ("onesie", "swimsuit", "bottom"):
                trial = picked + [t]
                trial, _ = filter_conflicts(trial, "下装")
                if t in trial or _norm(t) in {_norm(x) for x in trial}:
                    picked = trial
                    need_bottom = False
                    if kind in ("onesie", "swimsuit"):
                        need_top = False
            elif need_top and kind == "top":
                picked.append(t)
                need_top = False
            if not need_bottom and not need_top:
                break
    if people >= 2:
        picked, _ = filter_conflicts(picked, "下装", max_per_group=2)
    return picked[:cap]


def slot_posture(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions, people):
    tags = [t for t in (seed_tags or []) if _norm(t) not in exclude]
    if people <= 1:
        tags = [t for t in tags if _norm(t) not in INTERACTION_TAGS and not any(x in _norm(t) for x in ("holding_hands", "kiss"))]
    body, _ = filter_conflicts(tags, "姿势", max_per_group=1)
    body_pose = [t for t in body if get_conflict_group(t, "姿势") >= 0]
    gestures = _mutex_pick([t for t in tags if get_conflict_group(t, "姿势") < 0 and _norm(t) not in INTERACTION_TAGS], GESTURE_MUTEX)
    looks = [t for t in tags if _norm(t).startswith("looking_")]
    inter = [t for t in tags if _norm(t) in INTERACTION_TAGS] if people >= 2 else []
    picked = []
    if body_pose:
        picked.append(body_pose[0])
    if looks:
        picked.append(looks[0])
    max_n = max(1, min(4, int(n) + 1))
    if int(n) >= 2 and gestures:
        picked.append(gestures[0])
    if people >= 2 and inter:
        picked.append(inter[0])
    if not picked:
        local = _local_candidates("posture", exclude, nsfw_mode, trait_exclusions)
        if people <= 1:
            local = [t for t in local if _norm(t) not in INTERACTION_TAGS]
        def _pose_mutex(chosen, t):
            return get_conflict_group(t, "姿势") >= 0 and any(get_conflict_group(x, "姿势") >= 0 and get_conflict_group(x, "姿势") != get_conflict_group(t, "姿势") for x in chosen)
        picked = _pick_n(local, min(max_n, 2), rng, exclude, _pose_mutex)
    return picked[:max_n]


def slot_expression(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions):
    tags = [t for t in (seed_tags or []) if _norm(t) not in exclude]
    blush = [t for t in tags if "blush" in _norm(t)]
    core = _mutex_pick([t for t in tags if "blush" not in _norm(t)], EXPR_MUTEX)
    picked = core[:1]
    if int(n) >= 2 and blush:
        picked.append(blush[0])
    if not picked:
        local = _local_candidates("expression", exclude, nsfw_mode, trait_exclusions)
        picked = _pick_n(local, 1, rng, exclude)
    return picked[: max(1, min(3, int(n)))]


def slot_background(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions):
    tags = []
    for t in seed_tags or []:
        tu = _norm(t)
        if tu in exclude:
            continue
        if tu.endswith("_background") or any(k in tu for k in BG_KEEP):
            tags.append(tu)
    tags = _mutex_pick(tags, BG_MUTEX, keep_extra=("night", "day", "sunset", "rain", "snow", "star"))
    if not tags:
        local = _local_candidates("background", exclude, nsfw_mode, trait_exclusions)
        local = [t for t in local if t.endswith("_background") or any(k in t for k in BG_KEEP)]
        tags = _pick_n(local, min(2, max(1, int(n))), rng, exclude)
    return tags[: max(1, min(4, int(n) + 1))]


def slot_accessories(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions):
    tags = [t for t in (seed_tags or []) if _norm(t) not in exclude][: max(0, int(n))]
    if not tags and int(n) > 0:
        local = _local_candidates("accessories", exclude, nsfw_mode, trait_exclusions)
        tags = _pick_n(local, min(2, int(n)), rng, exclude)
    return tags[: max(0, min(4, int(n)))]


def slot_lighting(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions):
    tags = []
    for t in seed_tags or []:
        tu = _norm(t)
        if tu in exclude:
            continue
        if any(k in tu for k in LIGHT_KEEP):
            tags.append(tu)
    if not tags:
        local = _local_candidates("lighting", exclude, nsfw_mode, trait_exclusions)
        tags = _pick_n(local, 1, rng, exclude)
    return tags[: max(1, min(3, int(n)))]


def slot_visual(seed_tags, n, rng, exclude, nsfw_mode, trait_exclusions):
    tags = [t for t in (seed_tags or []) if _norm(t) in SHOT_TAGS and _norm(t) not in exclude]
    frame = {"cowboy_shot", "full_body", "upper_body", "close-up", "portrait", "wide_shot"}
    angle = {"from_side", "from_behind", "from_above", "from_below", "profile", "dutch_angle"}
    picked, got_f, got_a = [], False, False
    for t in tags:
        tu = _norm(t)
        if tu in frame and not got_f:
            picked.append(tu); got_f = True
        elif tu in angle and not got_a:
            picked.append(tu); got_a = True
    if not picked:
        local = [t for t in _local_candidates("visual", exclude, nsfw_mode, trait_exclusions) if t in SHOT_TAGS]
        picked = _pick_n(local, 1, rng, exclude)
    return picked[: max(1, min(2, int(n)))]


def _to_display(tags):
    out, seen = [], set()
    for t in tags or []:
        d = _disp(t)
        if d and d not in seen:
            seen.add(d)
            out.append(d)
    return out


def parse_roll(last_roll_json):
    if not last_roll_json or not str(last_roll_json).strip():
        return None
    try:
        data = json.loads(last_roll_json)
    except Exception:
        return None
    if not isinstance(data, dict) or not data.get("rolls"):
        return None
    return data


def apply_roll_flags(roll, roll_attire=True, roll_posture=True, roll_expression=True,
                     roll_background=False, roll_accessories=False,
                     roll_lighting=False, roll_visual=False, nsfw_mode=0):
    """出图时按当前维度开关裁剪，不改用户存下来的 last_roll。"""
    if not roll:
        return roll
    out = dict(roll)
    rolls = dict(out.get("rolls") or {})
    flags = {
        "attire": roll_attire, "posture": roll_posture, "expression": roll_expression,
        "background": roll_background, "accessories": roll_accessories,
        "lighting": roll_lighting, "visual": roll_visual,
    }
    for cat, on in flags.items():
        if not on:
            rolls[cat] = []
    if int(nsfw_mode or 0) != 2:
        rolls["body"] = []
    out["rolls"] = rolls
    return out


def compose_roll(
    characters_json="[]",
    nsfw_mode=0,
    context_random=True,
    roll_attire=True, roll_posture=True, roll_expression=True,
    roll_background=False, roll_accessories=False,
    roll_lighting=False, roll_visual=False,
    attire_n=1, posture_n=1, expression_n=1,
    background_n=1, accessories_n=1, lighting_n=1, visual_n=1,
    count_tags="1girl", custom_tags="",
    outfit_mode=0, identity_lock=True,
    keep_rolls=None, reroll_dim=None, rng=None,
):
    rng = rng or random.Random()
    nsfw_mode = max(0, min(2, int(nsfw_mode or 0)))
    outfit_mode = max(0, min(2, int(outfit_mode or 0)))
    identity_lock = bool(identity_lock if identity_lock is not None else True)
    chars = parse_characters(characters_json)
    sig = parse_count_signature(count_tags, chars)

    all_traits = []
    for ch in chars:
        all_traits.extend(ch.get("traits") or [])
    split = split_traits(all_traits, sig["people"], outfit_mode, identity_lock)

    exclude = set()
    for t in split["kept"]:
        exclude.add(_norm(t))
    for t in _parse_tag_list(custom_tags):
        exclude.add(_norm(t))
    for t in _parse_tag_list(sig["display"]):
        exclude.add(_norm(t))
    for ch in chars:
        for w in ch["name"].lower().split():
            if len(w) > 2:
                exclude.add(_norm(w))

    trait_exclusions = set()
    if identity_lock:
        trait_exclusions.update(get_trait_exclusions(split["identity"]))
    if split["keep_clothes"]:
        trait_exclusions.update(get_trait_exclusions(split["clothing"]))

    keep_rolls = keep_rolls if isinstance(keep_rolls, dict) else {}
    seed = keep_rolls.get("seed") if reroll_dim and keep_rolls.get("seed") else None
    warning = keep_rolls.get("warning") or ""
    source = keep_rolls.get("source") or ""
    if seed is None:
        seed, _used, warning = pick_seed_post(sig["pool_key"], nsfw_mode, rng, bool(context_random))
        source = "context" if seed else "local"

    flags = {
        "attire": roll_attire, "posture": roll_posture, "expression": roll_expression,
        "background": roll_background, "accessories": roll_accessories,
        "lighting": roll_lighting, "visual": roll_visual,
    }
    ns = {
        "attire": attire_n, "posture": posture_n, "expression": expression_n,
        "background": background_n, "accessories": accessories_n,
        "lighting": lighting_n, "visual": visual_n,
    }
    slotters = {
        "attire": lambda tags, n: slot_attire(tags, n, rng, exclude, nsfw_mode, trait_exclusions, sig["people"], split["change_clothes"]),
        "posture": lambda tags, n: slot_posture(tags, n, rng, exclude, nsfw_mode, trait_exclusions, sig["people"]),
        "expression": lambda tags, n: slot_expression(tags, n, rng, exclude, nsfw_mode, trait_exclusions),
        "background": lambda tags, n: slot_background(tags, n, rng, exclude, nsfw_mode, trait_exclusions),
        "accessories": lambda tags, n: slot_accessories(tags, n, rng, exclude, nsfw_mode, trait_exclusions),
        "lighting": lambda tags, n: slot_lighting(tags, n, rng, exclude, nsfw_mode, trait_exclusions),
        "visual": lambda tags, n: slot_visual(tags, n, rng, exclude, nsfw_mode, trait_exclusions),
    }

    prev_rolls = keep_rolls.get("rolls") if isinstance(keep_rolls.get("rolls"), dict) else {}
    rolls = {}
    for cat in ("attire", "posture", "expression", "background", "accessories", "lighting", "visual"):
        if not flags.get(cat):
            rolls[cat] = []
            continue
        if reroll_dim and cat != reroll_dim and prev_rolls.get(cat) is not None:
            rolls[cat] = [_norm(x) for x in prev_rolls.get(cat) or []]
            exclude.update(rolls[cat])
            continue
        seed_tags = (seed or {}).get(cat, [])
        chosen = slotters[cat](seed_tags, ns.get(cat, 1))
        rolls[cat] = chosen
        exclude.update(_norm(x) for x in chosen)

    if nsfw_mode == 2:
        has_boy = sig["boys"] > 0
        body = _pick_n(_local_candidates("body", exclude, 2, trait_exclusions), 2, rng, exclude)
        filtered = []
        for t in body:
            tu = _norm(t)
            if tu in GENDER_NEUTRAL_ORGANS:
                filtered.append(tu)
            elif has_boy and tu in MALE_ORGANS:
                filtered.append(tu)
            elif (not has_boy) and tu in FEMALE_ORGANS:
                filtered.append(tu)
            elif tu not in MALE_ORGANS and tu not in FEMALE_ORGANS:
                filtered.append(tu)
        rolls["body"] = filtered
    else:
        rolls["body"] = []

    disp_rolls = {k: _to_display(v) for k, v in rolls.items()}
    return {
        "display_count": sig["display"],
        "pool_key": sig["pool_key"],
        "people": sig["people"],
        "girls": sig["girls"],
        "boys": sig["boys"],
        "source": source,
        "warning": warning,
        "outfit_mode": outfit_mode,
        "identity_lock": identity_lock,
        "change_clothes": split["change_clothes"],
        "rolls": disp_rolls,
        "seed": {k: _to_display(v) if isinstance(v, list) else v for k, v in (seed or {}).items()},
        "identity_traits": _to_display(split["identity"]),
        "kept_clothing": _to_display(split["clothing"]) if split["keep_clothes"] else [],
        "stripped": _to_display(split["stripped"]),
    }


DEFAULT_QUALITY = "masterpiece, best quality, score_7, score_9, very aesthetic, ultra detailed"
NOOB_QUALITY = "masterpiece, best quality, newest, absurdres, highres"
AESTHETIC_QUALITY = "masterpiece, best quality, very aesthetic, ultra detailed"
_KEEP_UNDERSCORE_PREFIXES = ("score_", "rating_", "source_", "year_")


def format_tag_anima(tag):
    t = (tag or "").strip()
    if not t:
        return t
    is_weight = t.startswith("(") and t.endswith(")") and ":" in t
    tl = t.lower()
    keep = any(tl.startswith(p) for p in _KEEP_UNDERSCORE_PREFIXES)
    if not keep:
        t = t.replace("_", " ")
    if not is_weight:
        t = re.sub(r"(?<!\\)\(", r"\\(", t)
        t = re.sub(r"(?<!\\)\)", r"\\)", t)
    return t


def format_prompt_anima(text):
    if not text or not text.strip():
        return text
    return ", ".join(format_tag_anima(t) for t in text.split(",") if t.strip())


def format_prompt_noob(text):
    tags = re.split(r",\s*", text)
    result = []
    for t in tags:
        t = t.strip()
        if not t:
            continue
        tl = t.lower()
        keep = any(tl.startswith(p) for p in _KEEP_UNDERSCORE_PREFIXES)
        if not keep:
            t = t.replace("_", " ")
        result.append(t)
    return ", ".join(result)


def assemble_prompt(roll, characters_json="[]", artist_tags="", custom_tags="",
                    model_mode=0, outfit_mode=0, identity_lock=True):
    chars = parse_characters(characters_json)
    people = int((roll or {}).get("people") or max(1, len(chars) or 1))
    om = roll.get("outfit_mode", outfit_mode) if roll else outfit_mode
    il = roll.get("identity_lock", identity_lock) if roll else identity_lock
    all_traits = []
    for ch in chars:
        all_traits.extend(ch.get("traits") or [])
    split = split_traits(all_traits, people, om, il)
    display_count = (roll or {}).get("display_count") or parse_count_signature("", chars)["display"]
    rolls = (roll or {}).get("rolls") or {}
    random_parts = []
    for cat in ("attire", "posture", "expression", "background", "accessories", "lighting", "visual", "body"):
        random_parts.extend(rolls.get(cat) or [])
    artists_raw = _parse_tag_list(artist_tags)
    customs = _parse_tag_list(custom_tags)
    all_series = sorted({ch["series"] for ch in chars if ch.get("series")})
    names = [ch["name"] for ch in chars]
    quality = NOOB_QUALITY if model_mode == 1 else (AESTHETIC_QUALITY if model_mode == 2 else DEFAULT_QUALITY)
    kept = split["kept"]

    if model_mode == 1:
        raw_artists = [a.lstrip("@") for a in artists_raw]
        groups = []
        if display_count:
            groups.append(display_count)
        if names:
            groups.append(", ".join(names))
        if all_series:
            groups.append(", ".join(all_series))
        if raw_artists:
            groups.append(", ".join(raw_artists))
        gp = list(dict.fromkeys(kept))
        if gp:
            groups.append(", ".join(sorted(gp)))
        if random_parts:
            groups.append(", ".join(random_parts))
        if customs:
            groups.append(", ".join(customs))
        groups.append(quality)
        return format_prompt_noob(", ".join(g for g in groups if g and str(g).strip()))

    raw_artists = [a if a.startswith("@") else "@" + a for a in artists_raw]
    groups = [quality]
    if display_count:
        groups.append(display_count)
    if names:
        groups.append(", ".join(names))
    if all_series:
        groups.append(", ".join(sorted(all_series)))
    if raw_artists:
        groups.append(", ".join(raw_artists))
    all_gp = list(dict.fromkeys(kept))
    all_gp.extend(random_parts)
    all_gp.extend(customs)
    if all_gp:
        groups.append(", ".join(all_gp))
    return format_prompt_anima(", ".join(groups))
