"""Likeness fit, step 1 (hero spec §3.3): the fit's linear model, exported from MPFB for the solver.

blender --background --python fit_export.py -- <preset.json> <out dir>

Writes <out>/fit_model.npz: the current body (the preset's macros + face targets) as `base`, and one delta per
candidate variable (an MPFB detail target, paired l-/r- targets as one symmetric variable; a macro as its numerical
derivative), plus each joint's vertex indices and the body/eye masks. And two orthographic front clay renders with
their pixel → model mapping (`marks_cam.json`), on which the model marks are picked (plan Task 3).
"""
import json
import os
import sys

import bpy
import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "surfer"))
import mpfb_bridge  # noqa: E402

preset_path, out_dir = sys.argv[sys.argv.index("--") + 1:][:2]
out_dir = os.path.abspath(out_dir)
os.makedirs(out_dir, exist_ok=True)
preset = json.load(open(preset_path, encoding="utf-8"))

# The candidate variables: (name, [targets loaded at weight 1 together]). Paired sides move together (the painting's
# asymmetry is head roll and pose, not shape). Depth-only targets are left out: one front view can't see them.
SIDED = [
    "eye-scale-incr", "eye-scale-decr", "eye-trans-up", "eye-trans-down", "eye-trans-in", "eye-trans-out",
    "eye-corner1-up", "eye-corner1-down", "eye-corner2-up", "eye-corner2-down",
    "eye-height1-incr", "eye-height1-decr", "eye-height2-incr", "eye-height2-decr", "eye-height3-incr", "eye-height3-decr",
    "cheek-bones-incr", "cheek-bones-decr", "cheek-inner-incr", "cheek-inner-decr", "cheek-volume-incr", "cheek-volume-decr",
    "cheek-trans-up", "cheek-trans-down",
    "upperarm-scale-horiz-incr", "upperarm-scale-horiz-decr", "lowerarm-scale-horiz-incr", "lowerarm-scale-horiz-decr",
    "upperarm-shoulder-muscle-incr", "upperarm-shoulder-muscle-decr",
    "upperleg-scale-horiz-incr", "upperleg-scale-horiz-decr", "lowerleg-scale-horiz-incr", "lowerleg-scale-horiz-decr",
    "upperleg-muscle-incr", "upperleg-muscle-decr", "lowerleg-muscle-incr", "lowerleg-muscle-decr",
    "upperleg-fat-incr", "upperleg-fat-decr", "lowerleg-fat-incr", "lowerleg-fat-decr",
    "leg-valgus-incr", "leg-valgus-decr",
]
SINGLE = [
    "eyebrows-angle-up", "eyebrows-angle-down", "eyebrows-trans-up", "eyebrows-trans-down",
    "nose-scale-horiz-incr", "nose-scale-horiz-decr", "nose-scale-vert-incr", "nose-scale-vert-decr",
    "nose-trans-up", "nose-trans-down", "nose-point-width-incr", "nose-point-width-decr",
    "nose-nostrils-width-incr", "nose-nostrils-width-decr", "nose-flaring-incr", "nose-flaring-decr",
    "nose-base-up", "nose-base-down", "nose-width1-incr", "nose-width1-decr", "nose-width2-incr", "nose-width2-decr",
    "nose-width3-incr", "nose-width3-decr", "nose-point-up", "nose-point-down",
    "mouth-scale-horiz-incr", "mouth-scale-horiz-decr", "mouth-scale-vert-incr", "mouth-scale-vert-decr",
    "mouth-trans-up", "mouth-trans-down",
    "mouth-upperlip-height-incr", "mouth-upperlip-height-decr", "mouth-lowerlip-height-incr", "mouth-lowerlip-height-decr",
    "mouth-upperlip-width-incr", "mouth-upperlip-width-decr", "mouth-lowerlip-width-incr", "mouth-lowerlip-width-decr",
    "mouth-upperlip-volume-incr", "mouth-upperlip-volume-decr", "mouth-lowerlip-volume-incr", "mouth-lowerlip-volume-decr",
    "mouth-cupidsbow-width-incr", "mouth-cupidsbow-width-decr",
    "chin-height-incr", "chin-height-decr", "chin-width-incr", "chin-width-decr", "chin-jaw-drop-incr", "chin-jaw-drop-decr",
    "chin-bones-incr", "chin-bones-decr", "chin-triangle",
    "forehead-scale-vert-incr", "forehead-scale-vert-decr", "forehead-temple-incr", "forehead-temple-decr",
    "head-scale-horiz-incr", "head-scale-horiz-decr", "head-scale-vert-incr", "head-scale-vert-decr",
    "head-oval", "head-round", "head-square", "head-triangular", "head-invertedtriangular", "head-diamond",
    "head-rectangular", "head-fat-incr", "head-fat-decr", "head-age-incr", "head-age-decr",
    "neck-scale-horiz-incr", "neck-scale-horiz-decr", "measure-neck-circ-incr", "measure-neck-circ-decr",
    "measure-neck-height-incr", "measure-neck-height-decr",
    "measure-bust-circ-incr", "measure-bust-circ-decr", "measure-underbust-circ-incr", "measure-underbust-circ-decr",
    "measure-waist-circ-incr", "measure-waist-circ-decr", "measure-hips-circ-incr", "measure-hips-circ-decr",
    "measure-shoulder-dist-incr", "measure-shoulder-dist-decr", "measure-napetowaist-dist-incr", "measure-napetowaist-dist-decr",
    "measure-waisttohip-dist-incr", "measure-waisttohip-dist-decr", "measure-frontchest-dist-incr", "measure-frontchest-dist-decr",
    "torso-scale-horiz-incr", "torso-scale-horiz-decr", "torso-scale-vert-incr", "torso-scale-vert-decr",
    "torso-vshape-incr", "torso-vshape-decr",
    "hip-scale-horiz-incr", "hip-scale-horiz-decr", "hip-scale-vert-incr", "hip-scale-vert-decr", "hip-waist-up", "hip-waist-down",
    "stomach-navel-up", "stomach-navel-down",
    "measure-upperarm-length-incr", "measure-upperarm-length-decr", "measure-lowerarm-length-incr", "measure-lowerarm-length-decr",
    "measure-upperarm-circ-incr", "measure-upperarm-circ-decr",
    "measure-thigh-circ-incr", "measure-thigh-circ-decr", "measure-calf-circ-incr", "measure-calf-circ-decr",
    "measure-knee-circ-incr", "measure-knee-circ-decr", "measure-upperleg-height-incr", "measure-upperleg-height-decr",
    "measure-lowerleg-height-incr", "measure-lowerleg-height-decr",
]
# The painting smiles: expression units join the fit as pose variables (`xp:`), reported but never baked into the
# shape (mouth-angles, a smile-like shape target, is left out for the same reason).
EXPRESSIONS = {"smile": ["mouth-corner-puller"], "smileUp": ["mouth-upward-retraction"],
               "squint": ["eye-left-slit", "eye-right-slit"]}
MACROS = {"muscle": 0.05, "weight": 0.05, "proportions": 0.05, "cupsize": 0.05}


def coords(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", a)
    ev.to_mesh_clear()
    return a.reshape(-1, 3)


def make(macro):
    bpy.ops.wm.read_homefile(use_empty=True)
    body = mpfb_bridge.create_human(macro)
    mpfb_bridge.apply_targets(body, preset.get("face", {}))
    return body


body = make(preset["macro"])
base = coords(body)
_, TargetService = mpfb_bridge._services()
names, deltas = [], []
for var in [(s, [f"l-{s}", f"r-{s}"]) for s in SIDED] + [(s, [s]) for s in SINGLE]:
    name, targets = var
    keys = []
    for t in targets:
        path = TargetService.target_full_path(t)
        if not path:
            print(f"skip {t}: no such target")
            break
        keys.append(TargetService.load_target(body, path, weight=1.0, name=f"fit_{t}"))
    else:
        d = coords(body) - base
        names.append(name)
        deltas.append(d)
    for k in body.data.shape_keys.key_blocks[:]:
        if k.name.startswith("fit_"):
            body.shape_key_remove(k)

units = os.path.join(os.path.dirname(mpfb_bridge.module().__file__), "data", "targets", "expression", "units", "caucasian")
for name, targets in EXPRESSIONS.items():
    for t in targets:
        TargetService.load_target(body, os.path.join(units, t + ".target.gz"), weight=1.0, name=f"fit_{t}")
    names.append(f"xp:{name}")
    deltas.append(coords(body) - base)
    for k in body.data.shape_keys.key_blocks[:]:
        if k.name.startswith("fit_"):
            body.shape_key_remove(k)

# The macros as numerical derivatives (per macro unit): MPFB blends its macro targets non-linearly.
for m, h in MACROS.items():
    bumped = dict(preset["macro"])
    bumped[m] = bumped[m] + h
    b2 = make(bumped)
    names.append(f"macro:{m}")
    deltas.append((coords(b2) - base) / h)
body = make(preset["macro"])

groups = {g.index: g.name for g in body.vertex_groups}
members = {n: [] for n in groups.values()}
for v in body.data.vertices:
    for ge in v.groups:
        if ge.weight > 0.5:
            members[groups[ge.group]].append(v.index)
joints = {n: np.array(ix, np.int32) for n, ix in members.items() if n.startswith("joint-")}
body_mask = np.zeros(len(base), bool)
body_mask[members["body"]] = True
np.savez_compressed(os.path.join(out_dir, "fit_model.npz"), base=base, deltas=np.stack(deltas).astype(np.float32),
                    names=np.array(names), body=body_mask, eyes=np.array(members["helper-l-eye"] + members["helper-r-eye"], np.int32),
                    **{f"J{n}": ix for n, ix in joints.items()})
print(f"fit model: {len(names)} variables over {len(base)} vertices")

# Front clay renders for picking the model marks (front = looking along +y; +x is the character's left).
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "SINGLE"
scene.display.shading.single_color = (0.75, 0.72, 0.68)
scene.display.shading.show_cavity = True
vg = body.vertex_groups.new(name="render")
vg.add(members["body"] + members["helper-l-eye"] + members["helper-r-eye"], 1.0, "REPLACE")
mask = body.modifiers.new("render", "MASK")
mask.vertex_group = "render"
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = "ORTHO"
cam.rotation_euler = (1.5707963, 0, 0)
shots = {}
bx = base[body_mask]
zmin, zmax = float(bx[:, 2].min()), float(bx[:, 2].max())
H = zmax - zmin
for shot, (cz, size, w, h) in {"body": ((zmin + zmax) / 2, H * 1.04, 1000, 2000),
                               "head": (zmax - 0.075 * H, 0.16 * H, 1200, 1200)}.items():
    scene.render.resolution_x, scene.render.resolution_y = w, h
    cam.data.ortho_scale = size
    cam.location = (0.0, -5.0, cz)
    scene.render.filepath = os.path.join(out_dir, f"marks_{shot}.png")
    bpy.ops.render.render(write_still=True)
    # Ortho scale spans the longer side: pixel (u, v) → model (x, z).
    ppm = max(w, h) / size
    shots[shot] = {"w": w, "h": h, "cx": 0.0, "cz": cz, "ppm": ppm}
json.dump(shots, open(os.path.join(out_dir, "marks_cam.json"), "w"), indent=1)
