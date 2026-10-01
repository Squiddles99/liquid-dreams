"""The walking clothes (walking spec §3): shells made from each body as the boardies are, hung like cloth, plus the bikini
straps at Shazza's neck and thongs. Skinned to the body's bones. Blender axes: +x the character's left, -y the front,
+z up.

COLOR_0 on the cloth: r the crease height (rest-pose fold noise and wrinkle bands, so they don't swim as the body
moves), g occlusion (bake_ao), b the distance to the hem (0 at the hem → 1 a few cm up; the denim's fray)."""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

import geom
from wardrobe import LANDMARKS, blended, under_boardies

TORSO = {"pelvis", "spine_01", "spine_02", "spine_03"}
CHEST = 0.72  # the bikini top's line, as a fraction of height: below it the tee hangs
SOLE_M = 0.012  # src/surfer/placement.ts SOLE_M


def _smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _copy_region(body, rig, keep, name):
    """A copy of the body (its weights and UVMap) keeping only faces whose vertices all pass keep(i); no shape keys,
    no mask layers, no colours."""
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = name
    bpy.context.scene.collection.objects.link(dup)
    if dup.data.shape_keys:
        dup.shape_key_clear()
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != 0 or not all(keep(v.index) for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(dup.data)
    bm.free()
    for layer in [l.name for l in dup.data.uv_layers][1:]:
        dup.data.uv_layers.remove(dup.data.uv_layers[layer])
    for a in [a.name for a in dup.data.attributes if a.name.startswith("xp_") or a.name in ("lash", "lipmask")]:
        dup.data.attributes.remove(dup.data.attributes[a])
    for c in list(dup.data.color_attributes):
        dup.data.color_attributes.remove(c)
    dup.parent = rig
    return dup


def _dominant(bm, obj):
    """Each bmesh vertex's strongest bone name (with its side)."""
    deform = bm.verts.layers.deform.verify()
    names = {g.index: g.name for g in obj.vertex_groups}
    return {v: names.get(max(v[deform].items(), key=lambda kv: kv[1])[0], "") if v[deform] else "" for v in bm.verts}


def _cut(obj, cuts):
    """Clean hems (walking spec §3): each cut (plane point, plane normal, bones) bisects the faces whose vertices all
    follow those bones (every face when None) and drops what lies past the plane, along its normal."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for co, no, bones in cuts:
        dom = _dominant(bm, obj)
        faces = [f for f in bm.faces if all(dom[v] in bones for v in f.verts)] if bones else list(bm.faces)
        geom_ = list({e for f in faces for e in f.edges}) + faces + list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom_, plane_co=co, plane_no=no, clear_outer=True, dist=1e-5)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def _settle(obj, body_tree, clear, iterations=10, skin=None):
    """Cloth doesn't follow every bump under it: smooth the shell (its open edges only along themselves, so the hems
    and the collar straighten without shrinking), then push anything back out to `clear` from the skin."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    edge = {v for v in bm.verts if v.is_boundary}
    inner = [v for v in bm.verts if v not in edge]
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        moved = {}
        for v in edge:
            ring = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(ring) == 2:
                moved[v] = v.co * 0.5 + (ring[0].co + ring[1].co) * 0.25
        for v, c in moved.items():
            v.co = c
    for v in bm.verts:
        v.co = geom.push_out(body_tree, v.co, clear)
        if skin is not None:  # and never inside the real skin (the smoothed body sits below it in the creases)
            v.co = geom.push_out(skin, v.co, 0.002)
    bm.to_mesh(obj.data)
    bm.free()


def _merge(obj, bones, into):
    """Hand what the copy took from `bones` to `into` (the tee hangs from the torso, not the thighs; the cutoffs' waist
    follows the hips, not the chest)."""
    pelvis = obj.vertex_groups.get(into) or obj.vertex_groups.new(name=into)
    for b in bones:
        g = obj.vertex_groups.get(b)
        if g is None:
            continue
        for v in obj.data.vertices:
            for e in v.groups:
                if e.group == g.index and e.weight > 0:
                    pelvis.add([v.index], e.weight, "ADD")
        obj.vertex_groups.remove(g)


def _colors(obj, crease, hem):
    col = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for i in range(len(obj.data.vertices)):
        col.data[i].color = (crease[i], 1.0, hem[i], 1.0)
    obj.data.color_attributes.active_color = col


def _fold(co, scale=9.0):
    """Soft fold noise in rest space, 0–1."""
    return 0.5 + 0.5 * noise.noise(co * scale)


def _bone_point(rig, bone, t):
    b = rig.data.bones[bone]
    return b.head_local + (b.tail_local - b.head_local) * t, (b.tail_local - b.head_local).normalized()


def tee(body, rig, coords, weights, H, L, spec, name):
    """The tee (walking spec §3): over the torso and the shoulders to `sleeveT` down the upper arm, a round collar, cut
    `hemAboveCrotch` × H above the crotch; pushed out `push[0]` at the chest growing to `push[1]` at the hem, and below
    the chest hung straight down from the widest point above (the bust, the shoulder blades); the sleeves loose and
    flared; smoothed over what's under it; Shazza's knotted at the hip."""
    import bodymap
    verts = body.data.vertices
    crotch = LANDMARKS["crotch_z"]
    hem_z = crotch + spec["hemAboveCrotch"] * H
    chest_z = CHEST * H
    neck = rig.data.bones["neck"].head_local
    sleeve_t = spec["sleeveT"]
    push0, push1 = spec["push"]
    big = spec.get("fit") == "big"

    def rule(b, t, co, H_):
        if b in TORSO or b == "clavicle" or b == "thigh":
            # The collar: a round opening about the neck's base, dipping lower at the front.
            drop = 0.05 if co.y < neck.y else 0.03
            if co.z > neck.z - drop and math.hypot(co.x - neck.x, co.y - neck.y) < 0.085:
                return 0.0
            return 1.0 if co.z > hem_z - 0.05 else 0.0
        if b == "upperarm":
            return 1.0 if t < sleeve_t + 0.15 else 0.0
        return 0.0

    obj = _copy_region(body, rig, lambda i: blended(rule, weights[i], verts[i].co, H) >= 0.5, f"{name}_tee")
    cuts = [(Vector((0, 0, hem_z)), Vector((0, 0, -1)), None)]
    for s in ("l", "r"):
        at, d = _bone_point(rig, f"upperarm_{s}", sleeve_t)
        cuts.append((at, d, {f"upperarm_{s}"}))
    _cut(obj, cuts)
    me = obj.data
    gc = bodymap.bone_coords(obj, rig)
    torso_pts = [v.co.copy() for v, (b, _) in zip(verts, coords) if b in TORSO or (b == "thigh" and v.co.z > hem_z - 0.02)]
    hang = geom.curtain(torso_pts, chest_z)
    knot = None
    if spec.get("knot"):
        side = 1 if spec["knot"] == "l" else -1
        band = [v.co for v in me.vertices if v.co.z < hem_z + 0.03]
        k = max(band, key=lambda c: side * c.x - 0.4 * c.y)
        knot = Vector((k.x + side * 0.012, k.y - 0.01, hem_z + 0.04))
    rest = [(v.co.copy(), v.normal.copy()) for v in me.vertices]  # normals from the rest shell, before any move
    out = []
    for (co, nrm), (b, t) in zip(rest, gc):
        if b == "upperarm":
            loose = (0.02 if big else 0.01) + 0.01 * _smooth(sleeve_t - 0.25, sleeve_t, t)
            p = co + nrm * (push0 + loose)
        else:
            push = push0 + (push1 - push0) * _smooth(chest_z, hem_z, co.z)
            p = co + nrm * push
            if co.z < chest_z:
                r_body, c = hang(p.x, p.y, co.z)
                d = Vector((p.x - c.x, p.y - c.y, 0))
                r = d.length
                want = r_body + push
                if 1e-6 < r < want:
                    p += d / r * (want - r)
        if knot is not None and co.z < hem_z + 0.14:
            dirk = Vector((knot.x, knot.y, 0)).normalized()
            dirv = Vector((p.x, p.y, 0))
            facing = max(0.0, dirv.normalized().dot(dirk)) if dirv.length > 1e-6 else 0.0
            g = 0.5 * (1 - max(0.0, co.z - hem_z) / 0.14) * facing ** 2
            p = p + (knot - p) * g
        out.append(p)
    for v, p in zip(me.vertices, out):
        v.co = p
    _settle(obj, geom.smoothed_tree(body), 0.6 * push0, skin=BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get()))
    _merge(obj, ("thigh_l", "thigh_r"), "pelvis")
    _merge(obj, ("head",), "neck")  # MPFB bleeds a little of the head onto the nape
    crease, hem = [], []
    upper = rig.data.bones["upperarm_l"].length
    for v, (b, t) in zip(me.vertices, gc):
        if b == "upperarm":
            to_hem = (sleeve_t - t) * upper
            crease.append(min(1.0, _fold(v.co) * 0.7 + 0.6 * (1 - _smooth(0.0, 0.03, to_hem))))
        else:
            to_hem = v.co.z - hem_z
            waist = 1 - _smooth(0.0, 0.05, abs(v.co.z - 0.6 * H))
            near_knot = 0.5 if knot is not None and (v.co - knot).length < 0.1 else 0.0
            crease.append(min(1.0, _fold(v.co) * 0.8 + 0.35 * waist + near_knot))
        hem.append(_smooth(0.0, 0.03, to_hem))
    _colors(obj, crease, hem)
    if knot is not None:
        _add_knot(obj, geom.push_out(BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get()), knot, push1))
    return obj


def _add_knot(obj, at):
    """The knot: a squashed 3.5 cm ball of cloth at the hip, joined into the tee, following the pelvis."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    made = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.035)
    for v in made["verts"]:
        v.co = Vector((v.co.x * 0.45, v.co.y * 0.8, v.co.z * 0.85)) + at  # flattened against the hip
    bm.to_mesh(obj.data)
    bm.free()
    g = obj.vertex_groups.get("pelvis") or obj.vertex_groups.new(name="pelvis")
    new = list(range(before, len(obj.data.vertices)))
    for other in obj.vertex_groups:
        if other.name != "pelvis":
            other.remove(new)
    g.add(new, 1.0, "REPLACE")
    col = obj.data.color_attributes["Color"]
    for i in new:
        col.data[i].color = (0.9, 1.0, 1.0, 1.0)


def cutoffs(body, rig, coords, weights, H, name):
    """Denim cutoffs (walking spec §3): the boardies' region cut cleanly a third down the thigh, pushed 8 mm out (14 mm
    at the hem); COLOR_0.b is the distance to the frayed hem."""
    import bodymap
    verts = body.data.vertices

    def keep(i):
        if blended(under_boardies, weights[i], verts[i].co, H) < 0.5:
            return False
        b, t = coords[i]
        return b != "thigh" or t <= 0.45

    obj = _copy_region(body, rig, keep, f"{name}_cutoffs")
    _cut(obj, [(*_bone_point(rig, f"thigh_{s}", 0.32), {f"thigh_{s}"}) for s in ("l", "r")])
    gc = bodymap.bone_coords(obj, rig)
    thigh = rig.data.bones["thigh_l"].length
    rest = [(v.co.copy(), v.normal.copy()) for v in obj.data.vertices]
    for v, (co, nrm), (b, t) in zip(obj.data.vertices, rest, gc):
        to_hem = (0.32 - t) * thigh if b == "thigh" else 1.0
        v.co = co + nrm * (0.008 + 0.006 * (1 - _smooth(0.0, 0.06, to_hem)))
    _settle(obj, geom.smoothed_tree(body), 0.007, iterations=4, skin=BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get()))
    _merge(obj, ("spine_03",), "spine_02")
    crease, hem = [], []
    for v, (b, t) in zip(obj.data.vertices, gc):
        to_hem = (0.32 - t) * thigh if b == "thigh" else 1.0
        crease.append(_fold(v.co, 14.0))
        hem.append(_smooth(0.0, 0.025, to_hem))
    _colors(obj, crease, hem)
    return obj


def bikini_straps(body, rig, H, name):
    """Shazza's bikini halter at her neck (walking spec §2): two thin straps from the top's upper edge up beside the neck
    to a tie behind it, 6 mm off the skin; following spine_03 below and the neck above."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    neck = rig.data.bones["neck"].head_local
    top = 0.755 * H
    bm = bmesh.new()
    for s in (1, -1):
        front = _surface(tree, Vector((s * 0.06, -1.0, top)), Vector((0, 1, 0)))
        path = [
            front,
            Vector((s * 0.055, neck.y - 0.06, neck.z - 0.04)),
            Vector((s * 0.048, neck.y - 0.03, neck.z + 0.01)),
            Vector((s * 0.04, neck.y + 0.02, neck.z + 0.035)),
            Vector((s * 0.012, neck.y + 0.05, neck.z + 0.03)),
        ]
        pts = []
        for a, b in zip(path, path[1:]):
            for k in range(6):
                pts.append(a.lerp(b, k / 6))
        pts.append(path[-1])
        pts = [geom.push_out(tree, p, 0.006) for p in pts]
        geom.tube(bm, pts, 0.0028, False, sides=6, flat=0.5)
    me = bpy.data.meshes.new(f"{name}_straps")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_straps", me)
    bpy.context.scene.collection.objects.link(obj)
    gs, gn = obj.vertex_groups.new(name="spine_03"), obj.vertex_groups.new(name="neck")
    for v in me.vertices:
        w = _smooth(neck.z - 0.05, neck.z, v.co.z)
        gs.add([v.index], 1 - w, "REPLACE")
        gn.add([v.index], w, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def _surface(tree, origin, d):
    hit, _, _, _ = tree.ray_cast(origin, d, 3.0)
    if hit is None:
        raise SystemExit(f"no body surface along {tuple(d)} from {tuple(origin)}")
    return hit


def thongs(body, rig, coords, name):
    """Thongs (walking spec §3): a 12 mm sole under each foot, its outline the footprint grown 1 cm, and a Y strap from
    between the first toes over the top of the foot to either side at mid-arch. The sole's front third follows the toes."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    groups = {}
    for s, side in ((1, "l"), (-1, "r")):
        foot = [v.co.copy() for v, (b, _) in zip(body.data.vertices, coords) if b in ("foot", "toe") and v.co.z < 0.02 and v.co.x * s > 0]
        if len(foot) < 8:
            raise SystemExit(f"only {len(foot)} sole vertices on the {side} foot")
        hull = _hull([(p.x, p.y) for p in foot])
        cx = sum(x for x, _ in hull) / len(hull)
        cy = sum(y for _, y in hull) / len(hull)
        ring = []
        for x, y in hull:
            d = Vector((x - cx, y - cy, 0))
            ring.append(Vector((x, y, 0)) + d.normalized() * 0.01)
        front_y, back_y = min(p.y for p in ring), max(p.y for p in ring)
        top = [bm.verts.new((p.x, p.y, 0.0)) for p in ring]
        bot = [bm.verts.new((p.x, p.y, -SOLE_M)) for p in ring]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        for i in range(len(ring)):
            j = (i + 1) % len(ring)
            bm.faces.new((top[i], top[j], bot[j], bot[i]))
        sole = top + bot
        # The Y strap: from between the big toe and the next (inner side, 3.5 cm back from the front) over the foot.
        inner = min(ring, key=lambda p: s * p.x).x
        outer = max(ring, key=lambda p: s * p.x).x
        toe_post = Vector((inner + 0.32 * (outer - inner), front_y + 0.035, 0.0))
        mid_y = front_y + 0.45 * (back_y - front_y)
        strap = []
        for edge in (inner, outer):
            far = Vector((edge, mid_y, 0.004))
            over = toe_post.lerp(far, 0.45)
            over.z = 0.045
            pts = [toe_post.lerp(over, k / 4) for k in range(4)] + [over.lerp(far, k / 4) for k in range(5)]
            pts = [geom.push_out(tree, p, 0.004) if 0 < k < len(pts) - 1 else p for k, p in enumerate(pts)]
            strap += geom.tube(bm, pts, 0.004, False, sides=6, flat=0.45)
        groups[side] = (sole, strap, front_y, back_y)
    me = bpy.data.meshes.new(f"{name}_thongs")
    bm.verts.index_update()
    idx = {side: ([v.index for v in sole], [v.index for v in strap], fy, by) for side, (sole, strap, fy, by) in groups.items()}
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_thongs", me)
    bpy.context.scene.collection.objects.link(obj)
    for side, (sole, strap, fy, by) in idx.items():
        gf, gt = obj.vertex_groups.new(name=f"foot_{side}"), obj.vertex_groups.new(name=f"toe_{side}")
        for i in sole + strap:
            y = me.vertices[i].co.y
            w = 1.0 - _smooth(fy + 0.25 * (by - fy), fy + 0.4 * (by - fy), y)  # the front third: the toes
            gt.add([i], w, "REPLACE")
            gf.add([i], 1.0 - w, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def _hull(pts):
    """The 2D convex hull, counter-clockwise (monotone chain)."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def bake_ao(obj, others, reach=0.04, rays=10, seed=9):
    """Occlusion per garment vertex into COLOR_0.g (walking spec §3; step 2's method): rays over the hemisphere about
    the normal against the garment, the body and `others`; the under-layers, the armpits and the hem's inside darken."""
    rng = random.Random(seed)
    verts, polys = [], []
    for o in [obj, *others]:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        # The body's lash strips (its second material) aren't cloth's occluders.
        polys += [[i + base for i in p.vertices] for p in o.data.polygons if o is obj or p.material_index == 0]
    tree = BVHTree.FromPolygons(verts, polys)
    dirs = []
    for i in range(rays):
        t = (i + 0.5) / rays
        r, phi = math.sqrt(t), i * 2.399963 + rng.uniform(0, 0.2)
        dirs.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(1 - t)))
    col = obj.data.color_attributes["Color"]
    for v in obj.data.vertices:
        n = v.normal
        t1 = n.orthogonal().normalized()
        t2 = n.cross(t1)
        hits = 0.0
        for x, y, z in dirs:
            d = t1 * x + t2 * y + n * z
            hit, _, _, dist = tree.ray_cast(v.co + n * 0.001, d, reach)
            if hit is not None:
                hits += 1.0 - dist / reach * 0.5
        c = col.data[v.index].color
        col.data[v.index].color = (c[0], max(0.0, 1.0 - hits / rays), c[2], 1.0)


def outside_check(garments, body):
    """True when no garment vertex is more than 1 mm inside the body (walking spec §7)."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    bad = {g.name: geom.inside_count(g, tree) for g in garments}
    print(f"garment vertices inside the body: {bad}")
    return all(n == 0 for n in bad.values())


def limit(obj):
    """Four bones a vertex at most, normalised; empty groups dropped."""
    import rig_trim
    rig_trim.limit_weights(obj)
