"""Builds one surfer: blender --background --python build.py -- <preset.json> <out dir> <preview dir> (spec §3.1)."""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import bodymap  # noqa: E402
import clothes  # noqa: E402
import export  # noqa: E402
import expressions  # noqa: E402
import face  # noqa: E402
import glasses  # noqa: E402
import hair  # noqa: E402
import mpfb_bridge  # noqa: E402
import packs  # noqa: E402
import previews  # noqa: E402
import rig_trim  # noqa: E402
import sculpt  # noqa: E402
import skin  # noqa: E402
import teeth  # noqa: E402
import wardrobe  # noqa: E402

preset_path, out_dir, preview_dir = sys.argv[sys.argv.index("--") + 1:][:3]
preset = json.load(open(preset_path, encoding="utf-8"))
name = preset["name"]

bpy.ops.wm.read_homefile(use_empty=True)
body = mpfb_bridge.create_human(preset["macro"])
mpfb_bridge.apply_targets(body, preset.get("face", {}))
rig = mpfb_bridge.add_game_rig(body)
body.name, rig.name = f"{name}_body", f"{name}_armature"
rig_trim.bake_shape(body)
expressions.load(body)
rig_trim.apply_transforms(rig, [body])
landmarks = rig_trim.delete_helpers(body)
expressions.scale(body, rig_trim.scale_to_height(body, rig, preset["heightM"], landmarks))
sculpt.smooth_anatomy(body, preset["heightM"], preset.get("smooth", []))
# The upper lip thinned directly (dune select spec §13.1), where MPFB's targets only nudge it.
lip_mm = sculpt.upper_lip(body, landmarks["mouth"], preset["upperLip"]) if preset.get("upperLip") else None
rig_trim.trim(rig, body)
rig_trim.decimate(body, preset["bodyTriangles"])
rig_trim.limit_weights(body)
rig_trim.materials(body, ["body", "lashes"])
coords = bodymap.bone_coords(body, rig)
L = bodymap.landmarks(body, rig, preset["heightM"], landmarks, coords)
weights = bodymap.bone_weights(body, rig)
face.shape_lashes(body, L, preset.get("lashes", {}))
expressions.breathe(body, weights)
print(f"morph deltas (mm): " + ", ".join(f"{m} {1000 * expressions.max_delta(body, m):.1f}" for m in expressions.MORPHS))
expressions.to_shape_keys(body)
head_tris = rig_trim.head_triangles(body)
wardrobe.paint_masks(body, weights, preset["heightM"])
eye_obj = hair.eyes(rig, L, name)
face.colour_eyes(eye_obj, L)
face.paint(body, weights, L, preset.get("browWeight", 1.0), skin.bake_ao(body, [eye_obj]))
spots = skin.pimples(body, coords, L, preset["pimpleSeed"]) if "pimpleSeed" in preset else []
hair_obj = hair.build(body, rig, preset["hair"], L, coords, name)
rig_trim.single_material(hair_obj, "hair")
wet_checks, wet_extras = dict(hair.last_checks), list(hair.last_extras)  # the braids' (dune select spec §13.2)
hair.bake_ao(hair_obj, body, L["head_centre"], reach=preset["hair"].get("aoReach", 0.045))
rig_trim.single_material(eye_obj, "eyes")
parts = [body, hair_obj, eye_obj, *wet_extras]
if preset.get("glasses"):
    parts.append(glasses.build(rig, body, L, name))
if preset.get("teeth"):
    tooth = teeth.build(rig, L, name, "buck" if preset["teeth"] in (True, "buck") else "even")
    rig_trim.single_material(tooth, "teeth")
    parts.append(tooth)
if preset["boardies"]:
    shorts = wardrobe.boardies(body, rig, coords, weights, preset["heightM"], name)
    rig_trim.single_material(shorts, "boardies")
    parts.append(shorts)
# The walking clothes (walking spec §3): over the swimwear, after it so their occlusion sees it.
walk = preset.get("walking")
garments = []
if walk:
    garments.append(clothes.tee(body, rig, coords, weights, preset["heightM"], L, walk["tee"], name))
    rig_trim.single_material(garments[-1], "tee")
    if walk["shorts"] == "cutoffs":
        garments.append(clothes.cutoffs(body, rig, coords, weights, preset["heightM"], name))
        rig_trim.single_material(garments[-1], "denim")
    others = [p for p in parts if p is not body and p.name.endswith(("_boardies",))]
    for g in garments:
        clothes.bake_ao(g, [body, *others, *[x for x in garments if x is not g]])
    parts += garments
    if walk.get("straps"):
        straps = clothes.bikini_straps(body, rig, preset["heightM"], name)
        rig_trim.single_material(straps, "straps")
        parts.append(straps)
    feet = clothes.thongs(body, rig, coords, name)
    rig_trim.single_material(feet, "thongs")
    parts.append(feet)
# The hat and the hair pressed under it (walking spec §3).
hat_hair = hat = band = None
if walk and walk.get("hat"):
    band = clothes.hat_band(L, walk["hat"])
    hat = (clothes.cap if walk["hat"] == "cap" else clothes.bucket_hat)(body, rig, coords, L, band, name)
    clothes.bake_ao(hat, [body])
    parts.append(hat)
    hat_hair = hair.build(body, rig, {"style": "capped" if walk["hat"] == "cap" else "bucket", "seed": preset["hair"]["seed"] + 5, "below": band, "hat": hat}, L, coords, name)
    rig_trim.single_material(hat_hair, "hairHat")
    hair.bake_ao(hat_hair, body, L["head_centre"], reach=0.02)
    parts.append(hat_hair)
# The pack and what's on it (walking spec §2, §3), over the tee.
carried = []
if walk and walk.get("pack"):
    pack, box = packs.build(body, rig, garments, preset["heightM"], walk["pack"], name)
    clothes._colors(pack, [clothes._fold(v.co, 16.0) for v in pack.data.vertices], [1.0] * len(pack.data.vertices))
    carried.append(pack)
    if walk["pack"] == "rucksack":
        carried.append(packs.towel(rig, preset["heightM"], box, name))
    elif walk["pack"] == "surf":
        carried.append(packs.wetsuit(rig, preset["heightM"], box, packs._clear_tree([body, *garments, pack]), name))
    else:
        carried.append(packs.fins(rig, preset["heightM"], box, name))
    for c in carried:
        if "Color" not in c.data.color_attributes:
            clothes._colors(c, [clothes._fold(v.co, 16.0) for v in c.data.vertices], [1.0] * len(c.data.vertices))
        clothes.bake_ao(c, [body, *garments, *[x for x in carried if x is not c]])
    parts += carried
# The dry hair on land, draped over the walking clothes as well as the body (it fell inside the tee at the back).
if preset.get("dryHair"):
    dry_obj = hair.build(body, rig, {**preset["dryHair"], "dry": True}, L, coords, name, avoid=[*garments, *carried])
    rig_trim.single_material(dry_obj, "hairDry")
    dry_checks = dict(hair.last_checks)
    parts += hair.last_extras
    hair.bake_ao(dry_obj, body, L["head_centre"], reach=preset["dryHair"].get("aoReach", 0.045))
    parts.append(dry_obj)

checks = expressions.blink_check(body, L)
if lip_mm:
    checks["upperLipMm"], checks["upperLipSculptedMm"] = lip_mm
if preset.get("dryHair"):
    checks.update({k: v for k, v in dry_checks.items() if not k.startswith("braid")})  # long dry hair's numbers (§13.1)
# Shazza's braids (§13.2), dry and wet: how many, where the ends hang, and none of them inside the body.
if "braids" in wet_checks or "braids" in dry_checks:
    checks["braidsWet"] = wet_checks.get("braids", 0)
    checks["braidsDry"] = dry_checks.get("braids", 0) if preset.get("dryHair") else 0
    checks["braidEndDropCm"] = dry_checks.get("braidEndDropCm", []) + wet_checks.get("braidEndDropCm", [])
    checks["braidEndsInFront"] = bool(dry_checks.get("braidEndsInFront", True) and wet_checks.get("braidEndsInFront", True))
    checks["braidsOutside"] = dry_checks.get("braidInside", 0) == 0 and wet_checks.get("braidInside", 0) == 0
    print(f"braid vertices inside the body: dry {dry_checks.get('braidInside')}, wet {wet_checks.get('braidInside')}")
if walk:
    checks["garmentsOutside"] = clothes.outside_check(garments, body)
if hat_hair is not None:
    checks["hatHairUnder"] = clothes.hat_hair_check(hat_hair, hat, band, L["head_centre"])
print(f"checks: {checks}")
export.glb(rig, parts, os.path.join(out_dir, f"{name}.glb"))
export.manifest(rig, parts, preset, os.path.join(out_dir, f"{name}.manifest.json"), mpfb_bridge.version(), L, spots, head_tris, checks)
previews.clay(body)
previews.sheet(name, preset["heightM"], preview_dir, "clay")
for outfit in preset["outfits"] + (["walking"] if walk else []):
    previews.dress(parts, preset, outfit)
    previews.sheet(name, preset["heightM"], preview_dir, outfit)
    previews.sheet(name, preset["heightM"], preview_dir, outfit, close=True)
previews.sheet(name, preset["heightM"], preview_dir, preset["outfits"][0], frame="face")
if walk:  # the hats on the hair, close (walking spec §7's gate)
    previews.dress(parts, preset, "walking")
    previews.sheet(name, preset["heightM"], preview_dir, "walking", frame="face")
print(f"built {name}: {sum(len(p.vertices) - 2 for p in body.data.polygons)} body triangles")
