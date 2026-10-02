"""Where each vertex sits on the skeleton: its strongest bone (contract name without _l/_r) and how far along it."""
from mathutils import Vector


def bone_coords(body, rig):
    names = {g.index: g.name for g in body.vertex_groups}
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    out = []
    for v in body.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        name = names.get(best.group, "root") if best else "root"
        head, tail = segs.get(name, (Vector(), Vector((0, 0, 1))))
        axis = tail - head
        t = max(0.0, min(1.0, (v.co - head).dot(axis) / max(axis.length_squared, 1e-9)))
        out.append((name[:-2] if name.endswith(("_l", "_r")) else name, t))
    return out


def landmarks(body, rig, height, found, coords):
    eyes = found["eyes"]
    head = rig.data.bones["head"]
    centre = head.head_local + (head.tail_local - head.head_local) * 0.45
    eye_z = sum(p.z for p in eyes.values() if p is not None) / max(1, sum(p is not None for p in eyes.values()))
    if eye_z == 0:
        eye_z = head.head_local.z + 0.075 * height / 1.7
    top = [v.co for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and v.co.z > eye_z]
    radius = sum((c - centre).length for c in top) / max(1, len(top))
    head_pts = [v.co.copy() for v, (b, _) in zip(body.data.vertices, coords) if b == "head"]  # copies: v.co is a view the later mesh edits invalidate
    ears = {}
    for side, s in (("l", 1), ("r", -1)):
        band = [p for p in head_pts if eye_z - 0.03 < p.z < eye_z + 0.015 and p.y > centre.y - 0.01 and p.x * s > 0]
        ears[side] = max(band, key=lambda p: p.x * s) if band else centre + Vector((0.07 * s, 0, eye_z - centre.z))
    nose_band = [p for p in head_pts if abs(p.x) < 0.01 and eye_z - 0.05 < p.z < eye_z - 0.005]
    nose = min(nose_band, key=lambda p: p.y) if nose_band else None
    mouth = found["mouth"]
    lip_band = [p for p in head_pts if mouth is not None and abs(p.x - mouth.x) < 0.008 and abs(p.z - mouth.z - 0.004) < 0.006]
    lip_front = min(lip_band, key=lambda p: p.y) if lip_band else None
    # The nipples: each side's front-most skin on the chest, 6-14 cm (at 1.78 m) off the midline, between 0.69 and
    # 0.76 of the height (the pecs' or the bust's apex) (Andrew: T-Bone had none).
    k = height / 1.78
    nipples = {}
    for side, s in (("l", 1), ("r", -1)):
        band = [v.co.copy() for v, (b, _) in zip(body.data.vertices, coords) if b in ("spine_02", "spine_03", "clavicle")
                and 0.06 * k < v.co.x * s < 0.14 * k and 0.69 * height < v.co.z < 0.76 * height]
        if band:  # a flat chest's front is shallow: the mean of the skin within 5 mm of its front-most point
            y0 = min(p.y for p in band)
            near = [p for p in band if p.y < y0 + 0.005]
            nipples[side] = sum(near, Vector()) / len(near)
        else:
            nipples[side] = None
    if nipples["l"] is not None and nipples["r"] is not None:  # the body's symmetric: so are they
        l, r = nipples["l"], nipples["r"]
        nipples = {"l": Vector(((l.x - r.x) / 2, (l.y + r.y) / 2, (l.z + r.z) / 2)), "r": Vector(((r.x - l.x) / 2, (l.y + r.y) / 2, (l.z + r.z) / 2))}
    return {"height": height, "head_centre": centre, "head_radius": radius, "eye_z": eye_z, "eyes": eyes, "mouth": mouth,
            "ears": ears, "nose": nose, "lip_front": lip_front, "upper_teeth": found.get("upper_teeth"),
            "lower_teeth": found.get("lower_teeth"), "eye_radius": found.get("eye_radius", 0.0115), "nipples": nipples}


def bone_weights(body, rig):
    """Every bone a vertex follows: (contract name without _l/_r, how far along it, weight), weights summing to 1."""
    names = {g.index: g.name for g in body.vertex_groups}
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    out = []
    for v in body.data.vertices:
        groups = [(names[g.group], g.weight) for g in v.groups if g.group in names and names[g.group] in segs and g.weight > 0]
        total = sum(w for _, w in groups) or 1.0
        row = []
        for name, w in groups:
            head, tail = segs[name]
            axis = tail - head
            t = max(0.0, min(1.0, (v.co - head).dot(axis) / max(axis.length_squared, 1e-9)))
            row.append((name[:-2] if name.endswith(("_l", "_r")) else name, t, w / total))
        out.append(row or [("root", 0.0, 1.0)])
    return out
