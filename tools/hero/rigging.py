"""The hero rig (hero spec §9) and the Gate 1c surf poses.

- Twist bones (upper arm, forearm, thigh, shin, each side) take a share of their bone's weights along its length, so a
  twisting limb spreads the roll instead of pinching (the forearm's and shin's copy half the hand's / foot's roll for
  the renders; the game drives them in sub-project 5). The renders also skin with volume preservation.
- What she wears follows: the bikini panels and cords are skinned with weights carried over from the skin; the hair,
  the eyes, the elastics follow the head or the chest rigidly; the thongs their feet.
- Poses are set by aiming bones (a direction per bone, in her own standing frame: +x her left, -y her front, +z up),
  then the whole rig is turned and lowered onto the board.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

TWISTS = [("upperarm", 0.25, 0.85, None), ("forearm", 0.3, 0.95, "hand"), ("thigh", 0.25, 0.85, None), ("shin", 0.3, 0.95, "foot")]


def _mode(rig, mode):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode=mode)


def add_twists(rig, body):
    _mode(rig, "EDIT")
    eb = rig.data.edit_bones
    made = []
    for base, a, b, follow in TWISTS:
        for side in ("l", "r"):
            src = eb[f"{base}_{side}"]
            t = eb.new(f"{base}_twist_{side}")
            t.head = src.head.lerp(src.tail, 0.5)
            t.tail = src.tail.copy()
            t.roll = src.roll
            t.parent = src
            made.append((f"{base}_{side}", t.name, a, b, follow, side))
    bpy.ops.object.mode_set(mode="OBJECT")
    # Split each limb bone's weights along its length into its twist bone.
    bones = rig.data.bones
    for src, tw, a, b, follow, side in made:
        H, T = bones[src].head_local, bones[src].tail_local
        AB = T - H
        g_src = body.vertex_groups[src]
        g_tw = body.vertex_groups.get(tw) or body.vertex_groups.new(name=tw)
        for v in body.data.vertices:
            w = next((e.weight for e in v.groups if e.group == g_src.index), 0.0)
            if w <= 0:
                continue
            t = max(0.0, min(1.0, (v.co - H).dot(AB) / AB.length_squared))
            x = max(0.0, min(1.0, (t - a) / (b - a)))
            share = x * x * (3 - 2 * x)
            if share > 0:
                g_src.add([v.index], w * (1 - share), "REPLACE")
                g_tw.add([v.index], w * share, "REPLACE")
    _mode(rig, "POSE")
    for src, tw, a, b, follow, side in made:
        if follow:
            c = rig.pose.bones[tw].constraints.new("COPY_ROTATION")
            c.target, c.subtarget = rig, f"{follow}_{side}"
            c.use_x, c.use_z = False, False
            c.target_space = c.owner_space = "LOCAL"
            c.influence = 0.5
    bpy.ops.object.mode_set(mode="OBJECT")
    for m in body.modifiers:
        if m.type == "ARMATURE":
            m.use_deform_preserve_volume = True
    return [m[1] for m in made]


def bind(rig, body, meshes, rigid):
    """Skin `meshes` from the body's weights (nearest face, interpolated); parent `rigid` {object: bone} to bones."""
    for o in meshes:
        if o is None or o.type != "MESH":
            continue
        for g in body.vertex_groups:
            if g.name not in o.vertex_groups:
                o.vertex_groups.new(name=g.name)
        dt = o.modifiers.new("weights", "DATA_TRANSFER")
        dt.object = body
        dt.use_vert_data = True
        dt.data_types_verts = {"VGROUP_WEIGHTS"}
        dt.vert_mapping = "POLYINTERP_NEAREST"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.datalayout_transfer(modifier=dt.name)
        bpy.ops.object.modifier_move_to_index(modifier=dt.name, index=0)
        bpy.ops.object.modifier_apply(modifier=dt.name)
        arm = o.modifiers.new("rig", "ARMATURE")
        arm.object = rig
        arm.use_deform_preserve_volume = True
        bpy.ops.object.modifier_move_to_index(modifier=arm.name, index=0)
    for o, bone in rigid.items():
        mw = o.matrix_world.copy()
        o.parent = rig
        o.parent_type = "BONE"
        o.parent_bone = bone
        o.matrix_world = mw


def board(name, length=1.83, width=0.48, thick=0.06):
    """A plain shortboard (6'0"): a pointed nose, a squash tail, rocker, rails rounded by subdivision; white."""
    bm = bmesh.new()
    nu, nv = 48, 12
    rings = []
    for i in range(nu + 1):
        t = i / nu  # 0 tail … 1 nose
        half = width / 2 * (math.sin(math.pi * (0.06 + 0.94 * t) ** 0.8)) * (1 - 0.35 * t ** 6)
        half = max(half, 0.004)
        x = (t - 0.5) * length
        rocker = 0.09 * ((2 * t - 1) ** 4 if t > 0.5 else 0.25 * (1 - 2 * t) ** 3)
        th = thick * (0.35 + 0.65 * math.sin(math.pi * min(1, max(0, t * 1.05))) ** 0.6)
        ring = []
        for j in range(nv):
            a = 2 * math.pi * j / nv
            ring.append(bm.verts.new((x, half * math.cos(a), rocker + th / 2 + th / 2 * math.sin(a) * (0.9 if math.sin(a) > 0 else 0.6))))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(nv):
            bm.faces.new((r0[j], r0[(j + 1) % nv], r1[(j + 1) % nv], r1[j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.modifiers.new("sub", "SUBSURF").levels = 2
    mat = bpy.data.materials.new("board")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.86, 0.86, 0.84, 1)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Coat Weight"].default_value = 0.6
    me.materials.append(mat)
    return o


# Directions per bone in her standing frame (+x her left, -y her front, +z up). Missing bones keep their rest.
def _n(*v):
    return Vector(v).normalized()


POSES = {
    # Prone, paddling: chest up, head up, right arm reaching forward to the water, left arm finishing its stroke.
    "paddle": {"turn": 90, "lift": 0.0, "bones": {
        "spine_02": _n(0, 0.18, 1), "spine_03": _n(0, 0.3, 1), "neck": _n(0, 0.55, 1), "head": _n(0, 0.75, 1),
        "upperarm_r": _n(-0.25, -0.75, 0.7), "forearm_r": _n(-0.15, -0.95, 0.4), "hand_r": _n(-0.1, -1, 0.2),
        "upperarm_l": _n(0.3, -0.85, -0.35), "forearm_l": _n(0.15, -0.35, -0.95), "hand_l": _n(0.1, -0.1, -1),
        "thigh_l": _n(0.05, 0.05, -1), "shin_l": _n(0.03, 0.12, -1), "foot_l": _n(0.0, 0.5, -1),
        "thigh_r": _n(-0.05, 0.05, -1), "shin_r": _n(-0.03, 0.12, -1), "foot_r": _n(0.0, 0.5, -1)}},
    # The pop-up: arms straight under the chest, back arched, the feet swinging under the hips.
    "popup": {"turn": 62, "lift": 0.0, "bones": {
        "spine_01": _n(0, 0.2, 1), "spine_02": _n(0, 0.32, 1), "spine_03": _n(0, 0.42, 1), "neck": _n(0, 0.5, 1), "head": _n(0, 0.7, 1),
        "upperarm_l": _n(0.18, -1, -0.25), "forearm_l": _n(0.1, -1, -0.45), "hand_l": _n(0.05, -0.3, -1),
        "upperarm_r": _n(-0.18, -1, -0.25), "forearm_r": _n(-0.1, -1, -0.45), "hand_r": _n(-0.05, -0.3, -1),
        "thigh_l": _n(0.25, -0.95, -0.35), "shin_l": _n(0.2, 0.5, -0.85), "foot_l": _n(0.2, -1, -0.3),
        "thigh_r": _n(-0.2, -0.55, -0.85), "shin_r": _n(-0.15, 0.85, -0.55), "foot_r": _n(-0.1, -0.3, -1)}},
    # A low bottom turn (regular foot: left foot to the nose, +x): knees deep, torso leaning in, arms out for balance.
    "bottomTurn": {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(0.1, -0.2, 1), "spine_02": _n(0.18, -0.32, 1), "spine_03": _n(0.22, -0.38, 1), "neck": _n(0.2, -0.2, 1), "head": _n(0.25, 0.0, 1),
        "upperarm_l": _n(1, -0.35, -0.2), "forearm_l": _n(1, -0.5, 0.05), "hand_l": _n(1, -0.4, -0.1),
        "upperarm_r": _n(-0.45, -0.4, -1), "forearm_r": _n(-0.3, -0.8, -0.6), "hand_r": _n(-0.2, -0.9, -0.5),
        "thigh_l": _n(0.55, -0.7, -0.55), "shin_l": _n(0.1, 0.45, -0.9), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.4, -0.75, -0.55), "shin_r": _n(-0.05, 0.55, -0.85), "foot_r": _n(-0.25, -1, -0.05)}},
    # Crouched in the tube: compact, rear knee dropped, front hand forward, back hand trailing, eyes up the line.
    "tube": {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(0.15, -0.45, 1), "spine_02": _n(0.25, -0.6, 1), "spine_03": _n(0.3, -0.6, 1), "neck": _n(0.35, -0.2, 1), "head": _n(0.45, 0.1, 1),
        "upperarm_l": _n(1, -0.6, 0.0), "forearm_l": _n(1, -0.35, 0.25), "hand_l": _n(1, -0.2, 0.1),
        "upperarm_r": _n(-0.5, 0.3, -1), "forearm_r": _n(-0.7, 0.4, -0.6), "hand_r": _n(-0.6, 0.3, -0.7),
        "thigh_l": _n(0.45, -0.85, -0.3), "shin_l": _n(0.15, 0.55, -0.85), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.25, -0.75, -0.65), "shin_r": _n(-0.3, 0.8, -0.35), "foot_r": _n(-0.25, -1, 0.2)}},
    # The duck dive: head and shoulders driving down, arms straight pushing the nose under, right knee on the tail.
    "duckDive": {"turn": 118, "lift": 0.0, "bones": {
        "spine_02": _n(0, -0.15, 1), "spine_03": _n(0, -0.2, 1), "neck": _n(0, -0.1, 1), "head": _n(0, 0.2, 1),
        "upperarm_l": _n(0.2, -1, 0.2), "forearm_l": _n(0.12, -1, 0.35), "hand_l": _n(0.1, -0.5, 0.8),
        "upperarm_r": _n(-0.2, -1, 0.2), "forearm_r": _n(-0.12, -1, 0.35), "hand_r": _n(-0.1, -0.5, 0.8),
        "thigh_r": _n(-0.1, -0.85, -0.55), "shin_r": _n(-0.08, 0.6, -0.8), "foot_r": _n(0, 0.95, -0.3),
        "thigh_l": _n(0.08, 0.35, -1), "shin_l": _n(0.05, 0.3, -1), "foot_l": _n(0, 0.8, -0.6)}},
}
ORDER = ["root", "pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "clavicle_l", "upperarm_l", "forearm_l", "hand_l",
         "clavicle_r", "upperarm_r", "forearm_r", "hand_r", "thigh_l", "shin_l", "foot_l", "toe_l", "thigh_r", "shin_r", "foot_r", "toe_r"]


def rest(rig):
    _mode(rig, "POSE")
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.matrix_world = Matrix.Identity(4)


def pose(rig, name, body):
    """Aim the bones, then turn the rig about its x axis (prone poses) and set it down: lowest skin at z = 0.06 (on
    the deck) for standing poses, the chest on the deck for the prone ones."""
    spec = POSES[name]
    rest(rig)
    _mode(rig, "POSE")
    for bname in ORDER:
        want = spec["bones"].get(bname)
        if want is None:
            continue
        pb = rig.pose.bones[bname]
        bpy.context.view_layer.update()
        cur = (pb.tail - pb.head).normalized()
        R = cur.rotation_difference(want).to_matrix().to_4x4()
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.matrix_world = Matrix.Rotation(math.radians(spec["turn"]), 4, "X")
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    P = np.array([(ev.matrix_world @ v.co)[:] for v in me.vertices])
    ev.to_mesh_clear()
    rig.matrix_world = Matrix.Translation((0, 0, 0.065 - P[:, 2].min())) @ rig.matrix_world
    bpy.context.view_layer.update()
    lo, hi = P.min(0) + np.array([0, 0, 0.065 - P[:, 2].min()]), P.max(0) + np.array([0, 0, 0.065 - P[:, 2].min()])
    return lo, hi
