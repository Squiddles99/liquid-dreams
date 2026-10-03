"""The near scatter's grasses and sedges (dune-up-close spec §4.4), from Andrew's flora photos 10–12: tufts of bent
blades, in metres (the scatter places them at their own size). L0: the blades; L1: crossed cards (atlas tiles)."""
import math
import random

from mathutils import Vector

# blades (lo, hi), height (lo, hi) m, blade width m, segments, droop, crossed strips (round stems), base radius m, colour,
# heads: (share of blades, colour) or None.
TUFTS = {
    "tuft_clubrush": {"blades": (60, 85), "height": (0.3, 0.75), "width": 0.003, "segs": 3, "droop": 0.08, "crossed": True,
                      "base_r": 0.07, "colour": (0.08, 0.12, 0.05), "heads": (0.22, (0.16, 0.09, 0.05))},
    "tuft_swordsedge": {"blades": (30, 46), "height": (0.5, 1.0), "width": 0.015, "segs": 5, "droop": 0.25, "crossed": False,
                        "base_r": 0.1, "colour": (0.11, 0.15, 0.07), "heads": (0.15, (0.18, 0.11, 0.06))},
    "tuft_tussock": {"blades": (100, 120), "height": (0.3, 0.7), "width": 0.0025, "segs": 3, "droop": 0.35, "crossed": False,
                     "base_r": 0.09, "colour": (0.16, 0.19, 0.15), "heads": None},
}
TUFT_VARIANTS = 4


def blade(add, base, length, width, lean, droop, segs, flutter, colour, crossed=False):
    """A bent strip up and out along `lean` (horizontal), drooping by `droop` at its tip, tapering to a point; `crossed`
    adds a second strip at 90° (club-rush's round stems). add(tris, colour, flags) takes ((point, (u, v)) × 3) lists."""
    pts = [base + lean * (k / segs * length * 0.6) + Vector((0, 0, length * (k / segs - droop * (k / segs) ** 2))) for k in range(segs + 1)]
    sides = [lean.cross(Vector((0, 0, 1))).normalized()] if lean.length > 1e-6 else [Vector((1, 0, 0))]
    if crossed:
        sides.append(lean.normalized() if lean.length > 1e-6 else Vector((0, 1, 0)))
    for side in sides:
        rows = [(p - side * width * (1 - k / segs) * 0.5, p + side * width * (1 - k / segs) * 0.5, k / segs) for k, p in enumerate(pts)]
        tris = []
        for (a0, a1, t0), (b0, b1, t1) in zip(rows, rows[1:]):
            tris.append(((a0, (0, 1 - t0)), (a1, (1, 1 - t0)), (b1, (1, 1 - t1))))
            tris.append(((a0, (0, 1 - t0)), (b1, (1, 1 - t1)), (b0, (0, 1 - t1))))
        add(tris, colour, (flutter, 0.5))
    return pts[-1]


def head(add, tip, size, colour):
    """A seed head: a small squashed octahedron at the tip (8 triangles)."""
    ax = [Vector((size, 0, 0)), Vector((0, size, 0)), Vector((-size, 0, 0)), Vector((0, -size, 0))]
    top, bot = tip + Vector((0, 0, size * 1.6)), tip - Vector((0, 0, size * 0.6))
    tris = []
    for k in range(4):
        a, b = tip + ax[k], tip + ax[(k + 1) % 4]
        tris += [((a, (0.5, 0.5)), (b, (0.5, 0.5)), (top, (0.5, 0.5))), ((b, (0.5, 0.5)), (a, (0.5, 0.5)), (bot, (0.5, 0.5)))]
    add(tris, colour, (0.0, 1.0))


def tuft(add, name, rng):
    sp = TUFTS[name]
    for _ in range(rng.randint(*sp["blades"])):
        a, r = rng.uniform(0, 2 * math.pi), sp["base_r"] * math.sqrt(rng.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        lean = Vector((math.cos(a), math.sin(a), 0)) * (0.15 + r / sp["base_r"] * 0.6)
        jitter = rng.uniform(0.85, 1.15)
        colour = tuple(min(1.0, c * jitter) for c in sp["colour"])
        if name == "tuft_tussock" and rng.random() < 0.3:
            colour = (0.3, 0.27, 0.17)  # the straw-coloured old blades (photo 12)
        tip = blade(add, base, rng.uniform(*sp["height"]), sp["width"], lean, sp["droop"] * rng.uniform(0.5, 1.5), sp["segs"],
                    rng.random(), colour, sp["crossed"])
        if sp["heads"] and rng.random() < sp["heads"][0]:
            head(add, tip, 0.008 if name == "tuft_clubrush" else 0.012, sp["heads"][1])
