"""Builds one surfer: blender --background --python build.py -- <preset.json> <out dir> <preview dir> (spec §3.1)."""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import export  # noqa: E402
import mpfb_bridge  # noqa: E402
import previews  # noqa: E402
import rig_trim  # noqa: E402

preset_path, out_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:3]
preset = json.load(open(preset_path, encoding="utf-8"))
name = preset["name"]

bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human(preset["macro"])
rig = mpfb_bridge.add_game_rig(body)
body.name, rig.name = f"{name}_body", f"{name}_armature"
rig_trim.bake_shape(body)
rig_trim.apply_transforms(rig, [body])
landmarks = rig_trim.delete_helpers(body)
rig_trim.scale_to_height(body, rig, preset["heightM"], landmarks)
rig_trim.trim(rig, body)
rig_trim.decimate(body, preset["bodyTriangles"])
rig_trim.limit_weights(body)
rig_trim.single_material(body, "body")
parts = [body]

export.glb(rig, parts, os.path.join(out_dir, f"{name}.glb"))
export.manifest(rig, parts, preset, os.path.join(out_dir, f"{name}.manifest.json"), mpfb_bridge.version())
previews.clay(body)
previews.sheet(name, preset["heightM"], preview_dir, "clay")
print(f"built {name}: {sum(len(p.vertices) - 2 for p in body.data.polygons)} body triangles")
