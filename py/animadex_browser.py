"""
AnimaDex Browser — ComfyUI 节点
搜索 AnimaDex 角色/画师，浏览示例图，输出标签信息
"""

import json, asyncio, os, random, threading, time, requests
from urllib.request import getproxies, proxy_bypass
from server import PromptServer
from aiohttp import web

ANIMADEX_BASE = "https://animadex.net"

# 浏览器能开 animadex.net，不等于 Python requests 能过：站点在 Cloudflare 上。
# 梯子开着时浏览器走系统代理；这里以前强制直连，国内线路经常 Read timed out。
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_HTTP_BACKEND = "requests"
_last_err = ""
_tls = threading.local()
_backend_logged = False
_proxy_dead_until = 0.0
_route_logged = ""


def _disable_env_proxy(sess):
    """不让 Session 自己读环境变量，避免和下面按次传入的代理叠在一起。"""
    if hasattr(sess, "trust_env"):
        sess.trust_env = False
    try:
        if getattr(sess, "proxies", None) is not None:
            sess.proxies.clear()
    except Exception:
        pass


def _make_session():
    global _HTTP_BACKEND, _backend_logged
    sess = None
    label = ""
    try:
        from curl_cffi import requests as cffer
        for name in ("chrome131", "chrome124", "chrome120", "chrome"):
            try:
                sess = cffer.Session(impersonate=name)
                _disable_env_proxy(sess)
                _HTTP_BACKEND = "curl_cffi:" + name
                label = "curl_cffi impersonate=" + name
                break
            except Exception:
                sess = None
    except Exception as e:
        if not _backend_logged:
            print("[AnimaDex] curl_cffi 不可用: %s" % e)
    if sess is None:
        try:
            import cloudscraper
            sess = cloudscraper.create_scraper()
            _disable_env_proxy(sess)
            _HTTP_BACKEND = "cloudscraper"
            label = "cloudscraper"
        except Exception as e:
            if not _backend_logged:
                print("[AnimaDex] cloudscraper 不可用: %s" % e)
    if sess is None:
        sess = requests.Session()
        _disable_env_proxy(sess)
        _HTTP_BACKEND = "requests"
        label = "requests"
    if not _backend_logged:
        _backend_logged = True
        print("[AnimaDex] HTTP 使用 %s（开着系统代理就走代理，代理端口连不上再直连）" % label)
    return sess


def _get_session():
    sess = getattr(_tls, "s", None)
    if sess is None:
        sess = _make_session()
        _tls.s = sess
    return sess


def _drop_session():
    sess = getattr(_tls, "s", None)
    _tls.s = None
    if sess is not None:
        try:
            sess.close()
        except Exception:
            pass


def _normalize_proxy(url):
    url = (url or "").strip()
    if not url:
        return ""
    if "://" not in url:
        url = "http://" + url
    try:
        from urllib.parse import urlparse
        p = urlparse(url)
        host = (p.hostname or "").lower()
        if host in ("127.0.0.1", "localhost", "::1") and p.scheme in ("http", "https"):
            port = p.port or (443 if p.scheme == "https" else 80)
            return "http://127.0.0.1:%s" % port
    except Exception:
        pass
    return url


def _pick_proxy():
    """读 Windows 系统代理（梯子的 System Proxy）和环境变量。每次请求都读，开关梯子不用重启。"""
    url = ""
    try:
        if not proxy_bypass("animadex.net"):
            px = getproxies() or {}
            url = px.get("https") or px.get("http") or ""
    except Exception:
        url = ""
    if not url:
        for k in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"):
            url = os.environ.get(k) or ""
            if url.strip():
                break
    return _normalize_proxy(url)


def _is_proxy_refused(msg):
    """只认本地代理端口拒绝/连不上。站点本身连不上不能算代理挂了。"""
    low = (msg or "").lower()
    if "cannot connect to proxy" in low or "unable to connect to proxy" in low or "proxyerror" in low:
        return True
    local = "127.0.0.1" in low or "localhost" in low
    if not local:
        return False
    return (
        "10061" in low
        or "connection refused" in low
        or "actively refused" in low
        or "connecttimeout" in low
        or "connect timeout" in low
        or "failed to connect" in low
        or "couldn't connect" in low
        or "could not connect" in low
        or "curl: (7)" in low
    )


def _is_timeout(msg):
    low = (msg or "").lower()
    if "connecttimeout" in low or "connect timeout" in low:
        return False
    return "timed out" in low or "timeout" in low or "curl: (28)" in low


def _human_net_err(msg, proxy):
    if proxy and _is_proxy_refused(msg):
        return "本地代理没在听（%s）。梯子关掉时请把系统代理一并关掉，这一次会改走直连。" % proxy
    if _is_timeout(msg):
        if proxy:
            return "连接 animadex.net 超时（已走系统代理 %s，并自动重试过）。再点一次「热门」；仍失败就换节点。" % proxy
        return "连接 animadex.net 超时（当前是直连）。打开梯子的系统代理后再点一次「热门」。"
    return msg


def _log_route(proxy):
    global _route_logged
    label = proxy or "direct"
    if label == _route_logged:
        return
    _route_logged = label
    if proxy:
        print("[AnimaDex] 请求走系统代理 %s" % proxy)
    else:
        print("[AnimaDex] 请求直连（系统代理未开或刚才连不上）")


def _adex_headers(accept):
    return {
        "User-Agent": _BROWSER_UA,
        "Accept": accept,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://animadex.net/",
        "Origin": "https://animadex.net",
    }


def _call_get(url, params, timeout, headers, proxy):
    connect = 5 if proxy else 8
    to = float(timeout) if str(_HTTP_BACKEND).startswith("curl_cffi") else (connect, timeout)
    kwargs = {"params": params, "timeout": to, "headers": headers}
    sess = _get_session()
    if str(_HTTP_BACKEND).startswith("curl_cffi"):
        try:
            return sess.get(url, proxy=proxy, **kwargs)
        except TypeError:
            if proxy:
                kwargs["proxies"] = {"http": proxy, "https": proxy}
            else:
                kwargs["proxies"] = {"http": None, "https": None}
            return sess.get(url, **kwargs)
    if proxy:
        kwargs["proxies"] = {"http": proxy, "https": proxy}
    else:
        kwargs["proxies"] = {"http": None, "https": None}
    return sess.get(url, **kwargs)


def _raise_net(e, proxy):
    msg = str(e) or type(e).__name__
    if _is_timeout(msg) or (proxy and _is_proxy_refused(msg)):
        raise RuntimeError(_human_net_err(msg, proxy)) from e
    raise e


def adex_get(url, params=None, timeout=20, accept="application/json,text/plain,*/*"):
    """走系统代理；本地代理端口拒绝连接时改直连。读超时自动再试一次。"""
    global _proxy_dead_until
    headers = _adex_headers(accept)
    proxy = _pick_proxy()
    if proxy and time.monotonic() < _proxy_dead_until:
        proxy = ""
    _log_route(proxy)
    try:
        return _call_get(url, params, timeout, headers, proxy or None)
    except Exception as e1:
        msg = str(e1) or type(e1).__name__
        if proxy and _is_proxy_refused(msg):
            _proxy_dead_until = time.monotonic() + 45
            print("[AnimaDex] 系统代理连不上，45 秒内改直连: %s" % msg[:180])
            _log_route("")
            _drop_session()
            try:
                return _call_get(url, params, timeout, headers, None)
            except Exception as e2:
                _raise_net(e2, "")
        if not _is_timeout(msg):
            raise
        _drop_session()
        retry = proxy
        fresh = _pick_proxy()
        if not proxy and fresh:
            _proxy_dead_until = 0.0
            retry = fresh
            print("[AnimaDex] 直连超时，改走系统代理 %s" % fresh)
        else:
            print("[AnimaDex] 超时，同路线再试一次 route=%s" % (proxy or "direct"))
        _log_route(retry)
        try:
            return _call_get(url, params, timeout, headers, retry or None)
        except Exception as e2:
            msg2 = str(e2) or type(e2).__name__
            if retry and _is_proxy_refused(msg2):
                _proxy_dead_until = time.monotonic() + 45
            _raise_net(e2, retry)


def _note_http_error(resp):
    global _last_err
    code = getattr(resp, "status_code", "?")
    text = ""
    try:
        text = (resp.text or "")[:240]
    except Exception:
        text = ""
    _last_err = "HTTP %s" % code
    low = text.lower()
    if "just a moment" in low or "cloudflare" in low or "cf-ray" in low:
        _last_err += "（Cloudflare 拦截了插件请求，站点本身可开不代表 Python 能过）"
    print("[AnimaDex] %s backend=%s body=%s" % (_last_err, _HTTP_BACKEND, text.replace("\n", " ")[:180]))


_PER_PAGE = 36
_last_rand_page = {}


def _search(mode, query, limit=36, filters=None, page=1, sort="count"):
    """搜索角色/画师，支持 facet 筛选和分页。
    AnimaDex 的 sort=random 实际等于 sort=count（热门榜），不要传 random。
    """
    global _last_err
    _last_err = ""
    try:
        url = f"{ANIMADEX_BASE}/api/{mode}/search"
        params = {"q": query.strip(), "page": page, "sort": sort}
        if filters:
            for k, vals in filters.items():
                if vals:
                    params[k] = vals if isinstance(vals, str) else vals
        r = adex_get(url, params=params, timeout=20)
        if r.status_code != 200:
            _note_http_error(r)
            return [], 0
        data = r.json()
        return data.get("results", [])[:limit], data.get("total", 0)
    except Exception as e:
        msg = str(e) or type(e).__name__
        _last_err = msg
        print("[AnimaDex] 搜索失败 backend=%s: %s" % (_HTTP_BACKEND, msg))
        return [], 0


def _rand_page(total, last=None):
    """按条目均匀抽一页（含末页），避免只在热门榜前几页打转。"""
    if total <= 0:
        return 1
    max_page = max(1, (total + _PER_PAGE - 1) // _PER_PAGE)
    page = 1 + (random.randrange(total) // _PER_PAGE)
    if last is not None and max_page > 1:
        for _ in range(8):
            if page != last:
                break
            page = 1 + (random.randrange(total) // _PER_PAGE)
    return max(1, min(page, max_page))


def _search_facets(mode):
    """获取可用的分类维度"""
    global _last_err
    try:
        url = f"{ANIMADEX_BASE}/api/{mode}/facets"
        r = adex_get(url, timeout=20)
        if r.status_code == 200:
            return r.json().get("facets", {})
        _note_http_error(r)
    except Exception as e:
        msg = str(e) or type(e).__name__
        _last_err = msg
        print("[AnimaDex] facets 失败: %s" % msg)
    return {}


def _batch_search(mode, queries, limit=36):
    """搜索多个 query 合并去重"""
    seen = set()
    merged = []
    for q in queries:
        q = q.strip()
        if not q:
            continue
        res, _total = _search(mode, q, limit)
        for r in res:
            s = r.get("slug", "")
            if s and s not in seen:
                seen.add(s)
                merged.append(r)
    return merged


class AnimaDexBrowser:
    """AnimaDex 角色/画师浏览器"""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "run"
    CATEGORY = "Danbooru Anima"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def run(self):
        return ()


# ── API 路由 ──

def register_routes():
    @PromptServer.instance.routes.get("/danbooru_anima/animadex_image")
    async def animadex_image(request):
        url = request.query.get("url")
        if not url:
            return web.json_response({"error": "missing url"}, status=400)
        # SSRF 防护
        from urllib.parse import urlparse
        parsed = urlparse(url)
        allowed_hosts = {
            "animadex.net",
            "blobs.animadex.net",
            "animadex.mooshieblob.com",
            "mooshieblob.com",
            "cdn.animadex.mooshieblob.com",
        }
        host = parsed.hostname or ""
        if not any(host == h or host.endswith("." + h) for h in allowed_hosts):
            return web.json_response({"error": "invalid host"}, status=403)
        try:
            resp = await asyncio.to_thread(
                adex_get,
                url,
                None,
                20,
                "image/webp,image/apng,image/*,*/*;q=0.8",
            )
            if resp.status_code == 200:
                ctype = resp.headers.get("Content-Type") or "image/webp"
                if ";" in ctype:
                    ctype = ctype.split(";", 1)[0].strip()
                if not ctype.startswith("image/"):
                    ctype = "image/webp"
                return web.Response(
                    body=resp.content,
                    content_type=ctype,
                    headers={"Cache-Control": "public, max-age=86400"},
                )
            print("[AnimaDex] 图片代理 HTTP %s host=%s" % (resp.status_code, host))
        except Exception as e:
            print("[AnimaDex] 图片代理失败: %s" % e)
        return web.json_response({"error": "proxy fail"}, status=502)

    @PromptServer.instance.routes.post("/danbooru_anima/animadex_search")
    async def animadex_search(request):
        try:
            data = await request.json()
            mode = data.get("mode", "characters")
            raw = data.get("query", "").strip()
            filters = data.get("filters", {})
            page = int(data.get("page", 1))
            sort = data.get("sort", "count")
            queries = [q.strip() for q in raw.replace(",", " ").split() if q.strip()]
            loop = asyncio.get_running_loop()
            if not queries:
                def _blank_search():
                    fetch_sort = "count" if sort == "random" else (sort or "count")
                    page_out = page
                    if sort == "random":
                        _tmp, total0 = _search(mode, "", 1, filters, 1, "count")
                        key = (mode, json.dumps(filters or {}, sort_keys=True, ensure_ascii=False))
                        page_out = _rand_page(total0, _last_rand_page.get(key))
                        _last_rand_page[key] = page_out
                        fetch_sort = "count"
                    results0, total0 = _search(mode, "", _PER_PAGE, filters, page_out, fetch_sort)
                    if sort == "random" and results0:
                        random.shuffle(results0)
                    return results0, total0, page_out, _last_err
                results, total, page, err = await loop.run_in_executor(None, _blank_search)
                if not results and err:
                    return web.json_response({
                        "success": False,
                        "error": err,
                        "results": [],
                        "total": 0,
                    })
                return web.json_response({
                    "success": True,
                    "results": results,
                    "total": total,
                    "page": page,
                    "sort": sort,
                })
            results = await loop.run_in_executor(None, _batch_search, mode, queries, 36)
            if not results and _last_err:
                return web.json_response({"success": False, "error": _last_err, "results": []})
            return web.json_response({"success": True, "results": results})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/animadex_facets")
    async def animadex_facets(request):
        """获取分类维度"""
        try:
            data = await request.json()
            mode = data.get("mode", "characters")
            loop = asyncio.get_running_loop()
            facets = await loop.run_in_executor(None, _search_facets, mode)
            if not facets and _last_err:
                return web.json_response({"success": False, "error": _last_err, "facets": {}})
            return web.json_response({"success": True, "facets": facets})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)


NODE_CLASS_MAPPINGS = {"AnimaDexBrowser": AnimaDexBrowser}
NODE_DISPLAY_NAME_MAPPINGS = {"AnimaDexBrowser": "AnimaDex 浏览器 (AnimaDex Browser)"}
