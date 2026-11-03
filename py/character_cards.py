"""
角色卡保存系统 — 独立于提示词收藏夹
存储: character_cards.json + prompt_thumbs/ 目录
"""
import json, os, uuid, time, base64, re
from urllib.parse import quote
from server import PromptServer
from aiohttp import web


def _my_dir():
    return os.path.dirname(os.path.abspath(__file__))

def _cards_file():
    return os.path.join(_my_dir(), "..", "character_cards.json")

def _thumbs_dir():
    d = os.path.join(_my_dir(), "..", "prompt_thumbs")
    os.makedirs(d, exist_ok=True)
    return d

def _load_cards():
    fp = os.path.abspath(_cards_file())
    if os.path.isfile(fp):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []

def _save_cards(data):
    fp = os.path.abspath(_cards_file())
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _norm_card_name(name):
    return (name or "").replace(" ", "_").replace("-", "_").lower().strip()


def _adex_thumb_src(thumb):
    thumb = (thumb or "").strip()
    if not thumb:
        return ""
    if thumb.startswith("/"):
        return thumb
    if thumb.startswith("http://") or thumb.startswith("https://"):
        return "/danbooru_anima/animadex_image?url=" + quote(thumb, safe="")
    return thumb


def _adex_fav_as_cards(existing_cards):
    extra = []
    try:
        from favorites import load_favorites
        favs = load_favorites()
        coll = favs.get("animadex_characters") or {}
        if not isinstance(coll, dict):
            return extra
        seen = {_norm_card_name(c.get("name")) for c in (existing_cards or []) if isinstance(c, dict)}
        keys = [k for k in coll.keys() if not str(k).startswith("_")]
        order = coll.get("_order")
        if isinstance(order, list) and order:
            ordered, used = [], set()
            for k in order:
                if k in coll and k not in used and not str(k).startswith("_"):
                    ordered.append(k)
                    used.add(k)
            for k in keys:
                if k not in used:
                    ordered.append(k)
            keys = ordered
        for tag in keys:
            info = coll.get(tag)
            if not isinstance(info, dict):
                continue
            if _norm_card_name(tag) in seen:
                continue
            tags = info.get("tags") or []
            if isinstance(tags, list):
                tags_str = ", ".join(str(t).strip() for t in tags if str(t).strip())
            else:
                tags_str = str(tags).strip()
            extra.append({
                "id": "adex:" + str(tag),
                "name": str(tag),
                "series": str(info.get("copyright_name") or "").strip(),
                "tags": tags_str,
                "thumb": _adex_thumb_src(info.get("thumb") or ""),
                "source": "animadex",
                "cn": str(info.get("cn") or "").strip(),
            })
            seen.add(_norm_card_name(tag))
    except Exception:
        pass
    return extra


def register_char_card_routes():
    @PromptServer.instance.routes.get("/anima_random/character_cards")
    async def list_cards(request):
        cards = _load_cards()
        adex = _adex_fav_as_cards(cards)
        return web.json_response({"success": True, "cards": adex + cards})

    @PromptServer.instance.routes.post("/anima_random/character_cards/save")
    async def save_card(request):
        try:
            data = await request.json()
            name = (data.get("name") or "").strip()
            tags_str = (data.get("tags") or "").strip()
            series = (data.get("series") or "").strip()
            thumb_data = data.get("thumb_data", "")  # base64 or URL
            card_id = data.get("id", "").strip()

            if not name or not tags_str:
                return web.json_response({"success": False, "error": "name and tags required"}, status=400)

            cards = _load_cards()
            now = time.time()

            # 处理缩略图
            thumb_path = ""
            if thumb_data:
                if thumb_data.startswith("data:"):
                    # base64 图片
                    try:
                        header, b64 = thumb_data.split(",", 1)
                        img_bytes = base64.b64decode(b64)
                        ext = ".png"
                        if "jpeg" in header or "jpg" in header:
                            ext = ".jpg"
                        fname = f"char_card_{uuid.uuid4().hex[:8]}{ext}"
                        fpath = os.path.join(_thumbs_dir(), fname)
                        with open(fpath, "wb") as f:
                            f.write(img_bytes)
                        thumb_path = f"/danbooru_anima/prompt_thumb/{fname}"
                    except Exception:
                        thumb_path = thumb_data  # keep as-is if decode fails
                elif thumb_data.startswith("http"):
                    thumb_path = thumb_data
                else:
                    thumb_path = thumb_data

            if card_id:
                # 更新已有卡片
                for c in cards:
                    if c.get("id") == card_id:
                        c["name"] = name
                        c["tags"] = tags_str
                        c["series"] = series
                        if thumb_path:
                            c["thumb"] = thumb_path
                        c["updated_at"] = now
                        _save_cards(cards)
                        return web.json_response({"success": True, "card": c})
                # 没找到对应 ID，当作新建
                card_id = ""

            if not card_id:
                new_card = {
                    "id": uuid.uuid4().hex[:12],
                    "name": name,
                    "series": series,
                    "tags": tags_str,
                    "thumb": thumb_path,
                    "created_at": now,
                    "updated_at": now,
                }
                cards.append(new_card)
                _save_cards(cards)
                return web.json_response({"success": True, "card": new_card})

        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/anima_random/character_cards/delete")
    async def delete_card(request):
        try:
            data = await request.json()
            card_id = (data.get("id") or "").strip()
            if not card_id:
                return web.json_response({"success": False, "error": "id required"}, status=400)
            cards = _load_cards()
            cards = [c for c in cards if c.get("id") != card_id]
            _save_cards(cards)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    print("[AnimaRandom] 角色卡 API 路由已注册")
