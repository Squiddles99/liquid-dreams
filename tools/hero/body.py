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
    face_keys(body)
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


def face_keys(body):
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
    body.data.shape_keys.use_relative = True
