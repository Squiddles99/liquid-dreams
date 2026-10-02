"""Hair cards (spec §4.2) grown from the scalp in Python, and simple eyes. The strands are drawn by the game's shader."""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import braids
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
# The last long-hair build's numbers, for the manifest's checks (build.py), and its extra objects (the braids' elastics).
last_checks = {}
last_extras = []


def _frizz(base, centre, rng):
    """A short fine wisp off a lock's outer part: breaks the outline so the mop isn't a helmet."""
    d = ((base - centre).normalized() + _unit(rng) * 0.6).normalized()
    length = rng.uniform(0.015, 0.03)
    return [base, base + d * length * 0.5, base + d * length]


# The strand atlas's tile table (tools/surfer/hair_atlas.py; dune select spec §13.2): each card names one tile in
# COLOR_0.a as (tile + 0.5) / 16, and the shader maps the card's own UVs into it.
_ATLAS = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "public", "surfer", "hairAtlas.json"), encoding="utf-8"))
TILES_BY_ROLE = {}
for _i, _t in enumerate(_ATLAS["tiles"]):
    TILES_BY_ROLE.setdefault(_t["role"], []).append(_i)
# A card's role when its maker doesn't name one: most are a lock's core or its outer layer; a few fly away. Wet hair
# clumps, so its cards are mostly core.
DRY_ROLES = (("core", 0.55), ("outer", 0.35), ("flyaway", 0.10))
WET_ROLES = (("core", 0.8), ("outer", 0.2))


def _role(rng, width, weights):
    if width <= 0.007:  # the frizz and wisps
        return "flyaway"
    x, acc = rng.random(), 0.0
    for role, w in weights:
        acc += w
        if x < acc:
            return role
    return weights[-1][0]


def _face_weight(p, centre):
    """How much a point of the fall lies beside the face (0 … 1): in front of the ears, between the brows and the chin."""
    ahead = max(0.0, min(1.0, (centre.y + 0.01 - p.y) / 0.04))
    height = max(0.0, min(1.0, (p.z - (centre.z - 0.17)) / 0.04)) * max(0.0, min(1.0, (centre.z + 0.02 - p.z) / 0.03))
    return ahead * height


def _cards_object(cards, centre, rig, name, skin=None, seed=0, face_turn=False, roles=None, wet=False, outs=None):
    """`roles`: one atlas role per card (core, outer, flyaway, fringe, braid, tail), or None to choose by width and chance.
    `outs`: per card, None or the direction it faces at each point (the braids' staves face out from their strand)."""
    verts, faces, uvs, tone, rootd, tile = [], [], [], [], [], []
    trng = random.Random(seed + 101)  # the tiles' own generator, so the cards' tones are drawn as before
    front_sum, front_n = 0.0, 0
    forward = Vector((0, -1, 0))
    rng = random.Random(seed + 7)
    for ci, (pts, width) in enumerate(cards):
        k, base = len(pts) - 1, len(verts)
        t = rng.random()
        role = roles[ci] if roles is not None else _role(trng, width, WET_ROLES if wet else DRY_ROLES)
        code = (trng.choice(TILES_BY_ROLE[role]) + 0.5) / len(_ATLAS["tiles"])
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
            if outs is not None and outs[ci] is not None:
                out = outs[ci][i]
            # Beside the face, the fall's cards turn toward the front (up to ~50°): flat to the body they hang edge-on to
            # anyone looking at her, thinning to slivers (§13.1).
            wf = _face_weight(p, centre) * flat if face_turn and (outs is None or outs[ci] is None) else 0.0
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
            tile += [code, code]
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
        col.data[i].color = (t, 1.0, rootd[i], tile[i])  # R the card's tone, G occlusion (bake_ao), B 0 → 1 over the first 12 mm, A its atlas tile
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
    last_checks.clear()
    last_extras.clear()
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
    roles = None
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
    elif style["style"] == "braids":
        return _braids(body, rig, style, L, name, scalp, pick, rng, centre, eye_z, avoid)
    elif style["style"] == "ponytail":
        # Wet and slicked back to the tie: many fine cards (closeup spec §3), so the combed lines read as hair.
        tie = centre + Vector((0, L["head_radius"] * 0.95, -0.01))
        for _ in range(2600):
            root, n = pick()
            cards.append((_to_tie(root, n, centre, tie), rng.uniform(0.011, 0.015)))
        for _ in range(380):
            cards.append((_pony(tie, rng), rng.uniform(0.012, 0.017)))
        roles = ["core"] * 2600 + ["tail"] * 380
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
    return _cards_object(cards, centre, rig, f"{name}_hair" + ("Dry" if style.get("dry") else ""), seed=style["seed"], roles=roles, wet=not style.get("dry"))


def _to_braid(root, n, centre, eye_z, ear, path, frames, rng, tree, wet):
    """A scalp lock combed from its root down to its braid's start: over the scalp (above the ear first, if it roots in
    front of it), then down behind the ear into the braid, ending somewhere in the braid's cross-section."""
    # Into the braid's first few centimetres, spread through its cross-section, so the locks merge into it rather than
    # bunching at one point (a lump behind the ear otherwise).
    j = rng.randrange(0, 7)
    start, (t, nb, bb) = path[j], frames[j]
    r0 = (root - centre).length
    hug = (r0 + 0.002, r0 + (0.004 if wet else 0.008))
    s = 1.0 if ear.x > 0 else -1.0
    targets = []
    if root.y < ear.y + 0.01 and root.z > ear.z - 0.01:
        over = ear + Vector((s * 0.004, 0.014, 0.045))
        targets.append(centre + (over - centre).normalized() * hug[1])
    a = rng.uniform(0, 2 * math.pi)
    end = start + (nb * math.cos(a) * 0.6 + bb * math.sin(a)) * rng.uniform(0.0, 0.013)
    targets.append(end)
    pts = [root + n * 0.002]
    seg = 0.012
    for _ in range(80):
        p = pts[-1]
        goal = targets[0]
        if (goal - p).length < seg * 1.2:
            if len(targets) == 1:
                pts.append(goal)
                break
            targets.pop(0)
            continue
        d = (goal - p).normalized()
        on_head = (p - centre).length < hug[1] + 0.012 and p.z > ear.z - 0.03
        if on_head:
            out = (p - centre).normalized()
            d = (d - out * d.dot(out) * 0.85).normalized()
            q = _hug(p + d * seg, centre, hug[0], hug[1] + 0.01)
        else:
            q = p + d * seg
            loc, normal, _, _ = tree.find_nearest(q)
            if loc is not None and (q - loc).dot(normal) < 0.004:
                q = loc + normal * 0.004
        pts.append(q)
    return pts


def _braids(body, rig, style, L, name, scalp, pick, rng, centre, eye_z, avoid):
    """Shazza's low pigtail braids (dune select spec §13.2): see braids.py."""
    wet = not style.get("dry")
    tree = _body_tree(body, avoid)
    body_tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    part_x = style.get("partX", 0.006)
    neck_z = rig.data.bones["neck"].head_local.z
    trng = random.Random(style["seed"] + 101)
    cards, roles, outs = [], [], []
    paths, frames, ends, ties, tubes = {}, {}, {}, [], []
    drop, front = [], True
    for side in ("l", "r"):
        path, clav = braids.braid_path(side, L, rig, tree, wet)
        fr = braids._frames(path, tree)
        paths[side], frames[side] = path, fr
        strands, radii, phases = braids.plait(path, fr, wet)
        # Each plait strand a solid tube in a lock's straight core strands, running along it as a plait's hair does; the
        # soft cards once wrapped over them read as flat chips up close, so only the flyaways break the outline.
        core_codes = [(i + 0.5) / len(_ATLAS["tiles"]) for i in TILES_BY_ROLE["core"]]
        for line, ph in zip(strands, phases):
            tubes.append(braids.strand_tube(line, radii, ph, core_codes, rng))
        fl = braids.flyaways(strands, fr, rng, 10 if wet else 22)
        cards += fl
        outs += [None] * len(fl)
        roles += ["flyaway"] * len(fl)
        bm, tail, tail_outs, tie_at = braids.tie_and_tail(path, fr, rng, wet)
        ties.append(bm)
        cards += tail
        outs += tail_outs
        roles += ["tail"] * len(tail)
        drop.append(round(100 * (clav.z - path[-1].z), 1))  # clav: the clavicle's head (braids.braid_path)
        front = front and path[-1].y < clav.y
    n_braid = len(cards)
    turns = []
    # The scalp: locks to the braids; dry, the loose face-framing pieces from the front hairline to the jaw.
    for _ in range(2000 if wet else 2200):
        root, n = pick()
        side = "l" if root.x >= part_x else "r"
        if abs(root.x - part_x) < 0.008 and math.sin(root.y * 1531.0 + root.z * 977.0) > 0.35:
            side = "r" if side == "l" else "l"  # a few lie across the part, so it's soft (§13.1)
        # The loose face-framing pieces: the front of the hairline either side of the part, falling past the jaw.
        framing = not wet and root.y < centre.y - 0.04 and root.z < eye_z + 0.1 and abs(root.x - part_x) > 0.01
        if framing:
            clump = (root, rng.uniform(0, 2 * math.pi), 0.12, 0.009, rng.uniform(0.22, 0.3), rng.uniform(-TURN_SPREAD, TURN_SPREAD))
            cards.append((_wave(root, n, centre, eye_z, neck_z, part_x, rng, tree, clump, turns), rng.uniform(0.008, 0.012)))
        else:
            ear = L["ears"][side]
            cards.append((_to_braid(root, n, centre, eye_z, ear, paths[side], frames[side], rng, tree, wet), rng.uniform(0.009, 0.013)))
        outs.append(None)
        roles.append(_role(trng, cards[-1][1], WET_ROLES if wet else DRY_ROLES))
    # The checks: two braids, where their ends hang, in front of the shoulders, and none of the braid inside the body.
    # The plait's strands and staves stand out from the centreline toward the body too; where the neck curves in, a
    # few came inside the skin: pushed out to 1 mm clear.
    braid_lines = [pts for pts, _w in cards[:n_braid]] + [tv for tv, _q, _u, _c in tubes]
    for pts in braid_lines:
        for i, p in enumerate(pts):
            loc, normal, _, _ = body_tree.find_nearest(p)
            if loc is not None and (p - loc).dot(normal) < 0.001:
                pts[i] = loc + normal * 0.001
    inside = 0
    for pts in braid_lines:
        for p in pts:
            loc, normal, _, _ = body_tree.find_nearest(p)
            if loc is not None and (p - loc).dot(normal) < -0.001:
                inside += 1
    last_checks.clear()
    last_checks.update({"braids": 2, "braidEndDropCm": drop, "braidEndsInFront": front, "braidInside": inside})
    # The loose face-framing pieces keep §13.1's checks (dry): each turns into its fall at its own height, blended; and
    # the hairline comes down into a sideburn.
    if turns:
        mean = sum(turns) / len(turns)
        last_checks["hairTurnSpreadCm"] = round(100 * math.sqrt(sum((t - mean) ** 2 for t in turns) / len(turns)), 2)
        last_checks["hairTurnBlendCm"] = round(100 * TURN_BLEND, 1)
    ear = hairline.ear_params(L)
    last_checks.update(hairline.stats([v.co for v in scalp], centre, eye_z, ear[0], style.get("inset", 0.0)))
    skin = _long_skin(rig)
    obj = _cards_object(cards, centre, rig, f"{name}_hair" + ("" if wet else "Dry"), skin=skin, seed=style["seed"], roles=roles, wet=wet, outs=outs, face_turn=not wet)
    last_extras.clear()
    tag = "" if wet else "Dry"
    last_extras.append(braids.build_ties(ties, f"{name}_hair{tag}Ties", rig, skin))
    last_extras.append(braids.build_tubes(tubes, f"{name}_hair{tag}Braid", rig, skin, f"hair{tag}Braid"))
    return obj


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
