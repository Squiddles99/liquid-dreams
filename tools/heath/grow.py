"""Woody skeletons grown into a hull by space colonisation (Runions et al. 2007), with pipe-model radii (dune-up-close
spec §4.2 steps 1–2). Everything is in the unit plant's space (Blender axes: z up, base at 0, top about 1, footprint
radius about 1); `scale` turns a metre-round radius into the unit plant's per-axis scale."""
import math
import random

from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

UP = Vector((0.0001, 0.0002, 1.0)).normalized()


class Skeleton:
    def __init__(self):
        self.nodes, self.parent, self.radius, self.depth, self.dead = [], [], [], [], []
        self.kids, self.tree = [], None


def inside(tree, p):
    """Inside the closed hull: a ray up crosses it an odd number of times."""
    hits, o = 0, p.copy()
    for _ in range(16):
        loc, _, _, _ = tree.ray_cast(o, UP)
        if loc is None:
            break
        hits, o = hits + 1, loc + UP * 1e-5
    return hits % 2 == 1


def attractors(tree, rng, n, flat):
    pts, tries = [], 0
    while len(pts) < n and tries < n * 50:
        tries += 1
        p = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.0, 1.0)))
        if flat:
            p.z *= 0.35  # pigface: a mat along the ground
        if inside(tree, p):
            pts.append(p)
    return pts


def _kd(points):
    kd = KDTree(len(points))
    for i, p in enumerate(points):
        kd.insert(p, i)
    kd.balance()
    return kd


def skeleton(hull, sp, seed):
    pts, tris = hull
    tree = BVHTree.FromPolygons(pts, tris)
    rng = random.Random(seed)
    att = attractors(tree, rng, sp["attractors"], sp.get("flat", False))
    sk = Skeleton()
    for k in range(sp["stems"]):  # the stems leave the ground near the centre
        a = 2 * math.pi * k / sp["stems"] + rng.uniform(-0.4, 0.4)
        sk.nodes.append(Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.0)))
        sk.parent.append(-1)
    step, kill, reach = sp["step"], sp["kill"], sp["reach"]
    up = Vector((0, 0, sp.get("tropism", 0.25)))
    for _ in range(sp["iterations"]):
        if not att:
            break
        kd = _kd(sk.nodes)
        pull = {}
        for a in att:
            co, i, d = kd.find(a)
            if i is not None and d < reach and d > 1e-9:
                pull.setdefault(i, Vector()).__iadd__((a - co) / d)
        if not pull:
            break
        for i, v in pull.items():
            d = (v.normalized() + up + Vector((rng.gauss(0, 0.15), rng.gauss(0, 0.15), 0))).normalized()
            if sp.get("flat"):
                d.z *= 0.3
                d.normalize()
            q = sk.nodes[i] + d * step
            q.z = max(q.z, 0.0)
            sk.nodes.append(q)
            sk.parent.append(i)
        kd = _kd(sk.nodes)
        att = [a for a in att if kd.find(a)[2] > kill]
    kids = [[] for _ in sk.nodes]
    for i, p in enumerate(sk.parent):
        if p >= 0:
            kids[p].append(i)
    # Pipe model (r_parent² = Σ r_child²), from the twig radius at the tips inward (children always follow parents).
    r2 = [0.0] * len(sk.nodes)
    for i in reversed(range(len(sk.nodes))):
        r2[i] = sum(r2[c] for c in kids[i]) or sp["twig_r"] ** 2
    # A kind's stems stop thickening at max_r (pigface's trailing stems stay about 1 cm whatever they carry).
    sk.radius = [min(math.sqrt(x), sp.get("max_r", 1.0)) for x in r2]
    # Root distance along the branches, normalised (the wind's stiffness).
    dist = [0.0] * len(sk.nodes)
    for i, p in enumerate(sk.parent):
        if p >= 0:
            dist[i] = dist[p] + (sk.nodes[i] - sk.nodes[p]).length
    top = max(dist) or 1.0
    sk.depth = [d / top for d in dist]
    # Dead wood: whole subtrees from a share of the first-order branches (the dead kind: all of it).
    sk.dead = [bool(sp.get("all_dead", False))] * len(sk.nodes)
    firsts = [i for i, p in enumerate(sk.parent) if p >= 0 and sk.parent[p] == -1]
    for i in rng.sample(firsts, int(len(firsts) * sp.get("dead_share", 0.2))):
        stack = [i]
        while stack:
            j = stack.pop()
            sk.dead[j] = True
            stack += kids[j]
    sk.kids = kids
    sk.tree = tree
    return sk


def pipe_ok(sk):
    """No branch thinner than its children together (r² ≥ Σ r_child²), except where max_r caps it."""
    cap = max(sk.radius)
    return all(sk.radius[i] >= cap - 1e-9 or sk.radius[i] + 5e-4 * sk.radius[i] >= math.sqrt(sum(sk.radius[c] ** 2 for c in sk.kids[i])) for i in range(len(sk.nodes)) if sk.kids[i])


def inside_share(sk):
    """The share of the skeleton's nodes inside the hull (a node at the ground counts if just above it is inside)."""
    return sum(1 for n in sk.nodes if inside(sk.tree, Vector((n.x, n.y, max(n.z, 0.02))))) / len(sk.nodes)


def chains(sk):
    """The skeleton as polylines, each from a root or a branching point out to a tip or the next branching point."""
    out = []
    starts = [(-1, i) for i, p in enumerate(sk.parent) if p == -1]
    while starts:
        p, i = starts.pop()
        line = [p] if p >= 0 else []
        line.append(i)
        while len(sk.kids[i]) == 1:
            i = sk.kids[i][0]
            line.append(i)
        out.append(line)
        starts += [(i, c) for c in sk.kids[i]]
    return out


def tubes(bm, sk, scale, uv_layer, col_layer, sides_base=6, sides_tip=3, min_radius=0.0, uv_of=None):
    """Each chain as a tapered tube (6 sides where thick, 3 at the twigs); radii in metres, `scale` maps them to the unit
    plant. Vertex colour: (AO 1 until baked, root distance, 0, 0 = wood or 0.2 = dead wood). Returns the made verts, each
    with its ring centre (for the custom normals)."""
    made = []
    rmin = min(sk.radius)
    for line in chains(sk):
        if sk.radius[line[-1]] < min_radius:
            # L1: keep a chain only while it is thick; cut it where it thins below min_radius.
            keep = [i for i in line if sk.radius[i] >= min_radius]
            if len(keep) < 2:
                continue
            line = keep
        r0 = sk.radius[line[0]]
        sides = sides_base if r0 > 4 * rmin else sides_tip
        if r0 <= 3 * rmin and len(line) > 3:
            line = line[::2] if (len(line) - 1) % 2 == 0 else line[::2] + [line[-1]]  # thin twigs: a ring every other node
        rings, u = [], None
        for k, i in enumerate(line):
            p = sk.nodes[i]
            a, b = sk.nodes[line[min(k + 1, len(line) - 1)]], sk.nodes[line[max(k - 1, 0)]]
            t = (a - b).normalized() if (a - b).length > 1e-9 else Vector((0, 0, 1))
            u = t.orthogonal().normalized() if u is None else (u - t * u.dot(t)).normalized()
            if u.length < 1e-6:
                u = t.orthogonal().normalized()
            v = t.cross(u)
            ring = []
            for s in range(sides):
                ang = 2 * math.pi * s / sides
                off = (u * math.cos(ang) + v * math.sin(ang)) * sk.radius[i]
                vert = bm.verts.new(Vector((p.x + off.x * scale.x, p.y + off.y * scale.y, p.z + off.z * scale.z)))
                made.append((vert, p.copy()))
                ring.append(vert)
            rings.append((i, ring))
        for (i0, a), (i1, b) in zip(rings, rings[1:]):
            for s in range(sides):
                f = bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
                for lp, (uu, vv) in zip(f.loops, ((s / sides, 0), ((s + 1) / sides, 0), ((s + 1) / sides, 1), (s / sides, 1))):
                    node = i0 if vv == 0 else i1
                    lp[uv_layer].uv = uv_of(sk.dead[node], uu, vv) if uv_of else (uu, vv)
                    lp[col_layer] = (1.0, sk.depth[node], 0.0, 0.2 if sk.dead[node] else 0.0)
    return made
