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


def sheet(name, height, out_dir, label):
    scene, cam = _setup()
    dist, target = height * 2.9, Vector((0, 0, height * 0.52))
    grid = np.zeros((VIEW_H * 2, VIEW_W * 4, 4), dtype=np.float32)
    tmp = os.path.join(out_dir, "_view.png")
    for i in range(8):
        a = math.radians(45 * i)
        cam.location = Vector((dist * math.sin(a), -dist * math.cos(a), height * 0.55))
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
