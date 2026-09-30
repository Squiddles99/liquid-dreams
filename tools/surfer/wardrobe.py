"""The wardrobe (spec §4.3): masks baked into UV maps, and the boardies as the one loose garment."""
import json
import math
import os

import bmesh
import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTFITS = json.load(open(os.path.join(REPO, "src", "surfer", "outfitMasks.json"), encoding="utf-8"))
TORSO = {"pelvis", "spine_01", "spine_02", "spine_03", "clavicle"}
ARMS_AND_HEAD = {"upperarm", "forearm", "hand", "neck", "head"}
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


def rashie(b, t, co, H):
    """A short-sleeved lycra rash vest to the waist (Andrew, gate 1): sleeves to mid upper arm, skin above the bottoms."""
    if b in ("spine_01", "spine_02", "spine_03", "clavicle", "pelvis"):
        return above(co.z, 0.575 * H, W_Z)
    if b == "neck":
        return below(t, 0.25, W_T)
    if b == "upperarm":
        return below(t, 0.45, W_T)
    return 0.0


# Measured from the body by paint_masks before any rule runs (Blender axes: +x the left, -y the front, +z up).
LANDMARKS = {"crotch_z": 0.0}
BIKINI_W = 0.07  # wider than the decimated mesh's biggest triangles on the hips, so the cut lines stay exact


def bikini_bottoms(b, t, co, H):
    """Andrew's gate-1 cut: sits up on the hips, legs cut high, 3 cm side straps, a semi G-string back.

    Covered between the waistband (rising toward the hips) and a lower edge that climbs from the crotch outward:
    front, from a 3 cm gusset (the high-cut legs); back, from a 1.5 cm strip, steeply, so the back is a narrow
    triangle (the semi G-string). Never above the strap's lower edge.
    """
    if b in ARMS_AND_HEAD:  # geometric everywhere else: a bone-by-bone rule notched the edges at bone boundaries
        return 0.0
    crotch, x = LANDMARKS["crotch_z"], abs(co.x)
    top = crotch + 0.068 * H + 0.15 * x
    back = max(0.0, min(1.0, 0.5 + co.y / 0.06))  # 0 at the front, 1 at the back
    slope = 1.2 * (1 - back) + 2.0 * back
    gusset = 0.03 * (1 - back) + 0.015 * back
    edge, strap = crotch + slope * max(0.0, x - gusset) - 0.01, top - 0.03
    # Covered above the lower of the leg opening and the strap: the max of the two soft terms, which stays
    # continuous where the opening meets the strap. The opening's edge is diagonal, so it is softened across itself.
    steep = slope if x > gusset else 0.0
    leg = max(0.0, min(1.0, 0.5 + (co.z - edge) / (BIKINI_W * math.sqrt(1 + steep * steep))))
    return min(below(co.z, top, BIKINI_W), max(leg, above(co.z, strap, BIKINI_W)))


def bikini_top(b, t, co, H):
    """A bandeau around the chest (ruling: reads as a bikini top at the chase camera's distance)."""
    if b in ARMS_AND_HEAD or abs(co.x) > 0.16 * H:
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


RULES = [springsuit, short_arm_steamer, rashie, bikini_bottoms, bikini_top, under_boardies]


def measure(body, H):
    """The crotch: the lowest point on the body's midline between the knees and the waist."""
    mid = [v.co.z for v in body.data.vertices if abs(v.co.x) < 0.015 and 0.4 * H < v.co.z < 0.55 * H]
    if not mid:
        raise SystemExit("no midline vertices between 0.4 H and 0.55 H: can't find the crotch")
    LANDMARKS["crotch_z"] = min(mid)


def paint_masks(body, weights, H):
    measure(body, H)
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
