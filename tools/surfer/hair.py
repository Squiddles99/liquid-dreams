"""Hair cards (spec §4.2) grown from the scalp in Python, and simple eyes. The strands are drawn by the game's shader."""
import math
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import hairline

DOWN = Vector((0, 0, -1))


def _unit(rng):
    return Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()


def _hug(p, centre, r_min, r_max):
    """Keep a strand point between r_min and r_max from the head's centre: on the scalp, never sticking out."""
    q = p - centre
    return centre + q.normalized() * min(max(q.length, r_min), r_max)


def _is_scalp(co, centre, eye_z, inset=0.0, ear=(95.0, 0.023)):
    # The hairline (hairline.py, shared with the painted scalp): well above the brow at the forehead, down the temples
    # into a sideburn, over the ears and down to the nape. `inset`: roots that far inside it, so the cards' root ends sit
    # on painted hair and the soft painted hairline is the one that shows (closeup spec §3).
    return co.z > hairline.line_z(co, centre, eye_z, *ear) + inset


def _short(root, n, centre, crown, rng):
    """Short, wet and messy: pushed back off the face (the front and top combed back over the crown, the sides and back
    down), lying on the scalp in loose clumps."""
    length = rng.uniform(0.04, 0.08)
    noise = _unit(rng)
    r_min = (root - centre).length + 0.003
    front = root.y < crown.y
    pts = [root + n * 0.002]
    for _ in range(5):
        p = pts[-1]
        out = (p - centre).normalized()
        comb = Vector((0, 1, 0.15)) if front else p - crown
        comb = (comb - out * comb.dot(out)).normalized() if comb.length > 1e-6 else noise
        d = comb * 0.6 + DOWN * (0.1 if front else 0.3) + noise * 0.25
        d = (d - out * d.dot(out) * 0.8).normalized()
        pts.append(_hug(p + d * (length / 5), centre, r_min, r_min + 0.012))
    return pts


def _to_tie(root, n, centre, tie):
    # Wet and slicked: within 1.5–3 mm of the scalp (farther stood the cards off it in a ledge at the hairline).
    r_min, pts = (root - centre).length + 0.0015, [root + n * 0.001]
    for _ in range(12):
        to = tie - pts[-1]
        if to.length < 0.012:
            break
        d = (to.normalized() * 0.8 + n * 0.2).normalized()
        pts.append(_hug(pts[-1] + d * min(0.03, to.length), centre, r_min, r_min + 0.0035))
    if len(pts) < 3:
        pts.append(tie.copy())
    return pts


def _pony(tie, rng):
    d = (Vector((0, 0.35, -1)) + _unit(rng) * 0.1).normalized()
    length, pts = rng.uniform(0.22, 0.32), [tie + _unit(rng) * 0.01]
    for _ in range(6):
        d = (d + Vector((0, 0, -0.15))).normalized()
        pts.append(pts[-1] + d * (length / 6))
    return pts


def _curl(root, n, centre, eye_z, rng, squash=1.0, down=0.25):
    """One springy lock: a loose spiral out from the scalp (6–9 cm), shorter over the forehead so it stops above the
    glasses. 1.3–3 turns sampled 16 times (too few points per turn drew zig-zag shards, not curls); the radius opens
    from the root, and nothing dips inside the scalp."""
    fringe = root.y < centre.y - 0.02 and root.z < eye_z + 0.11
    length = squash * (rng.uniform(0.035, 0.05) if fringe else rng.uniform(0.06, 0.09))
    radius, pitch, phase = squash * rng.uniform(0.008, 0.013), rng.uniform(0.03, 0.045), rng.uniform(0, 2 * math.pi)
    noise = _unit(rng)
    d = (n * (0.35 if fringe else 1.0 - down) + DOWN * (0.65 if fringe else down) + noise * 0.25).normalized()
    e1 = d.orthogonal().normalized()
    e2 = d.cross(e1)
    r_min = (root - centre).length + 0.002
    pts = []
    for i in range(16):
        s = length * i / 15
        th = phase + 2 * math.pi * s / pitch
        p = root + n * 0.002 + d * s + (e1 * math.cos(th) + e2 * math.sin(th)) * radius * min(1.0, i / 3)
        q = p - centre
        if q.length < r_min:
            p = centre + q.normalized() * r_min
        if p.y < centre.y - 0.03 and p.z < eye_z + 0.02:  # in front of the face: stay above the glasses
            p.z = eye_z + 0.02
        pts.append(p)
    return pts


# Long dry hair (dune select spec §13.1): each lock (clump) turns from the scalp into the fall at its own height, within
# ±TURN_SPREAD of the old single line, and the turn is blended over TURN_BLEND (m) of the fall. One shared height had
# creased every lock along one horizontal line at the brows.
TURN_SPREAD = 0.03
TURN_BLEND = 0.05
# The last long-hair build's numbers, for the manifest's checks (build.py).
last_checks = {}


def _frizz(base, centre, rng):
    """A short fine wisp off a lock's outer part: breaks the outline so the mop isn't a helmet."""
    d = ((base - centre).normalized() + _unit(rng) * 0.6).normalized()
    length = rng.uniform(0.015, 0.03)
    return [base, base + d * length * 0.5, base + d * length]


def _face_weight(p, centre):
    """How much a point of the fall lies beside the face (0 … 1): in front of the ears, between the brows and the chin."""
    ahead = max(0.0, min(1.0, (centre.y + 0.01 - p.y) / 0.04))
    height = max(0.0, min(1.0, (p.z - (centre.z - 0.17)) / 0.04)) * max(0.0, min(1.0, (centre.z + 0.02 - p.z) / 0.03))
    return ahead * height


def _cards_object(cards, centre, rig, name, skin=None, seed=0, face_turn=False):
    verts, faces, uvs, tone, rootd = [], [], [], [], []
    front_sum, front_n = 0.0, 0
    forward = Vector((0, -1, 0))
    rng = random.Random(seed + 7)
    for pts, width in cards:
        k, base = len(pts) - 1, len(verts)
        t = rng.random()
        along = 0.0
        for i, p in enumerate(pts):
            if i > 0:
                along += (p - pts[i - 1]).length
            tangent = (pts[min(i + 1, k)] - pts[max(i - 1, 0)]).normalized()
            # Out from the head's centre on the head; below it (long hair), out from the fall, so the cards lie flat
            # against the body's outline instead of twisting edge-on. Blended over 8 cm around the old switch (5 cm
            # under the head's centre), so no line is shared by every card (§13.1).
            out = p - centre
            flat = max(0.0, min(1.0, ((centre.z - 0.01) - p.z) / 0.08))
            out = Vector((out.x, out.y, out.z * (1 - flat)))
            out = out.normalized() if out.length > 1e-6 else Vector((0, -1, 0))
            # Beside the face, the fall's cards turn toward the front (up to ~50°): flat to the body they hang edge-on to
            # anyone looking at her, thinning to slivers (§13.1).
            wf = _face_weight(p, centre) * flat if face_turn else 0.0
            if wf > 0:
                out = (out + forward * 1.2 * wf).normalized()
            side = tangent.cross(out)
            side = side.normalized() if side.length > 1e-6 else tangent.orthogonal().normalized()
            if face_turn and wf > 0.5:
                front_sum += abs(tangent.cross(side).normalized().dot(forward))
                front_n += 1
            half = width * 0.5 * (1 - 0.5 * i / k)
            verts += [p - side * half, p + side * half]
            uvs += [(0.0, i / k), (1.0, i / k)]
            tone += [t, t]
            rootd += [min(1.0, along / 0.012)] * 2
        for i in range(k):
            a = base + 2 * i
            faces.append((a, a + 2, a + 3, a + 1))
    if face_turn:
        last_checks["hairFaceFrontness"] = round(front_sum / max(1, front_n), 3)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    # COLOR_0.r: one random per card, so the shader can vary each lock's shade (a smooth helmet otherwise).
    col = me.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for i, t in enumerate(tone):
        col.data[i].color = (t, 1.0, rootd[i], 1.0)  # R the card's tone, G occlusion (bake_ao), B 0 → 1 over the first 12 mm
    me.color_attributes.active_color = col
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if skin is None:
        obj.vertex_groups.new(name="head").add(range(len(verts)), 1.0, "REPLACE")
    else:
        groups = {}
        for i, v in enumerate(verts):
            for bone, w in skin(Vector(v)).items():
                if w > 1e-4:
                    g = groups.get(bone) or groups.setdefault(bone, obj.vertex_groups.new(name=bone))
                    g.add([i], w, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj


def build(body, rig, style, L, coords, name, avoid=()):
    rng = random.Random(style["seed"])
    centre, eye_z = L["head_centre"], L["eye_z"]
    inset = style.get("inset", 0.0)
    ear = hairline.ear_params(L)
    scalp = [v for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and _is_scalp(v.co, centre, eye_z, inset, ear)]
    if len(scalp) < 50:
        raise SystemExit(f"only {len(scalp)} scalp vertices found; check the head landmarks")

    def pick():
        v = rng.choice(scalp)
        return v.co + _unit(rng) * 0.003, v.normal.copy()

    cards = []
    if style["style"] == "short":
        crown = centre + Vector((0, L["head_radius"] * 0.35, L["head_radius"] * 0.9))
        for _ in range(1600):
            root, n = pick()
            cards.append((_short(root, n, centre, crown, rng), rng.uniform(0.012, 0.016)))
    elif style["style"] == "tousled":
        # Dry, short and messy (closeup spec §3): lifted off the scalp, a fringe falling forward to just above the brows.
        crown = centre + Vector((0, L["head_radius"] * 0.35, L["head_radius"] * 0.9))
        for _ in range(1700):
            root, n = pick()
            cards.append((_tousled(root, n, centre, crown, eye_z, rng), rng.uniform(0.011, 0.015)))
    elif style["style"] == "waves":
        # Dry, long and loose (closeup spec §3): parted near the middle, over the scalp, then falling past the
        # shoulders in loose beach waves, draped over the body rather than through it.
        tree = _body_tree(body, avoid)
        neck_z = rig.data.bones["neck"].head_local.z
        part_x = style.get("partX", 0.006)
        # Locks: every card belongs to the nearest of ~70 clump centres on the scalp and shares its wave, so the waves
        # read as locks rather than a frizz of cards each on its own phase.
        # Each clump's turn height comes from its own generator, so the clumps' waves and roots are drawn as before.
        trng = random.Random(style["seed"] + 23)
        clumps = []
        for _ in range(70):
            c, _n = pick()
            clumps.append((c, rng.uniform(0, 2 * math.pi), rng.uniform(0.1, 0.14), rng.uniform(0.01, 0.017), rng.uniform(0.36, 0.46), trng.uniform(-TURN_SPREAD, TURN_SPREAD)))
        turns = []
        # 2800 cards: the natural hairline (sideburns, lower temples) gives more scalp than the old stepped one, and
        # 2400 over it thinned the crown until it showed gaps (the crown self-test, 93.8% → 97% wanted).
        for _ in range(2800):
            root, n = pick()
            clump = min(clumps, key=lambda cl: (cl[0] - root).length_squared)
            cards.append((_wave(root, n, centre, eye_z, neck_z, part_x, rng, tree, clump, turns), rng.uniform(0.009, 0.013)))
        mean = sum(turns) / max(1, len(turns))
        last_checks.clear()
        last_checks["hairTurnSpreadCm"] = round(100 * math.sqrt(sum((t - mean) ** 2 for t in turns) / max(1, len(turns))), 2)
        last_checks["hairTurnBlendCm"] = round(100 * TURN_BLEND, 1)
        last_checks.update(hairline.stats([v.co for v in scalp], centre, eye_z, ear[0], inset))
        return _cards_object(cards, centre, rig, f"{name}_hairDry", skin=_long_skin(rig), seed=style["seed"], face_turn=True)
    elif style["style"] == "ponytail":
        # Wet and slicked back to the tie: many fine cards (closeup spec §3), so the combed lines read as hair.
        tie = centre + Vector((0, L["head_radius"] * 0.95, -0.01))
        for _ in range(2600):
            root, n = pick()
            cards.append((_to_tie(root, n, centre, tie), rng.uniform(0.011, 0.015)))
        for _ in range(380):
            cards.append((_pony(tie, rng), rng.uniform(0.012, 0.017)))
    elif style["style"] == "curly":
        locks = []
        for _ in range(450):
            root, n = pick()
            locks.append(_curl(root, n, centre, eye_z, rng))
            cards.append((locks[-1], rng.uniform(0.011, 0.014)))
        for _ in range(300):
            lock = rng.choice(locks)
            cards.append((_frizz(lock[rng.randint(8, 15)], centre, rng), 0.006))
    elif style["style"] in ("capped", "bucket"):
        # Pressed under a hat (walking spec §3): roots from just under the band down to the hairline (none at the front
        # under a cap's peak), growing down out from under the band; nothing above the band stands off the scalp
        # further than the hat lets it.
        band, normal = style["below"]
        cap = style["style"] == "capped"
        pool = [v for v in scalp if (v.co - band).dot(normal) < 0.015 and (not cap or v.co.y > centre.y - 0.03)]
        if len(pool) < 50:
            raise SystemExit(f"only {len(pool)} scalp vertices under the hat's band")

        def pick_under():
            v = rng.choice(pool)
            return v.co + _unit(rng) * 0.003, v.normal.copy()
        if cap:
            for _ in range(1300):
                root, n = pick_under()
                cards.append((_under_cap(root, n, centre, rng), rng.uniform(0.011, 0.015)))
        else:
            locks = []
            for _ in range(420):
                root, n = pick_under()
                locks.append(_curl(root, n, centre, eye_z, rng, squash=0.7, down=0.55))
                cards.append((locks[-1], rng.uniform(0.011, 0.014)))
            for _ in range(220):
                lock = rng.choice(locks)
                cards.append((_frizz(lock[rng.randint(8, 15)], centre, rng), 0.006))
        # Inside the hat: a strand point above the band is pulled in under the hat's inner surface (along the ray from
        # the head's centre), or down under the band where that ray misses the hat (at its very edge).
        hat = BVHTree.FromObject(style["hat"], bpy.context.evaluated_depsgraph_get())
        for pts, _w in cards:
            for i, p in enumerate(pts):
                h = (p - band).dot(normal)
                if h <= 0:
                    continue
                q = p - centre
                hit, _, _, dist = hat.ray_cast(centre, q.normalized(), 1.0)
                if hit is None:
                    pts[i] = p - normal * (h + 0.001)
                elif q.length > dist - 0.003:
                    pts[i] = centre + q.normalized() * (dist - 0.003)
        # Under the brim (or the cap's peak): a point with the hat below it and nothing above it would show through the
        # brim's top: it goes under it, clear by more than half a card's width.
        up_, down_ = Vector((0, 0, 1)), Vector((0, 0, -1))
        for pts, _w in cards:
            for i, p in enumerate(pts):
                if hat.ray_cast(p, up_, 0.25)[0] is not None:
                    continue
                hit, _, _, _ = hat.ray_cast(p, down_, 0.08)
                if hit is not None:
                    pts[i] = hit - Vector((0, 0, 0.012))
        obj = _cards_object(cards, centre, rig, f"{name}_hairHat", seed=style["seed"])
        for v in obj.data.vertices:  # and the cards' edges, which their width carries past the strand
            if hat.ray_cast(v.co, up_, 0.25)[0] is None:
                hit, _, _, _ = hat.ray_cast(v.co, down_, 0.08)
                if hit is not None:
                    v.co = hit - Vector((0, 0, 0.006))
        return obj
    else:
        raise SystemExit(f"unknown hair style {style['style']}")
    return _cards_object(cards, centre, rig, f"{name}_hair" + ("Dry" if style.get("dry") else ""), seed=style["seed"])


def _under_cap(root, n, centre, rng):
    """Short hair under a cap (walking spec §3): out from under the band, down and a little back, close to the head."""
    length = rng.uniform(0.03, 0.06)
    noise = _unit(rng)
    r0 = (root - centre).length
    pts = [root + n * 0.002]
    for _ in range(5):
        p = pts[-1]
        out = (p - centre).normalized()
        d = DOWN * 0.8 + Vector((0, 0.35, 0)) + noise * 0.35
        d = (d - out * d.dot(out) * 0.7).normalized()
        pts.append(_hug(p + d * (length / 5), centre, r0 + 0.002, r0 + 0.012))
    return pts


def _tousled(root, n, centre, crown, eye_z, rng):
    """Short and dry: combed loosely away from the crown, standing 1-2.5 cm off the scalp, the front falling forward."""
    front = root.y < centre.y - 0.02
    length = rng.uniform(0.045, 0.085)
    noise = _unit(rng)
    lift = rng.uniform(0.008, 0.022)
    r0 = (root - centre).length
    pts = [root + n * 0.002]
    for _ in range(6):
        p = pts[-1]
        out = (p - centre).normalized()
        comb = p - crown
        comb = (comb - out * comb.dot(out)).normalized() if comb.length > 1e-6 else noise
        d = (comb * 0.55 + DOWN * (0.35 if front else 0.2) + noise * 0.45 + out * 0.25).normalized()
        q = _hug(p + d * (length / 6), centre, r0 + 0.002, r0 + lift)
        if q.y < centre.y - 0.03 and q.z < eye_z + 0.03:  # the fringe stops above the brows
            q.z = eye_z + 0.03
        pts.append(q)
    return pts


def _body_tree(body, avoid=()):
    """What long hair falls outside of: the skin, and `avoid` (the walking clothes) when given."""
    if not avoid:
        return BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    verts, polys = [], []
    for o in (body, *avoid):
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[i + base for i in p.vertices] for p in o.data.polygons if o is not body or p.material_index == 0]
    return BVHTree.FromPolygons(verts, polys)


def _wave(root, n, centre, eye_z, neck_z, part_x, rng, tree, clump, turns=None):
    """One long dry lock: over the scalp away from the part, then down past the shoulders in a loose helix (a beach
    wave) shared with its clump, pushed out of the body wherever it would pass inside (1 cm clear). Sampled finely in
    the fall (7+ points a wave; fewer drew zig-zags)."""
    _, phase0, wl0, amp0, len0, turn0 = clump
    # This lock's turn into the fall: its clump's height, a few millimetres apart card to card (§13.1).
    turn_z = eye_z - 0.02 + turn0 + 0.004 * math.sin(root.x * 913.0 + root.y * 517.0)
    last_d = None
    length = len0 + rng.uniform(-0.02, 0.02)
    seg = 0.026
    side = 1.0 if root.x >= part_x else -1.0
    # At the part, about a third of the locks lie across it (seeded by where they root), so the part is soft and never a
    # see-through seam between two combed-apart halves (the crown self-test with the body hidden).
    if abs(root.x - part_x) < 0.008 and math.sin(root.y * 1531.0 + root.z * 977.0) > 0.35:
        side = -side
    # The front of the hairline frames the face: those locks sweep down beside the cheeks, not back behind the ears.
    front = root.y < centre.y - 0.035
    r0 = (root - centre).length
    pts = [root + n * 0.002]
    phase, wl = phase0 + rng.uniform(-0.3, 0.3), wl0 * rng.uniform(0.95, 1.05)
    amp = amp0 * rng.uniform(0.85, 1.1)
    jitter = _unit(rng) * 0.2
    s = 0.0
    falling_from = None
    prev_off = Vector()
    while s < length:
        p = pts[-1]
        out = (p - centre).normalized()
        # A lock still in front of the face keeps sweeping 1.5 cm further before it falls, at its own height (a shared
        # floor here had put one line back across the temples).
        in_front = p.y < centre.y - 0.03 and abs(p.x) < 0.078
        if falling_from is None and p.z > (turn_z - 0.015 if in_front else turn_z):
            # Over the head: away from the part and down, a little back; hugging the scalp with some volume.
            comb = (Vector((side * 0.85, -0.1, -0.85)) if front else Vector((side * 0.8, 0.45, -0.7))) + jitter
            # In front of the face, sweep out and down like a curtain, until clear of it (a lock across her cheek
            # otherwise). Level, the swept locks drew a horizontal band across the temple (§13.1).
            if p.y < centre.y - 0.03 and abs(p.x) < 0.078 and p.z < eye_z + 0.045:
                comb = Vector((side, 0.25, -0.45))
            d = (comb - out * comb.dot(out)).normalized()
            last_d = d
            q = _hug(p + d * seg, centre, r0 + 0.002, r0 + 0.008)
        else:
            if falling_from is None:
                falling_from = s
                if turns is not None:
                    turns.append(p.z)
            f = s - falling_from
            flat = Vector((p.x - centre.x, p.y - centre.y, 0))
            flat = flat.normalized() if flat.length > 1e-6 else Vector((side, 0, 0))
            d = (DOWN + flat * 0.12).normalized()
            # The turn from the scalp's direction into the fall, blended over TURN_BLEND, not in one step (§13.1).
            if last_d is not None and f < TURN_BLEND:
                t = f / TURN_BLEND
                d = (last_d * (1 - t) + d * t).normalized()
            # The wave: a loose S along the body's outline (a beach wave, not a ringlet), from nothing at the ears to
            # full by the shoulders.
            a = amp * min(1.0, f / 0.14)
            tang = flat.cross(DOWN).normalized()
            th = phase + 2 * math.pi * f / wl
            off = (tang * math.cos(th) + flat * math.sin(th) * 0.25) * a
            q = p + d * (seg * 0.55) + off - prev_off
            prev_off = off
        # Keep out of the body (the face, neck, shoulders and back): 1 cm clear of the skin.
        loc, normal, _, _ = tree.find_nearest(q)
        if loc is not None and (q - loc).dot(normal) < 0.01:
            q = loc + normal * 0.01
        pts.append(q)
        s += seg if falling_from is None else seg * 0.55
    return pts


def _long_skin(rig):
    """Long hair follows the head at the roots, then the neck and the upper spine below the jaw (closeup spec §4.1)."""
    neck = rig.data.bones["neck"].head_local.z
    head = rig.data.bones["head"].head_local.z

    def weights(p):
        h = max(0.0, min(1.0, (p.z - neck) / max(head - neck, 1e-3)))
        below = max(0.0, min(1.0, (neck - p.z) / 0.12))
        return {"head": h, "neck": (1 - h) * (1 - below), "spine_03": (1 - h) * below}
    return weights


def bake_ao(obj, body, centre, reach=0.045, rays=6, seed=5):
    """Ambient occlusion per card vertex into COLOR_0.g (closeup spec §4.2): rays out over the hemisphere around the
    vertex's outward direction, against the hair itself and the body; 1 open … 0 buried. Under-layers and the hair
    against the neck darken, so the cards read as a volume with depth, not planks."""
    rng = random.Random(seed)
    me, bme = obj.data, body.data
    verts = [v.co.copy() for v in me.vertices] + [v.co.copy() for v in bme.vertices]
    n0 = len(me.vertices)
    polys = [list(p.vertices) for p in me.polygons] + [[i + n0 for i in p.vertices] for p in bme.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    col = me.color_attributes["Color"]
    dirs = [_unit(rng) for _ in range(rays)]
    cache = {}
    for i, v in enumerate(me.vertices):
        key = (round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3))
        if key not in cache:
            out = v.co - centre
            if v.co.z < centre.z - 0.05:
                out = Vector((out.x, out.y, 0.0))
            out = out.normalized() if out.length > 1e-6 else Vector((0, -1, 0))
            hits = 0
            for d in dirs:
                d = d if d.dot(out) > 0 else -d
                d = (d + out).normalized()
                hit, _, _, _ = tree.ray_cast(v.co + d * 0.0015, d, reach)
                hits += hit is not None
            cache[key] = 1.0 - hits / len(dirs)
        c = col.data[i].color
        col.data[i].color = (c[0], cache[key], c[2], c[3])


def eyes(rig, L, name):
    bm = bmesh.new()
    for side, fallback in (("l", 1), ("r", -1)):
        c = L["eyes"].get(side) or (L["head_centre"] + Vector((0.032 * fallback, -0.085, L["eye_z"] - L["head_centre"].z)))
        # Fitted to MPFB's eye helper (closeup spec §4.1): the old 11.5 mm spheres sat small and sunken in the socket.
        geom = bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=24, radius=L.get("eye_radius", 0.0115))
        bmesh.ops.translate(bm, verts=geom["verts"], vec=c)
    me = bpy.data.meshes.new(f"{name}_eyes")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_eyes", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj
