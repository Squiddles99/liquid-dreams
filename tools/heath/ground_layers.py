"""The ground's material layers (dune-up-close spec §4.3): 1024² per layer, tiling every 2 m (≈ 2 mm a pixel), all
tileable by construction (noise filtered on a periodic grid; stamps wrap). Layers: sand, sandy soil with fallen leaves
and twigs, pitted limestone with lichen, tan track soil, one bare footprint (the decals' tile).

Writes groundLayers.colour.png (sRGB, 1024² a layer) and groundLayers.nrh.png (normal xy, height, roughness; 512² a
layer), the layers stacked top to bottom; groundLayers.height.bin (5 × 256², Uint16, every 4th texel: the CPU's copy) and groundLayers.json."""
import json
import os
import sys

import numpy as np
from PIL import Image

N, TILE_M = 1024, 2.0
LAYERS = ["sand", "soil", "limestone", "track", "footprints"]
rng = np.random.default_rng(20261002)


def band_noise(lo_m, hi_m):
    """Periodic noise with features between lo_m and hi_m (metres), normalised to 0–1."""
    f = np.fft.fftfreq(N, d=TILE_M / N)
    fx, fy = np.meshgrid(f, f)
    k = np.hypot(fx, fy)
    spec = np.fft.fft2(rng.standard_normal((N, N))) * ((k >= 1 / hi_m) & (k <= 1 / lo_m))
    n = np.real(np.fft.ifft2(spec))
    return (n - n.min()) / (np.ptp(n) or 1.0)


def stamp(h, shape, at, depth, mask=None, value=1.0):
    """Adds `shape` (2D, 0–1) at pixel `at` (wrapping) scaled by `depth`; marks `mask` there with `value`."""
    sy, sx = shape.shape
    rows = (at[0] + np.arange(sy)) % N
    cols = (at[1] + np.arange(sx)) % N
    ix = np.ix_(rows, cols)
    h[ix] = np.maximum(h[ix], h[ix] * 0 + depth * shape) if depth > 0 else h[ix] + depth * shape
    if mask is not None:
        mask[ix] = np.where(shape > 0.15, value, mask[ix])


def leaf(length_px, width_px, angle):
    """A leaf lying flat: an ellipse, domed, rotated."""
    r = int(max(length_px, width_px)) + 2
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float64)
    c, s = np.cos(angle), np.sin(angle)
    u, v = (xx * c + yy * s) / (length_px / 2), (-xx * s + yy * c) / (width_px / 2)
    return np.clip(1 - u * u - v * v, 0, 1) ** 0.5


def foot():
    """A bare footprint, 26 cm long, centred in the tile (the decals draw the whole tile)."""
    # The decal is 11 × 28 cm; the foot fills its tile (x across, y along; toes at y = −1, the tile's top).
    yy, xx = np.mgrid[-1:1:N * 1j, -1:1:N * 1j]
    yy = -yy
    sole = np.clip(1 - (xx / 0.8) ** 2 - ((yy + 0.05) / 0.72) ** 2, 0, 1)
    heel = np.clip(1 - (xx / 0.62) ** 2 - ((yy + 0.62) / 0.28) ** 2, 0, 1)
    toes = sum(np.clip(1 - ((xx - dx) / 0.15) ** 2 - ((yy - dy) / 0.1) ** 2, 0, 1)
               for dx, dy in ((-0.48, 0.74), (-0.2, 0.82), (0.06, 0.82), (0.3, 0.76), (0.52, 0.66)))
    return np.clip(np.maximum(sole, heel) + toes, 0, 1) ** 0.5


def build():
    heights, colours = [], []
    # Sand: fine grains on low lumps.
    sand = 0.55 * band_noise(0.004, 0.02) + 0.45 * band_noise(0.3, 1.2)
    heights.append(sand)
    colours.append(np.array([0.62, 0.55, 0.42])[None, None] * (0.94 + 0.12 * sand[..., None]))
    # Soil: dark sandy soil strewn with fallen leaves and twigs (raised, and their own colours).
    soil = 0.4 * band_noise(0.01, 0.08) + 0.3 * band_noise(0.3, 1.0)
    fall = np.zeros((N, N))
    tone = np.zeros((N, N))
    for _ in range(1400):
        lf = leaf(rng.uniform(8, 13), rng.uniform(1.6, 2.6), rng.uniform(0, np.pi))  # daisy needles, 1.6–2.6 cm
        stamp(soil, lf, rng.integers(N, size=2), rng.uniform(0.35, 0.6), fall, rng.uniform(0.3, 1.0))
    for _ in range(500):
        lf = leaf(rng.uniform(9, 16), rng.uniform(4, 7), rng.uniform(0, np.pi))  # wattle and tea-tree leaves
        stamp(soil, lf, rng.integers(N, size=2), rng.uniform(0.4, 0.7), fall, rng.uniform(0.3, 1.0))
    for _ in range(160):
        lf = leaf(rng.uniform(40, 110), rng.uniform(1.5, 3), rng.uniform(0, np.pi))  # twigs, 8–22 cm
        stamp(soil, lf, rng.integers(N, size=2), rng.uniform(0.6, 0.9), tone, 1.0)
    heights.append(soil)
    base = np.array([0.11, 0.095, 0.07])[None, None] * (0.85 + 0.3 * band_noise(0.02, 0.2)[..., None])
    leafc = np.array([0.24, 0.21, 0.15])[None, None] * (0.7 + 0.6 * fall[..., None])
    twigc = np.array([0.2, 0.18, 0.15])[None, None]
    col = np.where((fall > 0)[..., None], leafc, base)
    colours.append(np.where((tone > 0)[..., None], twigc, col))
    # Limestone: weathered cap rock, solution pits, dark lichen.
    lime = 0.6 * band_noise(0.15, 0.9) + 0.4 * band_noise(0.005, 0.03)
    pits = band_noise(0.02, 0.12)
    lime = lime - 0.7 * np.clip(pits - 0.62, 0, 1) / 0.38
    heights.append(lime)
    lichen = band_noise(0.02, 0.3)
    c = np.array([0.42, 0.4, 0.36])[None, None] * (0.8 + 0.3 * lime[..., None])
    c = np.where((lichen > 0.68)[..., None], c * 0.45, c)
    c = np.where((pits > 0.7)[..., None], c * 0.6, c)
    colours.append(c)
    # Track: packed tan-brown soil (Andrew's Earth views), scuffed.
    track = 0.6 * band_noise(0.01, 0.05) + 0.4 * band_noise(0.4, 1.5)
    heights.append(track)
    colours.append(np.array([0.25, 0.175, 0.105])[None, None] * (0.88 + 0.24 * track[..., None]))  # darker: the aerial views' tan-brown
    # One bare footprint (depressed: low height), track-coloured; the decals darken it.
    fp = foot()
    heights.append(1 - fp)
    colours.append(np.array([0.23, 0.16, 0.1])[None, None] * (1 - 0.15 * fp[..., None]))
    return heights, colours


def normals(h, depth_m):
    gy, gx = np.gradient(h * depth_m, TILE_M / N)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def main(out):
    heights, colours = build()
    col_rows, nrh_rows, small, means = [], [], [], []
    for i, (h, c) in enumerate(zip(heights, colours)):
        h = (h - h.min()) / (np.ptp(h) or 1.0)
        c = np.clip(c, 0, 1)
        means.append([round(float(v), 4) for v in c.reshape(-1, 3).mean(0)])
        srgb = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)
        col_rows.append((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8))
        # The shading normals from a gentle 6 mm of relief: at 2.5 cm across 2 mm pixels the fine noise read as a
        # leopard's spots (the vertex relief keeps its 2.5 cm).
        n = normals(h, 0.006)
        rough = 0.95 - 0.1 * h if i != 2 else 0.8 - 0.2 * h
        nrh = np.clip(np.dstack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, h, rough]), 0, 1)
        # 512² (4 mm a pixel): the normals' noise compresses poorly; at 1024² this file alone was 12.9 MB.
        nrh = nrh.reshape(N // 2, 2, N // 2, 2, 4).mean(axis=(1, 3))
        nrh_rows.append((nrh * 255 + 0.5).astype(np.uint8))
        small.append((h[::4, ::4] * 65535 + 0.5).astype("<u2"))
    Image.fromarray(np.vstack(col_rows), "RGB").save(os.path.join(out, "groundLayers.colour.png"), optimize=True)
    Image.fromarray(np.vstack(nrh_rows), "RGBA").save(os.path.join(out, "groundLayers.nrh.png"), optimize=True)
    np.stack(small).tofile(os.path.join(out, "groundLayers.height.bin"))
    json.dump({"tileM": TILE_M, "layers": LAYERS, "meanColour": means}, open(os.path.join(out, "groundLayers.json"), "w"), indent=1)
    print("ground layers:", [m for m in means])


main(sys.argv[1])
