"""Gate 1b sheets (hero spec §11): the painting beside the Cycles renders. py -3.11 tools/hero/compose_gate1b.py <renders dir> <out dir>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

rd, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
font = ImageFont.load_default(26)
p = Image.open("art/riders/female/bikini.png").convert("RGBA")
bg = Image.new("RGBA", p.size, (20, 20, 24, 255))
bg.alpha_composite(p)
paint = bg.convert("RGB")


def label(im, t):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 36], fill=(12, 12, 14))
    d.text((10, 4), t, fill=(240, 228, 205), font=font)
    return im


def row(tiles, name):
    W = sum(t.width for t in tiles)
    s = Image.new("RGB", (W, tiles[0].height), (20, 20, 24))
    x = 0
    for t in tiles:
        s.paste(t, (x, 0))
        x += t.width
    s.save(os.path.join(out, name), quality=86)


H = 1100
body = paint.crop((2420, 40, 3530, 3290))
tiles = [label(body.resize((body.width * H // body.height, H)), "painting")]
for v, t in (("front", "front (painted smile)"), ("q3", "3/4"), ("side", "side"), ("back", "back")):
    im = Image.open(os.path.join(rd, f"female_{v}.png")).convert("RGB")
    tiles.append(label(im.resize((im.width * H // im.height, H)), t))
row(tiles, "gate1b-body.jpg")
H = 900
face = paint.crop((2790, 170, 3170, 645))
tiles = [label(face.resize((face.width * H // face.height, H)), "painting")]
for v, t in (("face_smile", "painted smile"), ("face", "rest face"), ("face_q3", "3/4, rest")):
    im = Image.open(os.path.join(rd, f"female_{v}.png")).convert("RGB")
    tiles.append(label(im.resize((im.width * H // im.height, H)), t))
row(tiles, "gate1b-face.jpg")
