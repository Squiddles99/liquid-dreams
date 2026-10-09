"""Hero eyes (hero spec §6): an eyeball with a procedural sclera, blue-grey iris and pupil, under a clear cornea that
bulges in front, for Cycles. Each eye's object origin is its centre and its local -y looks forward, so the shader
reads the angle from the gaze straight off object coordinates."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from skin import Nodes, srgb

IRIS = srgb((96, 122, 128))
IRIS_DARK = srgb((52, 66, 74))
COLLARETTE = srgb((150, 132, 92))
SCLERA = srgb((236, 228, 222))


def _sphere(name, r, bulge=0.0, segs=48):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    if bulge:
        # The cornea: the front cap (within ~35° of -y) pushed out into a smaller-radius dome.
        for v in bm.verts:
            d = v.co.normalized()
            c = -d.y
            if c > 0.8:
                t = (c - 0.8) / 0.2
                v.co += Vector((0, -1, 0)) * bulge * (t * t * (3 - 2 * t))
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me


def eye_material():
    mat = bpy.data.materials.get("eye_hero") or bpy.data.materials.new("eye_hero")
    mat.use_nodes = True
    g = Nodes(mat)
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    d = g.n("ShaderNodeVectorMath", _operation="NORMALIZE", Vector=co).outputs["Vector"]
    sep = g.n("ShaderNodeSeparateXYZ", Vector=d)
    cos_t = g.math("MULTIPLY", sep.outputs["Y"], -1.0)
    ang = g.math("ARCCOSINE", cos_t)  # radians from the gaze
    # Radial fibres: noise over the angle round the gaze (atan2 of x, z), stretched along the radius.
    az = g.math("ARCTAN2", sep.outputs["X"], sep.outputs["Z"])
    fib_co = g.n("ShaderNodeCombineXYZ", X=g.math("MULTIPLY", az, 14.0), Y=g.math("MULTIPLY", ang, 3.0), Z=0.0).outputs["Vector"]
    fib = g.n("ShaderNodeTexNoise", Vector=fib_co, Scale=4.0, Detail=6.0, Roughness=0.6).outputs["Fac"]
    iris_r, pupil_r = math.radians(32), math.radians(8.5)
    t = g.math("DIVIDE", g.math("SUBTRACT", ang, pupil_r), iris_r - pupil_r)  # 0 at the pupil, 1 at the limbus
    iris = g.mix(IRIS, IRIS_DARK, g.math("MULTIPLY", fib, 0.8))
    iris = g.mix(iris, COLLARETTE, g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.math("MINIMUM", g.math("MULTIPLY", t, 4.0), 1.0)), 0.55))
    limbal = g.math("MINIMUM", 1.0, g.math("MULTIPLY", g.math("MAXIMUM", g.math("SUBTRACT", t, 0.82), 0.0), 6.0))
    iris = g.mix(iris, srgb((30, 36, 40)), limbal)
    in_iris = g.math("LESS_THAN", ang, iris_r)
    in_pupil = g.math("LESS_THAN", ang, pupil_r)
    sclera = g.mix(SCLERA, srgb((226, 190, 180)), g.math("MULTIPLY", g.math("MAXIMUM", g.math("SUBTRACT", ang, 1.1), 0.0), 1.2))
    col = g.mix(sclera, iris, in_iris)
    col = g.mix(col, srgb((6, 6, 7)), in_pupil)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": col, "Roughness": 0.35, "Subsurface Weight": 0.4,
                                               "Subsurface Radius": (1.0, 0.5, 0.4), "Subsurface Scale": 0.002})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def cornea_material():
    mat = bpy.data.materials.get("cornea_hero") or bpy.data.materials.new("cornea_hero")
    mat.use_nodes = True
    g = Nodes(mat)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": (1, 1, 1, 1), "Roughness": 0.0, "Transmission Weight": 1.0, "IOR": 1.376})
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def build(landmarks, name):
    r = landmarks["eye_radius"]
    objs = []
    em, cm = eye_material(), cornea_material()
    for side, c in landmarks["eyes"].items():
        ball = bpy.data.objects.new(f"{name}_eye_{side}", _sphere("eyeball", r * 0.985))
        ball.data.materials.append(em)
        cornea = bpy.data.objects.new(f"{name}_cornea_{side}", _sphere("cornea", r, bulge=r * 0.09))
        cornea.data.materials.append(cm)
        for o in (ball, cornea):
            o.location = c
            bpy.context.scene.collection.objects.link(o)
            objs.append(o)
    return objs
