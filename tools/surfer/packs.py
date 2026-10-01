"""The crew's packs (walking spec §2, §3): Shazza's canvas rucksack with a rolled towel, T-Bone's worn surf pack with a
wetsuit hanging off it, Grommet's stuffed school bag with his fins clipped on. Rounded boxes on the back over the tee,
straps over the shoulders to the front of the chest and back round under the arms; skinned to spine_03 (the straps over
the shoulders shared with the clavicles). Blender axes: +x the character's left, -y the front, +z up."""
import math

import bmesh
import bpy
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

import geom

# Width, height, depth (m), and how the pack is dressed (tuned at the gate).
STYLES = {
    "rucksack": {"size": (0.30, 0.42, 0.16), "flap": True, "pocket": False, "bulge": 0.008},
    "surf": {"size": (0.32, 0.48, 0.18), "flap": False, "pocket": False, "bulge": 0.006, "compression": True},
    "school": {"size": (0.30, 0.38, 0.22), "flap": False, "pocket": True, "bulge": 0.025},
}
STRAP_W, STRAP_T = 0.04, 0.006


def _mats(obj, names):
    obj.data.materials.clear()
    for n in names:
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        m.use_nodes = True
        obj.data.materials.append(m)


def _box(bm, centre, size, bevel, mat=0, segments=3):
    """A rounded box (bevelled cube) at centre, sized (x, y, z), its faces given material `mat`; returns its verts."""
    before = set(bm.verts)
    made = bmesh.ops.create_cube(bm, size=1.0)
    for v in made["verts"]:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + centre
    faces = list({f for v in made["verts"] for f in v.link_faces})
    edges = list({e for f in faces for e in f.edges})
    bmesh.ops.bevel(bm, geom=edges + made["verts"], offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    new = [v for v in bm.verts if v not in before]
    for f in {f for v in new for f in v.link_faces}:
        f.material_index = mat
    return new


def _clear_tree(objs):
    verts, polys = [], []
    for o in objs:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[i + base for i in p.vertices] for p in o.data.polygons if not (o.name.endswith("_body") and p.material_index != 0)]
    return BVHTree.FromPolygons(verts, polys)


def _back(tree, x, z):
    """The back of the body or tee at (x, z): a ray in from behind (+y)."""
    hit, _, _, _ = tree.ray_cast(Vector((x, 1.0, z)), Vector((0, -1, 0)), 2.0)
    if hit is None:
        raise SystemExit(f"no back surface at x {x:.2f}, z {z:.2f}")
    return hit


def _catmull(pts, per=6):
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for k in range(per):
            t = k / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return out


def build(body, rig, wear, H, style_name, name):
    """The pack for `style_name` over `wear` (the body and the tee): one object with the bag ("pack") and its straps,
    zips and buckles ("packTrim"); returns it and the bag's box (centre, size) for the details."""
    st = STYLES[style_name]
    w, h, d = st["size"]
    tree = _clear_tree([body, *wear])
    spine = rig.data.bones["spine_03"].head_local
    top = 0.8 * H
    zc = top - h / 2
    back_y = max(_back(tree, x, z).y for x in (-0.08, 0.0, 0.08) for z in (zc - h / 3, zc, zc + h / 3))
    centre = Vector((0.0, back_y + d / 2 + 0.012, zc))
    bm = bmesh.new()
    bag = _box(bm, centre, (w, d, h), 0.035)
    # Filled out: the outer face bulges (a stuffed school bag most), the face to the back stays flat.
    for v in bag:
        if v.co.y > centre.y:
            u, t = (v.co.x - centre.x) / (w / 2), (v.co.z - centre.z) / (h / 2)
            v.co.y += st["bulge"] * max(0.0, 1 - u * u) * max(0.0, 1 - t * t) * (v.co.y - centre.y) / (d / 2)
        v.co += Vector((0, 0.002, 0.002)) * noise.noise(v.co * 18.0)
    trims = []
    if st.get("flap"):  # the rucksack's top flap folding over the outer face, a buckle at its tip
        _box(bm, centre + Vector((0, 0.008, h / 2 + 0.004)), (w + 0.012, d + 0.016, 0.014), 0.006)
        _box(bm, centre + Vector((0, d / 2 + 0.01, h / 2 - 0.06)), (w * 0.7, 0.012, 0.13), 0.005)
        trims.append(_box(bm, centre + Vector((0, d / 2 + 0.018, h / 2 - 0.13)), (0.04, 0.01, 0.03), 0.003, mat=1, segments=1))
    if st.get("pocket"):  # the school bag's front pocket, its zip
        _box(bm, centre + Vector((0, d / 2 + st["bulge"] + 0.02, -h * 0.2)), (w * 0.75, 0.05, h * 0.42), 0.015)
        trims.append(_box(bm, centre + Vector((0, d / 2 + st["bulge"] + 0.046, -h * 0.2 + h * 0.21)), (w * 0.7, 0.006, 0.008), 0.002, mat=1, segments=1))
    if st.get("compression"):  # the surf pack's side compression straps
        for s in (1, -1):
            for zz in (-h / 4, h / 4):
                trims.append(_box(bm, centre + Vector((s * (w / 2 + 0.004), 0, zz)), (0.008, d * 0.9, 0.025), 0.002, mat=1, segments=1))
    # The shoulder straps: from the bag's top inner corners over the shoulders, down the front of the chest, back under
    # the arms to its bottom corners; kept 1 cm off the body and the tee.
    neck = rig.data.bones["neck"].head_local
    for s in (1, -1):
        shoulder_hit, _, _, _ = tree.ray_cast(Vector((s * 0.085, neck.y + 0.01, 2.5)), Vector((0, 0, -1)), 3.0)
        if shoulder_hit is None:
            raise SystemExit("no shoulder under the strap")
        guess = [
            centre + Vector((s * 0.07, -d / 2 + 0.01, h / 2 - 0.03)),
            shoulder_hit + Vector((0, 0.03, 0.01)),
            shoulder_hit + Vector((s * 0.01, -0.06, -0.02)),
            Vector((s * 0.1, spine.y - 0.12, 0.74 * H)),
            Vector((s * 0.12, spine.y - 0.1, 0.67 * H)),
            Vector((s * 0.15, spine.y, 0.64 * H)),
            centre + Vector((s * (w / 2 - 0.02), -d / 2 + 0.01, -h / 2 + 0.03)),
        ]
        pts = [geom.push_out(tree, p, 0.01 + STRAP_T) for p in _catmull(guess)]
        trims.append(geom.tube(bm, pts, STRAP_W / 2, False, sides=8, flat=STRAP_T / STRAP_W))
    trim = set().union(*map(set, trims))
    for f in bm.faces:
        if any(v in trim for v in f.verts):
            f.material_index = 1
    me = bpy.data.meshes.new(f"{name}_pack")
    obj = bpy.data.objects.new(f"{name}_pack", me)
    bpy.context.scene.collection.objects.link(obj)
    _mats(obj, ["pack", "packTrim"])  # before the faces: clearing a mesh's materials resets their indices
    bm.to_mesh(me)
    bm.free()
    _skin(obj, rig, back_y)
    return obj, (centre, (w, h, d))


def _skin(obj, rig, back_y=None):
    """spine_03; with `back_y`, what lies over the shoulders (in front of the bag's face to the back, up at the
    clavicles) shared half with that side's clavicle."""
    gs = obj.vertex_groups.new(name="spine_03")
    gl, gr = obj.vertex_groups.new(name="clavicle_l"), obj.vertex_groups.new(name="clavicle_r")
    clav = rig.data.bones["clavicle_l"].head_local.z
    for v in obj.data.vertices:
        shoulder = back_y is not None and abs(v.co.x) > 0.06 and v.co.y < back_y
        over = 0.5 * max(0.0, min(1.0, (v.co.z - (clav - 0.03)) / 0.04)) if shoulder else 0.0
        gs.add([v.index], 1.0 - over, "REPLACE")
        if over > 0:
            (gl if v.co.x > 0 else gr).add([v.index], over, "REPLACE")
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    obj.parent = rig


def _detail(rig, H, name, suffix, material, build):
    bm = bmesh.new()
    build(bm)
    me = bpy.data.meshes.new(f"{name}_{suffix}")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(f"{name}_{suffix}", me)
    bpy.context.scene.collection.objects.link(obj)
    _mats(obj, [material])
    _skin(obj, rig)
    return obj


def _cylinder(bm, centre, axis, radius, length, segments=20, rings=8, flat=1.0):
    """A closed cylinder along `axis`, its section squashed by `flat` across."""
    a = axis.normalized()
    path = [centre + a * length * (k / rings - 0.5) for k in range(rings + 1)]
    return geom.tube(bm, path, radius, False, sides=segments, flat=flat)


def towel(rig, H, box, name):
    """Shazza's rolled towel strapped under the rucksack (walking spec §2): COLOR_0.r stripes for the shader."""
    centre, (w, h, d) = box
    obj = _detail(rig, H, name, "towel", "towel", lambda bm: _cylinder(bm, centre + Vector((0, 0.01, -h / 2 - 0.058)), Vector((1, 0, 0)), 0.06, 0.34))
    col = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for i, v in enumerate(obj.data.vertices):
        stripe = 1.0 if math.sin(v.co.x * 2 * math.pi / 0.06) > 0.2 else 0.0
        col.data[i].color = (stripe, 1.0, 1.0, 1.0)
    obj.data.color_attributes.active_color = col
    return obj


def wetsuit(rig, H, box, wear_tree, name):
    """T-Bone's wetsuit (walking spec §2): rolled on top of his pack, one sleeve hanging down its right side through the
    strap to his hip."""
    centre, (w, h, d) = box

    def build(bm):
        _cylinder(bm, centre + Vector((0, 0.005, h / 2 + 0.065)), Vector((1, 0, 0)), 0.068, 0.30)
        start = centre + Vector((-0.13, 0.0, h / 2 + 0.05))
        guess = [start, centre + Vector((-w / 2 - 0.03, -0.02, h / 4)), centre + Vector((-w / 2 - 0.04, -d / 2, -h / 4)),
                 centre + Vector((-w / 2 - 0.05, -d / 2 - 0.03, -h / 2 - 0.12))]
        pts = [geom.push_out(wear_tree, p, 0.04) for p in _catmull(guess)]
        geom.tube(bm, pts, 0.04, False, sides=12, flat=0.45)
    return _detail(rig, H, name, "wetsuit", "neoprene", build)


def fins(rig, H, box, name):
    """Grommet's swim fins (walking spec §2): two, clipped flat to his school bag's right side, blades down."""
    centre, (w, h, d) = box

    def build(bm):
        for k, off in enumerate((0.012, 0.028)):
            x = centre.x - w / 2 - off
            base = centre + Vector((0, 0, h / 2 - 0.05))
            x0 = x - centre.x
            # The blade: a tapered slab 45 cm long, 20 cm wide at the tip, 12 at the pocket; down the bag's side.
            pts = [base + Vector((x0, 0.0, -0.45 * t)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)]
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                wa, wb = 0.06 + 0.04 * (i / 4), 0.06 + 0.04 * ((i + 1) / 4)
                quad = [bm.verts.new(a + Vector((0, -wa, 0))), bm.verts.new(a + Vector((0, wa, 0))),
                        bm.verts.new(b + Vector((0, wb, 0))), bm.verts.new(b + Vector((0, -wb, 0)))]
                bm.faces.new(quad)
            _cylinder(bm, base + Vector((x0 - 0.02, 0, -0.04)), Vector((0, 0, 1)), 0.035, 0.12, segments=12, rings=3, flat=0.6)
        bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.01)
    return _detail(rig, H, name, "fins", "fins", build)
