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
