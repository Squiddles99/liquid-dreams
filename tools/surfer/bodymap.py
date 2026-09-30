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


def landmarks(body, rig, height, eyes, coords):
    head = rig.data.bones["head"]
    centre = head.head_local + (head.tail_local - head.head_local) * 0.45
    eye_z = sum(p.z for p in eyes.values() if p is not None) / max(1, sum(p is not None for p in eyes.values()))
    if eye_z == 0:
        eye_z = head.head_local.z + 0.075 * height / 1.7
    top = [v.co for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and v.co.z > eye_z]
    radius = sum((c - centre).length for c in top) / max(1, len(top))
    return {"height": height, "head_centre": centre, "head_radius": radius, "eye_z": eye_z, "eyes": eyes}


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
