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
        mw = o.matrix_world.copy()
        o.parent = rig  # the rig object's turn and drop carry it, as they carry the body
        o.matrix_world = mw
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
        "spine_02": _n(0, 0.3, 1), "spine_03": _n(0, 0.5, 1), "neck": _n(0, 1.0, 0.8), "head": _n(0, 1.2, 0.6),
        "thigh_l": _n(0.05, 0.05, -1), "shin_l": _n(0.03, 0.12, -1), "foot_l": _n(0.0, -0.6, -0.8),
        "thigh_r": _n(-0.05, 0.05, -1), "shin_r": _n(-0.03, 0.12, -1), "foot_r": _n(0.0, -0.6, -0.8)},
        # Andrew (Gate 1c r1): the wrists bent back, the feet bent up, and she faced the tail. Wrists now follow the
        # forearms; feet point back and down; the board is seated from her contacts, nose toward her head.
        # The arms in the world (Andrew: the left arm was wrong): the right reaching forward, entering the water past
        # the nose; the left mid-stroke, pulling straight down through the water beside the rail under the shoulder.
        "world": {"upperarm_r": _n(-0.22, -1, -0.35), "forearm_r": _n(-0.12, -1, -0.55),
                  "upperarm_l": _n(0.3, 0.12, -1), "forearm_l": _n(0.12, 0.35, -1)},
        "floor": ["spine_02", "spine_03", "pelvis"], "nose": ["spine_03"], "tail": ["thigh_l", "thigh_r"],
        # Andrew (2026-10-10, sit-to-paddle review): lying further back; the chin ~0.5 m behind the nose.
        "noseGap": 0.75},
    # The pop-up, authored in the world (board along y, nose at -y; Andrew: kneeling, tipped head-down was wrong):
    # chest up ~45 deg on straight arms, palms flat, eyes forward; back toes on the tail; front knee tucked under the
    # chest, its foot swinging through above the deck.
    "popup": {"turn": 0, "lift": 0.0, "bones": {}, "world": {
        "pelvis": _n(0, -0.75, 0.66), "spine_01": _n(0, -0.75, 0.66), "spine_02": _n(0, -0.72, 0.7), "spine_03": _n(0, -0.68, 0.73),
        "neck": _n(0, -0.45, 0.9), "head": _n(0, -0.1, 1),
        "upperarm_l": _n(0.1, 0.06, -1), "forearm_l": _n(0.05, 0.04, -1), "hand_l": _n(0.05, -1, -0.12),
        "upperarm_r": _n(-0.1, 0.06, -1), "forearm_r": _n(-0.05, 0.04, -1), "hand_r": _n(-0.05, -1, -0.12),
        "thigh_r": _n(-0.06, 0.62, -0.78), "shin_r": _n(-0.04, 0.88, -0.48), "foot_r": _n(0, 0.35, -1),
        "thigh_l": _n(0.1, -0.85, -0.5), "shin_l": _n(0.05, 0.45, -0.9), "foot_l": _n(0.05, -1, -0.1)},
        "floor": ["hand_l", "hand_r", "foot_r"], "nose": ["hand_l", "hand_r"], "tail": ["foot_r"], "prone": True, "noseGap": 0.3,
        "level": (["hand_l", "hand_r"], ["foot_r"]), "levelRange": (-30, 30)},
    # A low bottom turn (regular foot: left foot to the nose, +x): knees deep, torso leaning in, arms out for balance.
    "bottomTurn": {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(0.1, -0.2, 1), "spine_02": _n(0.18, -0.32, 1), "spine_03": _n(0.22, -0.38, 1), "neck": _n(0.2, -0.2, 1), "head": _n(0.25, 0.0, 1),
        "upperarm_l": _n(1, -0.35, -0.2), "forearm_l": _n(1, -0.5, 0.05), "hand_l": _n(1, -0.4, -0.1),
        "upperarm_r": _n(-0.45, -0.4, -1), "forearm_r": _n(-0.3, -0.8, -0.6), "hand_r": _n(-0.2, -0.9, -0.5),
        "thigh_l": _n(0.55, -0.7, -0.55), "shin_l": _n(0.1, 0.45, -0.9), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.4, -0.75, -0.55), "shin_r": _n(-0.05, 0.55, -0.85), "foot_r": _n(-0.25, -1, -0.05)},
        "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]},
    # Crouched in the tube: compact, rear knee dropped, front hand forward, back hand trailing, eyes up the line.
    "tube": {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(0.15, -0.45, 1), "spine_02": _n(0.25, -0.6, 1), "spine_03": _n(0.3, -0.6, 1), "neck": _n(0.35, -0.2, 1), "head": _n(0.45, 0.1, 1),
        "upperarm_l": _n(1, -0.6, 0.0), "forearm_l": _n(1, -0.35, 0.25), "hand_l": _n(1, -0.2, 0.1),
        "upperarm_r": _n(-0.5, 0.3, -1), "forearm_r": _n(-0.7, 0.4, -0.6), "hand_r": _n(-0.6, 0.3, -0.7),
        "thigh_l": _n(0.45, -0.85, -0.3), "shin_l": _n(0.15, 0.55, -0.85), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.25, -0.75, -0.65), "shin_r": _n(-0.3, 0.8, -0.35), "foot_r": _n(-0.25, -1, 0.2)},
        "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]},
    # The duck dive: head and shoulders driving down, arms straight pushing the nose under, right knee on the tail.
    "duckDive": {"turn": 105, "lift": 0.0, "bones": {
        "spine_02": _n(0, -0.15, 1), "spine_03": _n(0, -0.2, 1), "neck": _n(0, -0.1, 1), "head": _n(0, 0.2, 1),
        "upperarm_l": _n(-0.1, -1, 0.2), "forearm_l": _n(-0.05, -1, 0.35),
        "upperarm_r": _n(0.1, -1, 0.2), "forearm_r": _n(0.05, -1, 0.35),
        "thigh_r": _n(-0.1, -0.85, -0.55), "shin_r": _n(-0.08, 0.6, -0.8), "foot_r": _n(0, 0.95, -0.3),
        "thigh_l": _n(0.08, 0.35, -1), "shin_l": _n(0.05, 0.3, -1), "foot_l": _n(0, -0.6, -0.8)},
        # The board tilts nose-down between her hands and her right knee (she is pushing it under).
        "floor": ["hand_l", "hand_r", "shin_r"], "nose": ["hand_l", "hand_r"], "tail": ["shin_r"], "tilt": True},
}
POSES["sit"] = {"turn": 0, "lift": 0.0, "bones": {
    # Sitting astride, waiting: legs dangling over the rails, hands resting on the deck in front, eyes to the horizon.
    "spine_01": _n(0, -0.05, 1), "spine_02": _n(0, -0.08, 1), "spine_03": _n(0, -0.05, 1), "neck": _n(0, -0.15, 1), "head": _n(0, 0.0, 1),
    "upperarm_l": _n(0.2, -0.35, -1), "forearm_l": _n(0.05, -1, -0.45),
    "upperarm_r": _n(-0.2, -0.35, -1), "forearm_r": _n(-0.05, -1, -0.45),
    "thigh_l": _n(0.6, -0.65, -0.45), "shin_l": _n(0.15, 0.05, -1), "foot_l": _n(0.1, -0.7, -0.7),
    "thigh_r": _n(-0.6, -0.65, -0.45), "shin_r": _n(-0.15, 0.05, -1), "foot_r": _n(-0.1, -0.7, -0.7)},
    "floor": ["pelvis"], "nose": ["thigh_l", "thigh_r"], "tail": ["pelvis"]}
POSES["trim"] = {"turn": 0, "lift": None, "bones": {
    # Trimming down the line (regular): relaxed, knees soft, front arm forward, back arm low.
    "spine_01": _n(0.08, -0.1, 1), "spine_02": _n(0.12, -0.15, 1), "spine_03": _n(0.14, -0.15, 1), "neck": _n(0.15, -0.1, 1), "head": _n(0.3, 0.0, 1),
    "upperarm_l": _n(0.8, -0.45, -0.6), "forearm_l": _n(0.9, -0.5, -0.2),
    "upperarm_r": _n(-0.35, -0.3, -1), "forearm_r": _n(-0.25, -0.6, -0.8),
    "thigh_l": _n(0.4, -0.4, -0.85), "shin_l": _n(0.1, 0.3, -0.95), "foot_l": _n(0.35, -1, -0.05),
    "thigh_r": _n(-0.35, -0.45, -0.85), "shin_r": _n(-0.05, 0.35, -0.95), "foot_r": _n(-0.25, -1, -0.05)},
    # Andrew: feet planted firmly on the board: each sole kept level (its rest orientation), turned on the deck.
    "flat": {"foot_l": 20.0, "foot_r": -15.0},
    "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]}
ORDER = ["root", "pelvis", "spine_01", "spine_02", "spine_03", "neck", "head", "clavicle_l", "upperarm_l", "forearm_l", "hand_l",
         "clavicle_r", "upperarm_r", "forearm_r", "hand_r", "thigh_l", "shin_l", "foot_l", "toe_l", "thigh_r", "shin_r", "foot_r", "toe_r"]


def rest(rig):
    _mode(rig, "POSE")
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.matrix_world = Matrix.Identity(4)


def _skin_points(body, bones, P):
    idx = {body.vertex_groups[b].index for b in bones if b in body.vertex_groups}
    sel = [v.index for v in body.data.vertices if any(e.group in idx and e.weight > 0.3 for e in v.groups)]
    return P[sel]


def _posed_points(body):
    """The posed skin, vertex for vertex with the base mesh (subdivision off while measuring)."""
    subs = [m for m in body.modifiers if m.type == "SUBSURF"]
    for m in subs:
        m.show_viewport = False
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    P = np.array([(ev.matrix_world @ v.co)[:] for v in me.vertices])
    ev.to_mesh_clear()
    for m in subs:
        m.show_viewport = True
    return P


def pose(rig, name, body, surf):
    """_pose, then (a pose with `plant`) the named feet brought down flat onto the deck by a two-bone solve of their leg
    (Andrew, trim review: the front foot hovered), the knee keeping the side it bends to; posed again with the solved aims.
    Standing poses only (no turn or spin: the rig's frame is her standing frame)."""
    spec = POSES[name]
    out = _pose(rig, name, body, surf)
    if not spec.get("plant"):
        return out
    bones = dict(spec["bones"])
    for _ in range(3):
        P = _posed_points(body)
        lo = {f: _skin_points(body, [f], P)[:, 2].min() for f in ("foot_l", "foot_r")}
        deck = min(lo.values())
        for foot in spec["plant"]:
            side = foot[-1]
            drop = lo[foot] - deck
            if drop < 0.003:
                continue
            pb = rig.pose.bones
            M = rig.matrix_world
            hip = M @ pb[f"thigh_{side}"].head
            knee = M @ pb[f"shin_{side}"].head
            ank = M @ pb[foot].head
            a = (knee - hip).length
            b = (ank - knee).length
            T = ank - Vector((0, 0, drop))
            dv = T - hip
            d = min(dv.length, a + b - 1e-4)
            u = dv.normalized()
            hint = (knee - hip) - u * (knee - hip).dot(u)
            w = hint.normalized()
            x = (a * a - b * b + d * d) / (2 * d)
            y = math.sqrt(max(a * a - x * x, 0.0))
            K = hip + u * x + w * y
            Rinv = M.to_3x3().inverted()
            bones[f"thigh_{side}"] = (Rinv @ (K - hip)).normalized()
            bones[f"shin_{side}"] = (Rinv @ (hip + u * d - K)).normalized()
        POSES["_planted"] = {**spec, "bones": bones, "plant": None}
        out = _pose(rig, "_planted", body, surf)
    return out


def _pose(rig, name, body, surf):
    """Aim the bones (world-frame aims turned into her standing frame), turn the rig (prone poses), set her down so
    her contact skin (the pose's `floor` bones) rests on the deck, and seat the board under it: its axis from the
    `tail` contact to the `nose` contact, so she always faces the nose; level unless the pose tilts it (Andrew,
    Gate 1c r1: she faced the tail prone, and standing had a foot off the board and the front foot on the rail)."""
    spec = POSES[name]
    turn = Matrix.Rotation(math.radians(spec["turn"]), 4, "X")
    spin = Matrix.Rotation(math.radians(spec.get("spin", 0.0)), 4, "Z")  # the whole body turned on the water
    aims = dict(spec["bones"])
    for b, w in spec.get("world", {}).items():
        aims[b] = (turn.inverted().to_3x3() @ w).normalized()
    rest(rig)
    _mode(rig, "POSE")
    for bname in ORDER:
        want = aims.get(bname)
        if want is None:
            continue
        pb = rig.pose.bones[bname]
        bpy.context.view_layer.update()
        cur = (pb.tail - pb.head).normalized()
        R = cur.rotation_difference(want).to_matrix().to_4x4()
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
        tw = spec.get("twist", {}).get(bname)
        if tw:  # turned about its own axis (a head looking over a shoulder)
            bpy.context.view_layer.update()
            axis = (pb.tail - pb.head).normalized()
            T = Matrix.Rotation(math.radians(tw), 4, axis)
            pb.matrix = Matrix.Translation(h) @ T @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
    for bname, yaw_deg in spec.get("flat", {}).items():
        # The foot's rest orientation (sole level), turned about the vertical, at the posed ankle.
        pb = rig.pose.bones[bname]
        rest_rot = rig.data.bones[bname].matrix_local.to_3x3()
        pb.matrix = Matrix.Translation(pb.head.copy()) @ (Matrix.Rotation(math.radians(yaw_deg), 3, "Z") @ rest_rot).to_4x4()
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    if "level" in spec:
        # Bisect the turn so both contact groups' lowest skin sits at the same height.
        a_b, b_b = spec["level"]
        lo_t, hi_t = (math.radians(x) for x in spec.get("levelRange", (40, 120)))
        for _ in range(14):
            mid_t = (lo_t + hi_t) / 2
            rig.matrix_world = spin @ Matrix.Rotation(mid_t, 4, "X")
            P = _posed_points(body)
            diff = _skin_points(body, a_b, P)[:, 2].min() - _skin_points(body, b_b, P)[:, 2].min()
            lo_t, hi_t = (mid_t, hi_t) if diff > 0 else (lo_t, mid_t)
        turn = Matrix.Rotation((lo_t + hi_t) / 2, 4, "X")
        print(f"pose {name}: turn {math.degrees((lo_t + hi_t) / 2):.1f} deg")
    rig.matrix_world = spin @ turn
    P = _posed_points(body)
    DECK = 0.075
    tilt = spec.get("tilt", False)
    floor_pts = _skin_points(body, spec["floor"], P)
    nose = _skin_points(body, spec["nose"], P)
    tail = _skin_points(body, spec["tail"], P)
    nose_c = np.array([nose[:, 0].mean(), nose[:, 1].mean(), nose[:, 2].min()])
    tail_c = np.array([tail[:, 0].mean(), tail[:, 1].mean(), tail[:, 2].min()])
    dz = DECK - (max(nose_c[2], tail_c[2]) if tilt else floor_pts[:, 2].min())
    rig.matrix_world = Matrix.Translation((0, 0, dz)) @ spin @ turn
    bpy.context.view_layer.update()
    nose_c[2] += dz
    tail_c[2] += dz
    d = nose_c - tail_c
    yaw = math.atan2(d[1], d[0]) + math.radians(spec.get("boardYaw", 0.0))
    pitch = -math.atan2(d[2], math.hypot(d[0], d[1])) if tilt else 0.0
    mid = (nose_c + tail_c) / 2
    fwd = np.array([math.cos(yaw), math.sin(yaw), 0.0])
    if "noseGap" in spec and not tilt:
        # The board's nose this far ahead of the nose contact (Andrew's sit-to-paddle: the nose well in front of a
        # paddler's head): the board's middle is half its length (0.915 m) back from its nose.
        mid = nose_c + fwd * (spec["noseGap"] - 0.915)
    elif spec.get("prone", spec["turn"] != 0) and not tilt:
        mid = mid - fwd * 0.12  # a prone rider's chest sits ahead of the board's middle
    if not spec.get("prone", spec["turn"] != 0) and not tilt:
        # Standing: the back foot 45 cm from the tail (Andrew, 2026-10-10: centred between the feet was too far forward,
        # over the tail pad at 25 cm too far back; "somewhere between" is the trim sweet spot).
        mid = tail_c + fwd * (0.915 - 0.45)
    if tilt:  # the hands on the rails about half a metre back from the nose, where the board is wide
        mid = nose_c - fwd * 0.415 * math.cos(pitch) + np.array([0, 0, -0.415 * math.sin(-pitch)])
    surf.rotation_euler = (0.0, pitch, yaw)
    # The deck's top sits ~6 cm above the board's origin.
    surf.location = (mid[0], mid[1], (mid[2] if tilt else DECK) - 0.06)
    bpy.context.view_layer.update()
    if spec.get("carry"):
        # On the sand, the board on its rail under her right arm: nose forward, deck against her right hip, the top
        # rail just under the armpit, between her body and the arm (the hand cups the bottom rail).
        Pc = _posed_points(body)
        fwd_h = rig.matrix_world.to_3x3() @ Vector((0, -1, 0))
        fwd_h.z = 0
        fwd_h.normalize()
        side = rig.matrix_world.to_3x3() @ Vector((-1, 0, 0))  # her right
        hips = _skin_points(body, ["pelvis", "spine_01"], Pc)
        out = float((hips @ np.array(side[:])).max())
        arm = rig.pose.bones["upperarm_r"].head
        top = (rig.matrix_world @ arm).z - 0.07
        x_ax = (fwd_h + Vector((0, 0, 0.12))).normalized()  # the nose a touch up
        z_ax = -side  # the deck faces her
        y_ax = z_ax.cross(x_ax)
        M = Matrix((x_ax, y_ax, z_ax)).transposed().to_4x4()
        base = Vector(Pc[:, :2].mean(0).tolist() + [0.0])
        c = base + side * (out - float(Vector(base[:]) @ side) + 0.04)
        c.z = top - 0.24
        M.translation = c
        surf.matrix_world = M
        bpy.context.view_layer.update()
    if spec.get("pitch"):
        # The rider and board tipped together about the board's middle (negative: nose down, into the drop).
        R = Matrix.Rotation(math.radians(spec["pitch"]), 4, Vector((math.cos(yaw), math.sin(yaw), 0)).cross(Vector((0, 0, 1))))
        piv = Vector(surf.location)
        T = Matrix.Translation(piv) @ R @ Matrix.Translation(-piv)
        rig.matrix_world = T @ rig.matrix_world
        surf.matrix_world = T @ surf.matrix_world
        bpy.context.view_layer.update()
        P = _posed_points(body)
        return P.min(0), P.max(0)
    return P.min(0) + np.array([0, 0, dz]), P.max(0) + np.array([0, 0, dz])
