"""
Anima 随机提示词引擎 — API 路由
- AnimaDex 角色搜索/详情代理
- 随机标签池（基于 tag_groups.json）
- 随机抽取 roll API
"""
import csv
import json
import os
import random
import re
import asyncio
from server import PromptServer
from aiohttp import web

from .animadex_browser import ANIMADEX_BASE, adex_get


# ── 中文角色名索引（启动时预加载，避免首次搜索卡顿） ──

_CN_CHAR_INDEX = {}   # 中文名 → [英文slug列表]
_CHAR_INDEX = {}      # 汉字 → {中文名集合}，用于快速交集剪枝


def _load_cn_char_index():
    global _CN_CHAR_INDEX, _CHAR_INDEX
    if _CN_CHAR_INDEX:
        return _CN_CHAR_INDEX
    plugin_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fp = os.path.join(plugin_root, "tags_enhanced.csv")
    if not os.path.isfile(fp):
        return {}
    for enc in ["gbk", "utf-8", "utf-8-sig", "gb2312"]:
        try:
            with open(fp, "r", encoding=enc) as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if not header or len(header) < 5:
                    continue
                loaded = 0
                for row in reader:
                    if len(row) < 5:
                        continue
                    if row[4].strip() != "4":
                        continue
                    en_name = row[0].strip()
                    cn_raw = row[1].strip()
                    if not en_name or not cn_raw:
                        continue
                    for cn_part in cn_raw.split(","):
                        cn_part = cn_part.strip()
                        if not cn_part:
                            continue
                        _CN_CHAR_INDEX.setdefault(cn_part, [])
                        if en_name not in _CN_CHAR_INDEX[cn_part]:
                            _CN_CHAR_INDEX[cn_part].append(en_name)
                        # 建汉字字符索引
                        for ch in cn_part:
                            if '\u4e00' <= ch <= '\u9fff':
                                _CHAR_INDEX.setdefault(ch, set()).add(cn_part)
                    loaded += 1
                print(f"[AnimaRandom] 中文角色索引已加载: {loaded} 角色, {len(_CN_CHAR_INDEX)} 中文条目, {len(_CHAR_INDEX)} 汉字")
                break
        except (UnicodeDecodeError, Exception):
            continue
    return _CN_CHAR_INDEX


# 启动时预加载（避免首次搜索等待）
_load_cn_char_index()


def _has_cjk(text):
    """检测是否包含中日韩字符"""
    return bool(re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]', text))


def _cn_to_en_chars(query):
    """中文角色名 → 英文标签候选（汉字索引加速）"""
    idx = _CN_CHAR_INDEX
    if not idx:
        return []
    results = []
    # 精确匹配
    if query in idx:
        for en in idx[query]:
            results.append((en, query, 10))
    # 汉字交集剪枝 + 子串匹配
    if _CHAR_INDEX:
        # 取 query 中所有汉字的候选集交集
        char_sets = []
        for ch in query:
            if '\u4e00' <= ch <= '\u9fff' and ch in _CHAR_INDEX:
                char_sets.append(_CHAR_INDEX[ch])
        if char_sets:
            candidates = char_sets[0].copy()
            for cs in char_sets[1:]:
                candidates &= cs
            # 只在交集内做子串匹配
            for cn_name in candidates:
                if cn_name == query:
                    continue
                if query in cn_name:
                    for en in idx.get(cn_name, []):
                        results.append((en, cn_name, 5))
    else:
        # 无字符索引，回退全遍历
        for cn_name, en_list in idx.items():
            if cn_name == query:
                continue
            if query in cn_name:
                for en in en_list:
                    results.append((en, cn_name, 5))
    results.sort(key=lambda x: x[2], reverse=True)
    seen = set()
    unique = []
    for en, cn, score in results:
        if en not in seen:
            seen.add(en)
            unique.append(en)
    return unique[:20]


# ── 加载本地标签池 ──

def _my_dir():
    return os.path.dirname(os.path.abspath(__file__))


def _load_pool():
    fp = os.path.join(_my_dir(), "tag_groups.json")
    if not os.path.isfile(fp):
        return {}
    with open(fp, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("group_to_tags", {})


# 可随机分类 → tag_groups 映射
RANDOM_CATEGORIES = {
    "attire":         {"groups": ["attire"],                    "label": "服装",    "count": 0},
    "posture":        {"groups": ["posture", "gestures"],      "label": "姿势",    "count": 0},
    "expression":     {"groups": ["face_tags"],                 "label": "表情",    "count": 0},
    "background":     {"groups": ["backgrounds"],               "label": "背景",    "count": 0},
    "accessories":    {"groups": ["accessories"],               "label": "配饰",    "count": 0},
    "hair_style":     {"groups": ["hair_styles"],               "label": "发型",    "count": 0},
    "hair_color":     {"groups": ["hair_color"],                "label": "发色",    "count": 0},
    "eye_color":      {"groups": ["eyes_tags"],                 "label": "瞳色",    "count": 0},
    "lighting":       {"groups": ["lighting"],                  "label": "光影",    "count": 0},
    "visual_style":   {"groups": ["visual_aesthetic"],          "label": "视觉风格","count": 0},
    "composition":    {"groups": ["image_composition"],         "label": "构图",    "count": 0},
}

# 加载时填充 count
_pool = _load_pool()
for cat_key, cat_info in RANDOM_CATEGORIES.items():
    total = 0
    for g in cat_info["groups"]:
        tags = _pool.get(g, [])
        # 排除 "tag_groups" 伪标签
        real = [t for t in tags if t != "tag_groups"]
        total += len(real)
    cat_info["count"] = total


# ── AnimaDex 代理 ──

def _animadex_search(query="", mode="characters", page=1, limit=36, sort="count"):
    try:
        url = f"{ANIMADEX_BASE}/api/{mode}/search"
        params = {"q": query.strip(), "page": page, "sort": sort}
        r = adex_get(url, params=params, timeout=20)
        if r.status_code != 200:
            return [], 0
        data = r.json()
        return data.get("results", [])[:limit], data.get("total", 0)
    except Exception:
        return [], 0


def _animadex_character(slug):
    """获取单个角色详情：搜索 slug，返回第一个匹配项"""
    try:
        url = f"{ANIMADEX_BASE}/api/characters/search"
        params = {"q": slug, "page": 1, "sort": "count"}
        r = adex_get(url, params=params, timeout=20)
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results", [])
        for item in results:
            if item.get("slug") == slug:
                return item
        return results[0] if results else None
    except Exception:
        return None


# ── API 路由 ──

def register_random_routes():
    @PromptServer.instance.routes.get("/anima_random/character")
    async def anima_random_character(request):
        """获取角色详情"""
        slug = request.query.get("slug", "").strip()
        if not slug:
            return web.json_response({"error": "missing slug"}, status=400)
        result = await asyncio.to_thread(_animadex_character, slug)
        if not result:
            return web.json_response({"error": "character not found"}, status=404)
        # 精简返回字段
        return web.json_response({
            "slug": result.get("slug", ""),
            "name": result.get("name", ""),
            "copyright": result.get("copyright", ""),
            "copyright_name": result.get("copyright_name", ""),
            "trigger": result.get("trigger", ""),
            "tags": result.get("tags", []),
            "thumb_url": result.get("thumb_url", ""),
            "loras": result.get("loras", []),
        })

    @PromptServer.instance.routes.post("/anima_random/character_search")
    async def anima_random_character_search(request):
        """搜索角色（支持中文名自动转英文搜索）"""
        try:
            data = await request.json()
            query = data.get("query", "").strip()
            sort = data.get("sort", "count")
            page = int(data.get("page", 1))
            limit = int(data.get("limit", 36))
            limit = int(data.get("limit", 36))

            if not query:
                results, total = await asyncio.to_thread(
                    _animadex_search, "", "characters", page, limit, sort
                )
            elif _has_cjk(query):
                # 中文输入 → 先找英文角色名
                en_names = _cn_to_en_chars(query)
                if en_names:
                    results, total = await asyncio.to_thread(
                        _animadex_search, en_names[0], "characters", 1, limit, sort
                    )
                    # 多候选时合并搜索
                    if len(en_names) > 1 and len(results) < 10:
                        extra_seen = {r.get("slug", "") for r in results}
                        for en in en_names[1:8]:
                            more, _ = await asyncio.to_thread(
                                _animadex_search, en, "characters", 1, 10, sort
                            )
                            for r in more:
                                s = r.get("slug", "")
                                if s not in extra_seen:
                                    extra_seen.add(s)
                                    results.append(r)
                                    if len(results) >= 36:
                                        break
                            if len(results) >= 36:
                                break
                    total = len(results)
                else:
                    # 中文名没匹配，直接发给 animadex
                    results, total = await asyncio.to_thread(
                        _animadex_search, query, "characters", page, limit, sort
                    )
            else:
                results, total = await asyncio.to_thread(
                    _animadex_search, query, "characters", page, limit, sort
                )
            # 精简返回
            items = []
            for r in results:
                items.append({
                    "slug": r.get("slug", ""),
                    "name": r.get("name", ""),
                    "copyright_name": r.get("copyright_name", ""),
                    "thumb_url": r.get("thumb_url", ""),
                    "tags": r.get("tags", []),
                    "count": r.get("count", 0),
                })
            return web.json_response({"success": True, "results": items, "total": total})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/anima_random/popular_chars")
    async def anima_random_popular_chars(request):
        """返回热门角色列表（从 animadex 抓，支持分页）"""
        try:
            page = int(request.query.get("page", "1"))
            page = max(1, page)
            limit = int(request.query.get("limit", "36"))
            results, total = await asyncio.to_thread(
                _animadex_search, "", "characters", page, limit, "count"
            )
            items = []
            for r in results:
                items.append({
                    "slug": r.get("slug", ""),
                    "name": r.get("name", ""),
                    "copyright_name": r.get("copyright_name", ""),
                    "thumb_url": r.get("thumb_url", ""),
                    "tags": r.get("tags", []),
                    "count": r.get("count", 0),
                })
            total_pages = max(1, (total + limit - 1) // limit)
            return web.json_response({
                "success": True, "results": items, "total": total,
                "page": page, "total_pages": total_pages,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/anima_random/pool")
    async def anima_random_pool(request):
        """返回可随机分类及数量"""
        cats = []
        for key, info in RANDOM_CATEGORIES.items():
            cats.append({
                "key": key,
                "label": info["label"],
                "count": info["count"],
            })
        return web.json_response({"categories": cats})

    @PromptServer.instance.routes.post("/anima_random/roll")
    async def anima_random_roll(request):
        """
        从指定分类随机抽取 tags
        POST body: {
            "categories": ["attire", "pose", "expression", ...],
            "count": 3,          // 每个分类抽几个
            "exclude": ["tag1"]  // 排除的 tag（如已有固定特征）
        }
        """
        try:
            data = await request.json()
            cats = data.get("categories", [])
            count = max(1, min(10, int(data.get("count", 3))))
            exclude = set(data.get("exclude", []))

            result = {}
            for cat_key in cats:
                cat_info = RANDOM_CATEGORIES.get(cat_key)
                if not cat_info:
                    continue
                # 收集该分类的所有 tag
                pool_tags = []
                for g in cat_info["groups"]:
                    for t in _pool.get(g, []):
                        if t != "tag_groups" and t not in exclude:
                            # 用空格替换下划线的版本
                            pool_tags.append(t)
                if not pool_tags:
                    result[cat_key] = []
                    continue
                # 随机抽 count 个
                n = min(count, len(pool_tags))
                chosen = random.sample(pool_tags, n)
                # 转空格
                result[cat_key] = [t.replace("_", " ") for t in chosen]

            return web.json_response({"success": True, "tags": result})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/anima_random/compose")
    async def anima_random_compose(request):
        """试抽 / 分维重抽。与节点 run() 共用 compose 引擎。"""
        try:
            data = await request.json()
            from .random_compose import compose_roll, assemble_prompt, parse_roll
            keep = data.get("keep_rolls")
            if isinstance(keep, str):
                keep = parse_roll(keep)
            if not isinstance(keep, dict):
                keep = None
            reroll_dim = data.get("reroll_dim") or None
            if reroll_dim:
                reroll_dim = str(reroll_dim).strip()
            kwargs = dict(
                characters_json=data.get("characters_json") or "[]",
                nsfw_mode=int(data.get("nsfw_mode") or 0),
                context_random=data.get("context_random") is not False,
                roll_attire=bool(data.get("roll_attire", True)),
                roll_posture=bool(data.get("roll_posture", True)),
                roll_expression=bool(data.get("roll_expression", True)),
                roll_background=bool(data.get("roll_background", False)),
                roll_accessories=bool(data.get("roll_accessories", False)),
                roll_lighting=bool(data.get("roll_lighting", False)),
                roll_visual=bool(data.get("roll_visual", False)),
                attire_n=int(data.get("attire_n") or 1),
                posture_n=int(data.get("posture_n") or 1),
                expression_n=int(data.get("expression_n") or 1),
                background_n=int(data.get("background_n") or 1),
                accessories_n=int(data.get("accessories_n") or 1),
                lighting_n=int(data.get("lighting_n") or 1),
                visual_n=int(data.get("visual_n") or 1),
                count_tags=data.get("count_tags") or "1girl",
                custom_tags=data.get("custom_tags") or "",
                outfit_mode=int(data.get("outfit_mode") or 0),
                identity_lock=data.get("identity_lock") is not False,
                keep_rolls=keep,
                reroll_dim=reroll_dim,
            )
            roll = compose_roll(**kwargs)
            prompt = assemble_prompt(
                roll,
                characters_json=kwargs["characters_json"],
                artist_tags=data.get("artist_tags") or "",
                custom_tags=kwargs["custom_tags"],
                model_mode=int(data.get("model_mode") or 0),
                outfit_mode=kwargs["outfit_mode"],
                identity_lock=kwargs["identity_lock"],
            )
            return web.json_response({"success": True, "roll": roll, "prompt": prompt})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/anima_random/context_tags")
    async def anima_random_context_tags(request):
        """
        根据人数/性别从 G站搜索上下文标签，返回高频服装/姿势/表情/背景。
        POST body: {"count_tags": "1girl", "limit": 30}
        """
        try:
            data = await request.json()
            count_tags = data.get("count_tags", "1girl").strip()
            limit = min(int(data.get("limit", 30)), 50)
            if not count_tags:
                return web.json_response({"success": False, "error": "missing count_tags"}, status=400)

            # 调用 G站搜索（仅 general 分级 + 按分数排序）
            def _do_gel_search():
                try:
                    from .gelbooru_api import search_posts, API_AVAILABLE
                    if not API_AVAILABLE:
                        return []
                    posts = search_posts(
                        count_tags, page=0, limit=limit,
                        rating=["general"], order="score:desc"
                    )
                    return posts
                except Exception:
                    return []

            posts = await asyncio.to_thread(_do_gel_search)
            if not posts:
                return web.json_response({"success": True, "tags": {}, "source": "gelbooru", "post_count": 0})

            # 聚合标签 → 按分类统计频率
            from .tag_conflicts import is_nsfw
            cat_hist = {k: {} for k in ["attire","posture","expression","background","accessories","lighting","visual"]}
            # 分类映射
            _cat_map = {
                "attire": {"attire","legwear","handwear","headwear"},
                "posture": {"posture","gestures"},
                "expression": {"face_tags"},
                "background": {"backgrounds"},
                "accessories": {"accessories"},
                "lighting": {"lighting"},
                "visual": {"visual_aesthetic","colors","image_composition","patterns"},
            }
            _pool = _load_pool()
            total_tags = 0
            for post in posts:
                post_tags = post.get("tags", "").split()
                for t in post_tags:
                    t = t.strip().lower()
                    if not t or t == "tag_groups" or is_nsfw(t):
                        continue
                    total_tags += 1
                    # 查 tag 属于哪个分类
                    for cat_key, group_names in _cat_map.items():
                        found = False
                        for gn in group_names:
                            if t in _pool.get(gn, []):
                                display = t.replace("_", " ")
                                cat_hist[cat_key][display] = cat_hist[cat_key].get(display, 0) + 1
                                found = True
                                break
                        if found:
                            break

            # 每分类取 top N
            result = {}
            for cat_key, hist in cat_hist.items():
                sorted_tags = sorted(hist.items(), key=lambda x: x[1], reverse=True)[:15]
                result[cat_key] = [t for t, _ in sorted_tags]

            return web.json_response({
                "success": True,
                "tags": result,
                "source": "gelbooru",
                "post_count": len(posts),
                "total_tags": total_tags,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/anima_random/gel_character")
    async def anima_random_gel_character(request):
        """
        G站角色搜索：搜图片 → 提取角色特征标签（发型/发色/瞳色/衣着/配饰）
        自动排除背景/姿势/表情/光影等非特征标签
        """
        try:
            data = await request.json()
            query = data.get("query", "").strip()
            page = int(data.get("page", 1))
            limit = int(data.get("limit", 36))
            limit = int(data.get("limit", 36))
            limit = min(int(data.get("limit", 30)), 50)
            sort = data.get("sort", "score:desc")
            if not query:
                return web.json_response({"success": True, "results": [], "total": 0})

            def _do_search():
                try:
                    from .gelbooru_api import search_posts, _has_credentials
                    if not _has_credentials():
                        return [], 0, False
                    posts = search_posts(query, page=page-1, limit=limit,
                                         rating=["general"], order=sort)
                    return posts, len(posts), True
                except Exception:
                    return [], 0, False

            posts, count, has_creds = await asyncio.to_thread(_do_search)
            if not has_creds:
                return web.json_response({"success": False, "error": "no_credentials"}, status=401)

            # 标签分类：保留角色特征，排除场景/动作
            TRAIT_GROUPS = {"hair","hair_color","hair_styles","eyes_tags","body_parts",
                            "attire","legwear","handwear","headwear","accessories"}
            EXCLUDE_GROUPS = {"backgrounds","posture","gestures","face_tags",
                              "lighting","visual_aesthetic","image_composition","colors",
                              "patterns","focus_tags","skin_color"}

            _pool = _load_pool()
            results = []
            seen_tags = set()
            char_tags_hist = {}  # tag → frequency
            series_tags = set()

            for post in posts:
                post_tags = post.get("tags", "").split()
                thumb = post.get("preview_url") or post.get("sample_url") or ""
                # 第一张作为缩略图
                char_data = {
                    "name": query,
                    "thumb_url": thumb,
                    "series": "",
                    "tag_count": 0,
                }
                for t in post_tags:
                    t = t.strip().lower()
                    if not t or t == "tag_groups": continue
                    # 检查 tag 属于哪个分类
                    for gn in TRAIT_GROUPS:
                        if t in _pool.get(gn, []):
                            display = t.replace("_", " ")
                            char_tags_hist[display] = char_tags_hist.get(display, 0) + 1
                            break
                    # 检查系列标签
                    for gn in ["copyrights"] if "copyrights" in _pool else []:
                        if t in _pool.get(gn, []):
                            series_tags.add(t.replace("_", " "))
                            break
                    seen_tags.add(t)

            # 按频率排序取 top 40
            sorted_traits = sorted(char_tags_hist.items(), key=lambda x: x[1], reverse=True)[:40]
            char_data["tags"] = [t for t, _ in sorted_traits]
            char_data["series"] = ", ".join(sorted(series_tags)[:5]) if series_tags else ""
            char_data["tag_count"] = len(sorted_traits)
            results.append(char_data)

            return web.json_response({
                "success": True,
                "results": results,
                "total": count,
                "post_count": count,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/anima_random/gel_credentials")
    async def anima_random_gel_credentials(request):
        """返回 G站 API 是否已配置"""
        try:
            from .gelbooru_api import _has_credentials
            return web.json_response({"has_creds": _has_credentials()})
        except Exception:
            return web.json_response({"has_creds": False})

    @PromptServer.instance.routes.post("/anima_random/gel_set_credentials")
    async def anima_random_gel_set_credentials(request):
        """设置 G站 API 凭证"""
        try:
            data = await request.json()
            api_key = data.get("api_key", "").strip()
            user_id = data.get("user_id", "").strip()
            if not api_key or not user_id:
                return web.json_response({"success": False, "error": "missing fields"}, status=400)
            from .gelbooru_api import set_credentials
            set_credentials(api_key, user_id)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/anima_random/verify_tags")
    async def anima_verify_tags(request):
        """批量验证标签类型：返回哪些是艺术家/角色/系列/通用（使用本地表 + 缓存）"""
        try:
            data = await request.json()
            tags = data.get("tags", [])
            if not tags:
                return web.json_response({"success": True, "classified": {}})
            
            artists_set = set()
            chars_set = set()
            # 加载本地角色索引
            cn_idx = _load_cn_char_index()
            # 收集所有英文角色名
            all_cn_chars = set()
            for names in cn_idx.values():
                for n in names:
                    all_cn_chars.add(n.lower())
            
            result = {}
            for tag in tags:
                clean = tag.strip().lstrip("@").replace("_", " ").strip()
                cl = clean.lower()
                # 1. 检查本地角色表
                if cl in all_cn_chars:
                    result[tag] = "character"
                else:
                    # 2. 默认标记为 general，由前端异步再查
                    result[tag] = "general"
            
            return web.json_response({"success": True, "classified": result})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    print("[AnimaRandom] 随机提示词 API 路由已注册")
