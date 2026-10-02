"""The heath kit's I/O (dune-up-close spec §3.1): the hull envelopes in, the glb and the manifest out."""
import json

import bpy
from mathutils import Vector


def gl_to_b(p):
    """glTF (x, y up, z) → Blender (x, −z, y)."""
    return Vector((p[0], -p[2], p[1]))


def load_hulls(path):
    """Each kind × variant's hull as (points, triangles) in Blender axes: the unit plant, base at z 0, top about 1."""
    data = json.load(open(path))
    hulls = {}
    for key, h in data["hulls"].items():
        pos = h["positions"]
        pts = [gl_to_b(pos[i:i + 3]) for i in range(0, len(pos), 3)]
        idx = h["indices"]
        tris = [tuple(idx[i:i + 3]) for i in range(0, len(idx), 3)]
        hulls[key] = (pts, tris)
    return data["specs"], hulls


def export(objects, glb_path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials="NONE",
                              export_vertex_color="ACTIVE", export_apply=True)


def write_manifest(path, variants, items, atlas):
    json.dump({"version": 1, "units": "unit", "variants": variants, "items": items, "atlas": atlas},
              open(path, "w"), indent=1)
