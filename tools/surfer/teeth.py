"""Teeth for all three (closeup spec §4.1; grommet spec §4): an upper row fitted to the mouth, and a lower row that
drops with the jaw (its `jawOpen` shape key follows MPFB's lower-teeth helper under the mouth-open unit). Grommet's
upper row is buck: the two front teeth long and tipped forward, splayed a touch. Skinned to the head.
Blender axes: +x the character's left, -y the front, +z up."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# (half-spacing from the midline, width, height, depth, forward tilt °, splay °, extra forward m), midline outward.
UPPER = {
    # The two front teeth hang below the upper lip and tip out over the lower one (the buck teeth that show).
    "buck": [(0.0048, 0.0095, 0.013, 0.0035, 18, 4, 0.003), (0.0135, 0.0075, 0.0095, 0.0032, 6, 8, 0.0), (0.0205, 0.0072, 0.0098, 0.0038, 3, 14, 0.0)],
    # An even, gently curved row: centrals, laterals, canines, first premolars.
    "even": [(0.0045, 0.0086, 0.0105, 0.0045, 6, 2, 0.0), (0.0128, 0.0068, 0.009, 0.0042, 6, 7, 0.0), (0.0192, 0.0072, 0.0095, 0.005, 4, 14, 0.0), (0.0245, 0.0068, 0.008, 0.006, 2, 24, 0.0)],
}
LOWER = [(0.0028, 0.0053, 0.0085, 0.004, -4, 2, 0.0), (0.0083, 0.0056, 0.0088, 0.0042, -4, 7, 0.0), (0.0138, 0.0062, 0.009, 0.005, -2, 14, 0.0), (0.0192, 0.0066, 0.008, 0.0058, 0, 24, 0.0)]
ARCH = 18.0  # how fast the arch curves back (m⁻¹): y back = ARCH · x²


def _row(bm, table, centre, front_y, gum_z, down):
    """One row of bevelled boxes; `down` hangs them from the gum (upper) or stands them up from it (lower)."""
    made = []
    for x, w, h, d, tilt, splay, ahead in table:
        for sign in (1, -1):
            geom = bmesh.ops.create_cube(bm, size=1.0)
            verts = geom["verts"]
            bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=verts)
            bmesh.ops.translate(bm, vec=Vector((0, 0, -h / 2 if down else h / 2)), verts=verts)
            rot = Matrix.Rotation(math.radians(-tilt if down else tilt), 3, "X") @ Matrix.Rotation(math.radians(splay * sign), 3, "Z")
            bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=verts)
            bmesh.ops.translate(bm, vec=Vector((centre.x + sign * x, front_y - ahead + ARCH * x * x, gum_z)), verts=verts)
            made += verts
    return made


def _row_mesh(table, centre, front_y, gum_z, down):
    """A row as plain vertex and face lists (bevelled)."""
    bm = bmesh.new()
    _row(bm, table, centre, front_y, gum_z, down)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0008, segments=1, affect="EDGES")
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()
    return verts, faces


def build(rig, L, name, style="even"):
    ut, lt = L.get("upper_teeth"), L.get("lower_teeth")
    if ut is None or lt is None:
        raise SystemExit("no teeth helpers found: can't place the teeth")
    buck = style == "buck"
    # Buck: low enough that the front teeth hang below the upper lip's edge; even: tucked up behind the lip.
    uv, uf = _row_mesh(UPPER[style], ut["centre"], ut["front"].y - (0.004 if buck else 0.0005), ut["centre"].z + (0.001 if buck else 0.004), True)
    lv, lf = _row_mesh(LOWER, lt["centre"], lt["front"].y + 0.001, lt["centre"].z - 0.004, False)
    n_upper = len(uv)
    me = bpy.data.meshes.new(f"{name}_teeth")
    me.from_pydata([tuple(v) for v in uv + lv], [], uf + [[i + n_upper for i in f] for f in lf])
    me.update()
    obj = bpy.data.objects.new(f"{name}_teeth", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    # The lower row drops with the jaw: each vertex moves as the nearest three helper points do (inverse distance).
    pts = lt.get("points") or []
    basis = obj.shape_key_add(name="Basis", from_mix=False)
    key = obj.shape_key_add(name="jawOpen", from_mix=False)
    key.value = 0.0
    for i in range(n_upper, len(me.vertices)):
        if not pts:
            break
        co = me.vertices[i].co
        near = sorted(pts, key=lambda pm: (pm[0] - co).length)[:3]
        ws = [1.0 / max((pm[0] - co).length, 1e-4) for pm in near]
        delta = sum((pm[1] * w for pm, w in zip(near, ws)), Vector()) / sum(ws)
        key.data[i].co = basis.data[i].co + delta
    return obj
