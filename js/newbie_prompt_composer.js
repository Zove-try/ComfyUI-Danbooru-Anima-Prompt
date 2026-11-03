// clampPopup：把弹窗限制在视口内（拖拽/恢复位置时调用，防止拖出页面卡死）
if (typeof window.clampPopup !== "function") {
    window.clampPopup = function(el) {
        try {
            const w = el.offsetWidth || 400, h = el.offsetHeight || 300;
            const m = 10;
            let L = parseInt(el.style.left) || 0, T = parseInt(el.style.top) || 0;
            const maxL = window.innerWidth - w - m, maxT = window.innerHeight - h - m;
            if (L < m) L = m;
            if (T < m) T = m;
            if (L > maxL) L = Math.max(m, maxL);
            if (T > maxT) T = Math.max(m, maxT);
            el.style.left = L + "px";
            el.style.top = T + "px";
        } catch(e) {}
    };
}


(function(){var _oldApcTh=document.getElementById("apc-composer-theme-v4");if(_oldApcTh)_oldApcTh.remove();if(document.getElementById("apc-composer-theme-v5"))return;var s=document.createElement("style");s.id="apc-composer-theme-v5";s.textContent=".apc-composer-panel{--ink:#ffffff;--mute:var(--anima-mute);--sage:var(--anima-accent-soft);--well:rgba(var(--anima-well-deep-rgb),.94);--glass:rgba(var(--anima-accent-hi-rgb),.18);--line:rgba(255,255,255,.28);--spec:inset 0 1px 0 rgba(255,255,255,.22);scrollbar-width:thin;scrollbar-color:var(--anima-accent) transparent;color:#fff;font-weight:600}.apc-composer-panel::-webkit-scrollbar{width:6px}.apc-composer-panel::-webkit-scrollbar-track{background:transparent}.apc-composer-panel::-webkit-scrollbar-thumb{background:var(--anima-accent);border-radius:8px}.apc-composer-panel input,.apc-composer-panel textarea,.apc-composer-panel select{transition:border-color .15s ease,box-shadow .15s ease;color-scheme:dark;background:var(--well)!important;border-color:rgba(var(--anima-accent-rgb),.5)!important;color:#fff!important;font-size:13px!important;font-weight:700!important;box-shadow:var(--spec)}.apc-composer-panel input:focus,.apc-composer-panel textarea:focus,.apc-composer-panel select:focus{border-color:var(--anima-accent)!important;box-shadow:0 0 0 2px rgba(var(--anima-accent-rgb),.38)}.apc-composer-panel input::placeholder,.apc-composer-panel textarea::placeholder{color:var(--anima-placeholder)!important;opacity:1;font-weight:600}.apc-composer-panel button{font-weight:700}";document.head.appendChild(s);})();
import { app } from "/scripts/app.js";
import "./00_anima_i18n.js";
window.__nbEmptyFn = function(){};
import { $el } from "/scripts/ui.js";
import "./00_anima_theme.js";

// ── NewBie 提示词创作器 ──
// ⚠️ 分类定义需与 py/newbie_prompt_composer.py 中的 CHARACTER_FIELDS / GENERAL_FIELDS 保持同步
// 后续加预制 tag 时两边都要改

const NB_CHAR_FIELDS = [
    ["n",       "角色名",   "如: dusk \\(arknights\\)"],
    ["gender",  "类型",     "1girl, 1boy"],
    ["appearance","外貌",   "发色/瞳色/体型等"],
    ["clothing","服装",     "逗号分隔"],
    ["expression","表情",   "逗号分隔"],
    ["action",  "姿势/动作","逗号分隔"],
    ["interaction","互动",  "与角色/物体/环境的互动"],
    ["position","画面位置", "center, left, right..."],
];

const NB_GENERAL_FIELDS = [
    ["count",       "计数",     "1girl, 2girls, solo..."],
    ["artists",     "画师",     "artist:name，逗号分隔"],
    ["style",       "风格",     "anime style"],
    ["background",  "背景类型", "white_background, cityscape..."],
    ["perspective", "视角",     "from_above, close-up..."],
    ["atmosphere",  "氛围",     "cheerful, dark, romantic..."],
    ["lighting",    "光照",     "sunlight, candlelight..."],
    ["quality",     "质量",     "high resolution, detailed"],
    ["objects",     "物品",     "furniture, weapons..."],
    ["other",       "其他",     "未涵盖的标签"],
];

const NB_DROPDOWN_FIELDS = ["gender", "count"];
const NB_POPUP_FIELDS = ["position", "perspective", "lighting", "style", "atmosphere"];
// 标签图标: [emoji, type]  type: "drop"=下拉 | "popup"=弹窗 | absent=普通
const NB_LABEL_ICONS = {
    gender:["🚻","drop"], count:["🔢","drop"],
    position:["📍","popup"], perspective:["🔭","popup"], lighting:["💡","popup"],
    style:["🖌️","popup"], atmosphere:["🌤️","popup"],
    quality:["⭐","drop"],
    appearance:["✨","popup"],
    clothing:["👗","popup"],
    expression:["😊","popup"],
    action:["🏃","popup"],
    interaction:["🤝","popup"],
    background:["🖼️","popup"],
    objects:["📦","popup"],
    other:["📌","popup"],
};
const NB_PRESETS = {
    gender:     ["1girl", "1boy", "1other"],
    count:      ["1girl", "2girls", "3girls", "4girls", "solo", "multiple_girls", "1boy", "2boys", "multiple_boys", "1girl, 1boy", "2girls, 2boys", "1other"],
    position:   ["foreground", "background", "center", "left", "right", "center_left", "center_right"],
    perspective:["from_above", "from_below", "from_behind", "from_side", "close-up", "cowboy_shot", "dutch_angle", "fisheye", "wide_shot", "panorama", "first-person_view", "vanishing_point","first-person_view","pov","three_sided_view","multiple_views","cut-in","between_fingers","between_legs","between_thighs","blurry_foreground","breast_conscious","breast_awe","hatching_(texture)","from_outside","atmospheric_perspective","perspective","rotated","sideways","upside-down"],
    lighting:   ["backlighting", "cinematic_lighting", "god_rays", "lens_flare", "bokeh", "depth_of_field", "bloom", "silhouette", "sunlight", "moonlight", "neon_lights", "sparkle", "glowing"],
    style:      ["anime_style", "digital_art", "sketch", "watercolor_(medium)", "oil_painting_(medium)", "flat_color", "retro_artstyle", "cyberpunk", "realistic", "minimalism", "impressionism", "faux_traditional_media"],
    atmosphere: ["cheerful", "dark", "romantic", "mysterious", "cool", "youthful", "gritty", "slice_of_life", "rebellious", "serene", "melancholy", "energetic"],
    quality:    ["high resolution, detailed", "very aesthetic, masterpiece, best quality"],
    appearance: ["slender","petite","tall","muscular","skinny","chubby","blonde_hair", "silver_hair", "grey_hair", "white_hair", "brown_hair", "light_brown_hair", "black_hair", "purple_hair", "red_hair", "blue_hair", "green_hair", "pink_hair", "gradient_hair", "multicolored_hair", "streaked_hair", "ahoge", "long_hair", "short_hair", "medium_hair", "very_long_hair", "ponytail", "twintails", "braid", "hair_bun", "messy_hair", "wavy_hair", "straight_hair", "curly_hair", "drill_hair", "hime_cut", "bob_cut", "bangs", "sidelocks", "hair_over_eyes", "hair_between_eyes", "asymmetrical_hair", "floating_hair", "twin_braids", "side_ponytail", "low_twintails", "high_ponytail", "front_ponytail", "braided_ponytail", "half_updo", "hair_spread_out", "wet_hair", "shiny_hair", "antenna_hair", "heart_ahoge", "low_ponytail","blue_eyes","red_eyes","green_eyes","brown_eyes","purple_eyes","aqua_eyes","pink_eyes","yellow_eyes","orange_eyes","black_eyes","grey_eyes","heterochromia","tsurime","tareme","sanpaku","cat_eyes","pupils","slit_pupils","dilated_pupils","sparkling_eyes","empty_eyes","one_eye_closed","rolling_eyes","glowing_eyes","eyelashes","thick_eyelashes","colored_eyelashes","blush","nosebleed","lips","lipstick","fangs","sharp_teeth","clenched_teeth","mole","beauty_mark","freckles","scar","bandaid","bandage","makeup","saliva","nose","fang","mole_under_eye","cheek_mole","forehead_mark","painted_lips","trembling_lips","parted_lips","licking_lips","biting_lips","lip_bite","food_on_face","closed_mouth","open_mouth","dark_lips","animal_ears","fox_ears","cat_ears","dog_ears","mouse_ears","rabbit_ears","bear_ears","cow_ears","deer_ears","horse_ears","lion_ears","pig_ears","sheep_ears","squirrel_ears","tiger_ears","wolf_ears","raccoon_ears","bat_ears","goat_ears","monkey_ears","panda_ears","ferret_ears","pointy_ears","long_pointy_ears","fake_animal_ears","covering_ears","kemonomimi_mode","floppy_ears","multiple_ears","heart_earrings","hoop_earrings","crystal_earrings","crescent_earrings","earrings"],
    clothing: ["school_uniform", "serafuku", "dress", "skirt", "pleated_skirt", "miniskirt", "jeans", "shorts", "jacket", "hoodie", "t-shirt", "crop_top", "sweater", "blouse", "shirt", "camisole", "leotard", "bodysuit", "swimsuit", "bikini", "kimono", "china_dress", "maid_uniform", "apron", "coat", "cape", "suit", "vest", "cardigan", "gloves", "thighhighs", "kneehighs", "socks", "mary_janes", "high_heels", "boots", "sneakers", "loafers", "sandals", "pantyhose", "harness", "armor", "uniform", "overalls", "gym_uniform", "hood", "scarf", "fur_trim", "collared_shirt", "turtleneck", "halterneck", "off_shoulder", "strapless", "sleeveless", "long_sleeves", "short_sleeves", "puffy_sleeves", "frills", "bow", "ribbon", "belt", "suspenders", "shorts_under_skirt", "legwear","blazer","suit_jacket","capelet","cloak","collared_jacket","duffel_coat","hooded_cape","hooded_cloak","hooded_coat","hooded_jacket","labcoat","military_jacket","tailcoat","casual","checkered_shirt","dress_shirt","gym_shirt","oversized_shirt","sailor_shirt","tank_top","unbuttoned_shirt","wet_shirt","cropped_shirt","cropped_vest","front-tie_top","virgin_killer_sweater","open-chest_sweater","hooded_sweater","hooded_track_jacket","jersey","load_bearing_vest","lowleg","detached_sleeves","robe","open_robe","bare_shoulders","open_clothes","sleeves_folded_up","sleeves_past_fingers","sleeves_past_wrists","sleeves_pushed_up","layered_sleeves","heart_cutout","center_frills","center_opening","gathers","high-waist_skirt","pant_suit","faulds","dudou","cat_lingerie","elbow_gloves","fingerless_gloves","wrist_cuffs","wristband","half_gloves","latex_gloves","badge","arm_belt","bangle","bead_bracelet","bracer","armband","armlet","belly_chain","bandaged_arm","bandaged_hands","bandages"],
    expression: ["smile", "open_mouth", "closed_eyes", "blush", "angry", "sad", "surprised", "happy", "embarrassed", "laughing", "crying", "tears", "pout", "tongue_out", "wink", "serious", "nervous", "determined", "sleepy", "tired", "screaming", "frowning", "glaring", "scared", "grinning", "blank_eyes", "half-closed_eyes", "pensive", "shy", "worried", "annoyed", "disgusted", "confused", "blushing", "eyelashes", "shiny_eyes", "looking_at_viewer", "looking_away", "looking_back", "looking_up", "looking_down", "seductive_smile", "evil_smile", "naughty_face", "sighing", "yawning"],
    action: ["standing", "sitting", "lying", "kneeling", "squatting", "arms_up", "arms_crossed", "arms_behind_back", "hands_on_hips", "hand_on_hip", "salute", "waving", "pointing", "thumbs_up", "spread_arms", "holding", "grabbing", "reaching_out", "leaning_forward", "fighting_stance", "running", "walking", "jumping", "floating", "stretching", "dancing", "crouching", "crossed_legs", "spread_legs", "all_fours", "bent_over", "arched_back", "princess_carry", "sitting_on_lap", "straddling", "leg_lift", "legs_up", "standing_on_one_leg", "crawling", "leaning", "head_tilt", "head_rest", "bowing", "hands_together", "heart_hands", "v_sign", "finger_gun", "hair_flip", "arms_behind_head", "shrugging","arm_support","armpits","caramelldansen","holding_hands","middle_finger","shushing","undressing","outstretched_arms","outstretched_arm","outstretched_hand","reaching","arm_up","presenting_armpit","presenting_panties","kimono_lift","skirt_lift","shared_food","adjusting_hair","adjusting_legwear","adjusting_panties","arm_grab","arm_hug","arms_around_neck","arms_at_sides","beckoning","carrying_over_shoulder","carrying_under_arm","paw_pose","claw_pose","clothes_lift","clothes_pull","bunching_hair","crossed_arms","cuddling","dress_lift","dual_wielding","feeding","glomp","hair_tucking","hair_twirling","hand_between_legs","hand_in_hair","hand_on_own_knee","hand_on_own_stomach","hand_to_own_mouth","index_finger_raised","lifted_by_self","necktie_grab","ok_sign","own_hands_together","rubbing_eyes","shading_eyes","sheet_grab","talking_on_phone","clenched_hand","raised_fist","stroking_own_chin","hat_tip","v_over_mouth","air_guitar","curtsey","heart_tail","victory_pose","orchid_fingers","holding_flower","smelling_flower","dress_tug","fetal_position","hugging_own_legs","indian_style","on_stomach","seiza","top-down_bottom-up","wariza","zombie_pose","leaning_back","leaning_to_the_side","on_back","on_side","reclining","the_pose","head_down","one_knee","butterfly_sitting","lotus_position","sitting_on_person","thigh_straddling","upright_straddle","legs_apart","balancing","wallwalking","prostration","cowering","faceplant","superhero_landing","handstand","yoga","slouching","crossed_ankles","leg_up","legs_over_head","split","standing_split","arm_around_neck","holding_own_foot","groping"],
    interaction: ["holding_hands", "hug", "kissing", "french_kiss", "cheek_kiss", "forehead_kiss", "princess_carry", "piggyback", "carrying", "sitting_on_lap", "looking_at_another", "eye_contact", "facing_another", "back-to-back", "feeding", "whispering", "headpat", "holding_another", "fighting", "protecting", "handshake", "high_five", "comforting", "talking", "hugging_from_behind", "lap_pillow", "cuddling", "glomp", "arm_in_arm", "fist_bump", "nuzzle", "bridal_carry", "sitting_on_person", "cheek-to-cheek", "arm_around_waist", "arm_around_shoulder", "leaning_on_person", "interlocked_fingers", "grabbing_another's_hair", "hand_on_another's_shoulder", "holding", "holding_weapon", "holding_sword", "holding_book", "holding_phone", "drinking", "eating", "smoking", "reading", "writing", "playing_instrument", "holding_flower", "holding_umbrella", "object_hug", "holding_bag", "holding_cup", "against_wall", "against_glass", "on_bed", "on_chair", "swimming", "underwater", "climbing", "riding", "leaning_on_object", "sitting_on_stairs", "against_tree", "riding_bicycle", "looking_out_window", "bathing", "showering", "hiding", "peeking", "under_umbrella", "wading"],
    background: ["simple_background", "white_background", "gradient_background", "grey_background", "black_background", "outdoors", "indoors", "cityscape", "sky", "night_sky", "starry_sky", "sunset", "sunrise", "cloudy", "rain", "snow", "underwater", "space", "school", "classroom", "bedroom", "living_room", "bathroom", "street", "alley", "nature", "forest", "beach", "ocean", "mountain", "river", "field", "flower_field", "park", "rooftop", "balcony", "library", "cafe", "restaurant", "stadium", "garden", "train_station", "city", "ruins", "desert", "island", "bridge", "alleyway"],
    environment: ["classroom", "bedroom", "living_room", "bathroom", "street", "alley", "forest", "beach", "ocean", "mountain", "river", "field", "park", "rooftop", "library", "cafe", "restaurant", "garden", "city", "ruins", "desert", "island", "bridge", "school", "office", "hospital", "lab", "dungeon", "castle", "temple", "shrine", "market", "festival", "concert", "train_station", "airport", "space_station", "underwater", "cave", "meadow", "swamp", "wasteland", "arena"],
    objects: ["camera","chopsticks","microphone","sword","gun","handgun","dagger","scythe","whip","wand","arrow","umbrella","gohei","ofuda","cigarette","guitar","piano","chair","backpack","smartphone","headphones","book","scroll","pen","notebook","teacup","bowl","plate","bottle","wine_glass","flashlight","lantern","bell","spray_can","bag","handbag","ribbon","necklace","bracelet","watch","ring","crown","mask","headband","hairpin","whistle","binoculars","fan","key","chains"],
    other: ["absurdres", "back", "checkered", "everyone", "highres", "huge_filesize", "incredibly_absurdres", "lowres", "original", "parody", "sample", "wallpaper", "masterpiece", "best_quality", "worst_quality", "low_quality", "normal_quality", "error", "extremely_detailed_cg_unity_8k_wallpaper", "illustration", "nsfw", "3d", "animated", "animated_png", "flash", "video", "music_video", "animated_gif", "easytoon", "non-repeating_animation", "looping_animation", "roulette_animation", "live2d", "archived_file", "artbook", "calendar_(medium)", "card_(medium)", "comic", "1koma", "2koma", "3koma", "4koma", "multiple_4koma", "5koma", "borderless_panels", "eromanga", "left-to-right_manga", "right-to-left_comic", "silent_comic", "corrupted_file", "cover", "album_cover", "character_single", "cover_page", "doujin_cover", "dvd_cover", "fake_cover", "video_game_cover", "magazine_cover", "manga_cover", "fake_screenshot", "game_cg", "gyotaku_(medium)", "icon", "logo", "kirigami", "lineart", "no_lineart", "outline", "tall_image", "wide_image", "oekaki", "official_art", "phonecard", "photo", "papercraft", "paper_child", "paper_cutout", "pixel_art", "postcard", "poster", "revision", "scan", "anime_screencap", "shitajiki", "tegaki", "triptych_(art)", "vector_trace", "tileable", "widescreen", "official_wallpaper"],
};

const NB_PRESET_TRANSLATIONS = {
    "interaction":"互动","hug":"拥抱","kissing":"接吻","french_kiss":"法式接吻","cheek_kiss":"吻脸颊","forehead_kiss":"吻额头","piggyback":"背着","carrying":"抱着/扛着","looking_at_another":"看着对方","eye_contact":"对视","facing_another":"面向对方","back-to-back":"背靠背","whispering":"耳语","headpat":"摸头","holding_another":"抱着对方","fighting":"打架","protecting":"保护","handshake":"握手","high_five":"击掌","comforting":"安慰","talking":"交谈","hugging_from_behind":"从背后抱","lap_pillow":"膝枕","arm_in_arm":"挽着手臂","fist_bump":"碰拳","nuzzle":"蹭脸","bridal_carry":"婚礼抱","cheek-to-cheek":"脸颊贴脸颊","arm_around_waist":"手臂环腰","arm_around_shoulder":"手臂环肩","leaning_on_person":"靠在人身上","interlocked_fingers":"十指相扣","grabbing_another's_hair":"抓着别人头发","hand_on_another's_shoulder":"手放在别人肩上","holding_weapon":"拿着武器","holding_sword":"拿着剑","holding_book":"拿着书","holding_phone":"拿着手机","drinking":"喝东西","eating":"吃东西","smoking":"抽烟","reading":"阅读","writing":"写字","playing_instrument":"演奏乐器","holding_umbrella":"撑伞","object_hug":"抱着物体","holding_bag":"拿着包","holding_cup":"拿着杯子","against_wall":"靠墙","against_glass":"靠玻璃","on_bed":"在床上","on_chair":"在椅子上","swimming":"游泳","climbing":"攀爬","riding":"骑乘","leaning_on_object":"靠着物体","sitting_on_stairs":"坐在楼梯上","against_tree":"靠树","riding_bicycle":"骑自行车","looking_out_window":"望向窗外","bathing":"洗澡","showering":"淋浴","hiding":"躲藏","peeking":"偷看","under_umbrella":"在伞下","wading":"涉水",
    "1girl":"1女孩","1boy":"1男孩","1other":"1其他",
    
    "solo":"单人","2girls":"2女孩","3girls":"3女孩","4girls":"4女孩","multiple_girls":"多女孩","2boys":"2男孩","multiple_boys":"多男孩","1girl, 1boy":"1女1男","2girls, 2boys":"2女2男","1other":"1其他",
    "foreground":"前景","background":"背景","center":"中间","left":"左侧","right":"右侧","center_left":"中左","center_right":"中右","sitting":"坐着","standing":"站着",
    "from_above":"俯视","from_below":"仰视","from_behind":"背影","from_side":"侧面","close-up":"特写","cowboy_shot":"七分身","dutch_angle":"倾斜","fisheye":"鱼眼","wide_shot":"广角","panorama":"全景","first-person_view":"第一人称","vanishing_point":"透视","first-person_view":"第一人称","pov":"主观视角","three_sided_view":"三视图","multiple_views":"多视图","cut-in":"插入画面","between_fingers":"指间","between_legs":"两腿之间","between_thighs":"大腿之间","blurry_foreground":"前景模糊","breast_conscious":"对胸部在意","breast_awe":"着迷于乳房","hatching_(texture)":"线影法","from_outside":"室外看向室内","atmospheric_perspective":"大气距离感","perspective":"透视画法","rotated":"旋转的","sideways":"横向显示","upside-down":"倒挂的",
    "backlighting":"逆光","cinematic_lighting":"电影光效","god_rays":"自上而下光","lens_flare":"镜头光晕","bokeh":"散焦","depth_of_field":"景深","bloom":"盛开","silhouette":"剪影","sunlight":"日光","moonlight":"月光","neon_lights":"霓虹灯","sparkle":"闪耀","glowing":"辉光",
    "anime_style":"动漫风","digital_art":"数字艺术","sketch":"草图","watercolor_(medium)":"水彩","oil_painting_(medium)":"油画","flat_color":"平涂","retro_artstyle":"复古","cyberpunk":"赛博朋克","realistic":"写实","minimalism":"极简","impressionism":"印象派","faux_traditional_media":"仿手绘",
    "cheerful":"愉快","dark":"阴暗","romantic":"浪漫","mysterious":"神秘","cool":"冷酷","youthful":"青春","gritty":"粗粝","slice_of_life":"日常","rebellious":"叛逆","serene":"宁静","melancholy":"忧郁","energetic":"活力",
    "high resolution, detailed":"官方默认","very aesthetic, masterpiece, best quality":"高质量",
    "blonde_hair":"金发",    "silver_hair":"银发","slender":"苗条","petite":"娇小","tall":"高挑","muscular":"肌肉","skinny":"瘦削","chubby":"丰满",    "grey_hair":"灰发",    "white_hair":"白发",    "brown_hair":"茶发",    "light_brown_hair":"浅褐发",    "black_hair":"黑发",    "purple_hair":"紫发",    "red_hair":"红发",    "blue_hair":"蓝发",    "green_hair":"绿发",    "pink_hair":"粉发",    "gradient_hair":"渐变发色",    "multicolored_hair":"多彩头发",    "streaked_hair":"条染",    "ahoge":"呆毛",    "long_hair":"长发",    "short_hair":"短发",    "medium_hair":"中等长发",    "very_long_hair":"很长头发",    "ponytail":"马尾",    "twintails":"双马尾",    "braid":"辫子",    "hair_bun":"团子头",    "messy_hair":"凌乱发型",    "wavy_hair":"自然卷",    "straight_hair":"直发",    "curly_hair":"卷发",    "drill_hair":"钻头卷",    "hime_cut":"姬发式",    "bob_cut":"波波头",    "bangs":"刘海",    "sidelocks":"耳前发",    "hair_over_eyes":"头发遮眼",    "hair_between_eyes":"眼间刘海",    "asymmetrical_hair":"非对称发型",    "floating_hair":"漂浮头发",    "twin_braids":"双辫子",    "side_ponytail":"侧马尾",    "low_twintails":"低扎双尾",    "high_ponytail":"高马尾",    "front_ponytail":"前马尾",    "braided_ponytail":"编织马尾",    "half_updo":"侧发后梳",    "hair_spread_out":"散发",    "wet_hair":"湿头发",    "shiny_hair":"光泽头发",    "antenna_hair":"多根呆毛",    "heart_ahoge":"心形呆毛",    "low_ponytail":"低扎马尾",    "school_uniform":"校服",    "serafuku":"水手服",    "dress":"连衣裙",    "skirt":"裙子",    "pleated_skirt":"百褶裙",    "miniskirt":"迷你裙",    "jeans":"牛仔裤",    "shorts":"短裤",    "jacket":"夹克",    "hoodie":"卫衣",    "t-shirt":"T恤",    "crop_top":"露脐装",    "sweater":"毛衣",    "blouse":"女衬衫",    "shirt":"衬衫",    "camisole":"吊带背心",    "leotard":"紧身衣",    "bodysuit":"连体衣",    "swimsuit":"泳装",    "bikini":"比基尼",    "kimono":"和服",    "china_dress":"旗袍",    "maid_uniform":"女仆装",    "apron":"围裙",    "coat":"大衣",    "cape":"斗篷",    "suit":"西装",    "vest":"马甲",    "cardigan":"开衫",    "gloves":"手套",    "thighhighs":"过膝袜",    "kneehighs":"膝上袜",    "socks":"短袜",    "mary_janes":"玛丽珍鞋",    "high_heels":"高跟鞋",    "boots":"靴子",    "sneakers":"运动鞋",    "loafers":"乐福鞋",    "sandals":"凉鞋",    "pantyhose":"连裤袜",    "harness":"绑带",    "armor":"盔甲",    "uniform":"制服",    "overalls":"背带裤",    "gym_uniform":"体操服",    "hood":"兜帽",    "scarf":"围巾",    "fur_trim":"毛边",    "collared_shirt":"有领衬衫",    "turtleneck":"高领",    "halterneck":"吊颈",    "off_shoulder":"露肩",    "strapless":"无肩带",    "sleeveless":"无袖",    "long_sleeves":"长袖",    "short_sleeves":"短袖",    "puffy_sleeves":"泡泡袖",    "frills":"褶边",    "bow":"蝴蝶结",    "ribbon":"丝带",    "belt":"腰带",    "suspenders":"吊带",    "shorts_under_skirt":"裙底短裤",    "legwear":"腿饰",    "smile":"微笑",    "open_mouth":"张嘴",    "closed_eyes":"闭眼",    "blush":"脸红",    "angry":"生气",    "sad":"悲伤",    "surprised":"惊讶",    "happy":"开心",    "embarrassed":"尴尬",    "laughing":"大笑",    "crying":"哭泣",    "tears":"眼泪",    "pout":"嘟嘴",    "tongue_out":"吐舌",    "wink":"眨眼",    "serious":"严肃",    "nervous":"紧张",    "determined":"坚定",    "sleepy":"困倦",    "tired":"疲惫",    "screaming":"尖叫",    "frowning":"皱眉",    "glaring":"瞪视",    "scared":"害怕",    "grinning":"咧嘴笑",    "blank_eyes":"无神眼",    "half-closed_eyes":"半闭眼",    "pensive":"沉思",    "shy":"害羞",    "worried":"担心",    "annoyed":"烦躁",    "disgusted":"厌恶",    "confused":"困惑",    "blushing":"脸红",    "eyelashes":"睫毛",    "shiny_eyes":"闪亮眼",    "looking_at_viewer":"看向观众",    "looking_away":"看别处",    "looking_back":"回头看",    "looking_up":"向上看",    "looking_down":"向下看",    "seductive_smile":"魅惑笑",    "evil_smile":"邪笑",    "naughty_face":"顽皮脸",    "sighing":"叹气",    "yawning":"打哈欠",    "standing":"站着",    "sitting":"坐着",    "lying":"躺着",    "kneeling":"下跪",    "squatting":"蹲下",    "arms_up":"双抬臂",    "arms_crossed":"手交叉",    "arms_behind_back":"手放身后",    "hands_on_hips":"双手叉腰",    "hand_on_hip":"单手插腰",    "salute":"敬礼",    "waving":"招手",    "pointing":"指点",    "thumbs_up":"翘拇指",    "spread_arms":"张开双臂",    "holding":"拿着",    "grabbing":"抓住",    "reaching_out":"伸手触及",    "leaning_forward":"身体前驱",    "fighting_stance":"战斗姿态",    "running":"奔跑",    "walking":"走路",    "jumping":"跳跃",    "floating":"漂浮",    "stretching":"伸懒腰",    "dancing":"跳舞",    "crouching":"蹲伏",    "crossed_legs":"二郎腿",    "spread_legs":"张腿",    "all_fours":"四肢趴地",    "bent_over":"翘臀",    "arched_back":"弓身体",    "princess_carry":"公主抱",    "sitting_on_lap":"坐大腿",    "straddling":"跨坐",    "leg_lift":"抬脚",    "legs_up":"抬双脚",    "standing_on_one_leg":"单腿站",    "crawling":"爬行",    "leaning":"倚靠",    "head_tilt":"歪头",    "head_rest":"托头",    "bowing":"鞠躬",    "hands_together":"双手合十",    "heart_hands":"双手比心",    "v_sign":"V手势",    "finger_gun":"手枪手势",    "hair_flip":"拨头发",    "arms_behind_head":"手臂放头后",    "shrugging":"耸肩",    "simple_background":"简单背景",    "white_background":"白背景",    "gradient_background":"渐变背景",    "grey_background":"灰背景",    "black_background":"黑背景",    "outdoors":"户外",    "indoors":"室内",    "cityscape":"城市景观",    "sky":"天空",    "night_sky":"夜空",    "starry_sky":"星空",    "sunset":"日落",    "sunrise":"日出",    "cloudy":"多云",    "rain":"雨",    "snow":"雪",    "underwater":"水下",    "space":"太空",    "school":"学校",    "classroom":"教室",    "bedroom":"卧室",    "living_room":"客厅",    "bathroom":"浴室",    "street":"街道",    "alley":"小巷",    "nature":"自然",    "forest":"森林",    "beach":"海滩",    "ocean":"海洋",    "mountain":"山",    "river":"河流",    "field":"田野",    "flower_field":"花田",    "park":"公园",    "rooftop":"屋顶",    "balcony":"阳台",    "library":"图书馆",    "cafe":"咖啡厅",    "restaurant":"餐厅",    "stadium":"体育馆",    "garden":"花园",    "train_station":"火车站",    "city":"城市",    "ruins":"废墟",    "desert":"沙漠",    "island":"岛屿",    "bridge":"桥",    "alleyway":"小巷道",    "office":"办公室",    "hospital":"医院",    "lab":"实验室",    "dungeon":"地牢",    "castle":"城堡",    "temple":"寺庙",    "shrine":"神社",    "market":"市场",    "festival":"节日",    "concert":"音乐会",    "airport":"机场",    "space_station":"空间站",    "cave":"洞穴",    "meadow":"草地",    "swamp":"沼泽",    "wasteland":"荒地",    "arena":"竞技场","camera":"相机","chopsticks":"筷子","microphone":"麦克风","sword":"刀","gun":"枪","handgun":"手枪","dagger":"匕首","scythe":"镰刀","whip":"鞭","wand":"魔杖","arrow":"箭","umbrella":"伞","gohei":"御币","ofuda":"札符","cigarette":"香烟","guitar":"吉他","piano":"钢琴","chair":"椅子","backpack":"背包","smartphone":"手机","headphones":"耳机","book":"书","scroll":"卷轴","pen":"笔","notebook":"笔记本","teacup":"茶杯","bowl":"碗","plate":"盘子","bottle":"瓶子","wine_glass":"酒杯","flashlight":"手电筒","lantern":"灯笼","bell":"铃","spray_can":"喷漆罐","bag":"包","handbag":"手提包","ribbon":"丝带","necklace":"项链","bracelet":"手镯","watch":"手表","ring":"戒指","crown":"王冠","mask":"面具","headband":"头带","hairpin":"发夹","whistle":"哨子","binoculars":"双筒望远镜","fan":"扇子","key":"钥匙","chains":"锁链","blue_eyes":"蓝眼","red_eyes":"红眼","green_eyes":"绿眼","brown_eyes":"棕眼","purple_eyes":"紫眼","aqua_eyes":"水色眼","pink_eyes":"粉眼","yellow_eyes":"黄眼","orange_eyes":"橙眼","black_eyes":"黑眼","grey_eyes":"灰眼","heterochromia":"异色瞳","tsurime":"吊眼角","tareme":"垂眼角","sanpaku":"三白眼","cat_eyes":"猫眼","pupils":"瞳孔","slit_pupils":"竖瞳","dilated_pupils":"扩瞳","sparkling_eyes":"闪亮眼","empty_eyes":"无神眼","one_eye_closed":"单眼闭","rolling_eyes":"翻白眼","glowing_eyes":"发光眼","eyelashes":"睫毛","thick_eyelashes":"浓睫毛","colored_eyelashes":"彩色睫毛","blush":"脸红","nosebleed":"鼻血","lips":"嘴唇","lipstick":"口红","fangs":"虎牙","sharp_teeth":"尖牙","clenched_teeth":"咬牙","mole":"痣","beauty_mark":"美人痣","freckles":"雀斑","scar":"疤痕","bandaid":"创可贴","bandage":"绷带","makeup":"浓妆","saliva":"唾液","nose":"鼻子","fang":"尖牙","mole_under_eye":"泪痣","cheek_mole":"脸颊痣","forehead_mark":"额印","painted_lips":"画唇","trembling_lips":"颤抖嘴唇","parted_lips":"微张嘴","licking_lips":"舔唇","biting_lips":"咬唇","lip_bite":"咬嘴唇","food_on_face":"脸上食物","closed_mouth":"闭嘴","open_mouth":"张口","dark_lips":"暗唇","animal_ears":"动物耳朵","fox_ears":"狐狸耳朵","cat_ears":"猫耳","dog_ears":"狗耳","mouse_ears":"鼠耳","rabbit_ears":"兔耳","bear_ears":"熊耳","cow_ears":"牛耳","deer_ears":"鹿耳","horse_ears":"马耳","lion_ears":"狮耳","pig_ears":"猪耳","sheep_ears":"羊耳","squirrel_ears":"松鼠耳朵","tiger_ears":"虎耳","wolf_ears":"狼耳","raccoon_ears":"浣熊耳朵","bat_ears":"蝙蝠耳朵","goat_ears":"山羊耳朵","monkey_ears":"猴耳","panda_ears":"熊猫耳朵","ferret_ears":"鼬耳","pointy_ears":"尖耳","long_pointy_ears":"尖尖长耳","fake_animal_ears":"仿制动物耳朵","covering_ears":"遮耳","kemonomimi_mode":"兽耳模式","floppy_ears":"垂耳","multiple_ears":"多耳","heart_earrings":"心形耳环","hoop_earrings":"环状耳环","crystal_earrings":"水晶耳环","crescent_earrings":"月牙耳环","earrings":"耳环","arm_support":"用手支撑住","armpits":"举手露腋","caramelldansen":"焦糖舞","holding_hands":"牵手","middle_finger":"比出中指","shushing":"嘘手势","undressing":"脱衣服中","outstretched_arms":"伸出双臂","outstretched_arm":"伸出单臂","outstretched_hand":"伸出手","reaching":"伸手触及","arm_up":"单抬臂","presenting_armpit":"展示腋窝","presenting_panties":"展示内裤","kimono_lift":"掀起和服","skirt_lift":"掀起裙子","shared_food":"共享食物","adjusting_hair":"理头发","adjusting_legwear":"整理裤袜","adjusting_panties":"拨内裤","arm_grab":"抓住手臂","arm_hug":"挽手","arms_around_neck":"双手搂着脖子","arms_at_sides":"双手垂放","beckoning":"招手","carrying_over_shoulder":"肩扛","carrying_under_arm":"夹在腋下","paw_pose":"爪子姿势","claw_pose":"举爪姿势","clothes_lift":"掀起衣物","clothes_pull":"拉开衣物","bunching_hair":"手持辫子","crossed_arms":"交叉双臂","cuddling":"拥抱","dress_lift":"掀起裙子","dual_wielding":"双持","feeding":"喂食","glomp":"扑上来抱住","hair_tucking":"撩头发","hair_twirling":"手指卷着头发","hand_between_legs":"手放在两腿之间","hand_in_hair":"手埋在头发里","hand_on_own_knee":"手放在自己膝盖上","hand_on_own_stomach":"手放在自己肚子上","hand_to_own_mouth":"手朝向自己嘴","index_finger_raised":"食指抬起","lifted_by_self":"掀起自己的衣物","necktie_grab":"抓着领带","ok_sign":"OK手势","own_hands_together":"双手合十","rubbing_eyes":"揉眼睛","shading_eyes":"遮阳手势","sheet_grab":"抓着床单","talking_on_phone":"打电话","clenched_hand":"握紧的手","raised_fist":"举起的拳头","stroking_own_chin":"扶颏冥想","hat_tip":"捏着帽檐","v_over_mouth":"手指比V放在嘴上","air_guitar":"空气吉他","curtsey":"屈膝礼","heart_tail":"心形尾巴","victory_pose":"胜利手势","orchid_fingers":"兰花指","holding_flower":"拿着花","smelling_flower":"闻花","dress_tug":"拉下连衣裙下摆","fetal_position":"曲腿至胸","hugging_own_legs":"抱腿","indian_style":"盘腿","on_stomach":"趴着","seiza":"正坐","top-down_bottom-up":"趴着翘臀","wariza":"割坐","zombie_pose":"僵尸姿势","leaning_back":"身体往后靠","leaning_to_the_side":"向一侧倾斜身体","on_back":"仰躺","on_side":"侧卧","reclining":"斜躺","the_pose":"趴在地上并翘起脚","head_down":"低着头","one_knee":"单膝跪","butterfly_sitting":"蝴蝶坐","lotus_position":"结跏趺坐","sitting_on_person":"坐在人身上","thigh_straddling":"大腿跨骑","upright_straddle":"对坐体位","legs_apart":"两腿分开","balancing":"保持平衡","wallwalking":"走在墙顶上","prostration":"失意体前屈Orz","cowering":"抱头","faceplant":"脸贴地面","superhero_landing":"三点着地","handstand":"用手倒立","yoga":"瑜伽","slouching":"伛","crossed_ankles":"交叉脚踝","leg_up":"抬起腿","legs_over_head":"双腿抬过头","split":"分开","standing_split":"站立劈叉","arm_around_neck":"手臂环绕脖子","holding_own_foot":"抓住自己的脚","groping":"胡乱摸","blazer":"西装夹克","suit_jacket":"西装外套","capelet":"披肩","cloak":"斗篷","collared_jacket":"翻领夹克","duffel_coat":"粗呢大衣","hooded_cape":"连帽斗篷","hooded_cloak":"连帽披巾","hooded_coat":"连帽外套","hooded_jacket":"连帽夹克","labcoat":"白大褂","military_jacket":"军装夹克","tailcoat":"燕尾服","casual":"私服","checkered_shirt":"格子衬衫","dress_shirt":"西服衬衫","gym_shirt":"体操服","oversized_shirt":"过大号衬衫","sailor_shirt":"水手服款衬衫","tank_top":"无袖紧身背心","unbuttoned_shirt":"解开纽扣的衬衫","wet_shirt":"湿衬衫","cropped_shirt":"短衬衫","cropped_vest":"小款背心","front-tie_top":"从正面打结的衣物","virgin_killer_sweater":"处男杀手毛衣","open-chest_sweater":"胸部开口的毛衣","hooded_sweater":"连帽毛衣","hooded_track_jacket":"连帽运动夹克","jersey":"运动衫","load_bearing_vest":"承重背心","lowleg":"低胸装","detached_sleeves":"袖肩分离装","robe":"长袍","open_robe":"敞开长袍","bare_shoulders":"露双肩","open_clothes":"敞开衣服","sleeves_folded_up":"叠起来的袖子","sleeves_past_fingers":"袖子长过手指","sleeves_past_wrists":"袖子长过手腕","sleeves_pushed_up":"袖子往上拉起","layered_sleeves":"分层的衣袖","heart_cutout":"衣服有心形开口","center_frills":"胸口带花边的服装","center_opening":"正中间开口的服装","gathers":"褶裥","high-waist_skirt":"高腰裙","pant_suit":"女性穿着西服","faulds":"腹甲","dudou":"肚兜","cat_lingerie":"猫系内衣","elbow_gloves":"长袖手套","fingerless_gloves":"露指手套","wrist_cuffs":"腕饰","wristband":"腕带","half_gloves":"短手套","latex_gloves":"乳胶手套","badge":"徽章","arm_belt":"臂环","bangle":"手镯","bead_bracelet":"珠子手链","bracer":"护腕","armband":"臂章","armlet":"臂环","belly_chain":"脐链","bandaged_arm":"缠着绷带的手臂","bandaged_hands":"缠着绷带的手","bandages":"绷带","absurdres":"超高分辨率","back":"背影像","checkered":"格子的","everyone":"所有人","highres":"高分辨率","huge_filesize":"大文件体积","incredibly_absurdres":"极高分辨率","lowres":"低分辨率","original":"原创","parody":"拙劣模仿","sample":"样图标记","wallpaper":"壁纸","masterpiece":"杰作","best_quality":"顶级质量","worst_quality":"糟糕质量","low_quality":"低质量","normal_quality":"一般质量","error":"有错误","extremely_detailed_cg_unity_8k_wallpaper":"极高分辨率 CG 壁纸","illustration":"插画","nsfw":"不宜工作时观看","3d":"3D","animated":"动图","animated_png":"PNG 动图","flash":"Flash","video":"视频","music_video":"音乐视频","animated_gif":"GIF 动图","easytoon":"EasyToon","non-repeating_animation":"非循环动画","looping_animation":"循环播放动画","roulette_animation":"轮转动画","live2d":"Live2D","archived_file":"压缩包","artbook":"原画","calendar_(medium)":"日历(介质)","card_(medium)":"卡片(介质)","comic":"漫画","1koma":"单格漫画","2koma":"双分镜漫画","3koma":"三格漫画","4koma":"四格漫画","multiple_4koma":"多列四格漫画","5koma":"五格漫画","borderless_panels":"无边框漫画","eromanga":"色情漫画","left-to-right_manga":"从左往右读的漫画","right-to-left_comic":"从右往左读的漫画","silent_comic":"默剧漫画","corrupted_file":"损坏的文件","cover":"封面","album_cover":"专辑封面","character_single":"单人封面","cover_page":"封面","doujin_cover":"同人封面","dvd_cover":"DVD 封面","fake_cover":"(同人向玩梗向的)封面","video_game_cover":"视频游戏封面","magazine_cover":"杂志封面","manga_cover":"漫画封面","fake_screenshot":"(同人向玩梗向的)截图","game_cg":"游戏 CG","gyotaku_(medium)":"鱼拓 (介质)","icon":"图标","logo":"标志","kirigami":"剪纸","lineart":"线条艺术","no_lineart":"几乎没用勾线的画","outline":"角色形象有描边","tall_image":"长图","wide_image":"宽图","oekaki":"简朴的画作","official_art":"官方画作","phonecard":"电话卡","photo":"照片","papercraft":"纸艺","paper_child":"纸质角色","paper_cutout":"纸艺模型","pixel_art":"像素风","postcard":"明信片","poster":"海报","revision":"修正版","scan":"扫描件","anime_screencap":"动画截图","shitajiki":"垫板","tegaki":"来自 tegaki 博客","triptych_(art)":"三联画 (艺术)","vector_trace":"矢量画","tileable":"可平铺拼贴","widescreen":"宽屏幕","official_wallpaper":"官方壁纸图"
,"absurdres":"超高分辨率","back":"背影像","checkered":"格子的","everyone":"所有人","highres":"高分辨率","huge_filesize":"大文件体积","incredibly_absurdres":"极高分辨率","lowres":"低分辨率","original":"原创","parody":"拙劣模仿","sample":"样图标记","wallpaper":"壁纸","masterpiece":"杰作","best_quality":"顶级质量","worst_quality":"糟糕质量","low_quality":"低质量","normal_quality":"一般质量","error":"有错误","extremely_detailed_cg_unity_8k_wallpaper":"极高分辨率 CG 壁纸","illustration":"插画","nsfw":"不宜工作时观看","3d":"3D","animated":"动图","animated_png":"PNG 动图","flash":"Flash","video":"视频","music_video":"音乐视频","animated_gif":"GIF 动图","easytoon":"EasyToon","non-repeating_animation":"非循环动画","looping_animation":"循环播放动画","roulette_animation":"轮转动画","live2d":"Live2D","archived_file":"压缩包","artbook":"原画","calendar_(medium)":"日历(介质)","card_(medium)":"卡片(介质)","comic":"漫画","1koma":"单格漫画","2koma":"双分镜漫画","3koma":"三格漫画","4koma":"四格漫画","multiple_4koma":"多列四格漫画","5koma":"五格漫画","borderless_panels":"无边框漫画","eromanga":"色情漫画","left-to-right_manga":"从左往右读的漫画","right-to-left_comic":"从右往左读的漫画","silent_comic":"默剧漫画","corrupted_file":"损坏的文件","cover":"封面","album_cover":"专辑封面","character_single":"单人封面","cover_page":"封面","doujin_cover":"同人封面","dvd_cover":"DVD 封面","fake_cover":"(同人向玩梗向的)封面","video_game_cover":"视频游戏封面","magazine_cover":"杂志封面","manga_cover":"漫画封面","fake_screenshot":"(同人向玩梗向的)截图","game_cg":"游戏 CG","gyotaku_(medium)":"鱼拓 (介质)","icon":"图标","logo":"标志","kirigami":"剪纸","lineart":"线条艺术","no_lineart":"几乎没用勾线的画","outline":"角色形象有描边","tall_image":"长图","wide_image":"宽图","oekaki":"简朴的画作","official_art":"官方画作","phonecard":"电话卡","photo":"照片","papercraft":"纸艺","paper_child":"纸质角色","paper_cutout":"纸艺模型","pixel_art":"像素风","postcard":"明信片","poster":"海报","revision":"修正版","scan":"扫描件","anime_screencap":"动画截图","shitajiki":"垫板","tegaki":"来自 tegaki 博客","triptych_(art)":"三联画 (艺术)","vector_trace":"矢量画","tileable":"可平铺拼贴","widescreen":"宽屏幕","official_wallpaper":"官方壁纸图"
};

const NB_DEFAULT_SUBCATS = {
    appearance: [
        ["sub_hair","💇 发型发色","hair,ponytail,twintails,braid,bun,bangs,ahoge,hime_cut,bob_cut,drill_hair,sidelocks,pixie_cut,updo,blonde_hair,black_hair,white_hair,red_hair,blue_hair,pink_hair,green_hair,purple_hair,brown_hair,silver_hair"],
        ["sub_eyes","👁 眼睛","eyes,eyelashes,pupils,heterochromia,tsurime,tareme,sanpaku,cat_eyes,round_eyes,blue_eyes,red_eyes,green_eyes,closed_eyes,half-closed_eyes,shiny_eyes,blank_eyes,thick_eyelashes"],
        ["sub_face","😶 面部","blush,fangs,lips,lipstick,mole,freckles,beauty_mark,scar,nose,blushing,glasses,sunglasses,eyepatch,bandaid,bandage,facial_hair,whiskers"],
        ["sub_ears","👂 耳朵","animal_ears,cat_ears,fox_ears,dog_ears,elf_ears,pointy_ears,floppy_ears,rabbit_ears,bear_ears,horse_ears,mouse_ears"],
        ["sub_body","💪 身体","horns,halo,tail,wings,cat_tail,fox_tail,demon_tail,spiked_tail,feathered_wings,bat_wings,mechanized_wings,armor,tattoo,bandaid,bandage,patch,collar,leash,bell,harness,shackles,choker,slender,petite,tall,muscular,skinny,chubby,tanned,pale_skin,dark_skin"],
    ],
    clothing: [
        ["sub_top","👚 上装","shirt,blouse,sweater,jacket,t-shirt,crop_top,cardigan,camisole,tank_top,turtleneck,halterneck,off_shoulder,strapless,sleeveless,long_sleeves,short_sleeves,puffy_sleeves,coat,cape,vest,collared_shirt,armor"],
        ["sub_bottom","👖 下装","skirt,jeans,shorts,pleated_skirt,miniskirt,shorts_under_skirt,leggings,overalls"],
        ["sub_full","👗 全身套装","dress,kimono,uniform,serafuku,suit,swimsuit,bikini,china_dress,maid_uniform,apron,leotard,bodysuit,gym_uniform,school_uniform"],
        ["sub_shoes","👟 鞋袜","thighhighs,kneehighs,socks,mary_janes,high_heels,boots,sneakers,loafers,sandals,pantyhose,legwear,black_legwear,white_legwear,frilled_socks"],
        ["sub_acc","💍 配饰","gloves,bow,ribbon,belt,suspenders,frills,fur_trim,hood,hoodie,scarf,harness"],
    ],
    objects: [
        ["sub_weapon","🗡 武器","sword,gun,dagger,scythe,wand,arrow,whip,handgun"],
        ["sub_music","🎸 乐器","guitar,piano,microphone"],
        ["sub_elec","📱 电子","camera,smartphone,headphones,flashlight"],
        ["sub_food","🍵 饮食","teacup,bowl,plate,bottle,wine_glass,chopsticks,cigarette"],
        ["sub_wear","💍 随身配饰","bag,handbag,backpack,necklace,bracelet,watch,ring,ribbon,mask,umbrella,fan,key,chains,whistle,binoculars"],
        ["sub_study","📝 文具","book,scroll,pen,notebook,crown,ofuda,gohei,lantern,bell"],
    ],
    other: [
        ["sub_imgtype","🖼 图片类型"," "],
    ],
};

const NB_DEFAULT_ASSIGN = {
            "appearance": {
                "slender": "sub_body",
                "petite": "sub_body",
                "tall": "sub_body",
                "muscular": "sub_body",
                "skinny": "sub_body",
                "chubby": "sub_body",
                "blonde_hair": "sub_hair",
                "silver_hair": "sub_hair",
                "grey_hair": "sub_hair",
                "white_hair": "sub_hair",
                "brown_hair": "sub_hair",
                "light_brown_hair": "sub_hair",
                "black_hair": "sub_hair",
                "purple_hair": "sub_hair",
                "red_hair": "sub_hair",
                "blue_hair": "sub_hair",
                "green_hair": "sub_hair",
                "pink_hair": "sub_hair",
                "gradient_hair": "sub_hair",
                "multicolored_hair": "sub_hair",
                "streaked_hair": "sub_hair",
                "ahoge": "sub_hair",
                "long_hair": "sub_hair",
                "short_hair": "sub_hair",
                "medium_hair": "sub_hair",
                "very_long_hair": "sub_hair",
                "ponytail": "sub_hair",
                "twintails": "sub_hair",
                "braid": "sub_hair",
                "hair_bun": "sub_hair",
                "messy_hair": "sub_hair",
                "wavy_hair": "sub_hair",
                "straight_hair": "sub_hair",
                "curly_hair": "sub_hair",
                "drill_hair": "sub_hair",
                "hime_cut": "sub_hair",
                "bob_cut": "sub_hair",
                "bangs": "sub_hair",
                "sidelocks": "sub_hair",
                "hair_over_eyes": "sub_eyes",
                "hair_between_eyes": "sub_hair",
                "asymmetrical_hair": "sub_hair",
                "floating_hair": "sub_hair",
                "twin_braids": "sub_hair",
                "side_ponytail": "sub_hair",
                "low_twintails": "sub_hair",
                "high_ponytail": "sub_hair",
                "front_ponytail": "sub_hair",
                "braided_ponytail": "sub_hair",
                "half_updo": "sub_hair",
                "hair_spread_out": "sub_hair",
                "wet_hair": "sub_hair",
                "shiny_hair": "sub_hair",
                "antenna_hair": "sub_hair",
                "heart_ahoge": "sub_hair",
                "low_ponytail": "sub_hair",
                "nosebleed": "sub_body",
                "mole": "sub_body",
                "beauty_mark": "sub_body",
                "scar": "sub_body",
                "bandaid": "sub_body",
                "bandage": "sub_body",
                "wolf_ears": "sub_face",
                "goat_ears": "sub_face",
                "blue_eyes": "sub_eyes",
                "red_eyes": "sub_eyes",
                "green_eyes": "sub_eyes",
                "brown_eyes": "sub_eyes",
                "purple_eyes": "sub_eyes",
                "aqua_eyes": "sub_eyes",
                "pink_eyes": "sub_eyes",
                "yellow_eyes": "sub_eyes",
                "orange_eyes": "sub_eyes",
                "black_eyes": "sub_eyes",
                "grey_eyes": "sub_eyes",
                "heterochromia": "sub_eyes",
                "tsurime": "sub_eyes",
                "tareme": "sub_eyes",
                "sparkling_eyes": "sub_eyes",
                "one_eye_closed": "sub_eyes",
                "eyelashes": "sub_eyes",
                "cat_eyes": "sub_eyes",
                "sanpaku": "sub_eyes",
                "pupils": "sub_eyes",
                "slit_pupils": "sub_eyes",
                "dilated_pupils": "sub_eyes",
                "empty_eyes": "sub_eyes",
                "thick_eyelashes": "sub_eyes",
                "colored_eyelashes": "sub_eyes",
                "glowing_eyes": "sub_eyes",
                "rolling_eyes": "sub_eyes",
                "blush": "sub_face",
                "lips": "sub_face",
                "lipstick": "sub_face",
                "fangs": "sub_face",
                "sharp_teeth": "sub_face",
                "clenched_teeth": "sub_face",
                "freckles": "sub_face",
                "makeup": "sub_face",
                "saliva": "sub_face",
                "nose": "sub_face",
                "fang": "sub_face",
                "mole_under_eye": "sub_face",
                "cheek_mole": "sub_face",
                "forehead_mark": "sub_face",
                "painted_lips": "sub_face",
                "trembling_lips": "sub_face",
                "parted_lips": "sub_face",
                "licking_lips": "sub_face",
                "biting_lips": "sub_face",
                "lip_bite": "sub_face",
                "food_on_face": "sub_face",
                "closed_mouth": "sub_face",
                "open_mouth": "sub_face",
                "dark_lips": "sub_face",
                "animal_ears": "sub_ears",
                "fox_ears": "sub_ears",
                "cat_ears": "sub_ears",
                "dog_ears": "sub_ears",
                "mouse_ears": "sub_ears",
                "rabbit_ears": "sub_ears",
                "bear_ears": "sub_ears",
                "cow_ears": "sub_ears",
                "deer_ears": "sub_ears",
                "horse_ears": "sub_ears",
                "lion_ears": "sub_ears",
                "pig_ears": "sub_ears",
                "sheep_ears": "sub_ears",
                "squirrel_ears": "sub_ears",
                "tiger_ears": "sub_ears",
                "raccoon_ears": "sub_ears",
                "bat_ears": "sub_ears",
                "monkey_ears": "sub_ears",
                "panda_ears": "sub_ears",
                "ferret_ears": "sub_ears",
                "pointy_ears": "sub_ears",
                "long_pointy_ears": "sub_ears",
                "fake_animal_ears": "sub_ears",
                "covering_ears": "sub_ears",
                "kemonomimi_mode": "sub_ears",
                "floppy_ears": "sub_ears",
                "multiple_ears": "sub_ears",
                "heart_earrings": "sub_ears",
                "hoop_earrings": "sub_ears",
                "crystal_earrings": "sub_ears",
                "crescent_earrings": "sub_ears",
                "earrings": "sub_ears"
            },
            "clothing": {
                "school_uniform": "sub_full",
                "serafuku": "sub_full",
                "dress": "sub_full",
                "skirt": "sub_bottom",
                "pleated_skirt": "sub_bottom",
                "miniskirt": "sub_bottom",
                "jeans": "sub_bottom",
                "shorts": "sub_bottom",
                "jacket": "sub_top",
                "hoodie": "sub_acc",
                "t-shirt": "sub_top",
                "crop_top": "sub_top",
                "sweater": "sub_top",
                "blouse": "sub_top",
                "shirt": "sub_top",
                "camisole": "sub_top",
                "leotard": "sub_full",
                "bodysuit": "sub_full",
                "swimsuit": "sub_full",
                "bikini": "sub_full",
                "kimono": "sub_full",
                "china_dress": "sub_full",
                "maid_uniform": "sub_full",
                "apron": "sub_full",
                "coat": "sub_top",
                "cape": "sub_full",
                "suit": "sub_full",
                "vest": "sub_top",
                "cardigan": "sub_top",
                "gloves": "sub_acc",
                "thighhighs": "sub_shoes",
                "kneehighs": "sub_shoes",
                "socks": "sub_shoes",
                "mary_janes": "sub_shoes",
                "high_heels": "sub_shoes",
                "boots": "sub_shoes",
                "sneakers": "sub_shoes",
                "loafers": "sub_shoes",
                "sandals": "sub_shoes",
                "pantyhose": "sub_shoes",
                "harness": "sub_acc",
                "armor": "sub_top",
                "uniform": "sub_full",
                "overalls": "sub_bottom",
                "gym_uniform": "sub_full",
                "hood": "sub_acc",
                "scarf": "sub_acc",
                "fur_trim": "sub_acc",
                "collared_shirt": "sub_top",
                "turtleneck": "sub_top",
                "halterneck": "sub_top",
                "off_shoulder": "sub_top",
                "strapless": "sub_top",
                "sleeveless": "sub_top",
                "long_sleeves": "sub_top",
                "short_sleeves": "sub_top",
                "puffy_sleeves": "sub_top",
                "frills": "sub_acc",
                "bow": "sub_acc",
                "ribbon": "sub_acc",
                "belt": "sub_acc",
                "suspenders": "sub_acc",
                "shorts_under_skirt": "sub_bottom",
                "legwear": "sub_shoes",
                "arm_support": "other",
                "armpits": "other",
                "caramelldansen": "other",
                "holding_hands": "other",
                "middle_finger": "other",
                "shushing": "other",
                "undressing": "other",
                "outstretched_arms": "other",
                "outstretched_arm": "other",
                "outstretched_hand": "other",
                "reaching": "other",
                "arm_up": "other",
                "presenting_armpit": "other",
                "presenting_panties": "other",
                "kimono_lift": "other",
                "skirt_lift": "other",
                "shared_food": "other",
                "adjusting_hair": "other",
                "adjusting_legwear": "other",
                "adjusting_panties": "other",
                "arm_grab": "other",
                "arm_hug": "other",
                "arms_around_neck": "other",
                "arms_at_sides": "other",
                "beckoning": "other",
                "carrying_over_shoulder": "other",
                "carrying_under_arm": "other",
                "paw_pose": "other",
                "claw_pose": "other",
                "clothes_lift": "other",
                "clothes_pull": "other",
                "bunching_hair": "other",
                "crossed_arms": "other",
                "cuddling": "other",
                "dress_lift": "other",
                "dual_wielding": "other",
                "feeding": "other",
                "glomp": "other",
                "hair_tucking": "other",
                "hair_twirling": "other",
                "hand_between_legs": "other",
                "hand_in_hair": "other",
                "hand_on_own_knee": "other",
                "hand_on_own_stomach": "other",
                "hand_to_own_mouth": "other",
                "index_finger_raised": "other",
                "lifted_by_self": "other",
                "necktie_grab": "other",
                "ok_sign": "other",
                "own_hands_together": "other",
                "rubbing_eyes": "other",
                "shading_eyes": "other",
                "sheet_grab": "other",
                "talking_on_phone": "other",
                "clenched_hand": "other",
                "raised_fist": "other",
                "stroking_own_chin": "other",
                "hat_tip": "other",
                "v_over_mouth": "other",
                "air_guitar": "other",
                "curtsey": "other",
                "heart_tail": "other",
                "victory_pose": "other",
                "orchid_fingers": "other",
                "holding_flower": "other",
                "smelling_flower": "other",
                "dress_tug": "other",
                "fetal_position": "other",
                "hugging_own_legs": "other",
                "indian_style": "other",
                "on_stomach": "other",
                "seiza": "other",
                "top-down_bottom-up": "other",
                "wariza": "other",
                "zombie_pose": "other",
                "leaning_back": "other",
                "leaning_to_the_side": "other",
                "on_back": "other",
                "on_side": "other",
                "reclining": "other",
                "the_pose": "other",
                "head_down": "other",
                "one_knee": "other",
                "butterfly_sitting": "other",
                "lotus_position": "other",
                "sitting_on_person": "other",
                "thigh_straddling": "other",
                "upright_straddle": "other",
                "legs_apart": "other",
                "balancing": "other",
                "wallwalking": "other",
                "prostration": "other",
                "cowering": "other",
                "faceplant": "other",
                "superhero_landing": "other",
                "handstand": "other",
                "yoga": "other",
                "slouching": "other",
                "crossed_ankles": "other",
                "leg_up": "other",
                "legs_over_head": "other",
                "split": "other",
                "standing_split": "other",
                "arm_around_neck": "other",
                "holding_own_foot": "other",
                "groping": "other",
                "blazer": "sub_top",
                "suit_jacket": "sub_top",
                "capelet": "sub_top",
                "cloak": "sub_top",
                "collared_jacket": "sub_top",
                "duffel_coat": "sub_top",
                "hooded_cape": "sub_top",
                "hooded_cloak": "sub_top",
                "hooded_coat": "sub_top",
                "hooded_jacket": "sub_top",
                "labcoat": "sub_top",
                "military_jacket": "sub_top",
                "tailcoat": "sub_top",
                "casual": "sub_top",
                "checkered_shirt": "sub_top",
                "dress_shirt": "sub_top",
                "gym_shirt": "sub_top",
                "oversized_shirt": "sub_top",
                "sailor_shirt": "sub_top",
                "tank_top": "sub_top",
                "unbuttoned_shirt": "sub_top",
                "wet_shirt": "sub_top",
                "cropped_shirt": "sub_top",
                "cropped_vest": "sub_top",
                "front-tie_top": "sub_top",
                "virgin_killer_sweater": "sub_top",
                "open-chest_sweater": "sub_top",
                "hooded_sweater": "sub_top",
                "hooded_track_jacket": "sub_top",
                "jersey": "sub_top",
                "load_bearing_vest": "sub_top",
                "lowleg": "sub_top",
                "detached_sleeves": "sub_top",
                "robe": "sub_top",
                "open_robe": "sub_top",
                "bare_shoulders": "sub_top",
                "open_clothes": "sub_top",
                "sleeves_folded_up": "sub_top",
                "sleeves_past_fingers": "sub_top",
                "sleeves_past_wrists": "sub_top",
                "sleeves_pushed_up": "sub_top",
                "layered_sleeves": "sub_top",
                "heart_cutout": "sub_top",
                "center_frills": "sub_top",
                "center_opening": "sub_top",
                "gathers": "sub_top",
                "high-waist_skirt": "sub_bottom",
                "pant_suit": "sub_bottom",
                "faulds": "sub_bottom",
                "dudou": "sub_full",
                "cat_lingerie": "sub_full",
                "elbow_gloves": "sub_shoes",
                "fingerless_gloves": "sub_shoes",
                "wrist_cuffs": "sub_shoes",
                "wristband": "sub_shoes",
                "half_gloves": "sub_shoes",
                "latex_gloves": "sub_shoes",
                "badge": "sub_acc",
                "arm_belt": "sub_acc",
                "bangle": "sub_acc",
                "bead_bracelet": "sub_acc",
                "bracer": "sub_acc",
                "armband": "sub_acc",
                "armlet": "sub_acc",
                "belly_chain": "sub_acc",
                "bandaged_arm": "sub_acc",
                "bandaged_hands": "sub_acc",
                "bandages": "sub_acc"
            },
            "objects": {
                "camera": "sub_elec",
                "chopsticks": "sub_food",
                "microphone": "sub_music",
                "sword": "sub_weapon",
                "gun": "sub_weapon",
                "handgun": "sub_weapon",
                "dagger": "sub_weapon",
                "scythe": "sub_weapon",
                "whip": "sub_weapon",
                "wand": "sub_weapon",
                "arrow": "sub_weapon",
                "umbrella": "sub_wear",
                "gohei": "sub_study",
                "ofuda": "sub_study",
                "cigarette": "sub_food",
                "guitar": "sub_music",
                "piano": "sub_music",
                "chair": "other",
                "backpack": "sub_wear",
                "smartphone": "sub_elec",
                "headphones": "sub_elec",
                "book": "sub_study",
                "scroll": "sub_study",
                "pen": "sub_study",
                "notebook": "sub_study",
                "teacup": "sub_food",
                "bowl": "sub_food",
                "plate": "sub_food",
                "bottle": "sub_food",
                "wine_glass": "sub_food",
                "flashlight": "sub_elec",
                "spray_can": "other",
                "bag": "sub_wear",
                "handbag": "sub_wear",
                "ribbon": "sub_wear",
                "necklace": "sub_wear",
                "bracelet": "sub_wear",
                "watch": "sub_wear",
                "ring": "sub_wear",
                "crown": "sub_wear",
                "mask": "sub_wear",
                "headband": "sub_wear",
                "hairpin": "sub_wear",
                "whistle": "sub_wear",
                "binoculars": "sub_wear",
                "fan": "sub_wear",
                "key": "sub_wear",
                "chains": "sub_wear"
            },
            "other": {
                "absurdres": "sub_imgtype",
                "back": "sub_imgtype",
                "checkered": "sub_imgtype",
                "everyone": "sub_imgtype",
                "highres": "sub_imgtype",
                "huge_filesize": "sub_imgtype",
                "incredibly_absurdres": "sub_imgtype",
                "lowres": "sub_imgtype",
                "original": "sub_imgtype",
                "parody": "sub_imgtype",
                "sample": "sub_imgtype",
                "wallpaper": "sub_imgtype",
                "masterpiece": "sub_imgtype",
                "best_quality": "sub_imgtype",
                "worst_quality": "sub_imgtype",
                "low_quality": "sub_imgtype",
                "normal_quality": "sub_imgtype",
                "error": "sub_imgtype",
                "extremely_detailed_cg_unity_8k_wallpaper": "sub_imgtype",
                "illustration": "sub_imgtype",
                "nsfw": "sub_imgtype",
                "3d": "sub_imgtype",
                "animated": "sub_imgtype",
                "animated_png": "sub_imgtype",
                "flash": "sub_imgtype",
                "video": "sub_imgtype",
                "music_video": "sub_imgtype",
                "animated_gif": "sub_imgtype",
                "easytoon": "sub_imgtype",
                "non-repeating_animation": "sub_imgtype",
                "looping_animation": "sub_imgtype",
                "roulette_animation": "sub_imgtype",
                "live2d": "sub_imgtype",
                "archived_file": "sub_imgtype",
                "artbook": "sub_imgtype",
                "calendar_(medium)": "sub_imgtype",
                "card_(medium)": "sub_imgtype",
                "comic": "sub_imgtype",
                "1koma": "sub_imgtype",
                "2koma": "sub_imgtype",
                "3koma": "sub_imgtype",
                "4koma": "sub_imgtype",
                "multiple_4koma": "sub_imgtype",
                "5koma": "sub_imgtype",
                "borderless_panels": "sub_imgtype",
                "eromanga": "sub_imgtype",
                "left-to-right_manga": "sub_imgtype",
                "right-to-left_comic": "sub_imgtype",
                "silent_comic": "sub_imgtype",
                "corrupted_file": "sub_imgtype",
                "cover": "sub_imgtype",
                "album_cover": "sub_imgtype",
                "character_single": "sub_imgtype",
                "cover_page": "sub_imgtype",
                "doujin_cover": "sub_imgtype",
                "dvd_cover": "sub_imgtype",
                "fake_cover": "sub_imgtype",
                "video_game_cover": "sub_imgtype",
                "magazine_cover": "sub_imgtype",
                "manga_cover": "sub_imgtype",
                "fake_screenshot": "sub_imgtype",
                "game_cg": "sub_imgtype",
                "gyotaku_(medium)": "sub_imgtype",
                "icon": "sub_imgtype",
                "logo": "sub_imgtype",
                "kirigami": "sub_imgtype",
                "lineart": "sub_imgtype",
                "no_lineart": "sub_imgtype",
                "outline": "sub_imgtype",
                "tall_image": "sub_imgtype",
                "wide_image": "sub_imgtype",
                "oekaki": "sub_imgtype",
                "official_art": "sub_imgtype",
                "phonecard": "sub_imgtype",
                "photo": "sub_imgtype",
                "papercraft": "sub_imgtype",
                "paper_child": "sub_imgtype",
                "paper_cutout": "sub_imgtype",
                "pixel_art": "sub_imgtype",
                "postcard": "sub_imgtype",
                "poster": "sub_imgtype",
                "revision": "sub_imgtype",
                "scan": "sub_imgtype",
                "anime_screencap": "sub_imgtype",
                "shitajiki": "sub_imgtype",
                "tegaki": "sub_imgtype",
                "triptych_(art)": "sub_imgtype",
                "vector_trace": "sub_imgtype",
                "tileable": "sub_imgtype",
                "widescreen": "sub_imgtype",
                "official_wallpaper": "sub_imgtype"
            }

        };app.registerExtension({
    name: "Comfy.NewbiePromptComposer",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "NewbiePromptCreator") return;
        window.hookAnimaNodeChrome(nodeType);

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onCreated?.apply(this, arguments);
            this.setSize([700, 1050]);
            this.title = animaTxt("🎨 NewBie 提示词创作器");
            window.applyAnimaNodeChrome(this);
            this.computeSize = () => [700, 1050];

            const node = this;
            const w = {};
            const _knownWidgets = new Set();
            // NB general widget names
            for (const [key] of NB_GENERAL_FIELDS) {
                _knownWidgets.add("nb_" + key);
            }
            _knownWidgets.add("nb_characters");
            _knownWidgets.add("nb_caption");

            function collapseHiddenWidgets() {
                for (const wg of node.widgets || []) {
                    if (!_knownWidgets.has(wg.name)) continue;
                    wg.computeSize = () => [0, -4];
                    wg.draw = function () {};
                    wg.serialize = true;
                    try { wg.hidden = true; } catch(e) {}
                    if (wg.options) wg.options.hidden = true;
                    else wg.options = { hidden: true };
                    wg.computedHeight = -4;
                    if (wg.element) {
                        wg.element.style.display = "none";
                        wg.element.style.height = "0px";
                        wg.element.style.minHeight = "0";
                        wg.element.style.margin = "0";
                        wg.element.style.padding = "0";
                        wg.element.style.overflow = "hidden";
                    }
                }
                try { node.setDirtyCanvas(true, true); } catch(e) {}
            }
            for (const wg of node.widgets || []) {
                w[wg.name] = wg;
            }
            collapseHiddenWidgets();

            function setW(n, v) {
                const gw = w[n];
                if (gw && gw.value !== v) { gw.value = v; node.setDirtyCanvas(true, true); }
            }
            function esc(s) { return (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

            const panel = document.createElement("div");
            panel.className = "apc-composer-panel";
            panel.style.cssText = "width:100%;height:100%;overflow-y:auto;padding:10px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:radial-gradient(ellipse 80% 55% at 100% -8%,rgba(var(--anima-glow-core-rgb),.5) 0%,transparent 58%),linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);color:#ffffff;font-weight:600;";

            function mkLabel(text, clr) {
                return $el("span", { textContent: text, style: { color: clr || "#ffffff", fontSize: "13px", fontWeight: "800", display: "block", marginBottom: "6px", letterSpacing: "0" } });
            }

            /* nb-skin-v1 */
            var _nbCardSkin = "flex-shrink:0;background:linear-gradient(165deg,rgba(var(--anima-accent-hi-rgb),.26) 0%,rgba(var(--anima-well-rgb),.42) 72%);border:1px solid rgba(var(--anima-accent-rgb),.38);border-radius:12px;padding:10px 12px;margin:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.22);";

            // ── 通用标签区（折叠）──
            const genCard = document.createElement("div");
            genCard.style.cssText = _nbCardSkin;
            const genHeader = document.createElement("div");
            genHeader.style.cssText = "display:flex;align-items:center;cursor:pointer;user-select:none;";
            genHeader.innerHTML = '<span style="color:#ffffff;font-weight:800;font-size:13px;letter-spacing:0;">' + animaTxt("📦 通用标签") + '</span><span style="color:var(--anima-mute);font-size:12px;font-weight:600;margin-left:8px;">' + animaTxt("(点击展开/折叠)") + '</span>';
            const genBody = document.createElement("div");
            genBody.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:8px;";
            let _genOpen = true;

            /* nb-chip-v1-general */
            var _nbChipTransPending = {};
            function _nbParseTags(s) {
                return String(s || "").split(/[,，]+/).map(function(x) { return x.trim(); }).filter(Boolean);
            }
            function _nbJoinTags(arr) {
                return (arr || []).join(", ");
            }
            function _nbCnForTag(tag) {
                if (!tag) return "";
                var t = String(tag).trim();
                var cn = NB_PRESET_TRANSLATIONS[t] || NB_PRESET_TRANSLATIONS[t.replace(/ /g, "_")] || NB_PRESET_TRANSLATIONS[t.replace(/_/g, " ")] || "";
                if (cn) return cn;
                try {
                    var a = JSON.parse(localStorage.getItem("nb_custom_translations") || "{}");
                    cn = a[t] || a[t.replace(/ /g, "_")] || a[t.replace(/_/g, " ")] || "";
                    if (cn) return cn;
                    var b = JSON.parse(localStorage.getItem("apc_custom_translations") || "{}");
                    cn = b[t] || b[t.replace(/ /g, "_")] || b[t.replace(/_/g, " ")] || "";
                    if (cn) return cn;
                    var c = JSON.parse(localStorage.getItem("apc_translations") || "{}");
                    cn = c[t] || c[t.replace(/ /g, "_")] || c[t.replace(/_/g, " ")] || "";
                    if (cn) return cn;
                } catch (e0) {}
                return "";
            }
            function _nbSaveChipCn(tag, cn) {
                if (!tag || !cn) return;
                try {
                    var a = JSON.parse(localStorage.getItem("nb_custom_translations") || "{}");
                    a[tag] = cn;
                    localStorage.setItem("nb_custom_translations", JSON.stringify(a));
                } catch (e1) {}
                try {
                    var b = JSON.parse(localStorage.getItem("apc_custom_translations") || "{}");
                    if (!b[tag]) { b[tag] = cn; localStorage.setItem("apc_custom_translations", JSON.stringify(b)); }
                } catch (e2) {}
            }
            function _nbFetchChipCn(tags, done) {
                var need = [];
                var i;
                for (i = 0; i < tags.length; i++) {
                    if (!_nbCnForTag(tags[i]) && !_nbChipTransPending[tags[i]]) need.push(tags[i]);
                }
                if (!need.length) return;
                for (i = 0; i < need.length; i++) _nbChipTransPending[need[i]] = true;
                fetch("/danbooru_anima/translate_tags", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: need, cloud: false })
                }).then(function(r) { return r.json(); }).then(function(d) {
                    var tr = (d && d.success && d.translations) ? d.translations : {};
                    for (i = 0; i < need.length; i++) {
                        delete _nbChipTransPending[need[i]];
                        if (tr[need[i]]) _nbSaveChipCn(need[i], tr[need[i]]);
                    }
                    if (done) done();
                }).catch(function() {
                    for (i = 0; i < need.length; i++) delete _nbChipTransPending[need[i]];
                    if (done) done();
                });
            }
            function _nbMkChip(tag, onX) {
                var cn = _nbCnForTag(tag);
                var chip = document.createElement("span");
                chip.className = "nb-tag-chip";
                chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 6px 2px 8px;border-radius:999px;border:1px solid rgba(var(--anima-accent-rgb),0.28);background:rgba(var(--anima-accent-rgb),0.10);color:var(--anima-ink-chip);line-height:1.25;cursor:default;";
                var main = document.createElement("span");
                main.style.cssText = "font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;";
                var showCn = !!(cn && cn !== tag);
                main.textContent = showCn ? cn : tag;
                chip.appendChild(main);
                if (showCn) {
                    var sub = document.createElement("span");
                    sub.style.cssText = "font-size:10px;font-weight:500;color:var(--anima-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;";
                    sub.textContent = tag;
                    chip.appendChild(sub);
                }
                var x = document.createElement("span");
                x.textContent = "\u00d7";
                x.title = "\u5220\u9664\u6b64\u6807\u7b7e";
                x.style.cssText = "flex-shrink:0;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:12px;line-height:1;cursor:pointer;color:rgba(255,255,255,0.55);";
                x.onmouseenter = function() { x.style.background = "rgba(233,69,96,0.85)"; x.style.color = "#fff"; };
                x.onmouseleave = function() { x.style.background = "transparent"; x.style.color = "rgba(255,255,255,0.55)"; };
                x.onclick = function(ev) { ev.stopPropagation(); onX(); };
                chip.appendChild(x);
                return chip;
            }
            function _attachChipField(src, key, onCommit) {
                if (!src || src._nbChipOn || src.tagName !== "INPUT") return src;
                src._nbChipOn = true;
                src.classList.add("nb-chip-src");
                var wrap = document.createElement("div");
                wrap.className = "nb-chip-wrap";
                wrap.style.cssText = "position:relative;width:100%;min-height:28px;padding:3px 18px 3px 4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:4px;cursor:text;";
                var trail = document.createElement("input");
                trail.type = "text";
                trail.className = "nb-chip-trail";
                trail.placeholder = src.placeholder || "";
                trail.style.cssText = "flex:1 1 72px;min-width:56px;border:none;outline:none;background:transparent;color:#fff;font-size:12px;padding:2px 4px;";
                var proto = HTMLInputElement.prototype;
                var desc = Object.getOwnPropertyDescriptor(proto, "value");
                var lock = false;
                function rawGet() { return desc.get.call(src); }
                function rawSet(v) { lock = true; desc.set.call(src, v == null ? "" : String(v)); lock = false; }
                function commitTags(arr) {
                    rawSet(_nbJoinTags(arr));
                    if (typeof onCommit === "function") onCommit(rawGet());
                    else {
                        setW("nb_" + key, rawGet());
                        refreshPreview();
                    }
                    paint();
                }
                function paint() {
                    var tags = _nbParseTags(rawGet());
                    wrap.querySelectorAll(".nb-tag-chip").forEach(function(n) { n.remove(); });
                    tags.forEach(function(tag, idx) {
                        wrap.insertBefore(_nbMkChip(tag, function() {
                            var next = _nbParseTags(rawGet());
                            next.splice(idx, 1);
                            commitTags(next);
                        }), trail);
                    });
                    trail.placeholder = tags.length ? "" : (src.placeholder || "");
                }
                function render() {
                    paint();
                    _nbFetchChipCn(_nbParseTags(rawGet()), paint);
                }
                function absorbTrail() {
                    var extra = _nbParseTags(trail.value);
                    trail.value = "";
                    if (!extra.length) return;
                    var cur = _nbParseTags(rawGet());
                    extra.forEach(function(t) { if (cur.indexOf(t) < 0) cur.push(t); });
                    commitTags(cur);
                }
                var composing = false;
                trail.addEventListener("compositionstart", function() { composing = true; });
                trail.addEventListener("compositionend", function() {
                    composing = false;
                    if (/[,，]/.test(trail.value)) absorbTrail();
                });
                trail.addEventListener("input", function() {
                    if (composing) return;
                    if (/[,，]/.test(trail.value)) absorbTrail();
                });
                trail.addEventListener("keydown", function(ev) {
                    if (ev.isComposing || composing) return;
                    if (ev.key === "Enter") {
                        ev.preventDefault();
                        absorbTrail();
                    } else if (ev.key === "Backspace" && !trail.value) {
                        var cur = _nbParseTags(rawGet());
                        if (cur.length) { ev.preventDefault(); cur.pop(); commitTags(cur); }
                    }
                });
                trail.addEventListener("blur", function() { absorbTrail(); });
                wrap.addEventListener("click", function(ev) {
                    if (ev.target.closest && ev.target.closest(".nb-tag-chip")) return;
                    if (ev.target === trail) return;
                    trail.focus();
                });
                src.style.cssText += ";position:absolute;left:0;top:0;opacity:0;width:1px;height:1px;padding:0;margin:0;border:0;overflow:hidden;pointer-events:none;";
                src.tabIndex = -1;
                var prevOnInput = src.oninput;
                src.oninput = function(ev) {
                    if (lock) return;
                    if (typeof prevOnInput === "function") prevOnInput.call(src, ev);
                };
                if (src.parentNode) {
                    src.parentNode.insertBefore(wrap, src);
                    wrap.appendChild(src);
                }
                if (src.dataset) {
                    if (src.dataset.charIdx != null) trail.dataset.charIdx = src.dataset.charIdx;
                    if (src.dataset.charKey) trail.dataset.charKey = src.dataset.charKey;
                }
                wrap.appendChild(trail);
                src._nbChipWrap = wrap;
                Object.defineProperty(src, "value", {
                    get: function() { return rawGet(); },
                    set: function(v) {
                        rawSet(v);
                        if (!lock) render();
                    },
                    configurable: true
                });
                render();
                return src;
            }
            function _mkGenInput(key, ph) {
                const wk = "nb_" + key;
                const multiline = ["objects", "other", "caption"].indexOf(key) >= 0;
                if (multiline) {
                    const ta = document.createElement("textarea");
                    ta.value = w[wk]?.value || "";
                    ta.placeholder = ph || "";
                    ta.style.cssText = "width:100%;padding:4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;outline:none;resize:none;box-sizing:border-box;height:36px;";
                    ta.oninput = () => { setW(wk, ta.value); refreshPreview(); };
                    return ta;
                }
                const inp = document.createElement("input");
                inp.type = "text";
                inp.value = w[wk]?.value || "";
                inp.placeholder = ph || "";
                inp.style.cssText = "width:100%;padding:4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;outline:none;box-sizing:border-box;";
                inp.oninput = () => { setW(wk, inp.value); refreshPreview(); };
                return inp;
            }

            function _showDropdown(key, inp, onFill) {
                var tags = NB_PRESETS[key] || [];
                var menu = document.createElement("div");
                menu.style.cssText = "position:fixed;z-index:100005;background:var(--anima-well);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:4px;min-width:120px;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.55);";
                for (var _di=0; _di<tags.length; _di++) {
                    var _dv = tags[_di];
                    var _dr = document.createElement("div");
                    _dr.textContent = (NB_PRESET_TRANSLATIONS[_dv] || _dv);
                    _dr.style.cssText = "padding:5px 10px;cursor:pointer;font-size:13px;color:var(--anima-ink-chip);border-radius:4px;white-space:nowrap;";
                    _dr.onmouseover = function(){ this.style.background="rgba(255,255,255,0.06)"; };
                    _dr.onmouseout = function(){ this.style.background="transparent"; };
                    (function(t){ _dr.onclick = function(){ menu.remove(); onFill(t); }; })(_dv);
                    menu.appendChild(_dr);
                }
                document.body.appendChild(menu);
                var _anchor = (inp && inp._nbChipWrap) || inp;
                var _rect = _anchor.getBoundingClientRect();
                menu.style.left = _rect.left + "px";
                menu.style.top = (_rect.bottom + 4 > window.innerHeight-200 ? _rect.top - menu.offsetHeight - 4 : _rect.bottom + 4) + "px";
                setTimeout(function(){ document.addEventListener("click", function _h(e){ if(!menu.contains(e.target)){menu.remove();document.removeEventListener("click",_h);} }); }, 0);
                return menu;
            }
            function _mkLabelBtn(key, label, inp, onFill) {
                var _ic = NB_LABEL_ICONS[key];
                if (!_ic) {
                    var _lb = document.createElement("span");
                    _lb.textContent = animaTxt(label);
                    _lb.style.cssText = "color:var(--anima-mute);font-size:12px;min-width:42px;white-space:nowrap;text-align:right;";
                    return _lb;
                }
                var _btn = document.createElement("span");
                _btn.textContent = _ic[0] + " " + animaTxt(label);
                _btn.style.cssText = "padding:2px 7px;border-radius:4px;cursor:pointer;font-size:12px;line-height:1.3;white-space:nowrap;min-width:42px;user-select:none;transition:all 0.12s;display:inline-flex;align-items:center;justify-content:center;";
                if (_ic[1] === "drop") {
                    _btn.style.cssText += "border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:var(--anima-ink-chip);";
                    _btn.onmouseover = function(){ _btn.style.background="rgba(255,255,255,0.1)"; _btn.style.color="#ffffff"; };
                    _btn.onmouseout = function(){ _btn.style.background="rgba(255,255,255,0.04)"; _btn.style.color="var(--anima-ink-chip)"; };
                    _btn.onclick = function(){ _showDropdown(key, inp, onFill); };
                } else if (_ic[1] === "popup") {
                    _btn.style.cssText += "border:1px solid rgba(var(--anima-accent-rgb),0.3);background:rgba(var(--anima-accent-rgb),0.06);color:var(--anima-accent-soft);";
                    _btn.onmouseover = function(){ _btn.style.background="rgba(var(--anima-accent-rgb),0.15)"; _btn.style.borderColor="var(--anima-accent-soft)"; };
                    _btn.onmouseout = function(){ _btn.style.background="rgba(var(--anima-accent-rgb),0.06)"; _btn.style.borderColor="rgba(var(--anima-accent-rgb),0.3)"; };
                    _btn.onclick = function(){
                        showNbTagPopup(key, function(tag, isM){ onFill(tag, isM); });
                    };
                }
                return _btn;
            }
            function _makeGenField(key, label, ph) {
                var wrap = document.createElement("div");
                wrap.style.cssText = "display:flex;align-items:center;gap:3px;flex:1;min-width:0;";
                var _inpEl = _mkGenInput(key, ph);
                var _iw = document.createElement("div");
                _iw.style.cssText = "position:relative;flex:1;min-width:0;";
                _inpEl.style.cssText += ";width:100%;padding-right:16px;box-sizing:border-box;";
                _iw.appendChild(_inpEl);
                if (_inpEl.tagName === "INPUT") _attachChipField(_inpEl, key);
                var _x2 = document.createElement("span");
                _x2.textContent = "✕"; _x2.title = animaTxt("清空");
                _x2.style.cssText = "position:absolute;top:0;bottom:0;right:4px;cursor:pointer;color:#e94560;font-size:7px;line-height:1;display:none;align-items:center;z-index:2;";
                _x2.onclick = function(e2){ e2.stopPropagation(); _inpEl.value = ""; setW("nb_" + key, ""); refreshPreview(); };
                _iw.appendChild(_x2);
                _iw.onmouseenter = function(){ _x2.style.display="flex"; };
                _iw.onmouseleave = function(){ _x2.style.display="none"; };
                var _onFill = function(v, isMulti){
                if (isMulti) {
                    var cur2 = (_inpEl.value||"").trim();
                    var parts2 = cur2 ? cur2.split(/[,，]+/).map(function(s){return s.trim();}).filter(Boolean) : [];
                    if (parts2.indexOf(v) < 0) { parts2.push(v); _inpEl.value = parts2.join(", "); }
                } else { _inpEl.value = v; }
                setW("nb_" + key, _inpEl.value); refreshPreview();
            };
                var _lb = _mkLabelBtn(key, label, _inpEl, _onFill);
                wrap.appendChild(_lb);
                wrap.appendChild(_iw);
                return wrap;
            }
            function _makeGenRow(fields) {
                var row = document.createElement("div");
                row.style.cssText = "display:flex;gap:8px;margin-bottom:0;";
                for (var _fi = 0; _fi < fields.length; _fi++) {
                    row.appendChild(_makeGenField(fields[_fi][0], fields[_fi][1], fields[_fi][2]));
                }
                genBody.appendChild(row);
            }
            // 存储 general inputs 用于 widget 恢复后的刷新
            var _genInputRefs = {};
            var _origMakeGenField = _makeGenField;
            _makeGenField = function(key, label, ph) {
                var els = _origMakeGenField(key, label, ph);
                _genInputRefs[key] = els.querySelector("input,textarea");
                return els;
            };
            // 紧凑配对
            _makeGenRow([["count","计数","1girl, 2girls"], ["style","风格","anime style"], ["perspective","视角","from_above"], ["background","背景类型","cityscape"]]);
            _makeGenRow([["artists","画师","artist:name"]]);
            _makeGenRow([["atmosphere","氛围","cheerful"], ["lighting","光照","sunlight"], ["quality","质量","very aesthetic, masterpiece, no text"]]);
            _makeGenRow([["objects","物品","furniture, weapons"]]);
            _makeGenRow([["other","其他","未涵盖的标签"]]);
            genCard.appendChild(genHeader);
            genCard.appendChild(genBody);
            genHeader.onclick = () => {
                _genOpen = !_genOpen;
                genBody.style.display = _genOpen ? "flex" : "none";
            };
            panel.appendChild(genCard);

            // ── 自然语言 ──
            const nlCard = document.createElement("div");
            nlCard.style.cssText = _nbCardSkin;
            nlCard.appendChild(mkLabel("💬 自然语言", "var(--anima-accent-soft)"));
            const nlRow = document.createElement("div");
            nlRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px;";
            const nlInp = document.createElement("input");
            nlInp.type = "text";
            nlInp.value = w.nb_caption?.value || "";
            nlInp.placeholder = animaTxt("用中文描述画面内容...");
            nlInp.style.cssText = "flex:1;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;";
            nlInp.oninput = () => { setW("nb_caption", nlInp.value); refreshPreview(); };
            nlRow.appendChild(nlInp);
            const nlTransBtn = document.createElement("button");
            nlTransBtn.textContent = "🌐"; nlTransBtn.title = animaTxt("翻译为英文");
            nlTransBtn.style.cssText = "padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.22);cursor:pointer;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);font-size:12px;white-space:nowrap;";
            nlTransBtn.onclick = function(){
                var q = nlInp.value.trim(); if (!q) return;
                nlTransBtn.textContent = "..."; nlTransBtn.disabled = true;
                var _tf = window.animaTranslateFields();
                var _missNb = window.animaTransConfigError(_tf.cfg);
                if (_missNb) { alert(_missNb); nlTransBtn.textContent = "🌐"; nlTransBtn.disabled = false; return; }
                fetch("/danbooru_anima/cloud_translate", {
                    method:"POST", headers:{"Content-Type":"application/json"},
                    body: JSON.stringify({tags:[q], provider:_tf.provider, api_key:_tf.api_key, model:_tf.model, base_url:_tf.base_url, baidu_appid:_tf.baidu_appid, as_sentence:true, from_lang:"zh", to_lang:"en"})
                }).then(function(r){return r.json()}).then(function(d){
                    var en = ""; if (d.success && d.translations) en = (Object.values(d.translations)[0] || "").replace(/\.$/,"");
                    nlResult.textContent = en;
                    if (en) { setW("nb_caption", en); refreshPreview(); }
                    nlTransBtn.textContent = "🌐"; nlTransBtn.disabled = false;
                }).catch(function(){ nlTransBtn.textContent = "🌐"; nlTransBtn.disabled = false; });
            };
            nlRow.appendChild(nlTransBtn);
            nlCard.appendChild(nlRow);
            const nlResult = document.createElement("div");
            nlResult.style.cssText = "color:var(--anima-accent-soft);font-size:12px;word-break:break-all;min-height:16px;";
            nlCard.appendChild(nlResult);
            panel.appendChild(nlCard);

            // ── 工具栏 ──
            const toolbar = document.createElement("div");
            toolbar.style.cssText = _nbCardSkin + "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
            var _mkToolBtn = function(icon, title) {
                var _btn = document.createElement("span");
                _btn.textContent = icon; _btn.title = title;
                _btn.style.cssText = "width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;font-size:14px;background:rgba(255,255,255,.08);color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.16);transition:all 0.15s ease;user-select:none;vertical-align:middle;";
                _btn.onmouseenter = function(){ this.style.background="rgba(var(--anima-accent-rgb),0.16)"; this.style.color="var(--anima-accent-soft)"; this.style.borderColor="rgba(var(--anima-accent-rgb),0.45)"; this.style.transform="translateY(-1px)"; };
                _btn.onmouseleave = function(){ this.style.background="rgba(255,255,255,.08)"; this.style.color="var(--anima-accent-soft)"; this.style.borderColor="rgba(255,255,255,.16)"; this.style.transform=""; };
                return _btn;
            };
            // ── 角色分组 ──
            const grpChar = document.createElement("div");
            grpChar.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:10px;background:rgba(var(--anima-accent-hi-rgb),.22);border:1px solid rgba(var(--anima-accent-rgb),.28);";
            const grpCharLbl = document.createElement("span");
            grpCharLbl.textContent = animaTxt("👤 角色");
            grpCharLbl.style.cssText = "color:#e2c48a;font-size:12px;font-weight:600;margin-right:3px;user-select:none;white-space:nowrap;";
            grpChar.appendChild(grpCharLbl);
            toolbar.appendChild(grpChar);
            var tbSearchChar = _mkToolBtn("🌐", "搜角色 (Animadex)");
            tbSearchChar.onclick = function(){ if(!_characters.length){alert("请先添加至少一个角色");return;} window._adexOnSelect = function(ch){ _showCharSlotPicker(ch, function(i){ _nbFillCharFromPick(ch, i); }); }; if(typeof window.openAdexPopup==="function") window.openAdexPopup("char"); };
            var _lbl1 = document.createElement("span"); _lbl1.textContent = "ADex"; _lbl1.style.cssText = "color:var(--anima-mute);font-size:12px;margin-right:6px;";
            grpChar.appendChild(tbSearchChar);
            var tbGelChar = _mkToolBtn("🔍", "搜角色 (G站)");
            tbGelChar.onclick = function(){ if(!_characters.length){alert("请先添加至少一个角色");return;} window._adexOnSelect = function(ch){ _showCharSlotPicker(ch, function(i){ _nbFillCharFromPick(ch, i); }); }; if(typeof window.openGelCharsPopup==="function") window.openGelCharsPopup(); };
            var _lbl1b = document.createElement("span"); _lbl1b.textContent = animaTxt("G站"); _lbl1b.style.cssText = "color:var(--anima-mute);font-size:12px;margin-right:10px;";
            grpChar.appendChild(tbGelChar);
            // ── 画师分组 ──
            const grpArt = document.createElement("div");
            grpArt.style.cssText = "display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:10px;background:rgba(var(--anima-accent-hi-rgb),.22);border:1px solid rgba(var(--anima-accent-rgb),.28);";
            const grpArtLbl = document.createElement("span");
            grpArtLbl.textContent = animaTxt("🎨 画师");
            grpArtLbl.style.cssText = "color:#e8d48a;font-size:12px;font-weight:600;margin-right:3px;user-select:none;white-space:nowrap;";
            grpArt.appendChild(grpArtLbl);
            toolbar.appendChild(grpArt);
            var tbArtistSearch = _mkToolBtn("🎨", "搜画师 (Animadex)");
            var _lbl2 = document.createElement("span"); _lbl2.textContent = animaTxt("画师"); _lbl2.style.cssText = "color:var(--anima-mute);font-size:13px;margin-right:10px;";
            grpArt.appendChild(tbArtistSearch);
            tbArtistSearch.onclick = function(){
                window._adexOnSelect = function(a){
                    var nm = ((a&&a.name)||"").trim().replace(/^@+/,"");
                    if (!nm) return;
                    try {
                        var cur = (w.nb_artists?.value||"").split(/[,，]+/).map(function(s){return s.trim().replace(/^@+/,"");}).filter(Boolean);
                        if (cur.indexOf(nm) < 0) cur.push(nm);
                        setW("nb_artists", cur.join(", "));
                        if (_genInputRefs && _genInputRefs["artists"]) { _genInputRefs["artists"].value = cur.join(", "); }
                        refreshPreview();
                    } catch(e){ console.error(e); }
                };
                if (typeof window.openArtistBrowse === "function") window.openArtistBrowse();
            };
            var tbArtistFav = _mkToolBtn("⭐", "画师收藏夹");
            var _lbl3 = document.createElement("span"); _lbl3.textContent = animaTxt("收藏"); _lbl3.style.cssText = "color:var(--anima-mute);font-size:13px;";
            grpArt.appendChild(tbArtistFav);
            tbArtistFav.onclick = function(){
                window._artistFavOnSelect = function(nm){
                    nm = (nm||"").trim().replace(/^@+/,"");
                    if (!nm) return;
                    try {
                        var cur = (w.nb_artists?.value||"").split(/[,，]+/).map(function(s){return s.trim().replace(/^@+/,"");}).filter(Boolean);
                        if (cur.indexOf(nm) < 0) cur.push(nm);
                        setW("nb_artists", cur.join(", "));
                        if (_genInputRefs && _genInputRefs["artists"]) { _genInputRefs["artists"].value = cur.join(", "); }
                        refreshPreview();
                    } catch(e){ console.error(e); }
                };
                if (typeof window.showArtistFavPopup === "function") window.showArtistFavPopup("danbooru");
            };
            panel.appendChild(toolbar);

            // ── 角色区 ──
            const charContainer = document.createElement("div");
            charContainer.style.cssText = "display:flex;flex-direction:column;gap:8px;flex-shrink:0;";
            panel.appendChild(charContainer);

            let _characters = [];
            const _charWidget = w["nb_characters"];  // 直接引用，避免 widget 丢失
            try { _characters = JSON.parse(_charWidget?.value || "[]"); } catch (e) { _characters = []; }

            function syncChars() {
                var _ser = JSON.parse(JSON.stringify(_characters));
                for (var _s1 = 0; _s1 < _ser.length; _s1++) {
                    for (var _fk in _ser[_s1]) {
                        if (Array.isArray(_ser[_s1][_fk])) _ser[_s1][_fk] = _ser[_s1][_fk].join(", ");
                    }
                }
                if (_charWidget) { _charWidget.value = JSON.stringify(_ser); node.setDirtyCanvas(true, true); }
                refreshPreview();
            }

            
            // ── 角色槽位选择器 ──
            function _showCharSlotPicker(ch, onPick) {
                var _ov = document.createElement("div");
                _ov.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:transparent;z-index:100010;display:flex;align-items:center;justify-content:center;";
                _ov.onclick = function(e2){ if (e2.target===_ov) { _ov.remove(); } };
                var _bx = document.createElement("div");
                _bx.style.cssText = "background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;min-width:260px;box-shadow:0 20px 60px rgba(0,0,0,0.8);";
                _bx.innerHTML = '<h3 style="color:#ffffff;margin:0 0 12px;font-size:14px;">输出到哪个角色？</h3>';
                for (var _ci=0; _ci<_characters.length; _ci++) {
                    (function(i){
                        var _row = document.createElement("div");
                        _row.textContent = animaTxt("👤 角色 ") + (i+1) + (_characters[i].n ? " ("+_characters[i].n+")" : "");
                        _row.style.cssText = "padding:8px 12px;border-radius:6px;cursor:pointer;color:#ffffff;font-size:13px;margin-bottom:4px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);transition:all 0.2s ease;";
                        _row.onmouseover = function(){ _row.style.background="rgba(var(--anima-accent-rgb),0.1)"; _row.style.borderColor="var(--anima-accent-soft)"; };
                        _row.onmouseout = function(){ _row.style.background="rgba(255,255,255,0.03)"; _row.style.borderColor="rgba(255,255,255,0.06)"; };
                        _row.onclick = function(){ _ov.remove(); onPick(i); };
                        _bx.appendChild(_row);
                    })(_ci);
                }
                _ov.appendChild(_bx); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_bx); document.body.appendChild(_ov);
            }

            
            // ── 角色卡弹窗（NewBie 独立版）──
            function _nbClassifyTag(t) {
                // 复用 G站 classify_general_gelbooru 规则（JS 简化版，兼容空格/下划线）
                var tl = t.toLowerCase().replace(/ /g, "_");
                var bodySuffix = ['_hair','_eyes','_ears','_nose','_mouth','_breasts','_nipple','_hips','_legs','_arms','_tail','_horn','_skin','_face','_body','_figure','_frame','_head','_chest'];
                var bodyKw = ['blonde','black_hair','brown_hair','red_hair','blue_eyes','green_eyes','tall','short','slender','chubby','muscular','petite','big_breasts','flat_chest','long_hair','short_hair','twintails','ponytail','ahoge','bangs','sidelocks'];
                var clothSuffix = ['_shirt','_dress','_skirt','_shorts','_pants','_gloves','_shoes','_boots','_socks','_hat','_jacket','_coat','_belt','_scarf','_tie','_bow','_ribbon','_stockings','_leggings','_collar','_cuff','_crown','_kimono','_uniform','_sweater','_hoodie','_blouse','_vest','_suit','_cape','_apron','_leotard','_bikini','_swimsuit','_underwear','_panties','_bra','_skirt'];
                var clothKw = ['school_uniform','serafuku','maid_outfit','nurse_outfit','sailor_collar','plaid_skirt','thighhighs','kneehighs','pantyhose','armor'];
                if (clothSuffix.some(function(s){ return tl.endsWith(s); }) || clothKw.indexOf(tl) >= 0) return "clothing";
                if (bodySuffix.some(function(s){ return tl.endsWith(s); }) || bodyKw.indexOf(tl) >= 0) return "appearance";
                // 兜底：常用服装词
                if (tl.indexOf('dress')>=0 || tl.indexOf('skirt')>=0 || tl.indexOf('suit')>=0 || tl.indexOf('uniform')>=0) return "clothing";
                return "other";
            }
            function _nbNormPickTags(t) {
                if (!t) return [];
                if (Array.isArray(t)) return t.map(function(x){ return String(x).trim(); }).filter(Boolean);
                var s = String(t).trim();
                if (!s) return [];
                if (/[,，]/.test(s)) return s.split(/[,，]+/).map(function(x){ return x.trim(); }).filter(Boolean);
                return s.split(/\s+/).filter(Boolean);
            }
            function _nbFillCharFromPick(ch, i) {
                if (!ch) return;
                var nm = (ch.name || "").trim();
                if (nm) _characters[i].n = nm;
                var tags = _nbNormPickTags(ch.tags);
                var skip = nm.replace(/[\s-]+/g, "_").toLowerCase();
                var app = [], cloth = [];
                for (var ti = 0; ti < tags.length; ti++) {
                    var t = tags[ti];
                    var tl = t.replace(/ /g, "_").toLowerCase();
                    if (!tl || tl === skip) continue;
                    if (/^\d/.test(tl)) continue;
                    if (/^(1girl|1boy|1other|solo|multiple_girls|multiple_boys)$/i.test(tl)) continue;
                    var cat = _nbClassifyTag(t);
                    if (cat === "appearance" && app.indexOf(t) < 0) app.push(t);
                    else if (cat === "clothing" && cloth.indexOf(t) < 0) cloth.push(t);
                }
                if (app.length) _characters[i].appearance = app;
                if (cloth.length) _characters[i].clothing = cloth;
                try { syncChars(); } catch (e) { console.error(e); }
                try { renderChars(); } catch (e) { console.error(e); }
            }
            function _openNbCharCard(charIdx) {
                var ov = document.createElement("div");
                ov.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:100005;display:flex;align-items:center;justify-content:center;pointer-events:none;";
                ov.onclick = function(e){ if(e.target===ov) { _nbccClean(); ov.remove(); } };
                var bx = document.createElement("div");
                bx.style.cssText = "background:linear-gradient(180deg,#1c2228 0%,#14181c 140px);border:1px solid #2a3238;border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,0.7);padding:12px;width:650px;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;pointer-events:auto;";
                bx.style.cursor = "grab";
                bx.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span style="color:var(--anima-accent-soft);font-weight:bold;font-size:15px;">🎴 角色卡 · 输出到角色 '+(charIdx+1)+'</span><button id="nbcc-close" style="padding:3px 10px;border-radius:999px;border:1px solid rgba(233,69,96,0.4);cursor:pointer;background:linear-gradient(135deg,rgba(233,69,96,0.15),rgba(233,69,96,0.06));color:#e94560;font-size:12px;font-weight:bold;">关闭</button></div><div id="nbcc-grid" style="color:var(--anima-mute);text-align:center;padding:20px;">加载中...</div>';
                bx.querySelector("#nbcc-close").onclick = function(){ _nbccClean(); ov.remove(); };
                // 拖拽 + 位置记忆
                var _nbccDrag=false,_nbccDx=0,_nbccDy=0;
                var _nbccMove=function(e2){ if(!_nbccDrag)return; bx.style.left=(e2.clientX-_nbccDx)+"px"; bx.style.top=(e2.clientY-_nbccDy)+"px"; window.clampPopup(bx); };
                var _nbccUp=function(){ _nbccDrag=false; try{ localStorage.setItem("nb_char_card_pos",JSON.stringify({left:bx.offsetLeft,top:bx.offsetTop})); }catch(e){} };
                var _nbccClean=function(){ document.removeEventListener("mousemove",_nbccMove); document.removeEventListener("mouseup",_nbccUp); };
                bx.addEventListener("mousedown",function(e2){ if(e2.target.tagName==="BUTTON")return; _nbccDrag=true;_nbccDx=e2.clientX-bx.offsetLeft;_nbccDy=e2.clientY-bx.offsetTop;bx.style.position="fixed";bx.style.margin="0";bx.style.left=bx.offsetLeft+"px";bx.style.top=bx.offsetTop+"px";e2.preventDefault(); });
                document.addEventListener("mousemove",_nbccMove);
                document.addEventListener("mouseup",_nbccUp);
                try{ var _p=JSON.parse(localStorage.getItem("nb_char_card_pos")||"{}"); if(_p.left){ bx.style.left=_p.left+"px"; bx.style.top=_p.top+"px"; bx.style.position="fixed"; bx.style.margin="0"; } }catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);
                ov.appendChild(bx); document.body.appendChild(ov);
                var grid = bx.querySelector("#nbcc-grid");
                fetch("/anima_random/character_cards").then(function(r){ return r.json(); }).then(function(d){
                    var cards = d.cards || [];
                    grid.innerHTML = ""; grid.style.display = "grid"; grid.style.gridTemplateColumns = "repeat(auto-fill,minmax(180px,1fr))"; grid.style.gap = "8px";
                    if (!cards.length) { grid.style.display = "block"; grid.innerHTML = '<div style="color:var(--anima-mute);text-align:center;padding:20px;">暂无角色卡</div>'; return; }
                    for (var ci=0; ci<cards.length; ci++) {
                        (function(cd){
                            var card = document.createElement("div");
                            card.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:4px;border-radius:6px;background:var(--anima-well);border:1px solid rgba(255,255,255,.16);position:relative;cursor:pointer;transition:all 0.2s ease;";
                            card.onmouseover = function(){ card.style.borderColor="var(--anima-accent-soft)"; card.style.transform="translateY(-2px)"; card.style.boxShadow="0 4px 12px rgba(var(--anima-accent-rgb),0.22)"; };
                            card.onmouseout = function(){ card.style.borderColor="var(--anima-accent-hi)"; card.style.transform=""; card.style.boxShadow=""; };
                            card.onclick = null;
                            // 输出按钮
                            var outBtn = document.createElement("button");
                            outBtn.textContent = animaTxt("输出"); outBtn.title = animaTxt("输出到角色 ") + (charIdx+1);
                            outBtn.style.cssText = "padding:2px 8px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:var(--anima-accent-hi);color:var(--anima-accent-soft);font-size:12px;border:1px solid rgba(var(--anima-accent-rgb),0.3);";
                            outBtn.onclick = function(e2){
                                e2.stopPropagation();
                                outBtn.disabled = true;
                                var _fin = function(c2){
                                    _nbFillCharFromPick({name: (c2 && c2.name) || cd.name || "", tags: (c2 && c2.tags) || cd.tags || []}, charIdx);
                                    _nbccClean(); ov.remove();
                                };
                                if (typeof window.ensureAdexCardTags === "function") {
                                    window.ensureAdexCardTags(cd).then(_fin).catch(function(){ _fin(cd); });
                                } else {
                                    _fin(cd);
                                }
                            };
                            card.appendChild(outBtn);
                            if (cd.thumb) {
                                var tn = document.createElement("img");
                                tn.src = cd.thumb; tn.loading = "lazy"; tn.decoding = "async";
                                tn.style.cssText = "width:100%;height:100px;object-fit:contain;";
                                tn.onerror = function(){ tn.style.display="none"; };
                                card.appendChild(tn);
                            }
                            var lb = document.createElement("span");
                            lb.textContent = cd.name || "未命名";
                            lb.style.cssText = "color:#ffffff;font-size:12px;margin-top:2px;text-align:center;";
                            card.appendChild(lb);
                            if (window.isAdexCharCard && window.isAdexCharCard(cd)) {
                                var badge = document.createElement("span");
                                badge.textContent = "⭐ ADex";
                                badge.style.cssText = "color:#fbbf24;font-size:10px;margin-top:1px;";
                                card.appendChild(badge);
                            }
                            if (cd.series) {
                                var sb = document.createElement("span");
                                sb.textContent = cd.series;
                                sb.style.cssText = "color:var(--anima-mute);font-size:12px;text-align:center;";
                                card.appendChild(sb);
                            }
                            // 编辑按钮
                            var edBtn = document.createElement("button");
                            edBtn.textContent = animaTxt("编辑"); edBtn.title = "编辑角色卡";
                            edBtn.style.cssText = "padding:2px 8px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:var(--anima-well);color:var(--anima-accent-soft);font-size:12px;";
                            edBtn.onclick = function(e2){
                                e2.stopPropagation();
                                if (typeof window.saveCharCard === "function") {
                                    var etgs = (cd.tags||"").split(/[,，]+/).map(function(t){return t.trim();}).filter(Boolean);
                                    var _cid = (window.isAdexCharCard && window.isAdexCharCard(cd)) ? "" : (cd.id||"");
                                    window.saveCharCard(cd.name||"", cd.series||"", etgs, cd.thumb||"", false, _cid);
                                }
                            };
                            card.appendChild(edBtn);
                            // 删除按钮
                            var delBtn = document.createElement("button");
                            delBtn.textContent = animaTxt("删除"); delBtn.title = "删除角色卡";
                            delBtn.style.cssText = "padding:2px 8px;margin:2px;border-radius:3px;border:none;cursor:pointer;background:#5a1a1a;color:#ff8a80;font-size:12px;";
                            delBtn.onclick = function(e2){
                                e2.stopPropagation();
                                var _adx = window.isAdexCharCard && window.isAdexCharCard(cd);
                                if (!confirm(_adx ? ("取消 AnimaDex 收藏 " + (cd.name||"") + " ？") : ("确定删除 " + (cd.name||"") + " ？"))) return;
                                var _rm = (typeof window.deleteCharacterCard === "function") ? window.deleteCharacterCard(cd) : fetch("/anima_random/character_cards/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:cd.id})});
                                _rm.then(function(){ card.remove(); });
                            };
                            card.appendChild(delBtn);
                            grid.appendChild(card);
                        })(cards[ci]);
                    }
                }).catch(function(){ grid.innerHTML = '<div style="color:#e94560;text-align:center;padding:20px;">加载失败</div>'; });
            }
            function renderChars() {
                // 保存焦点状态
                const _activeEl = document.activeElement;
                let _focusIdx = -1, _focusKey = "";
                if (_activeEl && charContainer.contains(_activeEl)) {
                    _focusIdx = parseInt(_activeEl.dataset?.charIdx);
                    _focusKey = _activeEl.dataset?.charKey || "";
                    if (isNaN(_focusIdx)) { _focusIdx = -1; _focusKey = ""; }
                }
                charContainer.innerHTML = "";
                for (let ci = 0; ci < _characters.length; ci++) {
                    (function (idx) {
                        const ch = _characters[idx] || {};
                        const charCard = document.createElement("div");
                        charCard.style.cssText = _nbCardSkin;

                        const chHdr = document.createElement("div");
                        chHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;";
                        const chTitle = document.createElement("span");
                        chTitle.style.cssText = "color:#ffffff;font-weight:800;font-size:13px;flex:1;letter-spacing:0;";
                        chTitle.textContent = animaTxt("👤 角色 ") + (idx + 1);
                        chHdr.appendChild(chTitle);
                        const chCardBtn = document.createElement("span");
                        chCardBtn.textContent = animaTxt("🃏 角色卡"); chCardBtn.title = animaTxt("打开角色卡管理");
                        chCardBtn.style.cssText = "display:flex;align-items:center;justify-content:center;gap:4px;margin:0 auto 4px auto;padding:4px 14px;border-radius:14px;background:rgba(var(--anima-accent-rgb),.12);border:1px solid rgba(255,255,255,.22);color:var(--anima-accent-soft);font-size:13px;font-weight:600;cursor:pointer;user-select:none;transition:all 0.2s ease;width:fit-content;";
                        chCardBtn.onmouseenter = function(){ chCardBtn.style.background="rgba(var(--anima-accent-rgb),0.22)"; chCardBtn.style.borderColor="var(--anima-accent-soft)"; chCardBtn.style.transform="translateY(-1px)"; chCardBtn.style.boxShadow="0 2px 8px rgba(var(--anima-accent-rgb),0.25)"; };
                        chCardBtn.onmouseleave = function(){ chCardBtn.style.background="rgba(var(--anima-accent-rgb),.12)"; chCardBtn.style.borderColor="rgba(255,255,255,.22)"; chCardBtn.style.transform=""; chCardBtn.style.boxShadow=""; };
                        chCardBtn.onclick = function(e2){ e2.stopPropagation(); _openNbCharCard(idx); };
                        charCard.appendChild(chCardBtn);
                        const chFold = document.createElement("span");
                        chFold.textContent = "▼"; chFold.title = animaTxt("折叠/展开");
                        chFold.style.cssText = "color:var(--anima-mute);font-size:12px;margin-right:8px;";
                        chHdr.appendChild(chFold);
                        if (_characters.length > 1) {
                            const delBtn = document.createElement("span");
                            delBtn.textContent = "✕"; delBtn.title = animaTxt("删除角色 ") + (idx + 1);
                            delBtn.style.cssText = "cursor:pointer;color:#e94560;font-size:14px;font-weight:bold;margin-left:4px;";
                            delBtn.onclick = (e) => { e.stopPropagation(); _characters.splice(idx, 1); renderChars(); syncChars(); };
                            chHdr.appendChild(delBtn);
                        }
                        charCard.appendChild(chHdr);

                        const chBody = document.createElement("div");
                        chBody.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:8px;";
                        charCard.appendChild(chBody);

                        var _chOpen = true;
                        chHdr.onclick = function(){
                            _chOpen = !_chOpen;
                            chBody.style.display = _chOpen ? "flex" : "none";
                            chFold.textContent = _chOpen ? "▼" : "▶";
                            var nm = (ch.n || ch["n"] || "").trim();
                            chTitle.textContent = _chOpen ? ("👤 角色 " + (idx + 1)) : (nm ? "👤 " + nm : "👤 角色 " + (idx + 1));
                        };

                        /* nb-chip-v1-char */
                        function _makeCharField(key, label, ph) {
                            var wrap = document.createElement("div");
                            wrap.style.cssText = "display:flex;align-items:center;gap:3px;flex:1;min-width:0;";
                            var _iw = document.createElement("div");
                            _iw.style.cssText = "position:relative;flex:1;min-width:0;";
                            var inp = document.createElement("input");
                            inp.type = "text";
                            inp.style.cssText = "width:100%;padding:2px 16px 2px 4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(8,10,14,.88);color:#ffffff;font-size:12px;outline:none;box-sizing:border-box;";
                            var _init = ch[key];
                            if (Array.isArray(_init)) _init = _init.join(", ");
                            inp.value = _init || ""; inp.placeholder = ph || "";
                            inp.dataset.charIdx = idx; inp.dataset.charKey = key;
                            inp.oninput = (function(k){ return function(){ _characters[idx][k] = this.value; syncChars(); }; })(key);
                            _iw.appendChild(inp);
                            _attachChipField(inp, key, function(joined) {
                                _characters[idx][key] = joined;
                                syncChars();
                            });
                            var _x = document.createElement("span");
                            _x.textContent = "✕"; _x.title = animaTxt("清空");
                            _x.style.cssText = "position:absolute;top:0;bottom:0;right:4px;cursor:pointer;color:#e94560;font-size:7px;line-height:1;display:none;align-items:center;z-index:2;";
                            _x.onclick = function(e2){ e2.stopPropagation(); inp.value = ""; _characters[idx][key] = ""; syncChars(); };
                            _iw.appendChild(_x);
                            _iw.onmouseenter = function(){ _x.style.display="flex"; };
                            _iw.onmouseleave = function(){ _x.style.display="none"; };
                            var _onFill = function(v, isMulti){
                                if (isMulti) {
                                    var cur = (inp.value||"").trim();
                                    var parts = cur ? cur.split(/[,，]+/).map(function(s){return s.trim();}).filter(Boolean) : [];
                                    if (parts.indexOf(v) < 0) { parts.push(v); inp.value = parts.join(", "); }
                                } else { inp.value = v; }
                                _characters[idx][key] = inp.value; syncChars();
                            };
                            var _lb = _mkLabelBtn(key, label, inp, _onFill);
                            wrap.appendChild(_lb);
                            wrap.appendChild(_iw);
                            return wrap;
                        }
                        function _makeCharRow(fields) {
                            var row = document.createElement("div");
                            row.style.cssText = "display:flex;gap:8px;margin-bottom:0;";
                            for (var _fi = 0; _fi < fields.length; _fi++) {
                                row.appendChild(_makeCharField(fields[_fi][0], fields[_fi][1], fields[_fi][2]));
                            }
                            chBody.appendChild(row);
                        }

                        // 布局：紧凑配对
                        _makeCharRow([["gender","类型","1girl"], ["expression","表情","逗号分隔"], ["action","姿势/动作","逗号分隔"], ["interaction","互动","与角色/物体/环境的互动"]]);
                        _makeCharRow([["n","角色名","如: dusk \\(arknights\\)"], ["position","画面位置","center, left, right..."]]);
                        _makeCharRow([["appearance","外貌","发色/瞳色/体型等"]]);
                        _makeCharRow([["clothing","服装","逗号分隔"]]);
                        charContainer.appendChild(charCard);
                    })(ci);
                }

                // 添加角色按钮
                const addBar = document.createElement("div");
                addBar.style.cssText = "display:flex;justify-content:center;";
                const addBtn = document.createElement("button");
                addBtn.textContent = animaTxt("➕ 添加角色");
                addBtn.style.cssText = "padding:8px 16px;border-radius:12px;border:1px dashed rgba(var(--anima-accent-rgb),0.45);cursor:pointer;background:rgba(var(--anima-accent-hi-rgb),.16);color:var(--anima-accent-soft);font-size:13px;font-weight:700;width:100%;transition:all 0.2s ease;";
                addBtn.onmouseover = () => { addBtn.style.background = "rgba(var(--anima-accent-rgb),0.12)"; };
                addBtn.onmouseout = () => { addBtn.style.background = "rgba(var(--anima-accent-rgb),0.05)"; };
                addBtn.onclick = () => {
                    _characters.push({});
                    renderChars();
                    syncChars();
                };
                addBar.appendChild(addBtn);
                charContainer.appendChild(addBar);
                // 恢复焦点
                if (_focusIdx >= 0 && _focusKey) {
                    var _sel = '[data-char-idx="' + _focusIdx + '"][data-char-key="' + _focusKey + '"]';
                    var _target = charContainer.querySelector(".nb-chip-trail" + _sel) || charContainer.querySelector(_sel);
                    if (_target) _target.focus();
                }
            }

            // ── 预制标签弹窗 ──
            function _ensureThumbs() {
                try { return JSON.parse(localStorage.getItem("apc_tag_thumbs") || "{}"); } catch(e) { return {}; }
            }
            function _saveThumbs(t) { try { localStorage.setItem("apc_tag_thumbs", JSON.stringify(t)); } catch(e) {} }
            function _openThumbSetter(tag, onSaved) {
                var bx3 = document.createElement("div");
                bx3.style.cssText = "position:fixed;top:5%;left:5%;background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;width:680px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.9);z-index:100006;resize:both;overflow:auto;";
                try { var _gp = JSON.parse(localStorage.getItem("apc_gelpop_pos")||"{}"); if(_gp.w && _gp.w>200) bx3.style.width = _gp.w+"px"; if(_gp.h && _gp.h>200) bx3.style.height = _gp.h+"px"; } catch(e) {}
                // 关闭时保存尺寸位置
                function _saveGelPos(){ try { localStorage.setItem("apc_gelpop_pos", JSON.stringify({w:Math.round(bx3.clientWidth),h:Math.round(bx3.clientHeight)})); } catch(e) {} }
                window.addEventListener("beforeunload", _saveGelPos);
                var hdr3 = document.createElement("div");
                hdr3.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;cursor:grab;user-select:none;";
                hdr3.innerHTML = '<span style="color:var(--anima-accent-soft);font-weight:bold;">🔍 缩略图：</span><span style="color:var(--anima-accent-soft);font-weight:bold;font-size:13px;">'+tag.replace(/_/g," ")+'</span><span style="color:var(--anima-mute);font-size:13px;margin-left:4px;">点击图片进入裁剪</span>';
                hdr3.onmousedown = function(e3){ var dx=e3.clientX-bx3.offsetLeft,dy=e3.clientY-bx3.offsetTop; function mm(ev){bx3.style.left=(ev.clientX-dx)+'px';bx3.style.top=(ev.clientY-dy)+'px'} function mu(){document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);try{localStorage.setItem("apc_gelpop_pos",JSON.stringify({left:parseInt(bx3.style.left)||0,top:parseInt(bx3.style.top)||0}));}catch(e){} setTimeout(function(){ window.clampPopup(bx3); },0);} document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu); };
                var _gp2 = 0, _gelSort = "score";
                // 排序切换
                var sortBtn = document.createElement("span");
                sortBtn.textContent = animaTxt("⭐ 评分"); sortBtn.title = animaTxt("切换排序");
                sortBtn.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid var(--anima-accent-soft);cursor:pointer;font-size:12px;background:var(--anima-accent-hi);color:var(--anima-accent-soft);font-weight:600;flex-shrink:0;";
                sortBtn.onclick = function(){
                    _gelSort = _gelSort === "score" ? "date" : "score";
                    sortBtn.textContent = _gelSort === "score" ? "⭐ 评分" : "🕒 最新";
                    doGelSearch(0);
                };
                hdr3.appendChild(sortBtn);
                // 上传按钮
                var uploadBtn = document.createElement("button"); uploadBtn.textContent = "📁"; uploadBtn.title = animaTxt("本地图片作为缩略图");
                uploadBtn.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#ccc;cursor:pointer;font-size:13px;flex-shrink:0;";
                var fileInp = document.createElement("input"); fileInp.type = "file"; fileInp.accept = "image/*"; fileInp.style.display = "none";
                uploadBtn.onclick = function(){ fileInp.click(); };
                fileInp.onchange = function(){
                    if (!fileInp.files || !fileInp.files[0]) return;
                    var reader = new FileReader();
                    reader.onload = function(ev){ bx3.remove(); _openCrop(tag, ev.target.result, onSaved); fileInp.value = ""; };
                    reader.readAsDataURL(fileInp.files[0]);
                };
                hdr3.appendChild(uploadBtn); bx3.appendChild(fileInp);
                // 关闭按钮
                var cls3 = document.createElement("button"); cls3.textContent = "✕"; cls3.title = animaTxt("关闭");
                cls3.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid rgba(233,69,96,0.3);background:rgba(233,69,96,0.1);color:#e94560;cursor:pointer;font-size:13px;font-weight:600;flex-shrink:0;margin-left:auto;"; cls3.onclick = function(){ _saveGelPos(); bx3.remove(); };
                hdr3.appendChild(cls3);
                bx3.appendChild(hdr3);
                var grid3 = document.createElement("div");
                grid3.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;overflow-y:auto;flex:1;min-height:200px;";
                grid3.innerHTML = '<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
                bx3.appendChild(grid3); document.body.appendChild(bx3);
                // ── 分级筛选 ──
                var _gelRatings = {"general":true}, _gelAll = false;
                var ratingBar = document.createElement("div");
                ratingBar.style.cssText = "display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;";
                var ratingOpts = [["general","🟢 普通"],["sensitive","🟡 敏感"],["questionable","🟠 可疑"],["explicit","🔴 明确"]];
                var ratingBtns = {};
                function updateRatingBar(){
                    for(var rk in ratingBtns){
                        var on = !_gelAll && !!_gelRatings[rk];
                        ratingBtns[rk].style.background = on ? "var(--anima-accent-hi)" : "transparent";
                        ratingBtns[rk].style.color = on ? "var(--anima-accent-soft)" : "#ccc";
                        ratingBtns[rk].style.borderColor = on ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)";
                    }
                    if (allBtn2) { allBtn2.style.background = _gelAll ? "var(--anima-accent-hi)" : "transparent"; allBtn2.style.color = _gelAll ? "var(--anima-accent-soft)" : "#ccc"; allBtn2.style.borderColor = _gelAll ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.15)"; }
                }
                for(var ri=0;ri<ratingOpts.length;ri++){(function(){var rk=ratingOpts[ri][0],rl=ratingOpts[ri][1];var rb=document.createElement("span");rb.textContent=rl;rb.style.cssText="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;user-select:none;color:#ccc;";rb.onclick=function(){_gelAll=false;_gelRatings[rk]=!_gelRatings[rk];updateRatingBar();doGelSearch(0);};ratingBtns[rk]=rb;ratingBar.appendChild(rb);})();}
                var allBtn2 = document.createElement("span");
                allBtn2.textContent=animaTxt("⚪ 全部");allBtn2.style.cssText="padding:3px 6px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;user-select:none;background:transparent;color:#ccc;";
                allBtn2.onclick=function(){_gelAll=!_gelAll;updateRatingBar();doGelSearch(0);};
                ratingBar.appendChild(allBtn2); updateRatingBar();
                // ── solo 单人筛选 ──
                var _soloOn = false;
                var soloBtn2 = document.createElement("span");
                soloBtn2.textContent = "👤"; soloBtn2.title = animaTxt("单人筛选");
                soloBtn2.style.cssText = "padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);cursor:pointer;font-size:12px;user-select:none;background:transparent;color:#ccc;";
                soloBtn2.onclick = function(){
                    _soloOn = !_soloOn;
                    soloBtn2.textContent = "👤"; soloBtn2.title = _soloOn ? "单人筛选：开" : "单人筛选：关";
                    soloBtn2.style.background = _soloOn ? "var(--anima-accent-hi)" : "transparent";
                    soloBtn2.style.color = _soloOn ? "var(--anima-accent-soft)" : "#ccc";
                    soloBtn2.style.borderColor = _soloOn ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.06)";
                    doGelSearch(0);
                };
                ratingBar.appendChild(soloBtn2);
                bx3.insertBefore(ratingBar, grid3);
                function doGelSearch(pg) {
                    _gp2 = pg; grid3.innerHTML = '<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">搜索中...</div>';
                    var _ratings = _gelAll ? ["general","sensitive","questionable","explicit"] : Object.keys(_gelRatings).filter(function(r){return _gelRatings[r];});
                    if (!_ratings.length) _ratings = ["general"];
                    var _tags = tag.replace(/_/g," ");
                    if (_soloOn) _tags = "solo " + _tags;
                    fetch("/gelbooru_anima/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tags:_tags,page:pg,limit:30,order:_gelSort,rating:_ratings})}).then(function(r2){return r2.json();}).then(function(d2){
                        var posts = d2.posts||[]; grid3.innerHTML = "";
                        var _pager3 = bx3.querySelector("._nbPager"); if(_pager3) _pager3.remove();
                        if(!posts.length){grid3.innerHTML='<div style="color:var(--anima-mute);text-align:center;grid-column:1/-1;padding:20px;">无结果</div>';return;}
                        posts.forEach(function(p){
                            var c2 = document.createElement("div");
                            c2.style.cssText = "border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s;min-height:200px;position:relative;background:rgba(255,255,255,0.03);";
                            c2.onmouseover = function(){ c2.style.borderColor="var(--anima-accent-soft)"; };
                            c2.onmouseout = function(){ c2.style.borderColor="transparent"; };
                            c2.onclick = function(){
                                var imgUrl = p.sample_url||p.preview_url||p.file_url||"";
                                if(!imgUrl) return;
                                bx3.remove();
                                _openCrop(tag, "/gelbooru_anima/image_proxy?url="+encodeURIComponent(imgUrl), onSaved);
                            };
                            if (p.preview_url) {
                                var tn2 = document.createElement("img");
                                tn2.src = "/gelbooru_anima/image_proxy?url="+encodeURIComponent(p.preview_url);
                                tn2.style.cssText = "width:100%;height:100%;object-fit:contain;";
                                tn2.onerror = function(){ this.parentElement.innerHTML = '<span style="font-size:32px;">🖼</span>'; };
                                c2.appendChild(tn2);
                            }
                            grid3.appendChild(c2);
                        });
                        // 翻页
                        var _pager3 = document.createElement("div");
                        _pager3.className = "_nbPager";
                        _pager3.style.cssText = "display:flex;justify-content:center;align-items:center;gap:8px;padding:8px;flex-shrink:0;";
                        var _prevBtn3 = document.createElement("button"); _prevBtn3.textContent = "◀"; _prevBtn3.disabled = pg <= 0;
                        _prevBtn3.style.cssText = "padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                        _prevBtn3.onclick = function(){ doGelSearch(pg - 1); };
                        var _nextBtn3 = document.createElement("button"); _nextBtn3.textContent = "▶"; _nextBtn3.disabled = posts.length < 30;
                        _nextBtn3.style.cssText = "padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;background:transparent;color:#ccc;font-size:12px;";
                        _nextBtn3.onclick = function(){ doGelSearch(pg + 1); };
                        _pager3.appendChild(_prevBtn3);
                        _pager3.appendChild(document.createElement("span").appendChild(document.createTextNode("第 "+(pg+1)+" 页")) && _pager3.lastChild); _pager3.lastChild.style.cssText = "color:#ccc;font-size:13px;";
                        _pager3.appendChild(_nextBtn3);
                        bx3.appendChild(_pager3);
                    }).catch(function(){});
                }
                doGelSearch(0);
            }
            function _openCrop(tag, imgSrc, onSaved) {
                var cvOv = document.createElement("div");
                cvOv.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:100007;display:flex;align-items:center;justify-content:center;flex-direction:column;";
                var VW=400,VH=400;
                var cbox = document.createElement("div");
                cbox.style.cssText = "position:relative;width:"+VW+"px;height:"+VH+"px;overflow:hidden;border:2px solid var(--anima-accent-soft);border-radius:8px;background:#000;cursor:grab;";
                var cimg = document.createElement("img"); cimg.src = imgSrc; cimg.draggable = false;
                cimg.style.cssText = "position:absolute;pointer-events:none;user-select:none;";
                var zoom=100, panX=0, panY=0, imgScale=1;
                cimg.onload = function(){
                    var nw=cimg.naturalWidth, nh=cimg.naturalHeight; if(!nw||!nh) return;
                    imgScale = Math.max(VW/nw, VH/nh); zoom = 100; applyCropZoom();
                };
                function applyCropZoom(){
                    var nw=cimg.naturalWidth, nh=cimg.naturalHeight; if(!nw||!nh) return;
                    var scale = imgScale * (zoom/100);
                    var iw = Math.round(nw*scale), ih = Math.round(nh*scale);
                    cimg.style.width = iw+"px"; cimg.style.height = ih+"px";
                    var maxDX = Math.max(0, iw-VW), maxDY = Math.max(0, ih-VH);
                    panX = Math.max(-maxDX, Math.min(0, panX)); panY = Math.max(-maxDY, Math.min(0, panY));
                    cimg.style.left = panX+"px"; cimg.style.top = panY+"px";
                }
                var dragging=false,sx=0,sy=0,spx=0,spy=0;
                cbox.addEventListener("mousedown",function(e2){ dragging=true; cbox.style.cursor="grabbing"; sx=e2.clientX; sy=e2.clientY; spx=panX; spy=panY; e2.preventDefault(); });
                window.addEventListener("mousemove",function(e2){ if(!dragging||!cvOv.parentNode)return; panX=spx+(e2.clientX-sx); panY=spy+(e2.clientY-sy); applyCropZoom(); });
                window.addEventListener("mouseup",function(){ if(dragging){dragging=false;cbox.style.cursor="grab";} });
                cbox.appendChild(cimg);
                var cbar = document.createElement("div"); cbar.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:14px;";
                var zoomOut = document.createElement("button"); zoomOut.textContent="−"; zoomOut.style.cssText = "width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                zoomOut.onclick=function(){ zoom=Math.max(100,zoom-20); applyCropZoom(); };
                var zoomSlider = document.createElement("input"); zoomSlider.type="range"; zoomSlider.min="100"; zoomSlider.max="300"; zoomSlider.value=zoom;
                zoomSlider.style.cssText = "width:140px;accent-color:var(--anima-accent-soft);";
                var zoomIn = document.createElement("button"); zoomIn.textContent="+"; zoomIn.style.cssText = "width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;cursor:pointer;font-size:18px;line-height:1;";
                zoomIn.onclick=function(){ zoom=Math.min(300,zoom+20); applyCropZoom(); };
                zoomSlider.oninput=function(){ zoom=parseInt(zoomSlider.value); applyCropZoom(); };
                var zoomLabel = document.createElement("span"); zoomLabel.style.cssText = "color:#ccc;font-size:12px;min-width:40px;";
                var origApply = applyCropZoom; applyCropZoom = function(){ origApply(); zoomLabel.textContent=zoom+"%"; zoomSlider.value=zoom; };
                var cbtnCancel = document.createElement("button"); cbtnCancel.textContent=animaTxt("取消"); cbtnCancel.style.cssText = "padding:8px 18px;border-radius:8px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:13px;margin-left:auto;";
                cbtnCancel.onclick=function(){cvOv.remove();};
                var cbtnSkip = document.createElement("button"); cbtnSkip.textContent=animaTxt("🖼 不裁剪"); cbtnSkip.style.cssText = "padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:var(--anima-ink-chip);cursor:pointer;font-size:13px;";
                cbtnSkip.onclick = function(){
                    fetch(imgSrc).then(function(r){return r.blob();}).then(function(blob){
                        var reader2 = new FileReader();
                        reader2.onload = function(ev2){
                        // 等比缩到长边 200，保持原比例
                        var _imgTmp = new Image();
                        _imgTmp.onload = function(){
                            var _w = _imgTmp.naturalWidth, _h = _imgTmp.naturalHeight;
                            var _scale = Math.min(200/_w, 200/_h);
                            var _sw = Math.round(_w * _scale), _sh = Math.round(_h * _scale);
                            var _cvTmp = document.createElement("canvas"); _cvTmp.width = _sw; _cvTmp.height = _sh;
                            _cvTmp.getContext("2d").drawImage(_imgTmp, 0, 0, _sw, _sh);
                            saveThumbData(tag, _cvTmp.toDataURL("image/jpeg", 0.85)); cvOv.remove();
                        };
                        _imgTmp.src = ev2.target.result;
                    };
                        reader2.readAsDataURL(blob);
                    }).catch(function(){});
                };
                function saveThumbData(tag2, dataUrl){
                    var thumbs = _ensureThumbs(); thumbs[tag2] = dataUrl; _saveThumbs(thumbs);
                    if (onSaved) onSaved();
                    // 异步保存到服务器（仅备份，不覆盖 base64）
                    fetch("/danbooru_anima/save_thumb",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag:tag2, image:dataUrl})}).catch(function(){});
                }
                var cbtnOk = document.createElement("button"); cbtnOk.textContent=animaTxt("✅ 确认"); cbtnOk.style.cssText = "padding:8px 18px;border-radius:8px;border:none;background:var(--anima-accent-hi);color:var(--anima-accent-soft);cursor:pointer;font-weight:bold;font-size:13px;";
                cbtnOk.onclick = function(){
                    var nw=cimg.naturalWidth, nh=cimg.naturalHeight;
                    var scale = imgScale * (zoom/100);
                    var cv = document.createElement("canvas"); cv.width = VW; cv.height = VH;
                    var ctx = cv.getContext("2d");
                    ctx.drawImage(cimg, panX, panY, Math.round(nw*scale), Math.round(nh*scale));
                    // 缩到 200x200 再转 base64，节省存储
                    var _cv2 = document.createElement("canvas"); _cv2.width = 200; _cv2.height = 200;
                    _cv2.getContext("2d").drawImage(cv, 0, 0, 200, 200);
                    saveThumbData(tag, _cv2.toDataURL("image/jpeg", 0.85)); cvOv.remove();
                };
                cbar.appendChild(zoomOut);cbar.appendChild(zoomSlider);cbar.appendChild(zoomIn);cbar.appendChild(zoomLabel);
                cbar.appendChild(cbtnCancel);cbar.appendChild(cbtnSkip);cbar.appendChild(cbtnOk);
                cvOv.appendChild(cbox); cvOv.appendChild(cbar); document.body.appendChild(cvOv);
                if(cimg.complete && cimg.naturalWidth) cimg.onload();
            }
            function showNbTagPopup(key, onSelect) {
                // ── 预制缩略图自动补种（一次请求，共享 apc_tag_thumbs）──
                (function(){
                    try {
                        if (localStorage.getItem("nb_thumb_seeded")) return;
                        fetch("/danbooru_anima/thumb_list").then(function(r){return r.json();}).then(function(d){
                            if (!d.success || !d.thumbs) return;
                            var _et = {};
                            try { _et = JSON.parse(localStorage.getItem("apc_tag_thumbs")||"{}"); } catch(e) {}
                            var _added = 0;
                            for (var _ti=0; _ti<d.thumbs.length; _ti++) {
                                var _tk = d.thumbs[_ti];
                                if (!(_tk in _et)) { _et[_tk] = "/danbooru_anima/thumb/"+_tk+".jpg"; _added++; }
                                else {
                                    var _ev = _et[_tk];
                                    if (_ev && typeof _ev === "object") {
                                        var _evu = _ev.url || "";
                                        if (_evu) _et[_tk] = _evu; else delete _et[_tk];
                                        _added++;
                                    }
                                }
                            }
                            if (_added > 0) { try { localStorage.setItem("apc_tag_thumbs", JSON.stringify(_et)); } catch(e) {} }
                            try { localStorage.setItem("nb_thumb_seeded", "1"); } catch(e) {}
                            var _g = document.querySelector("#nb-popup-grid");
                            if (_g && typeof renderGrid === "function") renderGrid();
                        }).catch(function(){});
                    } catch(e) {}
                })();
                var _loadedThumbs = {};  // 缓存已加载缩略图，避免闪烁
                function _loadSubs() { try { var d = JSON.parse(localStorage.getItem("nb_popup_subs")||"{}"); var arr = d[key] || []; if (!arr.length && NB_DEFAULT_SUBCATS[key]) { arr = NB_DEFAULT_SUBCATS[key]; d[key] = arr; localStorage.setItem("nb_popup_subs", JSON.stringify(d)); } return arr; } catch(e) { return []; } }
                function _saveSubs(arr) { try { var d = JSON.parse(localStorage.getItem("nb_popup_subs")||"{}"); d[key] = arr; localStorage.setItem("nb_popup_subs", JSON.stringify(d)); } catch(e) {} }
                function _loadAssign() { try { var d = JSON.parse(localStorage.getItem("nb_popup_assign")||"{}"); var a = d[key] || {}; if (Object.keys(a).length === 0 && NB_DEFAULT_ASSIGN[key]) { a = NB_DEFAULT_ASSIGN[key]; d[key] = a; localStorage.setItem("nb_popup_assign", JSON.stringify(d)); } return a; } catch(e) { return {}; } }
                function _saveAssign(a) { try { var d = JSON.parse(localStorage.getItem("nb_popup_assign")||"{}"); d[key] = a; localStorage.setItem("nb_popup_assign", JSON.stringify(d)); } catch(e) {} }
                function _loadDeleted() { try { var d = JSON.parse(localStorage.getItem("nb_popup_deleted")||"{}"); return d[key] || {}; } catch(e) { return {}; } }
                function _saveDeleted(dl) { try { var d = JSON.parse(localStorage.getItem("nb_popup_deleted")||"{}"); d[key] = dl; localStorage.setItem("nb_popup_deleted", JSON.stringify(d)); } catch(e) {} }
                // ── 自定义 UI 弹窗（替代浏览器 prompt/confirm）──
                function _showConfirm(msg, onOk) {
                    var _ov = document.createElement("div");
                    _ov.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:transparent;z-index:100010;display:flex;align-items:center;justify-content:center;";
                    _ov.onclick = function(e){ if(e.target===_ov) _ov.remove(); };
                    var _box = document.createElement("div");
                    _box.style.cssText = "background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px 24px;min-width:300px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.5);";
                    _box.innerHTML = '<div style="color:#ffffff;margin-bottom:16px;font-size:13px;">'+msg+'</div>';
                    var _row = document.createElement("div");
                    _row.style.cssText = "display:flex;gap:8px;justify-content:center;";
                    var _cancel = document.createElement("button");
                    _cancel.textContent = animaTxt("取消"); _cancel.style.cssText = "padding:6px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:12px;";
                    _cancel.onclick = function(){ _ov.remove(); };
                    var _ok = document.createElement("button");
                    _ok.textContent = animaTxt("确认"); _ok.style.cssText = "padding:6px 16px;border-radius:6px;border:none;background:#e94560;color:#fff;cursor:pointer;font-size:12px;font-weight:600;";
                    _ok.onclick = function(){ _ov.remove(); onOk(); };
                    _row.appendChild(_cancel); _row.appendChild(_ok);
                    _box.appendChild(_row); _ov.appendChild(_box); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_box);
                    document.body.appendChild(_ov);
                }
                function _showPrompt(msg, defVal, onSubmit) {
                    var _ov2 = document.createElement("div");
                    _ov2.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:transparent;z-index:100010;display:flex;align-items:center;justify-content:center;";
                    _ov2.onclick = function(e){ if(e.target===_ov2) _ov2.remove(); };
                    var _box2 = document.createElement("div");
                    _box2.style.cssText = "background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px 24px;min-width:320px;box-shadow:0 10px 40px rgba(0,0,0,0.5);";
                    _box2.innerHTML = '<div style="color:#ffffff;margin-bottom:12px;font-size:13px;">'+msg+'</div>';
                    var _inp = document.createElement("input");
                    _inp.type = "text"; _inp.value = defVal || "";
                    _inp.style.cssText = "width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:12px;outline:none;margin-bottom:12px;box-sizing:border-box;";
                    _box2.appendChild(_inp);
                    var _row2 = document.createElement("div");
                    _row2.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
                    var _cancel2 = document.createElement("button");
                    _cancel2.textContent = animaTxt("取消"); _cancel2.style.cssText = "padding:6px 16px;border-radius:6px;border:1px solid #444;background:transparent;color:#aaa;cursor:pointer;font-size:12px;";
                    _cancel2.onclick = function(){ _ov2.remove(); };
                    var _ok2 = document.createElement("button");
                    _ok2.textContent = animaTxt("确定"); _ok2.style.cssText = "padding:6px 16px;border-radius:6px;border:none;background:linear-gradient(180deg,#e8eef2,#c5d0d8);color:var(--anima-bg);cursor:pointer;font-size:12px;font-weight:600;";
                    _ok2.onclick = function(){ _ov2.remove(); onSubmit(_inp.value.trim()); };
                    _row2.appendChild(_cancel2); _row2.appendChild(_ok2);
                    _box2.appendChild(_row2); _ov2.appendChild(_box2); if (typeof window.applyAnimaPopupSkin === "function") window.applyAnimaPopupSkin(_box2);
                    document.body.appendChild(_ov2);
                    setTimeout(function(){ _inp.focus(); _inp.select(); }, 50);
                }
                var _customKey = "nb_custom_" + key;
                var _deleted = _loadDeleted();
                var _editMode = false;
                var _subCat = "all";
                var _customSubs = _loadSubs();
                var _subAssign = _loadAssign();
                function getAllSubs() { return [["all","\ud83d\udccb \u5168\u90e8",""]].concat(_customSubs).concat([["other","\ud83d\udd16 \u672a\u5206\u7c7b",""]]); }
                function isPresetSub(sc) { return sc === "all" || sc === "other"; }
                function filterBySub(arr) {
                    if (_subCat === "all") return arr;
                    return arr.filter(function(t){ return (_subAssign[t]||"other") === _subCat; });
                }
                function _loadCustom() { try { return JSON.parse(localStorage.getItem("nb_custom_presets")||"{}")[key] || []; } catch(e) { return []; } }
                function _saveCustom(arr) { try { var d = JSON.parse(localStorage.getItem("nb_custom_presets")||"{}"); d[key] = arr; localStorage.setItem("nb_custom_presets", JSON.stringify(d)); } catch(e) {} }
                var customTags = _loadCustom();
                function getAllTags() { return (NB_PRESETS[key]||[]).filter(function(t){ return !_deleted[t]; }).concat(customTags); }
                function _showAddCustomTag(onDone) {
                    var _ov2 = document.createElement("div");
                    _ov2.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100005;display:flex;align-items:center;justify-content:center;";
                    _ov2.onclick = null;
                    var _bx2 = document.createElement("div");
                    _bx2.style.cssText = "background:var(--anima-bg);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.8);";
                    _bx2.innerHTML = '<h3 style="color:#ffffff;margin:0 0 12px;">+ 自定义标签</h3>'+
                        '<input id=\"nbac-tag\" placeholder=\"标签名（英文，如 blonde_hair）\" style=\"width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;\">'+
                        '<input id=\"nbac-cn\" placeholder=\"中文翻译（如 金发）\" style=\"width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;\">'+
                        '<button id=\"nbac-thumb\" style=\"width:100%;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#ccc;cursor:pointer;font-size:12px;margin-bottom:8px;\">📷 设置缩略图</button>'+
                        '<div style=\"display:flex;gap:8px;\"><button id=\"nbac-ok\" style=\"flex:1;padding:8px;border-radius:6px;border:none;background:linear-gradient(180deg,#e8eef2,#c5d0d8);color:var(--anima-bg);cursor:pointer;font-size:13px;\">确认</button><button id=\"nbac-cancel\" style=\"flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#ccc;cursor:pointer;font-size:13px;\">取消</button></div>';
                    _ov2.appendChild(_bx2); document.body.appendChild(_ov2);
                    var _tagInp = _bx2.querySelector("#nbac-tag");
                    var _cnInp = _bx2.querySelector("#nbac-cn");
                    _bx2.querySelector("#nbac-cancel").onclick = function(){ _ov2.remove(); };
                    _bx2.querySelector("#nbac-thumb").onclick = function(){
                        var _tmp = _tagInp.value.trim() || "custom_tag";
                        _openThumbSetter(_tmp, function(){});
                    };
                    _bx2.querySelector("#nbac-ok").onclick = function(){
                        var _tn = _tagInp.value.trim();
                        if (!_tn) return;
                        if (customTags.indexOf(_tn) >= 0) { _ov2.remove(); return; }
                        // 归入当前子分类（先设再渲染）
                        if (_subCat && _subCat !== "all") { _subAssign[_tn] = _subCat; _saveAssign(_subAssign); }
                        onDone(_tn, _cnInp.value.trim());
                        _ov2.remove();
                    };
                }
                var tags = getAllTags();
                var bx = document.createElement("div");
                bx.style.cssText = "position:fixed;background:linear-gradient(165deg,var(--anima-well) 0%,var(--anima-bg-deep) 72%);border:1px solid rgba(var(--anima-accent-rgb),.45);border-radius:16px;padding:18px;width:680px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.7);z-index:99999;";try { var _sp = JSON.parse(localStorage.getItem("nb_popup_pos")||"{}"); if(_sp.top) bx.style.top = _sp.top+"px"; if(_sp.left) bx.style.left = _sp.left+"px"; } catch(e) {}try { var _ss = JSON.parse(localStorage.getItem("nb_popup_size")||"{}"); if(_ss.w) bx.style.width = _ss.w+"px"; if(_ss.h) bx.style.height = _ss.h+"px"; } catch(e) {}if (!bx.style.top) bx.style.top = "8%"; if (!bx.style.left) bx.style.left = "10%";if (typeof ResizeObserver !== "undefined") { var _ro = new ResizeObserver(function(){ try { localStorage.setItem("nb_popup_size", JSON.stringify({w:bx.offsetWidth,h:bx.offsetHeight})); } catch(e) {} }); _ro.observe(bx); }
                var hdr = document.createElement("div");
                hdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:grab;user-select:none;";
                hdr.innerHTML = '<span style="color:#ffffff;font-weight:700;font-size:16px;">' + (NB_PRESET_TRANSLATIONS[key] || key) + ' - 标签管理</span>';
                // ── 多tag模式切换 ──
                var _isMulti = (key === "appearance" || key === "clothing");
                var multiBtn = document.createElement("span");
                multiBtn.textContent = animaTxt("📋 多tag"); multiBtn.title = animaTxt("切换多tag模式（点击追加不替换）");
                multiBtn.style.cssText = "padding:3px 8px;border-radius:4px;cursor:pointer;font-size:12px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;margin-right:8px;white-space:nowrap;";
                if (_isMulti) { multiBtn.style.background = "var(--anima-accent-hi)"; multiBtn.style.color = "var(--anima-accent-soft)"; multiBtn.style.borderColor = "var(--anima-accent-soft)"; };
                multiBtn.onclick = function(){
                    _isMulti = !_isMulti;
                    multiBtn.style.background = _isMulti ? "var(--anima-accent-hi)" : "transparent";
                    multiBtn.style.color = _isMulti ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                    multiBtn.style.borderColor = _isMulti ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)";
                };
                hdr.appendChild(multiBtn);
                var clsBtn = document.createElement("span");
                clsBtn.textContent = "✕"; clsBtn.style.cssText = "cursor:pointer;color:#e94560;font-size:18px;";
                clsBtn.onclick = function(){ bx.remove(); };
                hdr.appendChild(clsBtn);
                bx.appendChild(hdr);
                // drag
                var _drg=false,_dx=0,_dy=0;
                hdr.onmousedown = function(e2){ if(e2.target===clsBtn)return; _drg=true;_dx=e2.clientX-bx.offsetLeft;_dy=e2.clientY-bx.offsetTop;e2.preventDefault(); };
                document.addEventListener("mousemove",function(e2){if(!_drg)return;bx.style.left=(e2.clientX-_dx)+"px";bx.style.top=(e2.clientY-_dy)+"px"});
                document.addEventListener("mouseup",function(){_drg=false; try{localStorage.setItem("nb_popup_pos",JSON.stringify({top:parseInt(bx.style.top)||0,left:parseInt(bx.style.left)||0}));}catch(e){} setTimeout(function(){ window.clampPopup(bx); },0);});

                // ── 搜索栏 ──
                var srchRow = document.createElement("div");
                srchRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px;flex-shrink:0;";
                var srchInp = document.createElement("input");
                srchInp.type = "text"; srchInp.placeholder = "搜索添加标签...";
                srchInp.style.cssText = "flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:var(--anima-well-lo);color:#ffffff;font-size:13px;outline:none;";
                srchRow.appendChild(srchInp);
                var editBtn = document.createElement("span");
                editBtn.textContent = "\u270f\ufe0f"; editBtn.title = "\u7f16\u8f91\u6a21\u5f0f";
                editBtn.style.cssText = "padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;flex-shrink:0;";
                editBtn.onclick = function(){
                    _editMode = !_editMode;
                    editBtn.style.background = _editMode ? "#e94560" : "transparent";
                    editBtn.style.color = _editMode ? "#fff" : "var(--anima-mute)";
                    buildSubBar();
                    renderGrid();
                };
                srchRow.appendChild(editBtn);
                // ── 自定义标签 ──
                var addCustomBtn = document.createElement("span");
                addCustomBtn.textContent = "+"; addCustomBtn.title = "添加自定义标签";
                addCustomBtn.style.cssText = "padding:5px 10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;color:var(--anima-accent-soft);border:1px solid rgba(255,255,255,.22);background:transparent;flex-shrink:0;transition:all 0.2s ease;";
                addCustomBtn.onmouseover = function(){ addCustomBtn.style.background="var(--anima-accent-soft)"; addCustomBtn.style.color="var(--anima-bg)"; };
                addCustomBtn.onmouseout = function(){ addCustomBtn.style.background="transparent"; addCustomBtn.style.color="var(--anima-accent-soft)"; };
                addCustomBtn.onclick = function(){
                    _showAddCustomTag(function(newTag, newTrans){
                        customTags.push(newTag);
                        _saveCustom(customTags);
                        if (newTrans) {
                            try { var _ct2 = JSON.parse(localStorage.getItem("nb_custom_translations")||"{}"); _ct2[newTag] = newTrans; localStorage.setItem("nb_custom_translations", JSON.stringify(_ct2)); } catch(e) {}
                        }
                        renderGrid();
                    });
                };
                srchRow.appendChild(addCustomBtn);
                // ── 多选模式 ──
                var _selMode = false, _selSelected = [];
                var selBtn = document.createElement("span");
                selBtn.textContent = animaTxt("☐ 多选"); selBtn.title = animaTxt("多选模式");
                selBtn.style.cssText = "padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;color:#ccc;border:1px solid rgba(255,255,255,0.1);background:transparent;flex-shrink:0;";
                selBtn.onclick = function(){
                    _selMode = !_selMode;
                    selBtn.style.background = _selMode ? "var(--anima-accent-hi)" : "transparent";
                    selBtn.style.color = _selMode ? "var(--anima-accent-soft)" : "var(--anima-mute)";
                    selBtn.style.borderColor = _selMode ? "var(--anima-accent-soft)" : "rgba(255,255,255,0.1)";
                    if (!_selMode) { _selSelected = []; }
                    selBtn.textContent = _selMode ? ("☑ 多选("+_selSelected.length+")") : "☐ 多选";
                    _showSelBar();
                    renderGrid();
                };
                srchRow.appendChild(selBtn);
                bx.appendChild(srchRow);
                var srchDrop = document.createElement("div");
                srchDrop.style.cssText = "display:none;max-height:180px;overflow-y:auto;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:var(--anima-well-lo);margin-bottom:4px;flex-shrink:0;";
                bx.appendChild(srchDrop);
                var _srchTimer = null;
                srchInp.oninput = function(){
                    clearTimeout(_srchTimer);
                    var q = srchInp.value.trim();
                    if (!q) { srchDrop.style.display = "none"; return; }
                    _srchTimer = setTimeout(function(){
                        srchDrop.style.display = "block";
                        srchDrop.innerHTML = '<div style="color:var(--anima-mute);padding:8px;font-size:13px;">搜索中...</div>';
                        fetch("/danbooru_anima/fuzzy_tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,limit:30})}).then(function(r){return r.json();}).then(function(d){
                            var items = d.tags||d.results||[]; srchDrop.innerHTML = "";
                            if (!items.length) { srchDrop.innerHTML = '<div style="color:var(--anima-mute);padding:8px;font-size:13px;text-align:center;">无结果</div>'; return; }
                            for (var _si=0; _si<items.length; _si++) {
                                var it = items[_si];
                                var _tg = it.tag||it.en||"";
                                if (!_tg) continue;
                                if (getAllTags().indexOf(_tg) >= 0) continue;
                                var _row = document.createElement("div");
                                _row.style.cssText = "padding:6px 12px;cursor:pointer;font-size:12px;color:var(--anima-ink-chip);border-bottom:1px solid rgba(255,255,255,0.04);";
                                _row.onmouseover = function(){ this.style.background="rgba(255,255,255,0.06)"; };
                                _row.onmouseout = function(){ this.style.background="transparent"; };
                                (function(tg2, cn2){
                                    _row.onclick = function(){
                                        srchDrop.style.display = "none"; srchInp.value = "";
                                        customTags.push(tg2); _saveCustom(customTags);
                                        // 保存搜索返回的翻译
                                        if (cn2) {
                                            try { var _ct4 = JSON.parse(localStorage.getItem("nb_custom_translations")||"{}"); _ct4[tg2] = cn2; localStorage.setItem("nb_custom_translations", JSON.stringify(_ct4)); } catch(e) {}
                                        }
                                        // 归入当前子分类
                                        if (_subCat && _subCat !== "all") { _subAssign[tg2] = _subCat; _saveAssign(_subAssign); }
                                        tags = getAllTags(); renderGrid();
                                    };
                                })(_tg, it.cn||"");
                                _row.textContent = _tg.replace(/_/g," ") + (it.cn?" ("+it.cn+")":"");
                                srchDrop.appendChild(_row);
                            }
                            if (!srchDrop.children.length) { srchDrop.innerHTML = '<div style="color:var(--anima-mute);padding:8px;font-size:13px;text-align:center;">已全部添加</div>'; }
                        }).catch(function(){ srchDrop.style.display = "none"; });
                    }, 200);
                };

                // ── 子分类切换栏 ──
                var subBar = document.createElement("div");
                subBar.style.cssText = "display:flex;gap:4px;margin-bottom:6px;flex-shrink:0;flex-wrap:wrap;";
                bx.appendChild(subBar);
                function buildSubBar(){
                    var existing = subBar.querySelectorAll(".nb-sub-tab");
                    for (var ei=0; ei<existing.length; ei++) existing[ei].remove();
                    var existingPlus = subBar.querySelector(".nb-sub-plus");
                    if (existingPlus) existingPlus.remove();
                    var allCats = getAllSubs();
                    for (var si=0; si<allCats.length; si++) {
                        (function(){
                            var sc = allCats[si][0], sl = allCats[si][1];
                            var stab = document.createElement("span");
                            stab.className = "nb-sub-tab";
                            stab.textContent = sl; stab.dataset.cat = sc;
                            stab.style.cssText = "padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:"+(sc===_subCat?"600":"400")+";color:"+(sc===_subCat?"var(--anima-accent-soft)":"var(--anima-ink-chip)")+";border:1px solid "+(sc===_subCat?"rgba(var(--anima-accent-rgb),0.5)":"rgba(255,255,255,0.12)")+";background:"+(sc===_subCat?"rgba(var(--anima-accent-rgb),0.15)":"rgba(255,255,255,0.04)")+";transition:all 0.2s ease;display:inline-flex;align-items:center;gap:3px;";
                            stab.onclick = function(){
                                _subCat = sc;
                                buildSubBar();
                                renderGrid();
                            };
                            if (_editMode && !isPresetSub(sc)) {
                                var delSub = document.createElement("span");
                                delSub.textContent = "✕"; delSub.style.cssText = "color:#e94560;font-size:13px;cursor:pointer;margin-left:2px;";
                                delSub.onclick = function(e2){ e2.stopPropagation(); _showConfirm("删除子分类「"+sl+"」？其中的标签会移到「未分类」", function(){ for (var k3 in _subAssign) { if (_subAssign[k3]===sc) _subAssign[k3]="other"; } _saveAssign(_subAssign); _customSubs = _customSubs.filter(function(x){return x[0]!==sc;}); _saveSubs(_customSubs); if(_subCat===sc) _subCat="other"; buildSubBar(); renderGrid(); }); };
                                stab.appendChild(delSub);
                            }
                            subBar.appendChild(stab);
                        })();
                    }
                    var plusBtn = document.createElement("span");
                    plusBtn.className = "nb-sub-plus";
                    plusBtn.textContent = "+"; plusBtn.title = "添加自定义子分类";
                    plusBtn.style.cssText = "padding:5px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:var(--anima-ink-chip);border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);";
                    plusBtn.onclick = function(){
                        _showPrompt("请输入子分类名称：", "", function(nm){ if (!nm) return; var id = "custom_"+Date.now(); _customSubs.push([id, nm, ""]); _saveSubs(_customSubs); buildSubBar(); });
                    };
                    subBar.appendChild(plusBtn);
                }
                buildSubBar();

                var grid = document.createElement("div");
                grid.id = "nb-popup-grid";
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;overflow-y:auto;flex:1;";
                bx.appendChild(grid);

                // ── 多选浮动栏 ──
                var selBar = document.createElement("div");
                selBar.style.cssText = "display:none;padding:6px 10px;margin-top:6px;background:rgba(32,46,44,0.9);border-radius:8px;align-items:center;gap:8px;flex-shrink:0;";
                bx.appendChild(selBar);
                function _showSelBar(){
                    if (_selSelected.length > 0 && _selMode) {
                        selBar.style.display = "flex";
                        var tags = _selSelected.join(", ");
                        if (tags.length > 40) tags = tags.substring(0,40) + "...";
                        selBar.innerHTML = '<span style="color:var(--anima-accent-soft);font-size:13px;font-weight:600;">已选 '+_selSelected.length+' 个</span>';
                        // 删除按钮
                        var _delAll = document.createElement("span");
                        _delAll.textContent = "🗑"; _delAll.title = "删除选中标签";
                        _delAll.style.cssText = "cursor:pointer;color:#e94560;font-size:14px;";
                        _delAll.onclick = function(){
                            _showConfirm("确认删除选中的 "+_selSelected.length+" 个标签？", function(){
                                for (var _si=0; _si<_selSelected.length; _si++) {
                                    var _st = _selSelected[_si];
                                    if (customTags.indexOf(_st)>=0) { customTags = customTags.filter(function(x){return x!==_st;}); _saveCustom(customTags); }
                                    else { _deleted[_st] = true; _saveDeleted(_deleted); }
                                }
                                _selSelected = []; selBtn.textContent = animaTxt("☐ 多选");
                                selBtn.style.background = "transparent"; selBtn.style.color = "var(--anima-mute)"; selBtn.style.borderColor = "rgba(255,255,255,0.1)";
                                _selMode = false; _showSelBar();
                                tags = getAllTags(); renderGrid();
                            });
                        };
                        selBar.appendChild(_delAll);
                        // 分类下拉
                        var _clsSel = document.createElement("select");
                        _clsSel.style.cssText = "padding:2px 6px;border-radius:8px;border:1px solid var(--anima-accent-soft);background:var(--anima-well);color:var(--anima-accent-soft);font-size:13px;outline:none;";
                        var _clsOpt0 = document.createElement("option"); _clsOpt0.value=""; _clsOpt0.textContent=animaTxt("分类到..."); _clsSel.appendChild(_clsOpt0);
                        for (var _si=0; _si<_customSubs.length; _si++) {
                            var _cso = document.createElement("option"); _cso.value=_customSubs[_si][0]; _cso.textContent=_customSubs[_si][1]; _clsSel.appendChild(_cso);
                        }
                        _clsSel.onchange = function(){ _okSel.style.display = this.value ? "inline" : "none"; };
                        selBar.appendChild(_clsSel);
                        var _okSel = document.createElement("span");
                        _okSel.textContent = "✅"; _okSel.title = "确认分类"; _okSel.style.cssText = "display:none;cursor:pointer;font-size:14px;";
                        _okSel.onclick = function(){
                            var _cv2 = _clsSel.value; if (!_cv2) return;
                            for (var _si2=0; _si2<_selSelected.length; _si2++) { _subAssign[_selSelected[_si2]] = _cv2; }
                            _saveAssign(_subAssign);
                            _selSelected = []; selBtn.textContent = animaTxt("☐ 多选"); selBtn.style.background = "transparent"; selBtn.style.color = "var(--anima-mute)"; selBtn.style.borderColor = "rgba(255,255,255,0.1)"; _selMode = false; _showSelBar();
                            tags = getAllTags(); renderGrid();
                        };
                        selBar.appendChild(_okSel);
                    } else {
                        selBar.style.display = "none";
                    }
                }
                _showSelBar();

                function renderGrid(){
                    // 清空前预缓存已有缩略图，避免闪烁
                    var _preImgs = grid.querySelectorAll('img');
                    for (var _pi=0; _pi<_preImgs.length; _pi++) { if (_preImgs[_pi].src && !_preImgs[_pi].src.includes('data:')) _loadedThumbs[_preImgs[_pi].src] = true; }
                    grid.innerHTML = "";
                    tags = getAllTags();
                    tags = filterBySub(tags);
                    var thumbs = _ensureThumbs();
                    for (var _ti=0; _ti<tags.length; _ti++) {
                        (function(tag){
                            var card = document.createElement("div");
                            card.dataset.nbTag = tag;
                            card.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);transition:all 0.2s ease;text-align:center;position:relative;";
                            card.onmouseover = function(){ card.style.background="rgba(255,255,255,0.08)"; card.style.transform="translateY(-2px)"; card.style.boxShadow="0 4px 12px rgba(var(--anima-accent-rgb),0.2)"; card.style.borderColor="var(--anima-accent-soft)"; };
                            card.onmouseout = function(){ card.style.background="rgba(255,255,255,0.03)"; card.style.transform=""; card.style.boxShadow=""; card.style.borderColor="rgba(255,255,255,0.06)"; };
                            card.onclick = function(){
                                if (_editMode) { return; }
                                if (_selMode) {
                                    var _idx = _selSelected.indexOf(tag);
                                    if (_idx >= 0) { _selSelected.splice(_idx, 1); card.style.border = "1px solid rgba(255,255,255,0.06)"; card.style.background = "rgba(255,255,255,0.03)"; }
                                    else { _selSelected.push(tag); card.style.border = "2px solid var(--anima-accent-soft)"; card.style.background = "rgba(var(--anima-accent-rgb),0.08)"; }
                                    selBtn.textContent = "☑ 多选("+_selSelected.length+")";
                                    _showSelBar();
                                    return;
                                }
                                onSelect(tag, _isMulti);
                            };
                            var td = document.createElement("div");
                            td.style.cssText = "width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:4px;background:rgba(255,255,255,0.04);overflow:hidden;";
                            var thumbData = thumbs[tag] || thumbs[tag.replace(/ /g,"_")] || thumbs[tag.replace(/_/g," ")];
                            var thumbUrl = "";
                            try { var _tdo = JSON.parse(thumbData); if(_tdo.url) thumbUrl = _tdo.url; } catch(e) { thumbUrl = (typeof thumbData === "string") ? thumbData : ""; }
                            if (!thumbUrl) {
                                // 不生成兜底 URL，避免无意义 HTTP 请求
                            } else {
                                var _cti = document.createElement("img");
                                _cti.src = thumbUrl.startsWith("/danbooru_anima/thumb/") || thumbUrl.startsWith("data:") ? thumbUrl : ("/danbooru_anima/image_proxy?url=" + encodeURIComponent(thumbUrl));
                                _cti.style.cssText = "width:100%;height:100%;object-fit:contain;";
                                _cti.loading = "lazy"; _cti.decoding = "async";
                                _cti.onerror = function(){ td.innerHTML = '<span style="font-size:32px;">🖼</span>'; };
                                _cti.onload = function(){ 
                                    _loadedThumbs[thumbUrl] = true;
                                    try {
                                        var _cv = document.createElement("canvas");
                                        _cv.width = this.naturalWidth; _cv.height = this.naturalHeight;
                                        var _cx = _cv.getContext("2d"); _cx.drawImage(this, 0, 0);
                                        var _b64 = _cv.toDataURL("image/jpeg", 0.8);
                                        var _all2 = JSON.parse(localStorage.getItem("apc_tag_thumbs")||"{}");
                                        _all2[tag] = JSON.stringify({url: _b64});
                                        localStorage.setItem("apc_tag_thumbs", JSON.stringify(_all2));
                                    } catch(e) {}
                                };
                                td.appendChild(_cti);
                            }
                            card.appendChild(td);
                            var lb = document.createElement("span");
                            var _cn = NB_PRESET_TRANSLATIONS[tag] || "";
                            // 读取自定义翻译（编辑模式下可修改）
                            try { var _custTrans = JSON.parse(localStorage.getItem("nb_custom_translations")||"{}"); if (_custTrans[tag]) _cn = _custTrans[tag]; } catch(e) {}
                            lb.textContent = _cn || tag;
                            lb.style.cssText = "color:#ffffff;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;";
                            card.appendChild(lb);
                            // 原 tag（小字显示）
                            if (_cn && _cn !== tag) {
                                var _ot = document.createElement("span");
                                _ot.textContent = tag;
                                _ot.style.cssText = "color:var(--anima-mute);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;";
                                card.appendChild(_ot);
                            }
                            // 编辑模式下：编辑翻译
                            if (_editMode) {
                                var _trInp = document.createElement("input");
                                _trInp.type = "text";
                                _trInp.value = _cn || "";
                                _trInp.placeholder = animaTxt("翻译");
                                _trInp.style.cssText = "width:100%;padding:2px 6px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),0.3);background:rgba(8,10,14,.88);color:#ffffff;font-size:13px;outline:none;margin-top:2px;";
                                _trInp.oninput = function(){
                                    try {
                                        var _ct = JSON.parse(localStorage.getItem("nb_custom_translations")||"{}");
                                        if (this.value.trim()) { _ct[tag] = this.value.trim(); }
                                        else { delete _ct[tag]; }
                                        localStorage.setItem("nb_custom_translations", JSON.stringify(_ct));
                                    } catch(e) {}
                                };
                                card.appendChild(_trInp);
                            }
                            // 编辑模式下显示分类下拉
                            if (_editMode) {
                                var _sc2 = _subAssign[tag] || "other";
                                var _scSel2 = document.createElement("select");
                                _scSel2.style.cssText = "width:100%;padding:1px 4px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:var(--anima-well);color:var(--anima-accent-soft);font-size:13px;outline:none;margin-top:3px;";
                                var _scOpt02 = document.createElement("option"); _scOpt02.value="other"; _scOpt02.textContent="未分类"; _scSel2.appendChild(_scOpt02);
                                for (var _si3=0; _si3<_customSubs.length; _si3++) {
                                    var _sci2 = _customSubs[_si3];
                                    var _sco2 = document.createElement("option"); _sco2.value=_sci2[0]; _sco2.textContent=_sci2[1];
                                    if (_sc2===_sci2[0]) _sco2.selected = true;
                                    _scSel2.appendChild(_sco2);
                                }
                                _scSel2.onchange = function(){ _subAssign[tag] = this.value; if (this.value==="other") delete _subAssign[tag]; _saveAssign(_subAssign); renderGrid(); };
                                card.appendChild(_scSel2);
                            }
                            // 删除按钮
                            if (_editMode) {
                                var delBtn = document.createElement("span");
                                delBtn.textContent = "✕"; delBtn.title = "删除标签";
                                delBtn.style.cssText = "position:absolute;top:4px;left:4px;font-size:13px;cursor:pointer;color:#e94560;background:rgba(0,0,0,0.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;z-index:1;";
                                delBtn.onclick = function(e2){ e2.stopPropagation(); _showConfirm("确认删除标签「"+tag+"」？", function(){ if (customTags.indexOf(tag)>=0) { customTags = customTags.filter(function(x){return x!==tag;}); _saveCustom(customTags); } else { _deleted[tag] = true; _saveDeleted(_deleted); } tags = getAllTags(); renderGrid(); }); };
                                card.appendChild(delBtn);
                            } else if (customTags.indexOf(tag) >= 0) {
                                var delBtn2 = document.createElement("span");
                                delBtn2.textContent = "✕"; delBtn2.title = animaTxt("删除自定义标签");
                                delBtn2.style.cssText = "position:absolute;top:4px;left:4px;font-size:13px;cursor:pointer;color:#e94560;background:rgba(0,0,0,0.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;z-index:1;";
                                delBtn2.onclick = function(e2){ e2.stopPropagation(); customTags = customTags.filter(function(x){return x!==tag;}); _saveCustom(customTags); tags = getAllTags(); renderGrid(); };
                                card.appendChild(delBtn2);
                            }
                            // 📷 设置缩略图
                            var setBtn = document.createElement("span");
                            setBtn.textContent = "📷"; setBtn.style.cssText = "position:absolute;top:4px;right:4px;font-size:16px;cursor:pointer;opacity:0.85;z-index:1;background:rgba(0,0,0,0.6);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;line-height:1;";
                            setBtn.title = animaTxt("设置缩略图");
                            setBtn.onclick = (function(t){ return function(e2){ e2.stopPropagation(); _openThumbSetter(t, function(){ tags = getAllTags(); renderGrid(); }); }; })(tag);
                            card.appendChild(setBtn);
                            grid.appendChild(card);
                        })(tags[_ti]);
                    }
                }
                renderGrid();
                document.body.appendChild(bx);
            }

            // ── XML 预览 ──
            const previewCard = document.createElement("div");
            previewCard.style.cssText = _nbCardSkin;
            previewCard.appendChild(mkLabel("📋 XML 预览"));
            const previewEl = document.createElement("div");
            previewEl.style.cssText = "color:var(--anima-ink-chip);font-size:12px;line-height:1.65;min-height:24px;word-break:break-all;background:rgba(8,10,14,.88);padding:10px 12px;border-radius:8px;border:1px solid rgba(var(--anima-accent-rgb),.28);white-space:pre-wrap;font-family:monospace;max-height:200px;overflow-y:auto;";
            previewCard.appendChild(previewEl);
            panel.appendChild(previewCard);

            node.addDOMWidget("newbie_composer_ui", "div", panel, { show_title: false });
            collapseHiddenWidgets();
            setTimeout(collapseHiddenWidgets, 80);
            setTimeout(collapseHiddenWidgets, 400);

            function refreshPreview() {
                const _normT = (s) => (s||"").split(/[,，]+/).map(function(t){return t.trim().replace(/ +/g,"_");}).filter(Boolean).join(", ");
                const lines = [];
                lines.push("<img>");
                for (let i = 0; i < _characters.length; i++) {
                    const ch = _characters[i] || {};
                    const cl = []; cl.push("  <character_" + (i + 1) + ">");
                    for (const [key] of NB_CHAR_FIELDS) {
                        let _rv = ch[key];
                        if (Array.isArray(_rv)) _rv = _rv.join(", ");
                        const v = (_rv || "").trim();
                        if (v) cl.push("    <" + key + ">" + esc(_normT(v)) + "</" + key + ">");
                    }
                    cl.push("  </character_" + (i + 1) + ">");
                    lines.push(cl.join("\n"));
                }
                const gl = []; gl.push("  <general_tags>");
                for (const [key] of NB_GENERAL_FIELDS) {
                    const wk = "nb_" + key;
                    const v = (w[wk]?.value || "").trim();
                    if (v) gl.push("    <" + key + ">" + esc(_normT(v)) + "</" + key + ">");
                }
                gl.push("  </general_tags>");
                lines.push(gl.join("\n"));
                // caption（自然语言，不转下划线）
                var _cap = (w.nb_caption?.value || "").trim();
                if (_cap) lines.push("  <caption>" + esc(_cap) + "</caption>");
                lines.push("</img>");
                previewEl.textContent = lines.join("\n");
            }

            if (!_characters.length) { _characters = [{}]; }
            renderChars();
            refreshPreview();

            // ── 延迟恢复（ComfyUI 在 onNodeCreated 后才恢复 widget 值）──
            setTimeout(() => {
                try {
                    const raw = _charWidget?.value || "[]";
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length) {
                        _characters = parsed;
                        renderChars();
                    }
                } catch (e) { }
                refreshPreview();
            }, 200);

            function _refreshNL() {
                var _nlRef2 = nlCard.querySelector("input");
                var _val2 = w.nb_caption?.value || "";
                if (_nlRef2 && _nlRef2.value !== _val2) _nlRef2.value = _val2;
                // 如果 widget 里已是英文（翻译过的），同步显示到结果区
                if (_val2 && (/[a-zA-Z]/.test(_val2))) { nlResult.textContent = _val2; }
            }
            _refreshNL();

            setTimeout(() => {
                for (const [key] of NB_GENERAL_FIELDS) {
                    var _ref = _genInputRefs[key];
                    if (_ref) _ref.value = w["nb_" + key]?.value || "";
                }
                _refreshNL();
                refreshPreview();
            }, 500);
        };
    },
});
