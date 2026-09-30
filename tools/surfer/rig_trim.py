"""Bake the MPFB human into one plain skinned mesh on the 23-bone contract skeleton (spec §3.3)."""
import bmesh
import bpy
from mathutils import Vector

# MPFB game-engine bone → contract bone (src/surfer/rig.ts). Checked against tools/surfer/api-probe.txt.
BONE_MAP = {
    "Root": "root", "pelvis": "pelvis", "spine_01": "spine_01", "spine_02": "spine_02", "spine_03": "spine_03",
    "neck_01": "neck", "head": "head",
    "clavicle_l": "clavicle_l", "upperarm_l": "upperarm_l", "lowerarm_l": "forearm_l", "hand_l": "hand_l",
    "clavicle_r": "clavicle_r", "upperarm_r": "upperarm_r", "lowerarm_r": "forearm_r", "hand_r": "hand_r",
    "thigh_l": "thigh_l", "calf_l": "shin_l", "foot_l": "foot_l", "ball_l": "toe_l",
    "thigh_r": "thigh_r", "calf_r": "shin_r", "foot_r": "foot_r", "ball_r": "toe_r",
}
# The contract's parents (src/surfer/rig.ts PARENT), by contract name.
PARENT = {
    "pelvis": "root", "spine_01": "pelvis", "spine_02": "spine_01", "spine_03": "spine_02", "neck": "spine_03", "head": "neck",
    "clavicle_l": "spine_03", "upperarm_l": "clavicle_l", "forearm_l": "upperarm_l", "hand_l": "forearm_l",
    "clavicle_r": "spine_03", "upperarm_r": "clavicle_r", "forearm_r": "upperarm_r", "hand_r": "forearm_r",
    "thigh_l": "pelvis", "shin_l": "thigh_l", "foot_l": "shin_l", "toe_l": "foot_l",
    "thigh_r": "pelvis", "shin_r": "thigh_r", "foot_r": "shin_r", "toe_r": "foot_r",
}


def activate(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_shape(body):
    """Apply MPFB's target shape keys and any non-armature modifiers, leaving plain geometry."""
    activate(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type != "ARMATURE":
            bpy.ops.object.modifier_apply(modifier=m.name)


def apply_transforms(rig, meshes):
    """Unparent, apply every transform (MPFB may scale objects), and parent back: all at identity afterwards."""
    for o in [rig, *meshes]:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in [rig, *meshes]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for m in meshes:
        m.parent = rig


def group_centroid(body, name):
    g = body.vertex_groups.get(name)
    if g is None:
        return None
    pts = [v.co for v in body.data.vertices if any(e.group == g.index and e.weight > 0.5 for e in v.groups)]
    return sum(pts, Vector()) / len(pts) if pts else None


def _group_verts(body, name, threshold=0.5):
    g = body.vertex_groups.get(name)
    if g is None:
        return []
    return [v for v in body.data.vertices if any(e.group == g.index and e.weight > threshold for e in v.groups)]


LASH_GROUPS = ("helper-l-eyelashes-1", "helper-l-eyelashes-2", "helper-r-eyelashes-1", "helper-r-eyelashes-2")


def delete_helpers(body):
    """Keep the 'body' vertex group's vertices and the lash strips (material slot 1, 'lashes'; closeup spec §4.1).
    Returns what's read from the helpers first: the eyes (centres, and the eyeball's radius fitted behind the cornea),
    the mouth, the upper teeth (centre and front), and the lower teeth (centre, front, and each helper point with its
    jaw-open motion). The 'lips' group becomes the float attribute `lipmask`; the lashes are marked `lash` (1 upper,
    0.5 lower)."""
    names = [g.name for g in body.vertex_groups]
    if "body" not in names:
        raise SystemExit(f"the basemesh has no 'body' vertex group; it has {names}")
    eyes, eye_radius = {}, []
    for side in ("l", "r"):
        pts = [v.co.copy() for v in _group_verts(body, f"helper-{side}-eye")]
        if not pts:
            eyes[side] = None
            continue
        # The helper is an eyeball with a cornea bulging in front (-y): its width and height give the ball's radius,
        # and the ball's back sits at the helper's back.
        xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
        r = (max(xs) - min(xs) + max(zs) - min(zs)) / 4
        eyes[side] = Vector(((min(xs) + max(xs)) / 2, max(ys) - r, (min(zs) + max(zs)) / 2))
        eye_radius.append(r)
    teeth = [group_centroid(body, g) for g in ("helper-upper-teeth", "helper-lower-teeth")]
    teeth = [t for t in teeth if t is not None]

    def row(name, with_motion=False):
        vs = _group_verts(body, name)
        if not vs:
            return None
        pts = [v.co.copy() for v in vs]
        out = {"centre": sum(pts, Vector()) / len(pts), "front": min(pts, key=lambda p: p.y)}
        jaw = body.data.attributes.get("xp_jawOpen")
        if with_motion and jaw is not None:
            out["points"] = [(v.co.copy(), jaw.data[v.index].vector.copy()) for v in vs]
        return out

    upper, lower = row("helper-upper-teeth"), row("helper-lower-teeth", with_motion=True)
    # The lips (MPFB's 'lips' group) as a float mask the face paint reads after the trim drops the group.
    lipmask = body.data.attributes.new("lipmask", "FLOAT", "POINT")
    lg = body.vertex_groups.get("lips")
    if lg is not None:
        for v in body.data.vertices:
            lipmask.data[v.index].value = next((e.weight for e in v.groups if e.group == lg.index), 0.0)
    lash = body.data.attributes.new("lash", "FLOAT", "POINT")
    lash_idx = set()
    for gname in LASH_GROUPS:
        for v in _group_verts(body, gname, 0.01):
            lash.data[v.index].value = 1.0 if gname.endswith("-2") else 0.5
            lash_idx.add(v.index)
    gi = body.vertex_groups["body"].index
    keep = {v.index for v in body.data.vertices if any(e.group == gi and e.weight > 0.5 for e in v.groups)} | lash_idx
    # Two material slots: the skin, and the lashes (faces made only of lash vertices).
    body.data.materials.clear()
    for n in ("body", "lashes"):
        mat = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        mat.use_nodes = True
        body.data.materials.append(mat)
    for poly in body.data.polygons:
        poly.material_index = 1 if all(i in lash_idx for i in poly.vertices) else 0
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    return {"eyes": eyes, "eye_radius": sum(eye_radius) / len(eye_radius) if eye_radius else 0.012,
            "mouth": sum(teeth, Vector()) / len(teeth) if teeth else None, "upper_teeth": upper, "lower_teeth": lower}


def scale_to_height(body, rig, height_m, points):
    """Scale the mesh, the bones and the landmark points so the body is exactly height_m tall, feet on z = 0."""
    zs = [v.co.z for v in body.data.vertices]
    f = height_m / (max(zs) - min(zs))
    for v in body.data.vertices:
        v.co *= f
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in rig.data.edit_bones:
        eb.head *= f
        eb.tail *= f
    bpy.ops.object.mode_set(mode="OBJECT")
    for k, p in points.items():
        if isinstance(p, dict):
            for kk, pp in p.items():
                if isinstance(pp, list):
                    p[kk] = [(a * f, b * f) for a, b in pp]
                elif pp is not None:
                    p[kk] = pp * f
        elif p is not None:
            points[k] = p * f
    return f


def trim(rig, body):
    """Merge the weights of every dropped bone into its nearest kept ancestor, delete it, then rename to the contract."""
    have = {b.name for b in rig.data.bones}
    missing = [s for s in BONE_MAP if s not in have and s != "Root"]
    if missing:
        raise SystemExit(f"the game_engine rig lacks {missing}; it has {sorted(have)}")
    keep = set(BONE_MAP)
    for bone in rig.data.bones:
        if bone.name in keep:
            continue
        anc = bone.parent
        while anc is not None and anc.name not in keep:
            anc = anc.parent
        src = body.vertex_groups.get(bone.name)
        if src is None:
            continue
        if anc is None:
            raise SystemExit(f"bone {bone.name} has no kept ancestor to take its weights")
        dst = body.vertex_groups.get(anc.name) or body.vertex_groups.new(name=anc.name)
        for v in body.data.vertices:
            for e in v.groups:
                if e.group == src.index and e.weight > 0:
                    dst.add([v.index], e.weight, "ADD")
        body.vertex_groups.remove(src)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    for b in list(eb):
        if b.name not in keep:
            eb.remove(b)
    if "Root" not in eb:
        root = eb.new("Root")
        root.head, root.tail = Vector((0, 0, 0)), Vector((0, 0.1, 0))
    source_of = {dst: src for src, dst in BONE_MAP.items()}
    for dst, parent in PARENT.items():
        eb[source_of[dst]].use_connect = False
        eb[source_of[dst]].parent = eb[source_of[parent]]
    bpy.ops.object.mode_set(mode="OBJECT")
    for src, dst in BONE_MAP.items():
        if src != dst:
            rig.data.bones[src].name = dst  # Blender renames the matching vertex groups too
    for g in list(body.vertex_groups):
        if g.name not in PARENT and g.name != "root":
            body.vertex_groups.remove(g)
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()


def _head_weight(body):
    g = body.vertex_groups.get("head")
    return [next((e.weight for e in v.groups if g is not None and e.group == g.index), 0.0) for v in body.data.vertices]


def head_triangles(body):
    """Triangles whose vertices all follow the head (weight > 0.5)."""
    w = _head_weight(body)
    return sum(len(p.vertices) - 2 for p in body.data.polygons if all(w[i] > 0.5 for i in p.vertices))


def decimate(body, triangles, keep_head=True):
    """Collapse down to about `triangles`, taking nothing from the head when keep_head (closeup spec §4.1): the
    modifier's vertex group weights where it may collapse, and the head's are zero."""
    now = sum(len(p.vertices) - 2 for p in body.data.polygons)
    if now <= triangles:
        return
    activate(body)
    mod = body.modifiers.new("decimate", "DECIMATE")
    mod.ratio = triangles / now
    if keep_head:
        g = body.vertex_groups.new(name="decimate")
        for v, w in zip(body.data.vertices, _head_weight(body)):
            g.add([v.index], 0.0 if w > 0.05 else 1.0, "REPLACE")
        mod.vertex_group = g.name
        mod.vertex_group_factor = 1000.0
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if keep_head:
        body.vertex_groups.remove(body.vertex_groups["decimate"])


def limit_weights(obj):
    activate(obj)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def materials(obj, names):
    """Name the object's material slots in order, keeping each face's slot (the body: skin, then lashes)."""
    for i, n in enumerate(names):
        mat = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        mat.use_nodes = True
        if i < len(obj.data.materials):
            obj.data.materials[i] = mat
        else:
            obj.data.materials.append(mat)


def single_material(obj, name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat
