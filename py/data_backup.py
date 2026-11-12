"""
一键备份/恢复所有插件数据
"""
import os, json, zipfile, io, re, time
from server import PromptServer
from aiohttp import web

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG_DIR = os.path.join(PLUGIN_DIR, "popup_bgs")
_BG_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
_BG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_BG_MAX = 8 * 1024 * 1024

# 磁盘相对插件根的路径。g_context.json 是只读词库，settings.json 含密钥，均不打包不恢复。
DATA_RELS = [
    "favorites.json",
    "gelbooru_favorites.json",
    "prompt_favorites.json",
    "user_data.json",
    "prompt_model_tags.json",
    "character_cards.json",
    "custom_tags.json",
    "py/user_tag_mappings.json",
    "py/user_tag_patterns.json",
    "py/preset_user_data.json",
    "py/user_translations.json",
    "artist_live_thumbs.json",
    "output_image_favorites.json",
]
_DATA_SET = set(DATA_RELS)
_FAV_RELS = {"favorites.json", "gelbooru_favorites.json"}
_MAP_RELS = {
    "py/user_tag_mappings.json",
    "py/user_tag_patterns.json",
    "py/user_translations.json",
}
_FAV_CATS = ("artists", "characters", "series", "general", "images")
_LEGACY_MAP = {
    "user_tag_mappings.json": "py/user_tag_mappings.json",
    "user_tag_patterns.json": "py/user_tag_patterns.json",
    "preset_user_data.json": "py/preset_user_data.json",
    "user_translations.json": "py/user_translations.json",
}
_SKIP_NAMES = {
    "g_context.json", "py/g_context.json",
    "settings.json", "py/settings.json",
    "persist_cn.json", "py/persist_cn.json",
    "cloud_translations.json", "py/cloud_translations.json",
}
_LS_STRIP_EXACT = {
    "db_trans_key_bd", "db_trans_key_ds", "db_trans_key_cu",
    "db_trans_api_key", "db_trans_key", "db_pt_custom_sound",
}


def _popup_bg_path(name):
    if not name or not _BG_NAME_RE.match(name):
        return None
    fp = os.path.join(BG_DIR, name)
    root = os.path.abspath(BG_DIR)
    ap = os.path.abspath(fp)
    try:
        if os.path.commonpath([ap, root]) != root:
            return None
    except ValueError:
        return None
    return ap


def _dest_path(rel):
    rel = (rel or "").replace("\\", "/").lstrip("/")
    if not rel:
        return None
    fp = os.path.abspath(os.path.join(PLUGIN_DIR, rel.replace("/", os.sep)))
    root = os.path.abspath(PLUGIN_DIR)
    try:
        if os.path.commonpath([fp, root]) != root:
            return None
    except ValueError:
        return None
    return fp


def _read_json(rel):
    fp = _dest_path(rel)
    if not fp or not os.path.isfile(fp):
        return None
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _write_json(rel, obj):
    fp = _dest_path(rel)
    if not fp:
        return
    parent = os.path.dirname(fp)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _write_bytes(rel, content):
    fp = _dest_path(rel)
    if not fp:
        return
    parent = os.path.dirname(fp)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(fp, "wb") as f:
        f.write(content)


def _safe_zip_name(name):
    n = (name or "").replace("\\", "/").lstrip("/")
    if not n or n.endswith("/"):
        return None
    parts = n.split("/")
    if any(p in ("", ".", "..") for p in parts):
        return None
    if len(parts[0]) == 2 and parts[0][1] == ":":
        return None
    return n


def _img_fav_item_key(it):
    if not isinstance(it, dict):
        return None
    name = os.path.basename(str(it.get("filename") or "").replace("\\", "/"))
    sub = str(it.get("subfolder") or "").replace("\\", "/").strip("/")
    if not name or name in (".", ".."):
        return None
    if sub and any(p in ("", ".", "..") for p in sub.split("/")):
        return None
    return (sub + "/" + name) if sub else name


def _merge_img_favs(local, backup):
    def items_of(obj):
        if isinstance(obj, dict) and isinstance(obj.get("items"), list):
            return obj["items"]
        return []

    by = {}
    order = []

    def take(it, from_backup):
        key = _img_fav_item_key(it)
        if not key:
            return
        if key not in by:
            order.append(key)
            by[key] = dict(it)
            return
        cur = by[key]
        if from_backup:
            merged = dict(cur)
            merged.update(it)
            if not str(merged.get("sha256") or "").strip() and cur.get("sha256"):
                merged["sha256"] = cur["sha256"]
            by[key] = merged
        elif not str(cur.get("sha256") or "").strip() and it.get("sha256"):
            cur["sha256"] = it["sha256"]

    for it in items_of(local):
        take(it, False)
    for it in items_of(backup):
        take(it, True)
    ver = 1
    src = backup if isinstance(backup, dict) else local
    if isinstance(src, dict):
        try:
            ver = int(src.get("ver") or 1)
        except Exception:
            ver = 1
    return {"ver": ver, "items": [by[k] for k in order]}


def _resolve_zip_entry(zname):
    n = _safe_zip_name(zname)
    if not n:
        return None
    if n in _SKIP_NAMES or n.endswith(".db"):
        return None
    if n == "_localStorage.json":
        return "_localStorage.json"
    mapped = _LEGACY_MAP.get(n, n)
    if mapped in _DATA_SET:
        return mapped
    if n.startswith("prompt_thumbs/") and n.count("/") == 1:
        base = n.split("/")[-1]
        if base and not base.startswith("."):
            return "prompt_thumbs/" + base
    if n.startswith("popup_bgs/") and n.count("/") == 1:
        base = n.split("/")[-1]
        if base and not base.startswith("."):
            return "popup_bgs/" + base
    if n.startswith("web/thumbs/") and n.count("/") == 2:
        base = n.split("/")[-1]
        ext = os.path.splitext(base)[1].lower()
        if ext in (".jpg", ".jpeg", ".png") and base and not base.startswith("."):
            return "web/thumbs/" + base
    if n.startswith("web/live_thumbs/") and n.count("/") == 2:
        base = n.split("/")[-1]
        ext = os.path.splitext(base)[1].lower()
        if ext in (".jpg", ".jpeg") and base and not base.startswith("."):
            return "web/live_thumbs/" + base
    if n.startswith("web/combo_thumbs/") and n.count("/") == 2:
        base = n.split("/")[-1]
        ext = os.path.splitext(base)[1].lower()
        if ext in (".jpg", ".jpeg") and base and not base.startswith("."):
            return "web/combo_thumbs/" + base
    return None


def _parse_json_bytes(content):
    try:
        return json.loads(content.decode("utf-8-sig"))
    except Exception:
        return None


_LS_WANT_EXACT = {
    "danbooru_artist_combos", "db_free_mode", "db_ds_model",
    "anima_soft_blur", "anima_cheap_fx", "anima_theme", "anima_theme_custom",
    "db_pt_hidden", "db_av_hidden", "db_pt_chip_mode", "db_av_chip_mode",
    "tp_hide_pinned", "tp_pin_collapsed", "tp_pin_rows", "tp_pin_h", "tp_pin_order",
    "db_sort", "db_exclude_img_tags", "db_preset_eye", "db_preset_size2",
    "db_fav_tag_size", "db_fav_tag_pos", "db_fav_size", "db_fav_zoom", "db_fav_side_zoom",
    "db_pt_sound", "db_pt_sound_type",
}
_LS_WANT_PREFIX = ("nb_", "apc_", "anima_popup_", "db_trans_", "gel_", "adex_fav_")


def _ls_skip_key(k):
    if not k:
        return True
    lk = k.lower()
    if lk.startswith("comfy.") or lk.startswith("comfyui.") or lk.startswith("litegraph"):
        return True
    if lk.startswith("workflow.") or "workflow.draft" in lk:
        return True
    if k in _LS_STRIP_EXACT:
        return True
    if k.startswith("db_trans_key"):
        return True
    if k == "db_pt_custom_sound" or k.startswith("db_pt_custom_sound"):
        return True
    if k.startswith("db_pt_content_") or k.startswith("db_av_content_"):
        return True
    if k.startswith("db_pt_pause_") or k.startswith("db_av_pause_"):
        return True
    if k.startswith("db_pt_hidden_") or k.startswith("db_av_hidden_"):
        return True
    return False


def _ls_want_key(k):
    if _ls_skip_key(k):
        return False
    if k in _LS_WANT_EXACT:
        return True
    return any(k.startswith(p) for p in _LS_WANT_PREFIX)


def _sanitize_ls(obj):
    if not isinstance(obj, dict):
        return {}
    out = {}
    for k, v in obj.items():
        if not isinstance(k, str):
            continue
        if not _ls_want_key(k):
            continue
        out[k] = v
    return out


def _union_list(a, b):
    out = []
    seen = set()

    def add(x):
        try:
            key = json.dumps(x, sort_keys=True, ensure_ascii=False) if isinstance(x, (dict, list)) else x
        except Exception:
            key = str(x)
        if key in seen:
            return
        seen.add(key)
        out.append(x)

    for x in a or []:
        add(x)
    for x in b or []:
        add(x)
    return out


def _deep_merge(local, backup):
    if not isinstance(local, dict) or not isinstance(backup, dict):
        return backup
    out = dict(local)
    for k, v in backup.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _merge_cat_dict(local, backup):
    local = local if isinstance(local, dict) else {}
    backup = backup if isinstance(backup, dict) else {}
    out = dict(local)
    loc_order = local.get("_order") if isinstance(local.get("_order"), list) else []
    bak_order = backup.get("_order") if isinstance(backup.get("_order"), list) else []
    for k, v in backup.items():
        if k == "_order":
            continue
        out[k] = v
    if loc_order or bak_order:
        out["_order"] = _union_list(loc_order, bak_order)
    return out


def _merge_folders(local, backup):
    local = local if isinstance(local, dict) else {}
    backup = backup if isinstance(backup, dict) else {}
    try:
        out = json.loads(json.dumps(local)) if local else {}
    except Exception:
        out = dict(local) if local else {}
    for cat, folders in backup.items():
        if not isinstance(folders, dict):
            out[cat] = folders
            continue
        dest = out.setdefault(cat, {})
        if not isinstance(dest, dict):
            out[cat] = dict(folders)
            continue
        for fname, items in folders.items():
            if isinstance(items, list):
                dest[fname] = _union_list(
                    dest.get(fname) if isinstance(dest.get(fname), list) else [],
                    items,
                )
            else:
                dest[fname] = items
    return out


def _merge_favorites(local, backup):
    if not isinstance(local, dict):
        local = {}
    if not isinstance(backup, dict):
        return backup
    out = dict(local)
    cats = set(_FAV_CATS)
    for k in list(local.keys()) + list(backup.keys()):
        if str(k).startswith("_"):
            continue
        if isinstance(local.get(k), dict) or isinstance(backup.get(k), dict):
            cats.add(k)
    for cat in cats:
        if cat in local or cat in backup:
            out[cat] = _merge_cat_dict(local.get(cat), backup.get(cat))
    if isinstance(local.get("_order"), list) or isinstance(backup.get("_order"), list):
        out["_order"] = _union_list(
            local.get("_order") if isinstance(local.get("_order"), list) else [],
            backup.get("_order") if isinstance(backup.get("_order"), list) else [],
        )
    if "_folders" in backup or "_folders" in local:
        if "_folders" not in backup:
            out["_folders"] = local.get("_folders")
        else:
            out["_folders"] = _merge_folders(local.get("_folders"), backup.get("_folders"))
    for meta in ("_folder_order", "_folder_pinned"):
        loc = local.get(meta) if isinstance(local.get(meta), dict) else {}
        bak = backup.get(meta) if isinstance(backup.get(meta), dict) else {}
        if loc or bak:
            cats = set(loc) | set(bak)
            merged = {}
            for cat in cats:
                merged[cat] = _union_list(
                    loc.get(cat) if isinstance(loc.get(cat), list) else [],
                    bak.get(cat) if isinstance(bak.get(cat), list) else [],
                )
            out[meta] = merged
    return out


def _keep_folders_if_missing(local, backup):
    if not isinstance(backup, dict):
        return backup
    out = dict(backup)
    if isinstance(local, dict) and "_folders" not in out and "_folders" in local:
        out["_folders"] = local["_folders"]
    if isinstance(local, dict):
        if "_folder_order" not in out and "_folder_order" in local:
            out["_folder_order"] = local["_folder_order"]
        if "_folder_pinned" not in out and "_folder_pinned" in local:
            out["_folder_pinned"] = local["_folder_pinned"]
    return out


def _merge_id_list(local, backup):
    if not isinstance(local, list):
        local = []
    if not isinstance(backup, list):
        backup = []
    by_id = {}
    order = []
    extras_local = []
    extras_bak = []
    for item in local:
        if isinstance(item, dict) and item.get("id") is not None:
            iid = item["id"]
            by_id[iid] = item
            if iid not in order:
                order.append(iid)
        else:
            extras_local.append(item)
    for item in backup:
        if isinstance(item, dict) and item.get("id") is not None:
            iid = item["id"]
            by_id[iid] = item
            if iid not in order:
                order.append(iid)
        else:
            extras_bak.append(item)
    return extras_local + [by_id[i] for i in order] + extras_bak


def _merge_prompt_favs(local, backup):
    if not isinstance(local, dict):
        local = {}
    if not isinstance(backup, dict):
        return backup
    out = dict(local)
    out.update(backup)
    out["prompts"] = _merge_id_list(
        local.get("prompts") if isinstance(local.get("prompts"), list) else [],
        backup.get("prompts") if isinstance(backup.get("prompts"), list) else [],
    )
    out["folders"] = _union_list(
        local.get("folders") if isinstance(local.get("folders"), list) else [],
        backup.get("folders") if isinstance(backup.get("folders"), list) else [],
    )
    out["composer_folders"] = _union_list(
        local.get("composer_folders") if isinstance(local.get("composer_folders"), list) else [],
        backup.get("composer_folders") if isinstance(backup.get("composer_folders"), list) else [],
    )
    return out


def _merge_preset_user(local, backup):
    if not isinstance(local, dict):
        local = {}
    if not isinstance(backup, dict):
        return backup
    out = dict(local)
    for key in ("deleted", "custom_tags", "tag_categories"):
        lv = local.get(key) if isinstance(local.get(key), dict) else {}
        bv = backup.get(key) if isinstance(backup.get(key), dict) else {}
        merged = dict(lv)
        merged.update(bv)
        out[key] = merged
    for k, v in backup.items():
        if k in ("deleted", "custom_tags", "tag_categories"):
            continue
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _merge_custom_tags(local, backup):
    if not isinstance(local, dict):
        local = {}
    if not isinstance(backup, dict):
        return backup
    loc_cats = local.get("categories") if isinstance(local.get("categories"), list) else []
    bak_cats = backup.get("categories") if isinstance(backup.get("categories"), list) else []
    by_name = {}
    order = []
    for cat in loc_cats:
        if not isinstance(cat, dict):
            continue
        name = cat.get("name")
        if not name:
            continue
        by_name[name] = {
            "name": name,
            "tags": list(cat.get("tags") or []) if isinstance(cat.get("tags"), list) else [],
        }
        if name not in order:
            order.append(name)
    for cat in bak_cats:
        if not isinstance(cat, dict):
            continue
        name = cat.get("name")
        if not name:
            continue
        tags = cat.get("tags") if isinstance(cat.get("tags"), list) else []
        if name in by_name:
            by_name[name]["tags"] = _union_list(by_name[name].get("tags") or [], tags)
        else:
            by_name[name] = {"name": name, "tags": list(tags)}
            order.append(name)
    out = dict(local)
    out.update(backup)
    out["categories"] = [by_name[n] for n in order]
    return out


def _merge_json(rel, local, backup):
    if local is None:
        return backup
    if backup is None:
        return local
    if rel in _FAV_RELS:
        return _merge_favorites(local, backup)
    if rel == "prompt_favorites.json":
        return _merge_prompt_favs(local, backup)
    if rel == "character_cards.json":
        return _merge_id_list(
            local if isinstance(local, list) else [],
            backup if isinstance(backup, list) else [],
        )
    if rel == "user_data.json":
        return _deep_merge(local, backup) if isinstance(local, dict) else backup
    if rel in _MAP_RELS:
        if isinstance(local, dict) and isinstance(backup, dict):
            out = dict(local)
            out.update(backup)
            return out
        return backup
    if rel == "py/preset_user_data.json":
        return _merge_preset_user(local, backup)
    if rel == "custom_tags.json":
        return _merge_custom_tags(local, backup)
    if rel == "output_image_favorites.json":
        return _merge_img_favs(local, backup)
    if rel == "prompt_model_tags.json":
        return _union_list(
            local if isinstance(local, list) else [],
            backup if isinstance(backup, list) else [],
        )
    if isinstance(local, dict) and isinstance(backup, dict):
        return _deep_merge(local, backup)
    return backup


_RESTORE_MAX = 1024 * 1024 * 1024
_ZIP_CTYPES = {"application/zip", "application/octet-stream", "application/x-zip-compressed"}


def _zip_bytes_from_part(data):
    if not data:
        return data
    if data[:2] == b"PK":
        return data
    idx = data.find(b"PK\x03\x04")
    if 0 < idx < 4096:
        return data[idx:]
    return data


def _bad_zip_message(data, declared):
    data = data or b""
    n = len(data)
    if data[:1] in (b"{", b"["):
        return "选中的是 JSON，不是备份压缩包。请选择 anima_backup_日期.zip 这个文件本身，不要选解压出来的 favorites.json。"
    if declared and n + 64 < declared:
        return "备份没有传完整。原文件 %d 字节，服务器只收到 %d 字节。请给 ComfyUI 加上启动参数 --max-upload-size 1024 后重新导入。" % (declared, n)
    if n < 22 or data[:2] != b"PK":
        return "服务器收到的 %d 字节不是 zip。请重新从原电脑拷贝 anima_backup_日期.zip，拷完后文件大小必须和原文件一致。" % n
    return "备份 zip 不完整（收到 %d 字节）。请重新拷贝 anima_backup_日期.zip，不要用会改写文件的传输方式。" % n


def register_routes():
    @PromptServer.instance.routes.post("/danbooru_anima/backup")
    async def backup_data(request):
        """接收 localStorage 数据 + 打包所有文件为 ZIP"""
        try:
            body = await request.json()
        except Exception:
            body = {}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for rel in DATA_RELS:
                fpath = _dest_path(rel)
                if fpath and os.path.isfile(fpath):
                    zf.write(fpath, rel.replace("\\", "/"))
            ls_data = _sanitize_ls(body.get("localStorage", {}))
            if ls_data:
                zf.writestr("_localStorage.json", json.dumps(ls_data, ensure_ascii=False))
            prompt_thumbs = os.path.join(PLUGIN_DIR, "prompt_thumbs")
            if os.path.isdir(prompt_thumbs):
                for f in os.listdir(prompt_thumbs):
                    if f.startswith("."):
                        continue
                    fp = os.path.join(prompt_thumbs, f)
                    if os.path.isfile(fp):
                        zf.write(fp, "prompt_thumbs/" + f)
            if os.path.isdir(BG_DIR):
                for f in os.listdir(BG_DIR):
                    if f.startswith("."):
                        continue
                    fp = os.path.join(BG_DIR, f)
                    if os.path.isfile(fp):
                        zf.write(fp, "popup_bgs/" + f)
            web_thumbs = os.path.join(PLUGIN_DIR, "web", "thumbs")
            if os.path.isdir(web_thumbs):
                for f in os.listdir(web_thumbs):
                    if f.startswith("."):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext in (".jpg", ".jpeg", ".png"):
                        fp = os.path.join(web_thumbs, f)
                        if os.path.isfile(fp):
                            zf.write(fp, "web/thumbs/" + f)
            live_thumbs = os.path.join(PLUGIN_DIR, "web", "live_thumbs")
            if os.path.isdir(live_thumbs):
                for f in os.listdir(live_thumbs):
                    if f.startswith("."):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext in (".jpg", ".jpeg"):
                        fp = os.path.join(live_thumbs, f)
                        if os.path.isfile(fp):
                            zf.write(fp, "web/live_thumbs/" + f)
            combo_thumbs = os.path.join(PLUGIN_DIR, "web", "combo_thumbs")
            if os.path.isdir(combo_thumbs):
                for f in os.listdir(combo_thumbs):
                    if f.startswith("."):
                        continue
                    ext = os.path.splitext(f)[1].lower()
                    if ext in (".jpg", ".jpeg"):
                        fp = os.path.join(combo_thumbs, f)
                        if os.path.isfile(fp):
                            zf.write(fp, "web/combo_thumbs/" + f)
        buf.seek(0)
        return web.Response(
            body=buf.read(),
            headers={
                "Content-Type": "application/zip",
                "Content-Disposition": 'attachment; filename="anima_backup.zip"',
            },
        )

    @PromptServer.instance.routes.post("/danbooru_anima/restore")
    async def restore_data(request):
        """从 ZIP 恢复数据。新客户端直接 POST application/zip；旧客户端仍走 multipart。"""
        try:
            try:
                request._client_max_size = _RESTORE_MAX
            except Exception:
                pass
            mode = "overwrite"
            declared = 0
            ctype = (request.content_type or "").split(";")[0].strip().lower()
            if ctype in _ZIP_CTYPES:
                qmode = (request.query.get("mode") or "").strip().lower()
                if qmode:
                    mode = qmode
                try:
                    declared = int(request.query.get("size") or "0")
                except Exception:
                    declared = 0
                zip_bytes = await request.read()
            else:
                reader = await request.multipart()
                zip_bytes = b""
                while True:
                    field = await reader.next()
                    if field is None:
                        break
                    name = str(field.name or "")
                    if name == "mode":
                        try:
                            mode = (await field.text()).strip().lower()
                        except Exception:
                            mode = "overwrite"
                        continue
                    if name == "size":
                        try:
                            declared = int((await field.text()).strip() or "0")
                        except Exception:
                            declared = 0
                        continue
                    data = await field.read()
                    if data:
                        zip_bytes = data
            if mode not in ("merge", "overwrite"):
                mode = "overwrite"
            zip_bytes = _zip_bytes_from_part(zip_bytes)
            if not zip_bytes:
                return web.json_response({"success": False, "error": "未接收到文件"}, status=400)
            if declared and len(zip_bytes) + 64 < declared:
                return web.json_response({
                    "success": False,
                    "error": "备份没有传完整。原文件 %d 字节，服务器只收到 %d 字节。请给 ComfyUI 加上启动参数 --max-upload-size 1024 后重新导入。" % (declared, len(zip_bytes)),
                }, status=400)
            buf = io.BytesIO(zip_bytes)
            if not zipfile.is_zipfile(buf):
                return web.json_response({"success": False, "error": _bad_zip_message(zip_bytes, declared)}, status=400)
            buf.seek(0)
            ls_restore = {}
            pending = {}
            with zipfile.ZipFile(buf, "r") as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    rel = _resolve_zip_entry(info.filename)
                    if not rel:
                        continue
                    content = zf.read(info)
                    orig = _safe_zip_name(info.filename) or rel
                    if rel == "_localStorage.json":
                        parsed = _parse_json_bytes(content)
                        if isinstance(parsed, dict):
                            ls_restore = parsed
                        continue
                    prev = pending.get(rel)
                    if prev is not None:
                        prev_name = prev[1]
                        if orig.startswith("py/") and not prev_name.startswith("py/"):
                            pending[rel] = (content, orig)
                        continue
                    pending[rel] = (content, orig)
            for rel, (content, _orig) in pending.items():
                if rel in _DATA_SET:
                    backup_obj = _parse_json_bytes(content)
                    if backup_obj is None:
                        continue
                    local_obj = _read_json(rel)
                    if mode == "merge":
                        merged = _merge_json(rel, local_obj, backup_obj)
                    else:
                        merged = backup_obj
                        if rel in _FAV_RELS:
                            merged = _keep_folders_if_missing(local_obj, merged)
                    _write_json(rel, merged)
                    continue
                dest = _dest_path(rel)
                if not dest:
                    continue
                if mode == "merge" and os.path.isfile(dest):
                    continue
                _write_bytes(rel, content)
            return web.json_response({"success": True, "localStorage": _sanitize_ls(ls_restore), "mode": mode})
        except web.HTTPRequestEntityTooLarge:
            return web.json_response({
                "success": False,
                "error": "备份太大，被 ComfyUI 的上传限制拦住了。请给启动参数加上 --max-upload-size 1024 后重启再导入。",
            }, status=413)
        except zipfile.BadZipFile:
            return web.json_response({
                "success": False,
                "error": "备份 zip 不完整。请重新拷贝 anima_backup_日期.zip，拷完后文件大小必须和原电脑上的文件一致。",
            }, status=400)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/danbooru_anima/popup_bgs")
    async def list_popup_bgs(request):
        from .ext_web import extension_static_url
        custom = []
        if os.path.isdir(BG_DIR):
            names = []
            for f in os.listdir(BG_DIR):
                fp = os.path.join(BG_DIR, f)
                if os.path.isfile(fp) and os.path.splitext(f)[1].lower() in _BG_EXTS:
                    names.append((os.path.getmtime(fp), f))
            names.sort(reverse=True)
            for _, f in names:
                custom.append({
                    "id": f,
                    "name": f,
                    "url": "/danbooru_anima/popup_bg/" + f,
                })
        return web.json_response({
            "success": True,
            "builtin": {
                "id": "builtin",
                "name": "内置立绘",
                "url": extension_static_url("heroine.png"),
            },
            "custom": custom,
        })

    @PromptServer.instance.routes.get("/danbooru_anima/popup_bg/{name}")
    async def get_popup_bg(request):
        fp = _popup_bg_path(request.match_info.get("name", ""))
        if fp and os.path.isfile(fp):
            return web.FileResponse(fp)
        return web.Response(status=404)

    @PromptServer.instance.routes.post("/danbooru_anima/popup_bgs/upload")
    async def upload_popup_bg(request):
        try:
            os.makedirs(BG_DIR, exist_ok=True)
            existing = [f for f in os.listdir(BG_DIR) if os.path.isfile(os.path.join(BG_DIR, f))]
            if len(existing) >= 30:
                return web.json_response({"success": False, "error": "自定义背景最多 30 张"}, status=400)
            reader = await request.multipart()
            field = await reader.next()
            if not field:
                return web.json_response({"success": False, "error": "未接收到文件"}, status=400)
            raw_name = os.path.basename(field.filename or "bg.png")
            ext = os.path.splitext(raw_name)[1].lower()
            if ext not in _BG_EXTS:
                return web.json_response({"success": False, "error": "仅支持 jpg / png / webp / gif"}, status=400)
            safe = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.splitext(raw_name)[0])[:40] or "bg"
            fname = "user_%d_%s%s" % (int(time.time()), safe, ext)
            dest = _popup_bg_path(fname)
            if not dest:
                return web.json_response({"success": False, "error": "文件名无效"}, status=400)
            size = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = await field.read_chunk()
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > _BG_MAX:
                        f.close()
                        try:
                            os.remove(dest)
                        except Exception:
                            pass
                        return web.json_response({"success": False, "error": "图片不能超过 8MB"}, status=400)
                    f.write(chunk)
            return web.json_response({
                "success": True,
                "id": fname,
                "url": "/danbooru_anima/popup_bg/" + fname,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/popup_bgs/delete")
    async def delete_popup_bg(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        name = (body.get("name") or "").strip()
        fp = _popup_bg_path(name)
        if not fp or not os.path.isfile(fp):
            return web.json_response({"success": False, "error": "文件不存在"}, status=404)
        try:
            os.remove(fp)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)
        return web.json_response({"success": True})
