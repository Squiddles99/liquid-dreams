"""Hair cards (spec §4.2) grown from the scalp in Python, and simple eyes. The strands are drawn by the game's shader."""
import math
import random

import bmesh
import bpy
from mathutils import Vector

DOWN = Vector((0, 0, -1))


def _unit(rng):
    return Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()


def _hug(p, centre, r_min, r_max):
    """Keep a strand point between r_min and r_max from the head's centre: on the scalp, never sticking out."""
    q = p - centre
    return centre + q.normalized() * min(max(q.length, r_min), r_max)


def _is_scalp(co, centre, eye_z):
    # The face is toward -Y in Blender. The hairline sits well above the brow at the front, above the ears at the
    # sides, and down to the nape at the back.
    if co.y < centre.y - 0.02:
        return co.z > eye_z + 0.065
    if co.y > centre.y + 0.015:
        return co.z > eye_z - 0.05
    return co.z > eye_z + 0.025


def _short(root, n, centre, crown, rng):
    """Short, wet and messy: combed away from the crown and down, lying on the scalp in loose clumps."""
    length = rng.uniform(0.04, 0.08)
    noise = _unit(rng)
    r_min = (root - centre).length + 0.003
    pts = [root + n * 0.002]
    for _ in range(5):
        p = pts[-1]
        out = (p - centre).normalized()
        comb = p - crown
        comb = (comb - out * comb.dot(out)).normalized() if comb.length > 1e-6 else noise
        d = comb * 0.6 + DOWN * 0.3 + noise * 0.25
        d = (d - out * d.dot(out) * 0.8).normalized()
        pts.append(_hug(p + d * (length / 5), centre, r_min, r_min + 0.012))
    return pts


def _to_tie(root, n, centre, tie):
    r_min, pts = (root - centre).length + 0.004, [root + n * 0.002]
    for _ in range(12):
        to = tie - pts[-1]
        if to.length < 0.012:
            break
        d = (to.normalized() * 0.8 + n * 0.2).normalized()
        pts.append(_hug(pts[-1] + d * min(0.03, to.length), centre, r_min, r_min + 0.006))
    if len(pts) < 3:
        pts.append(tie.copy())
    return pts


def _pony(tie, rng):
    d = (Vector((0, 0.35, -1)) + _unit(rng) * 0.1).normalized()
    length, pts = rng.uniform(0.22, 0.32), [tie + _unit(rng) * 0.01]
    for _ in range(6):
        d = (d + Vector((0, 0, -0.15))).normalized()
        pts.append(pts[-1] + d * (length / 6))
    return pts


def _curl(root, n, centre, eye_z, rng):
    """One springy lock: a loose spiral out from the scalp (7–11 cm), shorter over the forehead so it stops above the
    glasses. The radius opens from the root, and nothing dips inside the scalp."""
    fringe = root.y < centre.y - 0.02 and root.z < eye_z + 0.11
    length = rng.uniform(0.035, 0.055) if fringe else rng.uniform(0.07, 0.11)
    radius, pitch, phase = rng.uniform(0.005, 0.011), rng.uniform(0.012, 0.02), rng.uniform(0, 2 * math.pi)
    noise = _unit(rng)
    d = (n * (0.35 if fringe else 0.75) + DOWN * (0.65 if fringe else 0.25) + noise * 0.25).normalized()
    e1 = d.orthogonal().normalized()
    e2 = d.cross(e1)
    r_min = (root - centre).length + 0.002
    pts = []
    for i in range(10):
        s = length * i / 9
        th = phase + 2 * math.pi * s / pitch
        p = root + n * 0.002 + d * s + (e1 * math.cos(th) + e2 * math.sin(th)) * radius * min(1.0, i / 2)
        q = p - centre
        if q.length < r_min:
            p = centre + q.normalized() * r_min
        if p.y < centre.y - 0.03 and p.z < eye_z + 0.02:  # in front of the face: stay above the glasses
            p.z = eye_z + 0.02
        pts.append(p)
    return pts


def _frizz(base, centre, rng):
    """A short fine wisp off a lock's outer part: breaks the outline so the mop isn't a helmet."""
    d = ((base - centre).normalized() + _unit(rng) * 0.6).normalized()
    length = rng.uniform(0.015, 0.03)
    return [base, base + d * length * 0.5, base + d * length]


def _cards_object(cards, centre, rig, name):
    verts, faces, uvs = [], [], []
    for pts, width in cards:
        k, base = len(pts) - 1, len(verts)
        for i, p in enumerate(pts):
            tangent = (pts[min(i + 1, k)] - pts[max(i - 1, 0)]).normalized()
            side = tangent.cross((p - centre).normalized())
            side = side.normalized() if side.length > 1e-6 else tangent.orthogonal().normalized()
            half = width * 0.5 * (1 - 0.5 * i / k)
            verts += [p - side * half, p + side * half]
            uvs += [(0.0, i / k), (1.0, i / k)]
        for i in range(k):
            a = base + 2 * i
            faces.append((a, a + 2, a + 3, a + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(verts)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def build(body, rig, style, L, coords, name):
    rng = random.Random(style["seed"])
    centre, eye_z = L["head_centre"], L["eye_z"]
    scalp = [v for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and _is_scalp(v.co, centre, eye_z)]
    if len(scalp) < 50:
        raise SystemExit(f"only {len(scalp)} scalp vertices found; check the head landmarks")

    def pick():
        v = rng.choice(scalp)
        return v.co + _unit(rng) * 0.003, v.normal.copy()

    cards = []
    if style["style"] == "short":
        crown = centre + Vector((0, L["head_radius"] * 0.35, L["head_radius"] * 0.9))
        for _ in range(900):
            root, n = pick()
            cards.append((_short(root, n, centre, crown, rng), 0.02))
    elif style["style"] == "ponytail":
        tie = centre + Vector((0, L["head_radius"] * 0.95, -0.01))
        for _ in range(1000):
            root, n = pick()
            cards.append((_to_tie(root, n, centre, tie), 0.03))
        for _ in range(110):
            cards.append((_pony(tie, rng), 0.036))
    elif style["style"] == "curly":
        locks = []
        for _ in range(650):
            root, n = pick()
            locks.append(_curl(root, n, centre, eye_z, rng))
            cards.append((locks[-1], rng.uniform(0.014, 0.018)))
        for _ in range(300):
            lock = rng.choice(locks)
            cards.append((_frizz(lock[rng.randint(5, 9)], centre, rng), 0.006))
    else:
        raise SystemExit(f"unknown hair style {style['style']}")
    return _cards_object(cards, centre, rig, f"{name}_hair")


def eyes(rig, L, name):
    bm = bmesh.new()
    for side, fallback in (("l", 1), ("r", -1)):
        c = L["eyes"].get(side) or (L["head_centre"] + Vector((0.032 * fallback, -0.085, L["eye_z"] - L["head_centre"].z)))
        geom = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.0115)
        bmesh.ops.translate(bm, verts=geom["verts"], vec=c)
    me = bpy.data.meshes.new(f"{name}_eyes")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_eyes", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj
