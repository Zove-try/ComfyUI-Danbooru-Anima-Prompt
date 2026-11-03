"""
标签互斥规则 + NSFW 黑名单
用于随机抽取时避免冲突标签同时出现
"""
import re


# ── 互斥规则 ──
# 每个互斥大类下有多个子组，同一大类下不同子组之间互斥
# 但同一子组内的标签不互斥（可共存，如 "pleated_skirt" + "miniskirt" 不会同时出现
# 因为我们每个维度只抽 N 个，N 越小冲突概率越低，此处做的是跨子组冲突检测）
#
# 规则格式: 大类名 → [子组1, 子组2, ...]
# 子组格式: (显示名, [关键词列表]) — 标签包含任一关键词即归入该子组

CONFLICT_GROUPS = {
    "下装": [
        # 每个子组之间互斥，同一子组内部不互斥
        ("裙装", ["skirt", "hakama_skirt", "kimono_skirt", "overskirt", "crinoline", "petticoat"]),
        ("裤装", ["pants", "jeans", "hakama_pants", "sweatpants", "yoga_pants", "capri_pants",
                  "bell-bottoms", "trousers", "slacks", "chinos", "denim"]),
        ("短裤", ["shorts", "bloomers", "buruma", "hotpants"]),
        ("连衣/旗袍", ["dress", "china_dress", "ao_dai", "qipao", "cheongsam", "robe",
                    "jumpsuit", "romper", "leotard", "bodysuit", "unitard", "nightgown",
                    "kimono", "yukata", "hakama", "hanfu", "hanbok", "sari"]),
        ("泳装", ["swimsuit", "bikini", "tankini", "legskin", "jammers", "swim_briefs",
                  "school_swimsuit", "slingshot_swimsuit", "competition_swimsuit"]),
    ],
    "腿袜": [
        ("连裤袜", ["pantyhose", "leggings", "bodystocking", "tights", "stockings"]),
        ("长裤/牛仔裤", ["jeans", "pants", "sweatpants", "denim", "trousers", "slacks",
                      "yoga_pants", "capri_pants", "bell-bottoms"]),
    ],
    "姿势": [
        ("站立", ["standing", "standing_on_one_leg"]),
        ("坐姿", ["sitting", "seiza", "indian_style", "wariza", "yokozuwari"]),
        ("躺姿", ["lying", "on_back", "on_stomach", "on_side", "fetal_position", "spread_eagle"]),
        ("跪姿", ["kneeling", "on_one_knee", "all_fours", "dogeza"]),
    ],
}


def _tag_matches_any(tag, keywords):
    """tag 是否包含任一关键词（下划线/空格不敏感）"""
    t = tag.lower().replace(" ", "_")
    for kw in keywords:
        if kw in t:
            return True
    return False


def get_conflict_group(tag, group_name):
    """返回 tag 在指定大类中所属的子组索引，-1 表示不属于任何子组"""
    groups = CONFLICT_GROUPS.get(group_name, [])
    for idx, (_label, keywords) in enumerate(groups):
        if _tag_matches_any(tag, keywords):
            return idx
    return -1


def check_conflicts(selected_tags, new_tag, group_name="下装"):
    """
    检查 new_tag 是否与 selected_tags 中已有的标签冲突。
    返回 True 表示冲突（不应添加），False 表示不冲突。
    """
    new_group = get_conflict_group(new_tag, group_name)
    if new_group < 0:
        return False
    for existing in selected_tags:
        existing_group = get_conflict_group(existing, group_name)
        if existing_group >= 0 and existing_group != new_group:
            return True  # 不同子组 → 冲突
    return False


def filter_conflicts(tag_list, group_name="下装", max_per_group=3):
    """
    从 tag_list 中选出不冲突的标签子集。
    返回 (accepted, rejected) 两个列表。
    """
    accepted = []
    rejected = []
    group_counts = {}  # 每个子组已选数量
    for tag in tag_list:
        g = get_conflict_group(tag, group_name)
        if g < 0:
            accepted.append(tag)
            continue
        # 检查是否与已接受的标签跨子组冲突
        conflict = False
        for existing_idx in group_counts:
            if existing_idx != g and group_counts[existing_idx] > 0:
                conflict = True
                break
        if conflict:
            rejected.append(tag)
            continue
        # 检查子组数量限制
        if group_counts.get(g, 0) >= max_per_group:
            rejected.append(tag)
            continue
        accepted.append(tag)
        group_counts[g] = group_counts.get(g, 0) + 1
    return accepted, rejected


# ── NSFW 姿势补充（tag_groups.json 里几乎没有 NSFW 姿势分类） ──
# 在 nsfw_mode=2 时作为 posture 候选池的追加项
NSFW_POSTURE_SUPPLEMENT = [
    "cowgirl_position", "reverse_cowgirl", "missionary", "doggy_style",
    "full_nelson", "mating_press", "standing_sex", "pile_driver",
    "double_penetration", "frottage", "paizuri", "fellatio",
    "spread_eagle", "spread_legs", "legs_apart", "legs_up",
    "all_fours", "dogeza", "on_back", "on_stomach",
    "fetal_position", "face_sitting", "69_position",
    "suspension", "arms_tied", "legs_tied", "wrists_tied",
    "bent_over", "presenting", "presenting_hindquarters",
    "arched_back", "back_arch", "hair_pull", "choking",
    "breast_smothering", "thigh_sex", "footjob",
    "handjob", "blowjob", "deep_kiss", "tongue_kiss",
    "groping", "fondling", "breast_grab", "ass_grab",
    "crotch_grab", "hand_on_breast", "hand_on_thigh",
    "nipple_tweak", "nipple_pinch", "nipple_pull",
    "clothed_sex", "clothed_paizuri", "clothed_fellatio",
]
NSFW_POSTURE_SET = set(NSFW_POSTURE_SUPPLEMENT)

# ── 性别器官过滤 ──
MALE_ORGANS = {"penis","testicles","animal_penis","dog_penis","horse_penis","dolphin_penis",
               "knotted_penis","pig_penis","snake_penis","erection","bulge","crotch_tent",
               "no_pussy","precum","ejaculation","cum"}
FEMALE_ORGANS = {"pussy","vagina","clitoris","labia","cleft_of_venus","mons_pubis",
                 "fat_mons","cameltoe","pussy_juice","squirting","wet_pussy",
                 "no_penis","areolae","large_areolae","puffy_nipples","inverted_nipples",
                 "covered_nipples","glands_of_montgomery"}
GENDER_NEUTRAL_ORGANS = {"ass","anus","cloaca","breasts","nipples","groin",
                          "pubic_hair","dimples_of_venus","hip_dips","narrow_waist"}


# ── NSFW 黑名单 ──
# 这些标签在 nsfw_filter=True 时会被从随机池中排除

NSFW_BLACKLIST = {
    # 表情/动作 — 过于露骨
    "ahegao", "blowjob_face", "tentacle_molestation", "rape_face", "mind_break",
    "torture_face", "electric_shock_face",
    # 姿势
    "spread_legs", "cowgirl_position", "missionary", "reverse_cowgirl",
    "doggy_style", "full_nelson", "mating_press", "standing_sex",
    "double_penetration", "frottage", "paizuri", "fellatio",
    "piledriver", "dildo", "vibrator", "sex_toy", "onahole",
    "anal", "vaginal", "cum", "ejaculation", "precum",
    "pussy_juice", "squirting", "wet_pussy", "wet_clothes",
    "grope", "groping", "fondling", "breast_grab",
    "nipple_tweak", "nipple_pinch", "nipple_pull",
    "crotch_grab", "ass_grab", "hand_on_breast",
    # 服装/身体
    "completely_nude", "uncensored", "no_panties", "panties_around_one_leg",
    "panties_down", "panties_pulled_down", "panties_removed",
    "skirt_lift", "dress_lift", "upskirt", "downblouse",
    "underwear_only", "bottomless", "topless", "nipples",
    "areolae", "cameltoe", "crotch_tent", "bulge", "erection",
    "penis", "testicles", "pussy", "vagina", "clitoris",
    "ass_focus", "crotch_focus", "breast_focus", "pantyshot",
    "groin", "labia", "mons_pubis", "cleft_of_venus", "pubic_hair",
    "fat_mons", "anus", "cloaca", "animal_penis", "dog_penis",
    "horse_penis", "knotted_penis", "covered_nipples", "puffy_nipples",
    "see-through_clothes", "see-through_leotard", "see-through_raincoat",
    "naked_apron", "naked_ribbon", "naked_dress", "naked_sweater",
    "naked_cape", "naked_towel", "naked_shirt", "naked_jacket",
    "naked_coat", "naked_hoodie", "birthday_suit",
    "censored_art", "mosaic_censoring", "convenient_censoring",
    "heart_censoring", "bar_censor", "emaki_censor",
    # 关系暗示
    "slave", "master", "bound", "shackles", "handcuffs",
    "ball_gag", "gag", "chastity_belt", "leash", "collar_leash",
    "bondage", "shibari", "kinbaku", "suspension",
    "sex_machine", "milking_machine",
}

# NSFW 模糊模式（标签包含这些词根即视为 NSFW）
NSFW_PATTERNS = [
    r'_nude', r'_naked', r'_sex\b', r'_cum\b', r'_cum_', r'masturba',
    r'_penis', r'_pussy', r'_anal\b', r'_anal_', r'_dildo', r'_vibrator',
    r'_orgasm', r'_tentacle', r'_molest', r'_rape', r'_gangbang',
    r'_bondage', r'_shibari', r'_chastity', r'_fuck', r'_fetish',
    r'^cum_', r'^dildo_', r'^sex_',
]


def is_nsfw(tag):
    """判断单个标签是否为 NSFW"""
    t = tag.lower().replace(" ", "_")
    if t in NSFW_BLACKLIST:
        return True
    for pattern in NSFW_PATTERNS:
        if re.search(pattern, t):
            return True
    return False


def filter_nsfw(tag_list):
    """从标签列表中移除 NSFW 标签"""
    return [t for t in tag_list if not is_nsfw(t)]


# ── 角色特征冲突 ──
# 如果角色已有某些特征（如 *_hair, *_eyes, *_skirt），
# 随机时排除带相同后缀的标签

TRAIT_CONFLICT_PATTERNS = {
    # 角色特征后缀 → 随机时排除的后缀
    "skirt": ["skirt"],           # 角色有 skirt → 不再随机 skirt 类
    "dress": ["dress"],           # 角色有 dress → 不再随机 dress 类
    "pants": ["pants", "jeans"],  # 角色有 pants → 不再随机 pants/jeans
    "shorts": ["shorts"],
    "jeans": ["jeans", "pants"],
    "bikini": ["bikini", "swimsuit"],
    "swimsuit": ["swimsuit", "bikini"],
    "hair": ["hair", "haired"],           # 角色有 hair → 不随机发色/发型
    "eyes": ["eyes"],                     # 角色有 eyes → 不随机瞳色
    "hat": ["hat", "headwear", "headband"],
    "glasses": ["glasses", "sunglasses"],
    "headphones": ["headphones", "headset"],
    "boots": ["boots"],
    "gloves": ["gloves"],
    "scarf": ["scarf"],
    "jacket": ["jacket", "coat"],
    "coat": ["coat", "jacket"],
    "hoodie": ["hoodie", "hood"],
    "sweater": ["sweater"],
    "shirt": ["shirt"],
    "socks": ["socks", "kneehighs", "thighhighs"],
    "thighhighs": ["thighhighs", "kneehighs", "socks"],
    "kneehighs": ["kneehighs", "socks"],
}


def get_trait_exclusions(fixed_traits):
    """
    根据角色固定特征，返回随机时需排除的标签后缀列表。
    例如角色有 'aqua_hair' → 排除所有 '*_hair' 和 '*_haired'
    """
    exclusions = set()
    for trait in fixed_traits:
        t = trait.lower().replace(" ", "_")
        for suffix, exclude_suffixes in TRAIT_CONFLICT_PATTERNS.items():
            if t.endswith("_" + suffix) or t == suffix:
                exclusions.update(exclude_suffixes)
    return exclusions


def is_excluded_by_traits(tag, trait_exclusions):
    """tag 是否与角色特征冲突"""
    t = tag.lower().replace(" ", "_")
    for excl in trait_exclusions:
        if t.endswith("_" + excl) or t == excl:
            return True
    return False
