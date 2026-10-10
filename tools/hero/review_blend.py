"""A review file for Andrew: every clip in <name>_clips.blend laid end to end on the timeline (NLA strips, loops
repeated three times), a marker naming each, the camera cut to each clip's view, opened in the camera view.
blender --background <out>/<name>_clips.blend --python tools/hero/review_blend.py -- <name> <out dir>
Then open <name>_review.blend and press Space to play."""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
import sequences  # noqa: E402,F401
import start_poses  # noqa: E402,F401
import animate  # noqa: E402

name, out_dir = sys.argv[sys.argv.index("--") + 1:][:2]
ORDER = ["sitIdle", "sitTurn", "sitToProne", "paddleCycle", "trim"]
scene = bpy.context.scene
rig, surf, cam = bpy.data.objects[f"{name}_armature"], bpy.data.objects[f"{name}_board"], scene.camera
for o in (rig, surf):
    o.animation_data_create()
    o.animation_data.action = None
    for t in list(o.animation_data.nla_tracks):
        o.animation_data.nla_tracks.remove(t)
cam.animation_data_clear()
scene.timeline_markers.clear()
frame = 1
for cn in ORDER:
    act = bpy.data.actions.get(cn)
    if act is None:
        continue
    keys, step, loops, (target, yaw, dist, lens, pitch) = animate.CLIPS[cn]
    a0, a1 = act.frame_range
    reps = 3 if loops else 1
    for o, a in ((rig, act), (surf, bpy.data.actions[f"{cn}_board"])):
        tr = o.animation_data.nla_tracks.new()
        tr.name = cn
        st = tr.strips.new(cn, int(frame), a)
        st.action_frame_start, st.action_frame_end = a0, a1 - (1 if loops else 0)
        st.repeat = reps
        st.extrapolation = "NOTHING"
        st.blend_type = "REPLACE"
    # The camera jumps to this clip's view (the view of Andrew's reference sheet).
    t = Vector(target)
    yr, pr = math.radians(yaw), math.radians(pitch)
    d = dist * 1.15
    cam.location = t + Vector((d * math.sin(yr) * math.cos(pr), -d * math.cos(yr) * math.cos(pr), d * math.sin(pr)))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.keyframe_insert("location", frame=frame)
    cam.keyframe_insert("rotation_euler", frame=frame)
    scene.timeline_markers.new(cn, frame=int(frame))
    frame += int((a1 - a0 - (1 if loops else 0)) * reps) + 1
if cam.animation_data and cam.animation_data.action:
    for fc in animate._fcurves(cam.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"
scene.frame_start, scene.frame_end, scene.frame_current = 1, int(frame) - 1, 1
scene.render.fps = 24
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 960, 720
# Open in the camera view, shaded with materials, so play shows what the previews show.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            for sp in area.spaces:
                if sp.type == "VIEW_3D":
                    sp.region_3d.view_perspective = "CAMERA"
                    sp.shading.type = "MATERIAL"
                    sp.overlay.show_overlays = False
path = os.path.join(os.path.abspath(out_dir), f"{name}_review.blend")
bpy.ops.wm.save_as_mainfile(filepath=path)
print("review", path, "frames", scene.frame_end, "screens", len(bpy.data.screens))
