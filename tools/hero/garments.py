"""Shazza's red string bikini and pink thongs (hero spec §8), from the painting: triangle cups with a hem binding, a
halter tie behind the neck, a string band under the bust and round the back; tie-side bottoms (a low front triangle and
a cheeky back) with a bow at each hip and two knotted strings hanging from it; EVA thongs with a Y strap.

Fabric panels are shells of the body's own surface (pushed out off the skin, given thickness), so they sit exactly on
her; cords are tubes laid along the skin. Blender axes: +x her left, -y the front, +z up.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import strands
from skin import Nodes, srgb

RED = srgb((150, 8, 16))
PINK = srgb((232, 70, 128))


def fabric_material(name, colour, rough=0.5, sheen=0.12):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    g = Nodes(mat)
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    # A fine knit: a stretched wave across, a noise grain.
    knit = g.n("ShaderNodeTexWave", Vector=co, Scale=900.0, Distortion=0.6, _wave_type="BANDS", _bands_direction="Z").outputs["Fac"]
    grain = g.n("ShaderNodeTexNoise", Vector=co, Scale=1800.0).outputs["Fac"]
    bump = g.n("ShaderNodeBump", Height=g.math("ADD", knit, g.math("MULTIPLY", grain, 0.5)), Strength=0.12, Distance=0.0002)
    shade = g.n("ShaderNodeTexNoise", Vector=co, Scale=30.0).outputs["Fac"]
    col = g.mix(colour, tuple(c * 0.8 for c in colour[:3]) + (1.0,), g.math("MULTIPLY", shade, 0.4))
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": rough, "Sheen Weight": sheen,
                                               "Sheen Roughness": 0.45, "Sheen Tint": colour, "Normal": bump.outputs["Normal"]})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def foam_material():
    mat = bpy.data.materials.get("thong_foam") or bpy.data.materials.new("thong_foam")
    mat.use_nodes = True
    g = Nodes(mat)
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    pits = g.n("ShaderNodeTexVoronoi", Vector=co, Scale=2200.0).outputs["Distance"]
    bump = g.n("ShaderNodeBump", Height=pits, Strength=0.1, Distance=0.0002)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": PINK, "Roughness": 0.62, "Normal": bump.outputs["Normal"],
                                               "Subsurface Weight": 0.15, "Subsurface Radius": (1, 0.4, 0.5), "Subsurface Scale": 0.002})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def shell(body, inside, name, offset=0.0012, thickness=0.0012, binding=0.0014):
    """The body's faces whose vertices all pass `inside(co, normal)`, copied, pushed `offset` off the skin, with
    `thickness`, smoothed, and a binding tube round every edge loop."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    keep = {v.index for v in bm.verts if inside(v.co, v.normal)}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in keep for v in f.verts)], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    # The loops round the panel's edge, for the binding.
    edges = [e for e in bm.edges if e.is_boundary]
    loops, seen = [], set()
    for e in edges:
        if e.index in seen:
            continue
        loop, cur, prev = [], e.verts[0], None
        while True:
            loop.append(cur.co.copy())
            nxt = [x for x in cur.link_edges if x.is_boundary and x.index not in seen]
            if not nxt:
                break
            seen.add(nxt[0].index)
            prev, cur = cur, nxt[0].other_vert(cur)
            if cur.co == loop[0]:
                break
        if len(loop) > 4:
            loops.append(loop + [loop[0]])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = _link(bpy.data.objects.new(name, me))
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness, sol.offset = thickness, 1.0
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = sub.render_levels = 2
    bind = None
    if binding and loops:
        smooth_loops = [braids_resample(l, 0.002) for l in loops]
        bind = strands._tube_mesh(name + "_binding", smooth_loops, [[binding] * len(l) for l in smooth_loops], ring=8)
    return obj, bind


def _bez(a, c, b, n):
    """n 2D points on a quadratic Bézier a → b with control c."""
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1])
            for t in (i / (n - 1) for i in range(n))]


def panel(tree, top, bottom, left, right, view, name, offset=0.0016, thickness=0.0012, binding=0.0014):
    """A fabric panel as a Coons patch between four boundary curves in a projection plane ((x, z) seen from the front
    or the back), each grid point laid on the skin by a ray from that side and pushed `offset` off it: clean straight or
    curved edges, unlike faces picked off the body. top/bottom run left→right, left/right run top→bottom (2D lists of
    the same length per pair)."""
    nu, nv = len(top), len(left)
    TL, TR, BL, BR = top[0], top[-1], bottom[0], bottom[-1]
    sign = 1.0 if view == "front" else -1.0
    grid = []
    for j in range(nv):
        v = j / (nv - 1)
        row = []
        for i in range(nu):
            u = i / (nu - 1)
            x = ((1 - v) * top[i][0] + v * bottom[i][0] + (1 - u) * left[j][0] + u * right[j][0]
                 - ((1 - u) * (1 - v) * TL[0] + u * (1 - v) * TR[0] + (1 - u) * v * BL[0] + u * v * BR[0]))
            z = ((1 - v) * top[i][1] + v * bottom[i][1] + (1 - u) * left[j][1] + u * right[j][1]
                 - ((1 - u) * (1 - v) * TL[1] + u * (1 - v) * TR[1] + (1 - u) * v * BL[1] + u * v * BR[1]))
            hit, nrm, _, _ = tree.ray_cast(Vector((x, -sign * 0.6, z)), Vector((0, sign, 0)), 1.2)
            row.append(hit + nrm * offset if hit is not None else None)
        grid.append(row)
    bm = bmesh.new()
    verts = [[bm.verts.new(p) if p is not None else None for p in row] for row in grid]
    for j in range(nv - 1):
        for i in range(nu - 1):
            q = (verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i])
            if all(q) and len(set(q)) == 4:
                f = bm.faces.new(q if sign > 0 else q[::-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    obj = _link(bpy.data.objects.new(name, me))
    sol = obj.modifiers.new("thick", "SOLIDIFY")
    sol.thickness, sol.offset = thickness, -1.0
    sub = obj.modifiers.new("smooth", "SUBSURF")
    sub.levels = sub.render_levels = 1
    edge = [grid[0][i] for i in range(nu)] + [grid[j][-1] for j in range(nv)] + [grid[-1][i] for i in range(nu - 1, -1, -1)] + [grid[j][0] for j in range(nv - 1, -1, -1)]
    edge = [p for p in edge if p is not None]
    dedup = [edge[0]]
    for p in edge[1:]:
        if (p - dedup[-1]).length > 0.0008:
            dedup.append(p)
    loop = braids_resample(dedup + [dedup[0]], 0.0015)
    bind = strands._tube_mesh(name + "_binding", [loop], [[binding] * len(loop)], ring=8) if binding else None
    return obj, bind


def braids_resample(pts, step):
    import braids
    return braids._smooth(braids._resample([Vector(p) for p in pts], step), 4)


def cord(tree, ctrl, name, radius=0.0016, clear=0.0022, n=80):
    """A cord laid along the skin through the control points (a Catmull–Rom, pushed `clear` off the skin)."""
    import braids
    line = braids._catmull([Vector(c) for c in ctrl], n)
    out = []
    for q in line:
        loc, nrm, _, _ = tree.find_nearest(q)
        if loc is not None:
            q = loc + nrm * (clear + radius)
        out.append(q)
    out = braids._smooth(out, 6)
    return strands._tube_mesh(name, [out], [[radius] * len(out)], ring=8), out


def hanging(start, length, tree, rng_phase, name, radius=0.0016, knot=True):
    """A loose tie end hanging from `start`: down, swinging a little, off the skin; a knot at its end."""
    pts = []
    for k in range(24):
        f = k / 23
        q = start + Vector((0.004 * math.sin(f * 3 + rng_phase), -0.004 * f, -length * f))
        loc, nrm, _, _ = tree.find_nearest(q)
        if loc is not None and (q - loc).dot(nrm) < 0.003:
            q = loc + nrm * 0.003
        pts.append(q)
    objs = [strands._tube_mesh(name, [pts], [[radius] * len(pts)], ring=8)]
    if knot:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * 2.1, location=pts[-1], segments=12, ring_count=8)
        k = bpy.context.active_object
        k.name = name + "_knot"
        k.scale = (1, 1, 1.4)
        objs.append(k)
    return objs


def bow(centre, normal, name, radius=0.0015):
    """Two small loops either side of a knot, lying on the skin."""
    up = Vector((0, 0, 1))
    side = normal.cross(up).normalized()
    objs = []
    for s in (-1, 1):
        pts = []
        for k in range(21):
            a = 2 * math.pi * k / 20
            pts.append(centre + side * s * (0.012 + 0.012 * math.cos(a)) + up * 0.008 * math.sin(a) + normal * 0.0015 * math.sin(a))
        objs.append(strands._tube_mesh(f"{name}_loop{s}", [pts], [[radius] * len(pts)], ring=8))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0035, location=centre + normal * 0.0015, segments=12, ring_count=8)
    k = bpy.context.active_object
    k.name = name + "_knot"
    objs.append(k)
    return objs


def ring_point(tree, z, angle, centre_y):
    """The skin at height z, `angle` round the torso from the front (+ toward her left), cast out from inside."""
    d = Vector((math.sin(angle), -math.cos(angle), 0.0))
    o = Vector((0.0, centre_y, z))
    hit, nrm, _, _ = tree.ray_cast(o, d, 0.4)
    return hit, nrm


def build(body, marks, L, name):
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, dg)
    red, pink = fabric_material("bikini_red", RED), foam_material()
    objs = []
    nip = L["nipples"]
    notch, navel, crotch = marks["notch"], marks["navel"], marks["crotch"]
    torso_y = (notch.y + navel.y) / 2 + 0.06  # roughly the torso's middle, front to back

    # The cups: front-projected triangles over each breast.
    under_z = nip["l"].z - 0.042
    apex = {}
    for side, s in (("l", 1), ("r", -1)):
        n = nip[side]
        A = Vector((n.x - s * 0.012, 0, n.z + 0.085))  # apex, toward the neck
        B = Vector((s * 0.014, 0, under_z))  # inner bottom, by the cleavage
        C = Vector((n.x + s * 0.068, 0, under_z + 0.008))  # outer bottom, under the arm
        apex[side] = (A, B, C)

        # The cup: apex (top) to its bottom edge (inner → outer), sides bowed out a little over the breast.
        ax, bx, cx_ = (A.x, A.z), (B.x, B.z), (C.x, C.z)
        inner_side = _bez(ax, ((A.x + B.x) / 2 - s * 0.006, (A.z + B.z) / 2), bx, 24)
        outer_side = _bez(ax, ((A.x + C.x) / 2 + s * 0.008, (A.z + C.z) / 2 + 0.004), cx_, 24)
        base = _bez(bx, ((B.x + C.x) / 2, (B.z + C.z) / 2 - 0.004), cx_, 24)
        top_deg = [ax] * 24
        if s > 0:
            cup, bind = panel(tree, top_deg, base, inner_side, outer_side, "front", f"{name}_cup_{side}", offset=0.0022)
        else:
            cup, bind = panel(tree, top_deg, base[::-1], outer_side, inner_side, "front", f"{name}_cup_{side}", offset=0.0022)
        objs += [cup, bind]
        # The halter: from the apex up over the shoulder's slope to the back of the neck.
        top = Vector((A.x, n.y, A.z))
        loc, _, _, _ = tree.find_nearest(top)
        neck_side = Vector((s * 0.045, notch.y + 0.06, notch.z + 0.05))
        nape = Vector((s * 0.012, notch.y + 0.11, notch.z + 0.07))
        c, _ = cord(tree, [loc, neck_side, nape], f"{name}_halter_{side}")
        objs.append(c)
    # The band: inner corners joined across the front; each outer corner round the back to a bow.
    lb = tree.find_nearest(Vector((apex["l"][1].x, nip["l"].y, under_z)))[0]
    rb = tree.find_nearest(Vector((apex["r"][1].x, nip["r"].y, under_z)))[0]
    c, _ = cord(tree, [rb, Vector((0, rb.y - 0.004, under_z)), lb], f"{name}_band_front", clear=0.003)
    objs.append(c)
    back = []
    for side, s in (("l", 1), ("r", -1)):
        pts = [ring_point(tree, under_z + 0.006 - 0.004 * k / 8, s * (math.radians(62) + math.radians(118) * k / 8), torso_y)[0] for k in range(9)]
        pts = [p for p in pts if p is not None]
        c, line = cord(tree, pts, f"{name}_band_{side}")
        objs.append(c)
        back.append(line[-1])
    bc = (back[0] + back[1]) / 2
    objs += bow(bc, Vector((0, 1, 0)), f"{name}_backbow")
    objs += hanging(bc + Vector((0.004, 0.003, 0)), 0.07, tree, 0.3, f"{name}_backtie_a")
    objs += hanging(bc + Vector((-0.004, 0.003, 0)), 0.06, tree, 1.7, f"{name}_backtie_b")
    halter_bow = Vector((0, notch.y + 0.115, notch.z + 0.07))
    objs += bow(halter_bow, Vector((0, 1, 0)), f"{name}_neckbow")
    objs += hanging(halter_bow, 0.08, tree, 2.2, f"{name}_necktie")

    # The bottoms: a low front triangle and a cheeky back, between the hip ties and the crotch.
    tie_z = navel.z - 0.075
    hip = {}
    for side, s in (("l", 1), ("r", -1)):
        hit, nrm = ring_point(tree, tie_z, s * math.radians(88), torso_y - 0.02)
        hip[side] = (hit, nrm)
    front_top = navel.z - 0.105  # the front's top edge dips to here at the middle
    back_top = navel.z - 0.085

    hx = abs(hip["l"][0].x)
    gus_z, gus_w = crotch.z - 0.012, 0.016
    for view, top_mid, cheek in (("front", front_top, 0.0), ("back", back_top, 0.03)):
        tl, tr = (-hx, tie_z), (hx, tie_z)
        top = _bez(tl, (0.0, top_mid - 0.012), tr, 30)
        bottom = _bez((-gus_w, gus_z), (0.0, gus_z - 0.004), (gus_w, gus_z), 30)
        # The leg lines bow in (front) or curve up over the cheek (back).
        left = _bez(tl, (-hx * 0.55 + cheek * -1, (tie_z + gus_z) / 2 - 0.01 + cheek), (-gus_w, gus_z), 24)
        right = _bez(tr, (hx * 0.55 + cheek, (tie_z + gus_z) / 2 - 0.01 + cheek), (gus_w, gus_z), 24)
        if view == "back":
            top, bottom = top[::-1], bottom[::-1]
            left, right = right, left
        pnl, bind = panel(tree, top, bottom, left, right, view, f"{name}_bottoms_{view}", offset=0.0016)
        objs += [pnl, bind]
    for side, s in (("l", 1), ("r", -1)):
        p, nrm = hip[side]
        objs += bow(p + nrm * 0.003, nrm, f"{name}_hipbow_{side}")
        objs += hanging(p + nrm * 0.004, 0.1, tree, 0.5 + s, f"{name}_hiptie_{side}_a")
        objs += hanging(p + nrm * 0.004 + Vector((s * 0.003, 0, 0)), 0.085, tree, 1.4 + s, f"{name}_hiptie_{side}_b")

    for o in objs:
        if o is not None and o.type == "MESH" and not o.data.materials:
            o.data.materials.append(red)
    objs = [o for o in objs if o is not None]
    objs += thongs(body, name, pink)
    return objs


def _foot_top(body_tree, x, y):
    hit, _, _, _ = body_tree.ray_cast(Vector((x, y, 0.3)), Vector((0, 0, -1)), 0.4)
    return hit.z if hit is not None else 0.03


def thongs(body, name, mat):
    """EVA flip-flops: each sole the foot's footprint grown 7 mm, 13 mm thick under the sole; a Y strap from the toe
    post between the first two toes to either side of the arch."""
    objs = []
    V = np.array([v.co[:] for v in body.data.vertices])
    ftree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for s in (-1, 1):
        foot = V[(V[:, 2] < 0.02) & (np.sign(V[:, 0]) == s)]
        if len(foot) < 10:
            continue
        cx = foot[:, 0].mean()
        ys = np.linspace(foot[:, 1].min() - 0.008, foot[:, 1].max() + 0.008, 40)
        outline_l, outline_r = [], []
        for y in ys:
            band = foot[np.abs(foot[:, 1] - y) < 0.01]
            if len(band) == 0:
                continue
            outline_l.append((band[:, 0].min() - 0.007, y))
            outline_r.append((band[:, 0].max() + 0.007, y))
        ring = outline_l + outline_r[::-1]
        bm = bmesh.new()
        top = [bm.verts.new((x, y, -0.0005)) for x, y in ring]
        bot = [bm.verts.new((x, y, -0.0135)) for x, y in ring]
        bm.faces.new(top[::-1])
        bm.faces.new(bot)
        for i in range(len(ring)):
            j = (i + 1) % len(ring)
            bm.faces.new((top[i], top[j], bot[j], bot[i]))
        me = bpy.data.meshes.new(f"{name}_sole")
        bm.to_mesh(me)
        bm.free()
        sole = _link(bpy.data.objects.new(f"{name}_thong_{s}", me))
        bev = sole.modifiers.new("bevel", "BEVEL")
        bev.width, bev.segments = 0.003, 3
        sole.data.materials.append(mat)
        objs.append(sole)
        # The strap: the toe post (between the big and second toe), up over the foot to each side of the arch.
        front = foot[foot[:, 1] < foot[:, 1].min() + 0.06]
        big_x = front[:, 0].min() if s > 0 else front[:, 0].max()
        post = Vector((cx * 0.35 + big_x * 0.65 + s * 0.01, foot[:, 1].min() + 0.035, 0.002))
        mid_y = foot[:, 1].min() + 0.1
        band = foot[np.abs(foot[:, 1] - mid_y) < 0.01]
        top_z = band[:, 2].max() if len(band) else 0.05
        for side_x in (band[:, 0].min() - 0.004, band[:, 0].max() + 0.004):
            mx, my = post.x * 0.6 + side_x * 0.4, post.y + 0.035
            ctrl = [post, Vector((post.x, post.y + 0.012, _foot_top(ftree, post.x, post.y + 0.012) + 0.004)),
                    Vector((mx, my, _foot_top(ftree, mx, my) + 0.0045)), Vector((side_x, mid_y, 0.004))]
            import braids
            line = braids._catmull(ctrl, 30)
            t = strands._tube_mesh(f"{name}_strap", [line], [[0.0035] * len(line)], ring=10)
            t.scale = (1, 1, 1)
            t.data.materials.append(mat)
            objs.append(t)
    return objs
