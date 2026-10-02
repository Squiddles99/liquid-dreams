"""Shazza's low pigtail braids (dune select spec §13.2; Andrew's reference: reference/surfer/shazza-braids-ref.webp).

A centre part; the hair combed down from it, over the ears, to a braid's start behind and below each ear at about jaw
height; loose face-framing pieces from the front hairline to the jaw (dry only: wet, they're slicked back into the
braids); two three-strand plaits hanging forward over the front of the shoulders onto the upper chest; a small elastic
at each end and a loose tail below it.

Returns cards for hair._cards_object (each with its atlas role and, for the braid's staves, the direction each card faces),
the elastics as their own mesh (material `hairTie`), and numbers for the manifest's checks. Blender axes: +x the
character's left, -y the front, +z up.
"""
import math

import bmesh
import bpy
from mathutils import Vector

# The plait: each strand's lateral offset is a sine at 120° phases, its depth a sine at twice the frequency, so each
# strand crosses over the middle in turn. One full cycle every PERIOD of the braid's length.
# Chunky and loose, like Andrew's reference (about 3–4 cm across at the top).
PERIOD = 0.055
# The strands press together: each swings sideways about its own thickness (twice that left gaps, and the lobes read as
# stacked blocks), so the lobes round into each other.
HALF_WIDTH = (0.0115, 0.0075)  # the braid's sideways swing at its start and its end
DEPTH = 0.0055
STRAND_R = (0.009, 0.006)  # each strand's radius, start to end
STAVES = 3  # soft cards over each strand's solid tube: its fuzzy silhouette
RING = 12  # each strand's solid tube: vertices round it
CLEAR = 0.006  # the braid's surface off the skin or the clothes
# The elastic cinches the plait: over its last CINCH of length the braid draws in to a tight bundle (Andrew: the ties
# looked too loose), the elastic sits snug on it, and the tail fans out below.
CINCH = 0.025
BUNDLE_R = 0.0042  # the cinched bundle's radius under the elastic


def _catmull(points, n):
    """n points along a Catmull–Rom spline through `points`."""
    pts = [points[0], *points, points[-1]]
    out = []
    segs = len(points) - 1
    for i in range(n):
        t = i / (n - 1) * segs
        k = min(int(t), segs - 1)
        u = t - k
        p0, p1, p2, p3 = pts[k], pts[k + 1], pts[k + 2], pts[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return out


def _off_body(p, tree, clear):
    """`p` moved out to at least `clear` off the nearest surface; with that surface's normal."""
    loc, normal, _, _ = tree.find_nearest(p)
    if loc is None:
        return p, Vector((0, -1, 0))
    if (p - loc).dot(normal) < clear:
        p = loc + normal * clear
    return p, normal


def _surface_near(p, tree, clear):
    loc, normal, _, _ = tree.find_nearest(p)
    return loc + normal * clear, normal


def braid_path(side, L, rig, tree, wet):
    """The braid's centreline, start (behind and below the ear) to end (on the upper chest), and its end's clavicle."""
    s = 1.0 if side == "l" else -1.0
    ear = L["ears"][side]
    clav = rig.data.bones[f"clavicle_{side}"]
    ch, ct = clav.head_local, clav.tail_local
    r = HALF_WIDTH[0] + STRAND_R[0] + CLEAR
    # Low: behind and below the ear, at the back of the jaw, so the back of the head's hair falls to it.
    start, _ = _surface_near(ear + Vector((s * 0.002, 0.036, -0.08)), tree, r)
    neck, _ = _surface_near(ear + Vector((s * 0.014, 0.008, -0.13)), tree, r)
    shoulder, _ = _surface_near(ch.lerp(ct, 0.38) + Vector((0, -0.05, 0.015)), tree, r)
    end, _ = _surface_near(Vector((ch.lerp(ct, 0.32).x, ch.y - 0.09, ch.z - 0.15)), tree, HALF_WIDTH[1] + STRAND_R[1] + CLEAR)
    path = _catmull([start, neck, shoulder, end], 90)
    # Relax: off the body (and the clothes) by the braid's radius at each point, then smoothed, a few times.
    for _ in range(6):
        out = []
        for i, p in enumerate(path):
            f = i / (len(path) - 1)
            rad = (HALF_WIDTH[0] + (HALF_WIDTH[1] - HALF_WIDTH[0]) * f) + (STRAND_R[0] + (STRAND_R[1] - STRAND_R[0]) * f) + CLEAR
            out.append(_off_body(p, tree, rad)[0])
        path = [out[0]] + [(out[i - 1] + out[i] * 2 + out[i + 1]) / 4 for i in range(1, len(out) - 1)] + [out[-1]]
    return path, ch


def _frames(path, tree):
    """Per point: the tangent, the outward normal (away from the body) and the binormal across the braid."""
    frames = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        _, n = _off_body(p, tree, 0.0)
        n = (n - t * n.dot(t)).normalized()
        b = t.cross(n).normalized()
        frames.append((t, n, b))
    return frames


def _lengths(path):
    out, a = [0.0], 0.0
    for i in range(1, len(path)):
        a += (path[i] - path[i - 1]).length
        out.append(a)
    return out


def _cinch(along, total):
    """1 along the braid, falling smoothly to 0 at the elastic (CINCH before it)."""
    tie_at = total - 0.01
    x = max(0.0, min(1.0, (tie_at - along) / CINCH))
    return x * x * (3 - 2 * x)


def plait(path, frames, wet):
    """The three strands' centrelines, and each point's strand radius: the plait full down its length, drawn in to
    the cinched bundle at the elastic."""
    scale = 0.85 if wet else 1.0
    strands = [[], [], []]
    phases = [[], [], []]
    radii = []
    lens = _lengths(path)
    total = lens[-1]
    for i, (p, (t, n, b)) in enumerate(zip(path, frames)):
        f = i / (len(path) - 1)
        c = _cinch(lens[i], total)
        w = scale * (HALF_WIDTH[0] + (HALF_WIDTH[1] - HALF_WIDTH[0]) * f) * c + (1 - c) * BUNDLE_R * 0.35
        d = DEPTH * scale * c
        th = 2 * math.pi * lens[i] / PERIOD
        for k in range(3):
            ph = th + 2 * math.pi * k / 3
            strands[k].append(p + b * (w * math.sin(ph)) + n * (d * math.sin(2 * ph)))
            phases[k].append(ph)
        r = scale * (STRAND_R[0] + (STRAND_R[1] - STRAND_R[0]) * f)
        radii.append(r * c + (1 - c) * BUNDLE_R * 0.7)
    return strands, radii, phases


def tube_cards(line, radii, rng):
    """STAVES cards around one strand: each a ribbon on the strand's surface, facing out from it."""
    cards, outs = [], []
    k = len(line)
    for j in range(STAVES):
        a0 = 2 * math.pi * j / STAVES + rng.uniform(-0.2, 0.2)
        pts, nrm = [], []
        for i, p in enumerate(line):
            t = (line[min(i + 1, k - 1)] - line[max(i - 1, 0)]).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(ref).normalized()
            v = t.cross(u).normalized()
            a = a0 + 0.35 * i / k  # a little twist along the strand
            radial = u * math.cos(a) + v * math.sin(a)
            pts.append(p + radial * radii[i] * 1.12)
            nrm.append(radial)
        cards.append((pts, 2 * math.pi * sum(radii) / len(radii) / STAVES * 1.2))
        outs.append(nrm)
    return cards, outs


def tie_and_tail(path, frames, rng, wet):
    """The elastic (a small torus) 1 cm from the braid's end, and the loose tail fanning out below it."""
    # The elastic: snug round the cinched bundle (its radius plus the strands' thickness), not round the full plait.
    lens = _lengths(path)
    i_tie = min(range(len(path)), key=lambda i: abs(lens[i] - (lens[-1] - 0.01)))
    c, (t, n, b) = path[i_tie], frames[i_tie]
    w = BUNDLE_R
    major, minor = BUNDLE_R + 0.0012, 0.0014
    bm = bmesh.new()
    seg, ring = 18, 6
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        d = n * math.cos(a) + b * math.sin(a)
        row = []
        for j in range(ring):
            q = 2 * math.pi * j / ring
            row.append(bm.verts.new(c + d * (major + minor * math.cos(q)) + t * (minor * math.sin(q))))
        verts.append(row)
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((verts[i][j], verts[(i + 1) % seg][j], verts[(i + 1) % seg][(j + 1) % ring], verts[i][(j + 1) % ring]))
    cards, outs = [], []
    for _ in range(30 if not wet else 22):
        a = rng.uniform(0, 2 * math.pi)
        radial = n * math.cos(a) + b * math.sin(a)
        root = c + radial * w * 0.6 + t * 0.002
        spread = rng.uniform(0.15, 0.5) * (0.6 if wet else 1.0)
        length = rng.uniform(0.03, 0.055)
        pts, nrm = [], []
        for i in range(7):
            f = i / 6
            pts.append(root + t * (length * f) + radial * (spread * length * f * f))
            nrm.append(radial)
        cards.append((pts, 0.007))
        outs.append(nrm)
    return bm, cards, outs, c


def flyaways(strands, frames, rng, count):
    cards = []
    for _ in range(count):
        k = rng.randrange(3)
        i = rng.randrange(3, len(strands[k]) - 6)
        t, n, b = frames[i]
        d = (n * rng.uniform(0.4, 1.0) + b * rng.uniform(-1, 1) + t * rng.uniform(0.2, 0.8)).normalized()
        p = strands[k][i]
        length = rng.uniform(0.012, 0.03)
        cards.append(([p + d * (length * f / 4) + t * (0.004 * f * f / 16) for f in range(5)], 0.004))
    return cards


def build_ties(bms, name, rig, skin):
    """The elastics as one object (material hairTie), skinned like the braids' ends."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for part in bms:
        tmp = bpy.data.meshes.new("tmp")
        part.to_mesh(tmp)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        part.free()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for v in me.vertices:
        for bone, w in skin(v.co).items():
            if w > 1e-4:
                g = groups.get(bone) or groups.setdefault(bone, obj.vertex_groups.new(name=bone))
                g.add([v.index], w, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    mat = bpy.data.materials.get("hairTie") or bpy.data.materials.new("hairTie")
    mat.use_nodes = True
    me.materials.append(mat)
    return obj


def transport_frames(line):
    """Twist-free frames along a polyline (parallel transport): each point's (tangent, u, v). Picking a fixed reference
    axis instead flips the frame where the line runs near it (a braid hangs near vertical), pinching the tube there."""
    k = len(line)
    ts = [(line[min(i + 1, k - 1)] - line[max(i - 1, 0)]).normalized() for i in range(k)]
    ref = Vector((1, 0, 0)) if abs(ts[0].x) < 0.9 else Vector((0, 1, 0))
    u = ts[0].cross(ref).normalized()
    out = []
    for i, t in enumerate(ts):
        if i:
            u = (u - t * u.dot(t)).normalized()  # carried along, with its turn about the tangent removed
        out.append((t, u, t.cross(u).normalized()))
    return out


def strand_tube(line, radii, phases, tile_codes, rng):
    """One strand of the plait as a solid tube (how games build plaits: alpha cards wrapped round a strand read as a
    lattice of ribbons up close). It bulges where the strand crosses over the front. UVs: u round the tube, v along it
    (0 → 1 over its length), into a braid tile the shader wraps round it. Returns (vertices, quads, uvs, colours)."""
    verts, quads, uvs, cols = [], [], [], []
    k = len(line)
    tone = rng.random()
    code = rng.choice(tile_codes)
    frames = transport_frames(line)
    for i, p in enumerate(line):
        t, u, v = frames[i]
        r = radii[i] * (0.9 + 0.18 * math.sin(2 * phases[i]))
        for j in range(RING + 1):  # the seam's column twice, for the UVs
            a = 2 * math.pi * j / RING
            verts.append(p + (u * math.cos(a) + v * math.sin(a)) * r)
            uvs.append((j / RING, i / (k - 1)))
            cols.append((tone, 1.0, 1.0, code))
    for i in range(k - 1):
        for j in range(RING):
            a = i * (RING + 1) + j
            quads.append((a, a + 1, a + RING + 2, a + RING + 1))
    return verts, quads, uvs, cols


def build_tubes(tubes, name, rig, skin, material):
    """The plait's solid tubes as one object, with the hair's COLOR_0 layout (tone, occlusion, root, tile)."""
    verts, faces, uvs, cols = [], [], [], []
    for tv, tq, tu, tc in tubes:
        base = len(verts)
        verts += tv
        faces += [tuple(base + x for x in q) for q in tq]
        uvs += tu
        cols += tc
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    col = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for i, c in enumerate(cols):
        col.data[i].color = c
    me.color_attributes.active_color = col
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    groups = {}
    for i, v in enumerate(verts):
        for bone, w in skin(Vector(v)).items():
            if w > 1e-4:
                g = groups.get(bone) or groups.setdefault(bone, obj.vertex_groups.new(name=bone))
                g.add([i], w, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    mat = bpy.data.materials.get(material) or bpy.data.materials.new(material)
    mat.use_nodes = True
    me.materials.append(mat)
    return obj
