"""Scale an image or mask so its long side or short side matches a length.

The original proportions stay as they are. This is not an aspect-ratio fit node:
there is no letterbox, crop, stretch, or target ratio.
"""
from __future__ import annotations

import numpy as np
import torch
from PIL import Image

_MODES = ["最长边", "最短边"]


def _is_short(value) -> bool:
    s = str(value or "").strip().lower()
    return s in ("最短边", "缩放至最短边", "shortest", "short")


def target_size(orig_w: int, orig_h: int, mode, length: int) -> tuple[int, int]:
    length = max(1, int(length))
    short = _is_short(mode)
    base = min(orig_w, orig_h) if short else max(orig_w, orig_h)
    scale = length / float(base)
    tw = max(1, int(round(orig_w * scale)))
    th = max(1, int(round(orig_h * scale)))
    if short:
        if orig_w <= orig_h:
            tw = length
        else:
            th = length
    else:
        if orig_w >= orig_h:
            tw = length
        else:
            th = length
    return tw, th


def _resize(image: Image.Image, tw: int, th: int) -> Image.Image:
    if image.size == (tw, th):
        return image
    return image.resize((tw, th), Image.LANCZOS)  # 缩放算法固定为 Lanczos


def _tensor_to_pils(t: torch.Tensor, as_mask: bool = False) -> list[Image.Image]:
    if t is None:
        return []
    x = t.detach().cpu()
    if as_mask:
        if x.ndim == 2:
            x = x.unsqueeze(0)
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
        arr = np.array(im.convert("RGB")).astype(np.float32) / 255.0
        stacks.append(torch.from_numpy(arr).unsqueeze(0))
    return torch.cat(stacks, dim=0)


def _pils_to_mask_tensor(pils: list[Image.Image]) -> torch.Tensor:
    stacks = []
    for im in pils:
        arr = np.array(im.convert("L")).astype(np.float32) / 255.0
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
    DESCRIPTION = "把图像或遮罩缩放到指定的最长边或最短边，原图比例不变。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "缩放至": (_MODES, {"default": "最长边"}),
                "缩放至长度": ("INT", {"default": 1024, "min": 4, "max": 100000000, "step": 1}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
            },
        }

    def scale(self, image=None, mask=None, **kwargs):
        mode = kwargs.get("缩放至", kwargs.get("缩放方式", kwargs.get("缩放至边", kwargs.get("scale_to_side", "最长边"))))
        length = kwargs.get("缩放至长度", kwargs.get("scale_to_length", 1024))

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

        tw, th = target_size(orig_w, orig_h, mode, int(length))
        out_images = [_resize(im.convert("RGB"), tw, th) for im in images]
        out_masks = [_resize(m.convert("L"), tw, th) for m in masks]

        img_t = _pils_to_image_tensor(out_images) if out_images else None
        mask_t = _pils_to_mask_tensor(out_masks) if out_masks else None
        if img_t is None and mask_t is None:
            raise ValueError("Anima：按宽高比缩放 — 没有可用的图像或遮罩。")
        return (img_t, mask_t, [int(orig_w), int(orig_h)], int(tw), int(th))


NODE_CLASS_MAPPINGS = {
    "AnimaImageScaleByAspectRatio": AnimaImageScaleByAspectRatio,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "AnimaImageScaleByAspectRatio": "Anima：按宽高比缩放",
}
