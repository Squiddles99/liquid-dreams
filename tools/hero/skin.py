"""Shazza's skin for Cycles (hero spec §5): masks painted as vertex attributes from the fitted marks, a procedural
Principled BSDF over them (tan, rosy cheeks and nose, freckles where the sun hits, pores), random-walk subsurface.
The game's baked maps come from this same material (plan Task 11)."""
import math

import bpy
import numpy as np
from mathutils import Vector


def srgb(c):
    return tuple(((x / 255) / 12.92 if x / 255 <= 0.04045 else ((x / 255 + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def _gauss(P, c, s):
    return np.exp(-np.sum((P - np.asarray(c)) ** 2, axis=1) / (s * s))


def paint_lidline(body, landmarks):
    """`lidline`: the upper lid's margin darkened (the lash line: the roots and their shadow read as a dark rim at any
    distance; the painting draws it strongly), fading 2.5 mm up the lid; a fainter one under the eye."""
    me = body.data
    P = np.array([v.co[:] for v in me.vertices])
    out = np.zeros(len(P))
    r = landmarks["eye_radius"]
    for c in landmarks["eyes"].values():
        d = P - np.array(c[:])
        dist = np.linalg.norm(d, axis=1) - r  # off the eyeball's surface
        front = d[:, 1] < -r * 0.35
        up = d[:, 2] > r * 0.05
        rim = np.clip(1 - dist / 0.0045, 0, 1) * front
        out = np.maximum(out, rim * np.where(up, 1.0, 0.35))
    att = me.attributes.get("lidline") or me.attributes.new("lidline", "FLOAT", "POINT")
    att.data.foreach_set("value", out.astype(np.float32))


def paint_masks(body, marks, height):
    """`rosy` (cheeks, nose, chin, ears, knees, elbows), `freckle` (density), `tzone` (shine)."""
    me = body.data
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    m = {k: np.array(v[:]) for k, v in marks.items()}
    out = lambda: np.zeros(len(P))
    rosy, freckle, tzone = out(), out(), out()
    for s in ("R", "L"):
        sign = -1 if s == "R" else 1
        cheek = (m[f"eye_outer_{s}"] + m[f"mouth_{s}"]) / 2 + np.array([sign * 0.008, -0.004, 0.006])
        rosy += 0.85 * _gauss(P, cheek, 0.022)
        freckle += _gauss(P, cheek + np.array([-sign * 0.008, 0, 0.006]), 0.024)
    rosy += 0.7 * _gauss(P, m["nose_tip"], 0.011) + 0.25 * _gauss(P, m["chin"], 0.014)
    bridge = (m["nose_bridge"] + m["nose_tip"]) / 2
    freckle += 1.2 * _gauss(P, bridge, 0.016) + 0.5 * _gauss(P, m["nose_bridge"] + np.array([0, 0, 0.035]), 0.03)
    tzone += _gauss(P, bridge, 0.02) + 0.6 * _gauss(P, m["nose_bridge"] + np.array([0, 0, 0.04]), 0.025) + 0.5 * _gauss(P, m["chin"], 0.012)
    ears = np.array([me.attributes["g_ears"].data[i].value for i in range(len(P))])
    rosy += 0.6 * ears
    # The sun's spread over the body (the painting's speckled shoulders, chest, arms and thighs): up-facing and
    # front-facing skin above the knees, lighter lower down.
    up = np.clip(N[:, 2], 0, 1)
    front = np.clip(-N[:, 1], 0, 1)
    z = P[:, 2] / height
    body_sun = (0.55 * up + 0.35 * front) * np.clip((z - 0.25) / 0.5, 0.15, 1.0)
    shoulders = (z > 0.72) & (z < 0.86)
    freckle = np.maximum(freckle, np.where(shoulders, 0.65, 0.3) * body_sun)
    head = z > 0.86
    freckle = np.where(head, freckle, freckle * (1 - np.clip(rosy, 0, 1)))
    for name, arr in (("rosy", np.clip(rosy, 0, 1)), ("freckle", np.clip(freckle, 0, 1)), ("tzone", np.clip(tzone, 0, 1))):
        att = me.attributes.get(name) or me.attributes.new(name, "FLOAT", "POINT")
        att.data.foreach_set("value", arr.astype(np.float32))


class Nodes:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def n(self, kind, **inputs):
        node = self.nt.nodes.new(kind)
        node.location = (self.x, 0)
        self.x += 200
        for k, v in inputs.items():  # properties first: they decide which inputs exist
            if k.startswith("_"):
                setattr(node, k[1:], v)
        for k, v in inputs.items():
            if k.startswith("_"):
                continue
            elif isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, node.inputs[k])
            else:
                node.inputs[k].default_value = v
        return node

    def attr(self, name):
        return self.n("ShaderNodeAttribute", _attribute_name=name).outputs["Fac"]

    def math(self, op, a, b=0.0, clamp=False):
        node = self.n("ShaderNodeMath", _operation=op, _use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, node.inputs[i])
            else:
                node.inputs[i].default_value = v
        return node.outputs[0]

    def mix(self, a, b, fac):
        node = self.n("ShaderNodeMix", _data_type="RGBA")
        for sock, v in ((node.inputs[6], a), (node.inputs[7], b), (node.inputs[0], fac)):
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, sock)
            else:
                sock.default_value = v
        return node.outputs[2]


TAN = srgb((178, 114, 76))
ROSY = srgb((178, 78, 58))
FRECKLE = srgb((122, 62, 34))
LIP = srgb((176, 78, 74))
NAIL = srgb((232, 186, 172))


def material(name="skin_hero"):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    g = Nodes(mat)
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    # Albedo: tan, a broad mottling, rosy zones, freckles (Voronoi cells kept by density), lips, nails.
    mottle = g.n("ShaderNodeTexNoise", Vector=co, Scale=9.0, Detail=4.0).outputs["Fac"]
    base = g.mix(TAN, srgb((160, 92, 58)), g.math("MULTIPLY", mottle, 0.6))
    base = g.mix(base, ROSY, g.math("MULTIPLY", g.attr("rosy"), 0.8))
    vor = g.n("ShaderNodeTexVoronoi", Vector=co, Scale=420.0, Randomness=1.0)
    size = g.n("ShaderNodeTexNoise", Vector=co, Scale=60.0).outputs["Fac"]
    radius = g.math("MULTIPLY", size, 0.42)
    spot = g.math("LESS_THAN", vor.outputs["Distance"], radius)
    keep = g.math("LESS_THAN", g.n("ShaderNodeSeparateColor", Color=vor.outputs["Color"]).outputs[0], g.math("MULTIPLY", g.attr("freckle"), 1.0))
    freck = g.math("MULTIPLY", g.math("MULTIPLY", spot, keep), 0.7)
    base = g.mix(base, FRECKLE, freck)
    base = g.mix(base, LIP, g.math("MINIMUM", g.math("MULTIPLY", g.attr("lipmask"), 1.2), 0.85))
    # Under the hair the scalp reads the hair's colour, so a parting or a thin patch never shows bare skin.
    base = g.mix(base, srgb((112, 74, 40)), g.math("MULTIPLY", g.attr("g_scalp"), 0.85))
    base = g.mix(base, srgb((48, 26, 18)), g.math("MULTIPLY", g.math("POWER", g.attr("lidline"), 1.6), 0.85))
    nails = g.math("MAXIMUM", g.attr("g_fingernails"), g.attr("g_toenails"))
    base = g.mix(base, NAIL, nails)
    # Roughness: 0.45 skin, shinier T-zone and lips, matte-ish pores.
    rough = g.math("SUBTRACT", 0.53, g.math("MULTIPLY", g.attr("tzone"), 0.12))
    rough = g.math("SUBTRACT", rough, g.math("MULTIPLY", g.attr("lipmask"), 0.08))
    rough = g.math("SUBTRACT", rough, g.math("MULTIPLY", nails, 0.25))
    # Pores (~0.6 mm cells) and a finer grain, as bump.
    pores = g.n("ShaderNodeTexVoronoi", Vector=co, Scale=1700.0, _feature="SMOOTH_F1").outputs["Distance"]
    grain = g.n("ShaderNodeTexNoise", Vector=co, Scale=2600.0, Detail=2.0).outputs["Fac"]
    height = g.math("ADD", pores, g.math("MULTIPLY", grain, 0.4))
    bump = g.n("ShaderNodeBump", Height=height, Strength=0.22, Distance=0.0003)
    bsdf = g.n("ShaderNodeBsdfPrincipled", **{"Base Color": base, "Roughness": rough, "Normal": bump.outputs["Normal"],
                                               "Subsurface Weight": 1.0, "Subsurface Radius": (1.0, 0.36, 0.18),
                                               "Subsurface Scale": 0.003, "Specular IOR Level": 0.5, "IOR": 1.4})
    bsdf.subsurface_method = "RANDOM_WALK_SKIN"
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat
