"""Gate 1a sheets (hero spec §3.5): the painting beside the clay, before and after the fit, in the painting's frame.

py -3.11 tools/hero/compose_gate.py <ref.json> <gate dir> <out dir>

Face: each clay front render aligned to the painting by its eye centres (a similarity: scale, roll, offset), so the
rest of the face shows the likeness honestly. Body: aligned by height (crown to soles) and centre. Writes
gate1a-face.jpg, gate1a-body.jpg and gate1a-views.jpg (3/4, side, back of the fitted head and body).
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ref_path, gate, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
ref = json.load(open(ref_path))
marks = ref["marks"]
paint = Image.open(ref["image"]).convert("RGBA")
bg = Image.new("RGBA", paint.size, (66, 66, 68, 255))
bg.alpha_composite(paint)
paint = bg.convert("RGB")
font = ImageFont.load_default(28)


def model_to_px(c, shot, x, z):
    k = c[shot]
    return (x - k["cx"]) * k["ppm"] + k["w"] / 2, (k["cz"] - z) * k["ppm"] + k["h"] / 2


def similarity(a0, a1, b0, b1):
    """The similarity taking points a0, a1 (render px) to b0, b1 (painting px), as an inverse affine for PIL."""
    ax, ay = a1[0] - a0[0], a1[1] - a0[1]
    bx, by = b1[0] - b0[0], b1[1] - b0[1]
    s = math.hypot(bx, by) / math.hypot(ax, ay)
    th = math.atan2(by, bx) - math.atan2(ay, ax)
    # Inverse: painting → render.
    cs, sn = math.cos(-th) / s, math.sin(-th) / s
    # render = R⁻¹(p − b0)/s + a0
    return (cs, -sn, a0[0] - cs * b0[0] + sn * b0[1], sn, cs, a0[1] - sn * b0[0] - cs * b0[1])


def aligned(tag, shot, box, eyes_or_height):
    c = json.load(open(os.path.join(gate, f"{tag}_cam.json")))
    im = Image.open(os.path.join(gate, f"{tag}_{shot}.png")).convert("RGB")
    m = c["model"]
    if eyes_or_height == "eyes":
        a0 = model_to_px(c, shot, m["eyes"]["R"][0], m["eyes"]["R"][2])
        a1 = model_to_px(c, shot, m["eyes"]["L"][0], m["eyes"]["L"][2])
        b0, b1 = marks["iris_R"][:2], marks["iris_L"][:2]
    else:
        a0 = model_to_px(c, shot, 0.0, m["zmax"])
        a1 = model_to_px(c, shot, 0.0, m["zmin"])
        b0, b1 = (2975.0, 90.0), (2975.0, 3225.0)
    T = similarity(a0, a1, b0, b1)
    if eyes_or_height == "eyes" and tag == "after" and os.path.exists(REPORT):
        T = fit_frame(c, shot, json.load(open(REPORT))["camFace"])
    full = im.transform(paint.size, Image.AFFINE, T, Image.BICUBIC, fillcolor=(66, 66, 68))
    return full.crop(box)


REPORT = os.path.join(os.path.dirname(gate.rstrip("/\\")), "fit_report.json")


def fit_frame(c, shot, cf):
    """The fit's own face camera (model → painting), composed with the render's pixel mapping, inverted for PIL."""
    import numpy as np
    k = c[shot]
    s, tx, ty, th = cf
    # render px → model (x, z): x = (u − w/2)/ppm, z = cz − (v − h/2)/ppm; model → painting: the fit's camera.
    R = np.array([[1 / k["ppm"], 0, -k["w"] / 2 / k["ppm"]], [0, -1 / k["ppm"], k["cz"] + k["h"] / 2 / k["ppm"]], [0, 0, 1]])
    C = np.array([[s * math.cos(th), -s * math.sin(th), tx], [-s * math.sin(th), -s * math.cos(th), ty], [0, 0, 1]])
    inv = np.linalg.inv(C @ R)
    return tuple(inv[:2].reshape(-1))


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, im.width, 40], fill=(20, 20, 20))
    d.text((12, 6), text, fill=(240, 230, 210), font=font)
    return im


def marks_on(im, box, pts):
    d = ImageDraw.Draw(im)
    sx = im.width / (box[2] - box[0])
    for n, (x, y, w) in pts.items():
        X, Y = (x - box[0]) * sx, (y - box[1]) * sx
        d.ellipse([X - 4, Y - 4, X + 4, Y + 4], outline=(60, 255, 120), width=2)
    return im


def sheet(name, box, mode, shots, scale, with_marks):
    tiles = [label(marks_on(paint.crop(box).resize((int((box[2] - box[0]) * scale), int((box[3] - box[1]) * scale))), box, marks) if with_marks else
                   paint.crop(box).resize((int((box[2] - box[0]) * scale), int((box[3] - box[1]) * scale))), "painting")]
    for tag, shot, text in shots:
        t = aligned(tag, shot, box, mode).resize(tiles[0].size)
        if with_marks:
            marks_on(t, box, marks)
        tiles.append(label(t, text))
    # A 50/50 blend of the painting and the fitted clay, to read the overlap at a glance.
    last = aligned(*shots[-1][:2], box, mode).resize(tiles[0].size)
    tiles.append(label(Image.blend(paint.crop(box).resize(tiles[0].size), last, 0.5), "blend: painting + fitted"))
    W = sum(t.width for t in tiles)
    out_im = Image.new("RGB", (W, tiles[0].height), (30, 30, 30))
    x = 0
    for t in tiles:
        out_im.paste(t, (x, 0))
        x += t.width
    out_im.save(os.path.join(out, name), quality=88)


sheet("gate1a-face.jpg", (2790, 190, 3170, 640), "eyes",
      [("before", "head_front_smile", "before (current game face)"), ("after", "head_front_smile", "fitted (smile as painted)")], 2.0, True)
sheet("gate1a-face-rest.jpg", (2790, 190, 3170, 640), "eyes",
      [("before", "head_front_rest", "before, rest face"), ("after", "head_front_rest", "fitted, rest face")], 2.0, False)
sheet("gate1a-body.jpg", (2420, 40, 3530, 3290), "height",
      [("before", "body_front_rest", "before"), ("after", "body_front_rest", "fitted")], 0.42, False)

views = [Image.open(os.path.join(gate, f"after_{v}.png")).convert("RGB") for v in ("head_35", "head_90", "head_180")]
bodies = [Image.open(os.path.join(gate, f"after_{v}.png")).convert("RGB").resize((500, 1000)) for v in ("body_35", "body_90", "body_180")]
vs = Image.new("RGB", (3000 + 1500, 1000), (30, 30, 30))
for i, v in enumerate(views):
    vs.paste(v, (i * 1000, 0))
for i, b in enumerate(bodies):
    vs.paste(b, (3000 + i * 500, 0))
label(vs, "fitted: head 3/4, side, back | body 3/4, side, back (profile and back are MPFB's prior: the painting is front only)")
vs.save(os.path.join(out, "gate1a-views.jpg"), quality=86)
