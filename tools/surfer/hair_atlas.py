"""The hair strand atlas (dune select spec §13.2): real strands for the hair cards, rasterised from parametric strand
curves. python hair_atlas.py <out dir>  →  hairAtlas.png (2048², RGBA) and hairAtlas.json (the tile table).

Each of the 16 tiles (256 × 1024 px, 8 × 2) is one lock about a centimetre wide, root at the top (v = 0) and tip at the
bottom (v = 1), the way a card's UVs run. Its strands are tapered polylines, drawn 4× supersampled with a depth buffer:

    R  depth: 1 for the frontmost strand, 0 at the back (the shader shades the strands behind)
    G  root → tip along the strand (0 at its root)
    B  the strand's own random (its shade)
    A  coverage (in alpha, so a decoder that premultiplies only scales the others where the coverage is partial)

Ours entirely (no textures from anywhere else). Plain Python with numpy and Pillow; no Blender needed.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image

SIZE, COLS, ROWS, PAD = 2048, 8, 2, 8
TW, TH = SIZE // COLS, SIZE // ROWS
SS = 4  # supersampling
# A strand's radius in tile pixels (a tile is ~1 cm across, so ~40 µm a pixel): ~35 µm at the root, ~10 µm at the tip.
R_ROOT, R_TIP = 0.85, 0.3

# (name, role, kind, strands, seed): the order fixes each tile's place, column by column across the two rows.
TILES = [
    ("core-a", "core", "straight", 134, 1),
    ("core-b", "core", "straight", 154, 2),
    ("core-c", "core", "wave", 140, 3),
    ("outer-straight", "outer", "straight", 89, 4),
    ("outer-wave", "outer", "wave", 89, 5),
    ("outer-frayed", "outer", "frayed", 98, 6),
    ("flyaway-a", "flyaway", "flyaway", 30, 7),
    ("flyaway-b", "flyaway", "flyaway", 42, 8),
    ("fringe-a", "fringe", "fringe", 56, 9),
    ("fringe-b", "fringe", "fringe", 72, 10),
    ("braid-a", "braid", "braid", 125, 11),
    ("braid-b", "braid", "braid", 140, 12),
    ("braid-c", "braid", "braid", 112, 13),
    ("tail-a", "tail", "tail", 140, 14),
    ("tail-b", "tail", "tail", 160, 15),
    ("tail-c", "tail", "frayed", 112, 16),
]


def _noise1(rng, n=4):
    """A smooth random function of t in [0, 1] (a few low-frequency sines)."""
    terms = [(rng.uniform(0.5, 2.5), rng.uniform(0, 2 * math.pi), rng.uniform(0.3, 1.0)) for _ in range(n)]
    total = sum(a for _, _, a in terms)
    return lambda t: sum(a * math.sin(2 * math.pi * f * t + p) for f, p, a in terms) / total


# Strands grow in clumps with gaps between (as real locks do, and as production hair-card textures are drawn): a
# card is often only 8–30 px wide on screen, where single strands are under a pixel and the texture is read from its
# mipmaps; evenly spread strands average to flat grey there, while clumps and gaps survive into the small mips.
CLUMPS = {"straight": 5, "wave": 4, "frayed": 4, "flyaway": 3, "fringe": 4, "braid": 3, "tail": 3}


def clump_centres(kind, rng):
    k = CLUMPS[kind]
    edges = sorted(rng.uniform(0.0, 1.0) for _ in range(k - 1))
    cuts = [0.0, *edges, 1.0]
    return [(0.08 + 0.84 * (a + b) / 2, 0.84 * (b - a) * 0.42) for a, b in zip(cuts, cuts[1:])]


def strand(kind, rng, k, n, clumps):
    """One strand as points (x across the tile 0..1, v root → tip 0..1); returns (points, length fraction). It belongs to
    one of the tile's clumps: rooted within it and drawn in toward its middle down the length."""
    cx, half = clumps[k % len(clumps)]
    off = rng.gauss(0.0, 0.5) * max(half, 0.02)
    x0 = min(0.95, max(0.05, cx + off))
    pull = rng.uniform(0.3, 0.6)  # how far toward the clump's middle by the tip
    drift = _noise1(rng)
    length = 1.0
    pts = []
    steps = 64
    if kind == "straight":
        length = rng.uniform(0.9, 1.0)
        for i in range(steps + 1):
            t = i / steps
            pts.append((x0 - pull * off * t + 0.03 * drift(t), t * length))
    elif kind == "wave":
        length = rng.uniform(0.88, 1.0)
        ph = rng.uniform(-0.4, 0.4)
        for i in range(steps + 1):
            t = i / steps
            pts.append((x0 - pull * off * t + 0.07 * math.sin(2 * math.pi * (1.8 * t) + ph) + 0.02 * drift(t), t * length))
    elif kind == "frayed":
        length = rng.uniform(0.55, 1.0)
        out = rng.uniform(-1, 1)
        for i in range(steps + 1):
            t = i / steps
            pts.append((x0 - pull * off * t + 0.03 * drift(t) + 0.12 * out * t ** 3, t * length))
    elif kind == "flyaway":
        length = rng.uniform(0.45, 0.95)
        bend = rng.choice([-1, 1]) * rng.uniform(0.15, 0.4)
        x0 = rng.uniform(0.2, 0.8)
        for i in range(steps + 1):
            t = i / steps
            pts.append((x0 + bend * t ** 2 + 0.04 * drift(t), t * length))
    elif kind == "fringe":
        length = rng.uniform(0.7, 1.0)
        for i in range(steps + 1):
            t = i / steps
            pts.append((x0 - pull * off * t + 0.05 * drift(t) + 0.08 * (x0 - 0.5) * t, t * length))
    elif kind == "braid":
        # The surface of a twisted strand of a plait: strands run diagonally (about 30°) and wrap across the tile.
        slope = rng.uniform(0.5, 0.65)
        x0 = (cx + off) % 1.0  # in its band; the bands wrap round the strand's tube
        length = 1.0
        for i in range(steps + 1):
            t = i / steps
            pts.append(((x0 + slope * t + 0.015 * drift(t)) % 1.0, t))
    elif kind == "tail":
        # Below a hair tie: a bundle at the root spraying apart toward uneven tips.
        length = rng.uniform(0.5, 1.0)
        spread = (x0 - 0.5) * 1.6 - pull * off
        for i in range(steps + 1):
            t = i / steps
            pts.append((0.5 + spread * (0.25 + 0.75 * t) + 0.03 * drift(t), t * length))
    return pts, length


def draw_tile(kind, count, seed):
    """Rasterise one tile's strands (supersampled), returning (coverage, root, rand, depth) at tile resolution."""
    rng = random.Random(seed * 7919)
    w, h = (TW - 2 * PAD) * SS, (TH - 2 * PAD) * SS
    zbuf = np.full((h, w), -1.0, np.float32)
    root = np.zeros((h, w), np.float32)
    rnd = np.zeros((h, w), np.float32)
    strands = []
    clumps = clump_centres(kind, rng)
    for k in range(count):
        pts, length = strand(kind, rng, k, count, clumps)
        strands.append((rng.random(), rng.random(), pts, length))
    strands.sort(key=lambda s: s[0])  # back to front by depth
    for z, r, pts, length in strands:
        for i in range(len(pts) - 1):
            (ax, av), (bx, bv) = pts[i], pts[i + 1]
            if kind == "braid" and abs(bx - ax) > 0.5:
                continue  # the wrap across the tile's edge
            t0, t1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
            rad = SS * (R_ROOT + (R_TIP - R_ROOT) * ((t0 + t1) / 2))
            A = np.array([ax * w, av * h]); B = np.array([bx * w, bv * h])
            x_lo, x_hi = int(max(0, min(A[0], B[0]) - rad - 1)), int(min(w, max(A[0], B[0]) + rad + 2))
            y_lo, y_hi = int(max(0, min(A[1], B[1]) - rad - 1)), int(min(h, max(A[1], B[1]) + rad + 2))
            if x_hi <= x_lo or y_hi <= y_lo:
                continue
            ys, xs = np.mgrid[y_lo:y_hi, x_lo:x_hi]
            px, py = xs + 0.5, ys + 0.5
            d = B - A
            L2 = max(float(d @ d), 1e-9)
            u = np.clip(((px - A[0]) * d[0] + (py - A[1]) * d[1]) / L2, 0.0, 1.0)
            dist = np.hypot(px - (A[0] + u * d[0]), py - (A[1] + u * d[1]))
            hit = (dist <= rad) & (z > zbuf[y_lo:y_hi, x_lo:x_hi])
            if not hit.any():
                continue
            zb = zbuf[y_lo:y_hi, x_lo:x_hi]
            zb[hit] = z
            # Root → tip along this strand: its own parameter, scaled by its length (a short strand never reads as tip).
            root[y_lo:y_hi, x_lo:x_hi][hit] = ((t0 + u * (t1 - t0)) * length)[hit]
            rnd[y_lo:y_hi, x_lo:x_hi][hit] = r
    cov_ss = (zbuf >= 0).astype(np.float32)

    def down(a):
        return a.reshape(h // SS, SS, w // SS, SS).mean(axis=(1, 3))

    cov = down(cov_ss)
    safe = np.maximum(cov, 1e-6)
    out = [cov, down(root * cov_ss) / safe, down(rnd * cov_ss) / safe, down(np.maximum(zbuf, 0) * cov_ss) / safe]
    return out


def main(out_dir):
    img = np.zeros((SIZE, SIZE, 4), np.uint8)
    table = {"size": SIZE, "cols": COLS, "rows": ROWS, "padPx": PAD, "tiles": []}
    for idx, (name, role, kind, count, seed) in enumerate(TILES):
        col, row = idx % COLS, idx // COLS
        cov, root, rnd, depth = draw_tile(kind, count, seed)
        y0, x0 = row * TH + PAD, col * TW + PAD
        block = img[y0:y0 + TH - 2 * PAD, x0:x0 + TW - 2 * PAD]
        block[..., 0] = np.round(np.clip(depth, 0, 1) * 255)
        block[..., 1] = np.round(np.clip(root, 0, 1) * 255)
        block[..., 2] = np.round(np.clip(rnd, 0, 1) * 255)
        block[..., 3] = np.round(np.clip(cov, 0, 1) * 255)
        table["tiles"].append({"name": name, "role": role, "col": col, "row": row})
        print(f"tile {idx:2d} {name:15s} coverage {cov.mean():.2f}")
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray(img, "RGBA").save(os.path.join(out_dir, "hairAtlas.png"), optimize=True)
    with open(os.path.join(out_dir, "hairAtlas.json"), "w", encoding="utf-8") as f:
        json.dump(table, f, indent=2)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public/surfer")
