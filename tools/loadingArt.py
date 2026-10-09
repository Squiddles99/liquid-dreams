"""Sizes the loading screen's art (art/loading/, Andrew's originals) into public/loading/, which the page loads.

  public/loading/<name>-1920.webp  each picture in art/loading/slides/ and art/loading/boot/ at 1920 px wide (1080p and
                                   smaller screens)
  public/loading/<name>-full.webp  the picture at its own width, capped at 3840 px (1440p and 4K)
  public/loading/emblem.webp       the spinning coin's face: the emblem alone, square, 1024 px, transparent outside

It then writes index.html itself: the boot picture (art/loading/boot/, one file: the crew surfing, shown only while the
game first loads) onto #ld-cover's data-boot, the slide names onto its data-slides (the later covers, paddling out and
back to the dune, pick one at random),
and art/loading/cards.json (each picture's fact card, keyed by its name) into the inline #ld-cards block.

Run with: python tools/loadingArt.py   (rerun whenever art/loading/ changes; the outputs are committed)
"""
import base64
import io
import json
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


def pictures(folder):
    names = []
    for file in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(file)
        if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        photo = Image.open(os.path.join(folder, file)).convert("RGB")
        save_photo(photo, min(1920, photo.size[0]), f"{stem}-1920.webp")
        save_photo(photo, min(3840, photo.size[0]), f"{stem}-full.webp")
        names.append(stem)
    return names


names = pictures(os.path.join(SRC, "slides"))
boot = pictures(os.path.join(SRC, "boot"))
assert len(boot) == 1, "art/loading/boot/ holds exactly one picture: the start-up one"


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

# The page: the slide list and the cards (only cards whose picture exists; a card naming a missing picture is reported).
cards = json.load(open(os.path.join(SRC, "cards.json"), encoding="utf-8"))
for k in sorted(set(cards) - set(names)):
    print(f"warning: cards.json has a card for '{k}' but art/loading/slides/ has no picture of that name")
shown = {k: cards[k] for k in names if k in cards}
page_path = os.path.join(ROOT, "index.html")
page = open(page_path, encoding="utf-8", newline="").read()  # keeps its CRLFs
page, n1 = re.subn(r'data-slides="[^"]*"', f'data-slides="{" ".join(names)}"', page, count=1)
page, n0 = re.subn(r'data-boot="[^"]*"', f'data-boot="{boot[0]}"', page, count=1)
blob = json.dumps(shown, ensure_ascii=False, separators=(",", ":")).replace("</", r"<\/")
page, n2 = re.subn(r'(<script type="application/json" id="ld-cards">).*?(</script>)', lambda m: m.group(1) + blob + m.group(2), page, count=1, flags=re.S)
assert n0 == 1 and n1 == 1 and n2 == 1, "index.html has lost #ld-cover's data-boot, data-slides or the #ld-cards block"
open(page_path, "w", encoding="utf-8", newline="").write(page)
print(f'index.html: boot {boot[0]}, {len(names)} slides, {len(shown)} with cards')
