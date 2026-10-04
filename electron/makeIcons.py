"""Cuts the round emblem out of the Liquid Dreams logo (electron/logo-source.png) and writes the app's icons:

  electron/icon.png     512 px, the Electron window and taskbar
  electron/icon.ico     16-256 px, the desktop shortcut
  public/favicon.png    64 px, the browser tab

The emblem is flat orange, yellow and teal (a grasstree in front of the sun, over a sea bowl); anything else inside
its circle (the photo through the sun's stripes, the cream gap above the sea) goes transparent.
Run with: python electron/makeIcons.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
src = np.asarray(Image.open(os.path.join(HERE, "logo-source.png")).convert("RGB")).astype(np.float32)
H, W, _ = src.shape
s = W / 2000.0  # measured in 2000 px units (the source is 3000 px)

# The emblem's circle and the flat colours it's drawn in (measured: a circle fit to the sun's edge, 0.5 px residual).
CX, CY, R = 990.7 * s, 999.7 * s, 408.7 * s
PHOTO_BOTTOM = 1092 * s  # the photo stops here; below it the page is cream
ORANGE, YELLOW, TEAL = (247, 147, 30), (232, 192, 24), (63, 149, 155)
CREAM = (254, 247, 244)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
inside = np.hypot(xx - CX, yy - CY) <= R + 2 * s
below = yy > PHOTO_BOTTOM

def seg_dist(a, b):
    """Each pixel's colour distance from the blends of flat colours a and b."""
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    t = np.clip(((src - a) * (b - a)).sum(-1) / ((b - a) ** 2).sum(), 0, 1)
    return np.sqrt(((src - (a + t[..., None] * (b - a))) ** 2).sum(-1))


# The grasstree's fronds are thin, so most of the crown is anti-aliased teal over orange or yellow: a pixel counts as
# emblem when it lies on a blend of two flat colours, not only near one. The photo's sea is teal-ish, so teal only
# counts below the photo or in the crown (the sun's middle, below the lowest stripe), never out in the stripes.
d_oy = seg_dist(ORANGE, YELLOW)
d_any = np.minimum.reduce([d_oy, seg_dist(ORANGE, TEAL), seg_dist(YELLOW, TEAL)])

# The frond tips reach up past the tip of the lowest left stripe (867-905), so there the stripe is found row by row: it
# runs in from the circle's left edge to its last pixel that's off every blend, and teal doesn't count on it.
band = (yy > 867 * s) & (yy < 905 * s) & (xx < CX) & (d_any > 30)
stripe_end = np.where(band.any(1), W - 1 - np.argmax(band[:, ::-1], 1), -1).astype(np.float32)
stripe = xx <= stripe_end[:, None] + 3 * s
crown = (np.hypot(xx - 1000 * s, yy - 1106.7 * s) < 256.7 * s) & (yy > 867 * s) & ~stripe
teal_ok = below | crown

d_flat = np.where(teal_ok, d_any, d_oy)

# Above the photo's bottom the emblem's edges meet the photo, whose colour isn't known: the alpha falls off with the
# distance from the flat colours, and the edge takes the nearest flat colour, so no photo bleeds into the rim.
flat = np.array([ORANGE, YELLOW, TEAL], np.float32)
dist_each = np.sqrt(((src[..., None, :] - flat) ** 2).sum(-1))
dist_each[..., 2] = np.where(teal_ok, dist_each[..., 2], 1e9)
nearest = flat[dist_each.argmin(-1)]
alpha = np.clip(1 - (d_flat - 24) / 30, 0, 1)
rgb = np.where((alpha < 1)[..., None], nearest, src)

# Below it the edges meet the cream, which is known: un-mix it, so the rim keeps its full colour with no cream halo.
cream = np.array(CREAM, np.float32)
a_cream = np.clip(np.sqrt(((src - cream) ** 2).sum(-1)) / np.sqrt(((nearest - cream) ** 2).sum(-1)), 0, 1)
a_cream = np.where(a_cream > 0.04, a_cream, 0)
unmixed = np.clip(cream + (src - cream) / np.maximum(a_cream, 1e-3)[..., None], 0, 255)
edge = below & (d_flat > 4)
alpha = np.where(below, np.where(edge, a_cream, 1.0), alpha) * inside
rgb = np.where(edge[..., None], unmixed, rgb)

x0, x1, y0, y1 = int(CX - R - 4 * s), int(CX + R + 4 * s), int(CY - R - 4 * s), int(CY + R + 4 * s)
rgb, alpha = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]

# The source has a few specks of texture in the flat colour: any see-through pocket above the photo's bottom that
# doesn't reach the outside (every stripe does) is a speck, and takes its nearest flat colour.
solid = Image.fromarray(((alpha > 0.5) * 255).astype(np.uint8)).copy()  # an array-backed image ignores the fill
ImageDraw.floodfill(solid, (0, 0), 128)
speck = (np.asarray(solid) == 0) & ~below[y0:y1, x0:x1]
alpha = np.where(speck, 1.0, alpha)
rgb = np.where(speck[..., None], nearest[y0:y1, x0:x1], rgb)

rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
emblem = Image.fromarray(rgba, "RGBA")

emblem.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, "icon.png"))
emblem.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
emblem.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, "public", "favicon.png"))
print("icons written")
