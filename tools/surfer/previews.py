"""Turntable sheets for judging the bodies by eye (spec §7, gate 1): 8 views, 45° apart, in a 4 × 2 grid."""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

VIEW_W, VIEW_H = 384, 640


def _engine(scene):
    for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = e
            return
        except TypeError:
            continue


def _setup():
    scene = bpy.context.scene
    _engine(scene)
    scene.render.resolution_x, scene.render.resolution_y = VIEW_W, VIEW_H
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    bg.inputs[1].default_value = 0.8
    if "preview_sun" not in bpy.data.objects:
        sun = bpy.data.objects.new("preview_sun", bpy.data.lights.new("preview_sun", "SUN"))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), 0, math.radians(30))
        scene.collection.objects.link(sun)
    cam = bpy.data.objects.get("preview_cam")
    if cam is None:
        cam = bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
        cam.data.lens = 70
        scene.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def clay(obj):
    for slot in obj.material_slots:
        bsdf = slot.material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.6, 0.6, 0.6, 1)


FRAMES = {
    # (distance, target height and camera height, as fractions of the height; the file's suffix)
    "body": (2.9, 0.52, 0.55, ""),
    "hips": (0.75, 0.52, 0.52, "-close"),
}


def sheet(name, height, out_dir, label, close=False, frame=None):
    """8 views around the body. frame="hips" (or close=True) frames the hips for judging a cut, <label>-close;
    frame="face" frames the head for the gate's close-ups, <label>-face."""
    scene, cam = _setup()
    frame = frame or ("hips" if close else "body")
    if frame == "face":
        dist, target, cam_z, suffix = 0.55, Vector((0, 0, height * 0.93)), height * 0.93, "-face"
    else:
        d, t, z, suffix = FRAMES[frame]
        dist, target, cam_z = height * d, Vector((0, 0, height * t)), height * z
    label = f"{label}{suffix}"
    grid = np.zeros((VIEW_H * 2, VIEW_W * 4, 4), dtype=np.float32)
    tmp = os.path.join(out_dir, "_view.png")
    for i in range(8):
        a = math.radians(45 * i)
        cam.location = Vector((dist * math.sin(a), -dist * math.cos(a), cam_z))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tmp, check_existing=False)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(VIEW_H, VIEW_W, 4)
        bpy.data.images.remove(img)
        row, col = divmod(i, 4)
        y0 = (1 - row) * VIEW_H  # image rows run bottom-up: the first four views go on the top row
        grid[y0:y0 + VIEW_H, col * VIEW_W:(col + 1) * VIEW_W] = px
    out = bpy.data.images.new(f"{name}-{label}", VIEW_W * 4, VIEW_H * 2, alpha=True)
    out.pixels.foreach_set(grid.ravel())
    out.filepath_raw = os.path.join(out_dir, f"{name}-{label}.png")
    out.file_format = "PNG"
    out.save()
    os.remove(tmp)
import json  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUTFITS = json.load(open(os.path.join(REPO, "src", "surfer", "outfitMasks.json"), encoding="utf-8"))
WEIGHTS = ("spring", "steamer", "rashie", "bottoms", "top", "boardies")


def _sock(node, identifier, outputs=False):
    return next(s for s in (node.outputs if outputs else node.inputs) if s.identifier == identifier)


def _body_material(mat, preset):
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])

    def sep(layer):
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = layer
        s = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uvn.outputs[0], s.inputs[0])
        return s

    a, b, c = sep("mask_a"), sep("mask_b"), sep("mask_c")
    w = {}
    for key in WEIGHTS:
        v = nt.nodes.new("ShaderNodeValue")
        v.name = f"w_{key}"
        w[key] = v.outputs[0]

    def math(op, x, y):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for sock, val in ((n.inputs[0], x), (n.inputs[1], y)):
            if isinstance(val, float):
                sock.default_value = val
            else:
                nt.links.new(val, sock)
        return n.outputs[0]

    def mix(fac, col_a, col_b):
        n = nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        nt.links.new(fac, _sock(n, "Factor_Float"))
        for ident, col in (("A_Color", col_a), ("B_Color", col_b)):
            if isinstance(col, tuple):
                _sock(n, ident).default_value = (*col, 1)
            else:
                nt.links.new(col, _sock(n, ident))
        return _sock(n, "Result_Color", outputs=True)

    neo = math("MAXIMUM", math("MULTIPLY", w["spring"], a.outputs[0]), math("MULTIPLY", w["steamer"], a.outputs[1]))
    lycra = math("MULTIPLY", w["rashie"], b.outputs[0])
    fabric = math("MAXIMUM", math("MULTIPLY", w["bottoms"], b.outputs[1]), math("MULTIPLY", w["top"], c.outputs[0]))
    under = math("MULTIPLY", w["boardies"], c.outputs[1])
    col = mix(math("GREATER_THAN", fabric, 0.5), tuple(preset["preview"]["skin"]), tuple(preset["preview"]["fabric"]))
    col = mix(math("GREATER_THAN", under, 0.5), col, tuple(preset["preview"]["boardies"]))
    col = mix(math("GREATER_THAN", lycra, 0.5), col, tuple(preset["preview"]["rashie"]))
    col = mix(math("GREATER_THAN", neo, 0.5), col, (0.02, 0.02, 0.025))
    nt.links.new(col, bsdf.inputs["Base Color"])


def dress(parts, preset, outfit):
    body = parts[0]
    mat = body.material_slots[0].material
    if "w_spring" not in mat.node_tree.nodes:
        _body_material(mat, preset)
    for key in WEIGHTS:
        mat.node_tree.nodes[f"w_{key}"].outputs[0].default_value = float(OUTFITS[outfit][key])
    if len(body.material_slots) > 1 and body.material_slots[1].material.name == "lashes":
        body.material_slots[1].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.02, 0.015, 0.012, 1)
    for p in parts[1:]:
        if p.name.endswith("_boardies"):
            p.hide_render = outfit not in ("boardies", "rashieAndBoardies")
            p.material_slots[0].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*preset["preview"]["boardies"], 1)
        elif p.name.endswith("_hairDry"):
            p.hide_render = True  # the sheets show the wet look; the dry one is judged in the game
        elif p.name.endswith("_hair"):
            p.material_slots[0].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*preset["preview"]["hair"], 1)
        elif p.name.endswith("_glasses"):
            for slot in p.material_slots:
                bsdf = slot.material.node_tree.nodes["Principled BSDF"]
                if slot.material.name == "lens":
                    bsdf.inputs["Alpha"].default_value = 0.15
                    if hasattr(slot.material, "surface_render_method"):
                        slot.material.surface_render_method = "BLENDED"
                else:
                    bsdf.inputs["Base Color"].default_value = (*preset["preview"]["glasses"], 1)
        elif p.name.endswith("_teeth"):
            p.material_slots[0].material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*preset["preview"].get("teeth", (0.8, 0.77, 0.68)), 1)
