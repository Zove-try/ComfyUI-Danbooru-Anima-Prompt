"""
本地标签数据库 - 离线查 Danbooru / Gelbooru 标签分类

从 CSV 文件加载标签分类映射，减少 API 请求。
支持多数据源: "danbooru" (tags_enhanced.csv) 和 "gelbooru" (gelbooru_tags.csv)

CSV 格式: name, cn_name, wiki, post_count, category, nsfw
category: 0=general, 1=artist, 3=series, 4=character, 5=meta

Danbooru 来源: https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline
Gelbooru 来源: https://huggingface.co/datasets/DraconicDragon/Gelbooru-Tags-Full_2026-06-11
"""
import os
import csv
import threading

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 数据源配置
DB_SOURCES = {
    "danbooru": {
        "path": os.path.join(PLUGIN_DIR, "tags_enhanced.csv"),
        "download_url": (
            "https://raw.githubusercontent.com/"
            "SuzumiyaAkizuki/DanbooruSearchOnline/main/"
            "origin_database/tags_enhanced.csv"
        ),
        "label": "Danbooru",
    },
    "gelbooru": {
        "path": os.path.join(PLUGIN_DIR, "gelbooru_tags.csv"),
        "download_url": "",  # 手动下载
        "label": "Gelbooru",
    },
}

# 向后兼容: 默认数据源路径
DEFAULT_DB_PATH = DB_SOURCES["danbooru"]["path"]
CSV_DOWNLOAD_URL = DB_SOURCES["danbooru"]["download_url"]

# ── 多源缓存 ───────────────────────────────────────
_dbs = {}             # dict[str, dict[str, int]] — source → (tag_name → category_id)
_db_cns = {}          # dict[str, dict[str, str]] — source → (tag_name → cn_name)
_db_lock = threading.Lock()


def _parse_category(val: str) -> int:
    """将 CSV 中的 category 字段转为 int"""
    try:
        return int(val.strip())
    except (ValueError, AttributeError):
        return 0


def _load_csv(path: str) -> tuple[dict[str, int], dict[str, str]] | None:
    """加载单个 CSV 文件，返回 ({tag_name: category_id}, {tag_name: cn_name})。"""
    if not os.path.exists(path):
        return None

    # 自动检测编码
    _encoding = None
    for enc in ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin-1", "cp1252"]:
        try:
            with open(path, "r", encoding=enc) as f:
                f.read(1024)
            _encoding = enc
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if _encoding is None:
        print(f"[tag_db] 无法解码标签数据库: {path}")
        return None

    try:
        db = {}
        cn_map = {}
        row_count = 0
        with open(path, "r", encoding=_encoding) as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("name", "").strip().lower()
                if not name:
                    continue
                category = _parse_category(row.get("category", "0"))
                db[name] = category
                cn = (row.get("cn_name") or row.get("cn") or "").strip()
                if cn:
                    cn_map[name] = cn
                row_count += 1
        print(f"[tag_db] 加载完成 ({os.path.basename(path)}): {row_count} 条")
        return db, cn_map
    except Exception as e:
        print(f"[tag_db] 加载失败 ({os.path.basename(path)}): {e}")
        return None


# ── 公共 API ──────────────────────────────────────

def load_db(source: str = "danbooru") -> dict[str, int] | None:
    """
    加载指定数据源的标签数据库。

    Args:
        source: 数据源名称 ("danbooru" 或 "gelbooru")

    Returns:
        {tag_name: category_id} 字典，或 None
    """
    if source not in DB_SOURCES:
        print(f"[tag_db] 未知数据源: {source}")
        return None

    with _db_lock:
        if source in _dbs:
            return _dbs[source]

        path = DB_SOURCES[source]["path"]
        parsed = _load_csv(path)
        if parsed is not None:
            db, cn_map = parsed
            _dbs[source] = db
            _db_cns[source] = cn_map or {}
            return db
        return None


def lookup(tag_name: str, source: str = "danbooru") -> int | None:
    """
    查询单个标签的 category_id。

    Args:
        tag_name: 标签名
        source: 数据源 ("danbooru" 或 "gelbooru")

    Returns:
        category_id (0~5) 或 None
    """
    db = _dbs.get(source) if source in _dbs else load_db(source)
    if db is None:
        return None
    name = tag_name.strip().lower()
    return db.get(name)


def batch_lookup(tag_names: list[str], source: str = "danbooru") -> dict[str, int]:
    """
    批量查询标签分类，只返回命中结果。

    Args:
        tag_names: 标签名列表
        source: 数据源 ("danbooru" 或 "gelbooru")

    Returns:
        {tag_name: category_id, ...}
    """
    db = _dbs.get(source) if source in _dbs else load_db(source)
    if db is None:
        return {}

    result = {}
    for tag in tag_names:
        name = tag.strip().lower()
        cat = db.get(name)
        if cat is None and " " in name:
            cat = db.get(name.replace(" ", "_"))
        if cat is not None:
            result[tag] = cat
    return result


def cn_dict(source: str = "danbooru") -> dict[str, str]:
    """已加载的 tag → 中文名。没有库时返回空字典。"""
    load_db(source)
    return _db_cns.get(source) or {}


def batch_cn(tag_names: list[str]) -> dict[str, str]:
    """查中文名。先 Danbooru，再 Gelbooru。键保留调用方传入的原样。"""
    if not tag_names:
        return {}
    load_db("danbooru")
    load_db("gelbooru")
    maps = [_db_cns.get("danbooru") or {}, _db_cns.get("gelbooru") or {}]
    out = {}
    for tag in tag_names:
        raw = str(tag or "").strip()
        if not raw or raw in out:
            continue
        keys = [raw.lower(), raw.lower().replace(" ", "_"), raw.lower().replace("_", " ")]
        seen = set()
        found = ""
        for k in keys:
            if not k or k in seen:
                continue
            seen.add(k)
            for cmap in maps:
                cn = cmap.get(k)
                if cn:
                    found = cn
                    break
            if found:
                break
        if found:
            out[tag] = found
            out[raw.lower()] = found
            out[raw.lower().replace(" ", "_")] = found
    return out


def db_status(source: str | None = None) -> dict:
    """返回数据库状态"""
    if source:
        db = _dbs.get(source)
        cfg = DB_SOURCES.get(source, {})
        return {
            "source": source,
            "loaded": db is not None,
            "count": len(db) if db else 0,
            "path": cfg.get("path", ""),
        }
    # 返回所有数据源状态
    result = {}
    for src, cfg in DB_SOURCES.items():
        db = _dbs.get(src)
        result[src] = {
            "loaded": db is not None,
            "count": len(db) if db else 0,
            "path": cfg["path"],
        }
    return result


def download_db(source: str = "danbooru", path: str = None, progress_callback=None) -> bool:
    """下载标签数据库（仅 Danbooru 支持自动下载）"""
    import requests

    cfg = DB_SOURCES.get(source)
    if not cfg:
        print(f"[tag_db] 未知数据源: {source}")
        return False

    url = cfg.get("download_url", "")
    if not url:
        print(f"[tag_db] 数据源 '{source}' 不支持自动下载，请手动放置 CSV")
        return False

    if path is None:
        path = cfg["path"]

    try:
        print(f"[tag_db] 正在下载 {cfg['label']} 标签数据库...")
        resp = requests.get(url, stream=True, timeout=60)
        resp.raise_for_status()

        total = int(resp.headers.get("content-length", 0))
        downloaded = 0

        with open(path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback:
                    progress_callback(downloaded, total)

        print(f"[tag_db] 下载完成: {path} ({downloaded} bytes)")
        # 清除缓存，下次访问时重新加载
        with _db_lock:
            _dbs.pop(source, None)
            _db_cns.pop(source, None)
        return True

    except Exception as e:
        print(f"[tag_db] 下载失败: {e}")
        return False
