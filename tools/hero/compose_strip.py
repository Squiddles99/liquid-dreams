"""A sequence's rig keys laid out as Andrew's reference sheet (4 x 2), under his sheet, for comparing by eye.
py -3.11 tools/hero/compose_strip.py <ref sheet.png> <mannequin dir> <prefix e.g. female_pdl> <out.png> [crop x0,y0,x1,y1]
    [cols,rows,first]
The crop (fractions of each render) trims the empty studio around her so the frames match his framing; a 3 x 2 sheet
(the roundhouse's halves) takes "3,2,7" for its second half."""
import sys

from PIL import Image, ImageDraw

ref_path, mdir, prefix, out = sys.argv[1:5]
crop = [float(v) for v in sys.argv[5].split(",")] if len(sys.argv) > 5 else [0, 0, 1, 1]
ref = Image.open(ref_path).convert("RGB")
cols, rows, first = (int(v) for v in sys.argv[6].split(",")) if len(sys.argv) > 6 else (4, 2, 1)
W = ref.width
cw, ch = W // cols, ref.height // rows
sheet = Image.new("RGB", (W, ref.height * 2 + 10), "white")
sheet.paste(ref, (0, 0))
for k in range(cols * rows):
    im = Image.open(f"{mdir}/{prefix}{k + first}.png").convert("RGB")
    x0, y0, x1, y1 = (int(crop[0] * im.width), int(crop[1] * im.height), int(crop[2] * im.width), int(crop[3] * im.height))
    im = im.crop((x0, y0, x1, y1)).resize((cw - 4, ch - 4))
    x, y = (k % cols) * cw, ref.height + 10 + (k // cols) * ch
    sheet.paste(im, (x + 2, y + 2))
    ImageDraw.Draw(sheet).text((x + 14, y + 10), str(k + first), fill=(255, 255, 255))
sheet.save(out)
