"""Clips: a sequence's keys (read off Andrew's reference sheets into rigging.POSES) keyframed onto the rig as a Blender
action, the in-betweens filled by Blender's interpolation; the board animated with her. A looping clip repeats its
first key at the end so the last frame flows back into the first.

blender --background --python tools/hero/build.py -- tools/hero/presets/female.json build/hero/female --views ""
    --animate paddleCycle,trimPump [--mannequin]
Writes build/hero/female/clips/<clip>/####.png (EEVEE preview) and keeps the actions in female_hero.blend.
"""
import os

import bpy

import rigging

# name: (keys, frames per key at 24 fps, loops, camera (target, yaw, dist, lens, pitch))
CLIPS = {
    # One full two-arm stroke cycle in ~1.7 s (8 keys x 5 frames), side-on as his sheet.
    "paddleCycle": ([f"pdl{k}" for k in range(1, 9)], 5, True, ((0.0, -0.8, 0.35), 90, 5.2, 85, 4)),
    # Two pumps down the line in ~2.7 s (8 keys x 8 frames), from her front as his sheet.
    "trimPump": ([f"trm{k}" for k in range(1, 9)], 8, True, ((0.0, 0.0, 0.85), 0, 6.4, 85, 4)),
    "sitToPaddle": ([f"stp{k}" for k in range(1, 9)], 12, False, ((0.0, 0.0, 0.45), 55, 6.5, 85, 14)),
}


def _key_pose(rig, surf, frame, prev_q):
    rig.keyframe_insert("location", frame=frame)
    rig.keyframe_insert("rotation_euler", frame=frame)
    surf.keyframe_insert("location", frame=frame)
    surf.keyframe_insert("rotation_euler", frame=frame)
    for pb in rig.pose.bones:
        if pb.rotation_mode != "QUATERNION":
            pb.rotation_mode = "QUATERNION"
        q = pb.rotation_quaternion
        p = prev_q.get(pb.name)
        if p is not None and p.dot(q) < 0:  # the short way round, so the in-betweens don't spin
            pb.rotation_quaternion = -q
        prev_q[pb.name] = pb.rotation_quaternion.copy()
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def build(rig, body, surf, name):
    """Keyframe one clip as an action named after it; returns (first frame, last frame)."""
    keys, step, loops, _ = CLIPS[name]
    rig.animation_data_create()
    surf.animation_data_create()
    rig.animation_data.action = bpy.data.actions.new(f"{name}")
    surf.animation_data.action = bpy.data.actions.new(f"{name}_board")
    seq = keys + ([keys[0]] if loops else [])
    prev_q = {}
    for i, k in enumerate(seq):
        rigging.pose(rig, k, body, surf)
        _key_pose(rig, surf, 1 + i * step, prev_q)
    last = 1 + (len(seq) - 1) * step
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
