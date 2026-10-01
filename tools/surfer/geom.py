"""Shared geometry for the build: swept tubes, the cloth curtain, and keeping points out of a body.
Blender axes: +x the character's left, -y the front, +z up."""
import math

from mathutils import Vector

SIDES = 8


def tube(bm, pts, r, closed, sides=SIDES, flat=1.0):
    """Sweep a circle of radius r along pts, the frame carried along each point so it never flips. `flat` < 1 squashes
    the section along the frame's second axis (a strap: a band, not a cord). Returns the new verts."""
    n, rings, u = len(pts), [], None
    made = []
    for i, p in enumerate(pts):
        a, b = (pts[(i + 1) % n], pts[i - 1]) if closed else (pts[min(i + 1, n - 1)], pts[max(i - 1, 0)])
        t = (a - b).normalized()
        u = t.orthogonal().normalized() if u is None else (u - t * u.dot(t)).normalized()
        v = t.cross(u)
        ring = [bm.verts.new(p + (u * math.cos(2 * math.pi * k / sides) + v * flat * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)]
        rings.append(ring)
        made += ring
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return made


def curtain(points, top_z, step=0.02, bins=48):
    """Cloth hangs straight down from whatever is widest above it (walking spec §3): for each angle around the torso's
    axis and each 2 cm row from `top_z` down, the largest radius of any of `points` (the torso's vertices: no arms or
    head, so nothing hangs off them) at or above that row. Returns at(x, y, z) → (that radius at the point's angle,
    the axis's centre at its row)."""
    rows = {}
    for c in points:
        rows.setdefault(round(c.z / step), []).append(c)
    # One vertical axis for every row: radii measured from centres that drift row to row (the bust forward, the seat
    # back) stack into a bulge when the widest above is carried down.
    axis = Vector((sum(p.x for p in points) / len(points), sum(p.y for p in points) / len(points), 0))
    centre = {q: axis for q in rows}
    zs = sorted(rows)
    best = {}
    for q, ps in rows.items():
        for c in ps:
            a = int((math.atan2(c.y - centre[q].y, c.x - centre[q].x) + math.pi) / (2 * math.pi) * bins) % bins
            r = math.hypot(c.x - centre[q].x, c.y - centre[q].y)
            best[(q, a)] = max(best.get((q, a), 0.0), r)
    hang = {}
    for a in range(bins):
        run = 0.0
        for q in reversed(zs):
            if q * step <= top_z:
                # Look either side too: a bin the torso's vertices missed would notch the drape.
                run = max(run, *(best.get((q, (a + d) % bins), 0.0) for d in (-1, 0, 1)))
            hang[(q, a)] = run

    def at(x, y, z):
        q = min(zs, key=lambda r: abs(r * step - z))
        c = centre[q]
        a = int((math.atan2(y - c.y, x - c.x) + math.pi) / (2 * math.pi) * bins) % bins
        return hang.get((q, a), 0.0), c
    return at


def smoothed_tree(obj, iterations=40):
    """A BVH of a smoothed copy of obj's first material's faces: big shapes kept, small bumps (nipples, knuckles of
    the spine) gone, so cloth cleared from it rides over them instead of printing them."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != 0], context="FACES")
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=list(bm.verts), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def push_out(tree, p, clear):
    """p moved out of the surface in `tree` until it's `clear` metres outside it (nearest point and its normal)."""
    loc, normal, _, _ = tree.find_nearest(p)
    if loc is not None and (p - loc).dot(normal) < clear:
        return loc + normal * clear
    return p


def inside_count(obj, tree, tol=0.001):
    """How many of obj's vertices sit more than `tol` inside the surface in `tree`."""
    n = 0
    for v in obj.data.vertices:
        loc, normal, _, _ = tree.find_nearest(v.co)
        if loc is not None and (v.co - loc).dot(normal) < -tol:
            n += 1
    return n
