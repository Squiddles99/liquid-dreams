"""Builds one surfer: blender --background --python build.py -- <preset.json> <out dir> <preview dir> (spec §3.1)."""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import bodymap  # noqa: E402
import export  # noqa: E402
import expressions  # noqa: E402
import face  # noqa: E402
import glasses  # noqa: E402
import hair  # noqa: E402
import mpfb_bridge  # noqa: E402
import previews  # noqa: E402
import rig_trim  # noqa: E402
import sculpt  # noqa: E402
import skin  # noqa: E402
import teeth  # noqa: E402
import wardrobe  # noqa: E402

preset_path, out_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:3]
preset = json.load(open(preset_path, encoding="utf-8"))
name = preset["name"]

bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human(preset["macro"])
mpfb_bridge.apply_targets(body, preset.get("face", {}))
rig = mpfb_bridge.add_game_rig(body)
body.name, rig.name = f"{name}_body", f"{name}_armature"
rig_trim.bake_shape(body)
expressions.load(body)
rig_trim.apply_transforms(rig, [body])
landmarks = rig_trim.delete_helpers(body)
expressions.scale(body, rig_trim.scale_to_height(body, rig, preset["heightM"], landmarks))
sculpt.smooth_anatomy(body, preset["heightM"], preset.get("smooth", []))
rig_trim.trim(rig, body)
rig_trim.decimate(body, preset["bodyTriangles"])
rig_trim.limit_weights(body)
rig_trim.materials(body, ["body", "lashes"])
coords = bodymap.bone_coords(body, rig)
L = bodymap.landmarks(body, rig, preset["heightM"], landmarks, coords)
weights = bodymap.bone_weights(body, rig)
expressions.breathe(body, weights)
print(f"morph deltas (mm): " + ", ".join(f"{m} {1000 * expressions.max_delta(body, m):.1f}" for m in expressions.MORPHS))
expressions.to_shape_keys(body)
head_tris = rig_trim.head_triangles(body)
wardrobe.paint_masks(body, weights, preset["heightM"])
face.shape_lashes(body, L, preset.get("lashes", {}))
face.paint(body, weights, L, preset.get("browWeight", 1.0))
spots = skin.pimples(body, coords, L, preset["pimpleSeed"]) if "pimpleSeed" in preset else []
hair_obj = hair.build(body, rig, preset["hair"], L, coords, name)
eye_obj = hair.eyes(rig, L, name)
face.colour_eyes(eye_obj, L)
rig_trim.single_material(hair_obj, "hair")
rig_trim.single_material(eye_obj, "eyes")
parts = [body, hair_obj, eye_obj]
if preset.get("glasses"):
    parts.append(glasses.build(rig, body, L, name))
if preset.get("teeth"):
    tooth = teeth.build(rig, L, name, "buck" if preset["teeth"] in (True, "buck") else "even")
    rig_trim.single_material(tooth, "teeth")
    parts.append(tooth)
if preset["boardies"]:
    shorts = wardrobe.boardies(body, rig, coords, weights, preset["heightM"], name)
    rig_trim.single_material(shorts, "boardies")
    parts.append(shorts)

checks = expressions.blink_check(body, L)
print(f"checks: {checks}")
export.glb(rig, parts, os.path.join(out_dir, f"{name}.glb"))
export.manifest(rig, parts, preset, os.path.join(out_dir, f"{name}.manifest.json"), mpfb_bridge.version(), L, spots, head_tris, checks)
previews.clay(body)
previews.sheet(name, preset["heightM"], preview_dir, "clay")
for outfit in preset["outfits"]:
    previews.dress(parts, preset, outfit)
    previews.sheet(name, preset["heightM"], preview_dir, outfit)
    previews.sheet(name, preset["heightM"], preview_dir, outfit, close=True)
previews.sheet(name, preset["heightM"], preview_dir, preset["outfits"][0], frame="face")
print(f"built {name}: {sum(len(p.vertices) - 2 for p in body.data.polygons)} body triangles")
