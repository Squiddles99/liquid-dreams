"""Grommet's pimples (grommet spec §5): seeded spots on the forehead, chin and beside the nose, written to the manifest
for the game's skin shader. Blender axes: +x the character's left, -y the front, +z up."""
import random


def pimples(body, coords, L, seed):
    rng = random.Random(seed)
    eye_z, mouth = L["eye_z"], L["mouth"]
    front_y = min(p.y for p in L["eyes"].values() if p is not None)
    lash = body.data.attributes.get("lash")
    head = [v for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and v.co.y < front_y + 0.01 and v.normal.y < -0.4
            and (lash is None or lash.data[v.index].value <= 0)]
    zones = [
        (3, lambda c: eye_z + 0.025 < c.z < eye_z + 0.06 and abs(c.x) < 0.035),                              # forehead
        (2, lambda c: mouth.z - 0.04 < c.z < mouth.z - 0.015 and abs(c.x) < 0.02),                             # chin
        (1, lambda c: eye_z - 0.04 < c.z < eye_z - 0.02 and 0.012 < abs(c.x) < 0.02),                          # beside the nose
        (2, lambda c: eye_z - 0.035 < c.z < eye_z - 0.01 and 0.025 < abs(c.x) < 0.045),                        # cheeks
    ]
    out = []
    for n, inside in zones:
        pool = [v for v in head if inside(v.co)]
        if len(pool) < n:
            raise SystemExit(f"only {len(pool)} face vertices in a pimple zone; check the landmarks")
        for v in rng.sample(pool, n):
            out.append((v.co + v.normal * 0.0005, rng.uniform(0.0015, 0.0025)))
    return out


def bake_ao(body, others=(), reach=0.035, rays=14, seed=3):
    """Cavity occlusion per skin vertex (closeup spec §4.2), returned for face.paint to pack into COLOR_0.r beside the
    scalp mask (WebGPU allows 8 vertex buffers and the body already uses 8): rays over the hemisphere around the
    normal, against the skin (not the lashes) and `others` (the eyeballs). The eye sockets, under the nose, the lips'
    corners, the ears and the folds shade softly; 1 open … 0 buried."""
    import math

    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    rng = random.Random(seed)
    verts = [v.co.copy() for v in body.data.vertices]
    polys = [list(p.vertices) for p in body.data.polygons if p.material_index == 0]
    for o in others:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[i + base for i in p.vertices] for p in o.data.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    dirs = []
    for i in range(rays):  # a cosine-weighted spiral over the hemisphere
        t = (i + 0.5) / rays
        r, phi = math.sqrt(t), i * 2.399963 + rng.uniform(0, 0.2)
        dirs.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(1 - t)))
    ao = [1.0] * len(body.data.vertices)
    lash = body.data.attributes.get("lash")
    for v in body.data.vertices:
        if lash is not None and lash.data[v.index].value > 0:
            continue
        n = v.normal
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        hits = 0
        for x, y, z in dirs:
            d = t1 * x + t2 * y + n * z
            hit, _, _, dist = tree.ray_cast(v.co + n * 0.0008, d, reach)
            if hit is not None:
                hits += 1.0 - dist / reach * 0.5
        ao[v.index] = max(0.0, 1.0 - hits / rays)
    return ao
