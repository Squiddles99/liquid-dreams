"""The near scatter's ground items (dune-up-close spec §4.4), in metres: fallen twigs, fallen-leaf clumps, shell fragments,
loose limestone stones. Andrew: the place is pristine — no rubbish; these are the heath's own debris."""
import math
import random

from mathutils import Vector

import grow
import leaves

ITEM_VARIANTS = {"item_twig": 6, "item_leaves_daisy": 4, "item_leaves_tall": 4, "item_shell": 6, "item_stone": 6}


def twig(bm, uv, col, rng, uv_of):
    """A fallen twig: a small branching skeleton laid flat, 10–40 cm, grey dead wood."""
    sp = {"stems": 1, "attractors": 60, "iterations": 10, "step": 0.12, "kill": 0.14, "reach": 0.6, "twig_r": 0.003,
          "max_r": 0.008, "all_dead": True, "flat": True, "tropism": 0.0}
    length = rng.uniform(0.1, 0.4)
    disc = ([Vector((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.0)) for a in [k * math.pi / 8 for k in range(16)]] +
            [Vector((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.3)) for a in [k * math.pi / 8 for k in range(16)]])
    tris = [(k, (k + 1) % 16, 16 + k) for k in range(16)] + [((k + 1) % 16, 16 + (k + 1) % 16, 16 + k) for k in range(16)]
    tris += [(0, k, k + 1) for k in range(1, 15)] + [(16, 16 + k + 1, 16 + k) for k in range(1, 15)]
    sk = grow.skeleton((disc, tris), sp, rng.randrange(1 << 16))
    # The skeleton grows in a unit disc: scale it to the twig's length, lying on the ground (radii are already metres).
    for n in sk.nodes:
        n.x, n.y, n.z = n.x * length / 2, n.y * length / 2, 0.004
    return grow.tubes(bm, sk, Vector((1, 1, 1)), uv, col, uv_of=lambda dead, u, v: uv_of("deadBark", u, v))


def leaf_clump(bm, uv, col, rng, uv_of, name):
    """A clump of fallen leaves (12–25 cm across): one card lying flat, the atlas's dry-leaf tile."""
    r = rng.uniform(0.06, 0.125)
    tilt = Vector((rng.uniform(-0.15, 0.15), rng.uniform(-0.15, 0.15), 1)).normalized()
    u = tilt.orthogonal().normalized()
    v = tilt.cross(u)
    c = Vector((0, 0, 0.003))
    corners = [c - u * r - v * r, c + u * r - v * r, c + u * r + v * r, c - u * r + v * r]
    tuv = [(0, 1), (1, 1), (1, 0), (0, 0)]
    tris = [((corners[0], tuv[0]), (corners[1], tuv[1]), (corners[2], tuv[2])), ((corners[0], tuv[0]), (corners[2], tuv[2]), (corners[3], tuv[3]))]
    normals = []
    leaves.add_tris(bm, tris, uv, col, (1.0, 0.0, 0.0, leaves.WOOD), Vector((1, 1, 1)), normals, lambda a, b: uv_of(name, a, b))
    return normals


def shell(bm, uv, col, rng, uv_of):
    """A shell fragment: a ridged half-ellipsoid, 1–4 cm."""
    size = rng.uniform(0.01, 0.04)
    ridges, rings = rng.randint(5, 9), 3
    normals = []
    pts = {}
    for i in range(rings + 1):
        for k in range(ridges * 2 + 1):
            a = math.pi * k / (ridges * 2)
            t = i / rings
            rr = size * (1 - t * 0.9) * (1 + 0.08 * (k % 2))
            pts[(i, k)] = Vector((math.cos(a) * rr, math.sin(a) * rr * 0.8, size * 0.35 * math.sin(t * math.pi / 2)))
    tris = []
    for i in range(rings):
        for k in range(ridges * 2):
            a, b, c, d = pts[(i, k)], pts[(i, k + 1)], pts[(i + 1, k + 1)], pts[(i + 1, k)]
            tris += [((a, (0.5, 0.5)), (b, (0.5, 0.5)), (c, (0.5, 0.5))), ((a, (0.5, 0.5)), (c, (0.5, 0.5)), (d, (0.5, 0.5)))]
    leaves.add_tris(bm, tris, uv, col, (1.0, 0.0, 0.0, leaves.WOOD), Vector((1, 1, 1)), normals, lambda a, b: uv_of("misc_2", a, b))
    return normals


def stone(bm, uv, col, rng, uv_of):
    """A loose limestone stone, 3–20 cm: an icosphere pitted and flattened (as the rocks are), the stone tile."""
    import bmesh
    size = rng.uniform(0.015, 0.1)
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=1.0)
    seed = rng.random() * 100
    tris = []
    for f in tmp.faces:
        vs = []
        for vert in f.verts:
            p = vert.co
            n = math.sin(p.x * 3.1 + seed) * math.cos(p.y * 2.7 - seed) * math.sin(p.z * 3.7 + seed * 0.5)
            r = 1 + 0.18 * n - 0.06 * abs(math.sin(p.x * 9 + p.y * 7 + seed))
            q = Vector((p.x * r * size, p.y * r * size * rng.uniform(0.9, 1.0), max(-0.3, p.z * r * 0.6) * size))
            vs.append((q + Vector((0, 0, 0.3 * size * 0.6)), (0.5 + p.x * 0.45, 0.5 + p.y * 0.45)))
        tris.append(tuple(vs))
    tmp.free()
    normals = []
    leaves.add_tris(bm, tris, uv, col, (1.0, 0.0, 0.0, leaves.WOOD), Vector((1, 1, 1)), normals, lambda a, b: uv_of("misc_3", a, b))
    # Smooth: each vertex's normal out from the stone's middle (face normals read as a faceted icosphere).
    centre = Vector((0, 0, 0.3 * size * 0.6))
    pts = [p for tri in tris for p, _ in tri]
    return [(p - centre).normalized() if (p - centre).length > 1e-9 else Vector((0, 0, 1)) for p in pts]
