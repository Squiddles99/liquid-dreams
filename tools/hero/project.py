"""The painting's face, baked onto the face (hero spec §5, ruling of round 2): the likeness lives in the painted colour
(brows, the lash line, the lips' shape and colour, the freckles' pattern), and the Gate 1a fit already knows exactly
where each point of the face lands in the painting (its face camera). So: with the painting's expression on, every
point of the skin looks up its painting pixel through that camera; a Cycles bake writes that colour into the body's own
UV layout; the skin material blends it over the procedural skin on the front of the face (attribute `faceproj`),
toned to the procedural tan (the painting's light is soft and frontal; its mean is matched, not removed)."""
import math
import os

import bpy
import numpy as np

from skin import Nodes, srgb, TAN


def paint_mask(body, L, landmarks):
    """`faceproj`: 1 on the front of the face, falling to 0 toward the sides, the hairline and under the jaw."""
    me = body.data
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    scalp = np.array([me.attributes["g_scalp"].data[i].value for i in range(len(P))])
    c = np.array(L["head_centre"][:])
    eye_z = L["eye_z"]
    front = np.clip((-N[:, 1] - 0.35) / 0.35, 0, 1)
    head = np.clip((P[:, 2] - (eye_z - 0.105)) / 0.02, 0, 1)  # above the chin's underside
    near = np.linalg.norm(P - c, axis=1) < 0.16
    hair_clear = np.clip(1 - scalp * 2.5, 0, 1)
    # The painting's own hair at the forehead's corners must not print on the skin: full weight up to 4 cm above the
    # eyes, none by 5.5 cm.
    hair_clear = hair_clear * np.clip((eye_z + 0.055 - P[:, 2]) / 0.015, 0, 1)
    w = front * head * near * hair_clear
    att = me.attributes.get("faceproj") or me.attributes.new("faceproj", "FLOAT", "POINT")
    att.data.foreach_set("value", w.astype(np.float32))


def bake(body, cam_face, scale, painting_path, out_png, size=4096):
    """Bake the painting through the face camera into `out_png` (the body's UVs). `cam_face` = (s, tx, ty, theta) in
    the fit's model units; `scale` = final metres per model unit."""
    img_p = bpy.data.images.load(painting_path)
    W, H = img_p.size
    target = bpy.data.images.new("faceproj_bake", size, size, alpha=False)
    mat = bpy.data.materials.new("faceproj_bake")
    mat.use_nodes = True
    g = Nodes(mat)
    s, tx, ty, th = cam_face
    co = g.n("ShaderNodeTexCoord").outputs["Object"]
    sep = g.n("ShaderNodeSeparateXYZ", Vector=co)
    x = g.math("DIVIDE", sep.outputs["X"], scale)
    z = g.math("DIVIDE", sep.outputs["Z"], scale)
    cs, sn = math.cos(th), math.sin(th)
    u = g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", g.math("MULTIPLY", x, cs), g.math("MULTIPLY", z, sn)), s), tx)
    v = g.math("SUBTRACT", ty, g.math("MULTIPLY", g.math("ADD", g.math("MULTIPLY", x, sn), g.math("MULTIPLY", z, cs)), s))
    uv = g.n("ShaderNodeCombineXYZ", X=g.math("DIVIDE", u, W), Y=g.math("SUBTRACT", 1.0, g.math("DIVIDE", v, H)), Z=0.0).outputs["Vector"]
    tex = g.n("ShaderNodeTexImage", Vector=uv, _image=img_p, _extension="CLIP", _interpolation="Cubic")
    emit = g.n("ShaderNodeEmission", Color=tex.outputs["Color"], Strength=1.0)
    out = g.n("ShaderNodeOutputMaterial")
    g.nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    tnode = g.n("ShaderNodeTexImage", _image=target)
    g.nt.nodes.active = tnode
    saved = list(body.data.materials)
    body.data.materials.clear()
    body.data.materials.append(mat)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 4
    scene.render.bake.margin = 24
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.bake(type="EMIT")
    target.filepath_raw = out_png
    target.file_format = "PNG"
    target.save()
    body.data.materials.clear()
    for m in saved:
        body.data.materials.append(m)
    return out_png


def tone_stats(out_png, body):
    """The baked painting's mean skin colour where the mask is full, for the tone match (linear RGB)."""
    import bpy
    img = bpy.data.images.load(out_png, check_existing=True)
    px = np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4)[:, :, :3]
    # Pick a skin-like band: warm, mid-bright (no lash line, no lips' darkest, no highlight).
    flat = px.reshape(-1, 3)
    lum = flat @ np.array([0.2126, 0.7152, 0.0722])
    warm = (flat[:, 0] > flat[:, 1]) & (flat[:, 1] > flat[:, 2]) & (lum > 0.25) & (lum < 0.8)
    return flat[warm].mean(0) if warm.any() else np.array([0.6, 0.35, 0.22])


def add_to_skin(mat, out_png, painted_mean):
    """Blend the baked face over the skin's albedo by `faceproj`, scaled so its mean meets the procedural tan."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    base_link = bsdf.inputs["Base Color"].links[0]
    base_out = base_link.from_socket
    g = Nodes.__new__(Nodes)
    g.nt, g.x = nt, 3000
    img = bpy.data.images.load(out_png, check_existing=True)
    uv = g.n("ShaderNodeUVMap", _uv_map="UVMap").outputs["UV"]
    tex = g.n("ShaderNodeTexImage", Vector=uv, _image=img, _interpolation="Cubic")
    # The tone match, less a little red (the painting's warm light runs orange on the tan).
    gain = tuple(float(TAN[i] / max(painted_mean[i], 1e-3)) * k for i, k in enumerate((0.93, 1.0, 1.04))) + (1.0,)
    toned = g.n("ShaderNodeMix", _data_type="RGBA", _blend_type="MULTIPLY")
    toned.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs["Color"], toned.inputs[6])
    toned.inputs[7].default_value = gain
    hue = g.n("ShaderNodeHueSaturation", Color=toned.outputs[2], Saturation=0.85)
    mix = g.mix(base_out, hue.outputs["Color"], g.math("MULTIPLY", g.attr("faceproj"), 0.8))
    nt.links.new(mix, bsdf.inputs["Base Color"])
