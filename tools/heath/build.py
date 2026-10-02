"""Builds the heath kit (dune-up-close spec §3.1, §4.2): every kind × variant at L0 and L1, the atlas, the manifest."""
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
import kitio  # noqa: E402
from species import SPECIES, VARIANTS  # noqa: E402


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def build_variant(kind, v, hull, spec):
    """Task 8: a placeholder at L0 and L1, so the pipeline runs end to end. Tasks 9–11 grow the real plant."""
    objs = []
    for lod in (0, 1):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.5)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
        objs.append(mesh_object(f"plant_{kind}_{v}_L{lod}", bm))
    return objs, {}


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
            variants.append({"kind": kind, "variant": v, "lods": [{"name": o.name, "triangles": triangles(o)} for o in objs],
                             "boundsUnit": bounds(objs), "leafColour": [0, 0, 0], "checks": checks})
    kitio.export(objects, os.path.join(out_dir, "heathKit.glb"))
    kitio.write_manifest(os.path.join(out_dir, "heathKit.manifest.json"), variants, [],
                         {"file": "heathAtlas.png", "size": 2048, "tiles": {}})
    print(f"heath kit: {len(variants)} variants, {sum(triangles(o) for o in objects)} triangles")


main()
