"""Local smoothing where painted-on swimwear would otherwise show the base body's anatomy (gate 1, Andrew)."""
import bmesh
from mathutils import Vector


def _smooth(body, centre, radius, iterations=60, factor=0.6):
    """Laplacian smoothing inside a sphere, blended out toward its edge so no seam shows."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    inside = [v for v in bm.verts if (v.co - centre).length < radius]
    before = {v.index: v.co.copy() for v in inside}
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=inside, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in inside:
        d = (before[v.index] - centre).length / radius
        keep = max(0.0, min(1.0, (d - 0.55) / 0.45))  # full smoothing in the middle, none at the rim
        keep = keep * keep * (3 - 2 * keep)
        v.co = v.co.lerp(before[v.index], keep)
    bm.to_mesh(body.data)
    bm.free()


def crotch_centre(body, H):
    mid = [v.co for v in body.data.vertices if abs(v.co.x) < 0.015 and 0.4 * H < v.co.z < 0.55 * H]
    if not mid:
        raise SystemExit("no midline vertices between 0.4 H and 0.55 H: can't find the crotch")
    crotch = min(p.z for p in mid)
    front = [p for p in mid if crotch <= p.z <= crotch + 0.05 and p.y < 0]
    return sum(front, Vector()) / len(front) if front else Vector((0, 0, crotch + 0.025))


def nipples(body, H):
    out = []
    for side in (1, -1):
        band = [v.co for v in body.data.vertices if side * v.co.x > 0.03 and 0.66 * H < v.co.z < 0.78 * H]
        out.append(min(band, key=lambda p: p.y))  # the most forward point of each breast (the face is toward -Y)
    return out


def smooth_anatomy(body, H, regions):
    if "crotch" in regions:
        _smooth(body, crotch_centre(body, H), 0.07)
    if "nipples" in regions:
        for p in nipples(body, H):
            _smooth(body, p, 0.035)


def upper_lip(body, mouth, amount):
    """Thin the upper lip (dune select spec §13.1; Andrew: "her top lip is a bit too big"). MPFB's lip targets move it by
    millimetres only. Each upper-lip vertex (MPFB's lips mask, above the mouth line) is drawn down toward the mouth line by
    `amount` of its height, so the vermilion is shorter; the lip colour rides the vertices, so the pink band shrinks with
    it. Never pulled back: pulling the bulge in put the lip's front behind the upper teeth, which showed through it.
    Returns the upper lip's height (mm) before and after."""
    lm = body.data.attributes.get("lipmask")
    if lm is None or mouth is None:
        return None
    line = mouth.z + 0.002
    upper = [(v, lm.data[v.index].value) for v in body.data.vertices if lm.data[v.index].value > 0.05 and v.co.z > line and abs(v.co.x - mouth.x) < 0.035]
    if not upper:
        return None
    solid = [v.co.z for v, w in upper if w > 0.5]
    before = 1000 * (max(solid) - line) if solid else 0.0
    for v, w in upper:
        v.co.z -= amount * (v.co.z - line) * w
    solid = [v.co.z for v, w in upper if w > 0.5]
    after = 1000 * (max(solid) - line) if solid else 0.0
    body.data.update()
    return round(before, 2), round(after, 2)
