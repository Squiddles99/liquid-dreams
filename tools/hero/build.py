"""The hero build (hero spec §2): blender --background --python build.py -- <preset.json> <out dir> [--views face,front,...]

Builds Shazza from the fitted preset: body, skin, eyes, hair, bikini and thongs, then the gate renders. Saves
<out>/<name>_hero.blend.
"""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import body as hero_body  # noqa: E402
import eyes  # noqa: E402
import garments  # noqa: E402
import skin  # noqa: E402
import strands  # noqa: E402
import studio  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
preset_path, out_dir = argv[:2]
out_dir = os.path.abspath(out_dir)
os.makedirs(out_dir, exist_ok=True)
views = argv[argv.index("--views") + 1].split(",") if "--views" in argv else ["face", "front", "q3", "side", "back"]
samples = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 256
preset = json.load(open(preset_path, encoding="utf-8"))
name = preset["name"]

body, rig, landmarks, marks, L, coords = hero_body.make(preset, preset_path.replace(".json", ".marks.json"))
skin.paint_masks(body, marks, preset["heightM"])
skin.paint_lidline(body, landmarks)
body.data.materials.clear()
body.data.materials.append(skin.material())
hair_objs = strands.build(body, rig, L, marks, preset, name, coords)
hair_objs += strands.brows_and_lashes(body, L, marks, landmarks, name)
garment_objs = garments.build(body, marks, L, name)
hero_body.smooth(body)
eye_objs = eyes.build(landmarks, name)

def arms_down(on=True):
    """The painting's stance for the gate renders: arms hanging about 12° out from vertical, elbows soft (the rest pose
    is MPFB's A-pose). Only the body deforms: nothing else she wears touches her arms."""
    from mathutils import Matrix, Vector as V
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    for side, s in (("l", 1), ("r", -1)):
        for bname, want in ((f"upperarm_{side}", V((s * 0.2, 0.02, -1.0))), (f"forearm_{side}", V((s * 0.12, -0.12, -1.0)))):
            pb = rig.pose.bones[bname]
            pb.matrix_basis = Matrix.Identity(4)
            bpy.context.view_layer.update()
            if not on:
                continue
            cur = (pb.tail - pb.head).normalized()
            R = cur.rotation_difference(want.normalized()).to_matrix().to_4x4()
            h = pb.head.copy()
            pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, f"{name}_hero.blend"))
cam = studio.setup(samples)
H = preset["heightM"]
eye_c = (landmarks["eyes"]["l"] + landmarks["eyes"]["r"]) / 2
face_t = (0.0, eye_c.y, eye_c.z - 0.03)
def expression(on):
    for k, w in preset.get("paintedExpression", {}).items():
        kb = body.data.shape_keys.key_blocks.get(k) if body.data.shape_keys else None
        if kb is not None:
            kb.value = w if on else 0.0


shots = {
    "face": (face_t, 0, 1.0, 105, 1200, 1500),
    "face_smile": (face_t, 0, 1.0, 105, 1200, 1500),
    "face_q3": (face_t, 35, 1.0, 105, 1200, 1500),
    "front": ((0, 0, H * 0.5), 0, 4.7, 85, 1100, 2000),
    "q3": ((0, 0, H * 0.5), 35, 4.7, 85, 1100, 2000),
    "side": ((0, 0, H * 0.5), 90, 4.7, 85, 1100, 2000),
    "back": ((0, 0, H * 0.5), 180, 4.7, 85, 1100, 2000),
}
arms_down(True)
for v in views:
    t, yaw, dist, lens, w, h = shots[v]
    expression(v.endswith("smile") or v in ("front",))
    studio.shoot(cam, os.path.join(out_dir, "renders", f"{name}_{v}.png"), t, yaw, dist, lens, w, h)
