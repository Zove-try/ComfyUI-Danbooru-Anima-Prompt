# -*- coding: utf-8 -*-
"""收藏夹画师/标签缩略图本地缓存（与用户手裁的 web/thumbs 分开）。"""
import asyncio
import hashlib
import json
import os
import re
import threading

from io import BytesIO

import requests
from aiohttp import web
from PIL import Image, ImageFile
from requests.adapters import HTTPAdapter
from server import PromptServer

ImageFile.LOAD_TRUNCATED_IMAGES = True
_RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY_DIR = os.path.dirname(os.path.abspath(__file__))
FAV_THUMB_DIR = os.path.join(PLUGIN_DIR, "web", "fav_thumbs")
SETTINGS_FILE = os.path.join(PLUGIN_DIR, "fav_thumb_settings.json")
CDN_CACHE_DIR = os.path.join(PY_DIR, "cdn_cache")
TAG_CATS = ("artists", "characters", "series", "general")
_lock = threading.Lock()
_tls = threading.local()
_skip_fail = set()


def _ensure_dir():
    os.makedirs(FAV_THUMB_DIR, exist_ok=True)


_Q = {
    "low": {"size": 256, "jpeg": 78, "mark": "l", "min_src": 1, "min_keep": 1},
    "mid": {"size": 384, "jpeg": 86, "mark": "m", "min_src": 300, "min_keep": 240},
    "high": {"size": 720, "jpeg": 90, "mark": "h", "min_src": 500, "min_keep": 300},
}
_DB_FOLDERS = "original|sample|preview|180x180|360x360|512x512|720x720"
_src_ok_cache = {}


def _load_settings():
    data = {}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, dict):
            data = raw
    except Exception:
        pass
    q = str(data.get("quality") or "low").lower()
    if q not in _Q:
        q = "low"
    return {"auto": bool(data.get("auto")), "quality": q}


def _save_settings(**kwargs):
    cur = _load_settings()
    cur.update(kwargs)
    if cur.get("quality") not in _Q:
        cur["quality"] = "low"
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump({"auto": bool(cur.get("auto")), "quality": cur.get("quality") or "low"}, f)
        return True
    except Exception:
        return False


def _load_auto():
    return bool(_load_settings().get("auto"))


def _save_auto(on):
    return _save_settings(auto=bool(on))


def _quality():
    return _load_settings().get("quality") or "low"


def _qconf():
    return _Q.get(_quality()) or _Q["low"]


def _safe_tag(tag):
    s = re.sub(r"[^a-z0-9_]", "_", str(tag or "").lower().replace(" ", "_"))
    s = re.sub(r"_+", "_", s).strip("_") or "tag"
    return s[:60]


def _stem(site, tag):
    prefix = "g" if site == "g" else "d"
    digest = hashlib.md5(("%s:%s" % (prefix, str(tag or "").lower())).encode("utf-8")).hexdigest()[:8]
    return "%s_%s_%s" % (prefix, _safe_tag(tag), digest)


def _fname(site, tag):
    return "%s_%s.jpg" % (_stem(site, tag), _qconf()["mark"])


def _image_max_side(src, is_path=False):
    im = None
    try:
        im = Image.open(src if is_path else BytesIO(src))
        return max(im.size)
    except Exception:
        return 0
    finally:
        if im is not None:
            try:
                im.close()
            except Exception:
                pass


def _file_meets_quality(fpath):
    try:
        sz = os.path.getsize(fpath)
        mt = os.path.getmtime(fpath)
    except Exception:
        return False
    if sz <= 80:
        return False
    min_keep = int(_qconf().get("min_keep") or 1)
    if min_keep <= 1:
        return True
    rec = _src_ok_cache.get(fpath)
    if rec and rec[0] == mt:
        return rec[1]
    ok = _image_max_side(fpath, True) >= min_keep
    _src_ok_cache[fpath] = (mt, ok)
    return ok


def _existing_path(site, tag):
    _ensure_dir()
    stem = _stem(site, tag)
    q = _quality()
    names = [stem + "_" + _Q[q]["mark"] + ".jpg"]
    if q == "low":
        names.append(stem + ".jpg")
    for name in names:
        fpath = os.path.join(FAV_THUMB_DIR, name)
        if os.path.isfile(fpath) and _file_meets_quality(fpath):
            return fpath
    return None


def _map_key(site, tag):
    return ("%s:%s" % ("g" if site == "g" else "d", str(tag or "").replace(" ", "_"))).lower()


def _gel_thumb(url):
    u = str(url or "")
    u = re.sub(r"/samples/([^/?#]+/[^/?#]+)/sample_", r"/thumbnails/\1/thumbnail_", u)
    u = re.sub(r"/images/([^/?#]+/[^/?#]+)/(?!thumbnail_)([^/?#]+)", r"/thumbnails/\1/thumbnail_\2", u)
    return u


def _gel_sample(url):
    u = str(url or "")
    u = re.sub(r"/thumbnails/([^/?#]+/[^/?#]+)/thumbnail_", r"/samples/\1/sample_", u)
    u = re.sub(r"/images/([^/?#]+/[^/?#]+)/(?!sample_)([^/?#]+)", r"/samples/\1/sample_\2", u)
    return u


def _gel_image(url):
    u = str(url or "")
    u = re.sub(r"/thumbnails/([^/?#]+/[^/?#]+)/thumbnail_", r"/images/\1/", u)
    u = re.sub(r"/samples/([^/?#]+/[^/?#]+)/sample_", r"/images/\1/", u)
    return u


def _db_variant(url, folder):
    u = str(url or "")
    if not u:
        return u
    u = re.sub(r"/(%s)/" % _DB_FOLDERS, "/%s/" % folder, u, count=1)
    u = re.sub(r"/data/(original|sample|preview)/", "/data/%s/" % folder, u, count=1)

    def _fix_name(m):
        head, name = m.group(1), m.group(2)
        name = re.sub(r"(?i)^sample-", "", name)
        if folder == "sample":
            name = "sample-" + name
        return head + name

    u = re.sub(
        r"(/(?:%s)/[^/?#]+/[^/?#]+/)([^/?#]+)" % _DB_FOLDERS,
        _fix_name,
        u,
        count=1,
    )
    if folder != "original" and "donmai.us" in u:
        u = re.sub(r"\.(png|webp|gif|jpeg)(\?[^#]*)?$", r".jpg\2", u, flags=re.I)
    return u


def _to_preview_url(url):
    if not url:
        return url
    u = str(url)
    if "gelbooru.com" in u.lower():
        return _gel_thumb(u)
    return _db_variant(u, "preview")


def _to_folder_url(url, folder):
    if not url:
        return url
    u = str(url)
    if "gelbooru.com" in u.lower():
        if folder in ("360x360", "512x512", "720x720", "sample"):
            return _gel_sample(u)
        return _gel_thumb(u)
    return _db_variant(u, folder)


def _candidate_urls(url):
    u = (url or "").strip()
    out = []

    def add(x):
        if x and x not in out:
            out.append(x)

    q = _quality()
    if "gelbooru.com" in u.lower():
        sample = _gel_sample(u)
        orig = _gel_image(u)
        thumb = _gel_thumb(u)
        if q == "high":
            add(sample)
            add(orig)
            add(u)
            add(thumb)
        elif q == "mid":
            add(sample)
            add(u)
            add(thumb)
        else:
            add(thumb)
            add(u)
            add(sample)
    else:
        hi = _db_variant(u, "720x720")
        sq512 = _db_variant(u, "512x512")
        mid = _db_variant(u, "360x360")
        tiny = _db_variant(u, "180x180")
        preview = _db_variant(u, "preview")
        sample = _db_variant(u, "sample")
        if q == "high":
            add(hi)
            add(sq512)
            add(sample)
            add(mid)
            add(preview)
            if "/original/" in u:
                add(u.replace("/original/", "/sample/"))
            add(u)
            add(tiny)
        elif q == "mid":
            add(mid)
            add(preview)
            add(sample)
            add(u)
            add(tiny)
        else:
            add(tiny)
            add(preview)
            add(u)
    for cur in list(out):
        if cur and "cdn.donmai.us" in cur:
            add(cur.replace("cdn.donmai.us", "media.donmai.us"))
    return out


def _is_image_bytes(raw, content_type=""):
    if not raw or len(raw) < 24:
        return False
    ctype = (content_type or "").lower()
    if "text/html" in ctype or "application/json" in ctype or "text/plain" in ctype:
        return False
    head = raw[:16]
    if head.lstrip().startswith((b"<", b"<!")):
        return False
    if head.startswith(b"\xff\xd8\xff") or head.startswith(b"\x89PNG") or head.startswith(b"GIF"):
        return True
    if head.startswith(b"RIFF") and b"WEBP" in raw[:16]:
        return True
    if ctype.startswith("image/"):
        return True
    return False


def _cdn_file(url):
    if not url or not os.path.isdir(CDN_CACHE_DIR):
        return None
    ext = os.path.splitext(str(url).split("?")[0])[1] or ".jpg"
    path = os.path.join(CDN_CACHE_DIR, hashlib.md5(url.encode("utf-8")).hexdigest() + ext)
    if os.path.isfile(path) and os.path.getsize(path) > 80:
        try:
            with open(path, "rb") as f:
                raw = f.read()
            if _is_image_bytes(raw):
                return raw
        except Exception:
            return None
    return None


def _thread_session():
    s = getattr(_tls, "session", None)
    if s is None:
        s = requests.Session()
        ad = HTTPAdapter(pool_connections=8, pool_maxsize=8, max_retries=1)
        s.mount("https://", ad)
        s.mount("http://", ad)
        _tls.session = s
    return s


def _headers_for(url):
    u = (url or "").lower()
    if "gelbooru.com" in u:
        return {
            "User-Agent": "Gelbooru-Gallery/1.0",
            "Referer": "https://gelbooru.com/",
        }
    return {
        "User-Agent": "Danbooru-Gallery/1.0",
        "Referer": "https://danbooru.donmai.us/",
    }


def _iter_tag_fav_thumbs():
    from favorites import load_favorites
    favs = load_favorites()
    for cat in TAG_CATS:
        block = favs.get(cat) or {}
        if not isinstance(block, dict):
            continue
        for tag, item in block.items():
            if tag == "_order" or not isinstance(item, dict):
                continue
            thumb = (item.get("thumb") or "").strip()
            if thumb:
                yield "d", tag, thumb
    gel_path = os.path.join(PLUGIN_DIR, "gelbooru_favorites.json")
    try:
        if os.path.isfile(gel_path):
            with open(gel_path, "r", encoding="utf-8") as f:
                gel = json.load(f)
            if isinstance(gel, dict):
                for cat in TAG_CATS:
                    block = gel.get(cat) or {}
                    if not isinstance(block, dict):
                        continue
                    for tag, item in block.items():
                        if tag == "_order" or not isinstance(item, dict):
                            continue
                        thumb = (item.get("thumb") or "").strip()
                        if thumb:
                            yield "g", tag, thumb
    except Exception:
        pass


def _need_list(skip=None):
    out = []
    seen = set()
    skip = skip or set()
    _ensure_dir()
    for site, tag, url in _iter_tag_fav_thumbs():
        key = _map_key(site, tag)
        if key in seen or key in skip:
            continue
        seen.add(key)
        fpath = _existing_path(site, tag)
        if fpath:
            continue
        out.append((site, tag, url))
    return out


def _cached_count():
    n = 0
    size = 0
    seen = set()
    for site, tag, _url in _iter_tag_fav_thumbs():
        key = _map_key(site, tag)
        if key in seen:
            continue
        seen.add(key)
        fp = _existing_path(site, tag)
        if not fp:
            continue
        n += 1
        try:
            size += os.path.getsize(fp)
        except Exception:
            pass
    return n, size


def _build_map():
    mp = {}
    _ensure_dir()
    for site, tag, _url in _iter_tag_fav_thumbs():
        fpath = _existing_path(site, tag)
        if fpath:
            mt = int(os.path.getmtime(fpath))
            mp[_map_key(site, tag)] = "/danbooru_anima/fav_thumb/%s?v=%s" % (os.path.basename(fpath), mt)
    return mp


def _fetch_bytes(url):
    last = None
    session = _thread_session()
    min_src = int(_qconf().get("min_src") or 1)
    best = None
    best_dim = 0
    for candidate in _candidate_urls(url):
        if not candidate or candidate == last:
            continue
        last = candidate
        raw = _cdn_file(candidate)
        if not raw:
            try:
                resp = session.get(candidate, timeout=8, headers=_headers_for(candidate))
                if resp.status_code == 200 and _is_image_bytes(resp.content, resp.headers.get("Content-Type")):
                    raw = resp.content
            except Exception:
                raw = None
        if not raw:
            continue
        dim = _image_max_side(raw)
        if dim <= 0:
            continue
        if dim > best_dim:
            best, best_dim = raw, dim
        if dim >= min_src:
            return raw
    return best


def _write_thumb(site, tag, raw):
    cfg = _qconf()
    img = Image.open(BytesIO(raw))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    img.thumbnail((cfg["size"], cfg["size"]), _RESAMPLE)
    _ensure_dir()
    fpath = os.path.join(FAV_THUMB_DIR, _fname(site, tag))
    tmp = fpath + ".tmp"
    img.save(tmp, "JPEG", quality=cfg["jpeg"], optimize=True)
    os.replace(tmp, fpath)
    return True


def _cache_one(site, tag, url):
    with _lock:
        if _existing_path(site, tag):
            return "exists"
    body = _fetch_bytes(url)
    if not body:
        return "fail"
    try:
        with _lock:
            _write_thumb(site, tag, body)
        return "ok"
    except Exception:
        return "fail"


def maybe_cache_on_add(site, tag, url):
    if not _load_auto():
        return
    if not tag or not url:
        return
    threading.Thread(target=_cache_one, args=(site, tag, url), daemon=True).start()


def cache_batch(limit=16, reset=False):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    global _skip_fail
    if reset:
        _skip_fail = set()
    limit = max(1, min(int(limit or 16), 32))
    need = _need_list(_skip_fail)
    batch = need[:limit]
    updated = 0
    failed = 0
    exists = 0
    if batch:
        workers = min(6, len(batch))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(_cache_one, s, t, u): (s, t) for s, t, u in batch}
            for fut in as_completed(futs):
                site, tag = futs[fut]
                try:
                    r = fut.result()
                except Exception:
                    r = "fail"
                if r == "ok":
                    updated += 1
                elif r == "exists":
                    exists += 1
                else:
                    failed += 1
                    _skip_fail.add(_map_key(site, tag))
    remain = max(0, len(_need_list(_skip_fail)))
    missing = max(0, len(_need_list()))
    cached, nbytes = _cached_count()
    total = cached + missing
    payload = {
        "success": True,
        "auto": _load_auto(),
        "quality": _quality(),
        "updated": updated,
        "failed": failed,
        "exists": exists,
        "attempted": len(batch),
        "remaining": remain,
        "missing": missing,
        "need": missing,
        "skipped": len(_skip_fail),
        "cached": cached,
        "total": total,
        "bytes": nbytes,
    }
    if len(batch) == 0 and missing > 0 and remain <= 0:
        payload["error"] = "all_failed"
    return payload


def clear_cache():
    n = 0
    if os.path.isdir(FAV_THUMB_DIR):
        for fn in os.listdir(FAV_THUMB_DIR):
            if fn.startswith("_"):
                continue
            fp = os.path.join(FAV_THUMB_DIR, fn)
            if os.path.isfile(fp):
                try:
                    os.remove(fp)
                    n += 1
                except Exception:
                    pass
    return n


def _status_payload():
    need = _need_list()
    cached, nbytes = _cached_count()
    total = cached + len(need)
    return {
        "success": True,
        "auto": _load_auto(),
        "quality": _quality(),
        "need": len(need),
        "cached": cached,
        "total": total,
        "bytes": nbytes,
    }


@PromptServer.instance.routes.get("/danbooru_anima/fav_thumbs/status")
async def fav_thumbs_status(request):
    try:
        return web.json_response(_status_payload())
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.get("/danbooru_anima/fav_thumbs/map")
async def fav_thumbs_map(request):
    try:
        return web.json_response({"success": True, "map": _build_map()})
    except Exception as e:
        return web.json_response({"success": False, "map": {}, "error": str(e)})


@PromptServer.instance.routes.post("/danbooru_anima/fav_thumbs/auto")
async def fav_thumbs_auto(request):
    try:
        data = await request.json()
        on = bool(data.get("auto"))
        if not _save_auto(on):
            return web.json_response({"success": False, "error": "save failed"})
        payload = _status_payload()
        payload["auto"] = on
        return web.json_response(payload)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/danbooru_anima/fav_thumbs/quality")
async def fav_thumbs_quality(request):
    try:
        data = await request.json()
        q = str((data or {}).get("quality") or "low").lower()
        if q not in _Q:
            q = "low"
        if not _save_settings(quality=q):
            return web.json_response({"success": False, "error": "save failed"})
        payload = _status_payload()
        payload["quality"] = q
        return web.json_response(payload)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/danbooru_anima/fav_thumbs/cache")
async def fav_thumbs_cache(request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    try:
        limit = (data or {}).get("limit", (data or {}).get("batch", 16))
        reset = bool((data or {}).get("reset"))
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, lambda: cache_batch(limit, reset))
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.post("/danbooru_anima/fav_thumbs/clear")
async def fav_thumbs_clear(request):
    try:
        n = clear_cache()
        payload = _status_payload()
        payload["success"] = True
        payload["removed"] = n
        return web.json_response(payload)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


@PromptServer.instance.routes.get("/danbooru_anima/fav_thumb/{fname}")
async def serve_fav_thumb(request):
    fname = request.match_info.get("fname", "")
    if ".." in fname or "/" in fname or "\\" in fname:
        return web.Response(status=400)
    fpath = os.path.join(FAV_THUMB_DIR, fname)
    if not os.path.isfile(fpath):
        return web.Response(status=404)
    return web.FileResponse(fpath, headers={"Cache-Control": "public, max-age=2592000, immutable"})
