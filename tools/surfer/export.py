"""The .glb and its manifest (spec §3.1)."""
import json

import bpy


def glb(rig, meshes, path):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_skins=True, export_animations=False, export_morph=False,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT",
                              export_vertex_color="ACTIVE")


def manifest(rig, meshes, preset, path, mpfb_version, L=None, pimples=()):
    def gl(v):  # Blender (x, y, z) → glTF (x, z, -y)
        return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]
    data = {
        "name": preset["name"],
        "heightM": preset["heightM"],
        "bones": [{"name": b.name, "parent": b.parent.name if b.parent else None, "head": gl(b.head_local), "tail": gl(b.tail_local)} for b in rig.data.bones],
        "meshes": [{"name": m.name, "triangles": sum(len(p.vertices) - 2 for p in m.data.polygons), "materials": [s.material.name for s in m.material_slots if s.material]} for m in meshes],
        "blender": bpy.app.version_string,
        "mpfb": mpfb_version,
    }
    if L is not None:
        eyes = [L["eyes"].get(s) for s in ("l", "r")]
        if all(e is not None for e in eyes) and all(L.get(k) is not None for k in ("nose", "lip_front", "mouth")):
            data["landmarks"] = {
                "eyes": [gl(e) for e in eyes], "ears": [gl(L["ears"]["l"]), gl(L["ears"]["r"])], "nose": gl(L["nose"]),
                "mouth": gl(L["mouth"]), "lipFront": gl(L["lip_front"]),
                "teethFront": gl(L["upper_teeth"]["front"]) if L.get("upper_teeth") else gl(L["mouth"]),
            }
    if pimples:
        data["skin"] = {"pimples": [gl(c) + [round(r, 5)] for c, r in pimples]}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
