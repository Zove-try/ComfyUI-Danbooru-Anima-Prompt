"""
标签收藏夹管理 — favorites.json 的读写
"""
import json
import os
import threading

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAVORITES_FILE = os.path.join(PLUGIN_DIR, "favorites.json")
_load_lock = threading.Lock()
_cache = {"mtime": None, "data": None}

DEFAULT_FAVORITES = {
    "artists": {},
    "characters": {},
    "series": {},
    "general": {},
    "images": {},
}

FOLDER_CATS = ("artists", "characters", "series", "general", "images")
RESERVED_FOLDER_NAMES = frozenset(("__tmp",))


def load_favorites():
    """读取收藏数据，返回 dict。按文件 mtime 缓存，避免每次打开收藏夹都解析整份 JSON。"""
    try:
        if not os.path.exists(FAVORITES_FILE):
            return dict(DEFAULT_FAVORITES)
        mt = os.path.getmtime(FAVORITES_FILE)
        with _load_lock:
            if _cache["data"] is not None and _cache["mtime"] == mt:
                return _cache["data"]
            with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = dict(DEFAULT_FAVORITES)
            for key in DEFAULT_FAVORITES:
                if key not in data:
                    data[key] = {}
            _cache["mtime"] = mt
            _cache["data"] = data
            return data
    except Exception:
        return dict(DEFAULT_FAVORITES)


def slice_favorites(data, cats):
    """只取指定分类，避免把 images 整包丢给画师/标签收藏夹。"""
    if not data:
        return {}
    if not cats:
        return data
    want = []
    seen = set()
    for raw in cats:
        c = str(raw or "").strip()
        if not c or c in seen:
            continue
        seen.add(c)
        want.append(c)
    if not want:
        return data
    out = {}
    for cat in want:
        block = data.get(cat)
        if isinstance(block, dict):
            out[cat] = block
    for meta in ("_folders", "_folder_order", "_folder_pinned"):
        src = data.get(meta)
        if isinstance(src, dict):
            out[meta] = {k: src[k] for k in src if k in seen}
    return out


def save_favorites(data):
    """写入收藏数据"""
    try:
        with _load_lock:
            with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            _cache["data"] = data if isinstance(data, dict) else None
            try:
                _cache["mtime"] = os.path.getmtime(FAVORITES_FILE)
            except Exception:
                _cache["mtime"] = None
        return True
    except Exception:
        return False


# ── 文件夹管理 ──────────────────────────────

def _ensure_folder_meta(data):
    if not isinstance(data.get("_folder_order"), dict):
        data["_folder_order"] = {}
    if not isinstance(data.get("_folder_pinned"), dict):
        data["_folder_pinned"] = {}


def _ensure_folders(data, category):
    """确保分类下有 _folders 结构"""
    if "_folders" not in data:
        data["_folders"] = {}
    if category not in data["_folders"]:
        data["_folders"][category] = {}
    if "__tmp" not in data["_folders"][category]:
        data["_folders"][category]["__tmp"] = []
    _ensure_folder_meta(data)
    data["_folder_order"].setdefault(category, [])
    data["_folder_pinned"].setdefault(category, [])


def _is_reserved_folder_name(name):
    n = (name or "").strip()
    if not n:
        return True
    if n in RESERVED_FOLDER_NAMES:
        return True
    if n.startswith("_"):
        return True
    return False


def _dedupe_names(names, existing):
    seen = set()
    out = []
    for n in names or []:
        if not isinstance(n, str) or n not in existing or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def sync_folder_lists(data, category, ensure=True):
    """对齐用户文件夹名与置顶/排序列表。ensure=False 时不创建 __tmp。"""
    if ensure:
        _ensure_folders(data, category)
    else:
        _ensure_folder_meta(data)
        data["_folder_order"].setdefault(category, [])
        data["_folder_pinned"].setdefault(category, [])
        folders = data.get("_folders")
        if not isinstance(folders, dict) or category not in folders:
            return [], []
    existing = [n for n in data["_folders"][category].keys() if n != "__tmp"]
    existing_set = set(existing)
    pinned = _dedupe_names(data["_folder_pinned"].get(category), existing_set)
    order = _dedupe_names(data["_folder_order"].get(category), existing_set)
    pinned_set = set(pinned)
    order = [n for n in order if n not in pinned_set]
    known = set(pinned) | set(order)
    for n in existing:
        if n not in known:
            order.append(n)
    data["_folder_pinned"][category] = pinned
    data["_folder_order"][category] = order
    return pinned, order


def _rename_in_list(lst, old_name, new_name):
    if not isinstance(lst, list):
        return
    for i, n in enumerate(lst):
        if n == old_name:
            lst[i] = new_name


def merge_folder_name_maps(local_m, other_m):
    """合并文件夹名列表：本地在前，导入的新名接在后面。"""
    out = {}
    cats = set()
    if isinstance(local_m, dict):
        cats.update(local_m.keys())
    if isinstance(other_m, dict):
        cats.update(other_m.keys())
    for cat in cats:
        a = local_m.get(cat) if isinstance(local_m, dict) else None
        b = other_m.get(cat) if isinstance(other_m, dict) else None
        seen = set()
        merged = []
        for n in list(a or []) + list(b or []):
            if not isinstance(n, str) or n in seen:
                continue
            seen.add(n)
            merged.append(n)
        out[cat] = merged
    return out


def folder_create(data, category, name):
    """创建空文件夹，并放到未置顶列表最前。"""
    name = (name or "").strip()
    if _is_reserved_folder_name(name):
        return False, "不能使用该文件夹名称"
    _ensure_folders(data, category)
    if name in data["_folders"][category]:
        return False, f"文件夹「{name}」已存在"
    data["_folders"][category][name] = []
    sync_folder_lists(data, category)
    order = data["_folder_order"][category]
    if name in order:
        order.remove(name)
    order.insert(0, name)
    if name in data["_folder_pinned"][category]:
        data["_folder_pinned"][category].remove(name)
    return True, None


def folder_rename(data, category, old_name, new_name):
    """重命名文件夹"""
    old_name = (old_name or "").strip()
    new_name = (new_name or "").strip()
    _ensure_folders(data, category)
    if old_name not in data["_folders"][category]:
        return False, f"文件夹「{old_name}」不存在"
    if old_name == "__tmp":
        return False, "不能重命名临时文件夹"
    if _is_reserved_folder_name(new_name):
        return False, "不能使用该文件夹名称"
    if new_name in data["_folders"][category]:
        return False, f"文件夹「{new_name}」已存在"
    data["_folders"][category][new_name] = data["_folders"][category].pop(old_name)
    _rename_in_list(data["_folder_order"].get(category), old_name, new_name)
    _rename_in_list(data["_folder_pinned"].get(category), old_name, new_name)
    sync_folder_lists(data, category)
    return True, None


def folder_delete(data, category, name):
    """删除文件夹，内容移入 __tmp"""
    _ensure_folders(data, category)
    if name not in data["_folders"][category]:
        return False, f"文件夹「{name}」不存在"
    if name == "__tmp":
        return False, "不能删除临时文件夹"
    items = data["_folders"][category].pop(name)
    data["_folders"][category]["__tmp"].extend(items)
    sync_folder_lists(data, category)
    return True, None


def folder_pin(data, category, name):
    """置顶用户文件夹（插到置顶列表最前）。"""
    name = (name or "").strip()
    _ensure_folders(data, category)
    if name == "__tmp" or name not in data["_folders"][category]:
        return False, "无法置顶该文件夹"
    if _is_reserved_folder_name(name):
        return False, "无法置顶该文件夹"
    sync_folder_lists(data, category)
    pinned = data["_folder_pinned"][category]
    order = data["_folder_order"][category]
    if name in pinned:
        pinned.remove(name)
    if name in order:
        order.remove(name)
    pinned.insert(0, name)
    return True, None


def folder_unpin(data, category, name):
    """取消置顶，插到未置顶列表最前。"""
    name = (name or "").strip()
    _ensure_folders(data, category)
    if name == "__tmp" or name not in data["_folders"][category]:
        return False, "无法取消置顶"
    sync_folder_lists(data, category)
    pinned = data["_folder_pinned"][category]
    order = data["_folder_order"][category]
    if name in pinned:
        pinned.remove(name)
    if name in order:
        order.remove(name)
    order.insert(0, name)
    return True, None


def folder_reorder(data, category, pinned=None, order=None):
    """按客户端列表重排；None 表示该列保持不变。过滤已删名称，缺的补到未置顶末尾。"""
    _ensure_folders(data, category)
    existing = set(n for n in data["_folders"][category] if n != "__tmp")
    if pinned is None:
        pinned_out = _dedupe_names(data["_folder_pinned"].get(category), existing)
    else:
        pinned_out = _dedupe_names(pinned, existing)
    if order is None:
        order_out = _dedupe_names(data["_folder_order"].get(category), existing)
    else:
        order_out = _dedupe_names(order, existing)
    pset = set(pinned_out)
    order_out = [n for n in order_out if n not in pset]
    known = set(pinned_out) | set(order_out)
    for n in data["_folders"][category]:
        if n != "__tmp" and n not in known:
            order_out.append(n)
    data["_folder_pinned"][category] = pinned_out
    data["_folder_order"][category] = order_out
    return True, None


def folder_remove_from_all(data, category, item_keys):
    """从所有文件夹（含 __tmp）中移除 key，回到未分类状态"""
    _ensure_folders(data, category)
    for fname, items in data["_folders"][category].items():
        data["_folders"][category][fname] = [k for k in items if k not in item_keys]
    return True, None


def folder_move(data, category, item_keys, target_folder):
    """将多个 key 移入目标文件夹（从所有文件夹中移除后加入）"""
    _ensure_folders(data, category)
    if target_folder not in data["_folders"][category]:
        return False, f"目标文件夹「{target_folder}」不存在"
    # 从所有文件夹（含 __tmp）中移除这些 key
    for fname, items in data["_folders"][category].items():
        data["_folders"][category][fname] = [k for k in items if k not in item_keys]
    # 加入目标文件夹
    data["_folders"][category][target_folder].extend(item_keys)
    return True, None


def folder_items(data, category, folder_name):
    """获取文件夹内的 key 列表；folder_name 为 None 时返回未分类的"""
    _ensure_folders(data, category)
    if folder_name is None:
        # 未分类：所有在 category 字典但不在任何文件夹（含 __tmp）里的 key
        all_in_folders = set()
        for fname, items in data["_folders"][category].items():
            if fname == "__tmp":
                continue
            all_in_folders.update(items)
        return [k for k in data.get(category, {}) if k not in all_in_folders]
    return data["_folders"][category].get(folder_name, [])
