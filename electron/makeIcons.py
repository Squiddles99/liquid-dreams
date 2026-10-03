"""Cuts the round emblem out of the Liquid Dreams logo (electron/logo-source.png) and writes the app's icons:

  electron/icon.png     512 px, the Electron window and taskbar
  electron/icon.ico     16-256 px, the desktop shortcut
  public/favicon.png    64 px, the browser tab

The emblem is flat orange, yellow and teal; anything else inside its circle (the photo through the sun's stripes, the
cream gap above the sea) goes transparent. Run with: python electron/makeIcons.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
src = np.asarray(Image.open(os.path.join(HERE, "logo-source.png")).convert("RGB")).astype(np.float32)
H, W, _ = src.shape
s = W / 2000.0  # measured on the 2000 px source

# The emblem's circle and the flat colours it's drawn in (measured).
CX, CY, R = 999.5 * s, 1062 * s, 395 * s
PHOTO_BOTTOM = 1092 * s  # the photo stops here; below it the page is cream
ORANGE, YELLOW, TEAL = (247, 147, 30), (232, 192, 24), (63, 149, 155)

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
inside = np.hypot(xx - CX, yy - CY) <= R + 2 * s


def near(c, tol=28.0, soft=30.0):
    d = np.sqrt(((src - np.array(c, np.float32)) ** 2).sum(-1))
    return np.clip(1 - (d - tol) / soft, 0, 1)


# Teal is the palm and the sea bowl; the photo's sea is teal-ish too, so teal only counts below the photo or in the
# middle of the sun (the palm), never out in the stripes.
palm = (np.hypot(xx - CX, yy - 1180 * s) < 300 * s) & (yy > 975 * s)  # the crown's top, below the lowest stripe
alpha = np.maximum.reduce([near(ORANGE), near(YELLOW), near(TEAL) * ((yy > PHOTO_BOTTOM) | palm)]) * inside

x0, x1, y0, y1 = int(CX - R - 4 * s), int(CX + R + 4 * s), int(CY - R - 4 * s), int(CY + R + 4 * s)
rgba = np.dstack([src, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
emblem = Image.fromarray(rgba, "RGBA")

emblem.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, "icon.png"))
emblem.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
emblem.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, "public", "favicon.png"))
print("icons written")
