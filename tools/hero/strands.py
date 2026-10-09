"""Hero hair as real strands (hero spec §7): Blender hair curves for Cycles, from the old build's own geometry (the
braid path, its frames and the three-strand plait in tools/surfer/braids.py, and the scalp locks combed to it in
tools/surfer/hair.py), so the game's cards and the hero agree on where everything is.

- Scalp: guide locks from the centre part, combed over the ears into each braid; each guide carries a clump of fibres
  (roots spread round it, drawn together toward the braid), with volume off the scalp.
- Braids: every plait strand filled with fibres that follow it, round a solid core so it never reads see-through.
- Below each elastic, a loose tail (the painting's braids are tied at the armpit and brush on to the underbust).
- Frizz and face-framing wisps (the painting's sun-dried halo and the curls at the temples).
- Brows and lashes, rooted on the skin.
Blender axes: +x her left, -y the front, +z up.
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "surfer"))
import braids  # noqa: E402
import hair as game_hair  # noqa: E402
import hairline  # noqa: E402

from skin import Nodes, srgb  # noqa: E402

FIBRE_R = 0.00007  # a scalp fibre's radius at the root (real hair ~0.035 mm: a little thicker, fewer of them)


def _catmull_resample(pts, step):
    pts = [Vector(p) for p in pts]
    if len(pts) < 3:
        return pts
    return braids._resample(pts, step)


class Curves:
    """Collects polylines with per-point radii, then makes one hair-curves object."""

    def __init__(self):
        self.lines, self.radii = [], []

    def add(self, pts, r_root, r_tip=None):
        if len(pts) < 2:
            return
        n = len(pts)
        r_tip = r_root * 0.35 if r_tip is None else r_tip
        self.lines.append(pts)
        self.radii.append([r_root + (r_tip - r_root) * (i / (n - 1)) ** 1.5 for i in range(n)])

    def build(self, name, material):
        c = bpy.data.hair_curves.new(name)
        c.add_curves([len(p) for p in self.lines])
        flat = np.array([v[:] for line in self.lines for v in line], np.float32).reshape(-1)
        c.attributes["position"].data.foreach_set("vector", flat)
        rad = c.attributes.new("radius", "FLOAT", "POINT")
        rad.data.foreach_set("value", np.array([r for rr in self.radii for r in rr], np.float32))
        obj = bpy.data.objects.new(name, c)
        c.materials.append(material)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def hair_material(name, melanin_root=0.48, melanin_tip=0.16, redness=0.36, rough=0.26):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    g = Nodes(mat)
    info = g.n("ShaderNodeHairInfo")
    # Sun-bleached toward the ends, each strand its own shade.
    t = g.math("POWER", info.outputs["Intercept"], 0.8)
    mel = g.math("ADD", melanin_root, g.math("MULTIPLY", t, melanin_tip - melanin_root))
    mel = g.math("ADD", mel, g.math("MULTIPLY", g.math("SUBTRACT", info.outputs["Random"], 0.5), 0.16))
    bsdf = g.n("ShaderNodeBsdfHairPrincipled", _model="CHIANG", _parametrization="MELANIN", Melanin=mel, **{"Melanin Redness": redness, "Roughness": rough,
                                                                 "Radial Roughness": 0.32, "Coat": 0.08, "Random Roughness": 0.15})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def core_material():
    mat = bpy.data.materials.get("braid_core") or bpy.data.materials.new("braid_core")
    mat.use_nodes = True
    g = Nodes(mat)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": srgb((120, 78, 38)), "Roughness": 0.6})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def tie_material():
    mat = bpy.data.materials.get("hair_tie") or bpy.data.materials.new("hair_tie")
    mat.use_nodes = True
    g = Nodes(mat)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": srgb((88, 18, 26)), "Roughness": 0.35, "Coat Weight": 0.3})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def _tube_mesh(name, lines, radii_list, ring=10):
    bm = bmesh.new()
    for line, radii in zip(lines, radii_list):
        frames = braids.transport_frames(line)
        rings = []
        for p, (t, u, v), r in zip(line, frames, radii):
            rings.append([bm.verts.new(p + (u * math.cos(a) + v * math.sin(a)) * r) for a in (2 * math.pi * k / ring for k in range(ring))])
        for a, b in zip(rings, rings[1:]):
            for k in range(ring):
                bm.faces.new((a[k], a[(k + 1) % ring], b[(k + 1) % ring], b[k]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _scalp_sampler(body, rng):
    """Area-weighted random points (and normals) on the skin MPFB marks as scalp."""
    me = body.data
    sc = me.attributes["g_scalp"]
    me.calc_loop_triangles()
    tris, areas = [], []
    for lt in me.loop_triangles:
        vs = lt.vertices
        if min(sc.data[i].value for i in vs) > 0.99:
            tris.append(vs)
            areas.append(lt.area)
    cum = np.cumsum(areas)
    total = cum[-1]

    def pick():
        k = int(np.searchsorted(cum, rng.random() * total))
        a, b, c = (me.vertices[i] for i in tris[k])
        u, v = rng.random(), rng.random()
        if u + v > 1:
            u, v = 1 - u, 1 - v
        p = a.co * (1 - u - v) + b.co * u + c.co * v
        n = (a.normal * (1 - u - v) + b.normal * u + c.normal * v).normalized()
        return p.copy(), n
    return pick


def paint_scalp(body, L, coords):
    """`g_scalp` redrawn from the old build's natural hairline (hairline.py: 6.5 cm above the eyes at the forehead, down
    the temples into a sideburn, over the ears, to the nape): MPFB's own scalp group stops far back. A 1 cm soft edge
    for the skin's tint; roots only where it is 1."""
    centre, eye_z = L["head_centre"], L["eye_z"]
    ear = hairline.ear_params(L)
    att = body.data.attributes["g_scalp"]
    for v, (b, _) in zip(body.data.vertices, coords):
        if b != "head":
            att.data[v.index].value = 0.0
            continue
        dz = v.co.z - hairline.line_z(v.co, centre, eye_z, *ear)
        att.data[v.index].value = max(0.0, min(1.0, 0.5 + dz / 0.01))


def _surface_r(tree, centre, d):
    """The skin's distance from the head's centre along direction d (a ray out from inside)."""
    hit, _, _, dist = tree.ray_cast(centre + d * 0.2, -d, 0.2)
    return (0.2 - dist) if hit is not None else 0.09


def _guide(root, n, centre, eye_z, ear, start, tree, rng, side):
    """A scalp lock's line, root to the braid's start, in the painting's style (round 2): from the centre part the hair
    falls down the side of the head, over the ear (covering it), to the braid's start below it; locks from behind the
    ear fall straight down the back of the head to it. Lifted off the skin all the way (volume: most over the ear,
    soft, as full hair stands), drawn in to the braid at the end."""
    s = 1.0 if side == "l" else -1.0
    ctrl = [root]
    if root.y < centre.y - 0.055:  # the front hairline: falls forward over the forehead's corner before sweeping out
        ctrl.append(root + Vector((s * 0.022, -0.012, -0.018)))
    if root.y < ear.y + 0.015:  # in front of the ear: down the side, over the ear
        drop = Vector((root.x + s * 0.02, max(root.y, ear.y - 0.03), ear.z + 0.035))
        ctrl += [drop, ear + Vector((s * 0.01, 0.012, -0.012))]
    else:  # behind it: down the back of the head toward the braid
        ctrl.append(Vector((root.x * 0.9 + s * 0.012, root.y, (root.z + start.z) / 2 + 0.02)))
    ctrl.append(start)
    line = braids._catmull([Vector(c) for c in ctrl], 44)
    total = len(line) - 1
    vol_peak = rng.uniform(0.008, 0.016)
    out = []
    for i, q in enumerate(line):
        f = i / total
        vol = 0.0015 + vol_peak * math.sin(math.pi * min(1.0, f / 0.95)) ** 0.6 * (1.0 - 0.6 * f)
        if f < 0.97:
            loc, nrm, _, _ = tree.find_nearest(q)
            if loc is not None:
                d = (q - loc).dot(nrm)
                if d < vol:
                    q = q + nrm * (vol - d)
        out.append(q)
    return braids._smooth(out, 8)


def build(body, rig, L, marks, preset, name, coords):
    paint_scalp(body, L, coords)
    rng = random.Random(preset["hair"].get("seed", 11) + 1000)
    style = preset["hair"]
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, dg)
    centre, eye_z = L["head_centre"], L["eye_z"]
    part_x = style.get("partX", 0.006)
    neck = rig.data.bones["neck"].head_local
    scalp, braid, tails, wisps = Curves(), Curves(), Curves(), Curves()
    paths, frames, cores, core_r, ties = {}, {}, [], [], []

    for side in ("l", "r"):
        path, clav = braids.braid_path(side, L, rig, tree, False)
        fr = braids._frames(path, neck)
        paths[side], frames[side] = path, fr
        strands, radii, phases = braids.plait(path, fr, False)
        for line, ph in zip(strands, phases):
            cores.append(line)
            core_r.append([r * 0.72 for r in radii])
            tf = braids.transport_frames(line)
            for _ in range(420):
                a0, rr = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random())
                pts = []
                for i in range(0, len(line), 3):
                    t, u, v = tf[i]
                    a = a0 + ph[i] * 0.5
                    pts.append(line[i] + (u * math.cos(a) + v * math.sin(a)) * radii[i] * 0.98 * rr)
                braid.add(pts, FIBRE_R * 1.6, FIBRE_R * 1.2)
        # The elastic at the braid's end, and the long loose tail below it.
        end, (t_end, n_end, b_end) = path[-1], fr[-1]
        ties.append((end, t_end))
        for _ in range(900):
            a, rr = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random()) * braids.BUNDLE_R
            p = end + (n_end * math.cos(a) + b_end * math.sin(a)) * rr
            length = rng.uniform(0.06, 0.105)
            spread = (n_end * math.cos(a) * 0.5 + b_end * math.sin(a)) * rng.uniform(0.2, 0.55)
            d = (t_end * 0.55 + Vector((0, 0, -1)) * 0.45).normalized()
            pts, steps = [p.copy()], 18
            wave_ph = rng.uniform(0, 6.28)
            for k in range(1, steps + 1):
                f = k / steps
                q = p + d * length * f + spread * length * f * f + b_end * 0.002 * math.sin(f * 9 + wave_ph)
                loc, nrm, _, _ = tree.find_nearest(q)
                if loc is not None and (q - loc).dot(nrm) < 0.003:
                    q = loc + nrm * 0.003
                pts.append(q)
            tails.add(pts, FIBRE_R * 1.4, FIBRE_R * 0.5)

    # The scalp: guide locks to the braids, each with a clump of fibres around it.
    pick = _scalp_sampler(body, rng)
    for _ in range(1900):
        root, n = pick()
        side = "l" if root.x >= part_x else "r"
        ear = L["ears"][side]
        j = rng.randrange(0, max(1, round(0.02 / braids.STEP)))
        t_, nb, bb = frames[side][j]
        a = rng.uniform(0, 2 * math.pi)
        start = paths[side][j] + (nb * math.cos(a) * 0.6 + bb * math.sin(a)) * rng.uniform(0.0, 0.013)
        guide = _catmull_resample(_guide(root, n, centre, eye_z, ear, start, tree, rng, side), 0.004)
        if len(guide) < 3:
            continue
        # A soft wave across the lock (the painting's hair is wavy, not combed flat), dying out into the braid.
        wl, amp, ph = rng.uniform(0.03, 0.045), rng.uniform(0.0015, 0.004), rng.uniform(0, 6.28)
        acc = 0.0
        waved = [guide[0]]
        for i in range(1, len(guide)):
            acc += (guide[i] - guide[i - 1]).length
            f = i / (len(guide) - 1)
            t = (guide[i] - guide[i - 1]).normalized()
            out = (guide[i] - centre).normalized()
            side_ax = t.cross(out).normalized()
            fade = math.sin(math.pi * min(1.0, f * 1.25)) if f < 0.8 else 0.0
            waved.append(guide[i] + (side_ax * math.sin(acc / wl * 6.283 + ph) + out * 0.5 * math.cos(acc / wl * 6.283 + ph)) * amp * fade)
        guide = waved
        tight = rng.uniform(0.5, 1.0)  # how tightly this lock's fibres keep to it
        for _ in range(16):
            # A fibre: its root nudged round the guide's on the scalp, drawn into the guide as it nears the braid.
            jit = Vector((rng.gauss(0, 0.0035), rng.gauss(0, 0.0035), rng.gauss(0, 0.0035)))
            jit -= n * jit.dot(n)
            pts = []
            for i, p in enumerate(guide):
                f = i / (len(guide) - 1)
                pts.append(p + jit * tight * (1 - f) ** 1.3 + Vector((rng.gauss(0, 0.0003),) * 3) * f)
            scalp.add(pts, FIBRE_R, FIBRE_R * 0.7)

    # Frizz: short fine curls off the scalp's surface, most at the sides and the crown's top.
    for _ in range(70):
        root, n = pick()
        if root.z > centre.z + 0.07:
            continue  # none standing up off the crown (round 1: they read as wires)
        out = (root - centre).normalized() * 0.35
        length = rng.uniform(0.015, 0.035)
        ph, turns = rng.uniform(0, 6.28), rng.uniform(1.5, 3.5)
        side = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
        side = (side - out * side.dot(out)).normalized()
        other = out.cross(side)
        pts = []
        for k in range(14):
            f = k / 13
            r = 0.0025 * f
            a = ph + f * turns * 2 * math.pi
            pts.append(root + out * (0.012 + length * f * 0.4) + side * (length * f * 0.8) + (side * math.cos(a) + other.normalized() * math.sin(a)) * r
                       + Vector((0, 0, -0.02 * f * f)))
        wisps.add(pts, FIBRE_R * 0.8, FIBRE_R * 0.4)
    # Face-framing wisps at the temples: loose curling tendrils to the cheekbone.
    for s in (-1, 1):
        for _ in range(60):
            root = centre + Vector((s * rng.uniform(0.055, 0.068), -rng.uniform(0.045, 0.065), rng.uniform(0.0, 0.035)))
            loc, nrm, _, _ = tree.find_nearest(root)
            root = loc + nrm * 0.004
            ph = rng.uniform(0, 6.28)
            pts = []
            for k in range(22):
                f = k / 21
                q = root + Vector((s * 0.012 * f, -0.006 * f, -0.085 * f)) + Vector((s * math.cos(ph + f * 12), math.sin(ph + f * 12) * 0.5, 0)) * 0.004 * f
                lc, nm, _, _ = tree.find_nearest(q)
                if lc is not None and (q - lc).dot(nm) < 0.003:
                    q = lc + nm * 0.003
                pts.append(q)
            wisps.add(pts, FIBRE_R * 1.1, FIBRE_R * 0.4)

    mat = hair_material("hair_hero")
    objs = [scalp.build(f"{name}_hairScalp", mat), braid.build(f"{name}_hairBraid", mat),
            tails.build(f"{name}_hairTail", hair_material("hair_hero_tail", 0.36, 0.14)), wisps.build(f"{name}_hairWisps", mat)]
    core = _tube_mesh(f"{name}_braidCore", cores, core_r)
    core.data.materials.append(core_material())
    objs.append(core)
    # The elastics: a snug torus round each braid's end.
    tm = tie_material()
    for i, (p, t) in enumerate(ties):
        bpy.ops.mesh.primitive_torus_add(major_radius=braids.BUNDLE_R + 0.0012, minor_radius=0.0016, location=p)
        tor = bpy.context.active_object
        tor.rotation_euler = t.to_track_quat("Z", "Y").to_euler()
        tor.name = f"{name}_tie_{i}"
        tor.data.materials.append(tm)
        objs.append(tor)
    print(f"hair: scalp {len(scalp.lines)}, braid {len(braid.lines)}, tails {len(tails.lines)}, wisps {len(wisps.lines)} curves")
    return objs


def brows_and_lashes(body, L, marks, landmarks, name, rng=None):
    """Brows: short fibres on the brow ridge, angled up-and-out at the head of the brow, flatter along it; the arch
    from the painting (peak two-thirds out). Lashes: curling fibres along each upper lid's margin, short ones below."""
    rng = rng or random.Random(7)
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(body, dg)
    brows, lashes = Curves(), Curves()
    r_eye = landmarks["eye_radius"]
    for side, s in (("r", -1), ("l", 1)):
        c = landmarks["eyes"][side]
        S = side.upper()
        inner, outer = marks[f"eye_inner_{S}"], marks[f"eye_outer_{S}"]
        # The brow's line, front-projected onto the skin.
        ctrl = [Vector((inner.x - s * 0.001, 0, c.z + 0.0155)), Vector((c.x - s * 0.002, 0, c.z + 0.0205)),
                Vector((c.x + s * 0.011, 0, c.z + 0.0215)), Vector((outer.x + s * 0.007, 0, c.z + 0.012))]
        line = braids._catmull(ctrl, 60)
        for _ in range(950):
            f = rng.random()
            p = line[min(int(f * 59), 59)]
            p = p + Vector((0, 0, rng.gauss(0, 0.0016 * (1.0 - 0.6 * f))))
            hit, nrm, _, _ = tree.ray_cast(Vector((p.x, -0.5, p.z)), Vector((0, 1, 0)))
            if hit is None:
                continue
            ang = math.radians(70 - 60 * min(1.0, f * 1.6))  # up at the head, along the line further out
            d = Vector((s * math.cos(ang), 0, math.sin(ang)))
            d = (d - nrm * d.dot(nrm) * 0.85).normalized()
            length = rng.uniform(0.004, 0.008)
            pts = [hit + nrm * 0.0002 + d * length * k / 4 + nrm * 0.0006 * math.sin(math.pi * k / 4) for k in range(5)]
            brows.add(pts, 0.00006, 0.000015)
        # Lashes: the lid margin is where the skin meets the eyeball.
        rim = []
        for v in body.data.vertices:
            d = v.co - c
            if d.length - r_eye < 0.0012 and d.y < -r_eye * 0.4:  # the lid's margin lies on the eyeball
                rim.append(v.co.copy())
        up = sorted([p for p in rim if p.z > c.z + r_eye * 0.1], key=lambda p: p.x)
        lo = sorted([p for p in rim if p.z < c.z - r_eye * 0.1], key=lambda p: p.x)
        print(f"lid margin {side}: {len(up)} upper, {len(lo)} lower vertices")
        for row, n_l, length, curl in ((up, 220, 0.0095, 1.0), (lo, 80, 0.0045, -1.0)):
            if len(row) < 4:
                continue
            for _ in range(n_l):
                k = rng.random() * (len(row) - 1)
                p = row[int(k)].lerp(row[min(int(k) + 1, len(row) - 1)], k - int(k))  # anywhere along the margin
                # Forward off the lid and curling up (down for the lower row), fanning out at the corners.
                fan = (p.x - c.x) / max(r_eye, 1e-6)
                out = (Vector((0, -1, 0)) + Vector((fan * 0.45, 0, curl * 0.35))).normalized()
                ln = length * rng.uniform(0.7, 1.1) * (0.6 + 0.4 * math.sin(math.pi * min(1, max(0, (p.x - row[0].x) / max(1e-6, row[-1].x - row[0].x)))))
                pts = []
                for k in range(6):
                    f = k / 5
                    pts.append(p + out * ln * f + Vector((0, 0, curl * 0.0035 * f * f)))
                lashes.add(pts, 0.00009, 0.000015)
    m = hair_material("brow_hero", 0.62, 0.55, 0.5, 0.35)
    lm = hair_material("lash_hero", 0.95, 0.9, 0.2, 0.3)
    return [brows.build(f"{name}_brows", m), lashes.build(f"{name}_lashes", lm)]
