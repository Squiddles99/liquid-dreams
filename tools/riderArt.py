"""Cuts and sizes the painted riders (art/riders/, Andrew's originals) into public/riders/, which the game loads on the
Rider and Gear screens (painted riders spec).

art/riders/<rider>/<outfit>.png holds one rider in one outfit: 6000×3375, already cut out (Canva), every outfit of a
rider made from the same picture by image-to-image, so they line up. Each becomes:

  public/riders/<rider>-<outfit>-900.webp    the rider cropped to the rider's box, 900 px tall (1080p and smaller)
  public/riders/<rider>-<outfit>-1800.webp   the same, 1800 px tall (1440p and 4K)

and public/riders/riders.json says, per rider, the box (in the originals' pixels) and where the soles are in it, so the
game stands each rider at their real height on the bank's track. One box per rider, the union of their outfits: every
outfit of a rider crops identically, so the cross-fade between them doesn't jump.

The edges are defringed: a pixel that is part see-through (hair, the cut's soft rim) takes the colour of the nearest
solid pixel, so the magenta or white the remover left in it (Shazza's braids) never shows against the sky.

Run with: python tools/riderArt.py   (rerun when art/riders/ changes; outputs committed)
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "riders")
OUT = os.path.join(ROOT, "public", "riders")

HEIGHTS = (900, 1800)
MARGIN = 24        # px of the original around the union box
SOLID = 0.97       # alpha at and above this keeps its own colour

def box_blur(x, r):
    """A float image box-blurred twice with radius r (≈ a Gaussian), edges clamped; PIL can't blur float images."""
    for _ in range(2):
        for axis in (0, 1):
            pad = [(0, 0)] * x.ndim
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(x, pad, mode="edge"), axis=axis, dtype=np.float64)
            n = x.shape[axis]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
            lo = np.take(c, np.arange(0, n), axis=axis)
            x = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return x


def defringe(rgba):
    """RGBA float (0…1) → the same with every part see-through pixel's colour taken from the solid pixels nearest it."""
    rgb, a = rgba[..., :3], rgba[..., 3]
    solid = (a >= SOLID).astype(np.float32)
    fill_rgb, fill_w = rgb * solid[..., None], solid.copy()
    # Grow the solid colour outward: blurred premultiplied colour over blurred weight, wider each pass, keeping the
    # nearest reach that has any solid pixel.
    out = rgb.copy()
    todo = (a < SOLID) & (a > 0)
    for radius in (1, 2, 4, 8, 16):
        w = box_blur(fill_w, radius)
        got = todo & (w > 1e-3)
        if not got.any():
            continue
        for c in range(3):
            ch = box_blur(fill_rgb[..., c], radius)
            out[..., c][got] = ch[got] / w[got]
        todo &= ~got
    return np.dstack([np.clip(out, 0, 1), a])

def union_box(paths):
    """The union of the outfits' opaque boxes (alpha > 0.5), widened by MARGIN, clipped to the picture."""
    x0 = y0 = 1 << 30
    x1 = y1 = 0
    soles = 0
    for p in paths:
        al = np.asarray(Image.open(p).getchannel("A"))
        ys, xs = np.nonzero(al > 128)
        x0, x1, y0, y1 = min(x0, xs.min()), max(x1, xs.max()), min(y0, ys.min()), max(y1, ys.max())
        soles = max(soles, int(ys.max()))
    w, h = Image.open(paths[0]).size
    box = (max(0, int(x0) - MARGIN), max(0, int(y0) - MARGIN), min(w, int(x1) + MARGIN + 1), min(h, int(y1) + MARGIN + 1))
    return box, soles, (w, h)

def build():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for rider in sorted(os.listdir(SRC)):
        folder = os.path.join(SRC, rider)
        if not os.path.isdir(folder):
            continue
        outfits = sorted(f[:-4] for f in os.listdir(folder) if f.endswith(".png"))
        paths = [os.path.join(folder, o + ".png") for o in outfits]
        box, _, size = union_box(paths)
        # The figure's height: top of the head to the soles, measured on the barefoot outfits (median, so one odd render
        # doesn't move the rider), in the originals' pixels.
        tops, soles = [], []
        for o, p in zip(outfits, paths):
            if o == "walking":
                continue
            al = np.asarray(Image.open(p).getchannel("A"))
            rows = np.nonzero((al > 128).any(axis=1))[0]
            tops.append(int(rows.min()))
            soles.append(int(rows.max()))
        top, sole = float(np.median(tops)), float(np.median(soles))
        meta[rider] = {"size": list(size), "box": list(box), "headY": top, "solesY": sole, "centreX": None, "outfits": outfits}
        xs = []
        for o, p in zip(outfits, paths):
            im = Image.open(p).convert("RGBA").crop(box)
            a = np.asarray(im).astype(np.float32) / 255
            clean = Image.fromarray((defringe(a) * 255).round().astype(np.uint8), "RGBA")
            al = np.asarray(clean.getchannel("A"))
            cols = np.nonzero((al > 128).any(axis=0))[0]
            xs.append((cols.min() + cols.max()) / 2 + box[0])
            for h in HEIGHTS:
                w = round(clean.width * h / clean.height)
                clean.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f"{rider}-{o}-{h}.webp"), lossless=False, quality=92, alpha_quality=100, method=6)
            print(f"{rider}-{o}: box {box}")
        meta[rider]["centreX"] = float(np.median(xs))
    with open(os.path.join(OUT, "riders.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")

if __name__ == "__main__":
    build()
