"""Shazza's low pigtail braids (dune select spec §13.2; Andrew's reference: reference/surfer/shazza-braids-ref.webp).

A centre part; the hair combed down from it, over the ears, to a braid's start behind and below each ear at about jaw
height; loose face-framing pieces from the front hairline to the jaw (dry only: wet, they're slicked back into the
braids); two three-strand plaits hanging forward over the front of the shoulders onto the upper chest; a small elastic
at each end and a loose tail below it.

Returns the plait's strands as solid tubes, cards for hair._cards_object (the flyaways and the tails, each with its atlas
role), the elastics as their own mesh (material `hairTie`), and numbers for the manifest's checks. Blender axes: +x the
character's left, -y the front, +z up.
"""
import math

import bmesh
import bpy
from mathutils import Vector

# The plait: each strand's lateral offset is a sine at 120° phases, its depth a sine at twice the frequency, so each
# strand crosses over the middle in turn. One full cycle every PERIOD of the braid's length.
# Chunky and loose, like Andrew's reference (about 4 cm across at the top), the lobes about 2.3 cm apart down each side.
# A strand never bends tighter than its own tube is thick: round 1's (5.5 cm period, 5.5 mm depth) curved at a 3.5 mm
# radius round a 9 mm tube, which folded through itself into the creases that read as blocks.
PERIOD = 0.07
# The strands press together: each swings sideways about its own thickness (twice that left gaps, and the lobes read as
# stacked blocks), so the lobes round into each other.
HALF_WIDTH = (0.012, 0.008)  # the braid's sideways swing at its start and its end
DEPTH = (0.004, 0.0028)
STRAND_R = (0.0085, 0.0058)  # each strand's radius, start to end
RING = 12  # each strand's solid tube: vertices round it
GATHER = 0.06  # the plait fills out from the nape over this much of its length
# The braid's points, this far apart along it: fine enough that a strand turns a few degrees a step round the weave
# (round 1's 3.3 mm steps turned it ~28°, a polygon you could see).
STEP = 0.0015
# A push off the body or the clothes lifts this much of the braid either side, smoothly (one point at a time kinked it
# where it rode over the collar and the pack's strap).
SPREAD = 0.05
DEEP = 0.03  # deeper than this behind a surface, the surface is a far one facing away, not one the braid is in
NUDGE = 0.003  # the most a point moves in one pass of the relax
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


def braid_path(side, L, rig, tree, wet, thin=None):
    """The braid's centreline, start (behind and below the ear) to end (on the upper chest), and its end's clavicle.
    `tree`: the skin and the clothes (solid); `thin`: the carried gear, if any (see _relax)."""
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
    path = _relax(path, tree, thin)
    return _smooth(_resample(path, STEP), 120), ch


def _radius_at(f):
    """The braid's reach from its centreline to its surface (its swing plus a strand), at fraction f along it."""
    return (HALF_WIDTH[0] + (HALF_WIDTH[1] - HALF_WIDTH[0]) * f) + (STRAND_R[0] + (STRAND_R[1] - STRAND_R[0]) * f)


def _relax(path, solid, thin):
    """The centreline lifted off the body and the clothes by the braid's reach, so it arches over a strap or a collar.
    Each pass pushes every point that's too close straight out of what it's near, a few millimetres at most, and spreads
    each push smoothly over SPREAD either side (a cosine bump; the largest at each point wins).

    `solid` (the skin, the tee, the cutoffs) is measured signed, out along its normals; more than DEEP behind a
    surface is a far face turned away, not a collision (the cutoffs' waistband read 37 cm "inside" from the chest).
    `thin` (the carried gear: the pack, its shoulder straps, the towel) is measured unsigned, and cleared by lifting out
    along the skin and clothes' normal beneath, as clothes layer: a strap is a ribbon whose edge faces point across the
    chest, and pushing off those slid the braid sideways along it, or squeezed it between the strap and the neck.
    Round 1 moved each point alone onto its nearest surface: that kinked the braid over the collar and the strap."""
    n = len(path)
    for _ in range(60):
        lens = _lengths(path)
        pushes = []
        for i, q in enumerate(path):
            want = _radius_at(i / (n - 1)) + CLEAR
            push = Vector()
            loc, normal, _, _ = solid.find_nearest(q)
            if loc is None:
                pushes.append(push)
                continue
            depth = (q - loc).dot(normal)
            if -DEEP < depth < want:
                push = normal * min(want - depth, NUDGE)
            if thin is not None:
                # Out over the gear the way clothes layer: along the body's normal, never sideways off a strap's edge.
                tl, _, _, _ = thin.find_nearest(q)
                if tl is not None and (q - tl).length < want and want - (q - tl).length > push.length:
                    push = normal * min(want - (q - tl).length, NUDGE)
            pushes.append(push)
        if max(d.length for d in pushes) < 1e-4:
            break
        lift = []
        for i in range(n):
            best, size = Vector(), 0.0
            for j in range(n):
                x = abs(lens[i] - lens[j]) / SPREAD
                if x < 1.0 and pushes[j].length > 0:
                    w = math.cos(0.5 * math.pi * x) ** 2
                    if pushes[j].length * w > size:
                        best, size = pushes[j] * w, pushes[j].length * w
            lift.append(best)
        path = [p + d for p, d in zip(path, lift)]
    return path


def _resample(path, step):
    """The path through the same points, every `step` along it (a Catmull–Rom through them, measured by length)."""
    fine = _catmull(path, len(path) * 8)
    lens = _lengths(fine)
    out, j = [], 0
    for k in range(int(lens[-1] / step) + 1):
        s = k * step
        while j < len(fine) - 2 and lens[j + 1] < s:
            j += 1
        u = (s - lens[j]) / max(lens[j + 1] - lens[j], 1e-9)
        out.append(fine[j].lerp(fine[j + 1], min(1.0, u)))
    return out


def _smooth(path, passes):
    """Laplacian passes with both ends held: irons out what's left of a lift's shoulders."""
    for _ in range(passes):
        path = [path[0]] + [(path[i - 1] + path[i] * 2 + path[i + 1]) / 4 for i in range(1, len(path) - 1)] + [path[-1]]
    return path


def _frames(path, axis):
    """Per point: the tangent, the outward normal (away from the body) and the binormal across the braid. Twist-free
    frames carried down the braid, turned to face out from the body's axis (the vertical through `axis`) by an angle
    smoothed along it. Round 1 took each point's normal from whichever surface was nearest, which flipped 105–165°
    between the skin, the tee and the pack's strap: the plait's weave swung with it, and kinked."""
    carried = transport_frames(path)
    angles, weights, prev = [], [], None
    for p, (t, u, v) in zip(path, carried):
        out = Vector((p.x - axis.x, p.y - axis.y, 0.0))
        out = out - t * out.dot(t)
        a = math.atan2(out.dot(v), out.dot(u))
        if prev is not None:
            a = prev + (a - prev + math.pi) % (2 * math.pi) - math.pi
        angles.append(a)
        weights.append(max(out.length, 1e-4))  # where the braid runs straight out from the axis, the facing says little
        prev = a
    n = len(angles)
    for _ in range(400):
        angles = [(weights[0] * 2 * angles[0] + weights[1] * angles[1]) / (weights[0] * 2 + weights[1])] + [
            (weights[i - 1] * angles[i - 1] + weights[i] * 2 * angles[i] + weights[i + 1] * angles[i + 1])
            / (weights[i - 1] + weights[i] * 2 + weights[i + 1]) for i in range(1, n - 1)] + [
            (weights[-2] * angles[-2] + weights[-1] * 2 * angles[-1]) / (weights[-2] + weights[-1] * 2)]
    frames = []
    for (t, u, v), a in zip(carried, angles):
        nrm = (u * math.cos(a) + v * math.sin(a)).normalized()
        frames.append((t, nrm, t.cross(nrm).normalized()))
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
    """The three strands' centrelines, and each point's strand radius: gathered in at the nape, full down its length,
    drawn in to the cinched bundle at the elastic."""
    base = 0.85 if wet else 1.0
    strands = [[], [], []]
    phases = [[], [], []]
    radii = []
    lens = _lengths(path)
    total = lens[-1]
    for i, (p, (t, n, b)) in enumerate(zip(path, frames)):
        f = i / (len(path) - 1)
        c = _cinch(lens[i], total)
        # Gathered at the nape: the plait starts at half and fills out over its first GATHER, as a real one does where
        # the hair's drawn together (and where it wraps round the neck, it's thin enough not to fold on the bend).
        x = min(1.0, lens[i] / GATHER)
        scale = base * (0.5 + 0.5 * x * x * (3 - 2 * x))
        w = scale * (HALF_WIDTH[0] + (HALF_WIDTH[1] - HALF_WIDTH[0]) * f) * c + (1 - c) * BUNDLE_R * 0.35
        d = scale * (DEPTH[0] + (DEPTH[1] - DEPTH[0]) * f) * c
        th = 2 * math.pi * lens[i] / PERIOD
        for k in range(3):
            ph = th + 2 * math.pi * k / 3
            strands[k].append(p + b * (w * math.sin(ph)) + n * (d * math.sin(2 * ph)))
            phases[k].append(ph)
        r = scale * (STRAND_R[0] + (STRAND_R[1] - STRAND_R[0]) * f)
        radii.append(r * c + (1 - c) * BUNDLE_R * 0.7)
    return strands, radii, phases


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
    (0 → 1 over its length), into a braid tile the shader wraps round it. Each vertex's normal is the tube's own, round it
    (smooth: flat faces showed its 12 facets). Returns (vertices, quads, uvs, colours, normals)."""
    verts, quads, uvs, cols, nors = [], [], [], [], []
    k = len(line)
    tone = rng.random()
    code = rng.choice(tile_codes)
    frames = transport_frames(line)
    for i, p in enumerate(line):
        t, u, v = frames[i]
        r = radii[i] * (0.9 + 0.18 * math.sin(2 * phases[i]))
        for j in range(RING + 1):  # the seam's column twice, for the UVs
            a = 2 * math.pi * j / RING
            radial = u * math.cos(a) + v * math.sin(a)
            verts.append(p + radial * r)
            nors.append(radial)
            uvs.append((j / RING, i / (k - 1)))
            cols.append((tone, 1.0, 1.0, code))
    for i in range(k - 1):
        for j in range(RING):
            a = i * (RING + 1) + j
            quads.append((a, a + 1, a + RING + 2, a + RING + 1))
    return verts, quads, uvs, cols, nors


def build_tubes(tubes, name, rig, skin, material):
    """The plait's solid tubes as one object, with the hair's COLOR_0 layout (tone, occlusion, root, tile)."""
    verts, faces, uvs, cols, nors = [], [], [], [], []
    for tv, tq, tu, tc, tn in tubes:
        base = len(verts)
        verts += tv
        faces += [tuple(base + x for x in q) for q in tq]
        uvs += tu
        cols += tc
        nors += tn
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.shade_smooth()
    me.normals_split_custom_set_from_vertices([tuple(n) for n in nors])
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
def max_turn_deg(line):
    """The sharpest turn between neighbouring segments of a polyline (degrees): a kink or a faceted curve shows here."""
    worst = 0.0
    for i in range(1, len(line) - 1):
        a, b = line[i] - line[i - 1], line[i + 1] - line[i]
        if a.length > 1e-9 and b.length > 1e-9:
            worst = max(worst, math.degrees(a.angle(b)))
    return worst


def max_frame_twist_deg(frames):
    """The largest swing of the braid's sideways axis between neighbouring points (degrees): the plait's strands
    swing with it, so a jump kinks the braid."""
    return max(math.degrees(frames[i][2].angle(frames[i - 1][2])) for i in range(1, len(frames)))


def min_bend_ratio(line, radii):
    """The tightest a strand bends, as its radius of curvature over its tube's radius there: under 1, the tube's inside
    folds through itself (a crease)."""
    worst = 1e9
    for i in range(1, len(line) - 1):
        a, b = line[i] - line[i - 1], line[i + 1] - line[i]
        if a.length < 1e-9 or b.length < 1e-9:
            continue
        kappa = a.angle(b) / (0.5 * (a.length + b.length))
        if kappa > 1e-9:
            worst = min(worst, 1.0 / (kappa * radii[i] * 1.08))  # 1.08: the tube's bulge where it crosses the front
    return worst
