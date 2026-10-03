"""Colour bleed for the heath atlas (dune-up-close §4.2): the clear texels around leaves take the colour of the nearest
leaf, cell by cell, so the GPU's mips (which average colour regardless of alpha) keep the leaf's colour instead of
fading toward the black Blender leaves behind them. Alpha is untouched.

Pure numpy (atlas.py calls it inside Blender). Run on its own to check or bleed an atlas PNG in place:

    python tools/heath/bleed.py --check public/heath/heathAtlas.png
    python tools/heath/bleed.py public/heath/heathAtlas.png
"""

import sys

import numpy as np

CELL = 128
# A texel counts as leaf from this alpha up (the kit's alpha cut is 0.5).
SOLID = 0.5


def bleed(atlas, cell=CELL):
    """`atlas` (H × W × 4, floats 0–1): each cell's texels under SOLID alpha take the mean colour of their nearest leaf
    texels (grown outward a texel a pass, never across a cell's edge). Cells with no leaf are left as they are."""
    h, w, _ = atlas.shape
    ny, nx = h // cell, w // cell
    cells = atlas.reshape(ny, cell, nx, cell, 4).transpose(0, 2, 1, 3, 4)  # (ny, nx, cell, cell, 4), a view
    rgb = cells[..., :3].copy()
    known = cells[..., 3] >= SOLID
    for _ in range(cell):
        if known.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape, dtype=np.float32)
        k = known.astype(np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                acc += _shift(rgb * k[..., None], dy, dx)
                cnt += _shift(k, dy, dx)
        grow = (~known) & (cnt > 0)
        if not grow.any():
            break
        rgb[grow] = acc[grow] / cnt[grow][..., None]
        known = known | grow
    cells[..., :3] = rgb
    return atlas


def _shift(a, dy, dx):
    """`a` moved by (dy, dx) texels within each cell (axes 2 and 3), zeros shifted in."""
    out = np.zeros_like(a)
    n = a.shape[2]
    ys = slice(max(dy, 0), n + min(dy, 0)), slice(max(-dy, 0), n + min(-dy, 0))
    xs = slice(max(dx, 0), n + min(dx, 0)), slice(max(-dx, 0), n + min(-dx, 0))
    out[:, :, ys[0], xs[0]] = a[:, :, ys[1], xs[1]]
    return out


def mip_drift(atlas, cell=CELL, level=16):
    """For each cell with leaves (2%+ of it solid): each block of cell/level texels' mean colour (what a mip holds) over
    its leaf texels' mean, the worst ratio over the blocks with any leaf (1 = the mips keep the leaves' colour)."""
    h, w, _ = atlas.shape
    worst = 1.0
    where = None
    for j in range(h // cell):
        for i in range(w // cell):
            c = atlas[j * cell:(j + 1) * cell, i * cell:(i + 1) * cell]
            solid = c[..., 3] >= SOLID
            if solid.mean() < 0.02:
                continue
            # Each block's mean colour over all its texels (what a mip holds) against over its leaf texels only.
            lum = c[..., :3].mean(axis=2).reshape(level, cell // level, level, cell // level)
            sb = solid.reshape(level, cell // level, level, cell // level)
            n = sb.sum(axis=(1, 3))
            s = n > 0
            r = (lum.mean(axis=(1, 3))[s] / np.maximum((lum * sb).sum(axis=(1, 3))[s] / n[s], 1e-6)).min()
            if r < worst:
                worst, where = r, (i, j)
    return worst, where


if __name__ == "__main__":
    from PIL import Image

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = args[0]
    img = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32) / 255
    if "--check" in sys.argv:
        worst, where = mip_drift(img)
        print(f"the darkest mip block against its cell's leaves: {worst:.2f} (cell {where})")
        sys.exit(0 if worst >= 0.8 else 1)
    out = bleed(img.copy())
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path)
    print(f"bled {path}; the darkest mip block now {mip_drift(out)[0]:.2f}")
