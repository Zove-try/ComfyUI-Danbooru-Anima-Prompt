"""
节点：标签映射器 (Tag Mapper)
输入未分类标签 → UI 中每个 tag 带下拉菜单选择分类
选择后点击保存，映射写入 user_tag_mappings.json
"""
import json
import os
from server import PromptServer
from aiohttp import web

_USER_MAP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_tag_mappings.json")
_RULE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_tag_patterns.json")
_CATEGORIES = ["body_features", "clothing", "pose", "expression", "background", "accessories", "other"]

# 模块级：存储当前标签列表供 JS 读取
_current_tags = []


def _load_map():
    if os.path.isfile(_USER_MAP_FILE):
        try:
            with open(_USER_MAP_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_map(data):
    with open(_USER_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _load_rules():
    if os.path.isfile(_RULE_FILE):
        try:
            with open(_RULE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_rules(data):
    with open(_RULE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def register_routes():
    @PromptServer.instance.routes.get("/danbooru_anima/tag_mapper_tags")
    async def get_tags(request):
        global _current_tags
        return web.json_response({"tags": _current_tags})

    @PromptServer.instance.routes.get("/danbooru_anima/tag_mapper_mappings")
    async def get_mappings(request):
        """返回所有单独标签映射 {tag: category}"""
        return web.json_response({"success": True, "mappings": _load_map()})

    @PromptServer.instance.routes.post("/danbooru_anima/tag_mapper_save")
    async def save_mappings(request):
        """保存映射：POST {"mappings": {"tag1":"body_features", "tag2":"clothing"}}"""
        try:
            data = await request.json()
            mappings = data.get("mappings", {})
            if not mappings:
                return web.json_response({"success": True, "count": 0})
            old = _load_map()
            for tag, cat in mappings.items():
                if cat in _CATEGORIES:
                    old[tag] = cat
            _save_map(old)
            return web.json_response({"success": True, "count": len(mappings)})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/danbooru_anima/tag_mapper_rules")
    async def get_rules(request):
        return web.json_response({"success": True, "rules": _load_rules()})

    @PromptServer.instance.routes.post("/danbooru_anima/tag_mapper_rule_save")
    async def save_rule(request):
        """保存一条规则: POST {"keyword": "earrings", "category": "accessories"}"""
        try:
            data = await request.json()
            keyword = (data.get("keyword", "") or "").strip().lower()
            category = (data.get("category", "") or "").strip().lower()
            if len(keyword) < 2:
                return web.json_response({"success": False, "error": "关键词至少 2 个字符"}, status=400)
            if category not in _CATEGORIES:
                return web.json_response({"success": False, "error": f"无效分类: {category}"}, status=400)
            rules = _load_rules()
            rules[keyword] = category
            _save_rules(rules)
            return web.json_response({"success": True, "keyword": keyword, "category": category})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/tag_mapper_rule_delete")
    async def delete_rule(request):
        """删除一条规则: POST {"keyword": "earrings"}"""
        try:
            data = await request.json()
            keyword = data.get("keyword", "")
            rules = _load_rules()
            if keyword in rules:
                del rules[keyword]
                _save_rules(rules)
            return web.json_response({"success": True})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.get("/danbooru_anima/tag_mapper_export")
    async def export_mappings(request):
        """导出全部映射和规则为 JSON 文件"""
        try:
            data = {
                "mappings": _load_map(),
                "patterns": _load_rules(),
            }
            return web.json_response({"success": True, "data": data})
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @PromptServer.instance.routes.post("/danbooru_anima/tag_mapper_import")
    async def import_mappings(request):
        """导入映射和规则: POST {"data": {"mappings": {...}, "patterns": {...}}, "mode": "merge|overwrite"}"""
        try:
            body = await request.json()
            data = body.get("data", {})
            mode = body.get("mode", "merge")
            imported_mappings = data.get("mappings", {})
            imported_patterns = data.get("patterns", {})
            if mode == "overwrite":
                _save_map(imported_mappings)
                _save_rules(imported_patterns)
            else:
                old_map = _load_map()
                old_map.update(imported_mappings)
                _save_map(old_map)
                old_rules = _load_rules()
                old_rules.update(imported_patterns)
                _save_rules(old_rules)
            return web.json_response({
                "success": True,
                "mappings_count": len(imported_mappings),
                "patterns_count": len(imported_patterns),
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)


class TagMapper:
    """
    输入未分类标签 → UI 中每个 tag 带下拉菜单选择分类
    选择后点保存按钮，映射写入文件。
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "标签列表": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("状态", "全部映射", "剩余未分类")
    OUTPUT_NODE = True
    FUNCTION = "map_tags"
    CATEGORY = "Danbooru Anima"

    @classmethod
    def IS_CHANGED(cls, 标签列表="", **kwargs):
        return float("NaN")

    def map_tags(self, 标签列表=""):
        global _current_tags
        # 解析标签列表（逗号或换行分隔）
        _current_tags = []
        for part in (标签列表 or "").replace(",", "\n").split("\n"):
            t = part.strip()
            if t:
                if "=" in t:
                    t = t.split("=", 1)[0].strip()
                if t:
                    _current_tags.append(t)

        data = _load_map()
        mapped_this_run = 0
        remaining = []

        for raw_line in (标签列表 or "").replace(",", "\n").split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            if "=" in line:
                tag, cat = line.rsplit("=", 1)
                tag = tag.strip()
                cat = cat.strip().lower()
                if tag and cat in _CATEGORIES:
                    data[tag] = cat
                    mapped_this_run += 1
                elif tag:
                    remaining.append(tag)
            else:
                remaining.append(line)

        if mapped_this_run > 0:
            _save_map(data)

        total = len(data)
        status = f"✅ 本次映射 {mapped_this_run} 个标签（共 {total} 条映射）"
        return (status, json.dumps(data, ensure_ascii=False, indent=2), ", ".join(remaining))


NODE_CLASS_MAPPINGS = {"TagMapper": TagMapper}
NODE_DISPLAY_NAME_MAPPINGS = {"TagMapper": "标签映射器 (Tag Mapper)"}
