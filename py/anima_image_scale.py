"""Anima: scale an image/mask to a target aspect ratio.

Functionally matches LayerStyle / Swwan "ImageScaleByAspectRatio V2"
(letterbox / crop / fill, optional round-to-multiple, scale-to-side).
Own implementation with PIL + torch only — no LayerStyle, Swwan, or RG imports,
and a unique class_type so it cannot collide with those plugins.
"""
from __future__ import annotations

import math

import numpy as np
import torch
from PIL import Image

_ASPECT = ["原始", "自定义", "1:1", "3:2", "4:3", "16:9", "2:3", "3:4", "9:16"]
_FIT = ["信箱补边", "中心裁剪", "拉伸填充"]
_METHOD = ["Lanczos", "双三次", "Hamming", "双线性", "Box", "最近邻"]
_MULTIPLE = ["8", "16", "32", "64", "128", "256", "512", "无"]
_SCALE_SIDE = ["无", "最长边", "最短边", "宽度", "高度", "总像素(千像素)"]

_ASPECT_ALIAS = {
    "original": "original",
    "原始": "original",
    "custom": "custom",
    "自定义": "custom",
}
_FIT_ALIAS = {
    "letterbox": "letterbox",
    "信箱补边": "letterbox",
    "信箱": "letterbox",
    "crop": "crop",
    "中心裁剪": "crop",
    "裁剪": "crop",
    "fill": "fill",
    "拉伸填充": "fill",
    "拉伸": "fill",
}
_METHOD_ALIAS = {
    "lanczos": "lanczos",
    "Lanczos": "lanczos",
    "bicubic": "bicubic",
    "双三次": "bicubic",
    "hamming": "hamming",
    "Hamming": "hamming",
    "bilinear": "bilinear",
    "双线性": "bilinear",
    "box": "box",
    "Box": "box",
    "nearest": "nearest",
    "最近邻": "nearest",
}
_SIDE_ALIAS = {
    "None": "None",
    "无": "None",
    "longest": "longest",
    "最长边": "longest",
    "shortest": "shortest",
    "最短边": "shortest",
    "width": "width",
    "宽度": "width",
    "height": "height",
    "高度": "height",
    "total_pixel(kilo pixel)": "total_pixel(kilo pixel)",
    "总像素(千像素)": "total_pixel(kilo pixel)",
}


def _norm_aspect(value):
    s = str(value or "原始").strip()
    if s in _ASPECT_ALIAS:
        return _ASPECT_ALIAS[s]
    if ":" in s:
        return s
    return "original"


def _norm_fit(value):
    return _FIT_ALIAS.get(str(value or "").strip(), "letterbox")


def _norm_method(value):
    return _METHOD_ALIAS.get(str(value or "").strip(), "lanczos")


def _norm_side(value):
    return _SIDE_ALIAS.get(str(value or "").strip(), "None")


def _norm_multiple(value):
    s = str(value if value is not None else "无").strip()
    if s in ("None", "无"):
        return "None"
    return s


def _resample(method: str):
    table = {
        "lanczos": Image.LANCZOS,
        "bicubic": Image.BICUBIC,
        "hamming": getattr(Image, "HAMMING", Image.BILINEAR),
        "bilinear": Image.BILINEAR,
        "box": getattr(Image, "BOX", Image.NEAREST),
        "nearest": Image.NEAREST,
    }
    return table.get(_norm_method(method), Image.LANCZOS)


def _parse_color(value: str):
    s = (value or "#000000").strip()
    if s.startswith("#"):
        s = s[1:]
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    try:
        if len(s) >= 6:
            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        pass
    return (0, 0, 0)


def _ceil_to_multiple(n: int, multiple: int) -> int:
    if multiple <= 1:
        return max(1, n)
    n = max(1, int(n))
    rem = n % multiple
    if rem == 0:
        return n
    return ((n + multiple - 1) // multiple) * multiple


def _ratio_of(aspect_ratio: str, orig_w: int, orig_h: int, pw: int, ph: int) -> float:
    if aspect_ratio == "original":
        return float(orig_w) / float(orig_h)
    if aspect_ratio == "custom":
        return float(pw) / float(ph)
    a, b = aspect_ratio.split(":")
    return float(int(a)) / float(int(b))


def compute_target_size(
    orig_w: int,
    orig_h: int,
    aspect_ratio: str,
    proportional_width: int,
    proportional_height: int,
    scale_to_side: str,
    scale_to_length: int,
    round_to_multiple: str,
) -> tuple[int, int]:
    ratio = _ratio_of(aspect_ratio, orig_w, orig_h, proportional_width, proportional_height)
    length = int(scale_to_length)
    if ratio > 1:
        if scale_to_side == "longest":
            tw, th = length, int(length / ratio)
        elif scale_to_side == "shortest":
            th, tw = length, int(length * ratio)
        elif scale_to_side == "width":
            tw, th = length, int(length / ratio)
        elif scale_to_side == "height":
            th, tw = length, int(length * ratio)
        elif scale_to_side == "total_pixel(kilo pixel)":
            tw = math.sqrt(ratio * length * 1000)
            th = tw / ratio
            tw, th = int(tw), int(th)
        else:
            tw, th = orig_w, int(orig_w / ratio)
    else:
        if scale_to_side == "longest":
            th, tw = length, int(length * ratio)
        elif scale_to_side == "shortest":
            tw, th = length, int(length / ratio)
        elif scale_to_side == "width":
            tw, th = length, int(length / ratio)
        elif scale_to_side == "height":
            th, tw = length, int(length * ratio)
        elif scale_to_side == "total_pixel(kilo pixel)":
            tw = math.sqrt(ratio * length * 1000)
            th = tw / ratio
            tw, th = int(tw), int(th)
        else:
            th, tw = orig_h, int(orig_h * ratio)
    tw = max(1, int(tw))
    th = max(1, int(th))
    if round_to_multiple and round_to_multiple != "None":
        m = int(round_to_multiple)
        tw = _ceil_to_multiple(tw, m)
        th = _ceil_to_multiple(th, m)
    return tw, th


def fit_resize(image: Image.Image, tw: int, th: int, fit: str, resample, fill) -> Image.Image:
    """letterbox = pad, crop = center-crop then scale, fill = stretch."""
    src_mode = image.mode
    if src_mode == "L":
        work = image
        canvas_mode = "L"
        pad = 0
    else:
        work = image.convert("RGB")
        canvas_mode = "RGB"
        pad = fill
    ow, oh = work.size
    if ow < 1 or oh < 1 or tw < 1 or th < 1:
        return Image.new(canvas_mode, (max(1, tw), max(1, th)), pad)

    if fit == "letterbox":
        if ow / oh > tw / th:
            fw, fh = tw, max(1, int(tw / ow * oh))
        else:
            fh, fw = th, max(1, int(th / oh * ow))
        scaled = work.resize((fw, fh), resample)
        out = Image.new(canvas_mode, (tw, th), pad)
        out.paste(scaled, ((tw - fw) // 2, (th - fh) // 2))
        return out

    if fit == "crop":
        if ow / oh > tw / th:
            fw = max(1, int(oh * tw / th))
            box = ((ow - fw) // 2, 0, (ow - fw) // 2 + fw, oh)
        else:
            fh = max(1, int(ow * th / tw))
            box = (0, (oh - fh) // 2, ow, (oh - fh) // 2 + fh)
        cropped = work.crop(box)
        return cropped.resize((tw, th), resample)

    return work.resize((tw, th), resample)


def _tensor_to_pils(t: torch.Tensor, as_mask: bool = False) -> list[Image.Image]:
    if t is None:
        return []
    x = t.detach().cpu()
    if as_mask:
        if x.ndim == 2:
            x = x.unsqueeze(0)
        # [B,H,W] or [B,1,H,W]
        if x.ndim == 4:
            x = x.squeeze(1)
        out = []
        for i in range(x.shape[0]):
            arr = np.clip(x[i].numpy() * 255.0, 0, 255).astype(np.uint8)
            out.append(Image.fromarray(arr, mode="L"))
        return out
    if x.ndim == 3:
        x = x.unsqueeze(0)
    out = []
    for i in range(x.shape[0]):
        arr = np.clip(x[i].numpy() * 255.0, 0, 255).astype(np.uint8)
        if arr.ndim == 2:
            out.append(Image.fromarray(arr, mode="L"))
        elif arr.shape[-1] == 1:
            out.append(Image.fromarray(arr[..., 0], mode="L"))
        elif arr.shape[-1] == 4:
            out.append(Image.fromarray(arr, mode="RGBA").convert("RGB"))
        else:
            out.append(Image.fromarray(arr[..., :3], mode="RGB"))
    return out


def _pils_to_image_tensor(pils: list[Image.Image]) -> torch.Tensor:
    stacks = []
    for im in pils:
        rgb = im.convert("RGB")
        arr = np.array(rgb).astype(np.float32) / 255.0
        stacks.append(torch.from_numpy(arr).unsqueeze(0))
    return torch.cat(stacks, dim=0)


def _pils_to_mask_tensor(pils: list[Image.Image]) -> torch.Tensor:
    stacks = []
    for im in pils:
        gray = im.convert("L")
        arr = np.array(gray).astype(np.float32) / 255.0
        stacks.append(torch.from_numpy(arr).unsqueeze(0))
    return torch.cat(stacks, dim=0)


def _is_dummy_empty_mask(mask: torch.Tensor) -> bool:
    if mask is None:
        return True
    m = mask.detach().cpu()
    if m.ndim == 2:
        m = m.unsqueeze(0)
    if m.ndim == 4:
        m = m.squeeze(1)
    if tuple(m.shape[-2:]) != (64, 64):
        return False
    return bool(torch.all(m == 0).item())


class AnimaImageScaleByAspectRatio:
    CATEGORY = "Danbooru Anima"
    FUNCTION = "scale"
    RETURN_TYPES = ("IMAGE", "MASK", "BOX", "INT", "INT")
    RETURN_NAMES = ("图像", "遮罩", "原始尺寸", "宽度", "高度")
    DESCRIPTION = "按宽高比缩放图像/遮罩（信箱补边 / 中心裁剪 / 拉伸填充）。独立实现，不依赖 LayerStyle 或 Swwan。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "宽高比": (_ASPECT, {"default": "原始"}),
                "比例宽度": ("INT", {"default": 1, "min": 1, "max": 100000000, "step": 1}),
                "比例高度": ("INT", {"default": 1, "min": 1, "max": 100000000, "step": 1}),
                "适应": (_FIT, {"default": "信箱补边"}),
                "方法": (_METHOD, {"default": "Lanczos"}),
                "对齐到倍数": (_MULTIPLE, {"default": "8"}),
                "缩放至边": (_SCALE_SIDE, {"default": "无"}),
                "缩放至长度": ("INT", {"default": 1024, "min": 4, "max": 100000000, "step": 1}),
                "背景颜色": ("STRING", {"default": "#000000"}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            },
        }

    def scale(self, image=None, mask=None, **kwargs):
        aspect_ratio = _norm_aspect(kwargs.get("宽高比", kwargs.get("aspect_ratio")))
        proportional_width = kwargs.get("比例宽度", kwargs.get("proportional_width", 1))
        proportional_height = kwargs.get("比例高度", kwargs.get("proportional_height", 1))
        fit = _norm_fit(kwargs.get("适应", kwargs.get("fit")))
        method = _norm_method(kwargs.get("方法", kwargs.get("method")))
        round_to_multiple = _norm_multiple(kwargs.get("对齐到倍数", kwargs.get("round_to_multiple")))
        scale_to_side = _norm_side(kwargs.get("缩放至边", kwargs.get("scale_to_side")))
        scale_to_length = kwargs.get("缩放至长度", kwargs.get("scale_to_length", 1024))
        background_color = kwargs.get("背景颜色", kwargs.get("background_color", "#000000"))

        images = _tensor_to_pils(image, as_mask=False) if image is not None else []
        masks = []
        if mask is not None and not _is_dummy_empty_mask(mask):
            masks = _tensor_to_pils(mask, as_mask=True)

        orig_w = orig_h = 0
        if images:
            orig_w, orig_h = images[0].size
        if masks:
            mw, mh = masks[0].size
            if orig_w and (orig_w != mw or orig_h != mh):
                raise ValueError("Anima：按宽高比缩放 — 遮罩尺寸与图像不一致。")
            if not orig_w:
                orig_w, orig_h = mw, mh

        if not orig_w or not orig_h:
            raise ValueError("Anima：按宽高比缩放 — 请至少接入图像或遮罩。")

        tw, th = compute_target_size(
            orig_w,
            orig_h,
            aspect_ratio,
            int(proportional_width),
            int(proportional_height),
            scale_to_side,
            int(scale_to_length),
            round_to_multiple,
        )
        resample = _resample(method)
        fill = _parse_color(background_color)

        out_images = []
        for im in images:
            out_images.append(fit_resize(im.convert("RGB"), tw, th, fit, resample, fill))
        out_masks = []
        for m in masks:
            # Mask pads with black even if image letterbox uses another fill color.
            out_masks.append(fit_resize(m.convert("L"), tw, th, fit, resample, (0, 0, 0)))

        orig_size = [int(orig_w), int(orig_h)]
        img_t = _pils_to_image_tensor(out_images) if out_images else None
        mask_t = _pils_to_mask_tensor(out_masks) if out_masks else None
        if img_t is None and mask_t is None:
            raise ValueError("Anima：按宽高比缩放 — 没有可用的图像或遮罩。")
        return (img_t, mask_t, orig_size, int(tw), int(th))


NODE_CLASS_MAPPINGS = {
    "AnimaImageScaleByAspectRatio": AnimaImageScaleByAspectRatio,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaImageScaleByAspectRatio": "Anima：按宽高比缩放",
}
