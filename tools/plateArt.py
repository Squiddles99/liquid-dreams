"""Cuts and sizes the lookout backdrop's art (art/lookout/, Andrew's originals) into public/lookout/, which the game loads
(lookout backdrop spec §6).

One folder per painting, art/lookout/<plate>/ (ground.webp, ground-mask.png, shrubs-anim.webp), becomes:

  public/lookout/<plate>-ground-1920.webp  the ground, transparent where the live sky and sea show (1080p and smaller)
  public/lookout/<plate>-ground-3840.webp  the same at 3840 px (1440p and 4K)
  public/lookout/<plate>-sway.png          how far each pixel may sway, 960×540: 0 still ground, 255 shrub tips
  public/lookout/<plate>-flow.png          the shrubs' motion measured from shrubs-anim.webp: 80 frames of 240×135 in a
                                           10×8 atlas, R = dx, G = dy in 1920-px pixels, stored as 128 + 16·d (±7.9 px)
  public/lookout/<plate>-flow.json         { frames, loopS, grid: [240, 135], tiles: [10, 8] }

A ground original may be magenta (#FF00FF, as ChatGPT draws it) or already cut (Canva's background remover): the key
only runs where there is no alpha.

Run with: python tools/plateArt.py [plate ...]   (every plate by default; rerun when art/lookout/ changes; outputs committed)
          python tools/plateArt.py --no-flow     (skips the slow motion pass, a few minutes a plate)
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


def save_sizes(name, plate):
    for width in (1920, 3840):
        img = plate.resize((width, round(plate.size[1] * width / plate.size[0])), Image.LANCZOS)
        path = os.path.join(OUT, f"{name}-ground-{width}.webp")
        img.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
        print(f"{name}-ground-{width}.webp: {img.size[0]} x {img.size[1]}, {os.path.getsize(path) // 1024} KB")


def build(name, flow=True):
    src = os.path.join(SRC, name)
    plate = cut(Image.open(os.path.join(src, "ground.webp")))
    save_sizes(name, plate)
    sway = sway_map(Image.open(os.path.join(src, "ground-mask.png")), plate)
    sway.save(os.path.join(OUT, f"{name}-sway.png"), optimize=True)
    print(f"{name}-sway.png: {sway.size[0]} x {sway.size[1]}")
    if flow:
        write_flow(name, src, plate, sway)


def main(argv):
    os.makedirs(OUT, exist_ok=True)
    names = [a for a in argv if not a.startswith("--")] or sorted(
        d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
    for name in names:
        build(name, flow="--no-flow" not in argv)


def frames_luma(path):
    anim = Image.open(path)
    lum, durs = [], []
    for fr in ImageSequence.Iterator(anim):
        durs.append(fr.info.get("duration", 50) or 50)
        lum.append(np.asarray(fr.convert("RGB").resize((1920, 1080), Image.LANCZOS).convert("L")).astype(np.float32))
    return lum, sum(durs) / 1000.0


def box_at_grid(img, rows, y_origin=0):
    """Sum over FLOW_BLOCK × FLOW_BLOCK patches centred on the 8 px grid, grid rows rows[0]..rows[1] (integral image);
    `img` starts at pixel row `y_origin` of the frame."""
    gw = FLOW_GRID[0]
    k = FLOW_BLOCK // 2
    p = np.pad(img, ((k + 1, k), (k + 1, k)))
    c = p.cumsum(0).cumsum(1)
    ys = np.arange(rows[0], rows[1]) * 8 + 4 - y_origin + k + 1
    xs = np.arange(gw) * 8 + 4 + k + 1
    y0, y1, x0, x1 = ys - k, ys + k, xs - k, xs + k
    return c[np.ix_(y1, x1)] - c[np.ix_(y0, x1)] - c[np.ix_(y1, x0)] + c[np.ix_(y0, x0)]


def shifted(img, sx, sy):
    """out(x, y) = img(x + sx, y + sy), edges clamped."""
    h, w = img.shape
    ys = np.clip(np.arange(h) + sy, 0, h - 1)
    xs = np.clip(np.arange(w) + sx, 0, w - 1)
    return img[np.ix_(ys, xs)]


def match(ref, cur, rows=None):
    """For each grid patch of `cur`, the offset s (px) with cur(x) ≈ ref(x + s), to a sub-pixel by a parabola fit.
    `rows` (grid rows, end exclusive) limits the work to a band; every other row is 0 (still)."""
    r, k = FLOW_REACH, FLOW_BLOCK // 2
    j0, j1 = rows or (0, FLOW_GRID[1])
    y0 = max(0, j0 * 8 + 4 - k - r - 2)
    y1 = min(ref.shape[0], (j1 - 1) * 8 + 4 + k + r + 2)
    ref, cur = ref[y0:y1], cur[y0:y1]
    costs = np.stack([np.stack([box_at_grid((cur - shifted(ref, sx, sy)) ** 2, (j0, j1), y0) for sx in range(-r, r + 1)])
                      for sy in range(-r, r + 1)])  # (sy, sx, rows, gw)
    gh, gw = costs.shape[2:]
    flat = costs.reshape(-1, gh, gw)
    best = flat.argmin(0)
    by, bx = np.divmod(best, 2 * r + 1)
    out = np.zeros((gh, gw, 2), np.float32)
    jj, ii = np.mgrid[0:gh, 0:gw]
    for axis, b in ((0, bx), (1, by)):
        lo = np.clip(b - 1, 0, 2 * r)
        hi = np.clip(b + 1, 0, 2 * r)
        if axis == 0:
            c0, c1, c2 = costs[by, lo, jj, ii], costs[by, b, jj, ii], costs[by, hi, jj, ii]
        else:
            c0, c1, c2 = costs[lo, bx, jj, ii], costs[b, bx, jj, ii], costs[hi, bx, jj, ii]
        den = c0 - 2 * c1 + c2
        frac = np.where((den > 1e-6) & (lo != b) & (hi != b), 0.5 * (c0 - c2) / np.maximum(den, 1e-6), 0)
        out[..., axis] = b - r + np.clip(frac, -0.5, 0.5)
    full = np.zeros((FLOW_GRID[1], FLOW_GRID[0], 2), np.float32)
    full[j0:j1] = out
    return full


def sway_grid(sway):
    return np.asarray(sway.resize(FLOW_GRID, Image.BILINEAR)).astype(np.float32) / 255


def write_flow(name, src, plate, sway):
    lum, loop_s = frames_luma(os.path.join(src, "shrubs-anim.webp"))
    moving = sway_grid(sway)
    live = np.where((moving > 0.05).any(1))[0]
    rows = (max(0, live.min() - 3), min(FLOW_GRID[1], live.max() + 4))  # only the band where anything sways
    print(f"{name}: motion rows {rows[0]}..{rows[1]} of {FLOW_GRID[1]}")
    # The animation must be the same picture as the still: check frame 0 against the plate before measuring anything.
    still = np.asarray(plate.resize((1920, 1080), Image.LANCZOS).convert("L")).astype(np.float32)
    lag = np.median(match(still, lum[0], rows)[moving > 0.3], axis=0)
    print(f"animation vs still: median offset {lag[0]:+.2f}, {lag[1]:+.2f} px")
    if np.abs(lag).max() > 1.0:
        raise SystemExit("the animation is not aligned with the ground painting (> 1 px): regenerate it from the same image")
    flows = []
    for i, cur in enumerate(lum):
        f = match(lum[0], cur, rows) if i else np.zeros((FLOW_GRID[1], FLOW_GRID[0], 2), np.float32)
        f = np.stack([np.asarray(Image.fromarray(f[..., c]).filter(ImageFilter.MedianFilter(3))) for c in range(2)], -1)
        f *= (moving > 0.05)[..., None]  # the ground never moves
        flows.append(np.clip(f, -7.9, 7.9))
        print(f"\rflow: frame {i + 1}/{len(lum)}", end="", flush=True)
    print()
    flow = np.stack(flows)
    pack_flow(flow).save(os.path.join(OUT, f"{name}-flow.png"), optimize=True)
    meta = {"frames": len(lum), "loopS": round(loop_s, 3), "grid": list(FLOW_GRID), "tiles": list(FLOW_TILES)}
    with open(os.path.join(OUT, f"{name}-flow.json"), "w") as f:
        json.dump(meta, f)
    print(f"{name}-flow.png: {len(lum)} frames, loop {loop_s:.2f} s, max |d| {np.abs(flow).max():.2f} px")


if __name__ == "__main__":
    main(sys.argv[1:])
