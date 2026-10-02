"""Builds the heath kit (dune-up-close spec §3.1, §4.2): every kind × variant at L0 and L1, the atlas, the manifest."""
import os
import sys

import math
import random

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import atlas  # noqa: E402
import atlas_layout  # noqa: E402
import grow  # noqa: E402
import kitio  # noqa: E402
import leaves  # noqa: E402
import lods  # noqa: E402
import species  # noqa: E402
from species import BRANCH, CARD_LEAF, FLOWER, L0_CAP, LEAF, SPECIES, VARIANTS  # noqa: E402


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if "Col" in me.color_attributes:
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def atlas_uv(name, u, v):
    """A tile's (u, v) (v 0 at the top) → Blender's UV for the atlas (the glTF export flips v)."""
    U, V = atlas_layout.map_uv(name, u, v)
    return (U, 1 - V)


def unit_scale(spec):
    """Metres → the unit plant, per axis: the footprint radius is 1 (half the kind's mean width), the height 1."""
    hx = (spec["widthM"][0] + spec["widthM"][1]) / 4
    hz = (spec["heightM"][0] + spec["heightM"][1]) / 2
    return Vector((1 / hx, 1 / hx, 1 / hz))


def smooth_normals(o, made, extra=()):
    """Each tube vertex's normal points out from its ring's centre (custom split normals, as the braids' are); the
    vertices after the tubes (leaves, flowers) take `extra`, their triangles' own normals, in creation order."""
    me = o.data
    me.shade_smooth()
    normals = [(0.0, 0.0, 1.0)] * len(me.vertices)
    for k, (vert, centre) in enumerate(made):
        n = (Vector(me.vertices[k].co) - centre)
        normals[k] = tuple(n.normalized()) if n.length > 1e-9 else (0.0, 0.0, 1.0)
    for k, n in enumerate(extra):
        normals[len(made) + k] = tuple(n)
    me.normals_split_custom_set_from_vertices(normals)


def bad_normals(me):
    return sum(1 for cn in me.corner_normals if not (Vector(cn.vector).length >= 0.5))


def foliage(bm, sk, kind, scale, uv, col, rng, budget):
    """The leaves and flowers on L0 (§4.2 step 3); returns their vertex normals, the leaf bases (metres) and the
    leaf-area-weighted colour."""
    normals, bases = [], []
    if kind not in LEAF:
        return normals, bases, (0.0, 0.0, 0.0)
    lf = LEAF[kind]
    nodes = [Vector((n.x / scale.x, n.y / scale.y, n.z / scale.z)) for n in sk.nodes]
    centre = Vector((0, 0, 0.55))
    acc, area = Vector((0, 0, 0)), 0.0
    # The leaves take what the cap leaves after the flowers (a spray is 2 triangles, a finger 3).
    flowers = FLOWER[kind]["count"] * FLOWER[kind]["petals"] if kind in FLOWER else 0
    per = 3 if lf["form"] == "finger" else 2
    room = max(0, (budget - flowers - 40) // per)
    for j, d, n in leaves.place_leaves(sk, nodes, lf, rng)[:room]:
        base = nodes[j] + d * sk.radius[j]
        bases.append(base)
        length, width = lf["length"] * rng.uniform(0.8, 1.2), lf["width"] * rng.uniform(0.85, 1.15)
        if lf["form"] == "finger":
            tris, name = leaves.finger_tris(base, d, n, length, width), f"spray_{kind}_0"
        else:
            tris, name = leaves.spray_tris(base, d, n, length, width), f"spray_{kind}_{rng.randrange(3)}"
        leaves.add_tris(bm, tris, uv, col, (1.0, sk.depth[j], rng.random(), leaves.LEAF), scale, normals,
                        lambda u, v, name=name: atlas_uv(name, u, v), bend_to=centre if lf["form"] == "spray" else None)
        acc += Vector(lf["colour"]) * length * width
        area += length * width
    if kind in FLOWER:
        fl = FLOWER[kind]
        tips = [i for i in range(len(sk.nodes)) if not sk.kids[i] and not sk.dead[i]]
        for i in rng.sample(tips, min(fl["count"], len(tips))):
            p = sk.parent[i]
            up = (nodes[i] - nodes[p]).normalized() if p >= 0 else Vector((0, 0, 1))
            if kind == "pigface":
                up = (up + Vector((0, 0, 2))).normalized()
            leaves.add_tris(bm, leaves.flower_tris(nodes[i] + up * 0.01, up, fl["radius"], fl["petals"]), uv, col,
                            (1.0, sk.depth[i], rng.random(), leaves.FLOWER), scale, normals,
                            lambda u, v: atlas_uv(f"spray_{kind}_3", u, v))
    colour = tuple(round(ch / area, 4) for ch in acc) if area > 0 else (0.0, 0.0, 0.0)
    return normals, bases, colour


def leaf_attachment(sk, bases, scale):
    """The farthest any leaf's base lies off the wood (m): its distance to the nearest skeleton segment less that
    segment's radius."""
    nodes = [Vector((n.x / scale.x, n.y / scale.y, n.z / scale.z)) for n in sk.nodes]
    kd = grow._kd(nodes)
    worst = 0.0
    for b in bases:
        best = 1e9
        for _, i, _ in kd.find_n(b, 3):
            for a in ([sk.parent[i]] if sk.parent[i] >= 0 else []) + sk.kids[i]:
                p, q = nodes[i], nodes[a]
                e = q - p
                t = max(0.0, min(1.0, (b - p).dot(e) / max(e.length_squared, 1e-12)))
                best = min(best, (b - (p + e * t)).length - max(sk.radius[i], sk.radius[a]))
            best = min(best, (b - nodes[i]).length - sk.radius[i])
        worst = max(worst, best)
    return round(worst, 4)


def build_variant(kind, v, hull, spec):
    """L0: the woody skeleton grown into the hull, as tubes. Leaves come in Task 10, L1 in Task 11."""
    sp = BRANCH[kind]
    sk = grow.skeleton(hull, sp, seed=(PLANT_KIND_SEED[kind] * 31 + v * 7) & 0xFFFF)
    scale = unit_scale(spec)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    col = bm.loops.layers.float_color.new("Col")
    made = grow.tubes(bm, sk, scale, uv, col, uv_of=lambda dead, u, v: atlas_uv("deadBark" if dead else "bark", u, v))
    rng = random.Random(PLANT_KIND_SEED[kind] * 977 + v)
    wood = sum(len(f.verts) - 2 for f in bm.faces)
    extra, bases, colour = foliage(bm, sk, kind, scale, uv, col, rng, L0_CAP[kind] - wood)
    o0 = mesh_object(f"plant_{kind}_{v}_L0", bm)
    smooth_normals(o0, made, extra)
    ao_min, ao_max = leaves.bake_ao(o0.data)
    pts = [vv.co.copy() for vv in o0.data.vertices]
    samples = leaves.surface_samples(o0.data)
    grown = leaves.grown_tree(hull)
    outside = sum(1 for p in pts if not grow.inside(grown, Vector((p.x, p.y, max(p.z, 0.02))))) / max(1, len(pts))
    bm = bmesh.new()
    uv1 = bm.loops.layers.uv.new("UVMap")
    col1 = bm.loops.layers.float_color.new("Col")
    card_kind = kind if kind in CARD_LEAF else None
    if kind == "dead":
        # Bare twigs are under a pixel at 25 m: twig-cluster cards over the dead shrub's tips (its L1 vanished).
        bases = [Vector((n.x / scale.x, n.y / scale.y, n.z / scale.z)) for i, n in enumerate(sk.nodes) if not sk.kids[i]]
    made1, extra1 = lods.l1(bm, sk, scale, uv1, col1, kind, bases if card_kind else [],
                            lambda t, u, vv: atlas_uv(f"card_{card_kind}_0_{t}", u, vv),
                            lambda dead, u, vv: atlas_uv("deadBark" if dead else "bark", u, vv),
                            random.Random(PLANT_KIND_SEED[kind] * 131 + v), flat=kind == "pigface")
    o1 = mesh_object(f"plant_{kind}_{v}_L1", bm)
    smooth_normals(o1, made1, extra1)
    checks = {
        "pipeModel": grow.pipe_ok(sk), "branchesInsideHull": round(grow.inside_share(sk), 3), "nodes": len(sk.nodes),
        "leavesAttached": leaf_attachment(sk, bases, scale) if bases else 0.0,
        "silhouetteTop": round(leaves.coverage(samples, sk.tree, 2), 3), "silhouetteSide": round(leaves.coverage(samples, sk.tree, 1), 3),
        "outsideHull": round(outside, 4), "badNormals": bad_normals(o0.data), "badNormalsL1": bad_normals(o1.data),
        "aoMin": round(ao_min, 3), "aoMax": round(ao_max, 3),
    }
    return [o0, o1], checks, colour


PLANT_KIND_SEED = {k: i + 1 for i, k in enumerate(SPECIES)}


def preview(objs, path, scale=(1, 1, 1)):
    """A side view of the L0 (Workbench, orthographic) at the kind's real proportions (the unit plant scaled back by
    `scale`: half its mean width, its mean height), for looking at."""
    scene = bpy.context.scene
    for o in objs:
        o.scale = scale
    for o in scene.objects:
        o.hide_render = o not in objs
    cam = bpy.data.objects.get("previewCam")
    if cam is None:
        cam = bpy.data.objects.new("previewCam", bpy.data.cameras.new("previewCam"))
        scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.2
    cam.location = (0, -6, 0.8)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "VERTEX"
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in objs:
        o.scale = (1, 1, 1)


def triangles(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def bounds(objs):
    """The unit plant's extent in glTF axes: max |x|, max height, max |z|."""
    co = [v.co for o in objs for v in o.data.vertices]
    return [round(max(abs(c.x) for c in co), 4), round(max(c.z for c in co), 4), round(max(abs(c.y) for c in co), 4)]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    hull_file, out_dir, previews = argv[:3]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    specs, hulls = kitio.load_hulls(hull_file)
    objects, variants, canopy = [], [], {}
    for kind in SPECIES:
        for v in range(VARIANTS):
            objs, checks, colour = build_variant(kind, v, hulls[f"{kind}_{v}"], specs.get(kind))
            objects += objs
            canopy[f"canopy_{kind}_{v}"] = (objs[0], 1.0)
            if v == 0:
                s = unit_scale(specs[kind])
                preview(objs[:1], os.path.join(previews, f"{kind}_{v}_L0.png"), (1 / s.x, 1 / s.y, 1 / s.z))
            variants.append({"kind": kind, "variant": v, "lods": [{"name": o.name, "triangles": triangles(o)} for o in objs],
                             "boundsUnit": bounds(objs), "leafColour": list(colour), "checks": checks})
    tiles = atlas.build(bpy.context.scene, previews, out_dir, species, canopy)
    for o in bpy.context.scene.objects:
        o.hide_render = False
    kitio.export(objects, os.path.join(out_dir, "heathKit.glb"))
    kitio.write_manifest(os.path.join(out_dir, "heathKit.manifest.json"), variants, [],
                         {"file": "heathAtlas.png", "size": 2048, "tiles": {k: [round(x, 6) for x in t] for k, t in tiles.items()}})
    print(f"heath kit: {len(variants)} variants, {sum(triangles(o) for o in objects)} triangles")


main()
