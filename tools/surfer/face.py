"""The face and scalp painted into the body's colour layer (gate 2, Andrew: "not pretty enough", "hair looks horrible").

The layer is exported as COLOR_0 (linear floats), and the game's body shader reads its four channels as masks:
  R  scalp: hair colour under the hair cards, so gaps between them show hair, not skin, with a soft hairline
  G  eyebrows
  B  lips
  A  lash line (the upper lid's rim, like eyeliner)
Blender axes: +x the character's left, -y the front of the face, +z up.
"""
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _ramp(x, edge, width):
    """0 below edge - width / 2, 1 above edge + width / 2."""
    return max(0.0, min(1.0, 0.5 + (x - edge) / width))


def _scalp(co, centre, eye_z):
    # The hairline: well above the brow at the front, above the ears at the sides, down to the nape at the back.
    back = _ramp(co.y, centre.y, 0.06)
    line = (eye_z + 0.065) * (1 - back) + (eye_z - 0.05) * back
    if abs(co.x) > 0.055 and 0.15 < back < 0.85:
        line = max(line, eye_z + 0.025)  # clear of the ears
    return _ramp(co.z, line, 0.015)


def _brow(co, eye, eye_y, weight):
    """A thin arch from just inside the eye's inner corner (never meeting its twin) to past its outer corner, peaking
    about two-thirds of the way out; thicker at the inner end; `weight` scales the thickness per surfer."""
    if co.y > eye_y + 0.012:
        return 0.0
    out = 1.0 if eye.x > 0 else -1.0  # away from the nose
    a = (co.x - eye.x) * out
    inner, outer, peak = -0.013, 0.03, 0.62
    if a < inner - 0.006 or a > outer + 0.008:
        return 0.0
    s = min(1.0, max(0.0, (a - inner) / (outer - inner)))
    k = (s - peak) / (peak if s < peak else 1 - peak)
    mid = eye.z + 0.0145 + 0.0055 * (1 - k * k)
    half = (0.0018 + 0.0012 * (1 - s)) * weight
    ends = min(_ramp(a, inner, 0.006), _ramp(-a, -outer, 0.008))
    return min(_ramp(co.z, mid - half, 0.003), _ramp(-co.z, -(mid + half), 0.003)) * ends


def _lash(co, eye, eye_y):
    """The upper lid's rim: a thin arc along the top of the eye opening."""
    if co.y > eye_y - 0.004:
        return 0.0
    dx, dz = (co.x - eye.x) / 0.016, (co.z - eye.z) / 0.009
    r = math.hypot(dx, dz)
    if dz < -0.15:
        return 0.0
    return max(0.0, 1.0 - abs(r - 1.0) / 0.22) * _ramp(dz, 0.0, 0.3)


def _lips(co, mouth):
    """An ellipse over the mouth, only on the front surface (the lips sit ahead of the teeth)."""
    if co.y > mouth.y - 0.004:
        return 0.0
    r = math.hypot((co.x - mouth.x) / 0.026, (co.z - mouth.z) / 0.0115)
    return _ramp(-r, -1.0, 0.25)


def _mouth_inside(v, mouth, lip_front, tree):
    """The dark inside of the mouth, so parted lips never show skin behind them. A vertex 3 mm or more behind the lip's
    front, within the mouth's width and height, is inside when its normal looks back into the face (a ray along it hits
    the mouth's far wall, behind the lip, within 2 cm) or it's deep in the mouth (2 cm back, near the midline). The
    outer skin around the mouth (cheeks, philtrum, chin) looks out into the air."""
    co = v.co
    if mouth is None or lip_front is None or co.y < lip_front.y + 0.003:
        return 0.0
    if abs(co.x - mouth.x) > 0.025 or abs(co.z - mouth.z) > 0.012:
        return 0.0
    if abs(co.x - mouth.x) < 0.015 and co.y > lip_front.y + 0.02:
        return 1.0
    hit, _, _, _ = tree.ray_cast(co + v.normal * 0.0005, v.normal, 0.02)
    return 1.0 if hit is not None and abs(hit.z - mouth.z) < 0.012 and hit.y > lip_front.y + 0.001 else 0.0


def paint(body, weights, L, brow_weight=1.0):
    centre, eye_z, eyes, mouth = L["head_centre"], L["eye_z"], L["eyes"], L.get("mouth")
    eye_pts = [p for p in eyes.values() if p is not None]
    eye_y = min((p.y for p in eye_pts), default=centre.y - 0.08)
    layer = body.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    for v, row in zip(body.data.vertices, weights):
        head = sum(w for b, _, w in row if b == "head")
        co = v.co
        scalp = _scalp(co, centre, eye_z) * head
        brow = max((_brow(co, p, eye_y, brow_weight) for p in eye_pts), default=0.0) * head
        lash = max((_lash(co, p, eye_y) for p in eye_pts), default=0.0) * head
        lash = max(lash, _mouth_inside(v, mouth, L.get("lip_front"), tree) * head)
        lips = _lips(co, mouth) * head if mouth is not None else 0.0
        layer.data[v.index].color = (scalp, brow, lips, lash)
    body.data.color_attributes.active_color = layer


def colour_eyes(eye_obj, L):
    """Each vertex's angle from straight ahead, as (cos + 1) / 2 in R: the game's shader draws a round iris, limbus and
    pupil from it (painting colours per vertex on a sphere this coarse drew jagged, cross-shaped irises)."""
    layer = eye_obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    fwd = Vector((0, -1, 0))
    centres = [p for p in L["eyes"].values() if p is not None]
    for v in eye_obj.data.vertices:
        c = min(centres, key=lambda p: (v.co - p).length) if centres else Vector()
        cos = max(-1.0, min(1.0, (v.co - c).normalized().dot(fwd)))
        layer.data[v.index].color = ((cos + 1) / 2, 0.0, 0.0, 1.0)
    eye_obj.data.color_attributes.active_color = layer
