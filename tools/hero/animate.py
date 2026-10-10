"""Clips: a sequence's keys (read off Andrew's reference sheets into rigging.POSES) keyframed onto the rig as a Blender
action, the in-betweens filled by Blender's interpolation; the board animated with her. A looping clip repeats its
first key at the end so the last frame flows back into the first.

blender --background --python tools/hero/build.py -- tools/hero/presets/female.json build/hero/female --views ""
    --animate paddleCycle,trimPump [--preview trimPump] [--mannequin]
Writes build/hero/female/clips/<clip>/####.png (EEVEE preview; every clip unless --preview names some) and keeps the
actions in female_clips.blend.
"""
import os

import bpy

import rigging

# The paddle keys turned to face where the sit-to-paddle sequence leaves her (the reference's half circle), so
# sitToProne can end on the paddle cycle's first pose and the clips join.
rigging.POSES.update({f"{k}s": {**rigging.POSES[k], "spin": -180} for k in [f"pdl{n}" for n in range(1, 9)]})

_PDL = [f"pdl{k}" for k in range(1, 9)]
_STP_CAM = ((0.0, -0.3, 0.45), 55, 8.0, 85, 14)
# name: (keys, frames to the next key at 24 fps (one number, or one per key), loops, camera (target, yaw, dist, lens, pitch))
CLIPS = {
    # One full two-arm stroke cycle in ~1.7 s (8 keys x 5 frames), side-on as his sheet.
    "paddleCycle": (_PDL, 5, True, ((0.0, -0.8, 0.35), 90, 5.2, 85, 4)),
    # Two pumps down the line in ~2.7 s (8 keys x 8 frames), from her front as his sheet.
    "trimPump": ([f"trm{k}" for k in range(1, 9)], 8, True, ((0.0, 0.0, 0.85), 0, 6.4, 85, 4)),
    # Sit-to-paddle as four joinable clips (Andrew, 2026-10-10): each ends on the pose the next starts from.
    # sitIdle loops: sitting astride, hands on thighs; a slow look back over the right shoulder at the set, and back.
    "sitIdle": (["stp1", "stp1", "stp2", "stp2"], [40, 20, 36, 24], True, _STP_CAM),
    # sitTurn: from the look back, she leans back on a hand and kicks the board round under her (120 deg here; the
    # game sets the heading by scaling the root's turn).
    "sitTurn": (["stp2", "stp3", "stp4"], [16, 18, 1], False, _STP_CAM),
    # sitToProne: down onto the board, chest up on straight arms, lower, into the first paddle stroke (the last 60 deg
    # of the reference's half turn happens as she goes down).
    "sitToProne": (["stp4", "stp5", "stp6", "pdl1s"], [14, 12, 10, 1], False, _STP_CAM),
    # The four played back to back (preview only): idle once, turn, down, two paddle cycles.
    "sitToPaddleChain": (["stp1", "stp1", "stp2", "stp2", "stp3", "stp4", "stp5", "stp6"] + [f"{k}s" for k in _PDL * 2] + ["pdl1s"],
                         [40, 20, 36, 16, 18, 14, 12, 10] + [5] * 16 + [1], False, _STP_CAM),
}


def _key_pose(rig, surf, frame, prev):
    for o in (rig, surf):  # Euler angles kept continuous across a half turn (no ±180 deg flip between keys)
        if o.name in prev:
            o.rotation_euler.make_compatible(prev[o.name])
        prev[o.name] = o.rotation_euler.copy()
    rig.keyframe_insert("location", frame=frame)
    rig.keyframe_insert("rotation_euler", frame=frame)
    surf.keyframe_insert("location", frame=frame)
    surf.keyframe_insert("rotation_euler", frame=frame)
    for pb in rig.pose.bones:
        if pb.rotation_mode != "QUATERNION":
            pb.rotation_mode = "QUATERNION"
        q = pb.rotation_quaternion
        p = prev.get(pb.name)
        if p is not None and p.dot(q) < 0:  # the short way round, so the in-betweens don't spin
            pb.rotation_quaternion = -q
        prev[pb.name] = pb.rotation_quaternion.copy()
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def build(rig, body, surf, name):
    """Keyframe one clip as an action named after it; returns (first frame, last frame)."""
    keys, step, loops, _ = CLIPS[name]
    steps = step if isinstance(step, list) else [step] * len(keys)
    rig.animation_data_create()
    surf.animation_data_create()
    rig.animation_data.action = bpy.data.actions.new(f"{name}")
    surf.animation_data.action = bpy.data.actions.new(f"{name}_board")
    seq = keys + ([keys[0]] if loops else [])
    prev = {}
    frame = 1
    for i, k in enumerate(seq):
        rigging.pose(rig, k, body, surf)
        _key_pose(rig, surf, frame, prev)
        last = frame
        frame += steps[i % len(keys)]
    for a in (rig.animation_data.action, surf.animation_data.action):
        for fc in _fcurves(a):
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            if loops:
                fc.modifiers.new("CYCLES")
    rig.animation_data.action.use_fake_user = True
    surf.animation_data.action.use_fake_user = True
    return 1, last - (1 if loops else 0)


def _fcurves(action):
    """F-curves of an action (Blender 5 keeps them in layered channelbags)."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def preview(cam, name, out_dir, w=960, h=720):
    """Render the clip with EEVEE to PNG frames (tools/hero/frames_to_gif.py makes the looping GIF)."""
    scene = bpy.context.scene
    target, yaw, dist, lens, pitch = CLIPS[name][3]
    import math
    from mathutils import Vector
    t = Vector(target)
    yr, pr = math.radians(yaw), math.radians(pitch)
    cam.location = t + Vector((dist * math.sin(yr) * math.cos(pr), -dist * math.cos(yr) * math.cos(pr), dist * math.sin(pr)))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.dof.use_dof = False
    engine = scene.render.engine
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.fps = 24
    d = os.path.join(out_dir, "clips", name)
    os.makedirs(d, exist_ok=True)
    scene.render.filepath = os.path.join(d, "")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(animation=True)
    scene.render.engine = engine
    return d
