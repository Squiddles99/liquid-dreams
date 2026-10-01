"""The beach pile (walking spec §5): the crew's walking clothes and packs dropped on the sand where they changed.
blender --background --python pile.py -- <surfer dir> <out .glb> <preview dir>

Takes the hats, packs, thongs, Shazza's towel and Grommet's glasses from the three riders' glbs (in rest pose), and makes
the dropped tees, the folded cutoffs and T-Bone's towel here. Materials are `pile_<part>_<preset>` (the game shades
each with that rider's walking colour; src/surfer/pile.ts); the glasses keep `glasses` and `lens`. Everything rests on
y = 0 within 1.6 × 1.2 m. Blender axes: +z up."""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

sys.path.append(os.path.dirname(__file__))
import clothes  # noqa: E402
import previews  # noqa: E402

surfer_dir, out_glb, preview_dir = sys.argv[sys.argv.index("--") + 1:][:3]
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PRESETS = {n: json.load(open(os.path.join(REPO, "tools", "surfer", "presets", f"{n}.json"), encoding="utf-8")) for n in ("female", "male", "grommet")}
rng = random.Random(55)
parts = []  # (object, manifest part)


def material(obj, slot_names):
    """Rename the object's slots to the pile's material names (kept per face)."""
    for i, n in enumerate(slot_names):
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        m.use_nodes = True
        if i < len(obj.data.materials):
            obj.data.materials[i] = m
        else:
            obj.data.materials.append(m)


def take(name):
    """A rider's mesh from the imported glbs, in rest pose, unskinned and at identity."""
    obj = bpy.data.objects[name]
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    mw = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.vertex_groups.clear()
    return obj


def place(obj, rot, at, squash=1.0):
    """Rotate (Euler, degrees), squash its height, then rest it at `at` (x, y; its lowest point on z = at.z)."""
    me = obj.data
    c = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    R = Euler(tuple(math.radians(a) for a in rot)).to_matrix()
    for v in me.vertices:
        v.co = R @ (v.co - c)
        v.co.z *= squash
    low = min(v.co.z for v in me.vertices)
    for v in me.vertices:
        v.co += Vector((at[0], at[1], at[2] - low))
    me.update()


def top(obj):
    return max(v.co.z for v in obj.data.vertices)


def cloth_sheet(name, outline, at, rot_z, height=0.0, fold_at=None, seed=0):
    """A dropped garment: a flat outline (x, y) gridded, folded once across y at `fold_at` (the far part laid back over
    the near), crumpled by up to 2 cm, resting on `height`; COLOR_0 as the walking cloth (fold, open, no hem)."""
    xs = [p[0] for p in outline]
    ys = [p[1] for p in outline]
    bm = bmesh.new()
    nx, ny = 32, 32
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    grid = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny
            if _inside(outline, x, y):
                grid[(i, j)] = bm.verts.new((x, y, 0))
    for i in range(nx):
        for j in range(ny):
            q = [grid.get(k) for k in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
            if all(q):
                bm.faces.new(q)
    edge = [v for v in bm.verts if v.is_boundary]
    for _ in range(6):  # the grid's stair-stepped outline, smoothed along itself
        moved = {}
        for v in edge:
            ring = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(ring) == 2:
                moved[v] = v.co * 0.5 + (ring[0].co + ring[1].co) * 0.25
        for v, c in moved.items():
            v.co = c
    for v in bm.verts:
        if fold_at is not None and v.co.y > fold_at:
            v.co.y = 2 * fold_at - v.co.y
            v.co.z += 0.012 + 0.006 * (v.co.y - fold_at) ** 2
        v.co.z += 0.004 + 0.02 * max(0.0, noise.noise(Vector((v.co.x, v.co.y, seed)) * 6.0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    R = Matrix.Rotation(math.radians(rot_z), 3, "Z")
    for v in me.vertices:
        v.co = R @ v.co + Vector((at[0], at[1], height))
    clothes._colors(obj, [clothes._fold(v.co, 12.0) for v in me.vertices], [1.0] * len(me.vertices))
    return obj


def _inside(poly, x, y):
    c = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            c = not c
    return c


def tee_outline(scale):
    """A tee laid flat: body 50 × 70 cm, sleeves out 20 cm (scaled to the rider and the fit)."""
    b, h, s, sl = 0.25 * scale, 0.7 * scale, 0.2 * scale, 0.18 * scale
    return [(-b, 0), (b, 0), (b, h - sl), (b + s, h - sl * 0.6), (b + s * 0.8, h), (-b - s * 0.8, h), (-b - s, h - sl * 0.6), (-b, h - sl)]


bpy.ops.wm.read_homefile(use_empty=True)
for n in PRESETS:
    bpy.ops.import_scene.gltf(filepath=os.path.join(surfer_dir, f"{n}.glb"))

# Towels first (everything else rests on them): Shazza's striped one from her rucksack, unrolled; T-Bone's plain.
t1 = cloth_sheet("pile_towel_f", [(-0.42, -0.25), (0.42, -0.25), (0.42, 0.25), (-0.42, 0.25)], (-0.3, 0.08), 8, seed=1)
material(t1, ["pile_towel_female"])
stripes = t1.data.color_attributes["Color"]
for i, v in enumerate(t1.data.vertices):
    c = stripes.data[i].color
    stripes.data[i].color = (1.0 if math.sin(v.co.x * 2 * math.pi / 0.06) > 0.2 else 0.0, c[1], c[2], 1.0)
t2 = cloth_sheet("pile_towel_m", [(-0.4, -0.22), (0.4, -0.22), (0.4, 0.22), (-0.4, 0.22)], (0.32, -0.12), -14, seed=2)
material(t2, ["pile_towel_male"])
parts += [(t1, ("towel", "female")), (t2, ("towel", "male"))]

# The packs, lying on their backs and slumped (20 % lower), Grommet's fins still clipped to his.
packs = {}
for n, at, rz in (("female", (-0.46, 0.2), 12), ("male", (0.44, 0.18), -20), ("grommet", (0.0, 0.21), 4)):
    obj = take(f"{n}_pack")
    # Off his back, the straps flop flat against the back panel (they reached round his chest: lying down they'd
    # stand the bag up on them like legs).
    me = obj.data
    bag = [me.vertices[i].co for p in me.polygons if p.material_index == 0 for i in p.vertices]
    face, reach = min(c.y for c in bag), min(v.co.y for v in me.vertices)
    for v in me.vertices:
        if v.co.y < face:
            v.co.y = face - 0.02 * (face - v.co.y) / max(face - reach, 1e-6)
    place(obj, (90, 0, rz), (at[0], at[1], 0.004), squash=0.8)
    material(obj, [f"pile_pack_{n}", f"pile_packTrim_{n}"])
    packs[n] = obj
    parts.append((obj, ("pack", n)))
fins = take("grommet_fins")
place(fins, (90, 0, 4), (0.24, 0.3, 0.004))
material(fins, ["pile_fins_grommet"])
parts.append((fins, ("fins", "grommet")))

# The tees, dropped and half folded; Shazza's cutoffs folded on hers.
for n, at, rz, height, scale in (("female", (-0.22, -0.2), 22, 0.006, 1.0), ("male", (0.34, -0.22), -30, 0.006, 1.05), ("grommet", (-0.02, -0.02), 70, 0.0, 1.2)):
    s = scale * PRESETS[n]["heightM"] / 1.7
    obj = cloth_sheet(f"pile_tee_{n}", tee_outline(s), at, rz, height, fold_at=0.42 * s, seed=3 + len(parts))
    material(obj, [f"pile_tee_{n}"])
    parts.append((obj, ("tee", n)))
cut = cloth_sheet("pile_shorts", [(-0.17, -0.12), (0.17, -0.12), (0.17, 0.14), (-0.17, 0.14)], (-0.26, -0.24), 35, 0.03, fold_at=0.02, seed=9)
material(cut, ["pile_shorts_female"])
parts.append((cut, ("shorts", "female")))

# The hats, crown up: T-Bone's cap on his tee, Grommet's bucket hat beside his bag.
cap = take("male_cap")
place(cap, (0, 0, 160), (0.36, -0.26, 0.03))
material(cap, ["pile_cap_male", "pile_capFront_male"])
bucket = take("grommet_bucketHat")
place(bucket, (0, 0, 30), (-0.05, -0.06, 0.006))
material(bucket, ["pile_bucketHat_grommet"])
parts += [(cap, ("hat", "male")), (bucket, ("hat", "grommet"))]

# The thongs, a pair each, along the front.
for n, x in (("female", -0.38), ("male", 0.38), ("grommet", 0.0)):
    obj = take(f"{n}_thongs")
    place(obj, (0, 0, rng.uniform(-25, 25)), (x, -0.36, 0.0))
    material(obj, [f"pile_thongs_{n}"])
    parts.append((obj, ("thongs", n)))

# Grommet's glasses, folded on his school bag.
glasses = take("grommet_glasses")
bag = packs["grommet"]
bag_c = sum((v.co for v in bag.data.vertices), Vector()) / len(bag.data.vertices)
place(glasses, (0, 0, 15), (bag_c.x, bag_c.y, top(bag) - 0.002))  # set down open, as on a table
parts.append((glasses, ("glasses", "grommet")))

# Everything else imported goes.
keep = {o for o, _ in parts}
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)

# Centre the pile on the origin, resting on z = 0.
lo = Vector((min(v.co.x for o, _ in parts for v in o.data.vertices), min(v.co.y for o, _ in parts for v in o.data.vertices), 0))
hi = Vector((max(v.co.x for o, _ in parts for v in o.data.vertices), max(v.co.y for o, _ in parts for v in o.data.vertices), 0))
shift = -(lo + hi) / 2
zlow = min(v.co.z for o, _ in parts for v in o.data.vertices)
for o, _ in parts:
    for v in o.data.vertices:
        v.co += Vector((shift.x, shift.y, -zlow))
    o.data.update()
others = [o for o, _ in parts]
for o, (part, _) in parts:
    if part in ("tee", "shorts", "towel", "pack", "hat") and "Color" in o.data.color_attributes:
        clothes.bake_ao(o, [x for x in others if x is not o], reach=0.06)

bpy.ops.object.select_all(action="DESELECT")
for o, _ in parts:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True, export_skins=False,
                          export_animations=False, export_morph=False, export_texcoords=False, export_normals=True,
                          export_materials="EXPORT", export_vertex_color="ACTIVE")
size = (hi - lo)
json.dump({"parts": [{"name": o.name, "part": p, "preset": n} for o, (p, n) in parts], "footprint": [round(size.x, 3), round(size.y, 3)]},
          open(out_glb.replace(".glb", ".manifest.json"), "w", encoding="utf-8"), indent=1)
print(f"pile: {len(parts)} parts, {size.x:.2f} × {size.y:.2f} m")

# A preview sheet in the riders' colours.
colours = {}
for n, p in PRESETS.items():
    pv = p["walking"]["preview"]
    for part, key in (("tee", "tee"), ("shorts", "denim"), ("cap", "cap"), ("capFront", "capFront"), ("bucketHat", "bucketHat"), ("pack", "pack"),
                      ("packTrim", "packTrim"), ("towel", "towel"), ("thongs", "thongs"), ("fins", "fins")):
        if key in pv:
            colours[f"pile_{part}_{n}"] = pv[key]
for m in bpy.data.materials:
    bsdf = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*colours.get(m.name, (0.03, 0.03, 0.03)), 1)
# Views from standing height, 1.5 m and 4 m away (walking spec §7's gate).
previews.FRAMES["pile"] = (1.5, 0.0, 1.0, "")
previews.FRAMES["pileFar"] = (4.0, 0.0, 1.6, "-far")
previews.sheet("beachPile", 1.0, preview_dir, "pile", frame="pile")
previews.sheet("beachPile", 1.0, preview_dir, "pile", frame="pileFar")
