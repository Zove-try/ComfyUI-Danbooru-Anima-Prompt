"""
ComfyUI-Danbooru-Anima-Prompt
一个 ComfyUI 插件，用于识别 Danbooru 标签并按 Anima 的 prompt 结构分类输出。
"""
import sys
import os
import traceback

# 将 py 目录加入路径
plugin_dir = os.path.dirname(os.path.abspath(__file__))
py_dir = os.path.join(plugin_dir, "py")
if py_dir not in sys.path:
    sys.path.insert(0, py_dir)

# ⚠️ WEB_DIRECTORY 必须在所有导入之前设置，否则 JS 无法加载
WEB_DIRECTORY = "./js"

# ── 导入节点映射 ───────────────────────────────────

from .py.tag_classifier import NODE_CLASS_MAPPINGS as tc_mappings
from .py.tag_classifier import NODE_DISPLAY_NAME_MAPPINGS as tc_display
from .py.anima_prompt_builder import NODE_CLASS_MAPPINGS as apb_mappings
from .py.anima_prompt_builder import NODE_DISPLAY_NAME_MAPPINGS as apb_display
from .py.danbooru_browser import NODE_CLASS_MAPPINGS as db_mappings
from .py.danbooru_browser import NODE_DISPLAY_NAME_MAPPINGS as db_display
from .py.animadex_browser import NODE_CLASS_MAPPINGS as ad_mappings
from .py.animadex_browser import NODE_DISPLAY_NAME_MAPPINGS as ad_display
from .py.tag_mapper import NODE_CLASS_MAPPINGS as tm_mappings
from .py.tag_mapper import NODE_DISPLAY_NAME_MAPPINGS as tm_display
from .py.danbooru_text import NODE_CLASS_MAPPINGS as dt_mappings
from .py.danbooru_text import NODE_DISPLAY_NAME_MAPPINGS as dt_display
from .py.anima_random_node import NODE_CLASS_MAPPINGS as arn_mappings
from .py.anima_random_node import NODE_DISPLAY_NAME_MAPPINGS as arn_display
# ── 提示词创作器 ──
from .py.anima_prompt_composer import NODE_CLASS_MAPPINGS as apc_mappings
from .py.anima_prompt_composer import NODE_DISPLAY_NAME_MAPPINGS as apc_display
# ── NewBie 提示词创作器 ──
from .py.newbie_prompt_composer import NODE_CLASS_MAPPINGS as nbp_mappings
from .py.newbie_prompt_composer import NODE_DISPLAY_NAME_MAPPINGS as nbp_display
from .py.anima_image_scale import NODE_CLASS_MAPPINGS as ais_mappings
from .py.anima_image_scale import NODE_DISPLAY_NAME_MAPPINGS as ais_display
from .py.anima_resolution import NODE_CLASS_MAPPINGS as ars_mappings
from .py.anima_resolution import NODE_DISPLAY_NAME_MAPPINGS as ars_display
from .py.anima_group_ignore import NODE_CLASS_MAPPINGS as agi_mappings
from .py.anima_group_ignore import NODE_DISPLAY_NAME_MAPPINGS as agi_display
from .py.anima_group_mute import NODE_CLASS_MAPPINGS as agm_mappings
from .py.anima_group_mute import NODE_DISPLAY_NAME_MAPPINGS as agm_display
from .py.artist_picker import NODE_CLASS_MAPPINGS as apick_mappings
from .py.artist_picker import NODE_DISPLAY_NAME_MAPPINGS as apick_display
# Gelbooru 是可选模块，导入失败不影响现有功能
gb_mappings = {}
gb_display = {}
try:
    from .py.gelbooru_browser import NODE_CLASS_MAPPINGS as _gb_mappings
    from .py.gelbooru_browser import NODE_DISPLAY_NAME_MAPPINGS as _gb_display
    gb_mappings = _gb_mappings
    gb_display = _gb_display
    print("[DanbooruAnima] Gelbooru 节点已加载")
except Exception as e:
    print(f"[DanbooruAnima] Gelbooru 节点加载失败 (D站功能不受影响): {e}")
    traceback.print_exc()


# ── 注册 API 路由 ──────────────────────────────────
from .py.danbooru_browser import register_routes
from .py.prompt_favorites import register_routes as pf_routes
from .py.custom_tags import register_routes as ct_routes
register_routes()
pf_routes()
ct_routes()
from .py.animadex_browser import register_routes as register_ad_routes
register_ad_routes()
from .py.tag_mapper import register_routes as register_tm_routes
register_tm_routes()
from .py.danbooru_text import register_weilin_routes
register_weilin_routes()
from .py.random_prompt import register_random_routes
register_random_routes()
from .py.character_cards import register_char_card_routes
register_char_card_routes()

# Gelbooru 路由（可选）
try:
    from .py.gelbooru_browser import register_routes as register_gb_routes
    register_gb_routes()
except Exception as e:
    print(f"[DanbooruAnima] Gelbooru 路由注册失败: {e}")

# 数据备份/恢复路由
from .py.data_backup import register_routes as register_backup_routes
register_backup_routes()

# 输出目录提示词查看器（失败不影响其它节点）
try:
    from .py.output_prompt_viewer import register_routes as register_opv_routes
    register_opv_routes()
except Exception as e:
    print(f"[DanbooruAnima] 输出提示词查看器路由注册失败 (其他功能不受影响): {e}")
    traceback.print_exc()

# 画师 AI 缩略图（阿尼玛输出图，与 D站 fav_thumbs 分开）
try:
    from .py import live_thumbs  # noqa: F401
except Exception as e:
    print(f"[DanbooruAnima] AI缩略图路由注册失败 (其他功能不受影响): {e}")
    traceback.print_exc()

# 画师组合缩略图（复制成插件自己的文件，不引用输出原图）
try:
    from .py import combo_thumbs  # noqa: F401
except Exception as e:
    print(f"[DanbooruAnima] 画师组合缩略图路由注册失败 (其他功能不受影响): {e}")
    traceback.print_exc()

print("[DanbooruAnima] API 路由已注册")

# ── 合并节点映射 ───────────────────────────────────

NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(tc_mappings)
NODE_CLASS_MAPPINGS.update(apb_mappings)
NODE_CLASS_MAPPINGS.update(db_mappings)
NODE_CLASS_MAPPINGS.update(ad_mappings)
NODE_CLASS_MAPPINGS.update(tm_mappings)
NODE_CLASS_MAPPINGS.update(dt_mappings)
NODE_CLASS_MAPPINGS.update(arn_mappings)
NODE_CLASS_MAPPINGS.update(gb_mappings)
NODE_CLASS_MAPPINGS.update(apc_mappings)
NODE_CLASS_MAPPINGS.update(nbp_mappings)
NODE_CLASS_MAPPINGS.update(ais_mappings)
NODE_CLASS_MAPPINGS.update(ars_mappings)
NODE_CLASS_MAPPINGS.update(agi_mappings)
NODE_CLASS_MAPPINGS.update(agm_mappings)
NODE_CLASS_MAPPINGS.update(apick_mappings)


NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS.update(tc_display)
NODE_DISPLAY_NAME_MAPPINGS.update(apb_display)
NODE_DISPLAY_NAME_MAPPINGS.update(db_display)
NODE_DISPLAY_NAME_MAPPINGS.update(ad_display)
NODE_DISPLAY_NAME_MAPPINGS.update(tm_display)
NODE_DISPLAY_NAME_MAPPINGS.update(dt_display)
NODE_DISPLAY_NAME_MAPPINGS.update(arn_display)
NODE_DISPLAY_NAME_MAPPINGS.update(gb_display)
NODE_DISPLAY_NAME_MAPPINGS.update(apc_display)
NODE_DISPLAY_NAME_MAPPINGS.update(nbp_display)
NODE_DISPLAY_NAME_MAPPINGS.update(ais_display)
NODE_DISPLAY_NAME_MAPPINGS.update(ars_display)
NODE_DISPLAY_NAME_MAPPINGS.update(agi_display)
NODE_DISPLAY_NAME_MAPPINGS.update(agm_display)
NODE_DISPLAY_NAME_MAPPINGS.update(apick_display)


print(f"[DanbooruAnima] 节点已加载: {len(NODE_CLASS_MAPPINGS)} 个")
for name, cls in NODE_CLASS_MAPPINGS.items():
    print(f"  ├── {name}")
