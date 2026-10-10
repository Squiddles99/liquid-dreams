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
from mathutils import Matrix

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
    # Two pumps down the line in ~2.7 s (8 keys x 8 frames), from her front as his sheet (kept for reference; Andrew
    # found it too lungey and fast for trimming).
    "trimPump": ([f"trm{k}" for k in range(1, 9)], 8, True, ((0.0, 0.0, 0.85), 0, 6.4, 85, 4)),
    # Trimming, as the game plays it: small balancing shifts, one cycle in 6 s (8 keys x 18 frames).
    "trim": ([f"trc{k}" for k in range(1, 9)], 18, True, ((0.0, 0.0, 0.85), 0, 6.4, 85, 4)),
    # Sit-to-paddle as four joinable clips (Andrew, 2026-10-10): each ends on the pose the next starts from.
    # sitIdle loops: sitting astride, hands on thighs; a slow look back over the right shoulder at the set, and back.
    "sitIdle": (["stp1", "stp1", "stp2", "stp2"], [40, 20, 36, 24], True, _STP_CAM),
    # sitTurn: from the look back, she leans back on a hand and kicks the board round under her, the whole half turn
    # done sitting (the game sets the heading by scaling the turn).
    "sitTurn": (["stp2", "stp3", "stp4"], [40, 44, 1], False, _STP_CAM),
    # sitToProne: leans forward onto her hands, down onto the board, chest up on straight arms, lower, into the first
    # paddle stroke.
    "sitToProne": (["stp4", "stp4b", "stp5", "stp6", "pdl1s"], [12, 14, 12, 10, 1], False, _STP_CAM),
    # Duck dive (Andrew's sheet, session 3): from the paddle, hands to the rails, push the nose under, knee on the tail,
    # resurface on hands and knees as the board pops nose-up, down flat kicking, back into the paddle cycle (~2.8 s).
    "duckDive": (["pdl1", "dd2", "dd3", "dd4", "dd5", "dd6", "dd7", "pdl1"], [8, 10, 10, 14, 8, 10, 8, 1], False,
                 ((0.0, -1.9, -0.2), 90, 9.0, 85, 8)),
    # Roundhouse cutback (Andrew's sheets + legend, session 3): the figure-8 track at ~7 m/s (~4.9 s), from his high
    # 3/4-front view; the preview camera follows her.
    "roundhouse": ([f"rh{k}" for k in range(1, 13)], [9, 10, 8, 12, 18, 11, 12, 9, 7, 9, 10, 1], False,
                   ((0.0, 0.0, 0.6), 0, 7.5, 85, 35)),
    # Prone turn and paddle (Andrew's sheet, session 3): from waiting on her forearms, chest down, arms sweep the board
    # round 180 deg on its middle (~4 s), then into the paddle cycle at its pdl5 phase (right arm reaching).
    "proneTurn": (["pt1", "pt2", "pt3", "pt4", "pt5", "pt6", "pt7", "pdl6s", "pdl7s", "pdl8s", "pdl1s"],
                  [20, 14, 16, 16, 16, 18, 5, 5, 5, 5, 1], False, ((0.0, 0.0, 0.35), 90, 6.5, 85, 6)),
    # The bail (Andrew's sheet, session 3; it replaces the turtle roll): a big wave breaking in front of her, she shoves
    # the board away, dives under, swims, comes up reaching for the leg rope, pulls the board back, climbs on prone and
    # paddles (~5.5 s).
    "bail": (["bl1", "bl2", "bl3", "bl4", "bl5", "bl6", "bl7", "bl8"], [10, 12, 14, 16, 18, 16, 26, 1], False,
             ((0.0, -0.5, -0.4), 90, 12.0, 85, 6)),
    # The four played back to back (preview only): idle once, turn, down, two paddle cycles.
    "sitToPaddleChain": (["stp1", "stp1", "stp2", "stp2", "stp3", "stp4", "stp4b", "stp5", "stp6"] + [f"{k}s" for k in _PDL * 2] + ["pdl1s"],
                         [40, 20, 36, 40, 44, 14, 14, 12, 10] + [5] * 16 + [1], False, _STP_CAM),
}


def _key_bones(rig, frame, prev):
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


def _ease(t, v0=0.0, v1=0.0):
    """Cubic Hermite from 0 to 1 with start and end slopes v0, v1 (0, 0: ease in and out; 1 at a key she passes
    through without stopping, so a move split over several keys reads as one)."""
    return (t ** 3 - 2 * t * t + t) * v0 + (-2 * t ** 3 + 3 * t * t) + (t ** 3 - t * t) * v1


# Keys (by index in a clip) her root passes through without slowing: the half turn is one continuous move (Andrew,
# 2026-10-10: "make the part where her and the board turn 180 degrees much smoother").
THROUGH = {"sitTurn": {1}, "sitToPaddleChain": {4}, "duckDive": {2, 4, 5}, "roundhouse": set(range(12)), "proneTurn": {2, 3, 4, 5}, "bail": {3, 4}}
# Clips whose board glides forward at a steady speed (m/s along its nose) instead of sitting wherever each key's
# contacts seat it (session 3: between the paddle pose and the duck-dive keys the board slid back a metre).
GLIDE = {"duckDive": 0.6, "proneTurn": 0.0}  # 0: the board turns on its middle, staying put
# Clips previewed with the sea's surface at this height (the board floats with its deck ~7 cm above the origin).
WATER = {"duckDive": 0.03, "bail": 0.03}
# Clips where the board leaves her (the bail): between keys it moves in the world, not held in her pelvis frame, so it
# stays on the surface while she swims under it and climbs back on.
WORLD_BOARD = {"bail"}
# Clips that travel along a track (their keys' `offset`): her pelvis follows a Catmull-Rom curve through the keys
# instead of straight lines, and the preview camera follows her (same angle and distance throughout).
TRACK = {"roundhouse"}


def _catmull(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)


def build(rig, body, surf, name):
    """Keyframe one clip as an action named after it; returns (first frame, last frame).
    Her root is sampled every frame turning about her pelvis, not the rig's origin at her feet (Andrew, 2026-10-10:
    going from sitting to lying, she leapt through the air), and the board rides with her: at each key it sits where
    the pose seated it, held relative to her pelvis, and between keys it follows her pelvis (Andrew: the board wasn't
    under her or moving with her)."""
    keys, step, loops, _ = CLIPS[name]
    steps = step if isinstance(step, list) else [step] * len(keys)
    rig.animation_data_create()
    surf.animation_data_create()
    rig.animation_data.action = bpy.data.actions.new(f"{name}")
    surf.animation_data.action = bpy.data.actions.new(f"{name}_board")
    seq = keys + ([keys[0]] if loops else [])
    prev, poses, frame = {}, [], 1
    for i, k in enumerate(seq):
        # pose() sets the board's heading as Euler angles: the object channels go quaternion only after posing.
        rig.rotation_mode = surf.rotation_mode = "XYZ"
        rigging.pose(rig, k, body, surf)
        if name in GLIDE:
            fwd = surf.matrix_world.col[0].xyz
            fwd.z = 0
            loc = surf.matrix_world.translation.copy()
            if i == 0:
                start = loc.copy()
                fwd0 = fwd.normalized()
            shift = start + fwd0 * GLIDE[name] * (frame - 1) / 24 - loc
            shift.z = 0
            T = Matrix.Translation(shift)
            rig.matrix_world = T @ rig.matrix_world
            surf.matrix_world = T @ surf.matrix_world
            bpy.context.view_layer.update()
        _key_bones(rig, frame, prev)
        R, B = rig.matrix_world.copy(), surf.matrix_world.copy()
        q, h = R.to_quaternion(), rig.pose.bones["pelvis"].head.copy()
        pelvis = R.translation + q @ h
        P = Matrix.Translation(pelvis) @ q.to_matrix().to_4x4()
        rel = P.inverted() @ B  # the board in her pelvis frame
        poses.append((frame, q, pelvis, h, rel.to_quaternion(), rel.translation.copy(), B.copy()))
        last = frame
        frame += steps[i % len(keys)]
    rig.rotation_mode = surf.rotation_mode = "QUATERNION"
    qprev = None
    through = THROUGH.get(name, set())
    for n, ((f0, qa, pa, ha, ra, ta, Ba), (f1, qb, pb_, hb, rb, tb, Bb)) in enumerate(zip(poses, poses[1:] + [poses[-1]])):
        v0, v1 = (1.0 if n in through else 0.0), (1.0 if n + 1 in through else 0.0)
        if qprev is not None and qa.dot(qprev) < 0:
            qa = -qa
        if qb.dot(qa) < 0:
            qb = -qb
        if rb.dot(ra) < 0:
            rb = -rb
        span = max(f1 - f0, 1)
        for f in range(f0, f1 if f1 > f0 else f0 + 1):
            t = _ease((f - f0) / span, v0, v1)
            q = qa.slerp(qb, t)
            p = pa.lerp(pb_, t)
            if name in TRACK:
                p0 = poses[n - 1][2] if n > 0 else pa
                p3 = poses[n + 2][2] if n + 2 < len(poses) else pb_
                p = _catmull(p0, pa, pb_, p3, t)
            rig.rotation_quaternion = q
            rig.location = p - q @ ha.lerp(hb, t)
            B = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Translation(ta.lerp(tb, t)) @ ra.slerp(rb, t).to_matrix().to_4x4()
            if name in WORLD_BOARD:  # the board on its own: from where it floats at one key to the next, in the world
                qba, qbb = Ba.to_quaternion(), Bb.to_quaternion()
                if qbb.dot(qba) < 0:
                    qbb = -qbb
                B = Matrix.Translation(Ba.translation.lerp(Bb.translation, t)) @ qba.slerp(qbb, t).to_matrix().to_4x4()
            surf.rotation_quaternion = B.to_quaternion()
            surf.location = B.translation
            for o in (rig, surf):
                o.keyframe_insert("location", frame=f)
                o.keyframe_insert("rotation_quaternion", frame=f)
        qprev = qb
    through_frames = {poses[i][0] for i in through if i < len(poses)}
    for a in (rig.animation_data.action, surf.animation_data.action):
        for fc in _fcurves(a):
            object_channel = not fc.data_path.startswith("pose.")
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR" if object_channel else "BEZIER"
                # A pass-through key keeps its pose's motion flowing (unclamped: no flat spot there).
                kp.handle_left_type = kp.handle_right_type = "AUTO" if round(kp.co.x) in through_frames else "AUTO_CLAMPED"
            if loops:
                fc.modifiers.new("CYCLES")
    rig.animation_data.action.use_fake_user = True
    surf.animation_data.action.use_fake_user = True
    sag = next((o for o in bpy.data.objects if o.name.endswith("_leash_sag")), None)
    if sag is not None:
        # The leg rope's slack, frame by frame, for where she and the board are (an action per clip, like hers).
        sag.animation_data_create()
        sag.animation_data.action = bpy.data.actions.new(f"{name}_leash")
        for f in range(1, last + 1):
            bpy.context.scene.frame_set(f)
            rigging.leash_sag(rig, surf, sag)
            sag.keyframe_insert("location", frame=f)
        sag.animation_data.action.use_fake_user = True
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
    cam.animation_data_clear()
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
    suns = []
    if name in WATER:
        # The sea as a side cut-away (Andrew, duck dive review: she must go under and float back up): a block of
        # tinted, non-reflective water from the surface down, its near face between her and the camera, so all of her
        # below the surface line reads as underwater.
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.5, 0, WATER[name] - 2.0))
        plane = bpy.context.active_object
        plane.scale = (3.0, 24.0, 4.0)
        mat = bpy.data.materials.new("preview_water")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (0.04, 0.3, 0.38, 1)
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        bsdf.inputs["Alpha"].default_value = 0.3
        mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = True
        plane.data.materials.append(mat)
        plane.visible_shadow = False
        suns.append(plane)
    if name in TRACK:
        # She travels metres from the studio's area lights and turns her back on the key: two suns (no falloff), a
        # warm one from high front-left and a cooler one from behind, so every heading reads.
        for sname, rot, energy, color in (("track_key", (math.radians(40), 0, math.radians(-25)), 3.0, (1.0, 0.94, 0.86)),
                                          ("track_back", (math.radians(50), 0, math.radians(160)), 2.0, (0.88, 0.92, 1.0))):
            light = bpy.data.lights.new(sname, "SUN")
            light.energy, light.color, light.angle = energy, color, math.radians(8)
            o = bpy.data.objects.new(sname, light)
            o.rotation_euler = rot
            scene.collection.objects.link(o)
            suns.append(o)
        # Follow her: the same offset from her pelvis every frame (its height held, so the bob doesn't shake the view).
        rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
        off = cam.location - t
        for f in range(scene.frame_start, scene.frame_end + 1):
            scene.frame_set(f)
            pv = rig.matrix_world @ rig.pose.bones["pelvis"].head
            cam.location = Vector((pv.x, pv.y, t.z)) + off
            cam.keyframe_insert("location", frame=f)
    d = os.path.join(out_dir, "clips", name)
    os.makedirs(d, exist_ok=True)
    scene.render.filepath = os.path.join(d, "")
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(animation=True)
    cam.animation_data_clear()
    for o in suns:
        bpy.data.objects.remove(o)
    scene.render.engine = engine
    return d
