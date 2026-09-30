"""The face's morph targets (closeup spec §4.1): MPFB's CC0 expression units, plus a breathing morph of our own.

The units load as shape keys on the baked base mesh (before the helpers go), and their deltas ride the build as vertex
attributes `xp_<name>`: deleting the helpers, scaling to height and decimating all carry vertex attributes, where they
would drop shape keys. After decimation they become shape keys again, in MORPHS order, and export as glTF morph targets.
Blender axes: +x the character's left, -y the front, +z up.
"""
import os

import bpy
from mathutils import Vector

import mpfb_bridge

# The glb's morph names (src/surfer/idleLife.ts FACE_CHANNELS, in order) → MPFB expression units summed into each.
UNITS = {
    "blinkL": ["eye-left-closure"],
    "blinkR": ["eye-right-closure"],
    "jawOpen": ["mouth-open"],
    "smile": ["mouth-corner-puller"],
    "browsUp": ["eyebrows-left-up", "eyebrows-right-up"],
    "browsInner": ["eyebrows-left-inner-up", "eyebrows-right-inner-up"],
    "squint": ["eye-left-slit", "eye-right-slit"],
    "nostrils": ["nose-left-dilatation", "nose-right-dilatation"],
}
MORPHS = [*UNITS, "breathe"]
PREFIX = "xp_"


def _units_dir():
    return os.path.join(os.path.dirname(mpfb_bridge.module().__file__), "data", "targets", "expression", "units", "caucasian")


def _attr(body, name):
    a = body.data.attributes.get(PREFIX + name)
    return a if a is not None else body.data.attributes.new(PREFIX + name, "FLOAT_VECTOR", "POINT")


def load(body):
    """Each morph's deltas as a vertex attribute, in the space the mesh will have once its transform is applied."""
    _, TargetService = mpfb_bridge._services()
    rot = body.matrix_world.to_3x3()
    if body.data.shape_keys:
        raise SystemExit("bake the body's shape keys before loading the expressions")
    n = len(body.data.vertices)
    rest = [0.0] * (3 * n)
    body.data.vertices.foreach_get("co", rest)
    for morph, units in UNITS.items():
        for unit in units:
            path = os.path.join(_units_dir(), unit + ".target.gz")
            if not os.path.exists(path):
                raise SystemExit(f"MPFB has no expression unit '{unit}' ({path})")
            TargetService.load_target(body, path, weight=1.0, name=unit)
    keys = body.data.shape_keys.key_blocks
    for morph, units in UNITS.items():
        attr = _attr(body, morph)
        for i in range(n):
            base = Vector(rest[3 * i:3 * i + 3])
            d = Vector()
            for unit in units:
                d += keys[unit].data[i].co - base
            attr.data[i].vector = rot @ d
    body.active_shape_key_index = 0
    body.shape_key_clear()
    # Removing the keys leaves the mesh wherever the last key's mix put it (the lids half shut): back to the rest shape.
    body.data.vertices.foreach_set("co", rest)
    body.data.update()


def scale(body, f):
    for morph in MORPHS:
        a = body.data.attributes.get(PREFIX + morph)
        if a is not None:
            for e in a.data:
                e.vector = e.vector * f


def breathe(body, weights):
    """The chest and upper belly out along their normals (6 mm at most), the collarbones up 2 mm; nothing past the
    arms, the neck or the pelvis. `weights`: bodymap.bone_weights rows (contract names without _l/_r)."""
    attr = _attr(body, "breathe")
    for v, row in zip(body.data.vertices, weights):
        w = {b: 0.0 for b in ("spine_01", "spine_02", "spine_03", "clavicle", "upperarm", "neck", "head", "pelvis")}
        for b, _, x in row:
            if b in w:
                w[b] += x
        chest = w["spine_03"] + 0.8 * w["spine_02"] + 0.35 * w["spine_01"]
        chest *= max(0.0, 1.0 - 2.0 * (w["upperarm"] + w["neck"] + w["head"] + w["pelvis"]))
        front = max(0.0, -v.normal.y)
        out = v.normal * (0.006 * chest * (0.25 + 0.75 * front))
        lift = Vector((0, 0, 0.002 * w["clavicle"] * (1.0 - w["neck"] - w["upperarm"])))
        attr.data[v.index].vector = out + lift


def to_shape_keys(body):
    """The `xp_*` attributes back to shape keys, in MORPHS order, and the attributes dropped."""
    missing = [m for m in MORPHS if body.data.attributes.get(PREFIX + m) is None]
    if missing:
        raise SystemExit(f"morph attributes lost in the build: {missing}")
    basis = body.shape_key_add(name="Basis", from_mix=False)
    for morph in MORPHS:
        a = body.data.attributes[PREFIX + morph]
        deltas = [e.vector.copy() for e in a.data]
        key = body.shape_key_add(name=morph, from_mix=False)
        key.value = 0.0  # the glb's default weight: off at rest
        for i, d in enumerate(deltas):
            key.data[i].co = basis.data[i].co + d
    for morph in MORPHS:
        body.data.attributes.remove(body.data.attributes[PREFIX + morph])
    body.data.shape_keys.use_relative = True


def max_delta(body, morph):
    a = body.data.attributes.get(PREFIX + morph)
    return max((e.vector.length for e in a.data), default=0.0) if a is not None else 0.0


def blink_check(body, L):
    """With both blinks at 1, rays at each eye from in front (a grid across the opening) must meet the closed lid's skin
    before the eyeball; with them at 0, rays at the pupil must reach the eyeball. The lashes don't count as cover."""
    from mathutils.bvhtree import BVHTree
    keys = body.data.shape_keys.key_blocks

    def skin_tree():
        deps = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(deps)
        me = ev.to_mesh()
        verts = [v.co.copy() for v in me.vertices]
        polys = [list(p.vertices) for p in me.polygons if p.material_index == 0]
        ev.to_mesh_clear()
        return BVHTree.FromPolygons(verts, polys)

    r = L.get("eye_radius", 0.012)

    def front_of_ball(c, dx, dz):
        return c.y - (max(r * r - dx * dx - dz * dz, 0.0)) ** 0.5

    def lid_first(tree, c, dx, dz):
        o = Vector((c.x + dx, c.y - 0.06, c.z + dz))
        hit, _, _, _ = tree.ray_cast(o, Vector((0, 1, 0)), 0.1)
        return hit is not None and hit.y < front_of_ball(c, dx, dz) - 0.0002

    eyes = [c for c in L["eyes"].values() if c is not None]
    for k in ("blinkL", "blinkR"):
        keys[k].value = 1.0
    closed = skin_tree()
    grid = [(dx * r, dz * r) for dx in (-0.55, -0.3, 0, 0.3, 0.55) for dz in (-0.35, 0, 0.35)]
    missed = [(round(dx / r, 2), round(dz / r, 2)) for c in eyes for dx, dz in grid if not lid_first(closed, c, dx, dz)]
    if missed:
        print(f"blink check: eye radius {r * 1000:.1f} mm; rays not covered (in radii): {missed}")
    covers = not missed
    for k in ("blinkL", "blinkR"):
        keys[k].value = 0.0
    opened = skin_tree()
    open_ = all(not lid_first(opened, c, dx, dz) for c in eyes for dx, dz in ((0, 0), (0.15 * r, 0), (-0.15 * r, 0)))
    return {"blinkCovers": covers, "eyesOpen": open_}
