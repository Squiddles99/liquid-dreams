"""The wardrobe (spec §4.3): masks baked into UV maps, and the boardies as the one loose garment."""
import json
import os

import bmesh
import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTFITS = json.load(open(os.path.join(REPO, "src", "surfer", "outfitMasks.json"), encoding="utf-8"))
TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle"}
# Soft edges: each rule returns 0-1 with its 0.5 crossing exactly on the cut line, so the shader's 0.5 threshold on
# the interpolated value draws a clean edge instead of a vertex staircase.
W_T = 0.12  # along a bone, as a fraction of its length (wider than a triangle, so the cut line is exact)
W_Z = 0.05  # metres


def below(x, thr, w):
    return max(0.0, min(1.0, 0.5 + (thr - x) / w))


def above(x, thr, w):
    return below(-x, -thr, w)


def short_arm_steamer(b, t, co, H):
    if b in TORSO or b == "thigh":
        return 1.0
    if b == "neck":
        return below(t, 0.35, W_T)
    if b == "upperarm":
        return below(t, 0.55, W_T)
    if b == "shin":
        return below(t, 0.93, W_T)
    return 0.0


def springsuit(b, t, co, H):
    if b == "shin":
        return 0.0
    if b == "thigh":
        return below(t, 0.45, W_T)
    return short_arm_steamer(b, t, co, H)


def vest(b, t, co, H):
    if b in ("spine_01", "spine_02", "spine_03", "clavicle"):
        return 1.0
    if b == "neck":
        return below(t, 0.2, W_T)
    if b == "pelvis":
        return above(co.z, 0.56 * H, W_Z)
    return 0.0


def bikini_bottoms(b, t, co, H):
    if b == "pelvis":
        return below(co.z, 0.535 * H, W_Z)
    if b == "thigh":
        return below(t, 0.06, W_T)
    return 0.0


def bikini_top(b, t, co, H):
    """A bandeau around the chest (ruling: reads as a bikini top at the chase camera's distance)."""
    if b not in ("spine_02", "spine_03", "clavicle"):
        return 0.0
    return min(above(co.z, 0.69 * H, W_Z), below(co.z, 0.755 * H, W_Z))


def under_boardies(b, t, co, H):
    if b in ("pelvis", "spine_01"):
        return below(co.z, 0.585 * H, W_Z)
    if b == "thigh":
        return below(t, 0.62, W_T)
    return 0.0


def blended(rule, row, co, H):
    """The rule over every bone the vertex follows, weighted: smooth across bone boundaries too."""
    return sum(w * rule(b, t, co, H) for b, t, w in row)


RULES = [springsuit, short_arm_steamer, vest, bikini_bottoms, bikini_top, under_boardies]


def paint_masks(body, weights, H):
    vals = [[blended(rule, row, v.co, H) for rule in RULES] for v, row in zip(body.data.vertices, weights)]
    for layer, (i, j) in (("mask_a", (0, 1)), ("mask_b", (2, 3)), ("mask_c", (4, 5))):
        uv = body.data.uv_layers.new(name=layer)
        for loop in body.data.loops:
            m = vals[loop.vertex_index]
            uv.data[loop.index].uv = (m[i], m[j])


def boardies(body, rig, coords, weights, H, name):
    """A copy of the body's region under the boardies, pushed out 1.2 cm and flared at the hems; same weights."""
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = f"{name}_boardies"
    bpy.context.scene.collection.objects.link(dup)
    inside = {i for i, row in enumerate(weights) if blended(under_boardies, row, body.data.vertices[i].co, H) >= 0.5}
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.verts.ensure_lookup_table()
    orig = bm.verts.layers.int.new("orig")  # coords is indexed by the body's vertex numbers, which delete renumbers
    for v in bm.verts:
        v[orig] = v.index
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in inside for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        b, t = coords[v[orig]]
        flare = 0.035 * max(0.0, min(1.0, (t - 0.35) / 0.27)) if b == "thigh" else 0
        v.co += v.normal * (0.012 + flare)
    bm.to_mesh(dup.data)
    bm.free()
    for layer in [l.name for l in dup.data.uv_layers][1:]:
        dup.data.uv_layers.remove(dup.data.uv_layers[layer])
    dup.parent = rig
    return dup
