"""Sizes the loading screen's art (art/loading/, Andrew's originals) into public/loading/, which the page loads.

  public/loading/<name>-1920.webp  each picture in art/loading/slides/ at 1920 px wide (1080p and smaller screens)
  public/loading/<name>-full.webp  the picture at its own width, capped at 3840 px (1440p and 4K)
  public/loading/emblem.webp       the spinning coin's face: the emblem alone, square, 1024 px, transparent outside

The slide names it prints go on index.html's #ld-cover data-slides (the cover picks one at random each time).

Run with: python tools/loadingArt.py   (rerun whenever art/loading/ changes; the outputs are committed)
"""
import base64
import io
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art", "loading")
OUT = os.path.join(ROOT, "public", "loading")
os.makedirs(OUT, exist_ok=True)


def report(name):
    path = os.path.join(OUT, name)
    with Image.open(path) as img:
        print(f"{name}: {img.size[0]} x {img.size[1]}, {os.path.getsize(path) // 1024} KB")


def save_photo(photo, width, name):
    w, h = photo.size
    img = photo if width == w else photo.resize((width, round(h * width / w)), Image.LANCZOS)
    img.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
    report(name)


names = []
slides = os.path.join(SRC, "slides")
for file in sorted(os.listdir(slides)):
    stem, ext = os.path.splitext(file)
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        continue
    photo = Image.open(os.path.join(slides, file)).convert("RGB")
    save_photo(photo, min(1920, photo.size[0]), f"{stem}-1920.webp")
    save_photo(photo, min(3840, photo.size[0]), f"{stem}-full.webp")
    names.append(stem)

# The emblem SVG is a picture plus a luminance mask (white = emblem), both embedded as PNGs, in that order: mask first.
svg = open(os.path.join(SRC, "logo-emblem.svg"), encoding="utf-8").read()
mask_png, art_png = [base64.b64decode(b) for b in re.findall(r"base64,([A-Za-z0-9+/=]+)", svg)]
emblem = Image.open(io.BytesIO(art_png)).convert("RGB")
emblem.putalpha(Image.open(io.BytesIO(mask_png)).convert("L"))
emblem = emblem.crop(emblem.getbbox())
side = max(emblem.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(emblem, ((side - emblem.size[0]) // 2, (side - emblem.size[1]) // 2))
square.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, "emblem.webp"), "WEBP", quality=90, method=6)
report("emblem.webp")

print(f'data-slides="{" ".join(names)}"')
