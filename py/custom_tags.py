"""
自定义收藏 Tag 管理 - 在预制 Tag 弹窗中管理用户收藏的标签
"""
import json, os, time
from aiohttp import web

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(PLUGIN_DIR, "custom_tags.json")

def _load():
    if os.path.isfile(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"categories": []}  # [{name: "xxx", tags: ["tag1", "tag2"]}]

def _save(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def register_routes():
    from server import PromptServer

    @PromptServer.instance.routes.get("/danbooru_anima/custom_tags")
    async def get_all(request):
        return web.json_response({"success": True, "data": _load()})

    @PromptServer.instance.routes.post("/danbooru_anima/custom_tags/save")
    async def save_tag(request):
        try:
            body = await request.json()
            data = _load()
            tag = body.get("tag", "").strip()
            category = body.get("category", "").strip()
            if not tag or not category:
                return web.json_response({"success": False, "error": "tag and category required"}, status=400)
            cats = data.setdefault("categories", [])
            existing = next((c for c in cats if c["name"] == category), None)
            if existing:
                if tag not in existing["tags"]:
                    existing["tags"].append(tag)
            else:
                cats.append({"name": category, "tags": [tag]})
            _save(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/custom_tags/delete_tag")
    async def delete_tag(request):
        try:
            body = await request.json()
            tag = body.get("tag", "").strip()
            category = body.get("category", "").strip()
            data = _load()
            cats = data.setdefault("categories", [])
            for c in cats:
                if c["name"] == category and tag in c["tags"]:
                    c["tags"].remove(tag)
                    break
            _save(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    
    @PromptServer.instance.routes.post("/danbooru_anima/custom_tags/cleanup_orphans")
    async def cleanup_orphans(request):
        try:
            data = _load()
            cats = data.get("categories", [])
            preserved = [c for c in cats if " / " in c["name"]]
            data["categories"] = preserved
            _save(data)
            return web.json_response({"success": True, "deleted": len(cats) - len(preserved)})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/custom_tags/delete_category")
    async def delete_category(request):
        try:
            body = await request.json()
            category = body.get("category", "").strip()
            data = _load()
            data["categories"] = [c for c in data["categories"] if c["name"] != category]
            _save(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)
