"""画师选择节点。

点选常用画师或已存的画师组合，把选中的画师标签输出成一条字符串。
名单和选中状态由前端写进 artist_tags / picker_state，这里只负责把字符串送出去。
"""


class ArtistPicker:
    CATEGORY = "Danbooru Anima"
    FUNCTION = "pick"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("画师标签",)
    DESCRIPTION = "点选常用画师或画师组合，输出画师标签。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "artist_tags": ("STRING", {"default": "", "multiline": True}),
                "picker_state": ("STRING", {"default": "{}", "multiline": True}),
            }
        }

    def pick(self, artist_tags="", **kwargs):
        return (artist_tags or "",)


NODE_CLASS_MAPPINGS = {
    "ArtistPicker": ArtistPicker,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ArtistPicker": "画师选择",
}
