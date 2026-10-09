"""Gate 1a renders (hero spec §3.5): the fitted body as clay, beside the painting.

blender --background --python render_clay.py -- <preset.json> <fit_report.json> <out dir> <tag>

Front orthographic renders (head and body) whose pixel mapping goes to `<tag>_cam.json`, so `compose_gate.py` can put
them in the painting's frame with the fit's cameras; plus 3/4, side and back views of the head and the body. The
'smile' renders carry the expression weights the fit read off the painting; the neutral ones are her rest face.
"""
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "surfer"))
import mpfb_bridge  # noqa: E402

preset_path, report_path, out_dir, tag = sys.argv[sys.argv.index("--") + 1:][:4]
out_dir = os.path.abspath(out_dir)
os.makedirs(out_dir, exist_ok=True)
preset = json.load(open(preset_path, encoding="utf-8"))
report = json.load(open(report_path)) if os.path.exists(report_path) else {"chosen": {}}
XP = {"xp:smile": ["mouth-corner-puller"], "xp:smileUp": ["mouth-upward-retraction"], "xp:squint": ["eye-left-slit", "eye-right-slit"]}

bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human(preset["macro"])
mpfb_bridge.apply_targets(body, preset.get("face", {}))
_, TS = mpfb_bridge._services()
units = os.path.join(os.path.dirname(mpfb_bridge.module().__file__), "data", "targets", "expression", "units", "caucasian")
xp_keys = []
for var, ts in XP.items():
    for t in ts:
        xp_keys.append((TS.load_target(body, os.path.join(units, t + ".target.gz"), weight=0.0, name=f"xp_{t}"), report["chosen"].get(var, 0.0)))

def evaluated():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    a = np.array([v.co[:] for v in me.vertices])
    ev.to_mesh_clear()
    return a


CO = evaluated()  # the shaped body (macros + targets), before the mask modifier renumbers vertices
render_vg = body.vertex_groups.new(name="render")
idx = []
for v in body.data.vertices:
    for ge in v.groups:
        if body.vertex_groups[ge.group].name in ("body", "helper-l-eye", "helper-r-eye") and ge.weight > 0.5:
            idx.append(v.index)
            break
render_vg.add(idx, 1.0, "REPLACE")
mask = body.modifiers.new("render", "MASK")
mask.vertex_group = "render"
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.shade_smooth()

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light, sh.color_type, sh.single_color = "STUDIO", "SINGLE", (0.80, 0.74, 0.68)
sh.show_cavity, sh.show_shadows = True, False
sh.cavity_type = "BOTH"
scene.display.shadow_focus = 0.9
scene.render.film_transparent = False
world = bpy.data.worlds.new("w")
scene.world = world
world.color = (0.26, 0.26, 0.27)
scene.display_settings.display_device = "sRGB"

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam

co = CO[idx]
zmin, zmax = co[:, 2].min(), co[:, 2].max()
H = zmax - zmin
head_cz = zmax - 0.075 * H
cams = {}


def shoot(name, kind, yaw_deg, cz, size, w, h, smile):
    for k, wt in xp_keys:
        k.value = wt if smile else 0.0
    scene.render.resolution_x, scene.render.resolution_y = w, h
    cam.data.type = "ORTHO" if kind == "ortho" else "PERSP"
    yaw = math.radians(yaw_deg)
    dist = 5.0
    cam.location = (dist * math.sin(yaw), -dist * math.cos(yaw), cz)
    cam.rotation_euler = (math.pi / 2, 0, yaw)
    if kind == "ortho":
        cam.data.ortho_scale = size
    else:
        cam.data.lens = 50
        cam.data.sensor_fit = "AUTO"
        # Frame `size` (the longer side) at the camera distance.
        cam.data.angle = 2 * math.atan(size / 2 / dist)
    scene.render.filepath = os.path.join(out_dir, f"{tag}_{name}.png")
    bpy.ops.render.render(write_still=True)
    cams[name] = {"w": w, "h": h, "cx": 0.0, "cz": cz, "ppm": max(w, h) / size, "yaw": yaw_deg}


for smile in (True, False):
    s = "smile" if smile else "rest"
    shoot(f"head_front_{s}", "ortho", 0, head_cz, 0.17 * H, 1200, 1200, smile)
    shoot(f"body_front_{s}", "ortho", 0, (zmin + zmax) / 2, H * 1.04, 1000, 2000, smile)
for yaw in (35, 90, 180):
    shoot(f"head_{yaw}", "ortho", yaw, head_cz, 0.19 * H, 1000, 1000, False)
    shoot(f"body_{yaw}", "ortho", yaw, (zmin + zmax) / 2, H * 1.04, 1000, 2000, False)
eyes = {}
for side, gname in (("R", "helper-r-eye"), ("L", "helper-l-eye")):
    g = body.vertex_groups[gname].index
    pts = CO[[v.index for v in body.data.vertices if any(ge.group == g and ge.weight > 0.5 for ge in v.groups)]]
    eyes[side] = pts.mean(0).tolist()
cams["model"] = {"eyes": eyes, "zmin": float(zmin), "zmax": float(zmax)}
json.dump(cams, open(os.path.join(out_dir, f"{tag}_cam.json"), "w"), indent=1)
