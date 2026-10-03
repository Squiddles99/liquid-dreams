"""Leaves and flowers on the shoots (dune-up-close spec §4.2 step 3), the AO bake and the build checks."""
import math
import random

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

GOLDEN = math.pi * (3 - math.sqrt(5))

# Each leaf shape's outline as (u along, v across), a fan from the base: len − 2 triangles.
SHAPES = {
    "needle": [(0, 0), (0.5, 0.12), (1, 0), (0.5, -0.12)],
    "blade": [(0, 0), (0.25, 0.3), (0.7, 0.35), (1, 0), (0.7, -0.35), (0.25, -0.3)],
    "oval": [(0, 0), (0.3, 0.4), (0.75, 0.4), (1, 0), (0.75, -0.4), (0.3, -0.4)],
    "tiny": [(0, 0), (0.5, 0.35), (1, 0), (0.5, -0.35)],
}

# Vertex colour A: what the vertex is (the shader's wind and lighting read it).
WOOD, DEAD_WOOD, LEAF, FLOWER = 0.0, 0.2, 0.5, 1.0


def spray_tris(base, direction, normal, length, width):
    """A leaf spray: one card (2 triangles) from the twig at `base` out along `direction`, `width` across, bent a little
    along its length; each corner with its (u, v) in the spray tile (v 1 at the twig, 0 at the tip)."""
    side = direction.cross(normal).normalized()
    tip = base + direction * length + normal * (length * 0.12)
    a, b = base - side * width * 0.5, base + side * width * 0.5
    c, d = tip + side * width * 0.5, tip - side * width * 0.5
    return [((a, (0, 1)), (b, (1, 1)), (c, (1, 0))), ((a, (0, 1)), (c, (1, 0)), (d, (0, 0)))]


def finger_tris(base, direction, normal, length, width):
    """Pigface's fleshy finger: a three-sided pyramid from the stem to its tip (3 triangles), v 1 at the stem."""
    side = direction.cross(normal).normalized()
    tip = base + direction * length
    ring = [base + (side * math.cos(a) + normal * math.sin(a)) * width * 0.5 for a in (0.0, 2.094, 4.189)]
    return [((ring[k], (k / 3, 1)), (ring[(k + 1) % 3], ((k + 1) / 3, 1)), (tip, ((k + 0.5) / 3, 0))) for k in range(3)]


def leaf_tris(base, direction, normal, length, width, shape):
    """The leaf's triangles (in metres; the caller maps them to the unit plant), slightly cupped across its width."""
    side = direction.cross(normal).normalized()
    pts = [base + direction * (u * length) + side * (v * width) + normal * (abs(v) * width * 0.25) for u, v in SHAPES[shape]]
    return [(pts[0], pts[i], pts[i + 1]) for i in range(1, len(pts) - 1)]


def flower_tris(centre, up, radius, petals):
    """A flower: a star of `petals` thin triangles round a low centre, each corner with its (u, v) in the flower tile."""
    side = up.orthogonal().normalized()
    tris = []
    for k in range(petals):
        a0 = 2 * math.pi * k / petals
        d0 = Matrix.Rotation(a0, 3, up) @ side
        d1 = Matrix.Rotation(a0 + 2 * math.pi / petals * 0.5, 3, up) @ side
        tris.append(((centre + up * radius * 0.25, (0.5, 0.5)), (centre + d0 * radius * 0.3, (0.6, 0.5)),
                     (centre + d1 * radius + up * radius * 0.15, (0.9, 0.5))))
    return tris


def place_leaves(sk, nodes, sp, rng):
    """(node, direction, normal) per leaf, in metres (`nodes`: the skeleton's nodes in metres): along the last
    `leaf_nodes` nodes of every living tip, in a golden spiral (opposite pairs for `opposite` kinds), angled
    `leaf_angle` off the shoot."""
    out = []
    tips = [i for i in range(len(sk.nodes)) if not sk.kids[i] and not sk.dead[i]]
    for i in tips:
        chain = [i]
        while len(chain) < sp["leaf_nodes"] and sk.parent[chain[-1]] >= 0 and not sk.dead[sk.parent[chain[-1]]]:
            chain.append(sk.parent[chain[-1]])
        for k, j in enumerate(chain):
            p = sk.parent[j]
            axis = (nodes[j] - nodes[p]).normalized() if p >= 0 else Vector((0, 0, 1))
            if axis.length < 1e-6:
                axis = Vector((0, 0, 1))
            for q in range(sp["leaves_per_node"]):
                ang = (k * sp["leaves_per_node"] + q) * (math.pi if sp.get("opposite") else GOLDEN) + rng.uniform(-0.3, 0.3)
                out_dir = Matrix.Rotation(ang, 3, axis) @ axis.orthogonal().normalized()
                d = (out_dir * math.sin(sp["leaf_angle"]) + axis * math.cos(sp["leaf_angle"])).normalized()
                n = axis.cross(d).cross(d).normalized() * -1 if abs(d.dot(axis)) < 0.999 else axis.orthogonal().normalized()
                out.append((j, d, n))
    rng.shuffle(out)
    return out[: sp["max_leaves"]]


def add_tris(bm, tris, uv_layer, col_layer, colour, scale, normals, uv_of, bend_to=None):
    """Adds triangles ((point in metres about the plant's base, (u, v) in its tile) × 3) to the unit-plant bmesh;
    `uv_of(u, v)` maps a tile (u, v) to the atlas. `normals` collects each new vertex's normal in creation order: the
    triangle's, or with `bend_to` (a crown centre, unit) half of it bent out from the centre, so the foliage shades as a
    rounded mass rather than flat cards."""
    for (a, ta), (b, tb), (c, tc) in tris:
        ua, ub, uc = (Vector((p.x * scale.x, p.y * scale.y, p.z * scale.z)) for p in (a, b, c))
        n = (ub - ua).cross(uc - ua)
        if n.length < 1e-10:
            continue  # a triangle with no area has no normal (Blender's split normal of it is zero)
        n = n.normalized()
        vs = [bm.verts.new(p) for p in (ua, ub, uc)]
        for p in (ua, ub, uc):
            bent = n
            if bend_to is not None:
                out = p - bend_to
                if out.length > 1e-9:
                    b = n * (1 if n.dot(out) >= 0 else -1) + out.normalized()
                    # Never a zero normal (a card facing straight into the crown's middle): the shader's normalise of
                    # one is NaN, and the vertex goes nowhere (L1 cards vanished or filled the screen).
                    bent = b.normalized() if b.length > 1e-3 else out.normalized()
            normals.append(bent)
        f = bm.faces.new(vs)
        for lp, t in zip(f.loops, (ta, tb, tc)):
            lp[uv_layer].uv = uv_of(*t)
            lp[col_layer] = colour


def bake_ao(me, rays=8, dist=0.15, seed=1):
    """Per-vertex ambient occlusion against the plant itself: the share of `rays` hemisphere rays (round the vertex
    normal) that escape within `dist` (unit). Written into the colour attribute's R; returns (min, max)."""
    verts = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    rng = random.Random(seed)
    dirs = []
    for _ in range(rays):
        z = rng.random()
        r, a = math.sqrt(max(0.0, 1 - z * z)), rng.uniform(0, 2 * math.pi)
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    normals = [Vector(cn.vector) for cn in me.corner_normals]
    vnorm = [Vector((0, 0, 1))] * len(verts)
    for li, loop in enumerate(me.loops):
        vnorm[loop.vertex_index] = normals[li]
    ao = []
    for i, p in enumerate(verts):
        n = vnorm[i]
        frame = n.to_track_quat("Z", "Y").to_matrix()
        open_ = 0
        for d in dirs:
            w = frame @ d
            loc, _, _, _ = tree.ray_cast(p + n * 1e-3 + w * 1e-3, w, dist)
            open_ += loc is None
        # The ground: the lower part of the plant sees less sky.
        ao.append(max(0.15, min(1.0, (open_ / rays) * (0.55 + 0.45 * min(1.0, p.z / 0.4)))))
    col = me.color_attributes["Col"]
    for li, loop in enumerate(me.loops):
        c = list(col.data[li].color)
        c[0] = ao[loop.vertex_index]
        col.data[li].color = c
    return min(ao), max(ao)


EXTENT = {0: (-1.0, 1.0), 1: (-1.0, 1.0), 2: (0.0, 1.0)}


def surface_samples(me, per_edge=4):
    """Points spread over every triangle (a barycentric grid, `per_edge` steps a side): the coverage checks sample the
    surface, not only its vertices (a 10 cm card spans several cells)."""
    co = [v.co for v in me.vertices]
    out = []
    for p in me.polygons:
        vs = [co[i] for i in p.vertices]
        for k in range(1, len(vs) - 1):
            a, b, c = vs[0], vs[k], vs[k + 1]
            for i in range(per_edge + 1):
                for j in range(per_edge + 1 - i):
                    u, v = i / per_edge, j / per_edge
                    out.append(a + (b - a) * u + (c - a) * v)
    return out


def coverage(points, hull_tree, axis, res=48):
    """The share of the hull's projection along `axis` (2: from the top; 1: from the side) that the points cover."""
    a, b = [i for i in range(3) if i != axis]
    cell = lambda v, k: min(res - 1, max(0, int((v - EXTENT[k][0]) / (EXTENT[k][1] - EXTENT[k][0]) * res)))
    grid_h = set()
    for i in range(res):
        for j in range(res):
            o, d = Vector((0, 0, 0)), Vector((0, 0, 0))
            o[a] = EXTENT[a][0] + (EXTENT[a][1] - EXTENT[a][0]) * (i + 0.5) / res
            o[b] = EXTENT[b][0] + (EXTENT[b][1] - EXTENT[b][0]) * (j + 0.5) / res
            o[axis], d[axis] = 5.0, -1.0
            if hull_tree.ray_cast(o, d)[0] is not None:
                grid_h.add((i, j))
    grid_p = {(cell(p[a], a), cell(p[b], b)) for p in points}
    return len(grid_h & grid_p) / max(1, len(grid_h))


def grown_tree(hull, k=1.1):
    pts, tris = hull
    return BVHTree.FromPolygons([Vector((p.x * k, p.y * k, p.z * k)) for p in pts], tris)
