"""Builds the heath kit (dune-up-close spec §3.1, §4.2): every kind × variant at L0 and L1, the atlas, the manifest."""
import os
import sys

import math

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import grow  # noqa: E402
import kitio  # noqa: E402
from species import BRANCH, SPECIES, VARIANTS  # noqa: E402


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def unit_scale(spec):
    """Metres → the unit plant, per axis: the footprint radius is 1 (half the kind's mean width), the height 1."""
    hx = (spec["widthM"][0] + spec["widthM"][1]) / 4
    hz = (spec["heightM"][0] + spec["heightM"][1]) / 2
    return Vector((1 / hx, 1 / hx, 1 / hz))


def smooth_normals(o, made):
    """Each tube vertex's normal points out from its ring's centre (custom split normals, as the braids' are)."""
    me = o.data
    me.shade_smooth()
    normals = [(0.0, 0.0, 1.0)] * len(me.vertices)
    for k, (vert, centre) in enumerate(made):
        n = (Vector(me.vertices[k].co) - centre)
        normals[k] = tuple(n.normalized()) if n.length > 1e-9 else (0.0, 0.0, 1.0)
    me.normals_split_custom_set_from_vertices(normals)


def build_variant(kind, v, hull, spec):
    """L0: the woody skeleton grown into the hull, as tubes. Leaves come in Task 10, L1 in Task 11."""
    sp = BRANCH[kind]
    sk = grow.skeleton(hull, sp, seed=(PLANT_KIND_SEED[kind] * 31 + v * 7) & 0xFFFF)
    scale = unit_scale(spec)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    col = bm.loops.layers.float_color.new("Col")
    made = grow.tubes(bm, sk, scale, uv, col)
    o0 = mesh_object(f"plant_{kind}_{v}_L0", bm)
    smooth_normals(o0, made)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    o1 = mesh_object(f"plant_{kind}_{v}_L1", bm)
    checks = {"pipeModel": grow.pipe_ok(sk), "branchesInsideHull": round(grow.inside_share(sk), 3), "nodes": len(sk.nodes)}
    return [o0, o1], checks


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
    objects, variants = [], []
    for kind in SPECIES:
        for v in range(VARIANTS):
            objs, checks = build_variant(kind, v, hulls[f"{kind}_{v}"], specs.get(kind))
            objects += objs
            if v == 0:
                s = unit_scale(specs[kind])
                preview(objs[:1], os.path.join(previews, f"{kind}_{v}_L0.png"), (1 / s.x, 1 / s.y, 1 / s.z))
            variants.append({"kind": kind, "variant": v, "lods": [{"name": o.name, "triangles": triangles(o)} for o in objs],
                             "boundsUnit": bounds(objs), "leafColour": [0, 0, 0], "checks": checks})
    kitio.export(objects, os.path.join(out_dir, "heathKit.glb"))
    kitio.write_manifest(os.path.join(out_dir, "heathKit.manifest.json"), variants, [],
                         {"file": "heathAtlas.png", "size": 2048, "tiles": {}})
    print(f"heath kit: {len(variants)} variants, {sum(triangles(o) for o in objects)} triangles")


main()
