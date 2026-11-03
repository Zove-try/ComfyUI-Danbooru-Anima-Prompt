# -*- coding: utf-8 -*-
"""画师组合缩略图：选中时复制成插件自己的文件，不引用输出目录里的原图。"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re

from aiohttp import web
from PIL import Image, ImageFile
from server import PromptServer

ImageFile.LOAD_TRUNCATED_IMAGES = True
_RESAMPLE = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMBO_DIR = os.path.join(PLUGIN_DIR, "web", "combo_thumbs")
_MAX_SIDE = 768
_JPEG_Q = 88

try:
    from .output_prompt_viewer import IMG_EXT, _fav_copy_abs, _output_root, _safe_file
except Exception:
    from output_prompt_viewer import IMG_EXT, _fav_copy_abs, _output_root, _safe_file


def _ensure_dir():
    os.makedirs(COMBO_DIR, exist_ok=True)


def _to_rgb(im):
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        bg = Image.new("RGB", im.size, (18, 18, 22))
        rgba = im.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def _safe_name(fname):
    base = os.path.basename(str(fname or ""))
    if not re.match(r"^c_[a-f0-9]{16}\.jpg$", base):
        return ""
    path = os.path.abspath(os.path.join(COMBO_DIR, base))
    root = os.path.abspath(COMBO_DIR)
    try:
        if os.path.commonpath([path, root]) != root:
            return ""
    except ValueError:
        return ""
    return path


def _source_path(filename, subfolder):
    root = _output_root()
    try:
        src, _sub, _fn = _safe_file(root, subfolder, filename)
    except ValueError as ve:
        return "", str(ve)
    if os.path.isfile(src):
        return src, ""
    try:
        dest, _rel, _fn = _fav_copy_abs(filename, subfolder)
    except Exception:
        dest = ""
    if dest and os.path.isfile(dest):
        return dest, ""
    return "", "文件不存在"


def _file_md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _copy_sync(filename, subfolder):
    src, err = _source_path(filename, subfolder)
    if not src:
        return {"success": False, "error": err or "文件不存在"}
    ext = os.path.splitext(src)[1].lower()
    if ext not in IMG_EXT:
        return {"success": False, "error": "不是图片"}
    name = "c_%s.jpg" % _file_md5(src)[:16]
    dest = os.path.join(COMBO_DIR, name)
    if not os.path.isfile(dest):
        im = Image.open(src)
        try:
            try:
                im.seek(0)
            except Exception:
                pass
            rgb = _to_rgb(im)
            rgb.thumbnail((_MAX_SIDE, _MAX_SIDE), _RESAMPLE)
            _ensure_dir()
            rgb.save(dest, "JPEG", quality=_JPEG_Q, optimize=True)
        finally:
            try:
                im.close()
            except Exception:
                pass
    return {"success": True, "url": "/danbooru_anima/combo_thumb/" + name, "file": name}


@PromptServer.instance.routes.post("/danbooru_anima/combo_thumb/copy")
async def combo_thumb_copy(request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    filename = str((data or {}).get("filename") or "")
    subfolder = str((data or {}).get("subfolder") or "")
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _copy_sync, filename, subfolder)
        status = 200 if result.get("success") else 400
        return web.json_response(result, status=status)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get("/danbooru_anima/combo_thumb/{fname}")
async def serve_combo_thumb(request):
    path = _safe_name(request.match_info.get("fname", ""))
    if not path or not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path, headers={"Cache-Control": "public, max-age=86400"})
