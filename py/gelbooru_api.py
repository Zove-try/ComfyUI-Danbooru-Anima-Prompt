"""
gelbooru_api.py - Gelbooru API 封装层
======================================
为 Gelbooru Browser 提供帖子搜索、详情获取、标签分类查询等功能。

Gelbooru API 端点:
  搜索帖子: /index.php?page=dapi&s=post&q=index&json=1&tags=...&limit=...&pid=...
  单个帖子: /index.php?page=dapi&s=post&q=index&json=1&id={post_id}
  批量标签: /index.php?page=dapi&s=tag&q=index&json=1&names=tag1+tag2...

认证: 必须提供 api_key + user_id (在 Gelbooru 账号设置页获取)
标签类型: type 字段: 0=general, 1=artist, 3=copyright, 4=character, 5=meta

参考:
  - Python-Gelbooru library (lilyyy411)
  - Gelbooru API 文档: https://gelbooru.com/index.php?page=help&topic=dapi
"""

import time
import threading
import re
import requests

# ── 常量 ──────────────────────────────────────────────

BASE_URL = "https://gelbooru.com"
API_BASE = f"{BASE_URL}/index.php?page=dapi&q=index&json=1"

# Gelbooru 没有 Cloudflare 保护，普通 UA 即可
API_UA = "GelbooruAnimaPrompt/1.0 (Anime tag browser)"
CDN_UA = "Gelbooru-Gallery/1.0"

API_HEADERS = {
    "User-Agent": API_UA,
    "Accept": "application/json",
}

CDN_HEADERS = {
    "User-Agent": CDN_UA,
    "Accept": "image/webp,image/avif,image/png,image/jpeg,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://gelbooru.com/",
}

# ── 标签类型映射 (Gelbooru type → Danbooru-compatible category) ──
TAG_TYPE_MAP = {
    0: 0,  # general
    1: 1,  # artist
    3: 3,  # copyright/series
    4: 4,  # character
    5: 5,  # meta
    6: 0,  # deprecated → general
}


# ── 认证 ──────────────────────────────────────────────

_api_key = ""
_user_id = ""

def set_credentials(api_key: str, user_id: str):
    """设置 Gelbooru API 认证信息"""
    global _api_key, _user_id
    _api_key = (api_key or "").strip()
    _user_id = (user_id or "").strip()

def get_credentials() -> tuple:
    """获取当前认证信息"""
    return _api_key, _user_id

def _has_credentials() -> bool:
    return bool(_api_key and _user_id)


def _auth_params() -> dict:
    """返回 Gelbooru dapi 认证参数（api_key + user_id）"""
    p = {}
    if _api_key:
        p["api_key"] = _api_key
    if _user_id:
        p["user_id"] = _user_id
    return p


# ── 限流器 ──────────────────────────────────────────

class _RateLimiter:
    def __init__(self, min_interval_sec=0.3):
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

_gel_throttle = _RateLimiter(min_interval_sec=0.3)


# ── 内存缓存 ──────────────────────────────────────────

_cache = {}
_cache_lock = threading.Lock()

def _cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.monotonic() - entry["ts"] < 300:  # 5 分钟
            return entry["val"]
    return None

def _cache_set(key: str, val):
    with _cache_lock:
        _cache[key] = {"val": val, "ts": time.monotonic()}

def clear_cache():
    with _cache_lock:
        _cache.clear()


# ── HTTP 请求 ──────────────────────────────────────────

def _request(method: str, url: str, **kwargs) -> requests.Response:
    """发送 HTTP 请求，带 UA + 限流 + 重试"""
    headers = dict(kwargs.pop("headers", None) or {})
    is_cdn = "img" in url or "cdn" in url.lower()
    for k, v in (CDN_HEADERS if is_cdn else API_HEADERS).items():
        headers.setdefault(k, v)
    timeout = kwargs.pop("timeout", None) or 15

    for attempt in range(2):
        _gel_throttle.wait()
        try:
            resp = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
            if resp.status_code not in (429, 503) or attempt == 1:
                return resp
            retry_after = resp.headers.get("Retry-After")
            delay = min(max(float(retry_after or "2"), 0.5), 10.0)
            time.sleep(delay)
        except requests.exceptions.RequestException:
            if attempt == 1:
                raise
            time.sleep(1)
    # should not reach here
    return resp


# ── API 方法 ──────────────────────────────────────────

def search_posts(tags: list[str] | str,
                 page: int = 0,
                 limit: int = 20,
                 rating: list[str] | str | None = None,
                 order: str | None = None,
                 cursor: int | None = None,
                 before_id: str | None = None,
                 out: dict | None = None) -> list[dict]:
    """
    搜索 Gelbooru 帖子。

    Args:
        tags: 标签列表或空格分隔的标签字符串
        page: 页码 (0-based，对应 API 的 pid)
        limit: 每页数量 (最大 100)
        rating: 分级过滤，如 ["general", "sensitive"] 或 "general"
        order: 排序，如 "score:desc", "id:desc" 等

    Returns:
        帖子列表 [dict, ...]，每个帖子包含 id, tags, file_url, preview_url,
        sample_url, rating, score, width, height 等字段
    """
    # 构建 tags 参数
    if isinstance(tags, list):
        tag_str = " ".join(t.strip().lower().replace(" ", "_") for t in tags if t.strip())
    else:
        tag_str = tags.strip()

    _is_score = bool(order) and "score" in str(order).lower()

    # 处理 rating 过滤 — 排除未选分级（选部分 → 排除其余；全选或全不选 → 不过滤）
    # 只选 1 档时用正向 rating:，少占 tag，避免和 sort / id:< 叠满匿名限额。
    if rating:
        if isinstance(rating, list) and rating:
            valid = set(r for r in rating if r)
            all_ratings = {"general", "sensitive", "questionable", "explicit"}
            if valid and valid != all_ratings:
                if len(valid) == 1:
                    tag_str += " rating:" + next(iter(valid))
                else:
                    exclude = all_ratings - valid
                    tag_str += " " + " ".join(f"-rating:{r}" for r in exclude)
        elif isinstance(rating, str) and rating.strip():
            tag_str += f" rating:{rating.strip()}"

    # 处理排序。时间模式也固定 sort:id:desc，和 id:< 游标同一套顺序。
    if order:
        tag_str += f" sort:{order}"
    elif "sort:" not in tag_str:
        tag_str += " sort:id:desc"

    # 时间排序：id:<N 游标（pid 会因新图插入而错位）。
    # 评分排序：绝不能混用 id:< —— 第一页高分图 id 很散，下一页会变成「比最小 id 更旧的图」，
    # 再叠加分级就只剩一两页。评分用 pid / page 往后翻。
    if (not _is_score) and before_id and str(before_id).strip().isdigit() and int(before_id) > 0:
        tag_str = f"{tag_str} id:<{int(before_id)}".strip()
        page = 0
    elif _is_score:
        before_id = None
    print(f"[GelbooruAPI] search before_id={before_id!r} page={page} limit={limit} tags={tag_str[:110]}")

    if not _has_credentials():
        # 匿名模式：Gelbooru dapi 匿名已被官方拒绝(401)，改走网页版列表页
        return search_posts_web(tag_str, page=page, limit=limit, out=out)

    params = {
        "page": "dapi",
        "s": "post",
        "q": "index",
        "json": "1",
        "tags": tag_str,
        "limit": min(int(limit), 100),
        "pid": max(int(page), 0),
    }
    params.update(_auth_params())

    url = f"{BASE_URL}/index.php"
    _gel_throttle.min_interval = 0.8 if not _has_credentials() else 0.3
    resp = _request("GET", url, params=params)

    if resp.status_code == 200:
        try:
            data = resp.json()
            posts = data.get("post", [])
            attrs = data.get("@attributes") or {}
            try:
                total = int(attrs.get("count") or 0)
            except (TypeError, ValueError):
                total = 0
            if out is not None:
                out["total"] = total
                lim = max(int(limit), 1)
                out["pages"] = max(1, (total + lim - 1) // lim) if total else 0
            print(f"[GelbooruAPI] dapi page={page} pid={max(int(page),0)} limit={limit} -> {len(posts) if not isinstance(posts, dict) else 1} posts ids={[p.get('id') for p in (posts if isinstance(posts, list) else [posts])[:3]]} total={total}")
            if isinstance(posts, dict):
                posts = [posts]  # 单帖时 API 返回 dict 而非 list
            return posts
        except Exception as e:
            print(f"[GelbooruAPI] 解析搜索结果失败: {e}")
            return []
    elif resp.status_code == 401:
        print("[GelbooruAPI] API 认证失败 (401)，请检查 api_key 和 user_id")
        return []
    else:
        print(f"[GelbooruAPI] 搜索失败: HTTP {resp.status_code}")
        return []


def search_posts_web(tag_str: str, page: int = 0, limit: int = 20, out: dict | None = None) -> list[dict]:
    """匿名模式：爬 Gelbooru 网页版列表页（dapi 匿名 401，网页版可匿名访问）"""
    try:
        url = f"{BASE_URL}/index.php"
        params = {"page": "post", "s": "list", "tags": tag_str, "pid": int(page) * 42}
        resp = _request("GET", url, params=params)
        print(f"[GelbooruAPI] web page={page} pid={int(page)*42}")
        if resp.status_code != 200:
            print(f"[GelbooruAPI] 网页搜索失败: HTTP {resp.status_code}")
            return []
        html = resp.text
        posts = []
        seen = set()
        pat = re.compile(r'<a\b[^>]*href=["\']([^"\']*page=post[^"\']*s=view[^"\']*)["\'][^>]*>([\s\S]*?)</a>', re.IGNORECASE)
        for m in pat.finditer(html):
            href = m.group(1).replace("&amp;", "&")
            _id = ""
            try:
                _q = {}
                for _sep, _k, _v in re.findall(r'([?&])([^=&#]+)=([^&#]*)', href):
                    _q[_k] = _v
                _id = _q.get("id", "")
            except Exception:
                pass
            if not _id or _id in seen:
                continue
            body = m.group(2)
            _src = ""
            _sm = re.search(r'data-src=["\']([^"\']+)', body, re.I) or re.search(r'src=["\']([^"\']+)', body, re.I)
            if _sm:
                _src = _sm.group(1)
            _title = ""
            _tm = re.search(r'title=["\']([^"\']*)["\']', body, re.I) or re.search(r'alt=["\']([^"\']*)["\']', body, re.I)
            if _tm:
                _title = _tm.group(1)
            _rating = "general"
            _score = 0
            _rm = re.search(r'rating:\s*([a-z]+)', _title, re.I)
            if _rm:
                _rating = _rm.group(1).lower()
            _sm2 = re.search(r'score:\s*([+-]?\d+)', _title, re.I)
            if _sm2:
                _score = int(_sm2.group(1))
            _tags_clean = " ".join(t for t in _title.split() if not re.match(r'^(score|rating|favorites|date|id):', t, re.I))
            seen.add(_id)
            # 从缩略图 URL 推导原图 URL：thumbnails/xx/yy/thumbnail_z.jpg → images/xx/yy/z.jpg
            _src_full = _src
            _um = re.search(r'thumbnails/([^/]+)/([^/]+)/thumbnail_(.+)$', _src)
            if _um:
                _base = _src.split('/thumbnails/')[0]
                _src_full = f"{_base}/images/{_um.group(1)}/{_um.group(2)}/{_um.group(3)}"
            posts.append({
                "id": _id,
                "tags": _tags_clean,
                "file_url": _src_full,
                "preview_url": _src,
                "sample_url": _src_full,
                "rating": _rating,
                "score": _score,
                "width": 0,
                "height": 0,
                "source": "gelbooru_web",
            })
            if len(posts) >= limit:
                break
        if out is not None:
            last_m = re.search(r'pid=(\d+)[^>]*alt=["\']last page["\']', html, re.I)
            pages = 0
            if last_m:
                pages = int(last_m.group(1)) // 42 + 1
            elif posts:
                pages = max(int(page), 0) + 1
            out["pages"] = pages
            out["total"] = pages * 42 if pages else 0
        return posts
    except Exception as e:
        print(f"[GelbooruAPI] 网页搜索失败: {e}")
        return []


def get_post(post_id: int) -> dict | None:
    """
    获取单个帖子详情。

    Args:
        post_id: 帖子 ID

    Returns:
        帖子 dict 或 None
    """
    cache_key = f"post:{post_id}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    params = {
        "page": "dapi",
        "s": "post",
        "q": "index",
        "json": "1",
        "id": str(post_id),
    }
    params.update(_auth_params())

    url = f"{BASE_URL}/index.php"
    _gel_throttle.min_interval = 0.8 if not _has_credentials() else 0.3
    resp = _request("GET", url, params=params)

    if resp.status_code == 200:
        try:
            data = resp.json()
            posts = data.get("post", [])
            if isinstance(posts, list) and posts:
                post = posts[0]
                _cache_set(cache_key, post)
                return post
            elif isinstance(posts, dict):
                _cache_set(cache_key, posts)
                return posts
        except Exception as e:
            print(f"[GelbooruAPI] 解析帖子详情失败: {e}")
    elif resp.status_code == 401:
        print("[GelbooruAPI] API 认证失败 (401)")
    else:
        print(f"[GelbooruAPI] 获取帖子失败: HTTP {resp.status_code}")

    return None


def get_tags_batch(tag_names: list[str]) -> dict[str, int]:
    """
    批量查询标签类型 (category)。

    Gelbooru tag API 返回 type 字段:
        0=general, 1=artist, 3=copyright, 4=character, 5=meta, 6=deprecated

    Args:
        tag_names: 标签名列表

    Returns:
        {tag_name: category_id (0-5)}, category_id 已映射为 Danbooru 兼容值
    """
    if not tag_names or not _has_credentials():
        return {}

    # 先查内存缓存
    cache_hits = {}
    remaining = []
    for tag in tag_names:
        cached = _cache_get(f"cat:{tag}")
        if cached is not None:
            cache_hits[tag] = cached
        else:
            remaining.append(tag)

    if not remaining:
        return cache_hits

    # 调 API 批量查询 (每次最多 100 个，避免 URL 过长)
    api_results = {}
    batch_size = 100
    for i in range(0, len(remaining), batch_size):
        batch = remaining[i:i + batch_size]
        names_str = " ".join(b.strip().lower().replace(" ", "_") for b in batch)

        params = {
            "page": "dapi",
            "s": "tag",
            "q": "index",
            "json": "1",
            "names": names_str,
            "limit": str(len(batch)),
        }
        params.update(_auth_params())

        url = f"{BASE_URL}/index.php"
        try:
            resp = _request("GET", url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                tags = data.get("tag", [])
                if isinstance(tags, dict):
                    tags = [tags]
                for tag_info in tags:
                    name = tag_info.get("name", "")
                    raw_type = tag_info.get("type", 0)
                    try:
                        raw_type = int(raw_type)
                    except (ValueError, TypeError):
                        raw_type = 0
                    # 映射 Gelbooru type → Danbooru-compatible category
                    cat = TAG_TYPE_MAP.get(raw_type, 0)
                    api_results[name] = cat
                    _cache_set(f"cat:{name}", cat)
            elif resp.status_code == 401:
                print("[GelbooruAPI] Tag API 认证失败 (401)")
                break
            else:
                print(f"[GelbooruAPI] Tag API 返回 {resp.status_code}")
        except Exception as e:
            print(f"[GelbooruAPI] Tag API 请求失败: {e}")

    # 未返回结果的 tag 默认 general=0
    for tag in remaining:
        if tag not in api_results:
            api_results[tag] = 0

    return {**cache_hits, **api_results}


# ── 便利方法 ──────────────────────────────────────────

def search_posts_simple(query: str, page: int = 0, limit: int = 20) -> list[dict]:
    """简化的搜索接口，返回帖子列表"""
    return search_posts(tags=query, page=page, limit=limit)


def get_post_tags(post_id: int) -> list[str]:
    """获取帖子标签列表 (纯 tag 名)"""
    post = get_post(post_id)
    if not post:
        return []
    tags_str = post.get("tags", "")
    return [t.strip() for t in tags_str.split() if t.strip()]


# ── 初始化提示 ──────────────────────────────────────────

print("[GelbooruAPI] 模块已加载 (需调用 set_credentials(api_key, user_id) 设置认证)")
