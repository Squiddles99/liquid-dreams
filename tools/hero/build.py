"""The hero build (hero spec §2): blender --background --python build.py -- <preset.json> <out dir> [--views face,front,...]

Builds Shazza from the fitted preset: body, skin, eyes, hair, bikini and thongs, then the gate renders. Saves
<out>/<name>_hero.blend.
"""
import json
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import body as hero_body  # noqa: E402
import eyes  # noqa: E402
import garments  # noqa: E402
import project  # noqa: E402
import rigging  # noqa: E402
import skin  # noqa: E402
import strands  # noqa: E402
import studio  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
preset_path, out_dir = argv[:2]
out_dir = os.path.abspath(out_dir)
os.makedirs(out_dir, exist_ok=True)
views = [v for v in argv[argv.index("--views") + 1].split(",") if v] if "--views" in argv else ["face", "front", "q3", "side", "back"]
pose_names = argv[argv.index("--poses") + 1].split(",") if "--poses" in argv else []
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


def expression(on):
    keys = body.data.shape_keys.key_blocks
    for k in keys[1:]:
        k.value = 0.0
    for k, w in {**preset.get("restExpression", {}), **(preset.get("paintedExpression", {}) if on else {})}.items():
        if keys.get(k) is not None:
            keys[k].value = w


# The painting's face baked onto the face, with the painting's expression on (project.py).
if preset.get("faceCamera"):
    project.paint_mask(body, L, landmarks)
    expression(True)
    png = project.bake(body, preset["faceCamera"], landmarks["scale"], os.path.abspath("art/riders/female/bikini.png"),
                       os.path.join(out_dir, f"{name}_faceproj.png"))
    expression(False)
    project.add_to_skin(body.data.materials[0], png, project.tone_stats(png, body))

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

if pose_names:
    # Gate 1c: the rig's twist bones, what she wears bound to it, and the surf poses on a board (no thongs in the surf).
    arms_down(False)
    rigging.add_twists(rig, body)
    head_parts = [o for o in hair_objs if any(k in o.name for k in ("Scalp", "Wisps", "brows", "lashes"))] + eye_objs
    chest_parts = [o for o in hair_objs if o not in head_parts]
    rigid = {o: "head" for o in head_parts}
    rigid.update({o: "spine_03" for o in chest_parts})
    worn = [o for o in garment_objs if "thong" not in o.name and "strap" not in o.name]
    for o in garment_objs:
        if o not in worn:
            o.hide_render = True
    rigging.bind(rig, body, worn, rigid)
    surf = rigging.board(f"{name}_board")
    for pn in pose_names:
        lo, hi = rigging.pose(rig, pn, body)
        expression(True)
        c = (lo + hi) / 2
        prone = rigging.POSES[pn]["turn"] != 0
        if prone:  # along her length (her head toward -y), under her chest and hips
            surf.rotation_euler = (0, 0, math.radians(90))
            surf.location = (0, c[1] + 0.12, 0.0)
        else:  # across her stance, under her feet
            surf.rotation_euler = (0, 0, 0)
            surf.location = (c[0], c[1] - 0.02, 0.0)
        size = max(hi - lo) + 0.4
        cam.data.lens = 50
        cam.data.dof.use_dof = False
        studio.shoot(cam, os.path.join(out_dir, "renders", f"{name}_pose_{pn}.png"), (c[0], c[1], c[2]), 35 if not prone else 60,
                     size * 1.25 / (36 / 50) * 0.75, 50, 1600, 1200, pitch_deg=18 if not prone else 28)
