"""Grommet's big round glasses (grommet spec §4): thick round rims, a keyhole bridge, arms back over the ears, lenses;
skinned to the head. Blender axes: +x the character's left, -y the front, +z up."""
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

LENS_R = 0.025   # 5 cm across
RIM_R = 0.0028   # the rim's thickness
SIDES = 8


def _tube(bm, pts, r, closed):
    """Sweep a circle of radius r along pts, the frame carried along each point so it never flips."""
    n, rings, u = len(pts), [], None
    for i, p in enumerate(pts):
        a, b = (pts[(i + 1) % n], pts[i - 1]) if closed else (pts[min(i + 1, n - 1)], pts[max(i - 1, 0)])
        t = (a - b).normalized()
        u = t.orthogonal().normalized() if u is None else (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / SIDES) + v * math.sin(2 * math.pi * k / SIDES)) * r) for k in range(SIDES)])
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(SIDES):
            bm.faces.new((r0[k], r0[(k + 1) % SIDES], r1[(k + 1) % SIDES], r1[k]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def build(rig, body, L, name):
    """The frames sit ~12 mm in front of the cornea, nudged forward in 2 mm steps (up to 4 cm from the eye's centre)
    until no frame vertex is inside his head; big 5 cm lenses reach his brow."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for step in range(9):
        fwd = 0.0235 + 0.002 * step
        me = _mesh(L, fwd, f"{name}_glasses")
        inside = _inside(me, tree)
        if inside is None:
            break
        bpy.data.meshes.remove(me)
    else:
        raise SystemExit(f"the glasses go inside the head at {tuple(round(c, 3) for c in inside)}")
    print(f"glasses: {fwd * 1000:.1f} mm in front of the eyes")
    obj = bpy.data.objects.new(f"{name}_glasses", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def _mesh(L, fwd, name):
    eyes, ears = L["eyes"], L["ears"]
    centres = {s: eyes[s] + Vector((0, -fwd, 0.002)) for s in ("l", "r")}
    bm = bmesh.new()
    for s, sign in (("l", 1), ("r", -1)):
        c = centres[s]
        rim = [c + Vector((math.cos(a) * LENS_R, 0, math.sin(a) * LENS_R)) for a in (2 * math.pi * k / 32 for k in range(32))]
        _tube(bm, rim, RIM_R, True)
        # The lens: a fan, bulged 2 mm forward in the middle.
        mid = bm.verts.new(c + Vector((0, -0.002, 0)))
        ring = [bm.verts.new(c + Vector((math.cos(a) * LENS_R * 0.97, 0, math.sin(a) * LENS_R * 0.97))) for a in (2 * math.pi * k / 32 for k in range(32))]
        for k in range(32):
            bm.faces.new((mid, ring[(k + 1) % 32], ring[k]))
        # The arm: from the rim's outer edge, out past the temple, back to just above the ear, then down behind it.
        start = c + Vector((sign * LENS_R, 0, 0.008))
        ear = ears[s]
        temple = start.lerp(ear, 0.45) + Vector((sign * 0.006, 0, 0.004))
        top = ear + Vector((-sign * 0.004, 0.005, 0.012))
        behind = ear + Vector((-sign * 0.006, 0.022, -0.015))
        _tube(bm, [start, temple, start.lerp(top, 0.8), top, top.lerp(behind, 0.5), behind], RIM_R * 0.8, False)
    # The keyhole bridge: an arc between the rims' inner edges, lifted 4 mm in the middle.
    a, b = centres["r"] + Vector((LENS_R, 0, 0.012)), centres["l"] + Vector((-LENS_R, 0, 0.012))
    _tube(bm, [a.lerp(b, s) + Vector((0, -0.002, 0.004 * math.sin(math.pi * s))) for s in (i / 8 for i in range(9))], RIM_R * 0.9, False)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    frame_mat = bpy.data.materials.get("glasses") or bpy.data.materials.new("glasses")
    lens_mat = bpy.data.materials.get("lens") or bpy.data.materials.new("lens")
    for m in (frame_mat, lens_mat):
        m.use_nodes = True
        me.materials.append(m)
    for poly in me.polygons:
        poly.material_index = 0
    for i in _lens_polys(me):
        me.polygons[i].material_index = 1
    return me


def _lens_polys(me):
    """The lens fans are the triangles whose three corners sit within 2.5 mm of one plane y = const (the rims are
    tubes)."""
    out = []
    for p in me.polygons:
        ys = [me.vertices[v].co.y for v in p.vertices]
        if len(p.vertices) == 3 and max(ys) - min(ys) < 0.0025 + 1e-6 and p.area > 1e-6:
            out.append(p.index)
    return out


def _inside(me, tree):
    """The first frame vertex more than 1 mm inside his head (grommet spec §7), or None."""
    for v in me.vertices:
        hit, normal, _, _ = tree.find_nearest(v.co)
        if hit is not None and (v.co - hit).dot(normal) < -0.001:
            return v.co.copy()
    return None
