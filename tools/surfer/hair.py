"""Hair cards (spec §4.2) grown from the scalp in Python, and simple eyes. The strands are drawn by the game's shader."""
import math
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

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
    # Wet and slicked: within 1.5–3 mm of the scalp (farther stood the cards off it in a ledge at the hairline).
    r_min, pts = (root - centre).length + 0.0015, [root + n * 0.001]
    for _ in range(12):
        to = tie - pts[-1]
        if to.length < 0.012:
            break
        d = (to.normalized() * 0.8 + n * 0.2).normalized()
        pts.append(_hug(pts[-1] + d * min(0.03, to.length), centre, r_min, r_min + 0.0035))
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
    """One springy lock: a loose spiral out from the scalp (6–9 cm), shorter over the forehead so it stops above the
    glasses. 1.3–3 turns sampled 16 times (too few points per turn drew zig-zag shards, not curls); the radius opens
    from the root, and nothing dips inside the scalp."""
    fringe = root.y < centre.y - 0.02 and root.z < eye_z + 0.11
    length = rng.uniform(0.035, 0.05) if fringe else rng.uniform(0.06, 0.09)
    radius, pitch, phase = rng.uniform(0.008, 0.013), rng.uniform(0.03, 0.045), rng.uniform(0, 2 * math.pi)
    noise = _unit(rng)
    d = (n * (0.35 if fringe else 0.75) + DOWN * (0.65 if fringe else 0.25) + noise * 0.25).normalized()
    e1 = d.orthogonal().normalized()
    e2 = d.cross(e1)
    r_min = (root - centre).length + 0.002
    pts = []
    for i in range(16):
        s = length * i / 15
        th = phase + 2 * math.pi * s / pitch
        p = root + n * 0.002 + d * s + (e1 * math.cos(th) + e2 * math.sin(th)) * radius * min(1.0, i / 3)
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


def _cards_object(cards, centre, rig, name, skin=None):
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
    if skin is None:
        obj.vertex_groups.new(name="head").add(range(len(verts)), 1.0, "REPLACE")
    else:
        groups = {}
        for i, v in enumerate(verts):
            for bone, w in skin(Vector(v)).items():
                if w > 1e-4:
                    g = groups.get(bone) or groups.setdefault(bone, obj.vertex_groups.new(name=bone))
                    g.add([i], w, "REPLACE")
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
        for _ in range(1600):
            root, n = pick()
            cards.append((_short(root, n, centre, crown, rng), rng.uniform(0.012, 0.016)))
    elif style["style"] == "tousled":
        # Dry, short and messy (closeup spec §3): lifted off the scalp, a fringe falling forward to just above the brows.
        crown = centre + Vector((0, L["head_radius"] * 0.35, L["head_radius"] * 0.9))
        for _ in range(1700):
            root, n = pick()
            cards.append((_tousled(root, n, centre, crown, eye_z, rng), rng.uniform(0.011, 0.015)))
    elif style["style"] == "waves":
        # Dry, long and loose (closeup spec §3): parted near the middle, over the scalp, then falling past the
        # shoulders in loose beach waves, draped over the body rather than through it.
        tree = _body_tree(body)
        neck_z = rig.data.bones["neck"].head_local.z
        part_x = style.get("partX", 0.006)
        for _ in range(2300):
            root, n = pick()
            cards.append((_wave(root, n, centre, eye_z, neck_z, part_x, rng, tree), rng.uniform(0.011, 0.015)))
        return _cards_object(cards, centre, rig, f"{name}_hairDry", skin=_long_skin(rig))
    elif style["style"] == "ponytail":
        # Wet and slicked back to the tie: many fine cards (closeup spec §3), so the combed lines read as hair.
        tie = centre + Vector((0, L["head_radius"] * 0.95, -0.01))
        for _ in range(2600):
            root, n = pick()
            cards.append((_to_tie(root, n, centre, tie), rng.uniform(0.011, 0.015)))
        for _ in range(380):
            cards.append((_pony(tie, rng), rng.uniform(0.012, 0.017)))
    elif style["style"] == "curly":
        locks = []
        for _ in range(450):
            root, n = pick()
            locks.append(_curl(root, n, centre, eye_z, rng))
            cards.append((locks[-1], rng.uniform(0.011, 0.014)))
        for _ in range(300):
            lock = rng.choice(locks)
            cards.append((_frizz(lock[rng.randint(8, 15)], centre, rng), 0.006))
    else:
        raise SystemExit(f"unknown hair style {style['style']}")
    return _cards_object(cards, centre, rig, f"{name}_hair" + ("Dry" if style.get("dry") else ""))


def _tousled(root, n, centre, crown, eye_z, rng):
    """Short and dry: combed loosely away from the crown, standing 1-2.5 cm off the scalp, the front falling forward."""
    front = root.y < centre.y - 0.02
    length = rng.uniform(0.045, 0.085)
    noise = _unit(rng)
    lift = rng.uniform(0.008, 0.022)
    r0 = (root - centre).length
    pts = [root + n * 0.002]
    for _ in range(6):
        p = pts[-1]
        out = (p - centre).normalized()
        comb = p - crown
        comb = (comb - out * comb.dot(out)).normalized() if comb.length > 1e-6 else noise
        d = (comb * 0.55 + DOWN * (0.35 if front else 0.2) + noise * 0.45 + out * 0.25).normalized()
        q = _hug(p + d * (length / 6), centre, r0 + 0.002, r0 + lift)
        if q.y < centre.y - 0.03 and q.z < eye_z + 0.03:  # the fringe stops above the brows
            q.z = eye_z + 0.03
        pts.append(q)
    return pts


def _body_tree(body):
    return BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())


def _wave(root, n, centre, eye_z, neck_z, part_x, rng, tree):
    """One long dry lock: over the scalp away from the part, then down past the shoulders in a loose helix (a beach
    wave), pushed out of the body wherever it would pass inside (1 cm clear)."""
    length = rng.uniform(0.34, 0.46)
    seg = 0.022
    side = 1.0 if root.x >= part_x else -1.0
    r0 = (root - centre).length
    pts = [root + n * 0.002]
    phase, wl = rng.uniform(0, 2 * math.pi), rng.uniform(0.05, 0.075)
    amp = rng.uniform(0.008, 0.016)
    jitter = _unit(rng) * 0.2
    s = 0.0
    falling_from = None
    prev_off = Vector()
    while s < length:
        p = pts[-1]
        out = (p - centre).normalized()
        if falling_from is None and p.z > eye_z - 0.02:
            # Over the head: away from the part and down, a little back; hugging the scalp with some volume.
            comb = Vector((side * 0.8, 0.45, -0.7)) + jitter
            d = (comb - out * comb.dot(out)).normalized()
            q = _hug(p + d * seg, centre, r0 + 0.003, r0 + 0.014)
        else:
            if falling_from is None:
                falling_from = s
            f = s - falling_from
            flat = Vector((p.x - centre.x, p.y - centre.y, 0))
            flat = flat.normalized() if flat.length > 1e-6 else Vector((side, 0, 0))
            d = (DOWN + flat * 0.12).normalized()
            # The wave: a loose helix around the fall, growing from nothing at the ears.
            a = amp * min(1.0, f / 0.08)
            tang = flat.cross(DOWN).normalized()
            th = phase + 2 * math.pi * f / wl
            off = (tang * math.cos(th) + flat * math.sin(th) * 0.6) * a
            q = p + d * seg + off - prev_off
            prev_off = off
        # Keep out of the body (the face, neck, shoulders and back): 1 cm clear of the skin.
        loc, normal, _, _ = tree.find_nearest(q)
        if loc is not None and (q - loc).dot(normal) < 0.01:
            q = loc + normal * 0.01
        pts.append(q)
        s += seg
    return pts


def _long_skin(rig):
    """Long hair follows the head at the roots, then the neck and the upper spine below the jaw (closeup spec §4.1)."""
    neck = rig.data.bones["neck"].head_local.z
    head = rig.data.bones["head"].head_local.z

    def weights(p):
        h = max(0.0, min(1.0, (p.z - neck) / max(head - neck, 1e-3)))
        below = max(0.0, min(1.0, (neck - p.z) / 0.12))
        return {"head": h, "neck": (1 - h) * (1 - below), "spine_03": (1 - h) * below}
    return weights


def eyes(rig, L, name):
    bm = bmesh.new()
    for side, fallback in (("l", 1), ("r", -1)):
        c = L["eyes"].get(side) or (L["head_centre"] + Vector((0.032 * fallback, -0.085, L["eye_z"] - L["head_centre"].z)))
        # Fitted to MPFB's eye helper (closeup spec §4.1): the old 11.5 mm spheres sat small and sunken in the socket.
        geom = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=L.get("eye_radius", 0.0115))
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
