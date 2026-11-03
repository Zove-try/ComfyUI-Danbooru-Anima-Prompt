"""
标签预览 + 文本节点 + 预制 tag API
"""
import sqlite3, os, json

class DanbooruText:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"default": "", "multiline": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "get_text"
    CATEGORY = "Danbooru Anima"
    def get_text(self, text):
        return (text,)

class DanbooruTextConcat:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"separator": (["逗号+空格", "中文逗号+空格", "仅逗号", "空格", "换行", "逗号+换行", "分号+空格", "竖线+空格", "无分隔符"], {"default": "逗号+空格"})}, "optional": {"text1": ("STRING", {"forceInput": True}), "text2": ("STRING", {"forceInput": True}), "text3": ("STRING", {"forceInput": True}), "text4": ("STRING", {"forceInput": True}), "text5": ("STRING", {"forceInput": True}), "text6": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "concat"
    CATEGORY = "Danbooru Anima"
    def concat(self, separator="逗号+空格", **kwargs):
        m = {"逗号+空格":", ", "中文逗号+空格":"， ", "仅逗号":",", "空格":" ", "换行":"\n", "逗号+换行":",\n", "分号+空格":"; ", "竖线+空格":" | ", "无分隔符":""}
        s = m.get(separator, ", ")
        p = []
        for i in range(1,7):
            v = kwargs.get(f"text{i}", "")
            if isinstance(v, str) and v.strip(): p.append(v)
        return (s.join(p),)

class DanbooruTextAdvanced:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"default": "", "multiline": True})}, "hidden": {"_db_hidden_tags": ("STRING", {"default": "{}"}), "_db_full_tags": ("STRING", {"default": "", "multiline": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "get_text"
    CATEGORY = "Danbooru Anima"
    def get_text(self, text, **kwargs):
        return (text,)

# ── 透传节点暂停状态 ──
import time
_status_by_id = {}
_edited_by_id = {}
_passthrough_gen = {}  # {unique_id: current_generation_number}

class DanbooruTextPassthrough:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"prompt_text": ("STRING", {"multiline": True, "default": ""})}, "optional": {"use_input_text": ("BOOLEAN", {"default": True, "label_on": "Use Input", "label_off": "Use Prompt"}), "text": ("STRING", {"default": "", "multiline": True, "forceInput": True, "lazy": True})}, "hidden": {"unique_id": "UNIQUE_ID", "extra_pnginfo": "EXTRA_PNGINFO", "prompt": "PROMPT", "_version": ("INT", {"default": 0, "min": 0, "max": 999999999}), "_db_hidden_tags": ("STRING", {"default": "{}"}), "_db_full_tags": ("STRING", {"default": "", "multiline": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "passthrough"
    CATEGORY = "Danbooru Anima"
    def check_lazy_status(self, use_input_text=True, text="", prompt_text="", unique_id=None, extra_pnginfo=None, prompt=None, **kwargs):
        return ["text"] if use_input_text else []

    @classmethod
    def IS_CHANGED(cls, use_input_text=True, text="", prompt_text="", unique_id=None, **kwargs):
        import hashlib
        m = hashlib.sha256()
        m.update(str(use_input_text).encode())
        m.update(str(prompt_text).encode())
        m.update(str(text).encode())
        _ver = kwargs.get("_version", 0) or 0
        return m.hexdigest() + "__v" + str(_ver)

    def passthrough(self, text="", prompt_text="", use_input_text=True, unique_id=None, **kwargs):
        text = text or ""
        prompt_text = prompt_text or ""
        output = (text if use_input_text else prompt_text) or ""
        # 清理合并分号，还原逗号
        output = output.replace("; ", ", ")
        # content 模式下 prompt_text 可能为空，回退到 text
        if not use_input_text and not prompt_text and text:
            output = text
        print(f"[Anima] passthrough uid={unique_id} use_input={use_input_text} text_len={len(text)} pt_len={len(prompt_text)} out_len={len(output)} out_head={repr(output[:60])}")
        if use_input_text and text:
            prompt_text = text
        # 写回 widgets_values 到 extra_pnginfo（确保图片元数据保存提示词）
        if output and unique_id is not None:
            try:
                extra_pnginfo = kwargs.get("extra_pnginfo")
                if isinstance(extra_pnginfo, list) and extra_pnginfo:
                    workflow = extra_pnginfo[0].get("workflow")
                elif isinstance(extra_pnginfo, dict):
                    workflow = extra_pnginfo.get("workflow")
                else:
                    workflow = None
                if workflow and "nodes" in workflow:
                    uid = str(unique_id)
                    for node in workflow["nodes"]:
                        if str(node.get("id")) == uid:
                            wv = node.get("widgets_values", [])
                            while len(wv) < 3:
                                wv.append("")
                            wv[0] = False
                            wv[2] = output
                            node["widgets_values"] = wv
                            break
            except Exception:
                pass
        if unique_id:
            _passthrough_gen[unique_id] = _passthrough_gen.get(unique_id, 0) + 1
            my_gen = _passthrough_gen[unique_id]
            _status_by_id[(unique_id, my_gen)] = "paused"
            PromptServer.instance.send_sync("db-pt-show-continue", {"node_id": unique_id, "text": output, "gen": my_gen})
            while _status_by_id.get((unique_id, my_gen)) == "paused":
                time.sleep(0.1)
            if (unique_id, my_gen) in _edited_by_id:
                output = _edited_by_id[(unique_id, my_gen)]
                del _edited_by_id[(unique_id, my_gen)]
            if (unique_id, my_gen) in _status_by_id:
                del _status_by_id[(unique_id, my_gen)]
        return (output,)


class DanbooruTagDedup:
    """Tag 去重：输入逗号分隔的 tag 列表，移除重复项，保留顺序"""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"tags": ("STRING", {"multiline": True, "default": "", "forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("tags",)
    FUNCTION = "dedup"
    CATEGORY = "Danbooru Anima"
    def dedup(self, tags=""):
        if not tags or not tags.strip():
            return ("",)
        seen = set()
        result = []
        for t in tags.split(","):
            t = t.strip()
            if t and t not in seen:
                seen.add(t)
                result.append(t)
        return (", ".join(result),)


class DanbooruTagPreview:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"tags": ("STRING", {"default": "", "multiline": False, "forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("tags",)
    OUTPUT_NODE = True
    FUNCTION = "preview"
    CATEGORY = "Danbooru Anima"
    def preview(self, tags=""):
        return {"ui": {"tags": [tags or ""]}, "result": (tags or "",)}

NODE_CLASS_MAPPINGS = {"DanbooruText": DanbooruText, "DanbooruTextConcat": DanbooruTextConcat, "DanbooruTextAdvanced": DanbooruTextAdvanced, "DanbooruTagPreview": DanbooruTagPreview, "DanbooruTextPassthrough": DanbooruTextPassthrough, "DanbooruTagDedup": DanbooruTagDedup}
NODE_DISPLAY_NAME_MAPPINGS = {"DanbooruText": "文本", "DanbooruTextConcat": "文本联结", "DanbooruTextAdvanced": "文本（模糊搜索）", "DanbooruTagPreview": "标签预览", "DanbooruTextPassthrough": "文本（透传）", "DanbooruTagDedup": "tag去重"}


# ── 预制 tag API（基于本地 weilin_tags.db） ──
from server import PromptServer
from aiohttp import web
import sqlite3

_WDB = os.path.join(os.path.dirname(__file__), "weilin_tags.db")

def _wd():
    return sqlite3.connect(_WDB) if os.path.exists(_WDB) else None

def register_weilin_routes():
    @PromptServer.instance.routes.get("/danbooru_anima/tag_mapper_cats")
    async def tag_mapper_cats(request):
        """返回标签映射器的分类配色，供文本节点同步"""
        return web.json_response([
            {"v": "", "l": "— 不分类 —", "c": "#888"},
            {"v": "body_features", "l": "身体特征", "c": "#e94560"},
            {"v": "clothing", "l": "服装", "c": "#6bcb77"},
            {"v": "pose", "l": "姿势", "c": "#ffd93d"},
            {"v": "expression", "l": "表情", "c": "#ff6ec7"},
            {"v": "background", "l": "背景", "c": "#4d96ff"},
            {"v": "accessories", "l": "配饰", "c": "#ce93d8"},
            {"v": "other", "l": "其他", "c": "#888"},
        ])

    @PromptServer.instance.routes.get("/danbooru_anima/weilin_groups")
    async def weilin_groups(request):
        db = _wd()
        if not db: return web.json_response([])
        cur = db.cursor()
        cur.execute("SELECT id_index, name, color, p_uuid FROM tag_groups ORDER BY id_index")
        groups = [{"id": r[0], "name": r[1], "color": r[2], "uuid": r[3]} for r in cur.fetchall()]
        for g in groups:
            cur.execute("SELECT COUNT(*) FROM tag_subgroups WHERE group_id=?", (g["id"],))
            g["sub_count"] = cur.fetchone()[0]
        db.close()
        return web.json_response(groups)

    @PromptServer.instance.routes.get("/danbooru_anima/tag_colors")
    async def tag_colors(request):
        fp = os.path.join(os.path.dirname(__file__), "tag_groups.json")
        if not os.path.exists(fp):
            return web.json_response({})
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        g2t = data.get("group_to_tags", {})
        GROUP_COLORS = {
            "hair": "#795548", "hair_color": "#795548", "hair_styles": "#795548",
            "eyes_tags": "#009688",
            "attire": "#4caf50", "legwear": "#4caf50", "handwear": "#4caf50", "headwear": "#4caf50",
            "posture": "#ffc107", "gestures": "#ffc107",
            "face_tags": "#ff5722",
            "backgrounds": "#607d8b",
            "accessories": "#e040fb",
            "body_parts": "#f44336", "skin_color": "#f44336",
            "lighting": "#3f51b5", "colors": "#3f51b5", "patterns": "#3f51b5",
            "visual_aesthetic": "#3f51b5", "image_composition": "#3f51b5", "focus_tags": "#3f51b5",
        }
        result = {}
        for group, tags in g2t.items():
            color = GROUP_COLORS.get(group, "#888")
            for t in tags:
                if t != "tag_groups":
                    # 存 tag 的原始形式（下划线）和空格形式
                    result[t] = {"g": group, "c": color}
                    result[t.replace("_", " ")] = {"g": group, "c": color}
        return web.json_response(result)

    @PromptServer.instance.routes.get("/danbooru_anima/weilin_subgroups")
    async def weilin_subgroups(request):
        gid = request.query.get("group_id", "")
        db = _wd()
        if not db: return web.json_response([])
        cur = db.cursor()
        cur.execute("SELECT id_index, name, color, group_id, p_uuid, g_uuid FROM tag_subgroups WHERE group_id=? ORDER BY id_index", (gid,))
        subs = [{"id": r[0], "name": r[1], "color": r[2], "group_id": r[3], "p_uuid": r[4], "uuid": r[5]} for r in cur.fetchall()]
        for s in subs:
            cur.execute("SELECT COUNT(*) FROM tag_tags WHERE subgroup_id=?", (s["id"],))
            s["tag_count"] = cur.fetchone()[0]
        db.close()
        return web.json_response(subs)

    @PromptServer.instance.routes.get("/danbooru_anima/weilin_tags")
    async def weilin_tags(request):
        sid = request.query.get("subgroup_id", "")
        db = _wd()
        if not db: return web.json_response([])
        cur = db.cursor()
        cur.execute("SELECT id_index, text, desc, subgroup_id, t_uuid FROM tag_tags WHERE subgroup_id=? ORDER BY id_index", (sid,))
        tags = [{"id": r[0], "text": r[1], "desc": r[2], "subgroup_id": r[3], "uuid": r[4]} for r in cur.fetchall()]
        db.close()
        return web.json_response(tags)

    @PromptServer.instance.routes.post("/danbooru_anima/pt_continue/{node_id}")
    async def pt_continue(request):
        node_id = request.match_info["node_id"].strip()
        data = await request.json()
        edited_text = data.get("text", "")
        gen = data.get("gen", 0)
        key = (node_id, gen)
        if key in _status_by_id:
            _edited_by_id[key] = edited_text
            _status_by_id[key] = "continue"
        return web.json_response({"status": "ok"})

    # ── 预制 Tag 弹窗用户数据持久化 API（文件系统，不清缓存不丢）──
    import threading
    _preset_data_file = os.path.join(os.path.dirname(__file__), "preset_user_data.json")
    _preset_lock = threading.Lock()

    def _load_preset_data():
        try:
            if os.path.exists(_preset_data_file):
                with open(_preset_data_file, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception:
            pass
        return {"deleted": {}, "custom_tags": {}, "tag_categories": {}}

    def _save_preset_data(data):
        try:
            with _preset_lock:
                with open(_preset_data_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[Anima] 保存 preset_user_data 失败: {e}")

    @PromptServer.instance.routes.get("/danbooru_anima/preset_data")
    async def get_preset_data(request):
        return web.json_response(_load_preset_data())

    @PromptServer.instance.routes.post("/danbooru_anima/preset_data")
    async def save_preset_data(request):
        try:
            data = await request.json()
            _save_preset_data(data)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)})
