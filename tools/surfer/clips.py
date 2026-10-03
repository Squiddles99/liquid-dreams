"""Bakes motion clips onto the riders (clip slice spec 2026-10-03 §3.3):
blender --background --python clips.py -- <clips.json> <anim-source dir> <public/surfer dir> <preview dir>

For each clip and each rider, per frame at 30 fps: every bone's world rotation from rest (what solvePose calls D) and
the pelvis from the ankles' midpoint, in the character rest frame (glTF axes), to <public/surfer>/clips/<rider>.clips.json;
and an 8-frame contact sheet (side and back) for Gate B."""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.append(os.path.dirname(__file__))
import previews  # noqa: E402
from rig_trim import BONE_MAP, FINGERS, PARENT  # noqa: E402

RIDERS = ("female", "male")
OUT_FPS = 30
BLEND_S = 0.25
CORE = ["pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "clavicle_l", "upperarm_l", "forearm_l", "hand_l",
        "clavicle_r", "upperarm_r", "forearm_r", "hand_r", "thigh_l", "shin_l", "foot_l", "toe_l",
        "thigh_r", "shin_r", "foot_r", "toe_r"]
# The game's bone → where to read it in the source (first present wins). The UE4 mannequin is MPFB's rig name for name;
# UE5's extra spine and neck bones fold onto ours: the chest reads the top spine bone (spine_05), the neck neck_01.
SOURCE = {dst: [src] for src, dst in BONE_MAP.items() if dst != "root"}
SOURCE["spine_03"] = ["spine_05", "spine_03"]
SOURCE.update({f: [f] for f in FINGERS})


def gl_q(q):  # Blender (x, y, z) → glTF (x, z, -y); w unchanged
    return [round(q.x, 6), round(q.z, 6), round(-q.y, 6), round(q.w, 6)]


def gl_v(v):
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]


def from_gl(a):  # glTF → Blender
    return Vector((a[0], -a[2], a[1]))


def imported(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise SystemExit(f"expected one armature, got {[o.name for o in arms]}")
    return arms[0], new


def rot_of(m):
    return m.to_3x3().normalized().to_quaternion()


def facing(arm, names):
    """The rotation taking the source's world into ours: its left to +X and its up to +Z, so it faces -Y as MPFB does."""
    mw = arm.matrix_world
    h = lambda n: mw @ arm.data.bones[names[n]].head_local  # noqa: E731
    left = (h("thigh_l") - h("thigh_r")).normalized()
    up = h("head") - h("pelvis")
    up = (up - left * up.dot(left)).normalized()
    return Matrix((left, up.cross(left), up))  # rows: v ↦ (v·left, v·(up×left), v·up)


def target_rest(manifest):
    """The rider's rest heads and bone directions (Blender axes) from its manifest."""
    heads = {b["name"]: from_gl(b["head"]) for b in manifest["bones"]}
    dirs = {b["name"]: (from_gl(b["tail"]) - from_gl(b["head"])).normalized() for b in manifest["bones"]}
    return heads, dirs


def leg_len(head):
    return (head["shin_l"] - head["thigh_l"]).length + (head["foot_l"] - head["shin_l"]).length


def bake(clip, src_arm, names, N, manifest):
    """Per frame: D for every mapped bone (world rotation from rest, rest-aligned to ours) and the pelvis offset."""
    scene = bpy.context.scene
    heads, dirs = target_rest(manifest)
    Nq = N.to_quaternion()
    mw = src_arm.matrix_world
    rest_rot = {dst: Nq @ rot_of(mw @ src_arm.data.bones[src].matrix_local) for dst, src in names.items()}
    src_dir = {dst: (N @ (mw.to_3x3() @ (src_arm.data.bones[src].tail_local - src_arm.data.bones[src].head_local))).normalized() for dst, src in names.items()}
    # Rest alignment (§3.3 step 3): our bone aimed along the source's rest direction first, so a T-pose source fits our A-pose.
    align = {dst: dirs[dst].rotation_difference(src_dir[dst]) for dst in names}
    src_head = lambda n, pose: N @ (mw @ (src_arm.pose.bones[n].head if pose else src_arm.data.bones[n].head_local))  # noqa: E731
    src_leg = (src_head(names["shin_l"], False) - src_head(names["thigh_l"], False)).length + (src_head(names["foot_l"], False) - src_head(names["shin_l"], False)).length
    ratio = leg_len(heads) / src_leg

    action = src_arm.animation_data.action
    start = clip["start"] if clip["start"] is not None else int(action.frame_range[0])
    end = clip["end"] if clip["end"] is not None else int(action.frame_range[1])
    src_fps = clip["sourceFps"] or scene.render.fps / scene.render.fps_base
    frames = max(2, int(math.floor((end - start) / src_fps * OUT_FPS)) + 1)
    pelvis, rot = [], {dst: [] for dst in names}
    for k in range(frames):
        t = start + k * src_fps / OUT_FPS
        scene.frame_set(int(math.floor(t)), subframe=t - math.floor(t))
        mid = (src_head(names["foot_l"], True) + src_head(names["foot_r"], True)) / 2
        pelvis.append((src_head(names["pelvis"], True) - mid) * ratio)
        for dst, src in names.items():
            delta = (Nq @ rot_of(mw @ src_arm.pose.bones[src].matrix)) @ rest_rot[dst].inverted()
            rot[dst].append(delta @ align[dst])
    # The seam (§3.3 step 5): the last 0.25 s eased toward the first frame, so the loop wraps without a jump.
    if clip["loop"]:
        n = min(frames - 1, round(BLEND_S * OUT_FPS))
        for j in range(n):
            k, a = frames - n + j, (j + 1) / (n + 1)
            pelvis[k] = pelvis[k].lerp(pelvis[0], a)
            for dst in names:
                rot[dst][k] = rot[dst][k].slerp(rot[dst][0], a)
    return {
        "loop": clip["loop"], "frames": frames, "noseSide": clip["noseSide"],
        "pelvis": [c for p in pelvis for c in gl_v(p)],
        "rot": {dst: [c for q in qs for c in gl_q(q)] for dst, qs in rot.items()},
    }, (pelvis, rot)


def pose_target(arm, heads, pelvis, rot, k):
    """Poses the imported rider at frame k: each bone's world rotation D × rest, joints by FK from the pelvis."""
    mw_inv = arm.matrix_world.inverted()
    order = ["pelvis", *[b for b in CORE if b != "pelvis"], *FINGERS]
    parent = {**PARENT, **{f: (f"hand_{f[-1]}" if f[-4:-2] == "01" else f"{f[:-4]}{int(f[-4:-2]) - 1:02d}_{f[-1]}") for f in FINGERS}}
    D = {b: (rot[b][k] if b in rot else Quaternion()) for b in order}
    pos = {}
    ankle_mid = (heads["foot_l"] + heads["foot_r"]) / 2
    for b in order:
        if b not in arm.pose.bones:
            continue
        if b == "pelvis":
            pos[b] = ankle_mid + pelvis[k]
        else:
            p = parent[b]
            pos[b] = pos[p] + D[p] @ (heads[b] - heads[p])
        rest_w = rot_of(arm.matrix_world @ arm.data.bones[b].matrix_local)
        w = (D[b] @ rest_w).to_matrix().to_4x4()
        w.translation = pos[b]
        arm.pose.bones[b].matrix = mw_inv @ w
        bpy.context.view_layer.update()


def contact_sheet(name, rider, arm, meshes, heads, pelvis, rot, height, out_dir):
    """8 frames through the clip, from the side (top row) and from behind (bottom row): Gate B (§6)."""
    scene, cam = previews._setup()
    for m in meshes:
        if m.type == "MESH":
            previews.clay(m)
    W, H = previews.VIEW_W, previews.VIEW_H
    frames = len(pelvis)
    grid = np.zeros((H * 2, W * 8, 4), dtype=np.float32)
    tmp = os.path.join(out_dir, "_view.png")
    target = Vector((0, 0, height * 0.5))
    for i in range(8):
        pose_target(arm, heads, pelvis, rot, (i * frames) // 8)
        for row, at in enumerate((Vector((-height * 2.6, 0, height * 0.5)), Vector((0, height * 2.6, height * 0.5)))):
            cam.location = at
            cam.rotation_euler = (target - at).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
            bpy.data.images.remove(img)
            grid[(1 - row) * H:(2 - row) * H, i * W:(i + 1) * W] = px
    out = bpy.data.images.new(f"{name}-{rider}", W * 8, H * 2, alpha=True)
    out.pixels.foreach_set(grid.ravel())
    out.filepath_raw = os.path.join(out_dir, f"{name}-{rider}.png")
    out.file_format = "PNG"
    out.save()
    os.remove(tmp)


def main():
    clips_json, source_dir, surfer_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:4]
    spec = json.load(open(clips_json, encoding="utf-8"))
    if spec["fps"] != OUT_FPS:
        raise SystemExit(f"clips.json fps {spec['fps']} ≠ {OUT_FPS}")
    out = {r: {"rider": r, "fps": OUT_FPS, "clips": {}} for r in RIDERS}
    for clip in spec["clips"]:
        for rider in RIDERS:
            bpy.ops.wm.read_homefile(use_empty=True)
            path = os.path.join(source_dir, clip["file"])
            if not os.path.exists(path):
                raise SystemExit(f"{path} is missing: export it from Unreal (plan Task 5) or set LD_ANIM_SOURCE")
            src_arm, _ = imported(bpy.ops.import_scene.fbx, filepath=path, use_anim=True, automatic_bone_orientation=False)
            names = {}
            for dst in [*CORE, *FINGERS]:
                hit = next((s for s in SOURCE[dst] if s in src_arm.data.bones), None)
                if hit:
                    names[dst] = hit
            missing = [b for b in CORE if b not in names]
            if missing:
                raise SystemExit(f"{clip['file']}: no source bone for {missing}; it has {sorted(b.name for b in src_arm.data.bones)}")
            manifest = json.load(open(os.path.join(surfer_dir, f"{rider}.manifest.json"), encoding="utf-8"))
            N = facing(src_arm, names)
            baked, (pelvis, rot) = bake(clip, src_arm, names, N, manifest)
            out[rider]["clips"][clip["name"]] = baked
            heads, _ = target_rest(manifest)
            arm, meshes = imported(bpy.ops.import_scene.gltf, filepath=os.path.join(surfer_dir, f"{rider}.glb"))
            src_arm.hide_render = True
            for o in bpy.data.objects:
                if o.parent == src_arm:
                    o.hide_render = True
            contact_sheet(clip["name"], rider, arm, meshes, heads, pelvis, rot, manifest["heightM"], preview_dir)
            print(f"baked {clip['name']} onto {rider}: {baked['frames']} frames")
    os.makedirs(os.path.join(surfer_dir, "clips"), exist_ok=True)
    for rider, data in out.items():
        with open(os.path.join(surfer_dir, "clips", f"{rider}.clips.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))


main()
