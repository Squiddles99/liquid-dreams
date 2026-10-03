"""The rail grip (dune select Gate A): each hand's fingers curled round a board's rail, baked as a morph per hand.

The game's skeleton stops at the wrist (spec §3.3), so the fingers can't bend at run time. MPFB's game-engine rig still
has its finger bones here, before the trim: they're posed into a grip, the posed mesh is read back, and the difference
rides the build as the vertex attributes `xp_gripL` / `xp_gripR`, as the face's morphs do (expressions.py), becoming
glTF morph targets. Which way a finger bends comes from its nail (the nail is on the back of the finger, so a bend that
moves the fingertip away from it closes the hand): bone rolls differ between bones and builds, and a finger bent the wrong
way is the worst thing a hand can do. Also returned, for the game's tests: each finger's joints, curled and at rest,
relative to the hand bone's head (Blender axes; export converts).
"""
import bpy
from mathutils import Vector

import expressions

FINGERS = ["index", "middle", "ring", "pinky"]
# Degrees at each joint (knuckle, middle, tip; minus opens a finger), relative to MPFB's relaxed rest hand. The grip comes
# from each preset ("grip"): angles searched against the game's own carry (the palm on the bottom face, the knuckles at
# the lower rail) so the fingers hook round the rail and nothing enters the board; T-Bone's reach the deck, Shazza's
# (shorter arms, her knuckles a little short of the rail) hook round its edge. FLAT: the open hand for a bodyboard, its
# rail out of reach, resting on the bottom face (the rest hand's relaxed curl dug into it).
DEFAULT_GRIP = {"index": (20, 35, 40), "middle": (30, 35, 50), "ring": (20, 30, 50), "pinky": (-20, 35, 10), "thumb": (-40, 0, 0)}
FLAT = {"index": (-20, 0, 0), "middle": (-20, 0, 0), "ring": (-20, 0, 0), "pinky": (-30, 0, 0), "thumb": (-40, 0, 0)}


def _nail_centroid(body, near, radius):
    g = body.vertex_groups.get("fingernails")
    if g is None:
        raise SystemExit("the grip needs the 'fingernails' vertex group to tell the back of a finger from its front")
    pts = [body.matrix_world @ v.co for v in body.data.vertices
           if any(e.group == g.index and e.weight > 0.5 for e in v.groups) and (body.matrix_world @ v.co - near).length < radius]
    if not pts:
        raise SystemExit(f"no nail near {tuple(round(c, 3) for c in near)}")
    return sum(pts, Vector()) / len(pts)


def _tail(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].tail


def _head(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].head


def _reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()


def _chain(finger, side):
    return [f"{finger}_0{k}_{side}" for k in (1, 2, 3)]


def _sign(rig, body, finger, side):
    """+1 or -1: the rotation about the knuckle bone's X that moves the fingertip away from the nail."""
    chain = _chain(finger, side)
    tip0 = _tail(rig, chain[2])
    a, b = _head(rig, chain[2]), tip0
    nail = _nail_centroid(body, b, 0.03)
    axis = (b - a).normalized()
    back = nail - (a + axis * (nail - a).dot(axis))
    if back.length < 1e-5:
        raise SystemExit(f"{finger} {side}: the nail sits on the finger's axis")
    back.normalize()
    pb = rig.pose.bones[chain[0]]
    pb.rotation_euler = (0.5, 0.0, 0.0)
    bpy.context.view_layer.update()
    moved = _tail(rig, chain[2]) - tip0
    pb.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    return -1.0 if moved.dot(back) > 0 else 1.0


# Degrees each finger turns toward the middle one at its knuckle: MPFB's rest hand splays them, and a hand holding something
# keeps them together (Gate A: the open bodyboard hand read as a starfish).
TOGETHER = {"index": 14, "ring": 4, "pinky": 24}


NEIGHBOUR = {"index": "middle", "ring": "middle", "pinky": "ring"}


def _together(rig, finger, side):
    """Turns the finger's knuckle toward its neighbour: of the bone's Y and Z axes and both ways, the turn that brings the
    fingertips closest (bone rolls differ, so the side-to-side axis isn't the same one on every finger)."""
    pb, rad = rig.pose.bones[_chain(finger, side)[0]], TOGETHER[finger] * 3.14159265 / 180.0
    x = pb.rotation_euler[0]
    best = None
    for euler in ((x, rad, 0.0), (x, -rad, 0.0), (x, 0.0, rad), (x, 0.0, -rad)):
        pb.rotation_euler = euler
        bpy.context.view_layer.update()
        gap = (_tail(rig, _chain(finger, side)[2]) - _tail(rig, _chain(NEIGHBOUR[finger], side)[2])).length
        if best is None or gap < best[0]:
            best = (gap, euler)
    pb.rotation_euler = best[1]
    bpy.context.view_layer.update()


def _pose(rig, body, side, curl):
    for finger in [*FINGERS, "thumb"]:
        s = _sign(rig, body, finger, side)
        for name, deg in zip(_chain(finger, side), curl[finger]):
            pb = rig.pose.bones[name]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (s * deg * 3.14159265 / 180.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    for finger in ("index", "ring", "pinky"):  # the pinky after the ring, which it closes on
        _together(rig, finger, side)


def _points(rig, side):
    hand = _head(rig, f"hand_{side}")
    out = []
    for finger in [*FINGERS, "thumb"]:
        chain = _chain(finger, side)
        out.append([_head(rig, n) - hand for n in chain] + [_tail(rig, chain[2]) - hand])
    return out


def make(rig, body, grip=None):
    """Adds `xp_gripL/R` (the rail grip) and `xp_flatL/R` (the open hand) to the body, and returns
    {side: {rest, grip, flat}} finger joints (Blender axes)."""
    curls = {"grip": grip or DEFAULT_GRIP, "flat": FLAT}
    missing = [n for f in [*FINGERS, "thumb"] for s in "lr" for n in _chain(f, s) if n not in rig.pose.bones]
    if missing:
        raise SystemExit(f"the rig has no finger bones {missing[:4]}…: the grip is posed before the trim")
    if body.data.shape_keys:
        raise SystemExit("bake the body's shape keys before posing the grip")
    n = len(body.data.vertices)
    rest = [0.0] * (3 * n)
    body.data.vertices.foreach_get("co", rest)
    points = {"l": {}, "r": {}}
    for pose_name, curl in curls.items():
        for side in ("l", "r"):
            morph = f"{pose_name}{side.upper()}"
            _reset(rig)
            points[side]["rest"] = _points(rig, side)
            _pose(rig, body, side, curl)
            points[side][pose_name] = _points(rig, side)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = body.evaluated_get(dg)
            mesh = ev.to_mesh()
            if len(mesh.vertices) != n:
                raise SystemExit("the armature changed the vertex count")
            posed = [0.0] * (3 * n)
            mesh.vertices.foreach_get("co", posed)
            ev.to_mesh_clear()
            attr = expressions._attr(body, morph)
            biggest = 0.0
            for i in range(n):
                d = Vector(posed[3 * i:3 * i + 3]) - Vector(rest[3 * i:3 * i + 3])
                if d.length < 1e-6:
                    d = Vector()
                attr.data[i].vector = d  # both in the mesh's own space
                biggest = max(biggest, d.length)
            print(f"{morph}: the biggest move {1000 * biggest:.0f} mm")
    _reset(rig)
    return points
