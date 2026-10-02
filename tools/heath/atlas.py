"""The heath atlas (dune-up-close spec §4.2): the bark, each kind's leaf sprays and L1 cluster cards (rendered by
Blender's Workbench from the kind's real leaf meshes, flat-lit: the game lights them), its fingers and flowers, and each
variant's top-down canopy silhouette for the dappled shadows. Drawn into atlas_layout's fixed rectangles."""
import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import atlas_layout as AL
import leaves
import tufts as tufts_mod


def _setup(scene, res):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "VERTEX"
    scene.view_settings.view_transform = "Standard"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filter_size = 0.75


def _camera(scene, centre, width, height, look_down=True):
    cam = bpy.data.objects.get("atlasCam")
    if cam is None:
        cam = bpy.data.objects.new("atlasCam", bpy.data.cameras.new("atlasCam"))
        scene.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(width, height)
    scene.render.pixel_aspect_x = 1
    cam.location = (centre.x, centre.y, centre.z + 5) if look_down else (centre.x, centre.y - 5, centre.z)
    cam.rotation_euler = (0, 0, 0) if look_down else (math.pi / 2, 0, 0)
    cam.data.clip_end = 20
    scene.camera = cam
    return cam


def _render(scene, objs, path):
    for o in scene.objects:
        if o.type == "MESH":
            o.hide_render = o not in objs
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
    bpy.data.images.remove(img)
    return px


def _mesh(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if "Col" in me.color_attributes:
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = me.color_attributes.find("Col")
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def _cluster(sp_leaf, colour, n_leaves, extent, rng, twig=True, spread=0.15):
    """A flat cluster of the kind's leaves (solid, vertex-coloured) over `extent` (x: width, y: length, m), on a twig up
    the middle; seen from above it fills a tile."""
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    w, l = extent

    def tri(a, b, c, rgb):
        f = bm.faces.new([bm.verts.new(p) for p in (a, b, c)])
        for lp in f.loops:
            lp[col] = (*rgb, 1.0)

    if twig:
        for k in range(8):
            y0, y1 = -l / 2 + l * k / 8, -l / 2 + l * (k + 1) / 8
            r = 0.002 * (1.4 - k / 8)
            tri(Vector((-r, y0, 0)), Vector((r, y0, 0)), Vector((r, y1, 0)), (0.12, 0.1, 0.08))
            tri(Vector((-r, y0, 0)), Vector((r, y1, 0)), Vector((-r, y1, 0)), (0.12, 0.1, 0.08))
    for i in range(n_leaves):
        if twig:
            t = rng.uniform(-0.45, 0.45)
            base = Vector((rng.uniform(-spread, spread) * w, t * l, rng.uniform(0, 0.01)))
        else:
            # A card's cluster: over a disc, thinning toward its rim (no square edge at 12–40 m).
            r, a = 0.42 * math.sqrt(rng.random()) ** 1.3, rng.uniform(0, 2 * math.pi)
            base = Vector((r * math.cos(a) * w, r * math.sin(a) * l, rng.uniform(0, 0.01)))
        ang = rng.uniform(0, 2 * math.pi)
        d = Vector((math.cos(ang), math.sin(ang) * 0.6 + 0.4, rng.uniform(-0.2, 0.3))).normalized()
        n = Vector((0, 0, 1))
        jitter = rng.uniform(0.8, 1.2)
        shade = rng.uniform(0.85, 1.1)
        rgb = tuple(min(1.0, c * jitter * shade) for c in colour)
        length = sp_leaf["length"] * rng.uniform(0.8, 1.2)
        width = sp_leaf["width"] * rng.uniform(0.85, 1.15)
        for a, b, c in leaves.leaf_tris(base, d, (n - d * n.dot(d)).normalized(), length, width, sp_leaf["shape"]):
            # The leaf's underside a little paler, its tip a little lighter: a hint of form in a flat render.
            tri(a, b, c, tuple(min(1.0, ch * 1.05) for ch in rgb))
    return _mesh("cluster", bm)


def _paste(atlas, name, px):
    x0, y0, w, h = AL.pixel_rect(name)
    src = px
    if src.shape[0] != h or src.shape[1] != w:
        ys = (np.arange(h) * src.shape[0] / h).astype(int)
        xs = (np.arange(w) * src.shape[1] / w).astype(int)
        src = src[ys][:, xs]
    atlas[y0:y0 + h, x0:x0 + w] = src


def _bark(rng, light):
    """Fissured grey bark (live) or bleached, smoother wood (dead), 128²: streaks along the branch (v)."""
    n = AL.CELL
    base = np.array([0.16, 0.14, 0.12]) if not light else np.array([0.36, 0.34, 0.31])
    x = np.linspace(0, 1, n, endpoint=False)
    streaks = sum(np.sin(2 * math.pi * (f * x + rng.random())) * a for f, a in ((7, 0.5), (13, 0.3), (29, 0.2)))
    fissure = np.clip(1 - np.abs(streaks) * (1.6 if not light else 0.6), 0, 1)
    grain = 1 + (rng.random((n, n)) - 0.5) * 0.08  # a little speckle
    img = base[None, None, :] * ((0.65 + 0.35 * fissure)[None, :] * grain)[..., None]
    out = np.ones((n, n, 4), dtype=np.float32)
    out[..., :3] = np.clip(img, 0, 1) ** (1 / 2.2)  # into sRGB (the PNG holds sRGB; the game decodes it)
    return out


def _solid(rgb, n=AL.CELL, gradient_to=None):
    """A flat tile, or `rgb` going to `gradient_to` at the top (v 0, a finger's tip) over its last fifth."""
    out = np.ones((n, n, 4), dtype=np.float32)
    for y in range(n):
        t = min(1.0, (y / (n - 1)) / 0.2)
        c = np.array(rgb) if gradient_to is None else np.array(gradient_to) * (1 - t) + np.array(rgb) * t
        out[y, :, :3] = c ** (1 / 2.2)
    return out


def build(scene, tmp, out_dir, species, canopy_objs):
    """Renders every tile into a 2048² RGBA atlas and writes heathAtlas.png; returns the manifest's tile table."""
    _setup(scene, AL.CELL)
    atlas = np.zeros((AL.SIZE, AL.SIZE, 4), dtype=np.float32)
    rng = random.Random(20261002)
    nrng = np.random.default_rng(7)
    _paste(atlas, "bark", _bark(nrng, False))
    _paste(atlas, "deadBark", _bark(nrng, True))
    tiles = {"bark": AL.tile("bark"), "deadBark": AL.tile("deadBark")}
    for kind, sp in species.CARD_LEAF.items():
        lf = species.LEAF.get(kind, {"colour": species.CARD_COLOUR.get(kind, (0.3, 0.3, 0.3))})
        for k in range(3 if kind in species.SPRAY_LEAF else 0):
            ss = species.SPRAY_LEAF[kind]
            o = _cluster(ss, lf["colour"], ss["count"], (lf["width"], lf["length"]), rng, spread=ss.get("spread", 0.3))
            _camera(scene, Vector((0, 0, 0)), lf["width"] * 1.02, lf["length"] * 1.02)
            # The card is width × length; the tile is square: render at the length and stretch across.
            scene.render.resolution_x, scene.render.resolution_y = AL.CELL, AL.CELL
            o.scale = (lf["length"] / lf["width"], 1, 1)
            px = _render(scene, [o], os.path.join(tmp, f"spray_{kind}_{k}.png"))
            bpy.data.objects.remove(o)
            _paste(atlas, f"spray_{kind}_{k}", px)
            tiles[f"spray_{kind}_{k}"] = AL.tile(f"spray_{kind}_{k}")
        # L1's cluster cards: the same leaves, a bigger cluster (40 cm), 4 of them.
        for k in range(4):
            o = _cluster(sp, species.CARD_COLOUR.get(kind, lf["colour"]), sp["count"] * 24, (0.4, 0.4), rng, twig=False, spread=0.45)
            _camera(scene, Vector((0, 0, 0)), 0.42, 0.42)
            px = _render(scene, [o], os.path.join(tmp, f"card_{kind}_{k}.png"))
            bpy.data.objects.remove(o)
            _paste(atlas, f"card_{kind}_0_{k}", px)
            tiles[f"card_{kind}_0_{k}"] = AL.tile(f"card_{kind}_0_{k}")
    # Pigface: its fingers' green going red at the tips (v 0 at the tip), and its magenta flowers; rice's pink heads.
    _paste(atlas, "spray_pigface_0", _solid((0.16, 0.3, 0.06), gradient_to=(0.45, 0.12, 0.06)))
    tiles["spray_pigface_0"] = AL.tile("spray_pigface_0")
    for kind in ("pigface", "rice"):
        fl = species.FLOWER[kind]
        _paste(atlas, f"spray_{kind}_3", _solid(fl["colour"]))
        tiles[f"spray_{kind}_3"] = AL.tile(f"spray_{kind}_3")
    # The near scatter (§4.4): dry fallen-leaf clumps (misc_0 daisy, misc_1 tea-tree), shell (misc_2), stone (misc_3),
    # each tuft's colour strip (misc_4.. : its greens across u, a brown band for heads, straw at the right; darker at
    # the base, v 1), and each tuft's L1 cards from its own blades.
    for k, (kind, dry) in enumerate((("daisy", (0.27, 0.24, 0.18)), ("tall", (0.24, 0.2, 0.14)))):
        o = _cluster(species.SPRAY_LEAF[kind], dry, species.SPRAY_LEAF[kind]["count"] * 14, (0.4, 0.4), rng, twig=False, spread=0.45)
        _camera(scene, Vector((0, 0, 0)), 0.42, 0.42)
        _paste(atlas, f"misc_{k}", _render(scene, [o], os.path.join(tmp, f"misc_{k}.png")))
        bpy.data.objects.remove(o)
    _paste(atlas, "misc_2", _solid((0.72, 0.68, 0.6)))
    stone = _bark(nrng, True)
    stone[..., :3] = stone[..., :3] * 0.0 + (np.array([0.42, 0.4, 0.36]) * (0.75 + 0.5 * nrng.random((AL.CELL, AL.CELL, 1)))) ** (1 / 2.2)
    _paste(atlas, "misc_3", stone)
    for t, name in enumerate(tufts_mod.TUFTS):
        sp = tufts_mod.TUFTS[name]
        strip = np.ones((AL.CELL, AL.CELL, 4), dtype=np.float32)
        u = np.linspace(0, 1, AL.CELL)[None, :, None]
        v = np.linspace(0, 1, AL.CELL)[:, None, None]  # 0 at the top (the tip), 1 at the base
        green = np.array(sp["colour"])[None, None] * (0.8 + 0.5 * u / 0.7)
        brown = np.array((sp["heads"] or (0, (0.17, 0.1, 0.06)))[1])[None, None] * np.ones_like(u)
        straw = np.array((0.3, 0.27, 0.17))[None, None] * np.ones_like(u)
        c = np.where(u < 0.7, green, np.where(u < 0.8, brown, straw)) * (1.0 - 0.45 * v)
        strip[..., :3] = np.clip(c, 0, 1) ** (1 / 2.2)
        _paste(atlas, f"misc_{4 + t}", strip)
        for k in range(3):
            bm = bmesh.new()
            col = bm.loops.layers.float_color.new("Col")

            def add(tris, colour, flags, bm=bm, col=col):
                for (a, _), (b, _), (c3, _) in tris:
                    f = bm.faces.new([bm.verts.new(p) for p in (a, b, c3)])
                    for lp in f.loops:
                        lp[col] = (*colour, 1.0)

            tufts_mod.tuft(add, name, random.Random(t * 97 + k))
            o = _mesh("tuftcard", bm)
            top = max(vv.co.z for vv in o.data.vertices)
            _camera(scene, Vector((0, 0, top / 2)), top * 1.05, top * 1.05, look_down=False)
            _paste(atlas, f"tuftcard_{name[5:]}_{k}", _render(scene, [o], os.path.join(tmp, f"tuftcard_{name}_{k}.png")))
            bpy.data.objects.remove(o)
    for k in range(12):
        tiles[f"misc_{k}"] = AL.tile(f"misc_{k}")
    for name in tufts_mod.TUFTS:
        for k in range(3):
            tiles[f"tuftcard_{name[5:]}_{k}"] = AL.tile(f"tuftcard_{name[5:]}_{k}")
    # Canopy silhouettes: each variant's L0 from above, alpha only (64 px).
    _setup(scene, AL.CELL // 2)
    for name, (o, half_w) in canopy_objs.items():
        _camera(scene, Vector((0, 0, 0)), 2.0, 2.0)
        px = _render(scene, [o], os.path.join(tmp, f"{name}.png"))
        alpha = px[..., 3:4]
        sil = np.concatenate([np.ones_like(px[..., :3]), alpha], axis=2)
        _paste(atlas, name, sil)
        tiles[name] = AL.tile(name)
    img = bpy.data.images.new("heathAtlas", AL.SIZE, AL.SIZE, alpha=True)
    img.pixels = atlas[::-1].ravel().tolist()
    img.filepath_raw = os.path.join(out_dir, "heathAtlas.png")
    img.file_format = "PNG"
    img.save()
    return tiles
