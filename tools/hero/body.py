"""The hero body (hero spec §4): the fitted MPFB human, baked, helpers read and deleted, scaled to height — the old
build's own steps (tools/surfer), so the game contract (rig, expressions, landmarks) stays the same."""
import json
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "surfer"))
import bodymap  # noqa: E402
import expressions  # noqa: E402
import mpfb_bridge  # noqa: E402
import rig_trim  # noqa: E402
import sculpt  # noqa: E402


def make(preset, marks_path):
    bpy.ops.wm.read_homefile(use_empty=True)
    body = mpfb_bridge.create_human(preset["macro"])
    mpfb_bridge.apply_targets(body, preset.get("face", {}))
    rig = mpfb_bridge.add_game_rig(body)
    name = preset["name"]
    body.name, rig.name = f"{name}_body", f"{name}_armature"
    rig_trim.bake_shape(body)
    expressions.load(body)
    rig_trim.apply_transforms(rig, [body])
    # MPFB's own feature groups, as float attributes before the deletion drops the groups with the helpers' vertices.
    for g in ("fingernails", "toenails", "ears", "scalp", "nipple"):
        vg = body.vertex_groups.get(g)
        att = body.data.attributes.new(f"g_{g}", "FLOAT", "POINT")
        if vg is not None:
            for v in body.data.vertices:
                att.data[v.index].value = next((e.weight for e in v.groups if e.group == vg.index), 0.0)
    landmarks = rig_trim.delete_helpers(body)
    f = rig_trim.scale_to_height(body, rig, preset["heightM"], landmarks)
    landmarks["scale"] = f  # metres per fit-model unit (the face camera's units)
    expressions.scale(body, f)
    sculpt.smooth_anatomy(body, preset["heightM"], preset.get("smooth", []))
    if preset.get("upperLip"):
        sculpt.upper_lip(body, landmarks["mouth"], preset["upperLip"])
    # The lash strips go: the hero grows lashes as hair curves (hero spec §7).
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(body.data)
    lash = bm.verts.layers.float.get("lash")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[lash] > 0], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    ids = json.load(open(marks_path))
    marks = {k: body.data.vertices[i].co.copy() for k, i in ids.items()}
    # The game's skeleton (23 bones + fingers), as the old build trims it; the hero adds its own bones later (spec §9).
    rig_trim.trim(rig, body)
    rig_trim.limit_weights(body)
    face_keys(body, marks, landmarks)
    coords = bodymap.bone_coords(body, rig)
    L = bodymap.landmarks(body, rig, preset["heightM"], landmarks, coords)
    return body, rig, landmarks, marks, L, coords


def smooth(body):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.shade_smooth()
    sub = body.modifiers.new("subdiv", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    sub.uv_smooth = "PRESERVE_BOUNDARIES"
    return sub


def face_keys(body, marks, landmarks):
    """The face's expression attributes (expressions.load's `xp_*`, carried through the bake, the helper deletion and
    the scaling) as shape keys, off at rest: the game's morphs, and the painting's smile for the gate renders."""
    basis = body.shape_key_add(name="Basis", from_mix=False)
    for morph in expressions.UNITS:
        a = body.data.attributes.get(expressions.PREFIX + morph)
        if a is None:
            continue
        key = body.shape_key_add(name=morph, from_mix=False)
        key.value = 0.0
        for i, e in enumerate(a.data):
            key.data[i].co = basis.data[i].co + e.vector
    # The painting's smile, authored (MPFB's corner puller pulls a grimace): closed lips, the corners up, back and a
    # little out, the cheeks lifted forward, the lower lids raised by them.
    import numpy as np
    P = np.array([v.co[:] for v in body.data.vertices])
    d = np.zeros_like(P)
    g = lambda c, s: np.exp(-np.sum((P - np.asarray(c[:])) ** 2, axis=1) / (s * s))[:, None]
    for S, sx in (("R", -1), ("L", 1)):
        c = marks[f"mouth_{S}"]
        d += g(c, 0.014) * np.array([sx * 0.0022, 0.0030, 0.0060])
        cheek = (marks[f"eye_outer_{S}"] * 0.45 + c * 0.55) + type(c)((sx * 0.006, -0.004, 0.004))
        d += g(cheek, 0.02) * np.array([0.0, -0.0018, 0.0032])
        eye = landmarks["eyes"][S.lower()]
        lid = eye + type(c)((0, -landmarks["eye_radius"] * 0.8, -landmarks["eye_radius"] * 0.75))
        d += g(lid, 0.006) * np.array([0.0, -0.0003, 0.0011])
    front = (P[:, 1] < marks["nose_tip"].y + 0.06)[:, None]
    d *= front
    key = body.shape_key_add(name="smileSoft", from_mix=False)
    key.value = 0.0
    for i in range(len(P)):
        key.data[i].co = basis.data[i].co + type(basis.data[i].co)(d[i])
    body.data.shape_keys.use_relative = True
