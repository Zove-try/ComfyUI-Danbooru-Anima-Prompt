"""
输出目录提示词查看器
只读：列出 ComfyUI output 里的图，从 PNG 元数据抽出实际生效的正向提示词。
不改任何现有节点；路由注册失败时其它功能不受影响。
"""
from __future__ import annotations

import asyncio
import copy
import ctypes
import hashlib
import json
import shutil
import math
import os
import re
import struct
import subprocess
import sys
import threading
import time
import zlib
from concurrent.futures import ThreadPoolExecutor

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_TEXT_CHUNK = 32 * 1024 * 1024
MAX_HOPS = 48
INDEX_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output_artist_index.json")
INDEX_VER = 4
_INDEX_LOCK = threading.Lock()
_INDEX_LIVE = None
_INDEX_LIVE_ROOT = None
_AGG_CACHE = {}

# 图片收藏夹：虚拟目录 + 插件根目录 JSON（与 D/G 站 favorites.json 分开）
IMG_FAV_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output_image_favorites.json")
IMG_FAV_VER = 1
IMG_FAV_SUB = "__img_favs__"
IMG_FAV_COPY_SUB = "收藏图备份"
FAV_BACKUP_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output_fav_backup.json")
FAV_BACKUP_VER = 1
_FAV_BACKUP_LOCK = threading.Lock()
_FAV_BACKUP_LIVE = None
_FAV_BACKUP_LIVE_MT = None
OPV_TRASH_SUB = "查看器回收站"
TRASH_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output_viewer_trash.json")
TRASH_VER = 1
TRASH_DAYS = 7
_TRASH_LOCK = threading.Lock()
_TRASH_LIVE = None
_TRASH_LIVE_MT = None
_LAST_PURGE = 0.0
_IMG_FAV_LOCK = threading.Lock()
_IMG_FAV_LIVE = None
_IMG_FAV_LIVE_MT = None

IMG_RATE_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output_image_ratings.json")
IMG_RATE_VER = 1
_IMG_RATE_LOCK = threading.Lock()
_IMG_RATE_LIVE = None
_IMG_RATE_LIVE_MT = None
_FAV_RECONCILE_LOCK = threading.Lock()
_FAV_RECONCILE_CLEAN_UNTIL = 0.0
_FAV_RECONCILE_RUNNING = False


PASSTHROUGH_TYPES = {"DanbooruTextPassthrough", "DanbooruTextAdvanced"}
COMPOSER_TYPES = {"AnimaPromptCreator", "NewbiePromptCreator"}
REROUTE_TYPES = {"Reroute", "Reroute (rgthree)", "RerouteForEach"}
CONCAT_TYPES = {
    "DanbooruTextConcat", "Text Concatenate", "StringConcatenate", "JoinStrings",
    "CR Text Concatenate", "ConcatStringSingle", "StringConcat", "JoinStringMulti",
    "Prompt Concatenate", "Text Concatenate (rgthree)", "StringJoin",
}
PRIMITIVE_TYPES = {
    "PrimitiveString", "Primitive", "String Literal", "Text Multiline", "String",
    "CM_String", "easy string", "Text", "DanbooruText", "Note",
}
SHOW_THROUGH_TYPES = {
    "easy showAnything", "ShowAnything", "PreviewAny", "Preview Any",
    "Display Any", "Display Anything", "Show Text",
}
SEP_MAP = {
    "逗号+空格": ", ", "中文逗号+空格": "， ", "仅逗号": ",", "空格": " ",
    "换行": "\n", "逗号+换行": ",\n", "分号+空格": "; ", "竖线+空格": " | ",
    "无分隔符": "",
}
SKIP_GRAPH_KEYS = {
    "negative", "uncond", "model", "clip", "vae", "control_net", "controlnet",
    "lora", "lora_name", "lora_stack", "noise_mask", "examples", "audio",
    "unet", "style_model",
}
SKIP_STRING_WALK_KEYS = SKIP_GRAPH_KEYS | {
    "image", "images", "pixels", "samples", "latent", "latent_image", "latents",
    "mask", "noise", "audio", "guider",
}
# 不认识的节点：只从这些口跟 STRING 连线 / 收字，避免误收 format、ban_tags、模型名
STRING_SOURCE_KEYS = (
    "text", "text_g", "text_l", "clip_l", "t5xxl", "prompt", "prompt_text",
    "string", "STRING", "value", "tags", "nl_prompt", "anything", "source",
    "input", "any",
)
JUNK_STRING_KEYS = {
    "format", "ban_tags", "tipo_model", "device", "filename_prefix",
    "exclude_tags", "lora_name", "sampler_name", "scheduler",
}
WALK_PREF = (
    "images", "image", "pixels", "samples", "latent", "latent_image", "latents",
    "src", "source", "guider",
)
COND_PREF = (
    "positive", "conditioning", "conditioning_to", "conditioning_from",
    "cond", "c", "text", "prompt", "guider",
)
APC_KEYS = (
    "quality_tags", "count_tags", "character_tags", "series_tags", "artist_tags",
    "general_tags", "model_mode", "natural_language", "time_tag", "safety_tag",
    "meta_tags",
)
_MODE_NAME = {"anima": 0, "noob": 1, "aesthetic": 2}


def _is_inside(root, path):
    try:
        root = os.path.abspath(root)
        path = os.path.abspath(path)
        return os.path.commonpath([root, path]) == root
    except (ValueError, OSError):
        return False


def _output_root():
    from folder_paths import get_output_directory
    return os.path.abspath(get_output_directory())


def _safe_sub(subfolder):
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if not sub:
        return ""
    parts = [p for p in sub.split("/") if p and p not in (".", "..")]
    if any(p == ".." for p in (subfolder or "").replace("\\", "/").split("/")):
        raise ValueError("bad subfolder")
    return "/".join(parts)


def _safe_file(root, subfolder, filename):
    sub = _safe_sub(subfolder)
    fn = os.path.basename(filename or "")
    if not fn or fn in (".", ".."):
        raise ValueError("bad filename")
    path = os.path.abspath(os.path.join(root, sub, fn) if sub else os.path.join(root, fn))
    if not _is_inside(root, path):
        raise ValueError("path outside output")
    if os.path.islink(path):
        real = os.path.realpath(path)
        if not _is_inside(root, real):
            raise ValueError("symlink outside output")
    return path, sub, fn



def _empty_fav_backup_cfg():
    return {"ver": FAV_BACKUP_VER, "dir": ""}


def _load_fav_backup_cfg():
    global _FAV_BACKUP_LIVE, _FAV_BACKUP_LIVE_MT
    if not os.path.isfile(FAV_BACKUP_FILE):
        data = _empty_fav_backup_cfg()
        _FAV_BACKUP_LIVE = data
        _FAV_BACKUP_LIVE_MT = None
        return data
    try:
        mt = os.path.getmtime(FAV_BACKUP_FILE)
    except OSError:
        mt = None
    if (
        _FAV_BACKUP_LIVE is not None
        and _FAV_BACKUP_LIVE_MT == mt
        and isinstance(_FAV_BACKUP_LIVE, dict)
    ):
        return _FAV_BACKUP_LIVE
    try:
        with open(FAV_BACKUP_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = _empty_fav_backup_cfg()
    if not isinstance(data, dict):
        data = _empty_fav_backup_cfg()
    data["ver"] = FAV_BACKUP_VER
    if not isinstance(data.get("dir"), str):
        data["dir"] = ""
    _FAV_BACKUP_LIVE = data
    _FAV_BACKUP_LIVE_MT = mt
    return data


def _save_fav_backup_cfg(data):
    global _FAV_BACKUP_LIVE, _FAV_BACKUP_LIVE_MT
    if not isinstance(data, dict):
        return False
    tmp = FAV_BACKUP_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, FAV_BACKUP_FILE)
        _FAV_BACKUP_LIVE = data
        try:
            _FAV_BACKUP_LIVE_MT = os.path.getmtime(FAV_BACKUP_FILE)
        except OSError:
            _FAV_BACKUP_LIVE_MT = None
        return True
    except Exception:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


def _default_fav_backup_root():
    return os.path.abspath(os.path.join(_output_root(), IMG_FAV_COPY_SUB))


def _fav_backup_root():
    cfg = _load_fav_backup_cfg()
    raw = str(cfg.get("dir") or "").strip().strip('"').strip("'")
    if not raw:
        return _default_fav_backup_root(), True
    return os.path.abspath(os.path.expanduser(raw)), False


def fav_backup_info():
    root, using_default = _fav_backup_root()
    return {
        "ok": True,
        "dir": root,
        "custom": "" if using_default else root,
        "default_dir": _default_fav_backup_root(),
        "using_default": using_default,
        "exists": os.path.isdir(root),
    }


def _fav_backup_output_rel():
    try:
        copy_root, _using = _fav_backup_root()
        out = _output_root()
    except Exception:
        return None
    if not _is_inside(out, copy_root):
        return None
    rel = os.path.relpath(copy_root, out).replace("\\", "/")
    if rel in (".", ""):
        return None
    return rel


def _is_skipped_dir_name(name):
    n = name or ""
    if n.startswith("."):
        return True
    if n in (IMG_FAV_COPY_SUB, IMG_FAV_SUB, OPV_TRASH_SUB):
        return True
    hide = _fav_backup_output_rel()
    if hide and "/" not in hide and n == hide:
        return True
    return False


def _is_skipped_sub(subfolder):
    sub = (subfolder or "").replace(chr(92), "/").strip("/")
    if not sub:
        return False
    if sub.split("/")[0] in (IMG_FAV_COPY_SUB, IMG_FAV_SUB):
        return True
    hide = _fav_backup_output_rel()
    if hide and (sub == hide or sub.startswith(hide + "/")):
        return True
    return False


def _fav_copy_abs(filename, subfolder=""):
    sub = _safe_sub(subfolder)
    fn = os.path.basename(filename or "")
    if not fn or fn in (".", ".."):
        raise ValueError("bad filename")
    copy_root, _using = _fav_backup_root()
    dest_dir = os.path.join(copy_root, *sub.split("/")) if sub else copy_root
    dest = os.path.abspath(os.path.join(dest_dir, fn))
    if not _is_inside(copy_root, dest):
        raise ValueError("fav copy outside backup folder")
    try:
        out = _output_root()
    except Exception:
        out = ""
    if out and _is_inside(out, dest):
        parent = os.path.dirname(dest)
        rel = os.path.relpath(parent, out).replace("\\", "/")
        if rel in (".", ""):
            rel = ""
        return dest, rel, fn
    return dest, None, fn


def _ensure_fav_copy(src_path, filename, subfolder=""):
    dest, rel, fn = _fav_copy_abs(filename, subfolder)
    src_path = os.path.abspath(src_path)
    if not os.path.isfile(src_path):
        return dest, rel, fn
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    try:
        if os.path.isfile(dest):
            ss = os.stat(src_path)
            ds = os.stat(dest)
            if int(ss.st_size) == int(ds.st_size) and int(ss.st_mtime) <= int(ds.st_mtime):
                return dest, rel, fn
    except OSError:
        pass
    shutil.copy2(src_path, dest)
    return dest, rel, fn


def _relocate_fav_copy(old_fn, old_sub, new_fn, new_sub):
    """Move the backup copy when a favorite's folder changes. Drop the old copy if the new one is already there."""
    try:
        old_dest, _or, _of = _fav_copy_abs(old_fn, old_sub)
        new_dest, _nr, _nf = _fav_copy_abs(new_fn, new_sub)
    except Exception:
        return
    if not old_dest or not os.path.isfile(old_dest):
        return
    try:
        if os.path.abspath(old_dest) == os.path.abspath(new_dest):
            return
        os.makedirs(os.path.dirname(new_dest), exist_ok=True)
        if os.path.isfile(new_dest):
            os.remove(old_dest)
        else:
            shutil.move(old_dest, new_dest)
        parent = os.path.dirname(old_dest)
        copy_root, _ud = _fav_backup_root()
        copy_root = os.path.abspath(copy_root)
        while parent and _is_inside(copy_root, parent) and os.path.abspath(parent) != copy_root:
            try:
                os.rmdir(parent)
            except OSError:
                break
            parent = os.path.dirname(parent)
    except Exception:
        pass


def _drop_fav_copy(filename, subfolder=""):
    try:
        dest, _rel, _fn = _fav_copy_abs(filename, subfolder)
        copy_root, _using = _fav_backup_root()
    except Exception:
        return
    try:
        if os.path.isfile(dest):
            os.remove(dest)
    except OSError:
        pass
    parent = os.path.dirname(dest)
    copy_root = os.path.abspath(copy_root)
    while parent and _is_inside(copy_root, parent) and os.path.abspath(parent) != copy_root:
        try:
            os.rmdir(parent)
        except OSError:
            break
        parent = os.path.dirname(parent)


def _resolve_view_file(filename, subfolder=""):
    root = _output_root()
    path, sub, fn = _safe_file(root, subfolder, filename)
    if os.path.isfile(path):
        return path, sub, fn, sub
    try:
        dest, rel, _fn = _fav_copy_abs(fn, sub)
    except Exception:
        dest, rel = "", None
    if dest and os.path.isfile(dest):
        return dest, sub, fn, rel
    raise FileNotFoundError("文件不存在")

def _reveal_in_folder(path):
    """Open the file's folder in the OS file manager and select the file."""
    path = os.path.normpath(os.path.abspath(path))
    if not os.path.isfile(path):
        return False, "文件不存在"
    try:
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.shell32.ShellExecuteW(
                None, "open", "explorer.exe",
                '/select,"{}"'.format(path),
                None, 1,
            )
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", path])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(path)])
        return True, ""
    except Exception as e:
        return False, str(e)



def _reveal_dir(path):
    path = os.path.normpath(os.path.abspath(path))
    if not os.path.isdir(path):
        try:
            os.makedirs(path, exist_ok=True)
        except OSError:
            return False, "目录不存在"
    try:
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.shell32.ShellExecuteW(None, "open", "explorer.exe", path, None, 1)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return True, ""
    except Exception as e:
        return False, str(e)


def _migrate_fav_backup(old_root, new_root):
    old_root = os.path.abspath(old_root or "")
    new_root = os.path.abspath(new_root or "")
    if not old_root or not new_root or old_root == new_root:
        return 0
    if not os.path.isdir(old_root):
        return 0
    if _is_inside(old_root, new_root) or _is_inside(new_root, old_root):
        return 0
    copied = 0
    for dirpath, dirnames, names in os.walk(old_root):
        dirnames[:] = [d for d in dirnames if not str(d).startswith(".")]
        rel = os.path.relpath(dirpath, old_root)
        dest_dir = new_root if rel == "." else os.path.join(new_root, rel)
        for name in names:
            if str(name).startswith("."):
                continue
            src = os.path.join(dirpath, name)
            dest = os.path.join(dest_dir, name)
            try:
                if not os.path.isfile(src):
                    continue
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                if os.path.isfile(dest):
                    ss = os.stat(src)
                    ds = os.stat(dest)
                    if int(ss.st_size) == int(ds.st_size):
                        continue
                shutil.copy2(src, dest)
                copied += 1
            except OSError:
                continue
    return copied


def set_fav_backup_dir(dir_path):
    old_root, _old_def = _fav_backup_root()
    raw = str(dir_path or "").strip().strip('"').strip("'")
    if not raw:
        with _FAV_BACKUP_LOCK:
            if not _save_fav_backup_cfg(_empty_fav_backup_cfg()):
                return {"ok": False, "error": "写入设置失败"}
        new_root, _ud = _fav_backup_root()
        copied = _migrate_fav_backup(old_root, new_root)
        info = fav_backup_info()
        info["copied"] = copied
        return info
    path = os.path.abspath(os.path.expanduser(raw))
    if os.path.isfile(path):
        return {"ok": False, "error": "这是文件，请填文件夹路径"}
    try:
        out = os.path.abspath(_output_root())
    except Exception:
        out = ""
    if out and os.path.abspath(path) == out:
        return {"ok": False, "error": "不能使用输出根目录"}
    if out:
        trash = os.path.abspath(os.path.join(out, OPV_TRASH_SUB))
        if os.path.abspath(path) == trash or _is_inside(trash, path):
            return {"ok": False, "error": "不能设在查看器回收站里"}
    try:
        os.makedirs(path, exist_ok=True)
    except OSError as e:
        return {"ok": False, "error": str(e)}
    if not os.path.isdir(path):
        return {"ok": False, "error": "无法创建文件夹"}
    with _FAV_BACKUP_LOCK:
        if not _save_fav_backup_cfg({"ver": FAV_BACKUP_VER, "dir": path}):
            return {"ok": False, "error": "写入设置失败"}
    new_root, _ud = _fav_backup_root()
    copied = _migrate_fav_backup(old_root, new_root)
    info = fav_backup_info()
    info["copied"] = copied
    return info


def reveal_fav_backup():
    root, _ud = _fav_backup_root()
    try:
        os.makedirs(root, exist_ok=True)
    except OSError as e:
        return False, str(e)
    return _reveal_dir(root)


_FAV_PICK_LOCK = threading.Lock()


class _OPV_GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _guid_from_str(text):
    h = (text or "").strip().strip("{}").replace("-", "")
    if len(h) != 32:
        raise ValueError("bad guid")
    g = _OPV_GUID()
    g.Data1 = int(h[0:8], 16)
    g.Data2 = int(h[8:12], 16)
    g.Data3 = int(h[12:16], 16)
    raw = bytes.fromhex(h[16:32])
    for i in range(8):
        g.Data4[i] = raw[i]
    return g


class _OPV_IFACE(ctypes.Structure):
    _fields_ = [("lpVtbl", ctypes.POINTER(ctypes.c_void_p))]


def _com_vtbl(ptr):
    return ctypes.cast(ptr, ctypes.POINTER(_OPV_IFACE)).contents.lpVtbl


def _com_call(ptr, idx, restype, *argtypes):
    fn = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)(_com_vtbl(ptr)[idx])

    def _run(*args):
        return fn(ptr, *args)

    return _run


def _file_open_dialog_create():
    if sys.platform != "win32":
        return None, "not windows"
    ole32 = ctypes.WinDLL("ole32")
    ole32.CoInitializeEx.restype = ctypes.c_long
    ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    ole32.CoCreateInstance.restype = ctypes.c_long
    ole32.CoCreateInstance.argtypes = [
        ctypes.POINTER(_OPV_GUID), ctypes.c_void_p, ctypes.c_uint,
        ctypes.POINTER(_OPV_GUID), ctypes.POINTER(ctypes.c_void_p),
    ]
    hr = int(ole32.CoInitializeEx(None, 0x2))
    need_uninit = hr == 0
    clsid = _guid_from_str("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")
    iid = _guid_from_str("D57C7288-D4AD-4768-BE02-9D969532D960")
    dlg = ctypes.c_void_p()
    hr = int(ole32.CoCreateInstance(
        ctypes.byref(clsid), None, 1, ctypes.byref(iid), ctypes.byref(dlg),
    ))
    if hr != 0 or not dlg.value:
        if need_uninit:
            try:
                ole32.CoUninitialize()
            except Exception:
                pass
        return None, "CoCreateInstance %s" % hex(hr & 0xFFFFFFFF)
    return {"dlg": dlg, "need_uninit": need_uninit}, ""


def _file_open_dialog_release(handle):
    if not handle:
        return
    dlg = handle.get("dlg")
    if dlg:
        try:
            _com_call(dlg, 2, ctypes.c_ulong)()
        except Exception:
            pass
    if handle.get("need_uninit"):
        try:
            ctypes.WinDLL("ole32").CoUninitialize()
        except Exception:
            pass


def _file_open_dialog_smoke():
    if sys.platform != "win32":
        return True, ""
    handle, err = _file_open_dialog_create()
    if not handle:
        return False, err or "create failed"
    _file_open_dialog_release(handle)
    return True, ""


def _pick_dir_windows(initial=""):
    from ctypes import wintypes

    handle, err = _file_open_dialog_create()
    if not handle:
        return "", err or "create failed"
    dlg = handle["dlg"]
    ole32 = ctypes.WinDLL("ole32")
    shell32 = ctypes.WinDLL("shell32")
    user32 = ctypes.WinDLL("user32")
    try:
        GetOptions = _com_call(dlg, 10, ctypes.c_long, ctypes.POINTER(ctypes.c_uint))
        SetOptions = _com_call(dlg, 9, ctypes.c_long, ctypes.c_uint)
        SetTitle = _com_call(dlg, 17, ctypes.c_long, wintypes.LPCWSTR)
        SetFolder = _com_call(dlg, 12, ctypes.c_long, ctypes.c_void_p)
        SetDefaultFolder = _com_call(dlg, 11, ctypes.c_long, ctypes.c_void_p)
        Show = _com_call(dlg, 3, ctypes.c_long, wintypes.HWND)
        GetResult = _com_call(dlg, 20, ctypes.c_long, ctypes.POINTER(ctypes.c_void_p))

        opts = ctypes.c_uint()
        GetOptions(ctypes.byref(opts))
        SetOptions(int(opts.value) | 0x20 | 0x40)
        SetTitle("选择收藏备份目录")

        start = os.path.abspath(initial) if initial else ""
        if start and os.path.isfile(start):
            start = os.path.dirname(start)
        if start and os.path.isdir(start):
            iid_item = _guid_from_str("43826D1E-E718-42EE-BC55-A1E261C37BFE")
            item = ctypes.c_void_p()
            shell32.SHCreateItemFromParsingName.restype = ctypes.c_long
            shell32.SHCreateItemFromParsingName.argtypes = [
                wintypes.LPCWSTR, ctypes.c_void_p, ctypes.POINTER(_OPV_GUID),
                ctypes.POINTER(ctypes.c_void_p),
            ]
            if int(shell32.SHCreateItemFromParsingName(
                start, None, ctypes.byref(iid_item), ctypes.byref(item),
            )) == 0 and item.value:
                try:
                    SetFolder(item)
                    SetDefaultFolder(item)
                finally:
                    _com_call(item, 2, ctypes.c_ulong)()

        hwnd = user32.GetForegroundWindow()
        hr = int(Show(hwnd))
        if hr != 0:
            return "", ""
        psi = ctypes.c_void_p()
        if int(GetResult(ctypes.byref(psi))) != 0 or not psi.value:
            return "", ""
        try:
            GetDisplayName = _com_call(
                psi, 5, ctypes.c_long, ctypes.c_uint, ctypes.POINTER(wintypes.LPWSTR),
            )
            ppsz = wintypes.LPWSTR()
            if int(GetDisplayName(0x80058000, ctypes.byref(ppsz))) == 0 and ppsz:
                path = ppsz.value or ""
                ole32.CoTaskMemFree(ppsz)
                return path, ""
        finally:
            _com_call(psi, 2, ctypes.c_ulong)()
        return "", ""
    except Exception as e:
        return "", str(e)
    finally:
        _file_open_dialog_release(handle)


def _pick_dir_tkinter(initial=""):
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as e:
        return "", str(e)
    root = None
    try:
        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        root.update()
        kw = {"title": "选择收藏备份目录", "mustexist": True}
        start = os.path.abspath(initial) if initial else ""
        if start and os.path.isfile(start):
            start = os.path.dirname(start)
        if start and os.path.isdir(start):
            kw["initialdir"] = start
        path = filedialog.askdirectory(**kw) or ""
        return path, ""
    except Exception as e:
        return "", str(e)
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass


def _pick_dir_macos(initial=""):
    script = 'POSIX path of (choose folder with prompt "选择收藏备份目录")'
    start = os.path.abspath(initial) if initial else ""
    if start and os.path.isdir(start):
        safe = start.replace("\\", "/").replace('"', '\\"')
        script = (
            'POSIX path of (choose folder with prompt "选择收藏备份目录" '
            'default location POSIX file "%s")' % safe
        )
    try:
        p = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    except OSError as e:
        return "", str(e)
    if p.returncode != 0:
        return "", ""
    return (p.stdout or "").strip().rstrip("/"), ""


def _pick_dir_linux(initial=""):
    start = os.path.abspath(initial) if initial else ""
    if start and os.path.isfile(start):
        start = os.path.dirname(start)
    cmds = []
    if start and os.path.isdir(start):
        cmds.append(["zenity", "--file-selection", "--directory", "--title=选择收藏备份目录", "--filename=%s/" % start])
        cmds.append(["kdialog", "--getexistingdirectory", start])
    else:
        cmds.append(["zenity", "--file-selection", "--directory", "--title=选择收藏备份目录"])
        cmds.append(["kdialog", "--getexistingdirectory", os.path.expanduser("~")])
    for args in cmds:
        try:
            p = subprocess.run(args, capture_output=True, text=True)
        except FileNotFoundError:
            continue
        except OSError as e:
            return "", str(e)
        if p.returncode != 0:
            return "", ""
        return (p.stdout or "").strip(), ""
    return _pick_dir_tkinter(initial)


def _pick_directory(initial=""):
    if sys.platform == "win32":
        path, err = _pick_dir_windows(initial)
        if path:
            return path, ""
        if err:
            path2, err2 = _pick_dir_tkinter(initial)
            if path2:
                return path2, ""
            return "", err or err2
        return "", ""
    if sys.platform == "darwin":
        return _pick_dir_macos(initial)
    return _pick_dir_linux(initial)


def pick_fav_backup_dir(initial=""):
    raw = str(initial or "").strip().strip('"').strip("'")
    if not raw:
        try:
            raw, _ud = _fav_backup_root()
        except Exception:
            raw = ""
    if not _FAV_PICK_LOCK.acquire(blocking=False):
        return {"ok": False, "error": "已经打开了选择窗口", "cancelled": False, "dir": ""}
    box = {}

    def worker():
        try:
            path, err = _pick_directory(raw)
            if path:
                box["data"] = {"ok": True, "cancelled": False, "dir": os.path.abspath(path)}
            elif err:
                box["data"] = {"ok": False, "error": err, "cancelled": False, "dir": ""}
            else:
                box["data"] = {"ok": True, "cancelled": True, "dir": ""}
        except Exception as e:
            box["data"] = {"ok": False, "error": str(e), "cancelled": False, "dir": ""}

    try:
        t = threading.Thread(target=worker, name="opv-fav-pick", daemon=True)
        t.start()
        t.join()
        return box.get("data") or {"ok": False, "error": "选择文件夹失败", "cancelled": False, "dir": ""}
    finally:
        _FAV_PICK_LOCK.release()

def _recycle_win_shell(path):
    """Windows Recycle Bin via SHFileOperationW + FOF_ALLOWUNDO."""
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", ctypes.c_uint),
            ("pFrom", ctypes.c_void_p),
            ("pTo", ctypes.c_void_p),
            ("fFlags", ctypes.c_uint),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", ctypes.c_wchar_p),
        ]

    FO_DELETE = 3
    FOF_SILENT = 4
    FOF_NOCONFIRMATION = 16
    FOF_ALLOWUNDO = 64
    FOF_NOERRORUI = 1024
    buf = ctypes.create_unicode_buffer(path + "\0")
    op = SHFILEOPSTRUCTW()
    op.hwnd = None
    op.wFunc = FO_DELETE
    op.pFrom = ctypes.addressof(buf)
    op.pTo = None
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    op.fAnyOperationsAborted = 0
    rc = int(ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op)))
    if op.fAnyOperationsAborted:
        return False, "已取消"
    if os.path.isfile(path):
        return False, "移入回收站失败 (%s)" % rc
    return True, ""


def _recycle_win_vb(path):
    """Windows Recycle Bin via VisualBasic FileIO."""
    quoted = path.replace("'", "''")
    script = (
        "Add-Type -AssemblyName Microsoft.VisualBasic; "
        "[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile("
        "'{0}', "
        "[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, "
        "[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin, "
        "[Microsoft.VisualBasic.FileIO.UICancelOption]::DoNothing)"
    ).format(quoted)
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    r = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        timeout=60,
        creationflags=flags,
    )
    if os.path.isfile(path):
        err = (r.stderr or r.stdout or "").strip() or ("exit %s" % r.returncode)
        return False, err
    return True, ""


def _recycle_file(path):
    """Send a file to the OS Recycle Bin / Trash. Never permanently delete."""
    path = os.path.normpath(os.path.abspath(path))
    if not os.path.isfile(path):
        return False, "文件不存在"
    try:
        if sys.platform == "win32":
            drive = os.path.splitdrive(path)[0]
            if (not drive) or path.startswith("\\\\"):
                return False, "网络路径无法使用回收站"
            try:
                import ctypes
                dt = ctypes.windll.kernel32.GetDriveTypeW(drive + "\\")
            except Exception:
                dt = 3
            if dt == 4:
                return False, "网络路径无法使用回收站"
            ok, err = _recycle_win_vb(path)
            if ok:
                return True, ""
            ok2, err2 = _recycle_win_shell(path)
            if ok2:
                return True, ""
            return False, err or err2 or "移入回收站失败"
        if sys.platform == "darwin":
            posix = path.replace("\\", "\\\\").replace('"', '\\"')
            r = subprocess.run(
                ["osascript", "-e", 'tell application "Finder" to delete POSIX file "%s"' % posix],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if os.path.isfile(path):
                return False, (r.stderr or r.stdout or "移入废纸篓失败").strip()
            return True, ""
        for cmd in (("gio", "trash", path), ("trash-put", path), ("trash", path)):
            try:
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            except FileNotFoundError:
                continue
            if r.returncode == 0 and not os.path.isfile(path):
                return True, ""
        return False, "系统回收站不可用"
    except Exception as e:
        return False, str(e)


def _recycle_win_local(path):
    """True when this path can go to the Windows Recycle Bin."""
    path = os.path.normpath(os.path.abspath(path))
    if path.startswith("\\\\"):
        return False, "网络路径无法使用回收站"
    drive = os.path.splitdrive(path)[0]
    if not drive:
        return False, "网络路径无法使用回收站"
    try:
        dt = ctypes.windll.kernel32.GetDriveTypeW(drive + "\\")
    except Exception:
        dt = 3
    if dt == 4:
        return False, "网络路径无法使用回收站"
    return True, ""


def _recycle_win_shell_many(paths):
    """Recycle several files in one SHFileOperationW call.

    FOF_ALLOWUNDO is what sends them to the Recycle Bin. Do not drop it.
    """
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", ctypes.c_uint),
            ("pFrom", ctypes.c_void_p),
            ("pTo", ctypes.c_void_p),
            ("fFlags", ctypes.c_uint),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", ctypes.c_wchar_p),
        ]

    if not paths:
        return True, ""
    FO_DELETE = 3
    FOF_SILENT = 4
    FOF_NOCONFIRMATION = 16
    FOF_ALLOWUNDO = 64
    FOF_NOERRORUI = 1024
    blob = "\0".join(paths) + "\0\0"
    buf = ctypes.create_unicode_buffer(blob)
    op = SHFILEOPSTRUCTW()
    op.hwnd = None
    op.wFunc = FO_DELETE
    op.pFrom = ctypes.addressof(buf)
    op.pTo = None
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    op.fAnyOperationsAborted = 0
    rc = int(ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op)))
    if op.fAnyOperationsAborted:
        return False, "已取消"
    if any(os.path.isfile(p) for p in paths):
        return False, "移入回收站失败 (%s)" % rc
    return True, ""


def _recycle_many(paths):
    """Recycle existing files. Returns (gone_paths, first_error). Never unlinks."""
    gone = []
    err = ""
    paths = [os.path.normpath(os.path.abspath(p)) for p in (paths or []) if p]
    if not paths:
        return gone, err
    if sys.platform == "win32":
        local = []
        for p in paths:
            ok, why = _recycle_win_local(p)
            if not ok:
                err = err or why
                continue
            local.append(p)
        left = []
        chunk = 40
        for i in range(0, len(local), chunk):
            part = local[i:i + chunk]
            try:
                _recycle_win_shell_many(part)
            except Exception as e:
                err = err or str(e)
            for p in part:
                if os.path.isfile(p):
                    left.append(p)
                else:
                    gone.append(p)
        for p in left:
            ok, why = _recycle_file(p)
            if not os.path.isfile(p):
                gone.append(p)
            else:
                err = err or why or "移入回收站失败"
        return gone, err
    for p in paths:
        ok, why = _recycle_file(p)
        if not os.path.isfile(p):
            gone.append(p)
        else:
            err = err or why or "移入回收站失败"
    return gone, err


def recycle_output_items(items=None):
    """Send selected output images to the OS Recycle Bin. Cap 400."""
    root = _output_root()
    if not isinstance(items, list) or not items:
        return {"ok": False, "error": "还没有选中图片", "recycled": 0, "items": [], "errors": ["还没有选中图片"]}
    if len(items) > 400:
        items = items[:400]
    planned = []
    errors = []
    seen = set()

    def push(msg):
        msg = str(msg or "").strip()
        if msg and msg not in errors:
            errors.append(msg)

    for raw in items:
        if not isinstance(raw, dict):
            continue
        filename = str(raw.get("filename") or "").strip()
        subfolder = raw.get("subfolder") or ""
        if not filename:
            continue
        try:
            path, sub, fn = _safe_file(root, subfolder, filename)
        except Exception as e:
            push(e)
            continue
        ext = os.path.splitext(fn)[1].lower()
        if ext not in IMG_EXT:
            push("不是图片文件")
            continue
        key = sub + "\0" + fn
        if key in seen:
            continue
        seen.add(key)
        planned.append({
            "path": path,
            "subfolder": sub,
            "filename": fn,
            "missing": not os.path.isfile(path),
        })
    present = [p for p in planned if not p["missing"]]
    gone_paths, why = _recycle_many([p["path"] for p in present])
    gone_norm = set(os.path.normcase(os.path.normpath(p)) for p in gone_paths)
    recycled = []
    failed = False
    for p in present:
        norm = os.path.normcase(os.path.normpath(p["path"]))
        if norm in gone_norm or not os.path.isfile(p["path"]):
            recycled.append(p)
        else:
            failed = True
    if failed:
        push(why or "移入回收站失败")
    for p in planned:
        if p["missing"]:
            recycled.append(p)
    _drop_index_files(root, [(p["subfolder"], p["filename"]) for p in recycled])
    for p in recycled:
        try:
            img_fav_drop(p["filename"], p["subfolder"])
        except Exception:
            pass
        try:
            img_rate_drop(p["filename"], p["subfolder"])
        except Exception:
            pass
    out = [{"filename": p["filename"], "subfolder": p["subfolder"]} for p in recycled]
    if not recycled:
        return {
            "ok": False,
            "error": (errors[0] if errors else "删除失败"),
            "recycled": 0,
            "items": [],
            "errors": errors[:8],
        }
    return {
        "ok": True,
        "recycled": len(out),
        "items": out,
        "errors": errors[:8],
        "error": errors[0] if errors else "",
    }


def _decode_bytes(b):
    if b is None:
        return ""
    if isinstance(b, str):
        return b
    try:
        return b.decode("utf-8")
    except Exception:
        return b.decode("latin-1", errors="replace")


def _parse_text_chunk(ctype, data):
    if not data:
        return None, ""
    if ctype == b"tEXt":
        nul = data.find(b"\0")
        if nul < 0:
            return None, ""
        return _decode_bytes(data[:nul]), _decode_bytes(data[nul + 1:])
    if ctype == b"zTXt":
        nul = data.find(b"\0")
        if nul < 0 or nul + 2 > len(data):
            return None, ""
        try:
            raw = zlib.decompress(data[nul + 2:])
        except Exception:
            return _decode_bytes(data[:nul]), ""
        return _decode_bytes(data[:nul]), _decode_bytes(raw)
    if ctype == b"iTXt":
        nul = data.find(b"\0")
        if nul < 0 or nul + 3 > len(data):
            return None, ""
        key = _decode_bytes(data[:nul])
        rest = data[nul + 1:]
        flag = rest[0]
        rest = rest[2:]
        nul2 = rest.find(b"\0")
        if nul2 < 0:
            return key, ""
        rest = rest[nul2 + 1:]
        nul3 = rest.find(b"\0")
        if nul3 < 0:
            return key, ""
        text_b = rest[nul3 + 1:]
        if flag:
            try:
                text_b = zlib.decompress(text_b)
            except Exception:
                return key, ""
        return key, _decode_bytes(text_b)
    return None, ""


def read_png_text(path):
    """只读 PNG 文本块，跳过 IDAT 像素。非 PNG 返回空 dict。"""
    out = {}
    try:
        with open(path, "rb") as f:
            sig = f.read(8)
            if sig != b"\x89PNG\r\n\x1a\n":
                return out
            while True:
                hdr = f.read(8)
                if len(hdr) < 8:
                    break
                length = struct.unpack(">I", hdr[:4])[0]
                ctype = hdr[4:8]
                if ctype == b"IEND":
                    break
                if ctype in (b"tEXt", b"iTXt", b"zTXt"):
                    if length > MAX_TEXT_CHUNK:
                        f.seek(length + 4, 1)
                        continue
                    data = f.read(length)
                    f.read(4)
                    key, val = _parse_text_chunk(ctype, data)
                    if key and key not in out:
                        out[key] = val
                else:
                    f.seek(length + 4, 1)
    except Exception:
        return out
    return out


def _as_obj(v):
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, (bytes, bytearray)):
        v = _decode_bytes(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            o = json.loads(s)
        except Exception:
            return None
        if isinstance(o, str):
            try:
                o = json.loads(o)
            except Exception:
                return o
        return o
    return None


def is_link(v):
    if not isinstance(v, (list, tuple)) or len(v) < 2:
        return False
    if isinstance(v[0], (list, dict)):
        return False
    if len(v) == 2 and isinstance(v[1], str) and not str(v[1]).isdigit():
        return False
    return isinstance(v[0], (str, int)) and isinstance(v[1], (int, float))


def get_node(prompt, nid):
    if not prompt or not isinstance(prompt, dict):
        return None
    s = str(nid)
    n = prompt.get(s)
    if n is None:
        try:
            n = prompt.get(int(s))
        except (TypeError, ValueError):
            n = None
    return n if isinstance(n, dict) else None


def is_sampler(ct):
    if not ct:
        return False
    cl = ct.replace(" ", "").lower()
    if "ksamplerselect" in cl or cl in ("samplerstate", "samplernames"):
        return False
    if "ksampler" in cl:
        return True
    if cl in ("samplercustom", "samplercustomadvanced"):
        return True
    if "sampler" in cl and "custom" in cl and "select" not in cl:
        return True
    return False


def is_save_image(ct):
    if not ct:
        return False
    cl = ct.replace(" ", "").lower()
    if "preview" in cl:
        return False
    if "saveimage" in cl or cl in ("imagesave", "easyimagesaver"):
        return True
    return False


def is_clip_encode(ct):
    if not ct:
        return False
    n = ct.replace(" ", "").lower()
    if "clipsetlastlayer" in n:
        return False
    if "cliptextencode" in n:
        return True
    if "textencode" in n and "clip" in n:
        return True
    return False


def is_any_switch(ct):
    n = (ct or "").replace(" ", "").lower()
    return "anyswitch" in n


def is_show_through(ct):
    if not ct:
        return False
    if ct in SHOW_THROUGH_TYPES:
        return True
    n = ct.replace(" ", "").lower()
    return "showanything" in n or n in ("showtext|pysssss", "previewany")


def _is_prompt_like(s):
    if not isinstance(s, str):
        return False
    t = s.strip()
    if len(t) < 16:
        return False
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        return False
    if "<|" in t and "|>" in t:
        return False
    low = t.lower()
    if low.endswith((".gguf", ".safetensors", ".ckpt", ".pt", ".sft")):
        return False
    if low in ("cuda", "cpu", "randomize", "fixed", "enable", "disable"):
        return False
    if "," in t or "@" in t or "1girl" in low or "masterpiece" in low or "score_" in low:
        return True
    if t.count(" ") >= 4 and len(t) >= 40:
        return True
    return False


def _captured_output_text(ctx, nid, inputs):
    """节点执行后写回的字：text_0 / widgets 里的字符串列表。不认名叫什么。"""
    numbered = []
    for k, v in (inputs or {}).items():
        ks = str(k)
        if not ks.startswith("text_"):
            continue
        suffix = ks[5:]
        if suffix.isdigit() and isinstance(v, str) and v.strip():
            numbered.append((int(suffix), v.strip()))
    numbered.sort()
    parts = [t for _i, t in numbered]
    if not parts:
        wn = (ctx.get("wf_index") or {}).get(str(nid)) or {}
        wv = wn.get("widgets_values") or []
        blob = wv[0] if wv else None
        if isinstance(blob, list):
            parts = [str(x).strip() for x in blob if isinstance(x, str) and str(x).strip()]
        elif isinstance(blob, str) and _is_prompt_like(blob):
            parts = [blob.strip()]
    text = "\n".join(parts).strip()
    return text if text else ""


def _harvest_prompt_widgets(inputs):
    best = ""
    for k, v in (inputs or {}).items():
        ks = str(k)
        kl = ks.lower()
        if kl in SKIP_STRING_WALK_KEYS or kl in JUNK_STRING_KEYS or ks.startswith("text_"):
            continue
        if is_link(v) or not isinstance(v, str):
            continue
        s = v.strip()
        if not s or ("<|" in s and "|>" in s):
            continue
        if ks in STRING_SOURCE_KEYS:
            if len(s) < 8 and not _is_prompt_like(s):
                continue
        elif not _is_prompt_like(s):
            continue
        if len(s) > len(best):
            best = s
    return best


def _resolve_unknown_string(ctx, nid, n, inputs, hops, seen, item):
    """不认识的节点：有写回的输出就用；否则跟 STRING 连线；再收能读到的提示词字符串。"""
    captured = _captured_output_text(ctx, nid, inputs)
    if captured and _is_prompt_like(captured):
        return captured, [item]
    for key in STRING_SOURCE_KEYS:
        if key in inputs and is_link(inputs[key]):
            t, p = resolve_string(ctx, inputs[key], hops + 1, seen)
            if t and str(t).strip():
                return t, [item] + p
    for k, v in inputs.items():
        kl = str(k).lower()
        if kl in SKIP_STRING_WALK_KEYS or str(k).startswith("text_"):
            continue
        if is_link(v):
            t, p = resolve_string(ctx, v, hops + 1, seen)
            if t and str(t).strip():
                return t, [item] + p
    harvested = _harvest_prompt_widgets(inputs)
    if harvested:
        return harvested, [item]
    if captured:
        return captured, [item]
    wv = n.get("widgets_values") or []
    if wv and isinstance(wv[0], str) and wv[0].strip() and _is_prompt_like(wv[0]):
        return wv[0].strip(), [item]
    return "", [item]


def is_bool_switch(ct):
    n = (ct or "").replace(" ", "").lower()
    return n in ("comfyswitchnode", "switchboolean", "ifelse") or (
        "switch" in n and "any" not in n and "context" not in n
    )


def _node_title(ctx, nid, ct):
    wf = ctx.get("wf_index") or {}
    wn = wf.get(str(nid)) or {}
    t = wn.get("title") or ""
    if t:
        return str(t)
    meta = (get_node(ctx.get("prompt"), nid) or {}).get("_meta") or {}
    t = meta.get("title") or ""
    return str(t) if t else (ct or "node")


def _path_item(ctx, nid, ct):
    return "%s#%s" % (_node_title(ctx, nid, ct), nid)


def workflow_index(workflow):
    idx = {}
    if not isinstance(workflow, dict):
        return idx
    for n in workflow.get("nodes") or []:
        if isinstance(n, dict) and n.get("id") is not None:
            idx[str(n.get("id"))] = n
    return idx


def workflow_to_prompt(workflow):
    """把画布 workflow 收成接近 API prompt 的图。静音节点丢掉；bypass 留下。"""
    if not isinstance(workflow, dict):
        return {}
    links_by_id = {}
    for lk in workflow.get("links") or []:
        if isinstance(lk, (list, tuple)) and len(lk) >= 5:
            links_by_id[lk[0]] = lk
        elif isinstance(lk, dict) and lk.get("id") is not None:
            links_by_id[lk["id"]] = [
                lk.get("id"), lk.get("origin_id") or lk.get("from_node"),
                lk.get("origin_slot") or lk.get("from_slot") or 0,
                lk.get("target_id"), lk.get("target_slot") or 0, lk.get("type"),
            ]
    out = {}
    for n in workflow.get("nodes") or []:
        if not isinstance(n, dict):
            continue
        mode = n.get("mode", 0) or 0
        if mode == 2:
            continue
        nid = str(n.get("id"))
        ct = n.get("type") or n.get("class_type") or ""
        inputs = {}
        wv = list(n.get("widgets_values") or [])
        wi = 0
        for inp in n.get("inputs") or []:
            if not isinstance(inp, dict):
                continue
            name = inp.get("name")
            if not name:
                continue
            link_id = inp.get("link")
            if link_id is not None:
                lk = links_by_id.get(link_id)
                if lk:
                    inputs[name] = [str(lk[1]), int(lk[2] or 0)]
                continue
            if inp.get("widget") is not None and wi < len(wv):
                val = wv[wi]
                wi += 1
                if isinstance(val, list) and name in ("seed", "noise_seed") and val:
                    val = val[0]
                inputs[name] = val
        if is_clip_encode(ct) and "text" not in inputs and wv and isinstance(wv[0], str):
            inputs["text"] = wv[0]
        if is_save_image(ct) and "filename_prefix" not in inputs and wv:
            if isinstance(wv[0], str):
                inputs["filename_prefix"] = wv[0]
        if ct in PASSTHROUGH_TYPES and len(wv) >= 3 and wv[2]:
            inputs["_written_output"] = wv[2]
        out[nid] = {
            "class_type": ct,
            "inputs": inputs,
            "mode": mode,
            "widgets_values": wv,
            "_meta": {"title": n.get("title") or ct},
        }
    return out


def _passthrough_written(ctx, nid):
    n = get_node(ctx.get("prompt"), nid) or {}
    inp = n.get("inputs") or {}
    w = inp.get("_written_output")
    if isinstance(w, str) and w.strip():
        return w
    wn = (ctx.get("wf_index") or {}).get(str(nid)) or {}
    wv = wn.get("widgets_values") or []
    if len(wv) >= 3 and isinstance(wv[2], str) and wv[2].strip():
        return wv[2]
    return ""


def _as_str(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float, bool)):
        return str(v)
    if isinstance(v, (list, dict)):
        try:
            return json.dumps(v, ensure_ascii=False)
        except Exception:
            return str(v)
    return str(v)


def _composer_kwargs(ctx, inputs, hops, seen):
    kw = {}
    for k, v in (inputs or {}).items():
        if is_link(v):
            t, _p = resolve_string(ctx, v, hops + 1, seen)
            kw[k] = t
        else:
            kw[k] = v
    return kw


def _compose_anima(kw):
    args = {}
    for k in APC_KEYS:
        if k in kw and kw[k] is not None:
            args[k] = kw[k]
    if "model_mode" in args:
        mm = args["model_mode"]
        if isinstance(mm, str):
            args["model_mode"] = _MODE_NAME.get(mm.strip().lower(), 0)
        else:
            try:
                args["model_mode"] = int(mm)
            except Exception:
                args["model_mode"] = 0
    try:
        from .anima_prompt_composer import AnimaPromptCreator
        return (AnimaPromptCreator().compose(**args) or ("",))[0] or ""
    except Exception:
        parts = []
        for k in ("artist_tags", "character_tags", "series_tags", "general_tags", "quality_tags", "count_tags"):
            s = _as_str(args.get(k, "")).strip()
            if s:
                parts.append(s)
        return ", ".join(parts)


def _compose_newbie(kw):
    try:
        from .newbie_prompt_composer import NewbiePromptCreator
        return (NewbiePromptCreator().compose(**kw) or ("",))[0] or ""
    except Exception:
        return _as_str(kw.get("nb_artists") or "")


def resolve_string(ctx, value, hops, seen):
    if hops > MAX_HOPS:
        return "", []
    if not is_link(value):
        if value is None:
            return "", []
        return _as_str(value), []
    nid = str(value[0])
    if nid in seen:
        return "", []
    seen = seen | {nid}
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return "", []
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    item = _path_item(ctx, nid, ct)
    mode = n.get("mode", 0) or 0
    if mode == 4:
        for k, v in inputs.items():
            if str(k).lower() in SKIP_GRAPH_KEYS:
                continue
            if is_link(v):
                t, p = resolve_string(ctx, v, hops + 1, seen)
                if t:
                    return t, [item] + p
        return "", [item]

    if ct in REROUTE_TYPES:
        for v in inputs.values():
            if is_link(v):
                t, p = resolve_string(ctx, v, hops + 1, seen)
                return t, [item] + p
        return "", [item]

    if is_any_switch(ct):
        keys = sorted([k for k in inputs if str(k).startswith("any")], key=lambda k: k)
        keys += [k for k in inputs if k not in keys]
        for k in keys:
            if str(k).lower() in SKIP_GRAPH_KEYS:
                continue
            t, p = resolve_string(ctx, inputs[k], hops + 1, seen)
            if t and str(t).strip():
                return t, [item] + p
        return "", [item]

    if is_bool_switch(ct) and ("on_true" in inputs or "on_false" in inputs):
        sw = inputs.get("switch")
        if is_link(sw):
            sw_s, _p = resolve_string(ctx, sw, hops + 1, seen)
            truthy = str(sw_s).strip().lower() in ("1", "true", "yes", "on")
        else:
            truthy = sw in (True, 1, "1", "true", "True")
        branch = "on_true" if truthy else "on_false"
        if branch in inputs:
            t, p = resolve_string(ctx, inputs[branch], hops + 1, seen)
            return t, [item] + p
        return "", [item]

    if ct in PASSTHROUGH_TYPES:
        written = _passthrough_written(ctx, nid)
        if written:
            return written, [item]
        use_in = inputs.get("use_input_text", True)
        if use_in in (False, 0, "false", "False"):
            tval = inputs.get("prompt_text") or ""
            if is_link(tval):
                t, p = resolve_string(ctx, tval, hops + 1, seen)
                return t, [item] + p
            return _as_str(tval), [item]
        tval = inputs.get("text")
        if is_link(tval):
            t, p = resolve_string(ctx, tval, hops + 1, seen)
            return t, [item] + p
        if isinstance(tval, str) and tval.strip():
            return tval, [item]
        return _as_str(inputs.get("prompt_text") or ""), [item]

    if ct == "AnimaPromptCreator":
        kw = _composer_kwargs(ctx, inputs, hops, seen)
        text = _compose_anima(kw)
        return text, [item]

    if ct == "NewbiePromptCreator":
        kw = _composer_kwargs(ctx, inputs, hops, seen)
        text = _compose_newbie(kw)
        return text, [item]

    if is_clip_encode(ct):
        texts = []
        path = [item]
        for key in ("text", "text_g", "text_l", "clip_l", "t5xxl", "prompt"):
            if key not in inputs:
                continue
            raw = inputs[key]
            if is_link(raw):
                t, p = resolve_string(ctx, raw, hops + 1, seen)
                if t:
                    texts.append(t)
                    path.extend(p)
            elif isinstance(raw, str) and raw.strip():
                texts.append(raw)
        uniq = []
        for t in texts:
            if t and t not in uniq:
                uniq.append(t)
        return ", ".join(uniq), path

    if ct in CONCAT_TYPES:
        sep = inputs.get("separator", inputs.get("delimiter", ", "))
        if isinstance(sep, str):
            sep = SEP_MAP.get(sep, sep)
        else:
            sep = ", "
        parts = []
        path = [item]
        for k, v in inputs.items():
            if k in ("separator", "delimiter"):
                continue
            t, p = resolve_string(ctx, v, hops + 1, seen)
            if t and str(t).strip():
                parts.append(t)
                path.extend(p)
        return str(sep).join(parts), path

    if ct in PRIMITIVE_TYPES:
        for key in ("value", "string", "text", "STRING", "prompt"):
            if key in inputs:
                t, p = resolve_string(ctx, inputs[key], hops + 1, seen)
                return t, [item] + p
        wv = n.get("widgets_values") or []
        if wv and isinstance(wv[0], str):
            return wv[0], [item]
        return "", [item]

    # 不认识的节点也走同一套：写回的输出 → STRING 连线 → 能读到的提示词字符串
    return _resolve_unknown_string(ctx, nid, n, inputs, hops, seen, item)


def collect_cond_texts(ctx, value, seen):
    out = []
    if not is_link(value):
        if isinstance(value, str) and value.strip():
            out.append({"text": value, "path": []})
        return out
    nid = str(value[0])
    if nid in seen:
        return []
    seen = seen | {nid}
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return []
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    mode = n.get("mode", 0) or 0
    if mode == 4:
        for k, v in inputs.items():
            if str(k).lower() in SKIP_GRAPH_KEYS or str(k).lower() == "negative":
                continue
            if is_link(v):
                out.extend(collect_cond_texts(ctx, v, seen))
        return out

    leaf = (
        is_clip_encode(ct) or ct in PASSTHROUGH_TYPES or ct in COMPOSER_TYPES
        or ct in CONCAT_TYPES or ct in PRIMITIVE_TYPES
    )
    if leaf:
        text, path = resolve_string(ctx, [nid, 0], 0, set())
        if text and str(text).strip():
            return [{"text": text, "path": path}]
        return []

    ordered = [k for k in COND_PREF if k in inputs]
    ordered += [k for k in inputs if k not in ordered]
    for k in ordered:
        if str(k).lower() in ("negative", "uncond"):
            continue
        if str(k).lower() in SKIP_GRAPH_KEYS:
            continue
        v = inputs[k]
        if is_link(v):
            out.extend(collect_cond_texts(ctx, v, seen))
    return out


def walk_to_sampler(prompt, nid, seen):
    sid = str(nid)
    if sid in seen:
        return None
    seen.add(sid)
    n = get_node(prompt, sid)
    if not n:
        return None
    ct = n.get("class_type") or ""
    mode = n.get("mode", 0) or 0
    if is_sampler(ct) and mode != 4:
        return sid
    inputs = n.get("inputs") or {}
    keys = [k for k in WALK_PREF if k in inputs]
    keys += [k for k in inputs if k not in keys and str(k).lower() not in SKIP_GRAPH_KEYS]
    for k in keys:
        v = inputs[k]
        if is_link(v):
            hit = walk_to_sampler(prompt, v[0], seen)
            if hit:
                return hit
    return None


def _prefix_score(prefix, filename):
    prefix = (prefix or "ComfyUI").replace("\\", "/")
    base = os.path.splitext(os.path.basename(filename or ""))[0]
    pref_base = os.path.basename(prefix) or "ComfyUI"
    if base.startswith(pref_base + "_") or base.startswith(pref_base):
        return 2
    if pref_base and pref_base in base:
        return 1
    return 0


def _sampler_positive(ctx, sampler_id):
    n = get_node(ctx.get("prompt"), sampler_id) or {}
    inputs = n.get("inputs") or {}
    pos = inputs.get("positive")
    if pos is None:
        pos = inputs.get("conditioning")
    if pos is None and "guider" in inputs:
        pos = inputs.get("guider")
    return pos


def _sampler_negative(ctx, sampler_id):
    n = get_node(ctx.get("prompt"), sampler_id) or {}
    inputs = n.get("inputs") or {}
    neg = inputs.get("negative")
    if neg is None:
        neg = inputs.get("uncond")
    return neg


def collect_neg_texts(ctx, value, seen):
    out = []
    if not is_link(value):
        if isinstance(value, str) and value.strip():
            out.append({"text": value, "path": []})
        return out
    nid = str(value[0])
    if nid in seen:
        return []
    seen = seen | {nid}
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return []
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    mode = n.get("mode", 0) or 0
    if mode == 4:
        for k, v in inputs.items():
            if str(k).lower() in SKIP_GRAPH_KEYS and str(k).lower() not in ("negative", "uncond"):
                continue
            if is_link(v):
                out.extend(collect_neg_texts(ctx, v, seen))
        return out
    leaf = (
        is_clip_encode(ct) or ct in PASSTHROUGH_TYPES or ct in COMPOSER_TYPES
        or ct in CONCAT_TYPES or ct in PRIMITIVE_TYPES
    )
    if leaf:
        text, path = resolve_string(ctx, [nid, 0], 0, set())
        if text and str(text).strip():
            return [{"text": text, "path": path}]
        return []
    ordered = [k for k in COND_PREF if k in inputs]
    ordered += [k for k in inputs if k not in ordered]
    for k in ordered:
        if str(k).lower() in SKIP_GRAPH_KEYS and str(k).lower() not in ("negative", "uncond"):
            continue
        v = inputs[k]
        if is_link(v):
            out.extend(collect_neg_texts(ctx, v, seen))
    return out


def _parse_a1111_negative(params):
    if not params or not isinstance(params, str):
        return ""
    start = params.find("Negative prompt:")
    if start < 0:
        return ""
    body = params[start + len("Negative prompt:"):]
    cut = body.find("\nSteps:")
    if cut < 0:
        cut = body.find("\nStep:")
    if cut >= 0:
        body = body[:cut]
    return body.strip()


def _negative_from_sampler(ctx, sampler_id):
    if not sampler_id:
        return ""
    neg = _sampler_negative(ctx, sampler_id)
    if neg is None:
        return ""
    texts, _paths = _join_sources(collect_neg_texts(ctx, neg, set()))
    return texts[0] if len(texts) == 1 else ", ".join(texts)


def _join_sources(sources):
    texts = []
    paths = []
    for s in sources:
        t = (s.get("text") or "").strip()
        if t and t not in texts:
            texts.append(t)
        p = s.get("path") or []
        if p:
            paths.append(p)
    return texts, paths


def extract_from_prompt(prompt, workflow, filename=""):
    wf_idx = workflow_index(workflow) if workflow else {}
    ctx = {"prompt": prompt, "wf_index": wf_idx, "workflow": workflow}
    saves = []
    samplers = []
    for nid, n in (prompt or {}).items():
        if not isinstance(n, dict):
            continue
        ct = n.get("class_type") or ""
        if is_save_image(ct):
            saves.append(str(nid))
        if is_sampler(ct) and (n.get("mode", 0) or 0) != 4:
            samplers.append(str(nid))

    candidates = []
    for sid in saves:
        n = get_node(prompt, sid) or {}
        prefix = (n.get("inputs") or {}).get("filename_prefix") or "ComfyUI"
        if is_link(prefix):
            prefix, _p = resolve_string(ctx, prefix, 0, set())
        sampler_id = walk_to_sampler(prompt, sid, set())
        sources = []
        if sampler_id:
            pos = _sampler_positive(ctx, sampler_id)
            if pos is not None:
                sources = collect_cond_texts(ctx, pos, set())
        texts, paths = _join_sources(sources)
        text = texts[0] if len(texts) == 1 else ", ".join(texts)
        path_labels = []
        save_item = _path_item(ctx, sid, n.get("class_type") or "SaveImage")
        samp_item = ""
        if sampler_id:
            sn = get_node(prompt, sampler_id) or {}
            samp_item = _path_item(ctx, sampler_id, sn.get("class_type") or "KSampler")
        if paths:
            for p in paths:
                chain = [save_item]
                if samp_item:
                    chain.append(samp_item)
                chain.extend(p)
                path_labels.append(" ← ".join(chain))
        else:
            chain = [save_item]
            if samp_item:
                chain.append(samp_item)
            path_labels.append(" ← ".join(chain))
        candidates.append({
            "save_id": sid,
            "sampler_id": sampler_id,
            "prefix": _as_str(prefix),
            "text": text,
            "sources": sources,
            "path": path_labels[0] if path_labels else save_item,
            "paths": path_labels,
            "score": _prefix_score(prefix, filename),
        })

    picked = None
    ambiguous = False
    if candidates:
        if filename:
            best = max(c["score"] for c in candidates)
            ranked = [c for c in candidates if c["score"] == best]
            if best > 0:
                texts = {c["text"] for c in ranked}
                picked = ranked[0]
                ambiguous = len(texts) > 1
            else:
                texts = {c["text"] for c in candidates}
                picked = candidates[0]
                ambiguous = len(texts) > 1
        else:
            texts = {c["text"] for c in candidates}
            picked = candidates[0]
            ambiguous = len(texts) > 1

    if (not picked or not (picked.get("text") or "").strip()) and samplers:
        sid = samplers[-1]
        pos = _sampler_positive(ctx, sid)
        sources = collect_cond_texts(ctx, pos, set()) if pos is not None else []
        texts, paths = _join_sources(sources)
        text = ", ".join(texts)
        sn = get_node(prompt, sid) or {}
        samp_item = _path_item(ctx, sid, sn.get("class_type") or "KSampler")
        path_labels = []
        for p in paths or [[]]:
            path_labels.append(" ← ".join([samp_item] + p))
        if text.strip():
            picked = {
                "text": text, "sources": sources, "path": path_labels[0] if path_labels else samp_item,
                "paths": path_labels, "score": 0, "sampler_id": sid,
            }
            ambiguous = False

    if not picked:
        return None
    neg_text = ""
    sid = picked.get("sampler_id")
    if sid:
        try:
            neg_text = _negative_from_sampler(ctx, sid)
        except Exception:
            neg_text = ""
    return {
        "text": picked.get("text") or "",
        "negative": neg_text,
        "path": picked.get("path") or "",
        "paths": picked.get("paths") or [],
        "ambiguous": ambiguous,
        "sources": picked.get("sources") or [],
        "source": "prompt",
        "sampler_id": sid,
    }


def graph_signature(prompt):
    if not isinstance(prompt, dict) or not prompt:
        return ""
    parts = []
    for nid in sorted(prompt.keys(), key=lambda x: str(x)):
        n = prompt.get(nid)
        if isinstance(n, dict):
            parts.append("%s=%s" % (nid, n.get("class_type") or ""))
    raw = "|".join(parts)
    h = 2166136261
    for ch in raw:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return "%d_%x" % (len(parts), h)


def _skip_text_candidate(ct):
    n = (ct or "").replace(" ", "").lower()
    if not n:
        return True
    keys = (
        "saveimage", "imagesave", "previewimage", "vaeencode", "vaedecode", "vaeloader",
        "unetloader", "cliploader", "clipsetlast", "emptylatent", "loadimage", "ksampler",
        "loraloader", "repeatlatent", "imagecomparer", "cleangpu", "comfyswitch",
        "primitiveint", "primitiveboolean", "primitivefloat", "easyfloat",
        "imagescale", "checkpointloader", "controlnet", "ipadapter",
        "ttresolution",
    )
    if any(k in n for k in keys):
        return True
    return n in ("float", "int", "boolean", "seed(rgthree)")


def list_text_candidates(prompt, workflow, limit=24):
    """列出这张图工作流里能读出提示词的节点，给用户自己指定正面来源。"""
    if not isinstance(prompt, dict) or not prompt:
        return []
    wf_idx = workflow_index(workflow) if workflow else {}
    ctx = {"prompt": prompt, "wf_index": wf_idx, "workflow": workflow}
    neg_ids = set()
    neg_texts = set()
    for _nid, n in prompt.items():
        if not isinstance(n, dict):
            continue
        if not is_sampler(n.get("class_type") or ""):
            continue
        if (n.get("mode", 0) or 0) == 4:
            continue
        neg = (n.get("inputs") or {}).get("negative")
        if is_link(neg):
            neg_ids.add(str(neg[0]))
            t, _p = resolve_string(ctx, neg, 0, set())
            if t and str(t).strip():
                neg_texts.add(str(t).strip())
    out = []
    for nid, n in prompt.items():
        if not isinstance(n, dict):
            continue
        ct = n.get("class_type") or ""
        if _skip_text_candidate(ct):
            continue
        sid = str(nid)
        if sid in neg_ids:
            continue
        try:
            text, _path = resolve_string(ctx, [sid, 0], 0, set())
        except Exception:
            continue
        text = (text or "").strip()
        if not _is_prompt_like(text):
            continue
        if text in neg_texts:
            continue
        tags = split_tags(text)
        artists = [t for t in tags if looks_artist(t)]
        preview = " ".join(text.split())
        if len(preview) > 88:
            preview = preview[:88] + "…"
        out.append({
            "id": sid,
            "title": _node_title(ctx, sid, ct),
            "class_type": ct,
            "text": text,
            "tags": tags,
            "artists": artists,
            "preview": preview,
            "path": _path_item(ctx, sid, ct),
        })

    def rank(c):
        cl = (c.get("class_type") or "").replace(" ", "").lower()
        if "cliptextencode" in cl:
            return 0
        if "showtext" in cl or "showanything" in cl:
            return 1
        if "passthrough" in cl:
            return 2
        if "concat" in cl:
            return 3
        return 4

    out.sort(key=lambda c: (rank(c), -len(c.get("text") or ""), str(c.get("id") or "")))
    return out[:limit]


def _fmt_scalar(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e12:
            return str(int(v))
        s = ("%.4f" % v).rstrip("0").rstrip(".")
        return s
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return ""
        try:
            if s[0] in "0123456789.-" and any(ch.isdigit() for ch in s):
                if "." in s or "e" in s.lower():
                    return _fmt_scalar(float(s))
                if s.lstrip("-").isdigit():
                    return str(int(s))
        except Exception:
            pass
        return s
    return ""


def png_size(path):
    try:
        with open(path, "rb") as f:
            if f.read(8) != b"\x89PNG\r\n\x1a\n":
                return None, None
            hdr = f.read(8)
            if len(hdr) < 8:
                return None, None
            length = struct.unpack(">I", hdr[:4])[0]
            ctype = hdr[4:8]
            if ctype != b"IHDR" or length < 8:
                return None, None
            data = f.read(8)
            w, h = struct.unpack(">II", data)
            if w > 0 and h > 0:
                return int(w), int(h)
    except Exception:
        return None, None
    return None, None


SCALAR_LEAF_KEYS = (
    "seed", "noise_seed", "value", "Number", "number", "float", "int",
    "sampler_name", "scheduler", "steps", "cfg", "denoise",
)


def resolve_scalar(ctx, value, hops, seen):
    if hops > MAX_HOPS:
        return ""
    if not is_link(value):
        return _fmt_scalar(value)
    nid = str(value[0])
    if nid in seen:
        return ""
    seen = seen | {nid}
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return ""
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    mode = n.get("mode", 0) or 0
    if mode == 4:
        for k, v in inputs.items():
            if str(k).lower() in SKIP_GRAPH_KEYS:
                continue
            if is_link(v):
                t = resolve_scalar(ctx, v, hops + 1, seen)
                if t:
                    return t
        return ""

    if ct in REROUTE_TYPES:
        for v in inputs.values():
            if is_link(v):
                return resolve_scalar(ctx, v, hops + 1, seen)
        return ""

    if is_show_through(ct):
        for key in ("anything", "source", "input", "any", "value"):
            if key in inputs and is_link(inputs[key]):
                t = resolve_scalar(ctx, inputs[key], hops + 1, seen)
                if t:
                    return t
        return ""

    if is_any_switch(ct):
        keys = sorted([k for k in inputs if str(k).startswith("any")], key=lambda k: k)
        keys += [k for k in inputs if k not in keys]
        for k in keys:
            if str(k).lower() in SKIP_GRAPH_KEYS:
                continue
            t = resolve_scalar(ctx, inputs[k], hops + 1, seen)
            if t:
                return t
        return ""

    if is_bool_switch(ct) and ("on_true" in inputs or "on_false" in inputs):
        sw = inputs.get("switch")
        if is_link(sw):
            sw_s = resolve_scalar(ctx, sw, hops + 1, seen)
            truthy = str(sw_s).strip().lower() in ("1", "true", "yes", "on")
        else:
            truthy = sw in (True, 1, "1", "true", "True")
        branch = "on_true" if truthy else "on_false"
        if branch in inputs:
            return resolve_scalar(ctx, inputs[branch], hops + 1, seen)
        return ""

    for key in SCALAR_LEAF_KEYS:
        if key not in inputs:
            continue
        raw = inputs[key]
        if is_link(raw):
            t = resolve_scalar(ctx, raw, hops + 1, seen)
            if t:
                return t
        else:
            t = _fmt_scalar(raw)
            if t:
                return t
    wv = n.get("widgets_values") or []
    if wv and not isinstance(wv[0], (list, dict)):
        t = _fmt_scalar(wv[0])
        if t:
            return t
    return ""


LOADER_NAME_KEYS = ("unet_name", "ckpt_name", "model_name")
MODEL_FOLLOW_KEYS = ("model", "unet", "ckpt")


def _model_basename(s):
    s = str(s or "").replace("\\", "/").strip()
    if not s:
        return ""
    return os.path.basename(s)


def resolve_model_name(ctx, value, hops, seen):
    if hops > MAX_HOPS:
        return ""
    if not is_link(value):
        t = _fmt_scalar(value)
        low = t.lower()
        if low.endswith((".safetensors", ".ckpt", ".pt", ".pth", ".gguf", ".sft")):
            return _model_basename(t)
        return ""
    nid = str(value[0])
    if nid in seen:
        return ""
    seen = seen | {nid}
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return ""
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    mode = n.get("mode", 0) or 0
    if mode == 4:
        for k in MODEL_FOLLOW_KEYS:
            if k in inputs and is_link(inputs[k]):
                t = resolve_model_name(ctx, inputs[k], hops + 1, seen)
                if t:
                    return t
        return ""
    if ct in REROUTE_TYPES:
        for v in inputs.values():
            if is_link(v):
                return resolve_model_name(ctx, v, hops + 1, seen)
        return ""
    if is_bool_switch(ct) and ("on_true" in inputs or "on_false" in inputs):
        sw = inputs.get("switch")
        if is_link(sw):
            sw_s = resolve_scalar(ctx, sw, hops + 1, seen)
            truthy = str(sw_s).strip().lower() in ("1", "true", "yes", "on")
        else:
            truthy = sw in (True, 1, "1", "true", "True")
        branch = "on_true" if truthy else "on_false"
        if branch in inputs:
            return resolve_model_name(ctx, inputs[branch], hops + 1, seen)
        return ""
    if is_any_switch(ct):
        keys = sorted([k for k in inputs if str(k).startswith("any")], key=lambda k: k)
        keys += [k for k in MODEL_FOLLOW_KEYS if k in inputs]
        for k in keys:
            t = resolve_model_name(ctx, inputs[k], hops + 1, seen)
            if t:
                return t
        return ""
    for k in LOADER_NAME_KEYS:
        if k not in inputs:
            continue
        raw = inputs[k]
        if is_link(raw):
            t = resolve_scalar(ctx, raw, hops + 1, seen)
        else:
            t = _fmt_scalar(raw)
        name = _model_basename(t)
        if name:
            return name
    for k in MODEL_FOLLOW_KEYS:
        if k in inputs and is_link(inputs[k]):
            t = resolve_model_name(ctx, inputs[k], hops + 1, seen)
            if t:
                return t
    return ""


_LORA_TAG_RE = re.compile(r"<lora:([^:>]+):([^:>]+)(?::([^:>]+))?>", re.I)
_LORA_SKIP_NAMES = {"none", "none.safetensors", "undefined"}
_LORA_WALK_KEYS = ("model", "unet", "ckpt", "clip", "lora_stack")


def _lora_num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _fmt_lora_num(n):
    return ("%.2f" % float(n)).rstrip("0").rstrip(".") or "0"


def _lora_display(name, model_s, clip_s=None):
    if not isinstance(name, str):
        return ""
    base = _model_basename(name)
    if not base or base.lower() in _LORA_SKIP_NAMES:
        return ""
    ms = _lora_num(model_s)
    cs = _lora_num(clip_s) if clip_s is not None else None
    if ms is None:
        ms = 1.0
    if abs(ms) < 1e-8 and (cs is None or abs(cs) < 1e-8):
        return ""
    mtxt = _fmt_lora_num(ms)
    if cs is not None and abs(cs - ms) > 0.001:
        return "%s × %s / %s" % (base, mtxt, _fmt_lora_num(cs))
    return "%s × %s" % (base, mtxt)


def _append_lora(out, text):
    if text and text not in out:
        out.append(text)


def _unwrap_lora_list(raw):
    if isinstance(raw, dict) and "__value__" in raw:
        raw = raw.get("__value__")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
        if isinstance(raw, dict) and "__value__" in raw:
            raw = raw.get("__value__")
    return raw if isinstance(raw, list) else None


def _lora_from_dict_item(item):
    if not isinstance(item, dict):
        return ""
    if "active" in item and not item.get("active"):
        return ""
    if item.get("on") is False:
        return ""
    name = item.get("name") or item.get("lora") or item.get("lora_name") or ""
    if not isinstance(name, str):
        return ""
    ms = item.get("strength", None)
    if ms is None:
        ms = item.get("strength_model", item.get("model_strength", item.get("modelStrength", 1)))
    cs = None
    for ck in ("clipStrength", "strengthTwo", "strength_clip", "clip_strength"):
        if ck in item:
            cs = item.get(ck)
            break
    return _lora_display(name, ms, cs)


def _loras_from_inputs(ct, inputs):
    out = []
    if not isinstance(inputs, dict):
        return out
    structured = False
    for key in ("loras", "lora_stack"):
        raw = _unwrap_lora_list(inputs.get(key))
        if raw is None:
            continue
        if not raw or isinstance(raw[0], (dict, list, tuple)):
            structured = True
            for item in raw:
                if isinstance(item, dict):
                    _append_lora(out, _lora_from_dict_item(item))
                elif isinstance(item, (list, tuple)) and item and isinstance(item[0], str):
                    ms = item[1] if len(item) > 1 else 1
                    cs = item[2] if len(item) > 2 else None
                    _append_lora(out, _lora_display(item[0], ms, cs))
    if structured:
        return out
    for v in inputs.values():
        if isinstance(v, dict) and any(x in v for x in ("lora", "lora_name", "name")):
            _append_lora(out, _lora_from_dict_item(v))
    if isinstance(inputs.get("lora_name"), str):
        cs = inputs.get("strength_clip") if "strength_clip" in inputs else None
        ms = inputs.get("strength_model", inputs.get("strength", inputs.get("lora_strength", 1)))
        _append_lora(out, _lora_display(inputs.get("lora_name"), ms, cs))
    for i in range(1, 17):
        key = "lora_name_%d" % i
        if key not in inputs:
            alt = "lora_%d" % i
            if isinstance(inputs.get(alt), str):
                key = alt
            else:
                continue
        raw = inputs.get(key)
        if not isinstance(raw, str):
            continue
        suf = str(i)
        ms = None
        for mk in (
            "strength_model_%s" % suf, "model_str_%s" % suf, "strength_%s" % suf,
            "lora_model_strength_%s" % suf, "model_strength_%s" % suf,
        ):
            if mk in inputs:
                ms = inputs.get(mk)
                break
        cs = None
        for ck in (
            "strength_clip_%s" % suf, "clip_str_%s" % suf,
            "lora_clip_strength_%s" % suf, "clip_strength_%s" % suf,
        ):
            if ck in inputs:
                cs = inputs.get(ck)
                break
        _append_lora(out, _lora_display(raw, 1 if ms is None else ms, cs))
    low = (ct or "").replace(" ", "").lower()
    if not out and "textloader" in low:
        text = inputs.get("lora_syntax") or inputs.get("text") or ""
        if isinstance(text, str):
            for m in _LORA_TAG_RE.finditer(text):
                _append_lora(out, _lora_display(m.group(1).strip(), m.group(2), m.group(3)))
    return out


def _loras_from_tag_text(text):
    out = []
    if not isinstance(text, str) or "<lora:" not in text.lower():
        return out
    for m in _LORA_TAG_RE.finditer(text):
        _append_lora(out, _lora_display(m.group(1).strip(), m.group(2), m.group(3)))
    return out


def _collect_used_loras(ctx, value, hops, seen, out):
    if hops > MAX_HOPS or not is_link(value):
        return
    nid = str(value[0])
    if nid in seen:
        return
    seen.add(nid)
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return
    ct = n.get("class_type") or ""
    inputs = n.get("inputs") or {}
    if not isinstance(inputs, dict):
        inputs = {}
    mode = n.get("mode", 0) or 0
    if mode == 2:
        return
    if mode == 4:
        for k in _LORA_WALK_KEYS:
            if k in inputs and is_link(inputs[k]):
                _collect_used_loras(ctx, inputs[k], hops + 1, seen, out)
        return
    if ct in REROUTE_TYPES:
        for v in inputs.values():
            if is_link(v):
                _collect_used_loras(ctx, v, hops + 1, seen, out)
                return
        return
    if is_bool_switch(ct) and ("on_true" in inputs or "on_false" in inputs):
        sw = inputs.get("switch")
        if is_link(sw):
            sw_s = resolve_scalar(ctx, sw, hops + 1, set(seen))
            truthy = str(sw_s).strip().lower() in ("1", "true", "yes", "on")
        else:
            truthy = sw in (True, 1, "1", "true", "True")
        branch = "on_true" if truthy else "on_false"
        if branch in inputs:
            _collect_used_loras(ctx, inputs[branch], hops + 1, seen, out)
        return
    if is_any_switch(ct):
        keys = sorted([k for k in inputs if str(k).startswith("any")], key=lambda k: k)
        keys += [k for k in ("model", "unet", "ckpt") if k in inputs]
        for k in keys:
            if is_link(inputs.get(k)):
                _collect_used_loras(ctx, inputs[k], hops + 1, seen, out)
                return
        return
    low = ct.lower()
    if "lora" in low or "lycoris" in low or "lora_name" in inputs or "loras" in inputs:
        for lab in _loras_from_inputs(ct, inputs):
            _append_lora(out, lab)
    for k in _LORA_WALK_KEYS:
        if k in inputs and is_link(inputs[k]):
            _collect_used_loras(ctx, inputs[k], hops + 1, seen, out)


def _collect_positive_clip_loras(ctx, value, hops, seen, out):
    if hops > 8 or not is_link(value):
        return
    nid = str(value[0])
    mark = "cond:" + nid
    if mark in seen:
        return
    seen.add(mark)
    n = get_node(ctx.get("prompt"), nid)
    if not n:
        return
    inputs = n.get("inputs") or {}
    if not isinstance(inputs, dict):
        return
    if is_link(inputs.get("clip")):
        _collect_used_loras(ctx, inputs.get("clip"), 0, seen, out)
    for k, v in inputs.items():
        if k in ("clip", "model", "negative"):
            continue
        lk = str(k).lower()
        if is_link(v) and (
            lk in ("positive", "conditioning", "conditioning_to", "conditioning_from", "cond")
            or lk.startswith("conditioning")
        ):
            _collect_positive_clip_loras(ctx, v, hops + 1, seen, out)


def _used_loras_for_sampler(ctx, sampler_id):
    out = []
    n = get_node(ctx.get("prompt"), sampler_id) or {}
    inputs = n.get("inputs") or {}
    if not isinstance(inputs, dict):
        return out
    seen = set()
    if is_link(inputs.get("model")):
        _collect_used_loras(ctx, inputs.get("model"), 0, seen, out)
    if is_link(inputs.get("positive")):
        _collect_positive_clip_loras(ctx, inputs.get("positive"), 0, seen, out)
    return out


SAMPLER_PARAM_FIELDS = (
    ("seed", "种子"),
    ("noise_seed", "种子"),
    ("sampler_name", "采样器"),
    ("sampler", "采样器"),
    ("scheduler", "调度器"),
    ("steps", "步数"),
    ("cfg", "CFG"),
    ("denoise", "降噪"),
)


def _parse_a1111_fields(params):
    if not params or not isinstance(params, str):
        return []
    blob = params
    idx = blob.find("\nSteps:")
    if idx < 0:
        idx = blob.find("Steps:")
    if idx < 0:
        return []
    blob = blob[idx:].replace("\n", ", ")
    mapping = (
        ("Steps", "步数"),
        ("Sampler", "采样器"),
        ("Schedule type", "调度器"),
        ("Scheduler", "调度器"),
        ("CFG scale", "CFG"),
        ("Denoising strength", "降噪"),
        ("Seed", "种子"),
        ("Size", "尺寸"),
        ("Model", "模型"),
    )
    seen = set()
    rows = []
    for key, label in mapping:
        if label in seen:
            continue
        m = re.search(r"(?:^|,\s*)" + re.escape(key) + r":\s*([^,]+)", blob)
        if not m:
            continue
        val = m.group(1).strip()
        if not val:
            continue
        seen.add(label)
        rows.append({"label": label, "key": key.lower().replace(" ", "_"), "value": val})
    return rows


def extract_sampler_params(prompt, workflow, sampler_id, filepath=""):
    rows = []
    seen_labels = set()

    def add(label, key, value):
        v = str(value or "").strip()
        if not v or v in ("true", "false"):
            return
        if label in seen_labels:
            return
        seen_labels.add(label)
        rows.append({"label": label, "key": key, "value": v})

    ctx = {"prompt": prompt or {}, "wf_index": workflow_index(workflow) if workflow else {}, "workflow": workflow}
    if sampler_id:
        n = get_node(ctx["prompt"], sampler_id) or {}
        inputs = n.get("inputs") or {}
        for field, label in SAMPLER_PARAM_FIELDS:
            if field not in inputs:
                continue
            val = resolve_scalar(ctx, inputs[field], 0, set())
            add(label, field, val)
        model = ""
        if "model" in inputs:
            model = resolve_model_name(ctx, inputs["model"], 0, set())
        if model:
            add("模型", "model", model)
    w, h = png_size(filepath) if filepath else (None, None)
    if w and h:
        add("尺寸", "size", "%d×%d" % (w, h))
    order = ["种子", "采样器", "调度器", "步数", "CFG", "降噪", "尺寸", "模型"]
    rank = {k: i for i, k in enumerate(order)}
    rows.sort(key=lambda r: rank.get(r["label"], 99))
    if sampler_id:
        for lab in _used_loras_for_sampler(ctx, sampler_id):
            rows.append({"label": "LoRA", "key": "lora", "value": lab})
    return rows


def params_to_text(rows):
    lines = []
    for r in rows or []:
        lab = (r.get("label") or "").strip()
        val = (r.get("value") or "").strip()
        if lab and val:
            lines.append("%s: %s" % (lab, val))
    return "\n".join(lines)


def _passthrough_from_workflow(workflow):
    if not isinstance(workflow, dict):
        return ""
    nodes = workflow.get("nodes") or []
    hit = None
    for n in nodes:
        if not isinstance(n, dict):
            continue
        if n.get("type") == "DanbooruTextPassthrough" and str(n.get("id")) == "777":
            hit = n
            break
    if not hit:
        for n in reversed(nodes):
            if isinstance(n, dict) and n.get("type") in PASSTHROUGH_TYPES:
                hit = n
                break
    if not hit:
        return ""
    wv = hit.get("widgets_values") or []
    if len(wv) >= 3 and isinstance(wv[2], str) and wv[2].strip():
        return wv[2]
    return ""


def _parse_a1111(params):
    if not params or not isinstance(params, str):
        return ""
    neg = params.find("Negative prompt:")
    text = params[:neg] if neg >= 0 else params
    return text.strip()


def split_tags(text):
    if not text or not str(text).strip():
        return []
    raw = str(text).strip()
    if "<img>" in raw or "<general_tags>" in raw:
        tags = []
        for m in re.finditer(r"<([a-zA-Z0-9_]+)>([^<]*)</\1>", raw):
            name = m.group(1)
            body = (m.group(2) or "").strip()
            if not body or name in ("img",):
                continue
            if name.startswith("character_"):
                continue
            if name == "caption":
                tags.append(body)
            else:
                tags.extend(split_tags(body))
        return [t for t in tags if t]
    return [t.strip() for t in re.split(r"[,，]+", raw) if t.strip()]


def looks_artist(tag):
    inner = re.sub(r"^\(+", "", str(tag or "").strip())
    if inner.startswith("@"):
        return True
    low = inner.lower()
    if low.startswith("artist:"):
        return True
    return False


def artist_norm(tag):
    s = str(tag or "").strip()
    for _ in range(8):
        m = re.match(r"^\((.+):[ \t]*(-?\d+(?:\.\d+)?)[ \t]*\)$", s)
        if not m:
            break
        s = m.group(1).strip()
    s = re.sub(r"^\(+", "", s)
    s = re.sub(r"^@+", "", s)
    if s.lower().startswith("artist:"):
        s = s[7:].strip()
    s = s.replace("\\(", "(").replace("\\)", ")")
    s = s.replace("_", " ").strip().lower()
    return s


def artist_key_list(artist):
    if isinstance(artist, (list, tuple)):
        parts = artist
    else:
        s = str(artist or "").replace("，", ",")
        parts = s.split(",") if s.strip() else []
    out = []
    seen = set()
    for p in parts:
        key = artist_norm(p)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


TEXT_STR_KEYS = (
    "text", "text_g", "text_l", "clip_l", "t5xxl", "prompt",
    "prompt_text", "value", "string", "STRING",
)


def _artist_core(tag):
    s = str(tag or "").strip()
    for _ in range(8):
        m = re.match(r"^\((.+):[ \t]*(-?\d+(?:\.\d+)?)[ \t]*\)$", s)
        if not m:
            break
        s = m.group(1).strip()
    s = re.sub(r"^\(+", "", s)
    s = re.sub(r"^@+", "", s)
    if s.lower().startswith("artist:"):
        s = s[7:].strip()
    s = s.replace("\\(", "(").replace("\\)", ")")
    s = s.replace("_", " ").strip()
    return s


def format_artist_animemes(tag):
    """Animemes：@ + 下划线转空格 + 括号转义。"""
    s = _artist_core(tag)
    if not s:
        return ""
    s = re.sub(r"(?<!\\)\(", r"\\(", s)
    s = re.sub(r"(?<!\\)\)", r"\\)", s)
    return "@" + s


def format_artist_composer(tag):
    """给创作器 artist_tags：带 @，不预先转义括号（compose 会再转义一次）。"""
    s = _artist_core(tag)
    return ("@" + s) if s else ""


def format_artist_newbie(tag):
    s = _artist_core(tag).replace(" ", "_")
    return ("artist:" + s) if s else ""


def _artist_tag_list(artist_tag):
    raw = []
    if isinstance(artist_tag, (list, tuple)):
        raw = [str(x).strip() for x in artist_tag if str(x).strip()]
    else:
        s = str(artist_tag or "").strip()
        if s:
            raw = [s]
    out = []
    for item in raw:
        bits = [p.strip() for p in re.split(r"[,，]+", item) if p.strip()]
        if bits:
            out.extend(bits)
        elif item:
            out.append(item)
    return out


def _artist_inputs(artist_tag):
    anima_parts, composer_parts, newbie_parts = [], [], []
    seen = set()
    for t in _artist_tag_list(artist_tag):
        key = artist_norm(t)
        if not key or key in seen:
            continue
        seen.add(key)
        a = format_artist_animemes(t)
        c = format_artist_composer(t)
        n = format_artist_newbie(t)
        if a:
            anima_parts.append(a)
        if c:
            composer_parts.append(c)
        if n:
            newbie_parts.append(n)
    return (
        ", ".join(anima_parts),
        ", ".join(composer_parts),
        ", ".join(newbie_parts),
    )


def replace_artist_tags(text, new_artist, insert_if_missing=False):
    new_artist = (new_artist or "").strip()
    tags = split_tags(text)
    if not tags:
        return new_artist if (insert_if_missing and new_artist) else (text or "")
    out = []
    inserted = False
    had_artist = False
    for t in tags:
        if looks_artist(t):
            had_artist = True
            if new_artist and not inserted:
                out.append(new_artist)
                inserted = True
            continue
        out.append(t)
    if insert_if_missing and new_artist and not inserted:
        out.insert(0, new_artist)
        inserted = True
    if had_artist and not new_artist:
        return ", ".join(out)
    return ", ".join(out)


def _nid_from_path_item(item):
    s = str(item or "")
    if "#" in s:
        return s.rsplit("#", 1)[-1]
    return ""


def _load_png_graph(path, filename=""):
    chunks = read_png_text(path)
    prompt = _as_obj(chunks.get("prompt") or chunks.get("Prompt"))
    workflow = _as_obj(chunks.get("workflow") or chunks.get("Workflow"))
    if isinstance(prompt, dict) and prompt:
        return copy.deepcopy(prompt), workflow, "prompt"
    if isinstance(workflow, dict) and workflow:
        fake = workflow_to_prompt(workflow)
        if fake:
            return fake, workflow, "workflow"
    return None, workflow, "none"


def _api_prompt(prompt):
    out = {}
    for nid, n in (prompt or {}).items():
        if not isinstance(n, dict):
            continue
        ct = n.get("class_type")
        if not ct:
            continue
        inputs = {}
        for k, v in (n.get("inputs") or {}).items():
            if str(k).startswith("_"):
                continue
            inputs[k] = v
        node = {"class_type": ct, "inputs": inputs}
        meta = n.get("_meta")
        if isinstance(meta, dict) and meta:
            node["_meta"] = meta
        out[str(nid)] = node
    return out


def _fmt_valid_error(valid):
    err = valid[1] if valid and len(valid) > 1 else "工作流无法排队"
    if isinstance(err, dict):
        return err.get("message") or err.get("details") or json.dumps(err, ensure_ascii=False)
    return str(err or "工作流无法排队")


def _source_node_ids(extracted):
    nids = []
    seen = set()
    for s in (extracted or {}).get("sources") or []:
        for item in s.get("path") or []:
            nid = _nid_from_path_item(item)
            if nid and nid not in seen:
                seen.add(nid)
                nids.append(nid)
    return nids


def _text_same(a, b):
    return " ".join(str(a or "").lower().split()) == " ".join(str(b or "").lower().split())


def _collect_cond_encode_nids(graph, value, seen=None):
    out = []
    if seen is None:
        seen = set()
    if not is_link(value):
        return out
    nid = str(value[0])
    if nid in seen:
        return out
    seen.add(nid)
    n = get_node(graph, nid)
    if not n:
        return out
    ct = n.get("class_type") or ""
    if is_clip_encode(ct):
        out.append(nid)
        return out
    for k, v in (n.get("inputs") or {}).items():
        if str(k).lower() in ("negative", "uncond") or str(k).lower() in SKIP_GRAPH_KEYS:
            continue
        if is_link(v):
            out.extend(_collect_cond_encode_nids(graph, v, seen))
    return out


def _encode_nids_for_patch(graph, extracted):
    nids = []
    seen = set()
    sid = extracted.get("sampler_id") if extracted else None
    if sid:
        ctx = {"prompt": graph, "wf_index": {}, "workflow": None}
        for nid in _collect_cond_encode_nids(graph, _sampler_positive(ctx, sid)):
            if nid not in seen:
                seen.add(nid)
                nids.append(nid)
    for nid in _source_node_ids(extracted):
        n = get_node(graph, nid)
        if n and is_clip_encode(n.get("class_type") or "") and nid not in seen:
            seen.add(nid)
            nids.append(nid)
    return nids


def _rewritten_prompt_field(old, anima, extracted_text, new_text):
    old = old or ""
    if not str(old).strip():
        return None
    if _text_same(old, extracted_text):
        return new_text
    nxt = replace_artist_tags(old, anima, False)
    if nxt != old:
        return nxt
    return None


def patch_prompt_artists(graph, workflow, filename, artist_tag):
    anima, composer, newbie = _artist_inputs(artist_tag)
    if not anima:
        return None, "没有有效的画师标签"
    extracted = extract_from_prompt(graph, workflow, filename)
    if not extracted or not (extracted.get("text") or "").strip():
        return None, "这张图没有可重跑的正向提示词"
    extracted_text = extracted.get("text") or ""
    new_text = replace_artist_tags(extracted_text, anima, True)
    ctx = {
        "prompt": graph,
        "wf_index": workflow_index(workflow) if workflow else {},
        "workflow": workflow,
    }
    patched = False
    encode_nids = _encode_nids_for_patch(graph, extracted)
    if not encode_nids:
        for nid, n in (graph or {}).items():
            if isinstance(n, dict) and is_clip_encode(n.get("class_type") or ""):
                encode_nids.append(str(nid))
    for nid in encode_nids:
        n = get_node(graph, nid)
        if not n:
            continue
        inputs = n.get("inputs")
        if not isinstance(inputs, dict):
            continue
        keys = [k for k in TEXT_STR_KEYS if k in inputs]
        if not keys:
            inputs["text"] = new_text
            patched = True
            continue
        for key in keys:
            raw = inputs.get(key)
            old = ""
            if is_link(raw):
                old, _p = resolve_string(ctx, raw, 0, set())
            elif isinstance(raw, str):
                old = raw
            else:
                continue
            nxt = _rewritten_prompt_field(old, anima, extracted_text, new_text)
            if nxt is None and is_link(raw) and len(encode_nids) == 1:
                nxt = new_text
            if nxt is None:
                continue
            inputs[key] = nxt
            patched = True
    for nid in _source_node_ids(extracted):
        n = get_node(graph, nid)
        if not n:
            continue
        ct = n.get("class_type") or ""
        inputs = n.get("inputs")
        if not isinstance(inputs, dict):
            continue
        if ct == "AnimaPromptCreator":
            inputs["artist_tags"] = composer
            patched = True
        elif ct == "NewbiePromptCreator":
            inputs["nb_artists"] = newbie
            patched = True
        elif ct in PASSTHROUGH_TYPES or ct in PRIMITIVE_TYPES:
            for key in ("prompt_text", "text", "value", "string"):
                raw = inputs.get(key)
                if not isinstance(raw, str) or not raw.strip():
                    continue
                nxt = replace_artist_tags(raw, anima, True)
                if nxt != raw:
                    inputs[key] = nxt
                    patched = True
    if not patched:
        return None, "找不到可改写的画师标签输入"
    return graph, {"text": new_text, "artist": anima, "source": extracted.get("source") or ""}


async def queue_patched_prompt(graph, workflow=None, client_id=""):
    import inspect
    import time
    import uuid
    import execution
    from server import PromptServer

    ps = PromptServer.instance
    prompt = _api_prompt(graph)
    payload = {"prompt": prompt}
    if client_id:
        payload["client_id"] = client_id
    if workflow:
        payload["extra_data"] = {"extra_pnginfo": {"workflow": workflow}}
    try:
        if hasattr(ps, "trigger_on_prompt"):
            payload = ps.trigger_on_prompt(payload) or payload
    except Exception:
        pass
    prompt = payload.get("prompt") or prompt
    try:
        mgr = getattr(ps, "node_replace_manager", None)
        if mgr:
            mgr.apply_replacements(prompt)
    except Exception:
        pass
    prompt_id = str(uuid.uuid4())
    fn = execution.validate_prompt
    try:
        if inspect.iscoroutinefunction(fn):
            try:
                valid = await fn(prompt_id, prompt, None)
            except TypeError:
                valid = await fn(prompt)
        else:
            try:
                valid = fn(prompt_id, prompt, None)
            except TypeError:
                valid = fn(prompt)
    except Exception as e:
        return {"ok": False, "error": "校验工作流失败: " + str(e)}
    if not valid or not valid[0]:
        return {
            "ok": False,
            "error": _fmt_valid_error(valid),
            "node_errors": (valid[3] if valid and len(valid) > 3 else {}),
        }
    outputs_to_execute = valid[2]
    extra_data = payload.get("extra_data") or {}
    if client_id:
        extra_data["client_id"] = client_id
    extra_data["create_time"] = int(time.time() * 1000)
    extra_data["comfy_usage_source"] = extra_data.get("comfy_usage_source") or "anima-output-prompt-viewer"
    number = getattr(ps, "number", 0)
    try:
        ps.number = number + 1
    except Exception:
        pass
    try:
        ps.prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute, {}))
    except TypeError:
        ps.prompt_queue.put((number, prompt_id, prompt, extra_data, outputs_to_execute))
    remaining = 0
    try:
        remaining = ps.prompt_queue.get_tasks_remaining()
    except Exception:
        pass
    return {"ok": True, "prompt_id": prompt_id, "number": number, "queue_remaining": remaining}


MODEL_FAMILIES = (
    ("anima", "Anima"),
    ("noob", "Noob"),
    ("illustrious", "光辉"),
    ("zimage", "Z-Image"),
    ("krea2", "Krea 2"),
    ("qwen", "千问 Image"),
    ("flux", "Flux"),
    ("other", "其他"),
)
_MODEL_FAMILY_IDS = {mid for mid, _lab in MODEL_FAMILIES}


def _model_parts(name):
    raw = str(name or "").replace("\\", "/").lower()
    raw = os.path.basename(raw)
    for ext in (".safetensors", ".ckpt", ".pt", ".pth", ".gguf", ".sft"):
        if raw.endswith(ext):
            raw = raw[: -len(ext)]
            break
    parts = [p for p in re.split(r"[^a-z0-9]+", raw) if p]
    return parts, "".join(parts)


def classify_gen_model(name):
    """Map a checkpoint / unet basename to a base-model family."""
    parts, joined = _model_parts(name)
    if not joined:
        return "other"
    for p in parts:
        if p in ("anima", "animayume", "newbieimage") or p.startswith("miaomiaoharem"):
            return "anima"
        if p.startswith("anima") and len(p) > 5 and p[5].isdigit():
            return "anima"
    if "animayume" in joined or "newbieimage" in joined or "miaomiaoharem" in joined:
        return "anima"
    if "qwen" in joined and "image" in joined:
        return "qwen"
    if "krea" in joined:
        return "krea2"
    if "zimage" in joined or "beyondreality" in joined:
        return "zimage"
    if "illustrious" in joined:
        return "illustrious"
    if "noob" in joined or "plantmilk" in joined:
        return "noob"
    if "flux" in joined:
        return "flux"
    return "other"


def model_id_list(raw):
    if isinstance(raw, (list, tuple, set)):
        bits = raw
    else:
        bits = str(raw or "").replace(";", ",").split(",")
    out = []
    for b in bits:
        k = str(b or "").strip().lower()
        if k in _MODEL_FAMILY_IDS and k not in out:
            out.append(k)
    return out


def model_label(mid):
    for key, lab in MODEL_FAMILIES:
        if key == mid:
            return lab
    return "其他"


def _basename_widget(inputs, key):
    if not isinstance(inputs, dict) or key not in inputs or is_link(inputs.get(key)):
        return ""
    return _fmt_scalar(inputs.get(key)).strip()


def _scan_loader_basename(graph):
    if not isinstance(graph, dict):
        return ""
    unet, ckpt, named = [], [], []
    for n in graph.values():
        if not isinstance(n, dict) or n.get("mode", 0) == 4:
            continue
        ct = str(n.get("class_type") or "").lower()
        if any(x in ct for x in ("clip", "vae", "lora", "control", "text")):
            continue
        inputs = n.get("inputs") or {}
        u = _basename_widget(inputs, "unet_name")
        c = _basename_widget(inputs, "ckpt_name")
        if u:
            unet.append(u)
        if c:
            ckpt.append(c)
        if any(x in ct for x in ("unet", "checkpoint", "diffusion", "loader")):
            m = _basename_widget(inputs, "model_name")
            if m:
                named.append(m)
    pick = unet or ckpt or named
    return _model_basename(pick[-1]) if pick else ""


def indexed_model_name(graph, workflow, sampler_id, a1111_raw):
    name = ""
    if isinstance(graph, dict) and sampler_id:
        ctx = {
            "prompt": graph,
            "wf_index": workflow_index(workflow) if isinstance(workflow, dict) else {},
            "workflow": workflow if isinstance(workflow, dict) else {},
        }
        n = get_node(graph, sampler_id) or {}
        inputs = n.get("inputs") or {}
        if isinstance(inputs, dict) and "model" in inputs:
            try:
                name = resolve_model_name(ctx, inputs.get("model"), 0, set()) or ""
            except Exception:
                name = ""
    if not name and isinstance(graph, dict):
        try:
            name = _scan_loader_basename(graph) or ""
        except Exception:
            name = ""
    if not name:
        try:
            for row in _parse_a1111_fields(a1111_raw or ""):
                if row.get("label") == "模型" and row.get("value"):
                    name = row.get("value")
                    break
        except Exception:
            name = ""
    return name or ""


def extract_prompt_from_file(path, filename="", lite=False):
    ext = os.path.splitext(path)[1].lower()
    if ext != ".png":
        return {
            "ok": True, "text": "", "negative": "", "artists": [], "tags": [], "path": "", "paths": [],
            "ambiguous": False, "source": "none", "params": [], "params_text": "",
            "error": "此文件没有可读取的提示词元数据（非 PNG 或未写入 ComfyUI 信息）。",
        }
    chunks = read_png_text(path)
    prompt = _as_obj(chunks.get("prompt") or chunks.get("Prompt"))
    workflow = _as_obj(chunks.get("workflow") or chunks.get("Workflow"))
    a1111_raw = chunks.get("parameters") or chunks.get("Parameters") or ""

    result = None
    graph = prompt if isinstance(prompt, dict) and prompt else None
    if isinstance(prompt, dict) and prompt:
        try:
            result = extract_from_prompt(prompt, workflow, filename)
        except Exception:
            result = None
        if result and (result.get("text") or "").strip():
            result["source"] = "prompt"

    if (not result or not (result.get("text") or "").strip()) and isinstance(workflow, dict):
        try:
            fake = workflow_to_prompt(workflow)
            graph = fake or graph
            result = extract_from_prompt(fake, workflow, filename)
            if result:
                result["source"] = "workflow"
        except Exception:
            result = None

    if not result or not (result.get("text") or "").strip():
        pt = _passthrough_from_workflow(workflow) if workflow else ""
        if pt:
            result = {"text": pt, "path": "DanbooruTextPassthrough", "paths": [], "ambiguous": False, "sources": [], "source": "passthrough"}

    if not result or not (result.get("text") or "").strip():
        a1111 = _parse_a1111(a1111_raw)
        if a1111:
            result = {"text": a1111, "path": "parameters", "paths": [], "ambiguous": False, "sources": [], "source": "parameters"}

    model_id = "other"
    try:
        sid_for_model = result.get("sampler_id") if isinstance(result, dict) else None
        model_id = classify_gen_model(indexed_model_name(graph, workflow, sid_for_model, a1111_raw))
    except Exception:
        model_id = "other"

    if lite:
        if not result or not (result.get("text") or "").strip():
            return {"ok": True, "text": "", "negative": "", "artists": [], "tags": [], "characters": [], "series": [], "tag_keys": [], "model": model_id}
        text = result.get("text") or ""
        tags = split_tags(text)
        artists, characters, series = classify_prompt_facets(tags)
        extra_c, extra_s = _composer_facet_tags(graph)
        characters = _merge_facet_tags(characters, extra_c)
        series = _merge_facet_tags(series, extra_s)
        return {"ok": True, "text": text, "tags": tags, "artists": artists, "characters": characters, "series": series, "tag_keys": unique_tag_keys_from(tags), "model": model_id}

    graph_sig = ""
    candidates = []
    if graph:
        try:
            graph_sig = graph_signature(graph)
            candidates = list_text_candidates(graph, workflow)
        except Exception:
            graph_sig, candidates = "", []

    sid = result.get("sampler_id") if result else None
    param_rows = extract_sampler_params(graph or {}, workflow, sid, path)
    if len(param_rows) <= 1:
        extra = _parse_a1111_fields(a1111_raw)
        have = {r.get("label") for r in param_rows}
        for row in extra:
            if row.get("label") not in have:
                param_rows.append(row)
                have.add(row.get("label"))
    if not any(r.get("key") == "lora" for r in param_rows):
        for lab in _loras_from_tag_text(a1111_raw if isinstance(a1111_raw, str) else ""):
            param_rows.append({"label": "LoRA", "key": "lora", "value": lab})
    param_text = params_to_text(param_rows)

    if not result or not (result.get("text") or "").strip():
        if not chunks:
            err = "此图像不包含可读取的提示词数据。"
        else:
            err = "找到了工作流元数据，但没能从存图节点往回抽出正向提示词。"
        return {
            "ok": True, "text": "", "negative": "", "artists": [], "tags": [], "path": "", "paths": [],
            "ambiguous": False, "source": "none", "params": param_rows, "params_text": param_text,
            "error": err,
            "graph_sig": graph_sig, "candidates": candidates, "picked_id": "",
            "auto_text": "", "auto_path": "",
        }

    text = result.get("text") or ""
    neg_text = str(result.get("negative") or "").strip()
    if not neg_text:
        try:
            neg_text = _parse_a1111_negative(a1111_raw)
        except Exception:
            neg_text = ""
    tags = split_tags(text)
    artists = [t for t in tags if looks_artist(t)]
    extra_paths = result.get("paths") or []
    path_label = result.get("path") or ""
    return {
        "ok": True,
        "text": text,
        "negative": neg_text,
        "tags": tags,
        "artists": artists,
        "path": path_label,
        "paths": extra_paths,
        "ambiguous": bool(result.get("ambiguous")),
        "source": result.get("source") or "prompt",
        "params": param_rows,
        "params_text": param_text,
        "error": None,
        "graph_sig": graph_sig,
        "candidates": candidates,
        "picked_id": "",
        "auto_text": text,
        "auto_path": path_label,
    }


def _empty_index(root):
    return {"root": root, "ver": INDEX_VER, "folders": {}}


def _load_index(root):
    global _INDEX_LIVE, _INDEX_LIVE_ROOT
    if (
        _INDEX_LIVE is not None
        and _INDEX_LIVE_ROOT == root
        and isinstance(_INDEX_LIVE, dict)
        and _INDEX_LIVE.get("root") == root
        and _INDEX_LIVE.get("ver") == INDEX_VER
        and isinstance(_INDEX_LIVE.get("folders"), dict)
    ):
        return _INDEX_LIVE
    try:
        with open(INDEX_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if (
            not isinstance(data, dict)
            or data.get("root") != root
            or data.get("ver") != INDEX_VER
            or not isinstance(data.get("folders"), dict)
        ):
            data = _empty_index(root)
    except Exception:
        data = _empty_index(root)
    _INDEX_LIVE = data
    _INDEX_LIVE_ROOT = root
    return data


def _save_index(data, clear_agg=True):
    global _INDEX_LIVE, _INDEX_LIVE_ROOT
    tmp = INDEX_FILE + ".tmp"
    if isinstance(data, dict):
        data["ver"] = INDEX_VER
    new_root = data.get("root") if isinstance(data, dict) else None
    if os.path.isfile(INDEX_FILE) and new_root:
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as f:
                old = json.load(f)
            old_root = old.get("root")
            if old_root and os.path.normpath(str(old_root)) != os.path.normpath(str(new_root)):
                _INDEX_LIVE = data
                _INDEX_LIVE_ROOT = new_root
                _AGG_CACHE.clear()
                return
        except Exception:
            pass
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, INDEX_FILE)
    _INDEX_LIVE = data
    _INDEX_LIVE_ROOT = data.get("root") if isinstance(data, dict) else None
    if clear_agg:
        _AGG_CACHE.clear()


def _drop_index_file(root, sub, fn):
    with _INDEX_LOCK:
        data = _load_index(root)
        folders = data.get("folders") if isinstance(data, dict) else None
        if not isinstance(folders, dict):
            return
        bucket = folders.get(sub) or {}
        files = bucket.get("files") if isinstance(bucket, dict) else None
        if not isinstance(files, dict) or fn not in files:
            return
        files = dict(files)
        files.pop(fn, None)
        folders[sub] = {"files": files}
        try:
            _save_index(data)
        except Exception:
            pass



def _drop_index_files(root, pairs):
    if not pairs:
        return
    with _INDEX_LOCK:
        data = _load_index(root)
        folders = data.get("folders") if isinstance(data, dict) else None
        if not isinstance(folders, dict):
            return
        changed = False
        for sub, fn in pairs:
            bucket = folders.get(sub)
            if not isinstance(bucket, dict):
                continue
            files = bucket.get("files")
            if not isinstance(files, dict) or fn not in files:
                continue
            files = dict(files)
            files.pop(fn, None)
            folders[sub] = {"files": files}
            changed = True
        if not changed:
            return
        try:
            _save_index(data)
        except Exception:
            pass


def _index_one_png(path, filename, mtime, size):
    model = "other"
    try:
        data = extract_prompt_from_file(path, filename, lite=True)
        arts = list(data.get("artists") or [])
        chars = list(data.get("characters") or [])
        series = list(data.get("series") or [])
        tag_keys = list(data.get("tag_keys") or [])
        if not tag_keys:
            tag_keys = unique_tag_keys_from(data.get("tags") or [])
        model = str(data.get("model") or "other")
        if model not in _MODEL_FAMILY_IDS:
            model = "other"
    except Exception:
        arts, chars, series, tag_keys = [], [], [], []
        model = "other"
    return filename, {
        "mtime": int(mtime),
        "size": int(size),
        "artists": arts,
        "characters": chars,
        "series": series,
        "tags": tag_keys,
        "model": model,
    }


def _index_rec_ok(rec, mtime, size):
    return (
        isinstance(rec, dict)
        and int(rec.get("mtime") or 0) == int(mtime)
        and int(rec.get("size") or 0) == int(size)
        and isinstance(rec.get("artists"), list)
        and isinstance(rec.get("characters"), list)
        and isinstance(rec.get("series"), list)
        and isinstance(rec.get("tags"), list)
    )


def ensure_folder_index(subfolder=""):
    root = _output_root()
    sub = _safe_sub(subfolder)
    folder = os.path.join(root, sub) if sub else root
    stats = {"png": 0, "new": 0, "reused": 0, "dirty": False}
    if _is_skipped_sub(sub):
        return {}, stats
    if not _is_inside(root, folder) or not os.path.isdir(folder):
        return {}, stats
    on_disk = {}
    try:
        with os.scandir(folder) as it:
            for ent in it:
                name = ent.name
                if name.startswith(".") or not ent.is_file(follow_symlinks=False):
                    continue
                if os.path.splitext(name)[1].lower() != ".png":
                    continue
                try:
                    st = ent.stat()
                except OSError:
                    continue
                on_disk[name] = (os.path.join(folder, name), st.st_mtime, st.st_size)
    except OSError:
        on_disk = {}
    stats["png"] = len(on_disk)
    todo = []
    with _INDEX_LOCK:
        data = _load_index(root)
        bucket = data["folders"].get(sub) or {"files": {}}
        files = bucket.get("files") if isinstance(bucket, dict) else {}
        if not isinstance(files, dict):
            files = {}
        for name, meta in on_disk.items():
            path, mtime, size = meta
            old = files.get(name)
            if _index_rec_ok(old, mtime, size):
                stats["reused"] += 1
            else:
                todo.append((path, name, mtime, size))
    fresh = {}
    if todo:
        workers = 4 if len(todo) > 8 else 1
        if workers == 1:
            for path, name, mtime, size in todo:
                fn, rec = _index_one_png(path, name, mtime, size)
                fresh[fn] = rec
                stats["new"] += 1
        else:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futs = [pool.submit(_index_one_png, path, name, mtime, size) for path, name, mtime, size in todo]
                for fut in futs:
                    fn, rec = fut.result()
                    fresh[fn] = rec
                    stats["new"] += 1
    with _INDEX_LOCK:
        data = _load_index(root)
        bucket = data["folders"].get(sub) or {"files": {}}
        files = bucket.get("files") if isinstance(bucket, dict) else {}
        if not isinstance(files, dict):
            files = {}
        merged = {}
        extra = 0
        for name, meta in on_disk.items():
            path, mtime, size = meta
            rec = fresh.get(name)
            if not rec:
                rec = files.get(name)
            if _index_rec_ok(rec, mtime, size):
                merged[name] = rec
            else:
                fn, rec = _index_one_png(path, name, mtime, size)
                merged[fn] = rec
                extra += 1
                stats["new"] += 1
        changed = bool(fresh) or extra > 0 or set(files.keys()) != set(on_disk.keys())
        data["folders"][sub] = {"files": merged}
        stats["dirty"] = changed
        if changed:
            try:
                _save_index(data)
            except Exception:
                pass
        return merged, stats


def file_facets_for(subfolder="", filename=""):
    empty = {"ok": False, "artists": [], "characters": [], "series": []}
    try:
        root = _output_root()
        path, sub, fn, _view_sub = _resolve_view_file(filename, subfolder)
    except Exception as e:
        empty["error"] = str(e)
        return empty
    if not os.path.isfile(path):
        empty["error"] = "文件不存在"
        return empty
    try:
        st = os.stat(path)
        mtime, size = st.st_mtime, st.st_size
    except OSError as e:
        empty["error"] = str(e)
        return empty

    def _pack(rec):
        return {
            "ok": True,
            "filename": fn,
            "subfolder": sub,
            "artists": list((rec or {}).get("artists") or []),
            "characters": list((rec or {}).get("characters") or []),
            "series": effective_series(rec),
        }

    with _INDEX_LOCK:
        data = _load_index(root)
        bucket = data["folders"].get(sub) or {"files": {}}
        files = bucket.get("files") if isinstance(bucket, dict) else {}
        rec = files.get(fn) if isinstance(files, dict) else None
        if _index_rec_ok(rec, mtime, size):
            return _pack(rec)
    _fn, rec = _index_one_png(path, fn, mtime, size)
    with _INDEX_LOCK:
        data = _load_index(root)
        bucket = data["folders"].get(sub) or {"files": {}}
        files = dict(bucket.get("files") or {}) if isinstance(bucket, dict) else {}
        files[_fn] = rec
        data["folders"][sub] = {"files": files}
        try:
            _save_index(data)
        except Exception:
            pass
    return _pack(rec)


FACET_NONE = "__none__"
FACET_ORIGINAL = "original"


def facet_norm(tag):
    s = str(tag or "").strip()
    if not s:
        return ""
    if s in (FACET_NONE, FACET_ORIGINAL):
        return s
    s = s.replace("\\(", "(").replace("\\)", ")").replace("\\[", "[").replace("\\]", "]")
    for _ in range(8):
        m = re.match(r"^\((.+):[ \t]*(-?\d+(?:\.\d+)?)[ \t]*\)$", s)
        if not m:
            break
        s = m.group(1).strip()
    while len(s) >= 2 and s[0] == "(" and s[-1] == ")":
        inner = s[1:-1].strip()
        if inner.count("(") != inner.count(")"):
            break
        s = inner
    if s.startswith("@"):
        return ""
    low = s.lower()
    if low.startswith("artist:"):
        return ""
    return re.sub(r"\s+", "_", s).strip(" ,").lower()


def unique_tag_keys_from(tags):
    out = []
    seen = set()
    for t in tags or []:
        k = facet_norm(t)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(k)
    return out


def rec_tag_keys(rec):
    if not isinstance(rec, dict):
        return []
    tags = rec.get("tags")
    if isinstance(tags, list) and tags:
        return unique_tag_keys_from(tags)
    return unique_tag_keys_from(
        list(rec.get("artists") or []) + list(rec.get("characters") or []) + list(rec.get("series") or [])
    )


def _merge_facet_tags(dst, extra):
    out = list(dst or [])
    seen = set()
    for t in out:
        k = facet_norm(t)
        if k:
            seen.add(k)
    for t in extra or []:
        k = facet_norm(t)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(t)
    return out


def _composer_facet_tags(graph):
    chars, series = [], []
    for n in (graph or {}).values():
        if not isinstance(n, dict):
            continue
        ct = n.get("class_type") or ""
        inp = n.get("inputs") if isinstance(n.get("inputs"), dict) else {}
        if ct == "AnimaPromptCreator":
            chars.extend(split_tags(_as_str(inp.get("character_tags") or "")))
            series.extend(split_tags(_as_str(inp.get("series_tags") or "")))
    return chars, series


def _facet_lookup_keys(tag):
    s = str(tag or "").strip()
    if not s:
        return []
    keys = []

    def add(x):
        x = str(x or "").strip().lower()
        if not x or x in keys:
            return
        keys.append(x)
        und = x.replace(" ", "_")
        if und not in keys:
            keys.append(und)

    add(s)
    add(s.replace("\\(", "(").replace("\\)", ")"))
    n = facet_norm(s)
    if n:
        add(n)
    return keys


def _local_tag_categories(names):
    if not names:
        return {}
    alias = {}
    todo = []
    for n in names:
        for k in _facet_lookup_keys(n):
            if k not in alias:
                alias[k] = n
                todo.append(k)
    hits = {}
    try:
        from . import tag_db
    except Exception:
        try:
            import tag_db
        except Exception:
            tag_db = None
    if tag_db is None:
        return {}
    try:
        hits.update(tag_db.batch_lookup(todo, source="danbooru") or {})
        miss = [t for t in todo if t not in hits]
        if miss:
            hits.update(tag_db.batch_lookup(miss, source="gelbooru") or {})
    except Exception:
        return {}
    out = {}
    for k, cat in hits.items():
        orig = alias.get(k) or k
        if orig not in out:
            out[orig] = cat
    return out


# 角色标签括号里的简称，对应本地库里的正式版权标签。
# 提示词经常只写 hestia_(danmachi)，没有单独的 danmachi / 长版权名。
_SERIES_ALIAS = {
    "danmachi": "dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka",
    "kancolle": "kantai_collection",
    "nikke": "goddess_of_victory:_nikke",
    "fate": "fate_(series)",
    "re:zero": "re:zero_kara_hajimeru_isekai_seikatsu",
    "kabaneri": "koutetsujou_no_kabaneri",
    "sao": "sword_art_online",
    "kanan-sama": "kanan-sama_wa_akumade_choroi",
    "honkai_impact": "honkai_impact_3rd",
    "revue_starlight": "shoujo_kageki_revue_starlight",
    "p&d": "puzzle_&_dragons",
    "sekaiju": "sekaiju_no_meikyuu",
    "kagejitsu": "kage_no_jitsuryokusha_ni_naritakute!",
    "30ms": "30_minutes_sisters",
    "douki-chan": "ganbare_douki-chan",
    "tmnt": "teenage_mutant_ninja_turtles",
}
_SERIES_SLUG_SKIP = frozenset({
    "character", "vtuber", "male", "female", "girl", "boy", "other",
    "first_ascension", "second_ascension", "third_ascension",
    "fairy_tale_character", "cosplay", "genderbend", "shimmer",
    "1st_costume", "2nd_costume", "3rd_costume", "4th_costume", "5th_costume",
})
_PAREN_GROUP_RE = re.compile(r"\(([^()]*)\)")
_CAT_CACHE = {}


def tag_category(name):
    k = facet_norm(name)
    if not k:
        return None
    if k in _CAT_CACHE:
        return _CAT_CACHE[k]
    got = _local_tag_categories([k])
    cat = got.get(k)
    _CAT_CACHE[k] = cat
    return cat


def _paren_groups(core):
    return [m.group(1).strip() for m in _PAREN_GROUP_RE.finditer(core) if m.group(1).strip()]


def _strip_last_paren(core):
    i = core.rfind("(")
    if i <= 0 or not core.endswith(")"):
        return ""
    return core[:i].rstrip("_")


def _canonical_series(slug):
    slug = facet_norm(slug)
    if not slug or slug in _SERIES_SLUG_SKIP:
        return ""
    if tag_category(slug) == 3:
        return slug
    alias = _SERIES_ALIAS.get(slug)
    if alias and tag_category(alias) == 3:
        return alias
    series_form = slug + "_(series)"
    if tag_category(series_form) == 3:
        return series_form
    if tag_category(slug) is None:
        return slug
    return ""


def infer_series_tags(rec):
    """从角色名括号补系列。chiaki_(blue_archive) → blue_archive；服装括号（youmu_(ghost)）不算。"""
    if not isinstance(rec, dict):
        return []
    pool = []
    pool.extend(rec.get("tags") or [])
    pool.extend(rec.get("characters") or [])
    out = []
    seen = set()

    def add(slug):
        can = _canonical_series(slug)
        if not can or can in seen:
            return
        seen.add(can)
        out.append(can)

    for raw in pool:
        core = facet_norm(raw)
        if not core or "(" not in core:
            continue
        groups = _paren_groups(core)
        if not groups:
            continue
        for g in groups:
            if tag_category(g) == 3:
                add(g)
        last = facet_norm(groups[-1])
        if not last or tag_category(core) != 4:
            continue
        base = _strip_last_paren(core)
        if not base or tag_category(base) == 4:
            continue
        add(last)
    return out


def effective_series(rec):
    rec = rec if isinstance(rec, dict) else {}
    return _merge_facet_tags(list(rec.get("series") or []), infer_series_tags(rec))


def classify_prompt_facets(tags):
    artists = []
    characters = []
    series = []
    seen_a, seen_c, seen_s = set(), set(), set()
    cores = []
    for t in tags or []:
        raw = str(t or "").strip()
        if not raw:
            continue
        if looks_artist(raw):
            key = artist_norm(raw)
            if key and key not in seen_a:
                seen_a.add(key)
                artists.append(raw)
            continue
        core = facet_norm(raw)
        if core:
            cores.append((raw, core))
    cat_map = _local_tag_categories([c for _r, c in cores])
    for raw, core in cores:
        cat = cat_map.get(core)
        if cat is None:
            cat = cat_map.get(raw)
        if cat == 1:
            continue
        if cat == 4:
            if core not in seen_c:
                seen_c.add(core)
                characters.append(raw)
            continue
        if cat == 3 or core == FACET_ORIGINAL:
            if core not in seen_s:
                seen_s.add(core)
                series.append(raw)
    series = _merge_facet_tags(series, infer_series_tags({
        "tags": [raw for raw, _core in cores],
        "characters": characters,
        "series": series,
    }))
    return artists, characters, series


def unique_facet_keys(rec, field):
    keys = []
    seen = set()
    if not isinstance(rec, dict):
        return keys
    for a in rec.get(field) or []:
        key = facet_norm(a)
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def file_series_keys(rec):
    keys = []
    seen = set()
    for raw in effective_series(rec):
        key = facet_norm(raw)
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    if keys:
        return keys
    if unique_facet_keys(rec, "characters"):
        return [FACET_NONE]
    return []


def unique_artist_keys(rec):
    keys = []
    seen = set()
    if not isinstance(rec, dict):
        return keys
    for a in rec.get("artists") or []:
        key = artist_norm(a)
        if not key or key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def file_matches_artist(rec, want_key):
    if not want_key:
        return False
    return want_key in unique_artist_keys(rec)


def file_matches_filters(rec, want_key="", solo=False, series_key="", character_key="", tag_key="", model_ids=None, exact=False):
    rec = rec if isinstance(rec, dict) else {}
    keys = unique_artist_keys(rec)
    want = artist_key_list(want_key)
    if solo and len(keys) != 1:
        return False
    if exact and want and len(keys) != len(want):
        return False
    for wk in want:
        if wk not in keys:
            return False
    series_key = facet_norm(series_key)
    character_key = facet_norm(character_key)
    if series_key:
        if series_key not in file_series_keys(rec):
            return False
    if character_key:
        if character_key not in unique_facet_keys(rec, "characters"):
            return False
    tag_key = facet_norm(tag_key)
    if tag_key and tag_key not in rec_tag_keys(rec):
        return False
    if model_ids:
        mid = str(rec.get("model") or "")
        if mid not in model_ids:
            return False
    return True


def _ensure_scope(subfolder="", deep=True):
    sub = _safe_sub(subfolder)
    deep = bool(deep)
    parts = []
    tot = {"png": 0, "new": 0, "reused": 0, "dirty": False, "folders": 0}
    for child in iter_output_subs(sub, deep):
        files, stats = ensure_folder_index(child)
        tot["png"] += int(stats.get("png") or 0)
        tot["new"] += int(stats.get("new") or 0)
        tot["reused"] += int(stats.get("reused") or 0)
        tot["folders"] += 1
        if stats.get("dirty"):
            tot["dirty"] = True
        parts.append((child, files or {}))
    return sub, deep, parts, tot


def _agg_cached(kind, sub, deep, tot):
    if tot.get("dirty"):
        return None
    return _AGG_CACHE.get((kind, sub, bool(deep)))


def _agg_store(kind, sub, deep, payload):
    _AGG_CACHE[(kind, sub, bool(deep))] = payload
    return payload


def artist_index_for_folder(subfolder="", deep=True):
    sub, deep, parts, tot = _ensure_scope(subfolder, deep)
    cached = _agg_cached("artist", sub, deep, tot)
    if cached:
        return cached
    counts = {}
    for _child, files in parts:
        for rec in files.values():
            seen = set()
            for a in rec.get("artists") or []:
                key = artist_norm(a)
                if not key or key in seen:
                    continue
                seen.add(key)
                if key not in counts:
                    counts[key] = {"tag": a, "key": key, "count": 0}
                counts[key]["count"] += 1
    artists = sorted(counts.values(), key=lambda x: (-x["count"], x["key"]))
    return _agg_store("artist", sub, deep, {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "artists": artists,
        "png": tot["png"],
        "new": tot["new"],
        "reused": tot["reused"],
    })


def _apply_facet_cn(rows):
    tags = []
    for it in rows or []:
        if not isinstance(it, dict):
            continue
        if it.get("tag"):
            tags.append(it["tag"])
        if it.get("key"):
            tags.append(it["key"])
    if not tags:
        return
    try:
        from . import tag_db
        cns = tag_db.batch_cn(tags) or {}
    except Exception:
        try:
            import tag_db
            cns = tag_db.batch_cn(tags) or {}
        except Exception:
            cns = {}
    if not cns:
        return
    for it in rows or []:
        if not isinstance(it, dict) or it.get("cn"):
            continue
        cn = cns.get(it.get("key") or "") or cns.get(it.get("tag") or "") or ""
        if not cn:
            nk = facet_norm(it.get("tag") or "")
            if nk:
                cn = cns.get(nk) or ""
        if cn:
            it["cn"] = cn


def _facet_count_row(store, key, tag):
    if not key:
        return
    if key not in store:
        store[key] = {"tag": tag or key, "key": key, "count": 0}
    store[key]["count"] += 1


def cast_index_for_folder(subfolder="", deep=True):
    sub, deep, parts, tot = _ensure_scope(subfolder, deep)
    cached = _agg_cached("cast", sub, deep, tot)
    if cached:
        return cached
    series_counts = {}
    char_counts = {}
    series_chars = {}
    none_n = 0
    orig_n = 0
    for _child, files in parts:
        for rec in files.values():
            char_keys = unique_facet_keys(rec, "characters")
            char_tags = {}
            for raw in rec.get("characters") or []:
                k = facet_norm(raw)
                if k and k not in char_tags:
                    char_tags[k] = raw
            ser_keys = []
            ser_tags = {}
            for raw in effective_series(rec):
                k = facet_norm(raw)
                if not k or k in ser_tags:
                    continue
                ser_tags[k] = raw
                ser_keys.append(k)
            buckets = list(ser_keys)
            if not buckets and char_keys:
                buckets = [FACET_NONE]
                none_n += 1
            if FACET_ORIGINAL in ser_keys:
                orig_n += 1
            for sk in buckets:
                tag = ser_tags.get(sk) or sk
                _facet_count_row(series_counts, sk, tag)
                if sk not in series_chars:
                    series_chars[sk] = {}
                for ck in char_keys:
                    _facet_count_row(series_chars[sk], ck, char_tags.get(ck) or ck)
            for ck in char_keys:
                _facet_count_row(char_counts, ck, char_tags.get(ck) or ck)
    if none_n and FACET_NONE not in series_counts:
        series_counts[FACET_NONE] = {"tag": FACET_NONE, "key": FACET_NONE, "count": none_n}
    series = sorted(series_counts.values(), key=lambda x: (
        0 if x["key"] == FACET_ORIGINAL else 1 if x["key"] == FACET_NONE else 2,
        -x["count"],
        x["key"],
    ))
    characters = sorted(char_counts.values(), key=lambda x: (-x["count"], x["key"]))
    series_char_lists = {}
    for sk, store in series_chars.items():
        series_char_lists[sk] = sorted(store.values(), key=lambda x: (-x["count"], x["key"]))
    _apply_facet_cn(series)
    _apply_facet_cn(characters)
    for rows in series_char_lists.values():
        _apply_facet_cn(rows)
    return _agg_store("cast", sub, deep, {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "series": series,
        "characters": characters,
        "series_chars": series_char_lists,
        "png": tot["png"],
        "new": tot["new"],
        "reused": tot["reused"],
        "none": none_n,
        "original": orig_n,
    })


def tag_index_for_scope(subfolder="", deep=True):
    sub, deep, parts, tot = _ensure_scope(subfolder, deep)
    cached = _agg_cached("tag", sub, deep, tot)
    if cached:
        return cached
    counts = {}
    for _child, files in parts:
        for rec in files.values():
            seen = set()
            for k in rec_tag_keys(rec):
                if not k or k in seen:
                    continue
                seen.add(k)
                if k not in counts:
                    counts[k] = {"tag": k, "key": k, "count": 0}
                counts[k]["count"] += 1
    tags = sorted(counts.values(), key=lambda x: (-x["count"], x["key"]))
    _apply_facet_cn(tags)
    return _agg_store("tag", sub, deep, {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "tags": tags,
        "png": tot["png"],
        "new": tot["new"],
        "reused": tot["reused"],
        "folders": tot["folders"],
    })


def _rec_model_ok(rec):
    return isinstance(rec, dict) and rec.get("model") in _MODEL_FAMILY_IDS


_MODEL_FILL_LOCK = threading.Lock()
_MODEL_FILL = {"running": False, "done": 0, "total": 0, "error": ""}


def model_fill_snapshot():
    with _MODEL_FILL_LOCK:
        return {
            "running": bool(_MODEL_FILL.get("running")),
            "done": int(_MODEL_FILL.get("done") or 0),
            "total": int(_MODEL_FILL.get("total") or 0),
            "error": str(_MODEL_FILL.get("error") or ""),
        }


def _collect_model_jobs():
    root = _output_root()
    jobs = []
    for child in iter_output_subs("", True):
        indexed, _stats = ensure_folder_index(child)
        folder = os.path.join(root, child) if child else root
        for name, rec in (indexed or {}).items():
            if _rec_model_ok(rec):
                continue
            path = os.path.join(folder, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            jobs.append((child, name, path, int(st.st_mtime), int(st.st_size)))
    return jobs


def _model_backfill_run():
    try:
        jobs = _collect_model_jobs()
        with _MODEL_FILL_LOCK:
            _MODEL_FILL["total"] = len(jobs)
            _MODEL_FILL["done"] = 0
            _MODEL_FILL["error"] = ""
        step = 8
        for i in range(0, len(jobs), step):
            batch = jobs[i:i + step]
            fresh = []
            for child, name, path, mtime, size in batch:
                try:
                    _fn, rec = _index_one_png(path, name, mtime, size)
                    mid = str((rec or {}).get("model") or "other")
                    if mid not in _MODEL_FAMILY_IDS:
                        mid = "other"
                except Exception:
                    mid = "other"
                fresh.append((child, name, mid, mtime, size))
            with _INDEX_LOCK:
                data = _load_index(_output_root())
                folders = data.setdefault("folders", {})
                for child, name, mid, mtime, size in fresh:
                    bucket = folders.get(child) or {"files": {}}
                    files = bucket.get("files") if isinstance(bucket, dict) else {}
                    if not isinstance(files, dict):
                        files = {}
                    rec = files.get(name)
                    if (
                        isinstance(rec, dict)
                        and int(rec.get("mtime") or 0) == int(mtime)
                        and int(rec.get("size") or 0) == int(size)
                        and not _rec_model_ok(rec)
                    ):
                        rec["model"] = mid
                    folders[child] = {"files": files}
                try:
                    _save_index(data)
                except Exception:
                    pass
            with _MODEL_FILL_LOCK:
                _MODEL_FILL["done"] = min(len(jobs), i + len(batch))
            time.sleep(0.02)
    except Exception as e:
        with _MODEL_FILL_LOCK:
            _MODEL_FILL["error"] = str(e)
    finally:
        with _MODEL_FILL_LOCK:
            _MODEL_FILL["running"] = False


def model_backfill_kick():
    start = False
    with _MODEL_FILL_LOCK:
        if not _MODEL_FILL.get("running"):
            _MODEL_FILL["running"] = True
            _MODEL_FILL["error"] = ""
            start = True
        snap = {
            "running": bool(_MODEL_FILL.get("running")),
            "done": int(_MODEL_FILL.get("done") or 0),
            "total": int(_MODEL_FILL.get("total") or 0),
            "error": str(_MODEL_FILL.get("error") or ""),
        }
    if start:
        threading.Thread(target=_model_backfill_run, name="opv-model-fill", daemon=True).start()
    return snap


def model_index_for_scope(subfolder="", deep=True):
    sub, deep, parts, tot = _ensure_scope(subfolder, deep)
    counts = {mid: 0 for mid, _lab in MODEL_FAMILIES}
    pending = 0
    for _child, files in parts:
        for rec in files.values():
            mid = str((rec or {}).get("model") or "")
            if mid not in counts:
                pending += 1
                continue
            counts[mid] += 1
    status = model_backfill_kick() if pending else model_fill_snapshot()
    models = []
    for mid, lab in MODEL_FAMILIES:
        n = counts.get(mid) or 0
        if n:
            models.append({"id": mid, "label": lab, "count": n})
    return {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "models": models,
        "pending": pending,
        "running": bool(status.get("running")),
        "done": int(status.get("done") or 0),
        "total": int(status.get("total") or 0),
        "png": tot["png"],
        "new": tot["new"],
        "reused": tot["reused"],
        "folders": tot["folders"],
    }


def used_artists_from_files(files):
    all_keys = []
    solo_keys = []
    seen_all = set()
    seen_solo = set()
    for rec in (files or {}).values():
        keys = unique_artist_keys(rec)
        for k in keys:
            if k in seen_all:
                continue
            seen_all.add(k)
            all_keys.append(k)
        if len(keys) == 1:
            k = keys[0]
            if k not in seen_solo:
                seen_solo.add(k)
                solo_keys.append(k)
    all_keys.sort()
    solo_keys.sort()
    return all_keys, solo_keys


def iter_output_subs(subfolder="", deep=False):
    root = _output_root()
    sub = _safe_sub(subfolder)
    yield sub
    if not deep:
        return
    start = os.path.join(root, sub) if sub else root
    if not _is_inside(root, start) or not os.path.isdir(start):
        return
    for dirpath, dirnames, _names in os.walk(start):
        dirnames[:] = [d for d in dirnames if not _is_skipped_dir_name(d)]
        rel = os.path.relpath(dirpath, root)
        child = "" if rel == "." else rel.replace("\\", "/")
        if _is_skipped_sub(child):
            continue
        if child != sub:
            yield child


def used_artists_for_scope(subfolder="", deep=False):
    sub, deep, parts, tot = _ensure_scope(subfolder, deep)
    cached = _agg_cached("used", sub, deep, tot)
    if cached:
        return cached
    merged_files = {}
    for child, files in parts:
        prefix = (child + "/") if child else ""
        for name, rec in files.items():
            merged_files[prefix + name] = rec
    all_keys, solo_keys = used_artists_from_files(merged_files)
    return _agg_store("used", sub, deep, {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "all_keys": all_keys,
        "solo_keys": solo_keys,
        "png": tot["png"],
        "new": tot["new"],
        "reused": tot["reused"],
        "folders": tot["folders"],
    })


def _view_url(filename, subfolder):
    from urllib.parse import urlencode
    q = {"filename": filename, "type": "output", "subfolder": subfolder or ""}
    return "/view?" + urlencode(q)



def _fav_copy_url(filename, orig_sub=""):
    from urllib.parse import urlencode
    q = {"filename": filename or "", "subfolder": orig_sub or ""}
    return "/danbooru_anima/output_prompt/fav_copy?" + urlencode(q)


def _fav_item_url(filename, orig_sub, orig_ok, copy_sub):
    if orig_ok:
        return _view_url(filename, orig_sub)
    if copy_sub is not None:
        return _view_url(filename, copy_sub)
    return _fav_copy_url(filename, orig_sub)


def _url_for_resolved(filename, logical_sub, view_sub):
    if view_sub is None:
        return _fav_copy_url(filename, logical_sub)
    return _view_url(filename, view_sub)


def _scan_folder_entries(folder, sub):
    folders = []
    files = []
    try:
        with os.scandir(folder) as it:
            for ent in it:
                name = ent.name
                if _is_skipped_dir_name(name):
                    continue
                try:
                    if ent.is_dir(follow_symlinks=False):
                        child = (sub + "/" + name) if sub else name
                        child = child.replace("\\", "/")
                        if _is_skipped_sub(child):
                            continue
                        folders.append({"name": name, "subfolder": child})
                    elif ent.is_file(follow_symlinks=False):
                        ext = os.path.splitext(name)[1].lower()
                        if ext not in IMG_EXT:
                            continue
                        st = ent.stat()
                        files.append((name, st.st_mtime, st.st_size))
                except OSError:
                    continue
    except OSError:
        return [], []
    folders.sort(key=lambda x: x["name"].lower())
    return folders, files


def _is_img_fav_sub(subfolder):
    return (subfolder or "").replace("\\", "/").strip("/") == IMG_FAV_SUB


def _img_fav_key(filename, subfolder):
    return "%s/%s" % ((subfolder or "").replace("\\", "/").strip("/"), filename or "")


def _empty_img_favs():
    return {"ver": IMG_FAV_VER, "items": []}


def _load_img_favs():
    global _IMG_FAV_LIVE, _IMG_FAV_LIVE_MT
    if not os.path.isfile(IMG_FAV_FILE):
        data = _empty_img_favs()
        _IMG_FAV_LIVE = data
        _IMG_FAV_LIVE_MT = None
        return data
    try:
        mt = os.path.getmtime(IMG_FAV_FILE)
    except OSError:
        mt = None
    if (
        _IMG_FAV_LIVE is not None
        and _IMG_FAV_LIVE_MT == mt
        and isinstance(_IMG_FAV_LIVE, dict)
        and isinstance(_IMG_FAV_LIVE.get("items"), list)
    ):
        return _IMG_FAV_LIVE
    try:
        with open(IMG_FAV_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = _empty_img_favs()
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        data = _empty_img_favs()
    data["ver"] = IMG_FAV_VER
    _IMG_FAV_LIVE = data
    _IMG_FAV_LIVE_MT = mt
    return data


def _save_img_favs(data):
    global _IMG_FAV_LIVE, _IMG_FAV_LIVE_MT
    if not isinstance(data, dict):
        return False
    tmp = IMG_FAV_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, IMG_FAV_FILE)
        _IMG_FAV_LIVE = data
        try:
            _IMG_FAV_LIVE_MT = os.path.getmtime(IMG_FAV_FILE)
        except OSError:
            _IMG_FAV_LIVE_MT = None
        return True
    except Exception:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


def _fav_orig_path(root, filename, subfolder):
    name = os.path.basename(filename or "")
    child = (subfolder or "").replace("\\", "/").strip("/")
    if child:
        return os.path.join(root, child, name), name, child
    return os.path.join(root, name), name, child


def _file_sha256(path):
    if not path or not os.path.isfile(path):
        return ""
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError:
        return ""
    return digest.hexdigest()


def _stored_sha(item):
    raw = str((item or {}).get("sha256") or "").strip().lower()
    if len(raw) == 64 and all(c in "0123456789abcdef" for c in raw):
        return raw
    return ""


def _output_name_index(names):
    """filename -> [(subfolder, path)] for files still in the output tree."""
    found = {}
    want = set(names or [])
    if not want:
        return found
    root = _output_root()
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not _is_skipped_dir_name(d)]
        rel = os.path.relpath(dirpath, root)
        child = "" if rel in (".", "") else rel.replace("\\", "/")
        if child and (_is_skipped_sub(child) or _is_trash_sub(child)):
            dirnames[:] = []
            continue
        for name in filenames:
            if name not in want:
                continue
            path = os.path.join(dirpath, name)
            try:
                if not os.path.isfile(path):
                    continue
            except OSError:
                continue
            found.setdefault(name, []).append((child, path))
    return found


def _backup_sha(filename, subfolder):
    try:
        dest, _rel, _fn = _fav_copy_abs(filename, subfolder)
    except Exception:
        return ""
    return _file_sha256(dest)


def _hash_matches(filename, old_sub, locs, ref_hash):
    """Folders whose file bytes match the favorite snapshot. Filename is only a search hint."""
    if not ref_hash:
        return []
    hit = []
    seen = set()
    for sub, path in locs or []:
        if (sub or "") == (old_sub or "") or sub in seen:
            continue
        if _file_sha256(path) != ref_hash:
            continue
        seen.add(sub)
        hit.append(sub)
    hit.sort()
    return hit


def _apply_rating_moves(moves):
    if not moves:
        return
    with _IMG_RATE_LOCK:
        data = _load_img_rates()
        ratings = dict(data.get("ratings") or {})
        changed = False
        for old_key, new_key in moves:
            if not old_key or old_key == new_key or old_key not in ratings:
                continue
            old_val = ratings.pop(old_key)
            changed = True
            if not ratings.get(new_key):
                ratings[new_key] = old_val
        if not changed:
            return
        data["ratings"] = ratings
        _save_img_rates(data)


def _reconcile_moved_img_favs_body():
    """Reattach a favorite only when the file bytes match the stored snapshot."""
    try:
        root = _output_root()
    except Exception:
        return True
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items")
        if not isinstance(items, list):
            return False
        rows = []
        for it in items:
            if not isinstance(it, dict):
                continue
            path, name, child = _fav_orig_path(root, it.get("filename"), it.get("subfolder"))
            if not name:
                continue
            rows.append({
                "key": _img_fav_key(name, child),
                "name": name,
                "child": child,
                "sha": _stored_sha(it),
                "exists": os.path.isfile(path),
                "path": path,
            })
    if not rows:
        return False
    missing_names = [row["name"] for row in rows if not row["exists"]]
    found = _output_name_index(missing_names) if missing_names else {}
    actions = []
    unresolved = False
    for row in rows:
        if row["exists"]:
            if row["sha"]:
                continue
            digest = _file_sha256(row["path"])
            if digest:
                actions.append(("sethash", row["key"], digest))
            continue
        ref = row["sha"] or _backup_sha(row["name"], row["child"])
        if not ref:
            unresolved = True
            continue
        matches = _hash_matches(row["name"], row["child"], found.get(row["name"]) or [], ref)
        if not matches:
            unresolved = True
            if not row["sha"]:
                actions.append(("sethash", row["key"], ref))
            continue
        actions.append(("retarget", row["key"], row["name"], row["child"], matches, ref))
    if not actions:
        return unresolved
    moves = []
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items")
        if not isinstance(items, list):
            return unresolved
        by_key = {}
        for it in items:
            if not isinstance(it, dict):
                continue
            by_key[_img_fav_key(it.get("filename"), it.get("subfolder"))] = it
        drop_ids = set()
        changed = False
        for act in actions:
            if act[0] == "sethash":
                it = by_key.get(act[1])
                if it is not None and not _stored_sha(it):
                    it["sha256"] = act[2]
                    changed = True
                continue
            _kind, old_key, name, child, matches, ref = act
            it = by_key.get(old_key)
            if it is None:
                continue
            dest_sub = None
            for sub in matches:
                other = by_key.get(_img_fav_key(name, sub))
                if other is not None and other is not it:
                    dest_sub = sub
                    break
            if dest_sub is None:
                dest_sub = matches[0]
            new_key = _img_fav_key(name, dest_sub)
            survivor = by_key.get(new_key)
            _relocate_fav_copy(name, child, name, dest_sub)
            moves.append((old_key, new_key))
            if survivor is not None and survivor is not it:
                if not _stored_sha(survivor):
                    survivor["sha256"] = ref
                drop_ids.add(id(it))
                by_key.pop(old_key, None)
            else:
                it["filename"] = name
                it["subfolder"] = dest_sub
                it["sha256"] = ref
                by_key.pop(old_key, None)
                by_key[new_key] = it
            changed = True
        if changed:
            data["items"] = [it for it in items if id(it) not in drop_ids]
            if not _save_img_favs(data):
                return True
    _apply_rating_moves(moves)
    return unresolved


def reconcile_moved_img_favs(force=False):
    global _FAV_RECONCILE_CLEAN_UNTIL
    now = time.time()
    if not force and now < _FAV_RECONCILE_CLEAN_UNTIL:
        return
    with _FAV_RECONCILE_LOCK:
        now = time.time()
        if not force and now < _FAV_RECONCILE_CLEAN_UNTIL:
            return
        retry = True
        try:
            retry = _reconcile_moved_img_favs_body()
        finally:
            _FAV_RECONCILE_CLEAN_UNTIL = time.time() + (20.0 if retry else 600.0)


def schedule_fav_reconcile():
    """Hash-check moved favorites off the folder-list request."""
    global _FAV_RECONCILE_RUNNING
    with _FAV_RECONCILE_LOCK:
        if _FAV_RECONCILE_RUNNING:
            return True
        if time.time() < _FAV_RECONCILE_CLEAN_UNTIL:
            return False
        _FAV_RECONCILE_RUNNING = True

        def _run():
            global _FAV_RECONCILE_RUNNING
            try:
                reconcile_moved_img_favs(force=True)
            finally:
                with _FAV_RECONCILE_LOCK:
                    _FAV_RECONCILE_RUNNING = False

        threading.Thread(target=_run, name="opv-fav-reconcile", daemon=True).start()
        return True


def fav_reconcile_running():
    return bool(_FAV_RECONCILE_RUNNING)


def img_fav_keys():
    data = _load_img_favs()
    out = set()
    for it in data.get("items") or []:
        if isinstance(it, dict) and it.get("filename"):
            out.add(_img_fav_key(it.get("filename"), it.get("subfolder")))
    return out



_DRAG_LOCK = threading.Lock()
_DRAG_ABORT = threading.Event()
_DRAG_S_DROP = 0x00040100
_DRAG_S_CANCEL = 0x00040101
_DRAG_S_USEDEFAULT = 0x00040102
_E_NOINTERFACE = -2147467262
_MK_LBUTTON = 0x0001


class _WinGUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_ubyte * 8),
    ]


def _win_guid(text):
    import uuid
    return _WinGUID.from_buffer_copy(uuid.UUID(text).bytes_le)


def _win_guid_bytes(g):
    return ctypes.string_at(ctypes.addressof(g), ctypes.sizeof(g))


def _left_button_down():
    if sys.platform != "win32":
        return False
    try:
        return bool(ctypes.windll.user32.GetAsyncKeyState(0x01) & 0x8000)
    except Exception:
        return False


def _com_release(ptr):
    if not ptr:
        return
    obj = ctypes.cast(ptr, ctypes.POINTER(ctypes.c_void_p))
    vtbl = ctypes.cast(obj[0], ctypes.POINTER(ctypes.c_void_p))
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtbl[2])
    release(ptr)


def _win_drag_data_object(path):
    """Shell data object for one real file. Caller releases ptr and ILFree each pidl."""
    shell32 = ctypes.windll.shell32
    shell32.ILCreateFromPathW.argtypes = [ctypes.c_wchar_p]
    shell32.ILCreateFromPathW.restype = ctypes.c_void_p
    shell32.ILClone.argtypes = [ctypes.c_void_p]
    shell32.ILClone.restype = ctypes.c_void_p
    shell32.ILRemoveLastID.argtypes = [ctypes.c_void_p]
    shell32.ILRemoveLastID.restype = ctypes.c_bool
    shell32.ILFindLastID.argtypes = [ctypes.c_void_p]
    shell32.ILFindLastID.restype = ctypes.c_void_p
    shell32.ILFree.argtypes = [ctypes.c_void_p]
    shell32.ILFree.restype = None
    shell32.SHCreateDataObject.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint,
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.c_void_p,
        ctypes.POINTER(_WinGUID),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    shell32.SHCreateDataObject.restype = ctypes.HRESULT
    full = shell32.ILCreateFromPathW(os.path.abspath(path))
    if not full:
        raise OSError("找不到这个文件的外壳路径")
    parent = shell32.ILClone(full)
    child = shell32.ILFindLastID(full) if parent else None
    if not parent or not child or not shell32.ILRemoveLastID(parent):
        if parent:
            shell32.ILFree(parent)
        shell32.ILFree(full)
        raise OSError("找不到这个文件的外壳路径")
    arr = (ctypes.c_void_p * 1)(child)
    iid = _win_guid("0000010e-0000-0000-C000-000000000046")
    out = ctypes.c_void_p()
    hr = shell32.SHCreateDataObject(parent, 1, arr, None, ctypes.byref(iid), ctypes.byref(out))
    if hr != 0 or not out.value:
        shell32.ILFree(parent)
        shell32.ILFree(full)
        raise OSError("无法把图片交给拖拽（%s）" % (hex(hr & 0xFFFFFFFF)))
    return out, (full, parent)


def _win_drop_source():
    """IDropSource that copies on release, and cancels if the button was already up."""
    qi_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.POINTER(_WinGUID), ctypes.POINTER(ctypes.c_void_p))
    ref_t = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)
    cont_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_int, ctypes.c_uint32)
    feed_t = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_uint32)

    class VTable(ctypes.Structure):
        _fields_ = [
            ("QueryInterface", qi_t),
            ("AddRef", ref_t),
            ("Release", ref_t),
            ("QueryContinueDrag", cont_t),
            ("GiveFeedback", feed_t),
        ]

    class Obj(ctypes.Structure):
        _fields_ = [("vtbl", ctypes.POINTER(VTable))]

    iid_unk = _win_guid_bytes(_win_guid("00000000-0000-0000-C000-000000000046"))
    iid_src = _win_guid_bytes(_win_guid("00000121-0000-0000-C000-000000000046"))
    state = {"ref": 1, "seen": False}

    def query_interface(this, riid, ppv):
        try:
            got = _win_guid_bytes(riid.contents)
        except Exception:
            ppv[0] = None
            return _E_NOINTERFACE
        if got == iid_unk or got == iid_src:
            ppv[0] = this
            state["ref"] += 1
            return 0
        ppv[0] = None
        return _E_NOINTERFACE

    def add_ref(this):
        state["ref"] += 1
        return state["ref"]

    def release(this):
        state["ref"] -= 1
        if state["ref"] < 0:
            state["ref"] = 0
        return state["ref"]

    def query_continue(this, escape_pressed, keys):
        # 拖拽跑在另一条线程上，系统给的 keys 看不到浏览器里按下的鼠标。
        # 用真实按键状态，否则拖拽会马上被取消。
        if escape_pressed or _DRAG_ABORT.is_set():
            return _DRAG_S_CANCEL
        if _left_button_down() or (keys & _MK_LBUTTON):
            state["seen"] = True
            return 0
        if not state["seen"]:
            return _DRAG_S_CANCEL
        return _DRAG_S_DROP

    def give_feedback(this, effect):
        return _DRAG_S_USEDEFAULT

    vtbl = VTable(qi_t(query_interface), ref_t(add_ref), ref_t(release), cont_t(query_continue), feed_t(give_feedback))
    obj = Obj(ctypes.pointer(vtbl))
    holder = {"obj": obj, "vtbl": vtbl, "cbs": (query_interface, add_ref, release, query_continue, give_feedback)}
    return holder


def _drag_user32():
    user32 = ctypes.windll.user32
    user32.GetCursorPos.argtypes = [ctypes.c_void_p]
    user32.GetCursorPos.restype = ctypes.c_bool
    user32.PeekMessageW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint]
    user32.PeekMessageW.restype = ctypes.c_bool
    user32.PostThreadMessageW.argtypes = [ctypes.c_uint32, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
    user32.PostThreadMessageW.restype = ctypes.c_bool
    user32.GetForegroundWindow.argtypes = []
    user32.GetForegroundWindow.restype = ctypes.c_void_p
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    user32.GetWindowThreadProcessId.restype = ctypes.c_uint32
    user32.AttachThreadInput.argtypes = [ctypes.c_uint32, ctypes.c_uint32, ctypes.c_bool]
    user32.AttachThreadInput.restype = ctypes.c_bool
    return user32


def _drag_post_thread(tid):
    """把当前光标交给拖拽线程。系统拖拽读的是这条线程消息，不是浏览器窗口的消息。"""
    class _PT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
    pt = _PT()
    user32 = _drag_user32()
    if not user32.GetCursorPos(ctypes.addressof(pt)):
        return
    lparam = ((int(pt.y) & 0xFFFF) << 16) | (int(pt.x) & 0xFFFF)
    down = _left_button_down()
    user32.PostThreadMessageW(tid, 0x0200 if down else 0x0202, 1 if down else 0, lparam)


def _drag_pump(stop, tid):
    while not stop.is_set():
        try:
            _drag_post_thread(tid)
        except Exception:
            pass
        if stop.wait(0.02):
            break


def _win_drag_files(paths):
    if sys.platform != "win32":
        return False, "当前只支持在 Windows 里拖出"
    if not paths:
        return False, "文件不存在"
    if not _left_button_down():
        return False, ""
    if not _DRAG_LOCK.acquire(blocking=False):
        return False, "正在拖出另一张图"
    ole32 = ctypes.windll.ole32
    shell32 = ctypes.windll.shell32
    user32 = _drag_user32()
    kernel32 = ctypes.windll.kernel32
    kernel32.GetCurrentThreadId.restype = ctypes.c_uint32
    started = False
    src = None
    data = None
    pidls = ()
    attached_to = 0
    our_tid = 0
    stop_pump = threading.Event()
    _DRAG_ABORT.clear()
    try:
        ole32.OleInitialize.argtypes = [ctypes.c_void_p]
        ole32.OleInitialize.restype = ctypes.HRESULT
        hr_ole = int(ole32.OleInitialize(None))
        if hr_ole < 0:
            return False, "拖出失败"
        started = True
        our_tid = kernel32.GetCurrentThreadId()
        fg = user32.GetForegroundWindow()
        fg_tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
        if fg_tid and fg_tid != our_tid:
            if user32.AttachThreadInput(our_tid, fg_tid, True):
                attached_to = fg_tid

        class _MSG(ctypes.Structure):
            _fields_ = [
                ("hwnd", ctypes.c_void_p),
                ("message", ctypes.c_uint),
                ("wParam", ctypes.c_size_t),
                ("lParam", ctypes.c_ssize_t),
                ("time", ctypes.c_uint),
                ("pt_x", ctypes.c_long),
                ("pt_y", ctypes.c_long),
            ]
        user32.PeekMessageW(ctypes.addressof(_MSG()), None, 0, 0, 0)
        if not _left_button_down():
            return False, ""
        data, pidls = _win_drag_data_object(paths[0])
        src = _win_drop_source()
        shell32.SHDoDragDrop.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_uint32,
            ctypes.POINTER(ctypes.c_uint32),
        ]
        shell32.SHDoDragDrop.restype = ctypes.HRESULT
        effect = ctypes.c_uint32(0)
        src_ptr = ctypes.c_void_p(ctypes.addressof(src["obj"]))
        pump = threading.Thread(target=_drag_pump, args=(stop_pump, our_tid), name="opv-drag-pump", daemon=True)
        pump.start()
        hr = int(shell32.SHDoDragDrop(None, data, src_ptr, 1, ctypes.byref(effect)))
        code = hr & 0xFFFFFFFF
        got = int(effect.value)
        print("[opv-drag] hr=%08X effect=%s" % (code, got))
        if hr < 0:
            return False, "拖出失败"
        if code == _DRAG_S_CANCEL:
            return False, ""
        if got == 0:
            return False, "松开时鼠标下面的窗口没有接住图片"
        return True, ""
    except Exception:
        return False, "拖出失败"
    finally:
        stop_pump.set()
        _DRAG_ABORT.set()
        if attached_to and our_tid:
            try:
                user32.AttachThreadInput(our_tid, attached_to, False)
            except Exception:
                pass
        if data:
            try:
                _com_release(data)
            except Exception:
                pass
        if pidls:
            for one in pidls:
                try:
                    shell32.ILFree(one)
                except Exception:
                    pass
        if started:
            try:
                ole32.OleUninitialize()
            except Exception:
                pass
        _DRAG_LOCK.release()


def _path_for_reveal(filename, subfolder=""):
    root = _output_root()
    path, sub, fn = _safe_file(root, subfolder, filename)
    key = _img_fav_key(fn, sub)
    if key in img_fav_keys():
        if os.path.isfile(path):
            try:
                dest, _rel, _fn = _ensure_fav_copy(path, fn, sub)
                if os.path.isfile(dest):
                    return dest
            except Exception:
                pass
        try:
            dest, _rel, _fn = _fav_copy_abs(fn, sub)
            if os.path.isfile(dest):
                return dest
        except Exception:
            pass
        if os.path.isfile(path):
            return path
        return ""
    if os.path.isfile(path):
        return path
    return ""


def reveal_output_image(filename, subfolder=""):
    try:
        path = _path_for_reveal(filename, subfolder)
    except Exception as e:
        return False, str(e)
    if not path:
        return False, "文件不存在"
    return _reveal_in_folder(path)


def drag_output_image(filename, subfolder=""):
    """Drag the real output file with the Windows shell, the same way Explorer does."""
    try:
        path = _path_for_reveal(filename, subfolder)
    except Exception as e:
        return False, str(e)
    if not path or not os.path.isfile(path):
        return False, "文件不存在"
    ext = os.path.splitext(path)[1].lower()
    if ext not in IMG_EXT:
        return False, "不是图片文件"
    if sys.platform != "win32":
        return False, "当前只支持在 Windows 里拖出"
    ok, err = _win_drag_files([path])
    if ok:
        return True, ""
    if not err:
        return False, ""
    return False, err


def _same_image_fav_hits(items, fn, sub, src_hash):
    """Favorites whose stored bytes match this file. Same size or same name is not enough."""
    if not src_hash:
        return []
    try:
        root = _output_root()
    except Exception:
        root = ""
    cur = _img_fav_key(fn, sub)
    hits = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        name = os.path.basename(str(it.get("filename") or ""))
        child = (it.get("subfolder") or "").replace("\\", "/").strip("/")
        if not name or _img_fav_key(name, child) == cur:
            continue
        stored = _stored_sha(it)
        if stored:
            if stored == src_hash:
                hits.append(it)
            continue
        if name != fn:
            continue
        digest = ""
        if root:
            path, _n, _c = _fav_orig_path(root, name, child)
            digest = _file_sha256(path)
        if not digest:
            digest = _backup_sha(name, child)
        if digest and digest == src_hash:
            hits.append(it)
    return hits


def img_fav_set(filename, subfolder="", on=None):
    filename = (filename or "").strip()
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if not filename:
        return {"ok": False, "error": "缺少文件名", "on": False, "count": 0}
    if _is_img_fav_sub(sub) or _is_skipped_sub(sub) or _is_trash_sub(sub):
        return {"ok": False, "error": "错误的子目录", "on": False, "count": 0}
    try:
        root = _output_root()
        path, _s, fn = _safe_file(root, sub, filename)
    except Exception as e:
        return {"ok": False, "error": str(e), "on": False, "count": 0}
    if not fn or not os.path.isfile(path):
        return {"ok": False, "error": "文件不存在", "on": False, "count": 0}
    src_hash = _file_sha256(path)
    key = _img_fav_key(fn, sub)
    absorb = None
    extra_drops = []
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items")
        if not isinstance(items, list):
            items = []
            data["items"] = items
        existing = None
        for it in items:
            if isinstance(it, dict) and _img_fav_key(it.get("filename"), it.get("subfolder")) == key:
                existing = it
                break
        if on is None:
            on = existing is None
        on = bool(on)
        changed = False
        if on and existing is None:
            hits = _same_image_fav_hits(items, fn, sub, src_hash)
            if hits:
                twin = hits[0]
                old_name = os.path.basename(str(twin.get("filename") or ""))
                old_sub = (twin.get("subfolder") or "").replace("\\", "/").strip("/")
                absorb = (old_name, old_sub, _img_fav_key(old_name, old_sub), key)
                twin["filename"] = fn
                twin["subfolder"] = sub
                if src_hash:
                    twin["sha256"] = src_hash
                existing = twin
                for extra in hits[1:]:
                    extra_name = os.path.basename(str(extra.get("filename") or ""))
                    extra_sub = (extra.get("subfolder") or "").replace("\\", "/").strip("/")
                    extra_drops.append((extra_name, extra_sub, _img_fav_key(extra_name, extra_sub)))
                    items.remove(extra)
            else:
                row = {"filename": fn, "subfolder": sub, "added_at": int(time.time())}
                if src_hash:
                    row["sha256"] = src_hash
                items.append(row)
                items.sort(key=lambda x: int((x or {}).get("added_at") or 0), reverse=True)
            changed = True
        elif not on and existing is not None:
            items.remove(existing)
            changed = True
        elif on and existing is not None and src_hash and not _stored_sha(existing):
            existing["sha256"] = src_hash
            changed = True
        count = len(items)
        if changed and not _save_img_favs(data):
            return {"ok": False, "error": "写入收藏失败", "on": (existing is not None), "count": count}
    rating_moves = []
    if absorb:
        _relocate_fav_copy(absorb[0], absorb[1], fn, sub)
        rating_moves.append((absorb[2], absorb[3]))
    for extra_name, extra_sub, extra_key in extra_drops:
        try:
            _drop_fav_copy(extra_name, extra_sub)
        except Exception:
            pass
        rating_moves.append((extra_key, key))
    if rating_moves:
        _apply_rating_moves(rating_moves)
    if on:
        try:
            _ensure_fav_copy(path, fn, sub)
        except Exception:
            pass
    elif changed:
        try:
            _drop_fav_copy(fn, sub)
        except Exception:
            pass
    return {"ok": True, "on": on, "count": count, "key": key}



def _clamp_rating(n):
    try:
        n = int(n)
    except Exception:
        n = 0
    if n < 0:
        n = 0
    if n > 5:
        n = 5
    return n


def _empty_img_rates():
    return {"ver": IMG_RATE_VER, "ratings": {}}


def _load_img_rates():
    global _IMG_RATE_LIVE, _IMG_RATE_LIVE_MT
    if not os.path.isfile(IMG_RATE_FILE):
        data = _empty_img_rates()
        _IMG_RATE_LIVE = data
        _IMG_RATE_LIVE_MT = None
        return data
    try:
        mt = os.path.getmtime(IMG_RATE_FILE)
    except OSError:
        mt = None
    if (
        _IMG_RATE_LIVE is not None
        and _IMG_RATE_LIVE_MT == mt
        and isinstance(_IMG_RATE_LIVE, dict)
        and isinstance(_IMG_RATE_LIVE.get("ratings"), dict)
    ):
        return _IMG_RATE_LIVE
    try:
        with open(IMG_RATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = _empty_img_rates()
    if not isinstance(data, dict) or not isinstance(data.get("ratings"), dict):
        data = _empty_img_rates()
    data["ver"] = IMG_RATE_VER
    _IMG_RATE_LIVE = data
    _IMG_RATE_LIVE_MT = mt
    return data


def _save_img_rates(data):
    global _IMG_RATE_LIVE, _IMG_RATE_LIVE_MT
    if not isinstance(data, dict):
        return False
    tmp = IMG_RATE_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, IMG_RATE_FILE)
        _IMG_RATE_LIVE = data
        try:
            _IMG_RATE_LIVE_MT = os.path.getmtime(IMG_RATE_FILE)
        except OSError:
            _IMG_RATE_LIVE_MT = None
        return True
    except Exception:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


def img_rate_map():
    data = _load_img_rates()
    out = {}
    ratings = data.get("ratings") or {}
    for k, v in ratings.items():
        n = _clamp_rating(v)
        if n:
            out[str(k)] = n
    return out


def img_rate_set(filename, subfolder="", rating=0):
    filename = (filename or "").strip()
    sub = (subfolder or "").replace("\\", "/").strip("/")
    rating = _clamp_rating(rating)
    if not filename:
        return {"ok": False, "error": "缺少文件名", "rating": 0}
    if _is_img_fav_sub(sub):
        return {"ok": False, "error": "错误的子目录", "rating": 0}
    try:
        root = _output_root()
        path, _s, fn = _safe_file(root, sub, filename)
    except Exception as e:
        return {"ok": False, "error": str(e), "rating": 0}
    if not fn or not os.path.isfile(path):
        return {"ok": False, "error": "文件不存在", "rating": 0}
    key = _img_fav_key(fn, sub)
    with _IMG_RATE_LOCK:
        data = _load_img_rates()
        ratings = dict(data.get("ratings") or {})
        if rating:
            ratings[key] = rating
        else:
            ratings.pop(key, None)
        data["ratings"] = ratings
        if not _save_img_rates(data):
            return {"ok": False, "error": "写入评分失败", "rating": rating, "key": key}
    return {"ok": True, "rating": rating, "key": key}


def img_rate_drop(filename, subfolder=""):
    filename = (filename or "").strip()
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if not filename:
        return
    key = _img_fav_key(filename, sub)
    with _IMG_RATE_LOCK:
        data = _load_img_rates()
        ratings = dict(data.get("ratings") or {})
        if key not in ratings:
            return
        ratings.pop(key, None)
        data["ratings"] = ratings
        _save_img_rates(data)


def img_fav_drop(filename, subfolder=""):
    filename = (filename or "").strip()
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if not filename:
        return
    key = _img_fav_key(filename, sub)
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items")
        if not isinstance(items, list):
            return
        keep = []
        changed = False
        for it in items:
            if isinstance(it, dict) and _img_fav_key(it.get("filename"), it.get("subfolder")) == key:
                changed = True
                continue
            keep.append(it)
        if not changed:
            return
        data["items"] = keep
        _save_img_favs(data)
    try:
        _drop_fav_copy(filename, sub)
    except Exception:
        pass


def _is_trash_sub(subfolder):
    sub = (subfolder or "").replace(chr(92), "/").strip("/")
    return sub == OPV_TRASH_SUB or sub.startswith(OPV_TRASH_SUB + "/")


def _reserved_folder_names():
    return (IMG_FAV_COPY_SUB, IMG_FAV_SUB, OPV_TRASH_SUB)


def _safe_folder_name(name):
    name = (name or "").strip()
    if not name or name in (".", ".."):
        raise ValueError("名称无效")
    if name.startswith("."):
        raise ValueError("名称无效")
    bad = set('<>:"/\\|?*')
    if any((c in bad) or (ord(c) < 32) for c in name):
        raise ValueError("名称含非法字符")
    if name in _reserved_folder_names():
        raise ValueError("不能使用保留名称")
    if len(name) > 80:
        raise ValueError("名称太长")
    if name.endswith(".") or name.endswith(" "):
        raise ValueError("名称无效")
    return name


def _empty_trash_meta():
    return {"ver": TRASH_VER, "retention_days": TRASH_DAYS, "items": []}


def _load_trash():
    global _TRASH_LIVE, _TRASH_LIVE_MT
    if not os.path.isfile(TRASH_FILE):
        data = _empty_trash_meta()
        _TRASH_LIVE = data
        _TRASH_LIVE_MT = None
        return data
    try:
        mt = os.path.getmtime(TRASH_FILE)
    except OSError:
        mt = None
    if (
        _TRASH_LIVE is not None
        and _TRASH_LIVE_MT == mt
        and isinstance(_TRASH_LIVE, dict)
        and isinstance(_TRASH_LIVE.get("items"), list)
    ):
        return _TRASH_LIVE
    try:
        with open(TRASH_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = _empty_trash_meta()
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        data = _empty_trash_meta()
    data["ver"] = TRASH_VER
    if not int(data.get("retention_days") or 0):
        data["retention_days"] = TRASH_DAYS
    _TRASH_LIVE = data
    _TRASH_LIVE_MT = mt
    return data


def _save_trash(data):
    global _TRASH_LIVE, _TRASH_LIVE_MT
    if not isinstance(data, dict):
        return False
    tmp = TRASH_FILE + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, TRASH_FILE)
        _TRASH_LIVE = data
        try:
            _TRASH_LIVE_MT = os.path.getmtime(TRASH_FILE)
        except OSError:
            _TRASH_LIVE_MT = None
        return True
    except Exception:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass
        return False


def _trash_public(purged=0):
    data = _load_trash()
    items = data.get("items") or []
    n_folder = 0
    for it in items:
        if isinstance(it, dict) and (it.get("kind") or "folder") == "folder":
            n_folder += 1
    n_file = 0
    try:
        root = _output_root()
        trash_root = os.path.join(root, OPV_TRASH_SUB)
        if os.path.isdir(trash_root):
            for dirpath, dirnames, names in os.walk(trash_root):
                dirnames[:] = [d for d in dirnames if not str(d).startswith(".")]
                for name in names:
                    if str(name).startswith("."):
                        continue
                    if os.path.splitext(name)[1].lower() in IMG_EXT:
                        n_file += 1
    except Exception:
        pass
    try:
        days = int(data.get("retention_days") or TRASH_DAYS)
    except Exception:
        days = TRASH_DAYS
    return {
        "count": n_file,
        "folders": n_folder,
        "retention_days": days,
        "purged": int(purged or 0),
        "subfolder": OPV_TRASH_SUB,
    }


def _list_extras(sub):
    try:
        trash = _trash_public()
    except Exception:
        trash = {"count": 0, "folders": 0, "retention_days": TRASH_DAYS, "purged": 0, "subfolder": OPV_TRASH_SUB}
    return {
        "is_trash": _is_trash_sub(sub),
        "trash": trash,
        "trash_sub": OPV_TRASH_SUB,
    }


def _maybe_purge_trash():
    global _LAST_PURGE
    now = time.time()
    if now - float(_LAST_PURGE or 0) < 60:
        return 0
    _LAST_PURGE = now
    try:
        return purge_expired_trash()
    except Exception:
        return 0


def _trash_dest_root():
    root = _output_root()
    dest = os.path.abspath(os.path.join(root, OPV_TRASH_SUB))
    os.makedirs(dest, exist_ok=True)
    return dest


def _unique_child(parent, name):
    dest = os.path.join(parent, name)
    if not os.path.exists(dest):
        return dest, name
    for i in range(2, 80):
        alt = "%s__%s" % (name, i)
        dest = os.path.join(parent, alt)
        if not os.path.exists(dest):
            return dest, alt
    alt = "%s__%s" % (name, int(time.time()))
    return os.path.join(parent, alt), alt


def mkdir_output(parent, name):
    try:
        parent = _safe_sub(parent)
        name = _safe_folder_name(name)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if _is_img_fav_sub(parent) or _is_skipped_sub(parent) or _is_trash_sub(parent):
        return {"ok": False, "error": "不能在这里新建文件夹"}
    root = _output_root()
    base = os.path.join(root, parent) if parent else root
    path = os.path.abspath(os.path.join(base, name))
    if not _is_inside(root, path):
        return {"ok": False, "error": "路径无效"}
    if os.path.exists(path):
        return {"ok": False, "error": "文件夹已存在"}
    os.makedirs(path)
    rel = (parent + "/" + name) if parent else name
    return {"ok": True, "subfolder": rel.replace("\\", "/"), "name": name}


def list_manage_folders(current=""):
    try:
        _maybe_purge_trash()
    except Exception:
        pass
    cur = _safe_sub(current)
    folders = [{"name": "", "subfolder": "", "label": "output"}]
    for child in iter_output_subs("", True):
        if not child:
            continue
        if _is_skipped_sub(child) or _is_trash_sub(child):
            continue
        folders.append({"name": child.split("/")[-1], "subfolder": child})
        if len(folders) >= 240:
            break
    return {"ok": True, "folders": folders, "current": cur}


def _retarget_img_keys(old_sub, old_fn, new_sub, new_fn):
    old_sub = (old_sub or "").replace("\\", "/").strip("/")
    new_sub = (new_sub or "").replace("\\", "/").strip("/")
    old_fn = os.path.basename(old_fn or "")
    new_fn = os.path.basename(new_fn or "")
    if not old_fn or not new_fn:
        return
    old_key = _img_fav_key(old_fn, old_sub)
    new_key = _img_fav_key(new_fn, new_sub)
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items")
        changed = False
        if isinstance(items, list):
            for it in items:
                if not isinstance(it, dict):
                    continue
                if _img_fav_key(it.get("filename"), it.get("subfolder")) == old_key:
                    it["filename"] = new_fn
                    it["subfolder"] = new_sub
                    changed = True
            if changed:
                _save_img_favs(data)
    _relocate_fav_copy(old_fn, old_sub, new_fn, new_sub)
    with _IMG_RATE_LOCK:
        data = _load_img_rates()
        ratings = dict(data.get("ratings") or {})
        if old_key in ratings:
            val = ratings.pop(old_key)
            ratings[new_key] = val
            data["ratings"] = ratings
            _save_img_rates(data)


def _drop_index_tree(root, sub):
    sub = (sub or "").replace("\\", "/").strip("/")
    if not sub:
        return
    prefix = sub + "/"
    with _INDEX_LOCK:
        data = _load_index(root)
        folders = data.get("folders") if isinstance(data, dict) else None
        if not isinstance(folders, dict):
            return
        changed = False
        for key in list(folders.keys()):
            k = (key or "").replace("\\", "/").strip("/")
            if k == sub or k.startswith(prefix):
                folders.pop(key, None)
                changed = True
        if changed:
            try:
                _save_index(data)
            except Exception:
                pass


def _retarget_moved_batch(moved):
    pairs = []
    for it in moved or []:
        old_sub = (it.get("from") or "").replace("\\", "/").strip("/")
        new_sub = (it.get("subfolder") or "").replace("\\", "/").strip("/")
        name = os.path.basename(it.get("filename") or "")
        if not name or old_sub == new_sub:
            continue
        pairs.append((old_sub, name, new_sub, name))
    if not pairs:
        return
    with _IMG_FAV_LOCK:
        data = _load_img_favs()
        items = data.get("items") if isinstance(data, dict) else None
        changed = False
        if isinstance(items, list):
            by_key = {}
            for fav in items:
                if not isinstance(fav, dict):
                    continue
                by_key[_img_fav_key(fav.get("filename"), fav.get("subfolder"))] = fav
            for old_sub, name, new_sub, new_name in pairs:
                old_key = _img_fav_key(name, old_sub)
                fav = by_key.get(old_key)
                if fav is None:
                    continue
                fav["filename"] = new_name
                fav["subfolder"] = new_sub
                by_key.pop(old_key, None)
                by_key[_img_fav_key(new_name, new_sub)] = fav
                changed = True
            if changed:
                _save_img_favs(data)
    for old_sub, name, new_sub, new_name in pairs:
        _relocate_fav_copy(name, old_sub, new_name, new_sub)
    with _IMG_RATE_LOCK:
        data = _load_img_rates()
        ratings = dict((data.get("ratings") if isinstance(data, dict) else None) or {})
        rate_changed = False
        for old_sub, name, new_sub, new_name in pairs:
            old_key = _img_fav_key(name, old_sub)
            if old_key not in ratings:
                continue
            ratings[_img_fav_key(new_name, new_sub)] = ratings.pop(old_key)
            rate_changed = True
        if rate_changed and isinstance(data, dict):
            data["ratings"] = ratings
            _save_img_rates(data)


def _scope_has_folder(scope, deep, folder):
    scope = (scope or "").replace("\\", "/").strip("/")
    folder = (folder or "").replace("\\", "/").strip("/")
    if not deep:
        return folder == scope
    if not scope:
        return True
    return folder == scope or folder.startswith(scope + "/")


def _scope_move_delta(scope, deep, src, dst):
    inn_src = _scope_has_folder(scope, deep, src)
    inn_dst = _scope_has_folder(scope, deep, dst)
    if inn_src == inn_dst:
        return 0
    return -1 if inn_src else 1


def _apply_count_map(rows, acc, labels):
    if not isinstance(rows, list) or not acc:
        return []
    index = {}
    for it in rows:
        if isinstance(it, dict) and it.get("key"):
            index[it["key"]] = it
    fresh = []
    for key, delta in acc.items():
        if not key or not delta:
            continue
        it = index.get(key)
        if it is not None:
            it["count"] = int(it.get("count") or 0) + int(delta)
        elif delta > 0:
            row = {"tag": (labels or {}).get(key) or key, "key": key, "count": int(delta)}
            rows.append(row)
            index[key] = row
            fresh.append(row)
    kept = [it for it in rows if isinstance(it, dict) and int(it.get("count") or 0) > 0]
    if len(kept) != len(rows):
        rows[:] = kept
    return fresh


def _sort_count_rows(rows):
    rows.sort(key=lambda x: (-int(x.get("count") or 0), str(x.get("key") or "")))


def _sort_series_rows(rows):
    def rank(row):
        k = row.get("key")
        band = 0 if k == FACET_ORIGINAL else 1 if k == FACET_NONE else 2
        return (band, -int(row.get("count") or 0), str(k or ""))
    rows.sort(key=rank)


def _cast_move_parts(rec):
    char_tags = {}
    for raw in (rec or {}).get("characters") or []:
        k = facet_norm(raw)
        if k and k not in char_tags:
            char_tags[k] = raw
    ser_tags = {}
    ser_keys = []
    for raw in effective_series(rec):
        k = facet_norm(raw)
        if not k or k in ser_tags:
            continue
        ser_tags[k] = raw
        ser_keys.append(k)
    buckets = list(ser_keys)
    none = False
    if not buckets and char_tags:
        buckets = [FACET_NONE]
        none = True
        ser_tags[FACET_NONE] = FACET_NONE
    return char_tags, list(char_tags.keys()), ser_tags, buckets, none, FACET_ORIGINAL in ser_keys


def _artist_move_pairs(rec):
    pairs = []
    seen = set()
    for raw in (rec or {}).get("artists") or []:
        key = artist_norm(raw)
        if not key or key in seen:
            continue
        seen.add(key)
        pairs.append((key, raw))
    return pairs


def _patch_tag_payload(payload, relevant):
    acc = {}
    for rec, delta in relevant:
        for key in rec_tag_keys(rec):
            acc[key] = acc.get(key, 0) + delta
    rows = payload.setdefault("tags", [])
    fresh = _apply_count_map(rows, acc, None)
    _sort_count_rows(rows)
    if fresh:
        _apply_facet_cn(fresh)
    payload["png"] = max(0, int(payload.get("png") or 0) + sum(delta for _rec, delta in relevant))


def _patch_artist_payload(payload, relevant):
    acc = {}
    labels = {}
    for rec, delta in relevant:
        for key, raw in _artist_move_pairs(rec):
            acc[key] = acc.get(key, 0) + delta
            labels.setdefault(key, raw)
    rows = payload.setdefault("artists", [])
    _apply_count_map(rows, acc, labels)
    _sort_count_rows(rows)
    payload["png"] = max(0, int(payload.get("png") or 0) + sum(delta for _rec, delta in relevant))


def _patch_cast_payload(payload, relevant):
    series_acc = {}
    series_label = {}
    char_acc = {}
    char_label = {}
    under = {}
    none_n = 0
    orig_n = 0
    for rec, delta in relevant:
        char_tags, char_keys, ser_tags, buckets, none, orig = _cast_move_parts(rec)
        for sk in buckets:
            series_acc[sk] = series_acc.get(sk, 0) + delta
            series_label.setdefault(sk, ser_tags.get(sk) or sk)
            bucket = under.setdefault(sk, {})
            for ck in char_keys:
                bucket[ck] = bucket.get(ck, 0) + delta
                char_label.setdefault(ck, char_tags.get(ck) or ck)
        for ck in char_keys:
            char_acc[ck] = char_acc.get(ck, 0) + delta
            char_label.setdefault(ck, char_tags.get(ck) or ck)
        if none:
            none_n += delta
        if orig:
            orig_n += delta
    series = payload.setdefault("series", [])
    characters = payload.setdefault("characters", [])
    series_chars = payload.setdefault("series_chars", {})
    if not isinstance(series_chars, dict):
        series_chars = {}
        payload["series_chars"] = series_chars
    fresh = []
    fresh.extend(_apply_count_map(series, series_acc, series_label))
    fresh.extend(_apply_count_map(characters, char_acc, char_label))
    for sk, bucket_acc in under.items():
        bucket = series_chars.get(sk)
        if not isinstance(bucket, list):
            bucket = []
            series_chars[sk] = bucket
        fresh.extend(_apply_count_map(bucket, bucket_acc, char_label))
        if bucket:
            _sort_count_rows(bucket)
            series_chars[sk] = bucket
        else:
            series_chars.pop(sk, None)
    _sort_series_rows(series)
    _sort_count_rows(characters)
    if fresh:
        _apply_facet_cn(fresh)
    if none_n:
        payload["none"] = max(0, int(payload.get("none") or 0) + none_n)
    if orig_n:
        payload["original"] = max(0, int(payload.get("original") or 0) + orig_n)
    payload["png"] = max(0, int(payload.get("png") or 0) + sum(delta for _rec, delta in relevant))


def _patch_agg_for_moves(shifts):
    if not shifts or not _AGG_CACHE:
        return
    drop = []
    for key, payload in list(_AGG_CACHE.items()):
        if not isinstance(key, tuple) or len(key) != 3 or not isinstance(payload, dict):
            continue
        kind, scope, deep = key
        relevant = []
        for src, dst, rec in shifts:
            delta = _scope_move_delta(scope, deep, src, dst)
            if delta and isinstance(rec, dict):
                relevant.append((rec, delta))
        if not relevant:
            continue
        if kind == "used":
            drop.append(key)
            continue
        if kind == "tag":
            _patch_tag_payload(payload, relevant)
        elif kind == "artist":
            _patch_artist_payload(payload, relevant)
        elif kind == "cast":
            _patch_cast_payload(payload, relevant)
    for key in drop:
        _AGG_CACHE.pop(key, None)


def _drop_index_moved(root, moved):
    """把已索引的记录从源文件夹挪到目标文件夹，不重新读 PNG。"""
    shifts = []
    with _INDEX_LOCK:
        data = _load_index(root)
        folders = data.get("folders") if isinstance(data, dict) else None
        if not isinstance(folders, dict):
            return
        changed = False
        for it in moved or []:
            if not isinstance(it, dict):
                continue
            name = os.path.basename(it.get("filename") or "")
            src = (it.get("from") or "").replace("\\", "/").strip("/")
            dst = (it.get("subfolder") or "").replace("\\", "/").strip("/")
            if not name or src == dst:
                continue
            src_bucket = folders.get(src) or {}
            src_files = src_bucket.get("files") if isinstance(src_bucket, dict) else None
            if not isinstance(src_files, dict) or name not in src_files:
                continue
            rec = src_files.get(name)
            if not isinstance(rec, dict):
                continue
            src_files = dict(src_files)
            src_files.pop(name, None)
            folders[src] = {"files": src_files}
            dst_bucket = folders.get(dst) or {}
            dst_files = dst_bucket.get("files") if isinstance(dst_bucket, dict) else None
            dst_files = dict(dst_files) if isinstance(dst_files, dict) else {}
            dst_files[name] = rec
            folders[dst] = {"files": dst_files}
            shifts.append((src, dst, rec))
            changed = True
        if changed:
            try:
                _save_index(data, clear_agg=False)
            except Exception:
                shifts = []
    if shifts:
        _patch_agg_for_moves(shifts)


def move_output_items(items=None, dest_sub="", source_sub="", all_in_folder=False):
    dest_sub = _safe_sub(dest_sub)
    source_sub = _safe_sub(source_sub)
    if _is_img_fav_sub(dest_sub) or _is_skipped_sub(dest_sub) or _is_trash_sub(dest_sub):
        return {"ok": False, "error": "不能移到这里"}
    root = _output_root()
    dest_dir = os.path.join(root, dest_sub) if dest_sub else root
    dest_dir = os.path.abspath(dest_dir)
    if not _is_inside(root, dest_dir):
        return {"ok": False, "error": "目标无效"}
    os.makedirs(dest_dir, exist_ok=True)
    jobs = []
    if all_in_folder:
        if _is_img_fav_sub(source_sub) or _is_skipped_sub(source_sub) or _is_trash_sub(source_sub):
            return {"ok": False, "error": "不能从这里移动"}
        src_dir = os.path.join(root, source_sub) if source_sub else root
        if not os.path.isdir(src_dir):
            return {"ok": False, "error": "源文件夹不存在"}
        _folders, files = _scan_folder_entries(src_dir, source_sub)
        for name, _mt, _sz in files:
            jobs.append((source_sub, name))
    else:
        for it in items or []:
            if not isinstance(it, dict):
                continue
            fn = os.path.basename(str(it.get("filename") or "").strip())
            try:
                sub = _safe_sub(it.get("subfolder") or "")
            except Exception:
                continue
            if not fn:
                continue
            if _is_img_fav_sub(sub) or _is_skipped_sub(sub) or _is_trash_sub(sub):
                continue
            jobs.append((sub, fn))
    if len(jobs) > 400:
        return {"ok": False, "error": "一次移动太多文件"}
    moved = []
    errors = []
    for sub, fn in jobs:
        if dest_sub == sub:
            continue
        try:
            src, _s, name = _safe_file(root, sub, fn)
        except Exception as e:
            errors.append(str(e))
            continue
        if not os.path.isfile(src):
            errors.append(fn + " 不存在")
            continue
        dest = os.path.abspath(os.path.join(dest_dir, name))
        if not _is_inside(root, dest):
            errors.append(name + " 目标无效")
            continue
        if os.path.exists(dest):
            errors.append(name + " 目标已有同名文件")
            continue
        try:
            shutil.move(src, dest)
        except Exception as e:
            errors.append(name + ": " + str(e))
            continue
        moved.append({"filename": name, "from": sub, "subfolder": dest_sub})
    if moved:
        try:
            _retarget_moved_batch(moved)
        except Exception:
            pass
        try:
            _drop_index_moved(root, moved)
        except Exception:
            pass
    return {"ok": True, "moved": len(moved), "items": moved, "errors": errors, "dest": dest_sub}


def trash_output_folder(subfolder):
    try:
        sub = _safe_sub(subfolder)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    if not sub:
        return {"ok": False, "error": "不能回收根目录"}
    if _is_img_fav_sub(sub) or _is_skipped_sub(sub) or _is_trash_sub(sub):
        return {"ok": False, "error": "不能回收这个文件夹"}
    parts = [p for p in sub.split("/") if p]
    name = parts[-1]
    from_parent = "/".join(parts[:-1])
    root = _output_root()
    src = os.path.abspath(os.path.join(root, *parts))
    if not _is_inside(root, src) or not os.path.isdir(src):
        return {"ok": False, "error": "文件夹不存在"}
    trash_root = _trash_dest_root()
    dest, trash_name = _unique_child(trash_root, name)
    dest = os.path.abspath(dest)
    if not _is_inside(trash_root, dest):
        return {"ok": False, "error": "回收路径无效"}
    try:
        shutil.move(src, dest)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    rec = {
        "kind": "folder",
        "name": name,
        "from_parent": from_parent,
        "trash_rel": trash_name,
        "trashed_at": int(time.time()),
    }
    with _TRASH_LOCK:
        data = _load_trash()
        items = data.get("items")
        if not isinstance(items, list):
            items = []
            data["items"] = items
        items.append(rec)
        _save_trash(data)
    try:
        _drop_index_tree(root, sub)
    except Exception:
        pass
    return {"ok": True, "item": rec, "subfolder": OPV_TRASH_SUB}


def restore_trash_folder(trash_rel):
    rel = (trash_rel or "").replace("\\", "/").strip("/")
    if "/" in rel:
        rel = rel.split("/")[0]
    if not rel or rel in (".", ".."):
        return {"ok": False, "error": "无效项目"}
    rec = None
    with _TRASH_LOCK:
        data = _load_trash()
        items = data.get("items")
        if not isinstance(items, list):
            items = []
        keep = []
        for it in items:
            if isinstance(it, dict) and (it.get("trash_rel") or "") == rel:
                rec = it
                continue
            keep.append(it)
        if rec is None:
            rec = {"kind": "folder", "name": rel, "from_parent": "", "trash_rel": rel, "trashed_at": 0}
        data["items"] = keep
        _save_trash(data)
    root = _output_root()
    trash_root = _trash_dest_root()
    src = os.path.abspath(os.path.join(trash_root, rel))
    if not _is_inside(trash_root, src) or not os.path.isdir(src):
        return {"ok": False, "error": "回收站里没有这个文件夹"}
    dest_name = rec.get("name") or rel
    try:
        dest_name = _safe_folder_name(dest_name)
    except Exception:
        dest_name = rel.split("__")[0] or rel
    try:
        from_parent = _safe_sub(rec.get("from_parent") or "")
    except Exception:
        from_parent = ""
    dest_parent = os.path.join(root, from_parent) if from_parent else root
    os.makedirs(dest_parent, exist_ok=True)
    dest = os.path.abspath(os.path.join(dest_parent, dest_name))
    out_sub = (from_parent + "/" + dest_name) if from_parent else dest_name
    if not _is_inside(root, dest) or _is_trash_sub(out_sub) or _is_skipped_sub(out_sub):
        return {"ok": False, "error": "还原目标无效"}
    if os.path.exists(dest):
        with _TRASH_LOCK:
            data = _load_trash()
            items = data.get("items")
            if isinstance(items, list):
                items.append(rec)
                _save_trash(data)
        return {"ok": False, "error": "原位置已有同名文件夹，无法还原"}
    try:
        shutil.move(src, dest)
    except Exception as e:
        with _TRASH_LOCK:
            data = _load_trash()
            items = data.get("items")
            if isinstance(items, list):
                items.append(rec)
                _save_trash(data)
        return {"ok": False, "error": str(e)}
    return {"ok": True, "subfolder": out_sub.replace("\\", "/")}


def empty_opv_trash():
    root = _output_root()
    trash_root = os.path.abspath(os.path.join(root, OPV_TRASH_SUB))
    if os.path.isdir(trash_root) and _is_inside(root, trash_root):
        try:
            names = os.listdir(trash_root)
        except OSError:
            names = []
        for name in names:
            path = os.path.join(trash_root, name)
            try:
                if os.path.isdir(path) and not os.path.islink(path):
                    shutil.rmtree(path)
                elif os.path.isfile(path) or os.path.islink(path):
                    os.remove(path)
            except OSError:
                pass
    with _TRASH_LOCK:
        _save_trash(_empty_trash_meta())
    return {"ok": True}


def _purge_path(path):
    try:
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        elif os.path.isfile(path) or os.path.islink(path):
            os.remove(path)
        return True
    except OSError:
        return False


def purge_expired_trash(now=None):
    now = int(now or time.time())
    days = TRASH_DAYS
    purged = 0
    with _TRASH_LOCK:
        data = _load_trash()
        try:
            days = int(data.get("retention_days") or TRASH_DAYS)
        except Exception:
            days = TRASH_DAYS
        if days < 1:
            days = 1
        limit = days * 24 * 3600
        items = data.get("items")
        if not isinstance(items, list):
            items = []
        keep = []
        root = _output_root()
        trash_root = os.path.abspath(os.path.join(root, OPV_TRASH_SUB))
        for it in items:
            if not isinstance(it, dict):
                continue
            rel = str(it.get("trash_rel") or "").replace("\\", "/").strip("/")
            try:
                ts = int(it.get("trashed_at") or 0)
            except Exception:
                ts = 0
            if not rel or ("/" in rel) or rel in (".", ".."):
                continue
            path = os.path.abspath(os.path.join(trash_root, rel))
            expired = bool(ts) and (now - ts >= limit)
            if not expired:
                keep.append(it)
                continue
            if os.path.exists(path) and _is_inside(trash_root, path):
                if _purge_path(path):
                    purged += 1
                else:
                    keep.append(it)
                    continue
            else:
                purged += 1
        data["items"] = keep
        data["retention_days"] = days
        _save_trash(data)
        if os.path.isdir(trash_root):
            known = set((it.get("trash_rel") or "") for it in keep if isinstance(it, dict))
            try:
                for ent in os.scandir(trash_root):
                    if ent.name.startswith("."):
                        continue
                    if ent.name in known:
                        continue
                    try:
                        st = ent.stat(follow_symlinks=False)
                    except OSError:
                        continue
                    if now - int(st.st_mtime) < limit:
                        continue
                    path = os.path.abspath(ent.path)
                    if _is_inside(trash_root, path) and _purge_path(path):
                        purged += 1
            except OSError:
                pass
    return purged

def _norm_sort(sort):
    s = str(sort or "").strip().lower()
    if s in ("oldest", "old", "asc", "mtime_asc"):
        return "oldest"
    if s in ("rating", "rate", "rating_desc", "high", "score"):
        return "rating"
    if s in ("rating_asc", "rating_low", "low"):
        return "rating_asc"
    return "newest"


def _norm_rate_filter(rate):
    if isinstance(rate, str):
        s = rate.strip().lower()
        if s in ("none", "unrated", "-1"):
            return -1
    try:
        n = int(rate)
    except (TypeError, ValueError):
        return 0
    if n == -1:
        return -1
    if 1 <= n <= 5:
        return n
    return 0


def _heart_ok(got, want):
    want = _norm_rate_filter(want)
    if want == 0:
        return True
    try:
        got_n = int(got or 0)
    except (TypeError, ValueError):
        got_n = 0
    if want < 0:
        return got_n < 1 or got_n > 5
    return got_n == want


def list_img_favs(page=1, page_size=24, artist="", solo=False, series="", character="", tag="", sort="newest", heart=0, model="", exact=False):
    root = _output_root()
    want_keys = artist_key_list(artist)
    want = ",".join(want_keys)
    solo = bool(solo)
    exact = bool(exact) and bool(want_keys)
    series_key = facet_norm(series)
    character_key = facet_norm(character)
    tag_key = facet_norm(tag)
    sort = _norm_sort(sort)
    heart = _norm_rate_filter(heart)
    model_ids = model_id_list(model)
    rates = img_rate_map()
    need_index = bool(want_keys or solo or series_key or character_key or tag_key or model_ids)
    data = _load_img_favs()
    rows = []
    for it in data.get("items") or []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("filename") or "").strip()
        child = str(it.get("subfolder") or "").replace("\\", "/").strip("/")
        if not name or _is_img_fav_sub(child):
            continue
        folder = os.path.join(root, child) if child else root
        path = os.path.join(folder, name)
        copy_path = ""
        copy_sub = ""
        try:
            copy_path, copy_sub, _cf = _fav_copy_abs(name, child)
        except Exception:
            copy_path, copy_sub = "", ""
        orig_ok = False
        try:
            orig_ok = _is_inside(root, path) and os.path.isfile(path)
        except OSError:
            orig_ok = False
        copy_ok = bool(copy_path and os.path.isfile(copy_path))
        if not orig_ok and not copy_ok:
            continue
        try:
            st = os.stat(path if orig_ok else copy_path)
        except OSError:
            continue
        if orig_ok:
            try:
                _ensure_fav_copy(path, name, child)
            except Exception:
                pass
        if need_index:
            indexed, _stats = ensure_folder_index(child)
            if not file_matches_filters(indexed.get(name), want_keys, solo, series_key, character_key, tag_key, model_ids, exact):
                continue
        added = int(it.get("added_at") or 0) or int(st.st_mtime)
        rate = int(rates.get(_img_fav_key(name, child), 0) or 0)
        if not _heart_ok(rate, heart):
            continue
        rows.append((added, int(st.st_mtime), int(st.st_size), child, name, rate, orig_ok, copy_sub))
    if sort == "oldest":
        rows.sort(key=lambda x: (x[0], x[1], x[4]))
    elif sort == "rating":
        rows.sort(key=lambda x: (-x[5], -x[0], x[4]))
    elif sort == "rating_asc":
        rows.sort(key=lambda x: (x[5], x[0], x[4]))
    else:
        rows.sort(key=lambda x: (-x[0], -x[1], x[4]))
    total = len(rows)
    page_size = max(1, min(int(page_size or 24), 120))
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(int(page or 1), pages))
    start = (page - 1) * page_size
    items = []
    for added, mtime, size, child, name, rate, orig_ok, copy_sub in rows[start:start + page_size]:
        view_sub = child if orig_ok else (copy_sub or child)
        items.append({
            "filename": name,
            "subfolder": child,
            "mtime": mtime,
            "size": size,
            "url": _fav_item_url(name, child, orig_ok, copy_sub),
            "added_at": added,
            "rating": rate,
        })
    fav_out = {
        "ok": True,
        "subfolder": IMG_FAV_SUB,
        "parent": "",
        "folders": [],
        "items": items,
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": page_size,
        "root_name": "output",
        "is_img_favs": True,
        "sort": sort,
        "heart": heart,
        "artist": want,
        "solo": solo,
        "exact": exact,
        "series": series_key,
        "character": character_key,
        "tag": tag_key,
        "deep": True,
    }
    fav_out.update(_list_extras(IMG_FAV_SUB))
    return fav_out


def stamp_img_favs():
    out = {
        "ok": True,
        "subfolder": IMG_FAV_SUB,
        "deep": False,
        "count": 0,
        "folders": 0,
        "newest_mtime": 0,
        "newest_name": "",
        "is_img_favs": True,
    }
    root = _output_root()
    newest_mtime = 0
    newest_name = ""
    count = 0
    for it in _load_img_favs().get("items") or []:
        if not isinstance(it, dict):
            continue
        name = str(it.get("filename") or "").strip()
        child = str(it.get("subfolder") or "").replace("\\", "/").strip("/")
        if not name:
            continue
        folder = os.path.join(root, child) if child else root
        path = os.path.join(folder, name)
        copy_path = ""
        try:
            copy_path, _cs, _cf = _fav_copy_abs(name, child)
        except Exception:
            copy_path = ""
        orig_ok = False
        try:
            orig_ok = _is_inside(root, path) and os.path.isfile(path)
        except OSError:
            orig_ok = False
        copy_ok = bool(copy_path and os.path.isfile(copy_path))
        if not orig_ok and not copy_ok:
            continue
        try:
            st = os.stat(path if orig_ok else copy_path)
        except OSError:
            continue
        count += 1
        added = int(it.get("added_at") or 0)
        mt = added or int(st.st_mtime)
        if mt > newest_mtime or (mt == newest_mtime and name > newest_name):
            newest_mtime = mt
            newest_name = name
    out["count"] = count
    out["newest_mtime"] = int(newest_mtime)
    out["newest_name"] = newest_name
    return out


def list_output(subfolder="", page=1, page_size=24, artist="", solo=False, series="", character="", tag="", deep=True, sort="newest", heart=0, model="", exact=False):
    sort = _norm_sort(sort)
    heart = _norm_rate_filter(heart)
    try:
        _maybe_purge_trash()
    except Exception:
        pass
    model_ids = model_id_list(model)
    model_q = ",".join(model_ids)
    if _is_img_fav_sub(subfolder):
        return list_img_favs(page, page_size, artist, solo, series, character, tag, sort, heart, model_q, exact)
    root = _output_root()
    sub = _safe_sub(subfolder)
    folder = os.path.join(root, sub) if sub else root
    want_keys = artist_key_list(artist)
    want = ",".join(want_keys)
    solo = bool(solo)
    exact = bool(exact) and bool(want_keys)
    deep = bool(deep)
    series_key = facet_norm(series)
    character_key = facet_norm(character)
    tag_key = facet_norm(tag)
    empty = {
        "ok": True, "subfolder": sub, "parent": None, "folders": [], "items": [],
        "page": 1, "pages": 1, "total": 0, "page_size": page_size, "root_name": "output",
        "artist": want, "solo": solo, "exact": exact, "series": series_key, "character": character_key, "tag": tag_key,
        "deep": deep,
        "sort": sort,
        "heart": heart,
        "model": model_q,
    }
    empty.update(_list_extras(sub))
    if _is_skipped_sub(sub):
        return empty
    if not _is_inside(root, folder) or not os.path.isdir(folder):
        return empty
    folders, _files = _scan_folder_entries(folder, sub)
    need_index = bool(want_keys or solo or series_key or character_key or tag_key or model_ids)
    rates = img_rate_map()
    rows = []
    for child in iter_output_subs(sub, deep):
        indexed = {}
        if need_index:
            indexed, _stats = ensure_folder_index(child)
        child_folder = os.path.join(root, child) if child else root
        _child_dirs, child_files = _scan_folder_entries(child_folder, child)
        for name, mtime, size in child_files:
            if need_index and not file_matches_filters(indexed.get(name), want_keys, solo, series_key, character_key, tag_key, model_ids, exact):
                continue
            got_rate = int(rates.get(_img_fav_key(name, child), 0) or 0)
            if not _heart_ok(got_rate, heart):
                continue
            rows.append((name, mtime, size, child, got_rate))
    if sort == "oldest":
        rows.sort(key=lambda x: (x[1], x[0]))
    elif sort == "rating":
        rows.sort(key=lambda x: (-x[4], -x[1], x[0]))
    elif sort == "rating_asc":
        rows.sort(key=lambda x: (x[4], x[1], x[0]))
    else:
        rows.sort(key=lambda x: (-x[1], x[0]))
    total = len(rows)
    page_size = max(1, min(int(page_size or 24), 120))
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(int(page or 1), pages))
    start = (page - 1) * page_size
    chunk = rows[start:start + page_size]
    items = []
    for name, mtime, size, child, rate in chunk:
        items.append({
            "filename": name,
            "subfolder": child,
            "mtime": int(mtime),
            "size": int(size),
            "url": _view_url(name, child),
            "rating": int(rate or 0),
        })
    parent = None
    if sub:
        parts = sub.split("/")
        parent = "/".join(parts[:-1])
    out = {
        "ok": True,
        "subfolder": sub,
        "parent": parent,
        "folders": folders,
        "items": items,
        "page": page,
        "pages": pages,
        "total": total,
        "page_size": page_size,
        "root_name": "output",
        "artist": want,
        "solo": solo,
        "exact": exact,
        "series": series_key,
        "character": character_key,
        "tag": tag_key,
        "deep": deep,
        "sort": sort,
        "heart": heart,
        "model": model_q,
    }
    out.update(_list_extras(sub))
    return out


def _query_flag(request, name, default=False):
    raw = (request.query.get(name) or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return bool(default)


def folder_stamp(subfolder="", deep=True):
    if _is_img_fav_sub(subfolder):
        return stamp_img_favs()
    root = _output_root()
    sub = _safe_sub(subfolder)
    folder = os.path.join(root, sub) if sub else root
    deep = bool(deep)
    out = {
        "ok": True,
        "subfolder": sub,
        "deep": deep,
        "count": 0,
        "folders": 0,
        "newest_mtime": 0,
        "newest_name": "",
    }
    if _is_skipped_sub(sub):
        return out
    if not _is_inside(root, folder) or not os.path.isdir(folder):
        return out
    newest_mtime = 0.0
    newest_name = ""
    count = 0
    folders = 0
    for child in iter_output_subs(sub, deep):
        child_folder = os.path.join(root, child) if child else root
        if not os.path.isdir(child_folder):
            continue
        try:
            with os.scandir(child_folder) as it:
                for ent in it:
                    name = ent.name
                    if _is_skipped_dir_name(name):
                        continue
                    try:
                        if ent.is_dir(follow_symlinks=False):
                            folders += 1
                        elif ent.is_file(follow_symlinks=False):
                            if os.path.splitext(name)[1].lower() not in IMG_EXT:
                                continue
                            st = ent.stat()
                            count += 1
                            mt = st.st_mtime
                            if mt > newest_mtime or (mt == newest_mtime and name > newest_name):
                                newest_mtime = mt
                                newest_name = name
                    except OSError:
                        continue
        except OSError:
            continue
    out["count"] = count
    out["folders"] = folders
    out["newest_mtime"] = int(newest_mtime)
    out["newest_name"] = newest_name
    return out


def _html_path():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "output_prompt_viewer.html")


IDLE_BEFORE_COUNTDOWN_SEC = 10
SHUTDOWN_COUNTDOWN_SEC = 30

_SD_LOCK = threading.Lock()
_sd = {
    "enabled": False,
    "saw_work": False,
    "idle_since": None,
    "countdown_until": None,
    "os_armed": False,
    "queue": 0,
    "error": "",
    "thread": None,
}


def _queue_remaining_now():
    try:
        from server import PromptServer
        ps = PromptServer.instance
        n = int(ps.prompt_queue.get_tasks_remaining())
        return max(0, n)
    except Exception:
        return -1


def _sd_abort_os():
    if sys.platform != "win32":
        return
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    try:
        subprocess.Popen(
            ["shutdown", "/a"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=flags,
        )
    except Exception:
        pass


def _sd_arm_os():
    if sys.platform != "win32":
        return False, "自动关机仅支持 Windows"
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    try:
        r = subprocess.run(
            ["shutdown", "/s", "/t", str(SHUTDOWN_COUNTDOWN_SEC)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=8,
            creationflags=flags,
        )
        if r.returncode not in (0, 1190):
            err = (r.stderr or b"").decode("mbcs", "ignore").strip()
            return False, err or ("shutdown 失败 " + str(r.returncode))
        return True, ""
    except Exception as e:
        return False, str(e)


def _sd_reset_watch(keep_enabled=True):
    _sd["saw_work"] = False
    _sd["idle_since"] = None
    _sd["countdown_until"] = None
    if _sd["os_armed"]:
        _sd_abort_os()
        _sd["os_armed"] = False
    if not keep_enabled:
        _sd["enabled"] = False
        _sd["error"] = ""


def _sd_snapshot():
    now = time.monotonic()
    with _SD_LOCK:
        enabled = bool(_sd["enabled"])
        saw = bool(_sd["saw_work"])
        idle_since = _sd["idle_since"]
        until = _sd["countdown_until"]
        os_armed = bool(_sd["os_armed"])
        q = int(_sd.get("queue") or 0)
        err = _sd.get("error") or ""
    idle_for = 0
    if idle_since:
        idle_for = max(0, now - idle_since)
    cd_left = 0
    if until:
        cd_left = max(0, int(math.ceil(until - now)))
    if not enabled:
        phase = "off"
    elif until:
        phase = "countdown"
    elif saw and idle_since:
        phase = "waiting_idle"
    elif saw:
        phase = "watching"
    else:
        phase = "waiting_work"
    return {
        "ok": True,
        "enabled": enabled,
        "phase": phase,
        "saw_work": saw,
        "queue_remaining": q,
        "idle_for": round(idle_for, 1),
        "idle_need": IDLE_BEFORE_COUNTDOWN_SEC,
        "countdown_left": cd_left,
        "countdown_sec": SHUTDOWN_COUNTDOWN_SEC,
        "os_armed": os_armed,
        "error": err,
        "windows": sys.platform == "win32",
    }


def _sd_loop():
    while True:
        time.sleep(0.4)
        n = _queue_remaining_now()
        now = time.monotonic()
        need_arm = False
        need_abort = False
        with _SD_LOCK:
            if not _sd["enabled"]:
                _sd["queue"] = n if n >= 0 else 0
                continue
            if n < 0:
                _sd["error"] = "读不到任务队列"
                _sd["queue"] = 0
                continue
            _sd["queue"] = n
            if n > 0:
                if _sd["os_armed"]:
                    need_abort = True
                    _sd["os_armed"] = False
                _sd["countdown_until"] = None
                _sd["error"] = ""
                _sd["saw_work"] = True
                _sd["idle_since"] = None
            elif not _sd["saw_work"]:
                _sd["idle_since"] = None
            elif _sd["countdown_until"]:
                if now >= _sd["countdown_until"]:
                    _sd["enabled"] = False
                    _sd["countdown_until"] = None
                    _sd["idle_since"] = None
                    _sd["saw_work"] = False
            elif _sd["idle_since"] is None:
                _sd["idle_since"] = now
            elif (now - _sd["idle_since"]) >= IDLE_BEFORE_COUNTDOWN_SEC:
                need_arm = True
        if need_abort:
            _sd_abort_os()
        if not need_arm:
            continue
        ok, err = _sd_arm_os()
        now2 = time.monotonic()
        with _SD_LOCK:
            if not _sd["enabled"] or _sd["queue"] > 0 or not _sd["saw_work"]:
                if ok:
                    _sd_abort_os()
                continue
            if ok:
                _sd["os_armed"] = True
                _sd["countdown_until"] = now2 + SHUTDOWN_COUNTDOWN_SEC
                _sd["error"] = ""
            else:
                _sd["error"] = err or "无法发起关机"
                _sd["enabled"] = False
                _sd["idle_since"] = None
                _sd["saw_work"] = False


def _sd_ensure_thread():
    th = _sd.get("thread")
    if th is not None and th.is_alive():
        return
    th = threading.Thread(target=_sd_loop, name="opv-auto-shutdown", daemon=True)
    _sd["thread"] = th
    th.start()


def register_routes():
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt_viewer")
    async def serve_page(request):
        # aiohttp 不允许 content_type 里带 charset，会直接 500。
        # 页面由 WEB_DIRECTORY 静态提供，这里只跳转。
        raise web.HTTPFound("/extensions/ComfyUI-Danbooru-Anima-Prompt/output_prompt_viewer.html")

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/list")
    async def api_list(request):
        try:
            page = int(request.query.get("page") or 1)
        except Exception:
            page = 1
        try:
            page_size = int(request.query.get("page_size") or 24)
        except Exception:
            page_size = 24
        sub = request.query.get("subfolder") or ""
        artist = request.query.get("artist_key") or request.query.get("artist") or ""
        solo_raw = (request.query.get("solo") or request.query.get("solo_artist") or "").strip().lower()
        solo = solo_raw in ("1", "true", "yes", "on")
        exact = _query_flag(request, "exact", False)
        try:
            loop = asyncio.get_running_loop()
            series = request.query.get("series_key") or request.query.get("series") or ""
            character = request.query.get("character_key") or request.query.get("character") or ""
            tag = request.query.get("tag_key") or request.query.get("tag") or ""
            deep = _query_flag(request, "deep", True)
            sort = _norm_sort(request.query.get("sort"))
            heart = _norm_rate_filter(request.query.get("heart"))
            model = request.query.get("model") or ""
            data = await loop.run_in_executor(None, list_output, sub, page, page_size, artist, solo, series, character, tag, deep, sort, heart, model, exact)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "items": [], "folders": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/stamp")
    async def api_stamp(request):
        sub = request.query.get("subfolder") or ""
        deep = _query_flag(request, "deep", True)
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, folder_stamp, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "count": 0, "folders": 0, "newest_mtime": 0, "newest_name": ""}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/img_favs")
    async def api_img_favs(request):
        try:
            loop = asyncio.get_running_loop()
            def _fav_payload():
                pending = schedule_fav_reconcile()
                return {
                    "ok": True,
                    "count": None,
                    "keys": sorted(img_fav_keys()),
                    "items": list(_load_img_favs().get("items") or []),
                    "reconciling": bool(pending or fav_reconcile_running()),
                }
            data = await loop.run_in_executor(None, _fav_payload)
            data["count"] = len(data.get("items") or [])
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "count": 0, "keys": [], "items": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/img_ratings")
    async def api_img_ratings(request):
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, img_rate_map)
            return web.json_response({"ok": True, "ratings": data})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "ratings": {}}, status=200)

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/img_rate")
    async def api_img_rate(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        filename = str(body.get("filename") or "")
        subfolder = str(body.get("subfolder") or "")
        rating = body.get("rating")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, img_rate_set, filename, subfolder, rating)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "rating": 0}, status=200)


    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/fav_backup")
    async def api_fav_backup_get(request):
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, fav_backup_info)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/fav_backup")
    async def api_fav_backup_set(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        action = str(body.get("action") or "").strip().lower()
        try:
            loop = asyncio.get_running_loop()
            if action in ("pick", "browse"):
                data = await loop.run_in_executor(None, pick_fav_backup_dir, body.get("dir") or "")
                return web.json_response(data)
            if action in ("reveal", "open"):
                ok, err = await loop.run_in_executor(None, reveal_fav_backup)
                if not ok:
                    return web.json_response({"ok": False, "error": err or "打开失败"})
                return web.json_response({"ok": True})
            data = await loop.run_in_executor(None, set_fav_backup_dir, body.get("dir") or "")
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/fav_copy")
    async def api_fav_copy_file(request):
        filename = request.query.get("filename") or ""
        subfolder = request.query.get("subfolder") or ""
        try:
            dest, _rel, _fn = _fav_copy_abs(filename, subfolder)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        if not dest or not os.path.isfile(dest):
            return web.json_response({"ok": False, "error": "文件不存在"}, status=404)
        return web.FileResponse(dest)

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/img_fav")
    async def api_img_fav(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        filename = str(body.get("filename") or "")
        subfolder = str(body.get("subfolder") or "")
        on = body.get("on")
        if on is not None and not isinstance(on, bool):
            on = str(on).strip().lower() in ("1", "true", "yes", "on")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, img_fav_set, filename, subfolder, on)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "on": False, "count": 0}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/artist_index")
    async def api_artist_index(request):
        sub = request.query.get("subfolder") or ""
        deep = _query_flag(request, "deep", True)
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, artist_index_for_folder, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "artists": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/cast_index")
    async def api_cast_index(request):
        sub = request.query.get("subfolder") or ""
        deep = _query_flag(request, "deep", True)
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, cast_index_for_folder, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "series": [], "characters": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/tag_index")
    async def api_tag_index(request):
        sub = request.query.get("subfolder") or ""
        deep = _query_flag(request, "deep", True)
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, tag_index_for_scope, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "tags": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/model_index")
    async def api_model_index(request):
        sub = request.query.get("subfolder") or ""
        deep = _query_flag(request, "deep", True)
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, model_index_for_scope, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "models": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/used_artists")
    async def api_used_artists(request):
        sub = request.query.get("subfolder") or ""
        deep_raw = (request.query.get("deep") or request.query.get("recursive") or "").strip().lower()
        deep = deep_raw in ("1", "true", "yes", "on")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, used_artists_for_scope, sub, deep)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "all_keys": [], "solo_keys": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/extract")
    async def api_extract(request):
        filename = request.query.get("filename") or ""
        subfolder = request.query.get("subfolder") or ""
        try:
            path, sub, fn, view_sub = _resolve_view_file(filename, subfolder)
            if not os.path.isfile(path):
                return web.json_response({"ok": False, "error": "文件不存在", "text": "", "tags": [], "artists": []})
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, extract_prompt_from_file, path, fn)
            data["filename"] = fn
            data["subfolder"] = sub
            data["url"] = _url_for_resolved(fn, sub, view_sub)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "text": "", "tags": [], "artists": []}, status=200)

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/file_facets")
    async def api_file_facets(request):
        filename = request.query.get("filename") or ""
        subfolder = request.query.get("subfolder") or ""
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, file_facets_for, subfolder, filename)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "artists": [], "characters": [], "series": []}, status=200)

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/queue_same_artist")
    async def api_queue_same_artist(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        filename = str((body or {}).get("filename") or "").strip()
        subfolder = (body or {}).get("subfolder") or ""
        artist = str((body or {}).get("artist") or (body or {}).get("artist_tag") or "").strip()
        artists = (body or {}).get("artists")
        if isinstance(artists, list):
            artist_arg = [str(x).strip() for x in artists if str(x).strip()]
            if not artist_arg:
                artist_arg = artist
        else:
            artist_arg = artist
        client_id = str((body or {}).get("client_id") or "").strip()
        if not filename:
            return web.json_response({"ok": False, "error": "缺少文件名"})
        if not _artist_tag_list(artist_arg):
            return web.json_response({"ok": False, "error": "请选择画师"})
        try:
            path, sub, fn, _view_sub = _resolve_view_file(filename, subfolder)
            if not os.path.isfile(path):
                return web.json_response({"ok": False, "error": "文件不存在"})
            graph, workflow, src = _load_png_graph(path, fn)
            if not graph:
                return web.json_response({"ok": False, "error": "这张图没有可重跑的 ComfyUI 工作流（需要 PNG 里的 prompt 元数据）"})
            patched, info = patch_prompt_artists(graph, workflow, fn, artist_arg)
            if not patched:
                return web.json_response({"ok": False, "error": info or "替换画师失败"})
            result = await queue_patched_prompt(patched, workflow, client_id)
            if result.get("ok"):
                result["artist"] = (info or {}).get("artist") or _artist_inputs(artist_arg)[0]
                result["artists"] = [format_artist_animemes(x) for x in _artist_tag_list(artist_arg)]
                result["text"] = (info or {}).get("text") or ""
                result["graph_source"] = src
            return web.json_response(result)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/reveal")
    async def api_reveal(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        filename = str((body or {}).get("filename") or "").strip()
        subfolder = (body or {}).get("subfolder") or ""
        if not filename:
            return web.json_response({"ok": False, "error": "缺少文件名"})
        try:
            loop = asyncio.get_running_loop()
            ok, err = await loop.run_in_executor(None, reveal_output_image, filename, subfolder)
            if not ok:
                return web.json_response({"ok": False, "error": err or "打开失败"})
            return web.json_response({"ok": True})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/drag_out")
    async def api_drag_out(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        filename = str((body or {}).get("filename") or "").strip()
        subfolder = (body or {}).get("subfolder") or ""
        if not filename:
            return web.json_response({"ok": False, "error": "缺少文件名"})
        try:
            loop = asyncio.get_running_loop()
            ok, err = await loop.run_in_executor(None, drag_output_image, filename, subfolder)
            if ok:
                return web.json_response({"ok": True})
            if not err:
                return web.json_response({"ok": False, "quiet": True})
            return web.json_response({"ok": False, "error": err})
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/recycle")
    async def api_recycle(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        filename = str((body or {}).get("filename") or "").strip()
        subfolder = (body or {}).get("subfolder") or ""
        if not filename:
            return web.json_response({"ok": False, "error": "缺少文件名"})
        try:
            root = _output_root()
            path, sub, fn = _safe_file(root, subfolder, filename)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})
        ext = os.path.splitext(fn)[1].lower()
        if ext not in IMG_EXT:
            return web.json_response({"ok": False, "error": "不是图片文件"})
        if not os.path.isfile(path):
            _drop_index_file(root, sub, fn)
            try:
                img_fav_drop(fn, sub)
            except Exception:
                pass
            try:
                img_rate_drop(fn, sub)
            except Exception:
                pass
            return web.json_response({"ok": True, "missing": True})
        loop = asyncio.get_running_loop()
        ok, err = await loop.run_in_executor(None, _recycle_file, path)
        if not ok:
            return web.json_response({"ok": False, "error": err or "移入回收站失败"})
        _drop_index_file(root, sub, fn)
        try:
            img_fav_drop(fn, sub)
        except Exception:
            pass
        try:
            img_rate_drop(fn, sub)
        except Exception:
            pass
        return web.json_response({"ok": True})


    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/recycle_many")
    async def api_recycle_many(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        items = (body or {}).get("items")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, recycle_output_items, items)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "recycled": 0, "items": [], "errors": [str(e)]})


    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/manage_folders")
    async def api_manage_folders(request):
        current = request.query.get("current") or request.query.get("subfolder") or ""
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, list_manage_folders, current)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e), "folders": []}, status=200)

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/mkdir")
    async def api_mkdir(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        parent = str((body or {}).get("parent") or (body or {}).get("subfolder") or "")
        name = str((body or {}).get("name") or "")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, mkdir_output, parent, name)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/move")
    async def api_move(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        items = (body or {}).get("items")
        dest = str((body or {}).get("dest") or (body or {}).get("subfolder") or "")
        source = str((body or {}).get("source") or (body or {}).get("from") or "")
        all_in = bool((body or {}).get("all") or (body or {}).get("all_in_folder"))
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, move_output_items, items, dest, source, all_in)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/trash_folder")
    async def api_trash_folder(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        sub = str((body or {}).get("subfolder") or (body or {}).get("folder") or "")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, trash_output_folder, sub)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/trash_restore")
    async def api_trash_restore(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        rel = str((body or {}).get("trash_rel") or (body or {}).get("name") or "")
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, restore_trash_folder, rel)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/trash_empty")
    async def api_trash_empty(request):
        try:
            loop = asyncio.get_running_loop()
            data = await loop.run_in_executor(None, empty_opv_trash)
            return web.json_response(data)
        except Exception as e:
            return web.json_response({"ok": False, "error": str(e)})

    @PromptServer.instance.routes.get("/danbooru_anima/output_prompt/auto_shutdown")
    async def api_auto_shutdown_get(request):
        return web.json_response(_sd_snapshot())

    @PromptServer.instance.routes.post("/danbooru_anima/output_prompt/auto_shutdown")
    async def api_auto_shutdown_post(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        action = str(body.get("action") or "").strip().lower()
        enable = body.get("enable")
        if enable is True and sys.platform != "win32":
            snap = _sd_snapshot()
            snap["ok"] = False
            snap["error"] = "自动关机仅支持 Windows"
            return web.json_response(snap)
        with _SD_LOCK:
            if action == "cancel" or enable is False:
                _sd_reset_watch(keep_enabled=False)
            elif enable is True:
                _sd_reset_watch(keep_enabled=True)
                _sd["enabled"] = True
                _sd["error"] = ""
            elif action == "abort_countdown":
                if _sd["countdown_until"] or _sd["os_armed"]:
                    _sd_reset_watch(keep_enabled=True)
                    _sd["saw_work"] = True
                    _sd["error"] = ""
        if enable is True:
            _sd_ensure_thread()
        return web.json_response(_sd_snapshot())


def _run_self_tests():
    fails = []

    def check(name, cond, detail=""):
        if not cond:
            fails.append(name + ((": " + detail) if detail else ""))

    check("model anima", classify_gen_model("anima-base-v1.0.safetensors") == "anima")
    check("model anima tune", classify_gen_model("miaomiaoHarem_anima12.safetensors") == "anima")
    check("model newbie", classify_gen_model("newbieImage_exp01Base.safetensors") == "anima")
    check("model noob", classify_gen_model("noobaiXLNAIXL_epsilon_v11.safetensors") == "noob")
    check("model plant", classify_gen_model("plantMilkModelSuite_hempII.safetensors") == "noob")
    check("model illustrious", classify_gen_model("waiIllustriousSDXL_v140.safetensors") == "illustrious")
    check("model zimage", classify_gen_model("beyondREALITY_V20BF16.safetensors") == "zimage")
    check("model krea", classify_gen_model("krea2_turbo_int8_convrot.safetensors") == "krea2")
    check("model qwen", classify_gen_model("qwen_image_2.1_int8_convrot.safetensors") == "qwen")
    check("model flux", classify_gen_model("flux-2-klein-9b.safetensors") == "flux")
    check("model other", classify_gen_model("sd15.safetensors") == "other")
    check("model animal", classify_gen_model("animal_ears_xl.safetensors") == "other")
    check("model filter", file_matches_filters({"artists": [], "model": "anima"}, model_ids=["anima"]))
    check("model filter miss", not file_matches_filters({"artists": [], "model": "noob"}, model_ids=["anima"]))
    check("model missing not other", not file_matches_filters({"artists": [], "tags": []}, model_ids=["other"]))
    check("rec ok without model", _index_rec_ok({"mtime": 1, "size": 2, "artists": [], "characters": [], "series": [], "tags": []}, 1, 2))
    check("sort default newest", _norm_sort("") == "newest" and _norm_sort("mtime") == "newest")
    check("sort oldest", _norm_sort("oldest") == "oldest")
    check("sort rating", _norm_sort("rating") == "rating" and _norm_sort("high") == "rating")
    check("sort rating_asc", _norm_sort("rating_asc") == "rating_asc")
    check("clamp rating", _clamp_rating(9) == 5 and _clamp_rating(-1) == 0 and _clamp_rating("3") == 3)
    check("heart filter", _norm_rate_filter("3") == 3 and _norm_rate_filter(0) == 0 and _norm_rate_filter(9) == 0 and _norm_rate_filter("x") == 0 and _norm_rate_filter("none") == -1 and _norm_rate_filter(-1) == -1)
    check("heart keep", _heart_ok(3, 3) and (not _heart_ok(2, 3)) and _heart_ok(0, 0) and _heart_ok(4, "") and _heart_ok(0, -1) and _heart_ok(0, "none") and (not _heart_ok(2, "none")))
    _rate_rows = [("a", 10, 1, "", 1), ("b", 10, 1, "", 5), ("c", 10, 1, "", 3), ("d", 9, 1, "", 5)]
    _rate_rows.sort(key=lambda x: (-x[4], -x[1], x[0]))
    check("rating order", [x[0] for x in _rate_rows] == ["b", "d", "c", "a"], str([x[0] for x in _rate_rows]))

    prompt = {
        "3": {"class_type": "KSampler", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "model": ["4", 0],
        }},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl, @foo, smile", "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "bad quality", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    r = extract_from_prompt(prompt, None, "ComfyUI_00001_.png")
    check("basic positive", r and "1girl" in r["text"] and "@foo" in r["text"])
    check("not negative", r and "bad quality" not in r["text"])
    check("has negative", r and r.get("negative") == "bad quality", repr((r or {}).get("negative")))
    check("a1111 neg", _parse_a1111_negative("1girl\nNegative prompt: lowres, bad anatomy\nSteps: 20") == "lowres, bad anatomy")
    check("artist_norm at", artist_norm("@Foo_Bar") == "foo bar")
    check("artist_norm prefix", artist_norm("artist:Foo") == "foo")
    check("artist_norm weight", artist_norm("(@Foo:1.2)") == "foo")
    anima_m, composer_m, newbie_m = _artist_inputs(["@Foo", "artist:Bar"])
    check("multi anima", anima_m == "@Foo, @Bar", anima_m)
    check("multi composer", "@Foo" in composer_m and "@Bar" in composer_m, composer_m)
    check("multi newbie", "artist:Foo" in newbie_m and "artist:Bar" in newbie_m, newbie_m)
    check("split joined", _artist_tag_list("@Foo, @Bar") == ["@Foo", "@Bar"], str(_artist_tag_list("@Foo, @Bar")))
    check("solo one", file_matches_filters({"artists": ["@foo"]}, "", True))
    check("solo two", not file_matches_filters({"artists": ["@foo", "@bar"]}, "", True))
    check("solo same", file_matches_filters({"artists": ["@Foo", "(@foo:1.1)"]}, "", True))
    check("solo want", file_matches_filters({"artists": ["@foo"]}, "foo", True))
    check("solo want multi", not file_matches_filters({"artists": ["@foo", "@bar"]}, "foo", True))
    check("and two", file_matches_filters({"artists": ["@foo", "@bar"]}, "foo,bar"))
    check("and miss", not file_matches_filters({"artists": ["@foo"]}, "foo,bar"))
    check("and extra", file_matches_filters({"artists": ["@foo", "@bar", "@baz"]}, "foo, bar"))
    check("exact hit", file_matches_filters({"artists": ["@bar", "@foo"]}, "foo, bar", exact=True))
    check("exact extra", not file_matches_filters({"artists": ["@foo", "@bar", "@baz"]}, "foo, bar", exact=True))
    check("exact miss", not file_matches_filters({"artists": ["@foo"]}, "foo, bar", exact=True))
    check("exact same spelling", file_matches_filters({"artists": ["@Foo_Bar", "@baz"]}, "foo bar, @Baz", exact=True))
    check("key list", artist_key_list("@Foo, artist:Bar") == ["foo", "bar"], str(artist_key_list("@Foo, artist:Bar")))
    rec_cast = {"artists": ["@foo"], "characters": ["hatsune_miku"], "series": ["vocaloid"]}
    check("cast series", file_matches_filters(rec_cast, series_key="vocaloid"))
    check("cast char", file_matches_filters(rec_cast, character_key="hatsune_miku"))
    check("cast both", file_matches_filters(rec_cast, series_key="vocaloid", character_key="hatsune_miku"))
    check("cast miss series", not file_matches_filters(rec_cast, series_key="fate"))
    rec_none = {"artists": [], "characters": ["oc_girl"], "series": []}
    check("cast none", file_matches_filters(rec_none, series_key=FACET_NONE))
    check("cast none not named", not file_matches_filters(rec_cast, series_key=FACET_NONE))
    rec_orig = {"artists": [], "characters": ["my_oc"], "series": ["original"]}
    check("cast original", file_matches_filters(rec_orig, series_key="original"))
    rec_tag = {"artists": ["@foo"], "characters": [], "series": [], "tags": ["pantyhose", "smile"]}
    check("tag hit", file_matches_filters(rec_tag, tag_key="pantyhose"))
    check("tag miss", not file_matches_filters(rec_tag, tag_key="boots"))
    check("tag weight", file_matches_filters(rec_tag, tag_key="(pantyhose:1.2)"))
    check("tag keys", unique_tag_keys_from(["(smile:1.1)", "1girl", "smile"]) == ["smile", "1girl"], str(unique_tag_keys_from(["(smile:1.1)", "1girl", "smile"])))
    check("norm original", facet_norm("original") == "original")
    check("norm escaped wrap", facet_norm(r"\(hatsune_miku\)") == "hatsune_miku")
    check("norm paren wrap", facet_norm("(hatsune_miku)") == "hatsune_miku")
    check("norm series paren", facet_norm(r"asuna_\(sao\)") == "asuna_(sao)")
    arts, chs, ses = classify_prompt_facets(["1girl", "original", "@foo", "smile"])
    check("classify artist", any(looks_artist(x) for x in arts), str(arts))
    check("classify original series", any(facet_norm(x) == "original" for x in ses), str(ses))
    _arts, _chs, ses_ba = classify_prompt_facets(["1girl", r"chiaki_\(blue_archive\)"])
    check("series from character paren", any(facet_norm(x) == "blue_archive" for x in ses_ba), str(ses_ba))
    _arts, _chs, ses_ghost = classify_prompt_facets([r"konpaku_youmu_\(ghost\)"])
    check("costume paren not series", not any(facet_norm(x) == "ghost" for x in ses_ghost), str(ses_ghost))
    _arts, _chs, ses_dm = classify_prompt_facets([r"hestia_\(danmachi\)"])
    check(
        "danmachi alias",
        any(facet_norm(x) == "dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka" for x in ses_dm),
        str(ses_dm),
    )
    rec_infer = {
        "artists": [],
        "characters": [r"chiaki_\(blue_archive\)"],
        "series": [],
        "tags": [r"chiaki_\(blue_archive\)", "1girl"],
    }
    check("infer series key", "blue_archive" in file_series_keys(rec_infer), str(file_series_keys(rec_infer)))
    check("infer not none", FACET_NONE not in file_series_keys(rec_infer))

    prompt2 = {
        "1": {"class_type": "KSampler", "inputs": {"positive": ["10", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "2": {"class_type": "KSampler", "inputs": {"positive": ["10", 0], "negative": ["7", 0], "latent_image": ["1", 0]}},
        "10": {"class_type": "CLIPTextEncode", "inputs": {"text": ["12", 0]}},
        "12": {"class_type": "DanbooruTextPassthrough", "inputs": {
            "use_input_text": True, "text": ["13", 0], "prompt_text": "OLD WIDGET DO NOT USE",
        }},
        "13": {"class_type": "PrimitiveString", "inputs": {"value": "from_link_ok"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["2", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    wf = {"nodes": [{"id": 12, "type": "DanbooruTextPassthrough", "widgets_values": [False, True, "written_output"]}]}
    r2 = extract_from_prompt(prompt2, wf, "ComfyUI_00002_.png")
    check("passthrough writeback", r2 and r2["text"] == "written_output", (r2 or {}).get("text"))
    check("hires last sampler", r2 and "#2" in (r2.get("path") or ""), r2.get("path") if r2 else "")

    prompt3 = dict(prompt2)
    prompt3["12"] = {"class_type": "DanbooruTextPassthrough", "inputs": {
        "use_input_text": True, "text": ["13", 0], "prompt_text": "OLD WIDGET DO NOT USE",
    }}
    r3 = extract_from_prompt(prompt3, None, "ComfyUI_00003_.png")
    check("follow link not widget", r3 and r3["text"] == "from_link_ok", (r3 or {}).get("text"))

    prompt4 = {
        "3": {"class_type": "KSampler", "inputs": {"positive": ["20", 0], "negative": ["7", 0]}},
        "20": {"class_type": "ConditioningConcat", "inputs": {"conditioning_to": ["6", 0], "conditioning_from": ["21", 0]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl"}},
        "21": {"class_type": "CLIPTextEncode", "inputs": {"text": "@concat_artist"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    r4 = extract_from_prompt(prompt4, None, "ComfyUI_00004_.png")
    check("concat both clips", r4 and "1girl" in r4["text"] and "@concat_artist" in r4["text"], (r4 or {}).get("text"))
    check("concat not neg", r4 and "neg" not in r4["text"])

    prompt5 = {
        "3": {"class_type": "KSampler", "inputs": {"positive": ["11", 0], "negative": ["7", 0]}},
        "11": {"class_type": "CLIPTextEncode", "inputs": {"text": ["762", 0]}},
        "762": {"class_type": "easy showAnything", "inputs": {
            "text": "OLD WIDGET @old_artist, from previous image",
            "anything": ["5", 0],
        }},
        "5": {"class_type": "DanbooruTextPassthrough", "inputs": {
            "use_input_text": True, "text": ["13", 0], "prompt_text": "OLD WIDGET DO NOT USE",
        }},
        "13": {"class_type": "PrimitiveString", "inputs": {"value": "CURRENT @new_artist, 1girl"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    r5 = extract_from_prompt(prompt5, None, "ComfyUI_00005_.png")
    check("showAnything skips stale widget", r5 and "@new_artist" in r5["text"] and "@old_artist" not in r5["text"], (r5 or {}).get("text"))

    prompt_p = {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": 42, "steps": 20, "cfg": 7.0, "sampler_name": "euler",
            "scheduler": "simple", "denoise": 1.0,
            "positive": ["6", 0], "negative": ["7", 0], "model": ["4", 0],
        }},
        "4": {"class_type": "UNETLoader", "inputs": {"unet_name": "foo\\bar.safetensors"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    rp = extract_from_prompt(prompt_p, None, "ComfyUI_00001_.png")
    rows = extract_sampler_params(prompt_p, None, (rp or {}).get("sampler_id"), "")
    got = {x["label"]: x["value"] for x in rows}
    check("param seed", got.get("种子") == "42", str(got))
    check("param sampler", got.get("采样器") == "euler", str(got))
    check("param sched", got.get("调度器") == "simple", str(got))
    check("param steps", got.get("步数") == "20", str(got))
    check("param cfg", got.get("CFG") == "7", str(got))
    check("param model", got.get("模型") == "bar.safetensors", str(got))

    prompt_sw = {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": ["91", 0], "steps": ["741", 0], "cfg": 4.0,
            "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
            "positive": ["6", 0], "negative": ["7", 0], "model": ["4", 0],
        }},
        "91": {"class_type": "Seed (rgthree)", "inputs": {"seed": 99}},
        "741": {"class_type": "ComfySwitchNode", "inputs": {
            "switch": False, "on_false": ["608", 0], "on_true": ["604", 0],
        }},
        "608": {"class_type": "PrimitiveInt", "inputs": {"value": 36}},
        "604": {"class_type": "PrimitiveInt", "inputs": {"value": 12}},
        "4": {"class_type": "UNETLoader", "inputs": {"unet_name": "m.safetensors"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl"}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    rsw = extract_from_prompt(prompt_sw, None, "ComfyUI_x.png")
    rows2 = extract_sampler_params(prompt_sw, None, (rsw or {}).get("sampler_id"), "")
    got2 = {x["label"]: x["value"] for x in rows2}
    check("linked seed", got2.get("种子") == "99", str(got2))
    check("switch steps", got2.get("步数") == "36", str(got2))

    prompt_lora = {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": 1, "steps": 20, "cfg": 4, "sampler_name": "euler", "scheduler": "simple",
            "model": ["20", 0], "positive": ["6", 0], "negative": ["7", 0],
        }},
        "20": {"class_type": "Lora Loader (LoraManager)", "inputs": {
            "model": ["10", 0],
            "text": "<lora:ghost:1>",
            "loras": {"__value__": [
                {"name": "used_one", "strength": "0.55", "active": True, "clipStrength": "0.55"},
                {"name": "idle_one", "strength": "1", "active": False, "clipStrength": "1"},
            ]},
        }},
        "10": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "lora_name": "style\\pretty.safetensors", "strength_model": 0.8, "model": ["14", 0],
        }},
        "14": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "lora_name": "off\\zero.safetensors", "strength_model": 0, "model": ["11", 0],
        }},
        "11": {"class_type": "ComfySwitchNode", "inputs": {
            "switch": ["30", 0], "on_false": ["12", 0], "on_true": ["13", 0],
        }},
        "30": {"class_type": "PrimitiveBoolean", "inputs": {"value": False}},
        "12": {"class_type": "UNETLoader", "inputs": {"unet_name": "base.safetensors"}},
        "13": {"class_type": "LoraLoaderModelOnly", "inputs": {
            "lora_name": "off\\turbo.safetensors", "strength_model": 0.4, "model": ["12", 0],
        }},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl", "clip": ["15", 1]}},
        "15": {"class_type": "LoraLoader", "inputs": {
            "lora_name": "clip\\detail.safetensors", "strength_model": 0.8, "strength_clip": 0.3,
            "model": ["12", 0], "clip": ["12", 1],
        }},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg"}},
    }
    rl = extract_from_prompt(prompt_lora, None, "ComfyUI_lora.png")
    lora_rows = extract_sampler_params(prompt_lora, None, (rl or {}).get("sampler_id"), "")
    lora_vals = [x["value"] for x in lora_rows if x.get("key") == "lora"]
    check("lora used", lora_vals[:2] == ["used_one × 0.55", "pretty.safetensors × 0.8"], str(lora_vals))
    check("lora clip side", "detail.safetensors × 0.8 / 0.3" in lora_vals, str(lora_vals))
    check("lora skip off", not any("turbo" in x or "zero" in x or "ghost" in x or "idle" in x for x in lora_vals), str(lora_vals))
    check("a1111 lora tag", _loras_from_tag_text("1girl <lora:hair:0.7:0.2> Steps: 20") == ["hair × 0.7 / 0.2"], str(_loras_from_tag_text("1girl <lora:hair:0.7:0.2> Steps: 20")))

    tags = split_tags("1girl, @bar, smile")
    check("artist split", looks_artist("@bar") and "@bar" in tags)
    check("animemes space", format_artist_animemes("foo_bar") == "@foo bar")
    check("animemes paren", format_artist_animemes("shino_(ponyo)") == "@shino \\(ponyo\\)")
    check("animemes at", format_artist_animemes("@Foo_Bar") == "@Foo Bar")
    check("replace many", replace_artist_tags("1girl, @a, @b, smile", "@c") == "1girl, @c, smile")
    check("replace insert", replace_artist_tags("1girl, smile", "@c", True) == "@c, 1girl, smile")
    check("replace strip", replace_artist_tags("1girl, @a, smile", "") == "1girl, smile")

    p_same = {
        "3": {"class_type": "KSampler", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "model": ["4", 0],
            "seed": 42, "steps": 20, "cfg": 7, "sampler_name": "euler", "scheduler": "simple",
        }},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "1girl, @foo, @bar, smile", "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "bad quality", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    patched, info = patch_prompt_artists(copy.deepcopy(p_same), None, "ComfyUI_00001_.png", "shino_(ponyo)")
    check("patch ok", bool(patched), str(info))
    ptxt = ((patched or {}).get("6") or {}).get("inputs", {}).get("text") or ""
    check("patch anima", "@shino \\(ponyo\\)" in ptxt and "@foo" not in ptxt and "@bar" not in ptxt, ptxt)
    check("patch keep", "1girl" in ptxt and "smile" in ptxt, ptxt)
    patched_m, info_m = patch_prompt_artists(copy.deepcopy(p_same), None, "ComfyUI_00001_.png", ["saki", "abpart"])
    ptxtm = ((patched_m or {}).get("6") or {}).get("inputs", {}).get("text") or ""
    check("patch multi list", "@saki" in ptxtm and "@abpart" in ptxtm, ptxtm + " / " + str(info_m))
    check("patch multi both keep", "1girl" in ptxtm and "smile" in ptxtm, ptxtm)
    patched_ms, info_ms = patch_prompt_artists(copy.deepcopy(p_same), None, "ComfyUI_00001_.png", "saki, abpart")
    ptxtms = ((patched_ms or {}).get("6") or {}).get("inputs", {}).get("text") or ""
    check("patch multi string", "@saki" in ptxtms and "@abpart" in ptxtms, ptxtms + " / " + str(info_ms))
    ntxt = ((patched or {}).get("7") or {}).get("inputs", {}).get("text") or ""
    check("patch neg", ntxt == "bad quality", ntxt)

    p_comp = {
        "3": {"class_type": "KSampler", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "model": ["4", 0],
        }},
        "12": {"class_type": "AnimaPromptCreator", "inputs": {
            "quality_tags": "masterpiece", "count_tags": "1girl", "character_tags": "",
            "series_tags": "", "artist_tags": "@old_one, @old_two", "general_tags": "smile",
            "model_mode": 0, "natural_language": "[]", "time_tag": "(无)", "safety_tag": "(无)", "meta_tags": "",
        }},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": ["12", 0], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    patched2, info2 = patch_prompt_artists(copy.deepcopy(p_comp), None, "ComfyUI_00002_.png", "foo_bar")
    at = ((patched2 or {}).get("12") or {}).get("inputs", {}).get("artist_tags") or ""
    check("patch composer", at == "@foo bar", at + " / " + str(info2))
    clip_in = ((patched2 or {}).get("6") or {}).get("inputs", {}).get("text")
    check("patch composer clip string", isinstance(clip_in, str) and "@foo bar" in clip_in, str(clip_in))
    check("patch composer clip unlinked", clip_in != ["12", 0], str(clip_in))
    check("patch composer no old", "old_one" not in str(clip_in) and "old_two" not in str(clip_in), str(clip_in))
    patched2m, info2m = patch_prompt_artists(copy.deepcopy(p_comp), None, "ComfyUI_00002_.png", ["saki", "abpart"])
    at2 = ((patched2m or {}).get("12") or {}).get("inputs", {}).get("artist_tags") or ""
    check("patch composer multi field", "@saki" in at2 and "@abpart" in at2, at2 + " / " + str(info2m))
    clip2m = ((patched2m or {}).get("6") or {}).get("inputs", {}).get("text")
    check("patch composer multi clip", "@saki" in str(clip2m) and "@abpart" in str(clip2m), str(clip2m))

    p_pt = {
        "3": {"class_type": "KSampler", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "model": ["4", 0],
        }},
        "12": {"class_type": "PrimitiveString", "inputs": {"value": "1girl, @old_one, @old_two, smile"}},
        "10": {"class_type": "DanbooruTextPassthrough", "inputs": {
            "use_input_text": True, "text": ["12", 0], "prompt_text": "1girl, @old_one, @old_two, smile",
        }},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": ["10", 0], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    patched3, info3 = patch_prompt_artists(copy.deepcopy(p_pt), None, "ComfyUI_00003_.png", "foo_bar")
    clip3 = ((patched3 or {}).get("6") or {}).get("inputs", {}).get("text")
    check("patch passthrough clip string", isinstance(clip3, str) and "@foo bar" in clip3, str(clip3) + " / " + str(info3))
    check("patch passthrough unlinked", clip3 != ["10", 0], str(clip3))
    check("patch passthrough no old", "@old_one" not in str(clip3) and "@old_two" not in str(clip3), str(clip3))
    check("patch passthrough keep", "1girl" in str(clip3) and "smile" in str(clip3), str(clip3))

    p_browser = {
        "3": {"class_type": "KSampler", "inputs": {
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0], "model": ["4", 0],
        }},
        "80": {"class_type": "PrimitiveString", "inputs": {
            "value": "1girl, @old_one, @old_two, smile, masterpiece",
        }},
        "81": {"class_type": "QwenTE_ImageInfer", "inputs": {"image": ["1", 0]}, "mode": 4},
        "10": {"class_type": "DanbooruTextPassthrough", "inputs": {
            "use_input_text": True,
            "text": ["80", 0],
            "prompt_text": "1girl, @old_one, @old_two, smile, masterpiece",
        }},
        "90": {"class_type": "Reroute", "inputs": {"": ["10", 0]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": ["90", 0], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "neg", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ComfyUI", "images": ["8", 0]}},
    }
    patched4, info4 = patch_prompt_artists(copy.deepcopy(p_browser), None, "ComfyUI_00004_.png", "foo_bar")
    clip4 = ((patched4 or {}).get("6") or {}).get("inputs", {}).get("text")
    check("patch browser clip string", isinstance(clip4, str) and "@foo bar" in str(clip4), str(clip4) + " / " + str(info4))
    check("patch browser unlinked", clip4 != ["90", 0] and clip4 != ["10", 0], str(clip4))
    check("patch browser no old", "@old_one" not in str(clip4) and "@old_two" not in str(clip4), str(clip4))
    qwen = (patched4 or {}).get("81") or {}
    check("patch browser keep mute", (qwen.get("mode") or 0) == 4, str(qwen.get("mode")))


    import shutil as _shutil
    import tempfile
    tmp = tempfile.mkdtemp(prefix="opv_layout_")
    g = globals()
    prev_root = g["_output_root"]
    prev_fav = g["IMG_FAV_FILE"]
    prev_live = g["_IMG_FAV_LIVE"]
    prev_mt = g["_IMG_FAV_LIVE_MT"]
    prev_trash = g["TRASH_FILE"]
    prev_tlive = g["_TRASH_LIVE"]
    prev_tmt = g["_TRASH_LIVE_MT"]
    prev_purge = g["_LAST_PURGE"]
    prev_bk = g["FAV_BACKUP_FILE"]
    prev_blive = g["_FAV_BACKUP_LIVE"]
    prev_bmt = g["_FAV_BACKUP_LIVE_MT"]
    try:
        def _fake_root():
            return os.path.abspath(tmp)
        g["_output_root"] = _fake_root
        g["IMG_FAV_FILE"] = os.path.join(tmp, "favs.json")
        g["FAV_BACKUP_FILE"] = os.path.join(tmp, "fav_backup.json")
        g["_FAV_BACKUP_LIVE"] = None
        g["_FAV_BACKUP_LIVE_MT"] = None
        g["_IMG_FAV_LIVE"] = None
        g["_IMG_FAV_LIVE_MT"] = None
        g["TRASH_FILE"] = os.path.join(tmp, "trash.json")
        g["_TRASH_LIVE"] = None
        g["_TRASH_LIVE_MT"] = None
        g["_LAST_PURGE"] = 0.0
        open(os.path.join(tmp, "keep.png"), "wb").write(b"keep")
        open(os.path.join(tmp, "move.png"), "wb").write(b"move")
        listed = list_output("", deep=False, page_size=120)
        names = [it["filename"] for it in (listed.get("items") or [])]
        check("layout root files", "keep.png" in names and "move.png" in names, str(names))
        os.makedirs(os.path.join(tmp, "sorted"))
        _shutil.move(os.path.join(tmp, "move.png"), os.path.join(tmp, "sorted", "move.png"))
        listed2 = list_output("", deep=False, page_size=120)
        names2 = [it["filename"] for it in (listed2.get("items") or [])]
        folders2 = [f.get("name") for f in (listed2.get("folders") or [])]
        check("layout root after move", "keep.png" in names2 and "move.png" not in names2, str(names2))
        check("layout new subfolder", "sorted" in folders2, str(folders2))
        listed3 = list_output("", deep=True, page_size=120)
        deep_keys = [(it.get("subfolder") or "") + "/" + it["filename"] for it in (listed3.get("items") or [])]
        check("layout deep keeps moved", "/keep.png" in deep_keys and "sorted/move.png" in deep_keys, str(deep_keys))
        listed4 = list_output("sorted", deep=False, page_size=120)
        names4 = [it["filename"] for it in (listed4.get("items") or [])]
        check("layout subfolder listing", names4 == ["move.png"], str(names4))
        skip_dir = os.path.join(tmp, IMG_FAV_COPY_SUB)
        os.makedirs(skip_dir, exist_ok=True)
        open(os.path.join(skip_dir, "hidden.png"), "wb").write(b"hid")
        listed5 = list_output("", deep=True, page_size=120)
        folders5 = [f.get("name") for f in (listed5.get("folders") or [])]
        hidden = [it for it in (listed5.get("items") or []) if it.get("filename") == "hidden.png"]
        check("layout hide backup folder", IMG_FAV_COPY_SUB not in folders5, str(folders5))
        check("layout hide backup files", not hidden, str(hidden))
        skipped = list_output(IMG_FAV_COPY_SUB, deep=True, page_size=120)
        check("layout skip browse backup", not (skipped.get("items") or []) and not (skipped.get("folders") or []), str(skipped.get("items")))
        stamp = folder_stamp("", True)
        check("layout stamp ignores backup", int(stamp.get("count") or 0) == 2, str(stamp))
        src = os.path.join(tmp, "keep.png")
        dest, rel, fn = _ensure_fav_copy(src, "keep.png", "")
        check("fav copy exists", os.path.isfile(dest) and fn == "keep.png", dest)
        check("fav copy not cut", os.path.isfile(src))
        check("fav copy sub", rel == IMG_FAV_COPY_SUB, rel)
        dest2, rel2, _fn2 = _fav_copy_abs("move.png", "sorted")
        check("fav copy nested", rel2.replace("\\", "/") == IMG_FAV_COPY_SUB + "/sorted", rel2)
        with open(g["IMG_FAV_FILE"], "w", encoding="utf-8") as f:
            json.dump({"ver": 1, "items": [{"filename": "keep.png", "subfolder": "", "added_at": 1}]}, f)
        g["_IMG_FAV_LIVE"] = None
        g["_IMG_FAV_LIVE_MT"] = None
        reveal_fav = _path_for_reveal("keep.png", "")
        check("reveal prefers backup", os.path.normpath(reveal_fav) == os.path.normpath(dest), str(reveal_fav))
        _shutil.move(src, os.path.join(tmp, "sorted", "keep.png"))
        favs = list_img_favs(page=1, page_size=24)
        fav_items = favs.get("items") or []
        check("fav list after orig move", len(fav_items) == 1 and fav_items[0]["filename"] == "keep.png", str(fav_items))
        fav_url = str((fav_items[0] or {}).get("url") or "")
        from urllib.parse import unquote as _unq_fav
        check("fav url uses backup", IMG_FAV_COPY_SUB in _unq_fav(fav_url), fav_url)
        reveal_moved = _path_for_reveal("keep.png", "")
        check("reveal after orig move", os.path.normpath(reveal_moved) == os.path.normpath(dest), str(reveal_moved))
        check("reveal not orig after move", not os.path.isfile(os.path.join(tmp, "keep.png")))
        _drop_fav_copy("keep.png", "")
        check("unfav drops copy", not os.path.isfile(dest), dest)
    except Exception as e:
        check("layout tests", False, str(e))
    finally:
        g["_output_root"] = prev_root
        g["IMG_FAV_FILE"] = prev_fav
        g["_IMG_FAV_LIVE"] = prev_live
        g["_IMG_FAV_LIVE_MT"] = prev_mt
        g["TRASH_FILE"] = prev_trash
        g["_TRASH_LIVE"] = prev_tlive
        g["_TRASH_LIVE_MT"] = prev_tmt
        g["_LAST_PURGE"] = prev_purge
        g["FAV_BACKUP_FILE"] = prev_bk
        g["_FAV_BACKUP_LIVE"] = prev_blive
        g["_FAV_BACKUP_LIVE_MT"] = prev_bmt
        try:
            _shutil.rmtree(tmp, ignore_errors=True)
        except Exception:
            pass



    tmp3 = tempfile.mkdtemp(prefix="opv_favdir_")
    custom = tempfile.mkdtemp(prefix="opv_favcustom_")
    prev_root = g["_output_root"]
    prev_fav = g["IMG_FAV_FILE"]
    prev_live = g["_IMG_FAV_LIVE"]
    prev_mt = g["_IMG_FAV_LIVE_MT"]
    prev_bk = g["FAV_BACKUP_FILE"]
    prev_blive = g["_FAV_BACKUP_LIVE"]
    prev_bmt = g["_FAV_BACKUP_LIVE_MT"]
    try:
        def _fake_root3():
            return os.path.abspath(tmp3)
        g["_output_root"] = _fake_root3
        g["IMG_FAV_FILE"] = os.path.join(tmp3, "favs.json")
        g["_IMG_FAV_LIVE"] = None
        g["_IMG_FAV_LIVE_MT"] = None
        g["FAV_BACKUP_FILE"] = os.path.join(tmp3, "fav_backup.json")
        g["_FAV_BACKUP_LIVE"] = None
        g["_FAV_BACKUP_LIVE_MT"] = None
        open(os.path.join(tmp3, "pic.png"), "wb").write(b"pic")
        info0 = fav_backup_info()
        check("backup default inside output", info0.get("using_default") is True and IMG_FAV_COPY_SUB in str(info0.get("dir") or ""), str(info0))
        setr = set_fav_backup_dir(custom)
        check("set custom backup", setr.get("ok") and os.path.abspath(setr.get("dir") or "") == os.path.abspath(custom), str(setr))
        dest, rel, fn = _ensure_fav_copy(os.path.join(tmp3, "pic.png"), "pic.png", "")
        check("custom copy dest", os.path.isfile(dest) and dest.startswith(os.path.abspath(custom)), dest)
        check("custom copy not cut", os.path.isfile(os.path.join(tmp3, "pic.png")))
        check("custom rel outside", rel is None, str(rel))
        listed = list_output("", deep=True, page_size=120)
        folders = [f.get("name") for f in (listed.get("folders") or [])]
        check("custom backup not in output list", os.path.basename(custom) not in folders, str(folders))
        url = _fav_item_url("pic.png", "", False, rel)
        check("custom view url", "fav_copy" in url, url)
        back = set_fav_backup_dir("")
        check("reset default backup", back.get("ok") and back.get("using_default") is True, str(back))
        dest2, rel2, _fn2 = _fav_copy_abs("pic.png", "")
        check("migrated to default", os.path.isfile(dest2) and rel2 == IMG_FAV_COPY_SUB, dest2 + " " + str(rel2))
        g_parse = _guid_from_str("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")
        check("guid parse", int(g_parse.Data1) == 0xDC1C5A9C)
        check("pick helper", callable(pick_fav_backup_dir))
        smoke_ok, smoke_err = _file_open_dialog_smoke()
        check("file dialog smoke", smoke_ok, smoke_err)
    except Exception as e:
        check("fav dir tests", False, str(e))
    finally:
        g["_output_root"] = prev_root
        g["IMG_FAV_FILE"] = prev_fav
        g["_IMG_FAV_LIVE"] = prev_live
        g["_IMG_FAV_LIVE_MT"] = prev_mt
        g["FAV_BACKUP_FILE"] = prev_bk
        g["_FAV_BACKUP_LIVE"] = prev_blive
        g["_FAV_BACKUP_LIVE_MT"] = prev_bmt
        try:
            _shutil.rmtree(tmp3, ignore_errors=True)
            _shutil.rmtree(custom, ignore_errors=True)
        except Exception:
            pass

    tmp2 = tempfile.mkdtemp(prefix="opv_folders_")
    prev_root = g["_output_root"]
    prev_fav = g["IMG_FAV_FILE"]
    prev_live = g["_IMG_FAV_LIVE"]
    prev_mt = g["_IMG_FAV_LIVE_MT"]
    prev_rate = g["IMG_RATE_FILE"]
    prev_rlive = g["_IMG_RATE_LIVE"]
    prev_rmt = g["_IMG_RATE_LIVE_MT"]
    prev_trash = g["TRASH_FILE"]
    prev_tlive = g["_TRASH_LIVE"]
    prev_tmt = g["_TRASH_LIVE_MT"]
    prev_purge = g["_LAST_PURGE"]
    prev_idx = g["_INDEX_LIVE"]
    prev_idxr = g["_INDEX_LIVE_ROOT"]
    prev_bk = g["FAV_BACKUP_FILE"]
    prev_blive = g["_FAV_BACKUP_LIVE"]
    prev_bmt = g["_FAV_BACKUP_LIVE_MT"]
    prev_idx_file = g["INDEX_FILE"]
    prev_agg = g["_AGG_CACHE"]
    try:
        def _fake_root2():
            return os.path.abspath(tmp2)
        g["_output_root"] = _fake_root2
        g["IMG_FAV_FILE"] = os.path.join(tmp2, "favs.json")
        g["_IMG_FAV_LIVE"] = None
        g["_IMG_FAV_LIVE_MT"] = None
        g["IMG_RATE_FILE"] = os.path.join(tmp2, "rates.json")
        g["_IMG_RATE_LIVE"] = None
        g["_IMG_RATE_LIVE_MT"] = None
        g["TRASH_FILE"] = os.path.join(tmp2, "trash.json")
        g["_TRASH_LIVE"] = None
        g["_TRASH_LIVE_MT"] = None
        g["_LAST_PURGE"] = 0.0
        g["_INDEX_LIVE"] = None
        g["_INDEX_LIVE_ROOT"] = None
        g["FAV_BACKUP_FILE"] = os.path.join(tmp2, "fav_backup.json")
        g["_FAV_BACKUP_LIVE"] = None
        g["_FAV_BACKUP_LIVE_MT"] = None
        g["INDEX_FILE"] = os.path.join(tmp2, "index.json")
        g["_AGG_CACHE"] = {}
        open(os.path.join(tmp2, "a.png"), "wb").write(b"aaaa")
        open(os.path.join(tmp2, "b.png"), "wb").write(b"bbbb")
        mk = mkdir_output("", "sorted")
        check("mkdir ok", mk.get("ok") and mk.get("subfolder") == "sorted", str(mk))
        check("mkdir exists", os.path.isdir(os.path.join(tmp2, "sorted")))
        bad = mkdir_output("", OPV_TRASH_SUB)
        check("mkdir reserved", not bad.get("ok"), str(bad))
        ap = os.path.join(tmp2, "a.png")
        st_a = os.stat(ap)
        rec_a = {
            "mtime": int(st_a.st_mtime),
            "size": int(st_a.st_size),
            "artists": ["John_Doe"],
            "characters": ["Hestia"],
            "series": ["DanMachi"],
            "tags": ["smile"],
            "model": "anima",
        }
        g["_INDEX_LIVE"] = {
            "root": os.path.abspath(tmp2),
            "ver": INDEX_VER,
            "folders": {"": {"files": {"a.png": rec_a}}},
        }
        g["_INDEX_LIVE_ROOT"] = os.path.abspath(tmp2)
        g["_AGG_CACHE"] = {
            ("tag", "", True): {"ok": True, "tags": [{"tag": "smile", "key": "smile", "count": 1, "cn": "微笑"}], "png": 1},
            ("tag", "", False): {"ok": True, "tags": [{"tag": "smile", "key": "smile", "count": 1}], "png": 1},
            ("artist", "", False): {"ok": True, "artists": [{"tag": "John_Doe", "key": "john doe", "count": 1}], "png": 1},
            ("tag", "sorted", False): {"ok": True, "tags": [], "png": 0},
            ("used", "", False): {"ok": True, "all_keys": ["john doe"], "solo_keys": ["john doe"]},
        }
        mv = move_output_items([{"filename": "a.png", "subfolder": ""}], "sorted")
        check("move one", mv.get("ok") and mv.get("moved") == 1, str(mv))
        check("move not cut leftover", (not os.path.isfile(os.path.join(tmp2, "a.png"))) and os.path.isfile(os.path.join(tmp2, "sorted", "a.png")))
        live_folders = (g["_INDEX_LIVE"] or {}).get("folders") or {}
        src_files = ((live_folders.get("") or {}).get("files") or {})
        dst_files = ((live_folders.get("sorted") or {}).get("files") or {})
        check("index left source", "a.png" not in src_files, str(list(src_files)))
        kept = dst_files.get("a.png") or {}
        check("index followed", kept.get("tags") == ["smile"] and kept.get("model") == "anima", str(kept))
        deep_tags = ((g["_AGG_CACHE"].get(("tag", "", True)) or {}).get("tags") or [])
        check("deep count stays", any(it.get("key") == "smile" and it.get("count") == 1 and it.get("cn") == "微笑" for it in deep_tags), str(deep_tags))
        root_tags = ((g["_AGG_CACHE"].get(("tag", "", False)) or {}).get("tags") or [])
        check("root count drops", not any(it.get("key") == "smile" for it in root_tags), str(root_tags))
        dest_tags = ((g["_AGG_CACHE"].get(("tag", "sorted", False)) or {}).get("tags") or [])
        check("dest count gains", any(it.get("key") == "smile" and it.get("count") == 1 for it in dest_tags), str(dest_tags))
        root_arts = ((g["_AGG_CACHE"].get(("artist", "", False)) or {}).get("artists") or [])
        check("artist count drops", not root_arts, str(root_arts))
        check("used scope dropped", ("used", "", False) not in g["_AGG_CACHE"])
        followed = tag_index_for_scope("sorted", False)
        followed_keys = [it.get("key") for it in (followed.get("tags") or [])]
        check("no reread after move", "smile" in followed_keys, str(followed_keys))

        open(os.path.join(tmp2, "c.png"), "wb").write(b"cccc")
        open(os.path.join(tmp2, "d.png"), "wb").write(b"dddd")
        img_rate_set("c.png", "", 4)
        img_fav_set("c.png", "", True)
        unc_gone, unc_err = _recycle_many(["\\\\server\\share\\a.png"])
        check("recycle unc", unc_gone == [] and ("网络" in (unc_err or "")), str(unc_err))
        prev_batch = g["_recycle_many"]

        def _fake_recycle_many(paths):
            gone = []
            for p in paths:
                if os.path.basename(p) == "d.png":
                    continue
                os.remove(p)
                gone.append(p)
            return gone, "移入回收站失败"

        g["_recycle_many"] = _fake_recycle_many
        try:
            empty = recycle_output_items([])
            check("recycle empty", (not empty.get("ok")) and empty.get("recycled") == 0, str(empty))
            rej = recycle_output_items([{"filename": "notes.txt", "subfolder": ""}])
            check("recycle skip non-image", (not rej.get("ok")) and rej.get("recycled") == 0, str(rej))
            escaped = recycle_output_items([{"filename": "c.png", "subfolder": "../.."}])
            check("recycle rejects escape", not escaped.get("ok"), str(escaped))
            miss = recycle_output_items([{"filename": "gone.png", "subfolder": ""}])
            check("recycle missing counts", miss.get("ok") and miss.get("recycled") == 1, str(miss))
            both = recycle_output_items([
                {"filename": "c.png", "subfolder": ""},
                {"filename": "d.png", "subfolder": ""},
                {"filename": "c.png", "subfolder": ""},
            ])
            check("recycle batch partial", both.get("ok") and both.get("recycled") == 1, str(both))
            names_r = [it.get("filename") for it in (both.get("items") or [])]
            check("recycle reports c", names_r == ["c.png"], str(names_r))
            check("recycle left d", os.path.isfile(os.path.join(tmp2, "d.png")) and (not os.path.isfile(os.path.join(tmp2, "c.png"))))
            check("recycle dropped rate", img_rate_map().get("/c.png") in (None, 0), str(img_rate_map()))
            check("recycle dropped fav", "/c.png" not in img_fav_keys(), str(sorted(img_fav_keys())))
            check("recycle kept error", "移入回收站失败" in (both.get("errors") or []), str(both.get("errors")))
        finally:
            g["_recycle_many"] = prev_batch
        if os.path.isfile(os.path.join(tmp2, "d.png")):
            os.remove(os.path.join(tmp2, "d.png"))

        listed = list_output("", deep=False, page_size=120)
        names = [it["filename"] for it in (listed.get("items") or [])]
        folders = [f.get("name") for f in (listed.get("folders") or [])]
        check("root after move", "b.png" in names and "a.png" not in names, str(names))
        check("sorted visible", "sorted" in folders, str(folders))
        mv2 = move_output_items(dest_sub="sorted", source_sub="", all_in_folder=True)
        check("move rest", mv2.get("ok") and mv2.get("moved") == 1, str(mv2))
        tr = trash_output_folder("sorted")
        check("trash folder", tr.get("ok"), str(tr))
        check("gone from output", not os.path.isdir(os.path.join(tmp2, "sorted")))
        check("in viewer trash", os.path.isdir(os.path.join(tmp2, OPV_TRASH_SUB, "sorted")))
        listed3 = list_output("", deep=True, page_size=120)
        folders3 = [f.get("name") for f in (listed3.get("folders") or [])]
        hidden = [it for it in (listed3.get("items") or []) if it.get("filename") in ("a.png", "b.png")]
        check("gallery hides trash", OPV_TRASH_SUB not in folders3 and not hidden, str(folders3) + str(hidden))
        listed4 = list_output(OPV_TRASH_SUB, deep=False, page_size=120)
        check("browse trash", listed4.get("is_trash") is True, str(listed4.get("is_trash")))
        tf = [f.get("name") for f in (listed4.get("folders") or [])]
        check("trash shows folder", "sorted" in tf, str(tf))
        rs = restore_trash_folder("sorted")
        check("restore ok", rs.get("ok") and rs.get("subfolder") == "sorted", str(rs))
        check("restored files", os.path.isfile(os.path.join(tmp2, "sorted", "a.png")) and os.path.isfile(os.path.join(tmp2, "sorted", "b.png")))
        tr2 = trash_output_folder("sorted")
        check("trash again", tr2.get("ok"), str(tr2))
        with _TRASH_LOCK:
            data = _load_trash()
            for it in data.get("items") or []:
                if isinstance(it, dict):
                    it["trashed_at"] = 1
            _save_trash(data)
        n = purge_expired_trash(now=int(time.time()))
        check("purge expired", n >= 1 and not os.path.isdir(os.path.join(tmp2, OPV_TRASH_SUB, "sorted")), str(n))
        mkdir_output("", "keepme")
        open(os.path.join(tmp2, "keepme", "c.png"), "wb").write(b"cccc")
        trash_output_folder("keepme")
        em = empty_opv_trash()
        check("empty trash", em.get("ok") and not os.path.isdir(os.path.join(tmp2, OPV_TRASH_SUB, "keepme")), str(em))
        g["_FAV_RECONCILE_CLEAN_UNTIL"] = 0.0
        open(os.path.join(tmp2, "moved.png"), "wb").write(b"same-bytes")
        fav_m = img_fav_set("moved.png", "", True)
        rate_m = img_rate_set("moved.png", "", 4)
        check("fav before move", fav_m.get("ok") and fav_m.get("on") and rate_m.get("rating") == 4, str(fav_m) + str(rate_m))
        os.makedirs(os.path.join(tmp2, "box"), exist_ok=True)
        shutil.move(os.path.join(tmp2, "moved.png"), os.path.join(tmp2, "box", "moved.png"))
        g["_FAV_RECONCILE_CLEAN_UNTIL"] = 0.0
        reconcile_moved_img_favs(force=True)
        keys_m = img_fav_keys()
        rates_m = img_rate_map()
        check("follow moved fav", "box/moved.png" in keys_m and "/moved.png" not in keys_m, str(sorted(keys_m)))
        check("follow moved rate", rates_m.get("box/moved.png") == 4, str(rates_m))
        check("backup followed", os.path.isfile(os.path.join(tmp2, IMG_FAV_COPY_SUB, "box", "moved.png")) and not os.path.isfile(os.path.join(tmp2, IMG_FAV_COPY_SUB, "moved.png")))
        again = img_fav_set("moved.png", "box", True)
        fav_rows = [it for it in (_load_img_favs().get("items") or []) if it.get("filename") == "moved.png"]
        check("second fav is same", again.get("ok") and again.get("on") and len(fav_rows) == 1, str(again) + str(fav_rows))
        open(os.path.join(tmp2, "dup.png"), "wb").write(b"dup-bytes")
        img_fav_set("dup.png", "", True)
        img_rate_set("dup.png", "", 5)
        os.makedirs(os.path.join(tmp2, "later"), exist_ok=True)
        shutil.copy(os.path.join(tmp2, "dup.png"), os.path.join(tmp2, "later", "dup.png"))
        os.remove(os.path.join(tmp2, "dup.png"))
        img_rate_set("dup.png", "later", 2)
        with _IMG_FAV_LOCK:
            data = _load_img_favs()
            data["items"].append({"filename": "dup.png", "subfolder": "later", "added_at": int(time.time())})
            _save_img_favs(data)
        g["_FAV_RECONCILE_CLEAN_UNTIL"] = 0.0
        reconcile_moved_img_favs(force=True)
        dup_rows = [it for it in (_load_img_favs().get("items") or []) if it.get("filename") == "dup.png"]
        dup_rates = img_rate_map()
        check("merge dup fav", len(dup_rows) == 1 and (dup_rows[0].get("subfolder") or "") == "later", str(dup_rows))
        check("keep live rating", dup_rates.get("later/dup.png") == 2 and "/dup.png" not in dup_rates, str(dup_rates))
        check("hash stored", len(str((fav_rows[0] or {}).get("sha256") or "")) == 64, str(fav_rows))
        open(os.path.join(tmp2, "lookalike.png"), "wb").write(b"look-aaa")
        img_fav_set("lookalike.png", "", True)
        os.makedirs(os.path.join(tmp2, "other"), exist_ok=True)
        open(os.path.join(tmp2, "other", "lookalike.png"), "wb").write(b"look-bbb")
        os.remove(os.path.join(tmp2, "lookalike.png"))
        g["_FAV_RECONCILE_CLEAN_UNTIL"] = 0.0
        reconcile_moved_img_favs(force=True)
        keys_l = img_fav_keys()
        check("reject same size", "/lookalike.png" in keys_l and "other/lookalike.png" not in keys_l, str(sorted(keys_l)))
        os.makedirs(os.path.join(tmp2, "real"), exist_ok=True)
        open(os.path.join(tmp2, "real", "lookalike.png"), "wb").write(b"look-aaa")
        g["_FAV_RECONCILE_CLEAN_UNTIL"] = 0.0
        reconcile_moved_img_favs(force=True)
        keys_r = img_fav_keys()
        check("hash follow", "real/lookalike.png" in keys_r and "/lookalike.png" not in keys_r, str(sorted(keys_r)))
    except Exception as e:
        check("folder tests", False, str(e))
    finally:
        g["_output_root"] = prev_root
        g["IMG_FAV_FILE"] = prev_fav
        g["_IMG_FAV_LIVE"] = prev_live
        g["_IMG_FAV_LIVE_MT"] = prev_mt
        g["IMG_RATE_FILE"] = prev_rate
        g["_IMG_RATE_LIVE"] = prev_rlive
        g["_IMG_RATE_LIVE_MT"] = prev_rmt
        g["TRASH_FILE"] = prev_trash
        g["_TRASH_LIVE"] = prev_tlive
        g["_TRASH_LIVE_MT"] = prev_tmt
        g["_LAST_PURGE"] = prev_purge
        g["_INDEX_LIVE"] = prev_idx
        g["_INDEX_LIVE_ROOT"] = prev_idxr
        g["FAV_BACKUP_FILE"] = prev_bk
        g["_FAV_BACKUP_LIVE"] = prev_blive
        g["_FAV_BACKUP_LIVE_MT"] = prev_bmt
        g["INDEX_FILE"] = prev_idx_file
        g["_AGG_CACHE"] = prev_agg
        try:
            _shutil.rmtree(tmp2, ignore_errors=True)
        except Exception:
            pass

    if sys.platform == "win32":
        import tempfile
        drag_dir = tempfile.mkdtemp(prefix="opv-drag-")
        drag_file = os.path.join(drag_dir, "sample.png")
        try:
            with open(drag_file, "wb") as df:
                df.write(b"\x89PNG\r\n\x1a\n")
            data_ptr, data_pidls = _win_drag_data_object(drag_file)
            check("drag shell object", bool(data_ptr))
            _com_release(data_ptr)
            for one in data_pidls:
                ctypes.windll.shell32.ILFree(one)
            if not _left_button_down():
                quiet_ok, quiet_err = _win_drag_files([drag_file])
                check("drag waits for button", quiet_ok is False and quiet_err == "", quiet_err)
        except Exception as e:
            check("drag shell object", False, str(e))
        finally:
            shutil.rmtree(drag_dir, ignore_errors=True)

    return fails


if __name__ == "__main__":
    fails = _run_self_tests()
    if fails:
        print("FAIL", fails)
        raise SystemExit(1)
    print("OK")
