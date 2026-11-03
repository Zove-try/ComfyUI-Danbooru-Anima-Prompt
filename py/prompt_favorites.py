"""
提示词收藏夹 - 存储/管理收藏的整段提示词
"""
import json, os, time, shutil, uuid
from aiohttp import web
from folder_paths import get_user_directory

PLUGIN_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(PLUGIN_DIR, "prompt_favorites.json")
THUMB_DIR = os.path.join(PLUGIN_DIR, "prompt_thumbs")
DEFAULT_MODEL_TAGS = ["光辉", "Noob", "Anima", "Zimage"]
MODEL_TAGS_FILE = os.path.join(PLUGIN_DIR, "prompt_model_tags.json")

os.makedirs(THUMB_DIR, exist_ok=True)

def _load_data():
    if os.path.isfile(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"prompts": [], "folders": []}

def _save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _load_model_tags():
    if os.path.isfile(MODEL_TAGS_FILE):
        try:
            with open(MODEL_TAGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return DEFAULT_MODEL_TAGS[:]

def _save_model_tags(tags):
    with open(MODEL_TAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(tags, f, ensure_ascii=False, indent=2)

def register_routes():
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/danbooru_anima/prompt_favorites")
    async def get_all(request):
        data = _load_data()
        return web.json_response({"success": True, "prompts": data.get("prompts", []), "folders": data.get("folders", []), "composer_folders": data.get("composer_folders", [])})

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/save")
    async def save_prompt(request):
        try:
            body = await request.json()
            data = _load_data()
            prompts = data.setdefault("prompts", [])
            pid = body.get("id", "")
            entry = {
                "id": pid or str(uuid.uuid4()),
                "text": body.get("text", ""),
                "model_tag": body.get("model_tag", ""),
                "thumb": body.get("thumb", ""),
                "folder": body.get("folder", ""),
                "translations": body.get("translations", None),
                "merged_text": body.get("merged_text", None),
                "layout": body.get("layout", None),
                "source": body.get("source", ""),
                "title": body.get("title", ""),
                "created_at": body.get("created_at", time.time()),
                "updated_at": time.time(),
            }
            # 缩略图文件名重命名（temp_* → 真实ID）
            old_name = entry["thumb"].rsplit("/", 1)[-1] if entry["thumb"] else ""
            if old_name.startswith("temp_"):
                old_path = os.path.join(THUMB_DIR, old_name)
                ext = os.path.splitext(old_name)[1] or ".png"
                new_name = entry["id"] + ext
                new_path = os.path.join(THUMB_DIR, new_name)
                if os.path.isfile(old_path):
                    try:
                        os.rename(old_path, new_path)
                        entry["thumb"] = f"/danbooru_anima/prompt_thumb/{new_name}"
                    except:
                        pass
            existing = next((p for p in prompts if p["id"] == entry["id"]), None)
            if existing:
                # 只更新 body 中明确传了的字段
                for key in ("text", "model_tag", "thumb", "folder", "translations", "merged_text", "layout", "source", "title"):
                    if key in body:
                        existing[key] = entry[key]
                existing["updated_at"] = time.time()
            else:
                # 新建时，None 字段给默认值
                if entry["translations"] is None:
                    entry["translations"] = {}
                if entry["merged_text"] is None:
                    entry["merged_text"] = ""
                prompts.append(entry)
            _save_data(data)
            return web.json_response({"success": True, "prompt": entry})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/delete")
    async def delete_prompt(request):
        try:
            body = await request.json()
            pid = body.get("id", "")
            data = _load_data()
            prompts = data.setdefault("prompts", [])
            prompts[:] = [p for p in prompts if p["id"] != pid]
            _save_data(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/upload_thumb")
    async def upload_thumb(request):
        try:
            reader = await request.multipart()
            field = await reader.next()
            if not field:
                return web.json_response({"success": False, "error": "no file"}, status=400)
            filename = field.filename or ""
            # 从文件名提取 prompt id（格式: {id}_originalname.ext）
            pid = filename.split("_")[0] if "_" in filename else ""
            ext = os.path.splitext(filename)[1] if filename else ".png"
            # 临时文件（无有效ID）用 temp_ 前缀，方便后续重命名检测
            thumb_name = f"temp_{pid}_{int(time.time())}{ext}" if (not pid or pid == "temp") else f"{pid}{ext}"
            thumb_path = os.path.join(THUMB_DIR, thumb_name)
            with open(thumb_path, "wb") as f:
                while True:
                    chunk = await field.read_chunk()
                    if not chunk:
                        break
                    f.write(chunk)
            return web.json_response({"success": True, "thumb": f"/danbooru_anima/prompt_thumb/{thumb_name}"})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/danbooru_anima/prompt_thumb/{name}")
    async def get_thumb(request):
        name = request.match_info["name"]
        fp = os.path.join(THUMB_DIR, name)
        if os.path.isfile(fp):
            return web.FileResponse(fp)
        return web.Response(status=404)

    @PromptServer.instance.routes.get("/danbooru_anima/prompt_model_tags")
    async def get_model_tags(request):
        return web.json_response({"success": True, "tags": _load_model_tags()})

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_model_tags/save")
    async def save_model_tags(request):
        try:
            body = await request.json()
            tags = body.get("tags", [])
            _save_model_tags(tags)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/folder")
    async def manage_folder(request):
        try:
            body = await request.json()
            action = body.get("action", "")
            name = body.get("name", "")
            new_name = body.get("new_name", "")
            ftype = body.get("type", "regular")  # "regular" 或 "composer"
            data = _load_data()
            if ftype == "composer":
                folders = data.setdefault("composer_folders", [])
            else:
                folders = data.setdefault("folders", [])
            if action == "create":
                if name and name not in folders:
                    folders.append(name)
            elif action == "rename":
                if name in folders and new_name:
                    idx = folders.index(name)
                    folders[idx] = new_name
                    for p in data.get("prompts", []):
                        if p.get("folder") == name:
                            p["folder"] = new_name
            elif action == "delete":
                if name in folders:
                    folders.remove(name)
                    for p in data.get("prompts", []):
                        if p.get("folder") == name:
                            p["folder"] = ""
            _save_data(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/batch_delete")
    async def batch_delete_prompts(request):
        try:
            body = await request.json()
            ids = set(body.get("ids", []))
            if not ids: return web.json_response({"success": False, "error": "no ids"})
            data = _load_data()
            data["prompts"] = [p for p in data.get("prompts", []) if p.get("id") not in ids]
            _save_data(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/batch_move")
    async def batch_move_prompts(request):
        try:
            body = await request.json()
            ids = set(body.get("ids", []))
            folder = body.get("folder", "")
            if not ids: return web.json_response({"success": False, "error": "no ids"})
            data = _load_data()
            for p in data.get("prompts", []):
                if p.get("id") in ids: p["folder"] = folder
            _save_data(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/prompt_favorites/thumb_from_output")
    async def thumb_from_output(request):
        try:
            body = await request.json()
            filename = body.get("filename") or ""
            subfolder = body.get("subfolder") or ""
            from .output_prompt_viewer import IMG_EXT, _output_root, _safe_file
            root = _output_root()
            try:
                src, _sub, fn = _safe_file(root, subfolder, filename)
            except ValueError as ve:
                return web.json_response({"success": False, "error": str(ve)})
            if not os.path.isfile(src):
                return web.json_response({"success": False, "error": "文件不存在"})
            ext = os.path.splitext(fn)[1].lower() or ".png"
            if ext not in IMG_EXT:
                return web.json_response({"success": False, "error": "不是图片"})
            thumb_name = "temp_out_%s%s" % (int(time.time() * 1000), ext)
            dest = os.path.join(THUMB_DIR, thumb_name)
            shutil.copy2(src, dest)
            return web.json_response({"success": True, "thumb": "/danbooru_anima/prompt_thumb/" + thumb_name})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)
