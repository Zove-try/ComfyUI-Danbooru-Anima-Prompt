"""
标签工具模块 - Danbooru API 调用 + 标签分类逻辑
"""
import re
import time
import threading
import logging

import requests
import urllib3
from urllib.parse import urlparse

# 本地标签数据库（可选）
try:
    from . import tag_db
    HAS_TAG_DB = True
except ImportError:
    HAS_TAG_DB = False

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 尝试多种方式绕过 CDN（cloudscraper / curl_cffi）
HAS_CLOUDSCRAPER = False
_CDN_SESSION = None

# 方式 1: curl_cffi (最推荐 — 完美模拟浏览器 TLS)
try:
    from curl_cffi import requests as cffer
    _CDN_SESSION = cffer.Session()
    _CDN_MODE = "curl_cffi"
except ImportError:
    # 方式 2: cloudscraper
    try:
        import cloudscraper
        _CDN_SESSION = cloudscraper.create_scraper()
        _CDN_MODE = "cloudscraper"
        HAS_CLOUDSCRAPER = True
    except ImportError:
        _CDN_SESSION = None
        _CDN_MODE = "requests"

BASE_URL = "https://danbooru.donmai.us"

# Danbooru API 要求描述性 UA（不能用 python-requests 默认的）
# CDN 图片需要浏览器风格 UA，分开使用
API_UA = "DanbooruAnimaPrompt/1.0 (Anime tag classifier)"
CDN_UA = "Danbooru-Gallery/1.0"  # 简单描述性 UA 才能过 CF（Chrome UA 被 403）

API_HEADERS = {
    "User-Agent": API_UA,
    "Accept": "application/json",
}

CDN_HEADERS = {
    "User-Agent": CDN_UA,
    "Accept": "image/webp,image/avif,image/png,image/jpeg,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://danbooru.donmai.us/",
}

# ── 内存缓存（避免重复请求） ────────────────────────────
_cache = {}
_cache_lock = threading.Lock()

def _cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.monotonic() - entry["ts"] < 300:  # 5 分钟过期
            return entry["val"]
    return None

def _cache_set(key, val):
    with _cache_lock:
        _cache[key] = {"val": val, "ts": time.monotonic()}

def _cache_clear():
    with _cache_lock:
        _cache.clear()


# ── 限流器 ──────────────────────────────────────────
class _RateLimiter:
    def __init__(self, min_interval_sec=0.2):
        self.min_interval = min_interval_sec
        self._last_ts = 0.0
        self._lock = threading.Lock()

    def wait(self):
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_ts
            if elapsed < self.min_interval:
                time.sleep(self.min_interval - elapsed)
            self._last_ts = time.monotonic()

_donmai_throttle = _RateLimiter(min_interval_sec=0.2)




def _request(method, url, **kwargs):
    """跟 D 站画廊一样：简单 requests → 限流 + UA + 429/503 重试"""
    headers = dict(kwargs.pop("headers", None) or {})
    is_cdn = "cdn." in url
    for k, v in (CDN_HEADERS if is_cdn else API_HEADERS).items():
        headers.setdefault(k, v)
    verify = kwargs.pop("verify", True)
    to = kwargs.pop("timeout", None) or 10

    host = ""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        host = ""
    if host == "donmai.us" or host.endswith(".donmai.us"):
        from .donmai_client import get as donmai_get
        return donmai_get(url, params=kwargs.get("params"), data=kwargs.get("data"), timeout=to, method=method)

    for attempt in range(2):
        _donmai_throttle.wait()
        try:
            resp = requests.request(method, url, headers=headers, timeout=to, verify=verify, **kwargs)
            if resp.status_code not in (429, 503) or attempt == 1:
                return resp
            retry_after = resp.headers.get("Retry-After")
            delay = min(max(float(retry_after or "2"), 0.5), 10.0)
            time.sleep(delay)
        except requests.exceptions.RequestException:
            if attempt == 1:
                raise
            time.sleep(1)
    return resp


# ── Danbooru API 封装 ──────────────────────────────

_RATING_ORDER = ("general", "sensitive", "questionable", "explicit")
_RATING_LETTER = {"general": "g", "sensitive": "s", "questionable": "q", "explicit": "e"}
_RATING_FROM_LETTER = {v: k for k, v in _RATING_LETTER.items()}


def _normalize_ratings(rating):
    """Turn 'general,sensitive' / ['g','s'] into ['general','sensitive']."""
    if not rating:
        return []
    if isinstance(rating, (list, tuple, set)):
        raw = [str(r).strip().lower() for r in rating if r]
    else:
        raw = [r.strip().lower() for r in str(rating).replace(";", ",").split(",") if r.strip()]
    out = []
    seen = set()
    for v in raw:
        name = v if v in _RATING_LETTER else _RATING_FROM_LETTER.get(v)
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _rating_metatag(rating):
    """One Danbooru metatag. rating:g,s is OR; rating:gs is treated as general-only — do not use it."""
    vals = _normalize_ratings(rating)
    if not vals or set(vals) == set(_RATING_ORDER):
        return ""
    return "rating:" + ",".join(_RATING_LETTER[v] for v in _RATING_ORDER if v in vals)


def search_posts(tags, page=1, limit=20, rating=None, order=None, before_id=None, before_score=None):
    """搜索帖子，返回帖子列表"""
    params = {
        "tags": tags or "",
        "limit": min(limit, 100),
    }
    _ord = str(order or "").strip()
    _id_orders = {"id:desc", "id_desc", "id:asc", "id_asc", "id"}
    _is_score = _ord == "score" or _ord.startswith("score")

    # 评分排序用数字 page。page=b<id> 会按最老 id 切开，把后面的高分图整段跳掉；
    # score:<= 会把「同分窗口」卡死：下一页仍是同一批高分，去重后变空，分级时只剩一两页。
    # character + order:score 的数字翻页可以到上百页（空搜索的 order:score 会被 D 站超时，那是站点限制）。
    if _is_score:
        params["page"] = max(int(page or 1), 1)
        before_id = None
    elif before_id:
        # 时间排序：数字 page 在带分级的复杂查询里会超时，改用 page=b<id>
        params["page"] = f"b{before_id}"
    else:
        params["page"] = max(int(page or 1), 1)

    # D 站官方：order:id / order:id_asc = 旧→新；order:id_desc = 新→旧（时间线默认）。
    # 前端「时间」存的是 id:desc。默认排序已经是新→旧，不要再写 order:id_desc：
    # 多一个 metatag 后，部分角色+分级会 500，再被缓存成「没有结果」，但 count 仍显示几十页。
    if _ord:
        if before_id and _ord not in _id_orders:
            pass
        elif _ord in ("id:desc", "id_desc"):
            pass
        elif _ord in ("id:asc", "id_asc"):
            params["tags"] = f"order:id_asc {tags}".strip()
        elif _ord == "id":
            params["tags"] = f"order:id {tags}".strip()
        else:
            params["tags"] = f"order:{_ord} {tags}".strip()

    rate_tag = _rating_metatag(rating)
    if rate_tag:
        params["tags"] = (params["tags"] + " " + rate_tag).strip()

    url = f"{BASE_URL}/posts.json"
    resp = _request("GET", url, params=params, timeout=30)
    if resp.status_code == 500:
        # 带分级的复杂查询偶发 QueryCanceled，立刻再试一次
        time.sleep(0.6)
        resp = _request("GET", url, params=params, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list):
            return data
        print(f"[DanbooruAnima] search_posts 非列表 JSON tags={params.get('tags')!r} body={str(data)[:200]}")
        return []
    print(f"[DanbooruAnima] search_posts HTTP {resp.status_code} tags={params.get('tags')!r}")
    return []


def count_posts(tags, rating=None):
    """帖子总数。不含 order / 翻页，和当前分级筛选用同一套 rating: 元标签。"""
    tag_str = (tags or "").strip()
    rate_tag = _rating_metatag(rating)
    if rate_tag:
        tag_str = (tag_str + " " + rate_tag).strip()
    ck = "count:" + tag_str
    cached = _cache_get(ck)
    if cached is not None:
        return int(cached or 0)
    try:
        resp = _request("GET", f"{BASE_URL}/counts/posts.json", params={"tags": tag_str}, timeout=15)
        if resp.status_code == 200:
            data = resp.json() or {}
            n = int(((data.get("counts") or {}).get("posts")) or 0)
            _cache_set(ck, n)
            return n
        print(f"[DanbooruAnima] count_posts HTTP {resp.status_code} tags={tag_str!r}")
    except Exception as e:
        print(f"[DanbooruAnima] count_posts failed: {e}")
    return 0


def get_post_detail(post_id):
    """获取单帖完整信息（含 tags 和 tag_string_*），带缓存"""
    cache_key = f"post:{post_id}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    url = f"{BASE_URL}/posts/{post_id}.json"
    try:
        resp = _request("GET", url)
    except requests.exceptions.RequestException as e:
        print(f"[DanbooruAnima] get_post_detail({post_id}) 网络失败: {e}")
        return None
    if resp.status_code == 200:
        data = resp.json()
        _cache_set(cache_key, data)
        return data
    print(f"[DanbooruAnima] get_post_detail({post_id}) 失败: HTTP {resp.status_code}")
    return None


def get_tag_categories_batch(tag_names, use_local_db=True):
    """
    批量查询 tag 的 category。
    优先查本地数据库（如果可用），未命中的再调 API。
    
    Args:
        tag_names: list[str]
        use_local_db: 是否启用本地数据库查询
        
    Returns:
        dict: {tag_name: category_id}
        category_id: 0=general, 1=artist, 3=copyright, 4=character, 5=meta
    """
    if not tag_names:
        return {}

    # ── 第 1 步：查本地数据库 ──
    local_hits = {}
    remaining = tag_names
    if use_local_db and HAS_TAG_DB:
        try:
            local_hits = tag_db.batch_lookup(tag_names)
            if local_hits:
                remaining = [t for t in tag_names if t not in local_hits]
                if not remaining:
                    return local_hits
        except Exception as e:
            print(f"[DanbooruAnima] 本地数据库查询失败，降级到 API: {e}")

    # ── 第 2 步：查内存缓存（只查 remaining） ──
    cache_hits = {}
    still_remaining = list(remaining)
    if remaining:
        for tag in list(remaining):
            cached = _cache_get(f"cat:{tag}")
            if cached is not None:
                cache_hits[tag] = cached
                still_remaining.remove(tag)

    if not still_remaining:
        result = {**local_hits, **cache_hits}
        return result

    # ── 第 3 步：调 API 查仍未命中的标签 ──
    api_result = {}
    try:
        names_str = ",".join(still_remaining)
        url = f"{BASE_URL}/tags.json"
        params = {
            "search[name_normalize]": names_str,
            "limit": min(len(still_remaining), 200),
        }
        resp = _request("GET", url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            for tag in data:
                api_result[tag["name"]] = tag.get("category", 0)
        # 未返回的 tag 默认先留空，让语义引擎尝试
        for name in still_remaining:
            api_result.setdefault(name, None)

        # 写入缓存（仅缓存 API 确定的）
        for name, cat in api_result.items():
            if cat is not None:
                _cache_set(f"cat:{name}", cat)
    except Exception as e:
        print(f"[DanbooruAnima] API 分类查询失败: {e}")
        # API 失败时，标记所有剩余标签为待语义推断
        for name in still_remaining:
            api_result[name] = None

    # ── 第 3.5 步：语义引擎推断 fallback（API 未返回分类的标签） ──
    semantic_candidates = [name for name, cat in api_result.items() if cat is None]
    if semantic_candidates:
        try:
            from .tag_engine import DanbooruTagger
            tagger = DanbooruTagger._instance
            if tagger and tagger.is_loaded:
                for name in semantic_candidates:
                    guessed = tagger.guess_category(name)
                    if guessed is not None:
                        api_result[name] = guessed
                        _cache_set(f"cat:{name}", guessed)
        except Exception:
            pass  # 语义引擎不可用时不报错

    # 仍未推断出的标记为 general (0)
    for name in semantic_candidates:
        if api_result.get(name) is None:
            api_result[name] = 0

    result = {**local_hits, **cache_hits, **api_result}
    return result


# ── 标签分类规则 ────────────────────────────────────

# 计数类标签模式
COUNT_TAG_PATTERN = re.compile(r'^\d+(girl|boy|other|people|furry|animal|pony|corgi|sad|soldier|ninja|robot|monster|alien|demon|angel|youkai|spirit|dragon|cat|dog|fox|wolf|mouse|bird|fish|bug|plant|food|object|train|car|plane|boat|sword|gun|bow|arrow|wand|staff|hammer|axe|knife|spear|shield)s?$', re.IGNORECASE)

COUNT_TAGS = {
    "no_humans", "no_girls", "no_boys", "solo", "multiple_girls", "multiple_boys",
    "female", "male", "ambiguous_gender", "gender_ambiguous",
    "group", "duo", "trio", "monochrome", "greyscale",
}

# 质量/元标签关键词
META_KEYWORDS = {
    "masterpiece", "best_quality", "highres", "absurdres", "ultra_highres",
    "lowres", "worst_quality", "bad_quality", "normal_quality",
    "fractal", "scan", "photoshop", "digital_media", "traditional_media",
    "watermark", "signature", "artist_name", "commission",
    "translated", "commentary", "commentary_request", "translation_request",
}

# 年份正则
YEAR_PATTERN = re.compile(r'^\d{4}$')


def classify_tag(tag_name, category_id=None):
    """
    对单个 tag 进行分类，返回 Anima 分组名称。
    
    返回: "quality_meta" | "count" | "character" | "series" | "artist" | "general"
    """
    name = tag_name.strip().lower()
    
    # 1. 如果有 API category，优先使用
    if category_id is not None:
        if category_id == 1:
            return "artist"
        elif category_id == 4:
            return "character"
        elif category_id == 3:
            return "series"
        elif category_id == 5:
            return "quality_meta"

    # 2. rating: 前缀 → quality_meta
    if name.startswith("rating:"):
        return "quality_meta"

    # 3. 计数类标签
    if COUNT_TAG_PATTERN.match(name) or name in COUNT_TAGS:
        return "count"

    # 4. 质量关键词
    if name in META_KEYWORDS:
        return "quality_meta"

    # 5. 年份
    if YEAR_PATTERN.match(name):
        return "quality_meta"

    # 6. 默认归为 general
    return "general"


def classify_tags(tag_list, category_map=None):
    """
    对标签列表进行分类。
    
    Args:
        tag_list: list of str, 标签名列表
        category_map: dict {tag_name: category_id}, 来自 API 查询
        
    Returns:
        dict: {
            "quality_meta": [...],
            "count": [...],
            "character": [...],
            "series": [...],
            "artist": [...],
            "general": [...],
            "all": [...]
        }
    """
    if category_map is None:
        category_map = {}

    groups = {
        "quality_meta": [],
        "count": [],
        "character": [],
        "series": [],
        "artist": [],
        "general": [],
        "all": list(tag_list),
    }

    for tag in tag_list:
        tag = tag.strip()
        if not tag:
            continue
        cat = category_map.get(tag)
        group = classify_tag(tag, cat)
        groups[group].append(tag)

    return groups


def _offer_typed_tag(query, items, limit):
    """词库没有这条时，仍把用户敲进去的完整 tag 放在第一行。"""
    q = fuzzy_norm_tag(query)
    if not q or not re.fullmatch(r"[a-z0-9_]+", q):
        return items
    if q.startswith("_") or q.endswith("_"):
        return items
    parts = [p for p in q.split("_") if p]
    if "_" in q:
        if len(parts) < 2 or len(q) < 3:
            return items
    elif len(q) < 4:
        return items
    for it in items:
        if fuzzy_norm_tag(it.get("tag")) == q:
            return items
    typed = {"tag": q, "cn": "", "src": "本地"}
    return ([typed] + list(items))[:limit]


def fuzzy_norm_tag(s):
    """比较用：小写，空格折成下划线。"""
    s = (s or "").strip().lower().replace(" ", "_")
    while "__" in s:
        s = s.replace("__", "_")
    return s


def _fuzzy_cn_exact(cn, q_raw, q):
    q_sp = q.replace("_", " ") if q else ""
    parts = [cn]
    for sep in (",", "，", "、", "/", "|"):
        nxt = []
        for p in parts:
            nxt.extend(p.split(sep))
        parts = nxt
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if p == q_raw or (q_sp and p == q_sp) or fuzzy_norm_tag(p) == q:
            return True
    return False


def _fuzzy_boundary(text, n):
    return n >= len(text) or text[n] in "_-"


def fuzzy_match_rank(query, tag, cn=""):
    """越小越该排前面。对不上返回 None。

    0 英文完全一致
    1 中文完全一致
    2 整词前缀（yellow_hair → yellow_hair_tie）
    3 中文前缀
    4 粘在一起的前缀（yellow_hair → yellow_hairband）
    5 整词出现在中间（hair → long_hair）
    6 只沾到一边词界
    7 随便一段子串
    8 中文里包含
    """
    q_raw = (query or "").strip().lower()
    q = fuzzy_norm_tag(q_raw)
    t = fuzzy_norm_tag(tag)
    c = (cn or "").strip().lower()
    if not q and not q_raw:
        return None
    if t and q and t == q:
        return (0, 0, len(t), t)
    if c and _fuzzy_cn_exact(c, q_raw, q):
        return (1, 0, len(t or c), t or c)
    if q and t.startswith(q) and _fuzzy_boundary(t, len(q)):
        return (2, len(t) - len(q), len(t), t)
    if q_raw and c.startswith(q_raw):
        return (3, len(c) - len(q_raw), len(t), t or c)
    if q and t.startswith(q):
        return (4, len(t) - len(q), len(t), t)
    if q and len(q) >= 2 and q in t:
        idx = t.find(q)
        before_ok = idx == 0 or t[idx - 1] in "_-"
        after = idx + len(q)
        after_ok = after >= len(t) or t[after] in "_-"
        if before_ok and after_ok:
            return (5, idx, len(t), t)
        if before_ok or after_ok:
            return (6, idx, len(t), t)
        return (7, idx, len(t), t)
    if q_raw and q_raw in c:
        return (8, c.find(q_raw), len(c), t or c)
    return None


def collect_prefix_and_rank(query, keys, cn_of=None, limit=50, substring=True):
    """keys 必须已按 fuzzy_norm_tag 排好序。完全匹配靠前，词缀靠后。"""
    import bisect
    q_raw = (query or "").strip().lower()
    q = fuzzy_norm_tag(q_raw)
    if not q or not keys:
        return []
    hits = []
    seen = set()

    def push(tag, cn, rank):
        if not tag or tag in seen:
            return
        seen.add(tag)
        hits.append((rank, tag, cn or ""))

    i = bisect.bisect_left(keys, q)
    while i < len(keys) and keys[i].startswith(q):
        tag = keys[i]
        cn = cn_of(tag) if cn_of else ""
        rank = fuzzy_match_rank(q_raw, tag, cn)
        if rank is not None:
            push(tag, cn, rank)
        i += 1
    if substring and len(q) >= 3:
        for tag in keys:
            if tag in seen or q not in tag:
                continue
            cn = cn_of(tag) if cn_of else ""
            rank = fuzzy_match_rank(q_raw, tag, cn)
            if rank is None or rank[0] > 6:
                continue
            push(tag, cn, rank)
    hits.sort(key=lambda x: x[0])
    out = []
    for _rank, tag, cn in hits:
        out.append({"tag": tag, "cn": cn, "src": "本地"})
        if len(out) >= limit:
            break
    return _offer_typed_tag(q_raw, out, limit)


def rank_cn_hits(query, cn_index, char_index, limit=50):
    """中文索引：完全匹配和前缀先于「只是带了这几个字」的词。"""
    raw = (query or "").strip()
    chars = [c for c in raw if "\u4e00" <= c <= "\u9fff"]
    if not raw or not chars or not cn_index:
        return []
    cand = None
    for ch in chars:
        s = char_index.get(ch) if char_index else None
        if not s:
            return []
        cand = set(s) if cand is None else (cand & s)
    if not cand:
        return []

    def nkey(name):
        if name == raw:
            return (0, 0, 0, name)
        if name.startswith(raw):
            return (1, len(name) - len(raw), 0, name)
        pos = name.find(raw)
        if pos < 0:
            return (9, 0, 0, name)
        return (2, pos, len(name), name)

    names = [n for n in cand if raw in n]
    names.sort(key=nkey)
    if len(names) > 500:
        names = names[:500]
    hits = []
    seen = set()
    for cn_name in names:
        for tag in cn_index.get(cn_name, []):
            tag = (tag or "").strip()
            key = fuzzy_norm_tag(tag)
            if not key or key in seen:
                continue
            rank = fuzzy_match_rank(raw, tag, cn_name)
            if rank is None:
                continue
            seen.add(key)
            hits.append((rank, tag, cn_name))
    hits.sort(key=lambda x: x[0])
    out = []
    for _rank, tag, cn in hits:
        out.append({"tag": tag, "cn": cn, "src": "本地"})
        if len(out) >= limit:
            break
    return out
