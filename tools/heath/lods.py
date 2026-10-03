"""L1 (dune-up-close spec §4.2): the main branches and leaf-cluster cards, within 800 triangles, from L0's skeleton and
its leaves' places."""
import math
import random

from mathutils import Vector

import grow
import leaves


def kmeans(points, k, rng, iters=12):
    """Lloyd's k-means: the clusters' centres and each point's cluster."""
    if len(points) <= k:
        return list(points), list(range(len(points)))
    centres = [p.copy() for p in rng.sample(points, k)]
    owner = [0] * len(points)
    for _ in range(iters):
        for i, p in enumerate(points):
            owner[i] = min(range(k), key=lambda c: (p - centres[c]).length_squared)
        sums = [Vector() for _ in range(k)]
        counts = [0] * k
        for i, p in enumerate(points):
            sums[owner[i]] += p
            counts[owner[i]] += 1
        centres = [sums[c] / counts[c] if counts[c] else centres[c] for c in range(k)]
    return centres, owner


def l1(bm, sk, scale, uv, col, kind, bases, uv_of_card, bark_uv, rng, cap=800, flat=False):
    """The thick wood (chains thicker than a threshold that keeps it under half the cap), then crossed cards over the
    leaf clusters (flat cards on the ground for a mat) with what's left. Returns the made tube verts and the cards'
    vertex normals (for the custom normals)."""
    min_r, made = 0.006, []
    while True:
        trial = []
        count = 0
        for line in grow.chains(sk):
            keep = [i for i in line if sk.radius[i] >= min_r]
            if len(keep) >= 2:
                sides = 6 if sk.radius[keep[0]] > 4 * min(sk.radius) else 3
                count += (len(keep) - 1) * sides * 2
        if count <= cap // 2 or min_r > 0.05:
            break
        min_r *= 1.3
    made = grow.tubes(bm, sk, scale, uv, col, min_radius=min_r, uv_of=bark_uv)
    wood = sum(len(f.verts) - 2 for f in bm.faces)
    normals = []
    if not bases:
        return made, normals
    per = 4
    k = max(1, min(len(bases), (cap - wood - 8) // per))
    centres, owner = kmeans(bases, k, rng)
    crown = Vector((0, 0, 0.55))
    for c, centre in enumerate(centres):
        members = [bases[i] for i in range(len(bases)) if owner[i] == c]
        if not members:
            continue
        r = max(0.06, max((m - centre).length for m in members) + 0.05)
        tile = rng.randrange(4)
        if flat:
            # A mat (pigface): short crossed upright cards over its stems (lying flat they vanished edge-on at 25 m).
            yaw = rng.uniform(0, math.pi)
            u1, u2 = Vector((math.cos(yaw), math.sin(yaw), 0)), Vector((-math.sin(yaw), math.cos(yaw), 0))
            h = min(r, 0.06)
            up = Vector((0, 0, h))
            quads = [(centre + up, u1 * r, up), (centre + up, u2 * r, up)]
        else:
            yaw = rng.uniform(0, math.pi)
            u1, u2 = Vector((math.cos(yaw), math.sin(yaw), 0)), Vector((-math.sin(yaw), math.cos(yaw), 0))
            up = Vector((0, 0, 1))
            quads = [(centre, u1 * r, up * r), (centre, u2 * r, up * r)]
        for o, a, b in quads:
            corners = [o - a - b, o + a - b, o + a + b, o - a + b]
            tuv = [(0, 1), (1, 1), (1, 0), (0, 0)]
            tris = [((corners[0], tuv[0]), (corners[1], tuv[1]), (corners[2], tuv[2])),
                    ((corners[0], tuv[0]), (corners[2], tuv[2]), (corners[3], tuv[3]))]
            leaves.add_tris(bm, tris, uv, col, (1.0, 0.8, rng.random(), leaves.LEAF), scale, normals,
                            lambda uu, vv, t=tile: uv_of_card(t, uu, vv), bend_to=crown)
    return made, normals
