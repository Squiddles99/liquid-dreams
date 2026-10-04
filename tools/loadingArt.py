"""Sizes the loading screen's art (art/loading/, Andrew's originals) into public/loading/, which the page loads.

  public/loading/photo-1920.webp   the surf photo at 1920 px wide (1080p and smaller screens)
  public/loading/photo-full.webp   the photo at its own width, capped at 3840 px (1440p and 4K)
  public/loading/logo-*.svg        the emblem and the wordmark, copied as they are

Run with: python tools/loadingArt.py   (rerun whenever art/loading/ changes; the outputs are committed)
"""
import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "loading")
OUT = os.path.join(ROOT, "public", "loading")
os.makedirs(OUT, exist_ok=True)

photo = Image.open(os.path.join(SRC, "photo-wide.png")).convert("RGB")
w, h = photo.size


def save(width, name):
    img = photo if width == w else photo.resize((width, round(h * width / w)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
    print(f"{name}: {img.size[0]} x {img.size[1]}, {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")


save(min(1920, w), "photo-1920.webp")
save(min(3840, w), "photo-full.webp")
for name in ("logo-emblem.svg", "logo-wordmark.svg"):
    shutil.copyfile(os.path.join(SRC, name), os.path.join(OUT, name))
    print(f"{name}: copied, {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")
