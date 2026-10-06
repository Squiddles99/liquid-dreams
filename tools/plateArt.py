"""Cuts and sizes the lookout backdrop's art (art/lookout/, Andrew's originals) into public/lookout/, which the game loads
(lookout backdrop spec §6).

  public/lookout/ground-1920.webp   the ground, transparent where the live sky and sea show (1080p and smaller)
  public/lookout/ground-3840.webp   the same at 3840 px (1440p and 4K)
  public/lookout/sway.png           how far each pixel may sway, 960×540: 0 still ground, 255 shrub tips
  public/lookout/shrub-flow.png     the shrubs' motion measured from shrubs-anim.webp: 80 frames of 240×135 in a 10×8 atlas,
                                    R = dx, G = dy in 1920-px pixels, stored as 128 + 16·d (±7.9 px, 1/16 px steps)
  public/lookout/shrub-flow.json    { frames, loopS, grid: [240, 135], tiles: [10, 8] }

A ground original may be magenta (#FF00FF, as ChatGPT draws it) or already cut (Canva's background remover): the key
only runs where there is no alpha.

Run with: python tools/plateArt.py           (rerun whenever art/lookout/ changes; the outputs are committed)
          python tools/plateArt.py --no-flow (skips the slow motion pass, ~3 min)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "lookout")
OUT = os.path.join(ROOT, "public", "lookout")

FLOW_GRID = (240, 135)   # one motion sample per 8 px of a 1920×1080 frame
FLOW_TILES = (10, 8)     # 80 frames in the atlas
FLOW_BLOCK = 16          # matched patch size (px)
FLOW_REACH = 5           # search ±5 px
FLOW_STEP = 16.0         # stored as 128 + 16·d


def key(rgb):
    """Magenta key and despill (tested 2026-10-06): magenta-ness = min(R, B) − G; ≥ 170 is background, ≤ 60 is kept."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    alpha = 1 - np.clip((m - 60) / 110, 0, 1)
    spill = np.clip(m, 0, None)
    a[..., 0] -= spill
    a[..., 2] -= spill
    return np.dstack([np.clip(a, 0, 255) / 255, alpha]).astype(np.float32)


def cut(img):
    """The ground as RGBA: kept as cut when the original already has transparency, keyed when it is magenta."""
    if img.mode in ("RGBA", "LA") and np.asarray(img.getchannel("A")).min() < 255:
        return img.convert("RGBA")
    return Image.fromarray((key(np.asarray(img.convert("RGB"))) * 255).round().astype(np.uint8), "RGBA")


def sway_map(mask, plate, size=(960, 540)):
    """Andrew's mask, plus plant-coloured pixels it missed, weighted from base (still) to tip (moves most)."""
    w, h = size
    m = np.asarray(mask.convert("L").resize(size, Image.LANCZOS)).astype(np.float32) / 255
    p = np.asarray(plate.resize(size, Image.LANCZOS)).astype(np.float32) / 255
    plant = ((p[..., 1] > p[..., 0] * 0.92) & (p[..., 3] > 0.5)).astype(np.float32)
    m = np.maximum(m, plant * 0.8)
    height = np.zeros_like(m)
    run = np.zeros(w, np.float32)
    for y in range(h - 1, -1, -1):  # how far up its plant each pixel sits, from the plant's foot
        run = np.where(m[y] > 0.5, run + 1, 0)
        height[y] = run
    root = np.clip(height / (45 * h / 941), 0, 1) ** 1.2
    out = Image.fromarray((m * root * 255).astype(np.uint8))
    return out.filter(ImageFilter.BoxBlur(2)).filter(ImageFilter.GaussianBlur(1))


def pack_flow(flow):
    """(frames, gh, gw, 2) px → one RGB atlas image, FLOW_TILES across × down."""
    n, gh, gw, _ = flow.shape
    tx, ty = FLOW_TILES
    atlas = np.full((gh * ty, gw * tx, 3), 128, np.uint8)
    q = np.clip(np.round(128 + flow * FLOW_STEP), 0, 255).astype(np.uint8)
    for f in range(n):
        x0, y0 = (f % tx) * gw, (f // tx) * gh
        atlas[y0:y0 + gh, x0:x0 + gw, :2] = q[f]
    return Image.fromarray(atlas, "RGB")


def unpack_flow(atlas, frames=80, grid=FLOW_GRID):
    gw, gh = grid
    a = np.asarray(atlas).astype(np.float32)
    tx = FLOW_TILES[0]
    return np.stack([(a[(f // tx) * gh:(f // tx + 1) * gh, (f % tx) * gw:(f % tx + 1) * gw, :2] - 128) / FLOW_STEP
                     for f in range(frames)])


def save_sizes(plate):
    for width in (1920, 3840):
        img = plate.resize((width, round(plate.size[1] * width / plate.size[0])), Image.LANCZOS)
        path = os.path.join(OUT, f"ground-{width}.webp")
        img.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
        print(f"ground-{width}.webp: {img.size[0]} x {img.size[1]}, {os.path.getsize(path) // 1024} KB")


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    plate = cut(Image.open(os.path.join(SRC, "ground.webp")))
    save_sizes(plate)
    sway = sway_map(Image.open(os.path.join(SRC, "ground-mask.png")), plate)
    sway.save(os.path.join(OUT, "sway.png"), optimize=True)
    print(f"sway.png: {sway.size[0]} x {sway.size[1]}")
    if "--no-flow" not in argv:
        write_flow(plate, sway)


def write_flow(plate, sway):
    raise NotImplementedError("Task 2")


if __name__ == "__main__":
    main(sys.argv[1:])
