"""The look-dev studio for the gate renders (hero spec §11): Cycles on the GPU, a soft warm key from front-left above
(the painting's light), a cool fill, a rim, a dark grey backdrop, AgX."""
import math

import bpy
from mathutils import Vector


def setup(samples=256):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == kind
            break
        except TypeError:
            continue
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles_curves.shape = "THICK"
    scene.cycles_curves.subdivisions = 2
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.045, 0.045, 0.05, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    def area(name, loc, energy, size, color):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size, light.color = energy, size, color
        light.shape = "DISK"
        o = bpy.data.objects.new(name, light)
        o.location = loc
        d = Vector((0, 0, 1.0)) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(o)
        return o
    area("key", (-1.6, -2.6, 2.4), 520, 1.8, (1.0, 0.93, 0.84))
    area("fill", (2.2, -2.2, 1.3), 140, 2.5, (0.85, 0.9, 1.0))
    area("rim", (1.2, 2.4, 2.2), 380, 1.2, (1.0, 0.96, 0.9))
    area("floor_bounce", (0, -1.5, -0.6), 80, 2.0, (1.0, 0.85, 0.7))
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def shoot(cam, path, target, yaw_deg, dist, lens, w, h, pitch_deg=0.0):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = w, h
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    t = Vector(target)
    cam.location = t + Vector((dist * math.sin(yaw) * math.cos(pitch), -dist * math.cos(yaw) * math.cos(pitch), dist * math.sin(pitch)))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.dof.use_dof = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
