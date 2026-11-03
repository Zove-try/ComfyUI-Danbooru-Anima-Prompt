"""
节点②：Tag Classifier
接收原始标签字符串，按 category 分类输出到子类端口
支持用户手动映射（user_tag_mappings.json 覆盖官方分类）
"""
import re
import json
import os
from .tag_utils import get_tag_categories_batch, classify_tags


def _my_dir():
    return os.path.dirname(os.path.abspath(__file__))


def _load_tag_groups():
    fp = os.path.join(_my_dir(), "tag_groups.json")
    if not os.path.isfile(fp):
        return {}, {}, {}
    try:
        with open(fp, "r", encoding="utf-8") as f:
            d = json.load(f)
        return (
            d.get("tag_to_groups") or {},
            d.get("group_to_tags") or {},
            d.get("group_bucket") or {},
        )
    except Exception:
        return {}, {}, {}


def _load_user_mappings():
    fp = os.path.join(_my_dir(), "user_tag_mappings.json")
    if not os.path.isfile(fp):
        return {}
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


SUB_CATS = {
    "body_features": {"hair", "hair_color", "hair_styles", "eyes_tags", "skin_color", "body_parts"},
    "clothing": {"attire", "legwear", "handwear", "headwear"},
    "pose": {"posture", "gestures"},
    "expression": {"face_tags"},
    "background": {"backgrounds"},
    "accessories": {"accessories"},
    "other": {"image_composition", "lighting", "patterns", "visual_aesthetic", "colors", "focus_tags"},
}
ALL_SUB_KEYS = list(SUB_CATS.keys())

# nudity / covering 页里混有身体暴露标签。只有服装组只剩这两页、
# 同时又落在具体身体组里时，身体组优先。
_BROAD_CLOTHING_GROUPS = {"nudity", "covering"}
_ANATOMY_GROUPS = {
    "breasts_tags", "shoulders", "body_parts", "ass", "ears_tags",
    "feet", "skin_color", "wings", "injury", "tail", "penis",
    "nose", "eyebrows",
}


def _bucket_map(group_bucket):
    if group_bucket:
        return group_bucket
    built = {}
    for bucket, names in SUB_CATS.items():
        for name in names:
            built[name] = bucket
    return built


def _pick_bucket(groups, bucket_of):
    by_bucket = {}
    for group in groups:
        bucket = bucket_of.get(group)
        if not bucket or bucket not in ALL_SUB_KEYS:
            continue
        by_bucket.setdefault(bucket, set()).add(group)
    if "expression" in by_bucket:
        return "expression"
    if "pose" in by_bucket:
        return "pose"
    if "accessories" in by_bucket:
        return "accessories"
    if "clothing" in by_bucket and "body_features" in by_bucket:
        clothing_groups = by_bucket["clothing"]
        body_groups = by_bucket["body_features"]
        if clothing_groups <= _BROAD_CLOTHING_GROUPS and (body_groups & _ANATOMY_GROUPS):
            return "body_features"
        return "clothing"
    if "clothing" in by_bucket:
        return "clothing"
    if "body_features" in by_bucket:
        return "body_features"
    if "background" in by_bucket:
        return "background"
    if "other" in by_bucket:
        return "other"
    return None


# 标签后缀 → 子类映射
_SUFFIX_RULES = [
    (["_hair", "_haired", "twintails", "ponytail", "ahoge", "bangs",
      "_eyes", "_eyebrow", "_eyelash",
      "_ear", "_ears", "_nose", "_lip", "_lips", "_tongue",
      "_breast", "_breasts", "_nipple", "_nipples",
      "_hand", "_hands", "_finger", "_fingers", "_arm", "_arms",
      "_foot", "_feet", "_leg", "_legs", "_thigh", "_thighs",
      "_skin", "_tail", "_wing", "_wings", "_horn", "_horns",
      "_cheek", "_chin", "_neck", "_waist", "_hip", "_hips",
      "_belly", "_navel", "_abs", "_muscle", "_muscles",
      "_fur", "_scales", "_fin", "_tentacle", "_tentacles"], "body_features"),
    (["_shirt", "_skirt", "_dress", "_boots", "_sleeves", "_necktie", "_collar",
      "_uniform", "_socks", "_stockings", "_pants", "_shorts", "_gloves",
      "_ribbon", "_jacket", "_coat", "_cape", "_hat", "_scarf", "_belt",
      "_bow", "_apron", "_shoe", "_sandals", "_loafers", "_heels",
      "_thighhighs", "_pantyhose", "_choker", "_bracelet", "_ring",
      "_trim", "_lace", "_frill", "_bowtie"], "clothing"),
    (["_pose", "sitting", "standing", "lying", "kneeling", "crouching",
      "spread_legs", "leg_up", "arms_up", "hand_up", "hands_up",
      "pointing", "waving", "gesture", "from_side", "from_behind",
      "from_above", "from_below", "full_body", "crotch_up"], "pose"),
    (["smile", "smirk", "frown", "pout", "blush", "angry", "sad",
      "happy", "teeth", "tongue_out", "open_mouth", "closed_mouth",
      "tear", "crying", "expressionless", "excited", "surprised",
      "embarrassed", "annoyed", "disgust"], "expression"),
    (["_background", "outdoors", "indoor", "night", "day", "sunset",
      "cityscape", "nature", "beach", "forest", "room", "street",
      "simple_background", "white_background", "gradient_background",
      "cloud", "sky"], "background"),
    (["_ornament", "_band", "_glass", "_glasses", "_headphone",
      "_headset", "_ribbon", "_pin", "_brooch", "sunglasses"], "accessories"),
]


def _pattern_match(tag):
    t = tag.lower()
    for suffixes, cat in _SUFFIX_RULES:
        for sfx in suffixes:
            if t == sfx or t.endswith("_" + sfx) or t.endswith(sfx):
                return cat
    return None


def _load_pattern_rules():
    fp = os.path.join(_my_dir(), "user_tag_patterns.json")
    if not os.path.isfile(fp):
        return {}
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def classify_general(tags):
    tag_to_groups, _group_to_tags, group_bucket = _load_tag_groups()
    bucket_of = _bucket_map(group_bucket)
    user_map = _load_user_mappings()
    pattern_rules = _load_pattern_rules()
    result = {k: [] for k in ALL_SUB_KEYS}
    uncategorized = []
    for tag in tags:
        if tag in user_map:
            cat = user_map[tag]
            if cat in result:
                result[cat].append(tag)
            else:
                uncategorized.append(tag)
            continue

        # 批量模式规则：tag 包含 keyword → 归入对应分类
        matched = False
        if pattern_rules:
            t_lower = tag.lower()
            for keyword, cat in pattern_rules.items():
                if keyword in t_lower and cat in result:
                    result[cat].append(tag)
                    matched = True
                    break
        if matched:
            continue
        picked = _pick_bucket(tag_to_groups.get(tag, []), bucket_of)
        if picked:
            result[picked].append(tag)
            continue
        cat = _pattern_match(tag)
        if cat:
            result[cat].append(tag)
        else:
            uncategorized.append(tag)
    return result, uncategorized


def re_split_tags(text):
    parts = re.split(r'[,，、\n]+', text)
    result = []
    for part in parts:
        for token in part.strip().split():
            token = token.strip()
            if token:
                result.append(token)
    return result


class DanbooruTagClassifier:
    """标签分类器：输入原始标签 → 自动查 category → 按 Anima 结构分到子类"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "原始标签": ("STRING", {
                    "multiline": True, "default": "",
                    "placeholder": "输入标签，用逗号或空格分隔"
                }),
                "分类模式": (["D站模式", "G站模式"], {"default": "D站模式"}),
            },
            "optional": {
                "启用API查询": ("BOOLEAN", {"default": True}),
                "使用本地数据库": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = (
        "STRING", "STRING", "STRING", "STRING", "STRING", "STRING",
        "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING",
    )
    RETURN_NAMES = (
        "全部标签", "质量/元标签", "计数标签", "角色标签",
        "系列标签", "画师标签",
        "身体特征标签", "服装标签", "姿势标签",
        "表情标签", "背景标签", "配饰标签",
        "其他标签",
        "未分类标签",
    )
    FUNCTION = "classify"
    CATEGORY = "Danbooru Anima"

    def classify(self, 原始标签="", 分类模式="D站模式", 启用API查询=True, 使用本地数据库=True):
        if not 原始标签 or not 原始标签.strip():
            return ("",) * 14

        tags = re_split_tags(原始标签)
        is_gel = 分类模式 in ("G站模式", "Gelbooru")

        category_map = {}
        if is_gel:
            # G站模式：本地 gelbooru_tags.csv + 可选 API
            try:
                from . import tag_db
                category_map = tag_db.batch_lookup(tags, source="gelbooru")
                if 启用API查询:
                    remaining = [t for t in tags if t not in category_map]
                    if remaining:
                        from .gelbooru_api import get_tags_batch
                        api = get_tags_batch(remaining)
                        category_map.update(api)
            except Exception:
                pass
        elif 启用API查询 and tags:
            try:
                category_map = get_tag_categories_batch(tags, use_local_db=使用本地数据库)
            except Exception:
                pass

        base = classify_tags(tags, category_map)

        if is_gel:
            from .gelbooru_browser import classify_general_gelbooru
            sub, uncategorized = classify_general(base.get("general", []))
            if uncategorized:
                gel_sub, gel_left = classify_general_gelbooru(uncategorized)
                for key in ALL_SUB_KEYS:
                    sub[key].extend(gel_sub.get(key, []))
                uncategorized = gel_left
        else:
            sub, uncategorized = classify_general(base.get("general", []))

        return (
            ", ".join(base.get("all", [])),
            ", ".join(base.get("quality_meta", [])),
            ", ".join(base.get("count", [])),
            ", ".join(base.get("character", [])),
            ", ".join(base.get("series", [])),
            ", ".join(base.get("artist", [])),
            ", ".join(sub.get("body_features", [])),
            ", ".join(sub.get("clothing", [])),
            ", ".join(sub.get("pose", [])),
            ", ".join(sub.get("expression", [])),
            ", ".join(sub.get("background", [])),
            ", ".join(sub.get("accessories", [])),
            ", ".join(sub.get("other", [])),
            ", ".join(uncategorized),
        )


NODE_CLASS_MAPPINGS = {"DanbooruTagClassifier": DanbooruTagClassifier}
NODE_DISPLAY_NAME_MAPPINGS = {"DanbooruTagClassifier": "🏷 标签分类器 (Tag Classifier)"}
