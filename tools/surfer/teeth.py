"""Grommet's buck teeth (grommet spec §4): an upper row fitted to his mouth, the two front teeth long and tipped forward
4 mm, splayed a touch; skinned to the head. Blender axes: +x the character's left, -y the front, +z up."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# (half-spacing from the midline, width, height, depth, forward tilt °, splay °, extra forward m): centrals, laterals,
# canines. The two front teeth hang below the upper lip and tip out over the lower one (the buck teeth that show).
TEETH = [(0.0048, 0.0095, 0.013, 0.0035, 18, 4, 0.003), (0.0135, 0.0075, 0.0095, 0.0032, 6, 8, 0.0), (0.0205, 0.0072, 0.0098, 0.0038, 3, 14, 0.0)]
ARCH = 18.0  # how fast the arch curves back (m⁻¹): y back = ARCH · x²


def build(rig, L, name):
    ut = L.get("upper_teeth")
    if ut is None:
        raise SystemExit("no upper-teeth helper found: can't place the teeth")
    front, centre = ut["front"], ut["centre"]
    gum_z = centre.z + 0.001  # low enough that the front teeth hang below the upper lip's edge
    bm = bmesh.new()
    for x, w, h, d, tilt, splay, ahead in TEETH:
        for sign in (1, -1):
            geom = bmesh.ops.create_cube(bm, size=1.0)
            verts = geom["verts"]
            bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=verts)
            bmesh.ops.translate(bm, vec=Vector((0, 0, -h / 2)), verts=verts)  # hang from the gum line
            rot = Matrix.Rotation(math.radians(-tilt), 3, "X") @ Matrix.Rotation(math.radians(splay * sign), 3, "Z")
            bmesh.ops.rotate(bm, cent=Vector(), matrix=rot, verts=verts)
            pos = Vector((centre.x + sign * x, front.y - 0.004 - ahead + ARCH * x * x, gum_z))
            bmesh.ops.translate(bm, vec=pos, verts=verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0008, segments=1, affect="EDGES")
    me = bpy.data.meshes.new(f"{name}_teeth")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_teeth", me)
    bpy.context.scene.collection.objects.link(obj)
    obj.vertex_groups.new(name="head").add(range(len(me.vertices)), 1.0, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig
    return obj
