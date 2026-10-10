# tools/tileSheet.py: a contact sheet of the Library's 66 tiles (library spec §5), for Andrew's eye.
# Usage: python tools/tileSheet.py  ->  docs/superpowers/evidence/library/tiles-sheet.png
import json, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
keys = sorted(k for k in json.load(open(os.path.join(ROOT, "art/loading/cards.json"), encoding="utf-8")) if not k.startswith("_"))
W, H, LABEL, COLS = 240, 180, 22, 11
rows = (len(keys) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * W, rows * (H + LABEL)), (11, 42, 49))
draw = ImageDraw.Draw(sheet)
for i, k in enumerate(keys):
    x, y = (i % COLS) * W, (i // COLS) * (H + LABEL)
    sheet.paste(Image.open(os.path.join(ROOT, "public/loading", f"{k}-tile.webp")).resize((W, H)), (x, y))
    draw.text((x + 4, y + H + 4), k, fill=(246, 236, 214))
out = os.path.join(ROOT, "docs/superpowers/evidence/library/tiles-sheet.png")
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out)
print(out, len(keys), "tiles")
