"""The face and scalp painted into the body's colour layer (gate 2, Andrew: "not pretty enough", "hair looks horrible").

The layer is exported as COLOR_0 (linear floats), and the game's body shader reads its four channels as masks:
  R  scalp: hair colour under the hair cards, so gaps between them show hair, not skin, with a soft hairline
  G  eyebrows
  B  lips (MPFB's 'lips' group, feathered one ring out)
  A  lash line (the upper lid's rim, like eyeliner)
  B and A together: the inside of the mouth (dark, wet red)
On the lashes (material slot 1) the same layer carries the lash coordinates instead: R root → tip, G along the lid
(inner corner → outer), B 1 upper / 0 lower (closeup spec §4.1).
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


def _lip_mask(body):
    """MPFB's 'lips' group (a float attribute since the helpers went), feathered: each vertex takes the mean of itself
    and its neighbours, twice, so the lip line is soft rather than stepped."""
    a = body.data.attributes.get("lipmask")
    if a is None:
        return [0.0] * len(body.data.vertices)
    m = [e.value for e in a.data]
    nbrs = [[] for _ in m]
    for e in body.data.edges:
        i, j = e.vertices
        nbrs[i].append(j)
        nbrs[j].append(i)
    for _ in range(2):
        m = [(m[i] * 2 + sum(m[j] for j in nb)) / (2 + len(nb)) if nb else m[i] for i, nb in enumerate(nbrs)]
    return m


def _mouth_inside(v, mouth, lip_front, tree):
    """The dark inside of the mouth, so parted lips never show skin behind them. A vertex 3 mm or more behind the lip's
    front, within the mouth's width and height, is inside when its normal looks back into the face (a ray along it hits
    the mouth's far wall, behind the lip, within 2 cm) or it's deep in the mouth (2 cm back, near the midline). The
    outer skin around the mouth (cheeks, philtrum, chin) looks out into the air."""
    co = v.co
    if mouth is None or lip_front is None or co.y < lip_front.y + 0.003:
        return 0.0
    if abs(co.x - mouth.x) > 0.027 or abs(co.z - mouth.z) > 0.02:
        return 0.0
    if abs(co.x - mouth.x) < 0.015 and co.y > lip_front.y + 0.02:
        return 1.0
    # 4 cm: with the jaw open the cavity's far walls are further than the closed mouth's 2 cm.
    hit, _, _, _ = tree.ray_cast(co + v.normal * 0.0005, v.normal, 0.04)
    return 1.0 if hit is not None and abs(hit.z - mouth.z) < 0.02 and hit.y > lip_front.y + 0.001 else 0.0


def _lash_coords(body, L):
    """Per lash vertex: (root → tip, along the lid from the inner corner, 1 upper / 0 lower), per strip."""
    a = body.data.attributes.get("lash")
    if a is None:
        return {}
    strips = {}
    for v in body.data.vertices:
        kind = a.data[v.index].value
        if kind <= 0:
            continue
        side = "l" if v.co.x > 0 else "r"
        strips.setdefault((side, kind > 0.75), []).append(v)
    out = {}
    for (side, upper), vs in strips.items():
        c = L["eyes"][side]
        out_dir = 1.0 if side == "l" else -1.0
        d = {v.index: (v.co - c).length for v in vs}
        ang = {v.index: math.atan2(v.co.z - c.z, (v.co.x - c.x) * out_dir) for v in vs}
        dmin, dmax = min(d.values()), max(d.values())
        amin, amax = min(ang.values()), max(ang.values())
        for v in vs:
            t = (d[v.index] - dmin) / max(dmax - dmin, 1e-6)
            along = (ang[v.index] - amin) / max(amax - amin, 1e-6)
            # The upper strip's angle runs outer (0 rad) → inner (π): flip so 0 is the inner corner either way.
            out[v.index] = (t, 1.0 - along if upper else along, 1.0 if upper else 0.0)
    return out


def shape_lashes(body, L, lashes):
    """Lengthen and curl the lash strips (closeup spec §4.1): each vertex pushed out from the eye by its share of the
    extra length, and the tips curled away from the eye (up for the upper lashes, down for the lower)."""
    coords = _lash_coords(body, L)
    up = lashes.get("upper", 0.009)
    low = lashes.get("lower", 0.005)
    curl = lashes.get("curl", 0.003)
    for v in body.data.vertices:
        if v.index not in coords:
            continue
        t, _, upper = coords[v.index]
        side = "l" if v.co.x > 0 else "r"
        c = L["eyes"][side]
        radial = (v.co - c).normalized()
        extra = (up if upper else low) - 0.007  # the helper strips are ~7 mm long
        v.co = v.co + radial * (max(0.0, extra) * t) + Vector((0, -0.25, 1.0 if upper else -1.0)).normalized() * (curl * t * t)
    body.data.update()


def paint(body, weights, L, brow_weight=1.0):
    centre, eye_z, eyes, mouth = L["head_centre"], L["eye_z"], L["eyes"], L.get("mouth")
    eye_pts = [p for p in eyes.values() if p is not None]
    eye_y = min((p.y for p in eye_pts), default=centre.y - 0.08)
    layer = body.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    lips_m = _lip_mask(body)
    lash_uv = _lash_coords(body, L)
    for v, row in zip(body.data.vertices, weights):
        if v.index in lash_uv:
            t, along, upper = lash_uv[v.index]
            layer.data[v.index].color = (t, along, upper, 1.0)
            continue
        head = sum(w for b, _, w in row if b == "head")
        co = v.co
        scalp = _scalp(co, centre, eye_z) * head
        brow = max((_brow(co, p, eye_y, brow_weight) for p in eye_pts), default=0.0) * head
        lash = max((_lash(co, p, eye_y) for p in eye_pts), default=0.0) * head
        inside = _mouth_inside(v, mouth, L.get("lip_front"), tree) * head
        lips = max(min(1.0, lips_m[v.index] * 1.15), inside) * head
        lash = lash * (1.0 - inside) + inside
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
