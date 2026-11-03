# -*- coding: utf-8 -*-
"""画师「AI」缩略图：用阿尼玛输出图，和 D站 fav_thumbs / 手裁 web/thumbs 分开。"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import threading

from aiohttp import web
from PIL import Image, ImageFile
from server import PromptServer

ImageFile.LOAD_TRUNCATED_IMAGES = True
_RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE_DIR = os.path.join(PLUGIN_DIR, "web", "live_thumbs")
INDEX_FILE = os.path.join(PLUGIN_DIR, "artist_live_thumbs.json")
_MAX_SIDE = 512
_JPEG_Q = 86
_lock = threading.Lock()

try:
    from .output_prompt_viewer import (
        IMG_EXT,
        _output_root,
        _safe_file,
        ensure_folder_index,
        iter_output_subs,
        unique_artist_keys,
    )
except Exception:
    from output_prompt_viewer import (
        IMG_EXT,
        _output_root,
        _safe_file,
        ensure_folder_index,
        iter_output_subs,
        unique_artist_keys,
    )


def _ensure_dir():
    os.makedirs(LIVE_DIR, exist_ok=True)


def _norm_tag(tag):
    s = str(tag or "").strip()
    s = re.sub(r"^@+", "", s)
    s = re.sub(r"(?i)^artist:", "", s)
    s = s.replace("\\(", "(").replace("\\)", ")")
    s = s.replace(" ", "_")
    s = re.sub(r"_+", "_", s).strip("_").lower()
    return s


def _safe_tag(tag):
    s = re.sub(r"[^a-z0-9_]", "_", _norm_tag(tag))
    s = re.sub(r"_+", "_", s).strip("_") or "tag"
    return s[:60]


def _fname(tag):
    key = _norm_tag(tag)
    digest = hashlib.md5(key.encode("utf-8")).hexdigest()[:8]
    return "l_%s_%s.jpg" % (_safe_tag(key), digest)


def _load_index():
    try:
        with open(INDEX_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _save_index(data):
    tmp = INDEX_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, INDEX_FILE)


def _to_rgb(im):
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (18, 18, 22))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def _write_jpg(src_path, dest_path):
    im = Image.open(src_path)
    try:
        im.seek(0)
    except Exception:
        pass
    rgb = _to_rgb(im)
    rgb.thumbnail((_MAX_SIDE, _MAX_SIDE), _RESAMPLE)
    _ensure_dir()
    rgb.save(dest_path, "JPEG", quality=_JPEG_Q, optimize=True)
    try:
        im.close()
    except Exception:
        pass
    try:
        rgb.close()
    except Exception:
        pass


def _safe_live_name(fname):
    base = os.path.basename(str(fname or ""))
    if not base or base in (".", "..") or ".." in base:
        return ""
    if "/" in base or "\\" in base:
        return ""
    ext = os.path.splitext(base)[1].lower()
    if ext not in (".jpg", ".jpeg"):
        return ""
    if not re.match(r"^l_[A-Za-z0-9._-]+\.jpe?g$", base, re.I):
        return ""
    path = os.path.abspath(os.path.join(LIVE_DIR, base))
    root = os.path.abspath(LIVE_DIR)
    try:
        if os.path.commonpath([path, root]) != root:
            return ""
    except ValueError:
        return ""
    return path


def _build_map():
    idx = _load_index()
    out = {}
    for key, rec in idx.items():
        if not isinstance(key, str) or not key:
            continue
        file = ""
        filename = ""
        subfolder = ""
        if isinstance(rec, dict):
            file = os.path.basename(str(rec.get("file") or ""))
            filename = str(rec.get("filename") or "")
            subfolder = str(rec.get("subfolder") or "")
        elif isinstance(rec, str):
            file = os.path.basename(rec)
        if not file:
            continue
        path = _safe_live_name(file)
        if not path or not os.path.isfile(path):
            continue
        try:
            mtime = int(os.path.getmtime(path))
        except Exception:
            mtime = 0
        src = ""
        if isinstance(rec, dict):
            src = str(rec.get("source") or "")
        item = {
            "file": file,
            "url": "/danbooru_anima/live_thumb/" + file,
            "filename": filename,
            "subfolder": subfolder,
            "mtime": mtime,
        }
        if src:
            item["source"] = src
        out[key] = item
    return out


def _assign_sync(tag, filename, subfolder, source="manual"):
    key = _norm_tag(tag)
    if not key:
        return {"success": False, "error": "bad tag"}
    source = "auto" if source == "auto" else "manual"
    root = _output_root()
    try:
        src, sub, fn = _safe_file(root, subfolder, filename)
    except ValueError as ve:
        return {"success": False, "error": str(ve)}
    if not os.path.isfile(src):
        return {"success": False, "error": "文件不存在"}
    ext = os.path.splitext(fn)[1].lower()
    if ext not in IMG_EXT:
        return {"success": False, "error": "不是图片"}
    dest_name = _fname(key)
    dest = os.path.join(LIVE_DIR, dest_name)
    _write_jpg(src, dest)
    rec = {"file": dest_name, "filename": fn, "subfolder": sub, "source": source}
    with _lock:
        idx = _load_index()
        idx[key] = rec
        _save_index(idx)
    try:
        mtime = int(os.path.getmtime(dest))
    except Exception:
        mtime = 0
    return {
        "success": True,
        "tag": key,
        "file": dest_name,
        "url": "/danbooru_anima/live_thumb/" + dest_name,
        "mtime": mtime,
        "source": source,
    }


def _clear_sync(tag):
    key = _norm_tag(tag)
    if not key:
        return {"success": False, "error": "bad tag"}
    removed = False
    with _lock:
        idx = _load_index()
        rec = idx.pop(key, None)
        if rec is not None:
            _save_index(idx)
            removed = True
            file = ""
            if isinstance(rec, dict):
                file = os.path.basename(str(rec.get("file") or ""))
            elif isinstance(rec, str):
                file = os.path.basename(rec)
            path = _safe_live_name(file) if file else ""
            if path and os.path.isfile(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
    return {"success": True, "removed": removed, "tag": key}


def _rec_file_ok(rec):
    file = ""
    if isinstance(rec, dict):
        file = os.path.basename(str(rec.get("file") or ""))
    elif isinstance(rec, str):
        file = os.path.basename(rec)
    path = _safe_live_name(file) if file else ""
    return bool(path and os.path.isfile(path))


def _solo_live_key(rec):
    keys = unique_artist_keys(rec if isinstance(rec, dict) else {})
    if len(keys) != 1:
        return ""
    return _norm_tag(keys[0])


def _find_solo_hits(wanted, subfolder="", deep=True):
    wanted = set(wanted or [])
    best = {}
    if not wanted:
        return best
    for child in iter_output_subs(subfolder or "", bool(deep)):
        files, _stats = ensure_folder_index(child)
        for name, rec in (files or {}).items():
            key = _solo_live_key(rec)
            if not key or key not in wanted:
                continue
            try:
                mt = int((rec or {}).get("mtime") or 0)
            except Exception:
                mt = 0
            prev = best.get(key)
            if not prev or mt > prev[0]:
                best[key] = (mt, name, child)
    return best


def _autofill_sync(tags, subfolder="", deep=True):
    wanted = []
    seen = set()
    for raw in tags or []:
        key = _norm_tag(raw)
        if not key or key in seen:
            continue
        seen.add(key)
        wanted.append(key)
        if len(wanted) >= 120:
            break
    with _lock:
        idx = _load_index()
    need = []
    skipped = []
    for key in wanted:
        rec = idx.get(key)
        if _rec_file_ok(rec):
            skipped.append(key)
            continue
        need.append(key)
    filled = []
    missing = []
    if need:
        hits = _find_solo_hits(set(need), subfolder or "", deep)
        for key in need:
            hit = hits.get(key)
            if not hit:
                missing.append(key)
                continue
            _mt, filename, child = hit
            result = _assign_sync(key, filename, child, "auto")
            if result.get("success"):
                filled.append(key)
            else:
                missing.append(key)
    return {
        "success": True,
        "map": _build_map(),
        "filled": filled,
        "missing": missing,
        "skipped": skipped,
    }


@PromptServer.instance.routes.get("/danbooru_anima/live_thumbs/map")
async def live_thumbs_map(request):
    try:
        return web.json_response({"success": True, "map": _build_map()})
    except Exception as e:
        return web.json_response({"success": False, "map": {}, "error": str(e)})


@PromptServer.instance.routes.post("/danbooru_anima/live_thumbs/assign")
async def live_thumbs_assign(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "bad json"}, status=400)
    tag = (data or {}).get("tag") or ""
    filename = (data or {}).get("filename") or ""
    subfolder = (data or {}).get("subfolder") or ""
    try:
        result = _assign_sync(tag, filename, subfolder)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/danbooru_anima/live_thumbs/autofill")
async def live_thumbs_autofill(request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    tags = (data or {}).get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    if not isinstance(tags, list):
        tags = []
    subfolder = (data or {}).get("subfolder") or ""
    deep = (data or {}).get("deep")
    if deep is None:
        deep = True
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _autofill_sync, tags, subfolder, bool(deep))
        return web.json_response(result)
    except Exception as e:
        return web.json_response({"success": False, "map": {}, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/danbooru_anima/live_thumbs/clear")
async def live_thumbs_clear(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "bad json"}, status=400)
    tag = (data or {}).get("tag") or ""
    try:
        return web.json_response(_clear_sync(tag))
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/danbooru_anima/live_thumb/{fname}")
async def serve_live_thumb(request):
    fname = request.match_info.get("fname", "")
    path = _safe_live_name(fname)
    if not path or not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path, headers={"Cache-Control": "public, max-age=60, must-revalidate"})
