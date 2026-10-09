"""Likeness fit, step 2 (hero spec §3.3): MPFB target weights that put the model's marks on the painting's.

py -3.11 tools/hero/fit_solve.py <build dir> <ref.json> <model_marks.json> <out preset.json> [--base-preset p.json]

Two bounded least-squares solves (scipy): the body first (macros + body targets, a front camera of scale + offset),
then the face on the fitted body (face targets, a similarity camera of its own, so the painting's head size does not
leak into the body). Residuals are in % of body height (body) and % of inter-ocular distance (face), each mark scaled by
its trust; a pull toward zero stands in for the depth one front view can't see. Writes the new preset and
`fit_report.json` (per-mark errors before and after).
"""
import json
import os
import sys

import numpy as np
from scipy.optimize import least_squares

build, ref_path, mm_path, out_path = sys.argv[1:5]
base_preset = sys.argv[sys.argv.index("--base-preset") + 1] if "--base-preset" in sys.argv else "tools/surfer/presets/female.json"
M = np.load(os.path.join(build, "fit_model.npz"))
cam = json.load(open(os.path.join(build, "marks_cam.json")))
ref = json.load(open(ref_path))["marks"]
ref_sole = 3225.0  # the skin sole: the thong's bottom (3255) less its ~1.5 cm sole
mm = json.load(open(mm_path))
base, D, names = M["base"].astype(np.float64), M["deltas"].astype(np.float64), [str(n) for n in M["names"]]
body = M["body"]
bidx = np.nonzero(body)[0]
joints = {k[1:]: M[k] for k in M.files if k.startswith("Jjoint-")}

FACE_PREFIX = ("xp:", "eye", "eyebrows", "nose", "mouth", "chin", "forehead", "head", "cheek")
# Left out after Gate 1a round 1's side views: the mouth-width targets slide the corners straight out instead of round
# the face (a muzzle), and head-fat/head-age hollow the cheeks; the painting's wide mouth is its smile (xp:smile).
EXCLUDE = {"mouth-scale-horiz-incr", "mouth-scale-horiz-decr", "mouth-upperlip-width-incr", "mouth-upperlip-width-decr",
           "mouth-lowerlip-width-incr", "mouth-lowerlip-width-decr", "head-fat-incr", "head-fat-decr", "head-age-incr", "head-age-decr",
           # Round 2: with the jaw silhouettes (beside hair, unsure) dropped, the outline stays MPFB's; these only
           # chased it (cheek volume puffed the cheeks out).
           "cheek-volume-incr", "cheek-volume-decr", "cheek-inner-incr", "cheek-inner-decr", "head-scale-horiz-incr",
           "head-scale-horiz-decr", "head-round", "head-square", "head-diamond", "head-rectangular", "chin-bones-incr", "chin-bones-decr"}
# Round 5: the jaw silhouettes back (the face's scale is now fixed), answered only by the jaw's own shape targets
# (chin width, the oval/triangular head) so the lower face narrows to the painting's V.
face_vars = [i for i, n in enumerate(names) if n.startswith(FACE_PREFIX) and n not in EXCLUDE]
body_vars = [i for i, n in enumerate(names) if not n.startswith(FACE_PREFIX) and n not in EXCLUDE]


def mesh(a):
    return base + np.tensordot(a, D, axes=1)


def jc(P, name):
    return P[joints[name]].mean(0)


# Body-part labels: each body vertex to its nearest bone segment between MPFB joint centroids.
SEGS = {
    "head": [("joint-neck", "joint-head"), ("joint-head", "joint-head-2")],
    "torso": [("joint-pelvis", "joint-spine-3"), ("joint-spine-3", "joint-spine-2"), ("joint-spine-2", "joint-spine-1"),
              ("joint-spine-1", "joint-neck"), ("joint-neck", "joint-l-clavicle"), ("joint-neck", "joint-r-clavicle"),
              ("joint-pelvis", "joint-l-upper-leg"), ("joint-pelvis", "joint-r-upper-leg")],
    "armR": [("joint-r-clavicle", "joint-r-shoulder"), ("joint-r-shoulder", "joint-r-elbow"), ("joint-r-elbow", "joint-r-hand")],
    "armL": [("joint-l-clavicle", "joint-l-shoulder"), ("joint-l-shoulder", "joint-l-elbow"), ("joint-l-elbow", "joint-l-hand")],
    "legR": [("joint-r-upper-leg", "joint-r-knee"), ("joint-r-knee", "joint-r-ankle"), ("joint-r-ankle", "joint-r-foot-1")],
    "legL": [("joint-l-upper-leg", "joint-l-knee"), ("joint-l-knee", "joint-l-ankle"), ("joint-l-ankle", "joint-l-foot-1")],
}


def labels(P):
    V = P[bidx]
    best, lab = np.full(len(V), np.inf), np.empty(len(V), object)
    for region, segs in SEGS.items():
        for a, b in segs:
            A, B = jc(P, a), jc(P, b)
            AB = B - A
            t = np.clip(((V - A) @ AB) / (AB @ AB), 0, 1)
            d = np.linalg.norm(V - (A + t[:, None] * AB), axis=1)
            m = d < best
            best[m], lab[m] = d[m], region
    return lab


LAB = labels(base)
NECK_Z = jc(base, "joint-neck")[2]
REGION = {
    "head": (LAB == "head"),
    "neck": (LAB == "head") | (LAB == "torso"),
    "torso": (LAB == "torso"),
    "shoulder": (LAB == "torso") | (LAB == "armR") | (LAB == "armL"),
    "legR": (LAB == "legR"), "legL": (LAB == "legL"),
}


def resolve_px(shot, u, v):
    c = cam[shot]
    x, z = (u - c["w"] / 2) / c["ppm"] + c["cx"], c["cz"] - (v - c["h"] / 2) / c["ppm"]
    V = base[bidx]
    d = np.hypot(V[:, 0] - x, V[:, 2] - z)
    near = np.nonzero(d < 2.5 / c["ppm"])[0]
    if len(near) == 0:
        near = np.argsort(d)[:5]
    return int(bidx[near[np.argmin(V[near, 1])]])  # the front-most (-y faces the camera)


eyes = M["eyes"]
eye_R = eyes[base[eyes, 0] < 0]
eye_L = eyes[base[eyes, 0] > 0]


MARK_IDS = {}


def point_fn(spec, name=None):
    if "px" in spec:
        vi = resolve_px(*spec["px"])
        MARK_IDS[name] = vi
        return lambda P: P[vi]
    if "eye" in spec:
        ix = eye_R if spec["eye"] == "R" else eye_L
        return lambda P: P[ix].mean(0)
    if "joint" in spec:
        return lambda P: jc(P, spec["joint"])
    if spec.get("extent") == "min":
        return lambda P: P[bidx][np.argmin(P[bidx, 2])]
    raise ValueError(spec)


def sil_x(P, region, side, z, band):
    m = REGION[region] & (np.abs(P[bidx, 2] - z) < band)
    xs = P[bidx][m, 0]
    if len(xs) == 0:
        return np.nan
    return xs.min() if side == "R" else xs.max()


def camera_xy(c, X, Z):
    """Model (x, z) → painting pixels. c = (s, tx, ty[, theta]); +x (her left) is the painting's +x; +z is up."""
    s, tx, ty = c[:3]
    th = c[3] if len(c) > 3 else 0.0
    cs, sn = np.cos(th), np.sin(th)
    return tx + s * (cs * X - sn * Z), ty - s * (sn * X + cs * Z)


def camera_z(c, y, X=0.0):
    """The model height of a painting row (inverse of camera_xy at x = X, small theta)."""
    s, tx, ty = c[:3]
    th = c[3] if len(c) > 3 else 0.0
    return ((ty - y) / s - np.sin(th) * X) / np.cos(th)


def build_residuals(group, unit, ref_marks):
    specs = mm[group]
    fns = {}
    for name, spec in specs.items():
        if "sil" in spec or "silw" in spec:
            continue
        fns[name] = point_fn(spec, name)
    band = 0.004

    def res(c, P, report=None):
        out = []
        for name, spec in specs.items():
            if name == "sole":
                py_, w = ref_sole, 1.0
                px_ = None
            else:
                px_, py_, w = ref_marks[name]
            fit = spec["fit"]
            if "sil" in spec:
                region, side = spec["sil"]
                z = camera_z(c, py_)
                x = sil_x(P, region, side, z, band)
                u, _ = camera_xy(c, x, z)
                e = [(u - px_) / unit * w]
            elif "silw" in spec:
                region, inner = spec["silw"]
                ipx = ref_marks[inner][0]
                z = camera_z(c, py_)
                m = REGION[region] & (np.abs(P[bidx, 2] - z) < band)
                xs = P[bidx][m, 0]
                width = (xs.max() - xs.min()) * c[0] if len(xs) else 0.0
                e = [(width - abs(px_ - ipx)) / unit * w]
            else:
                p = fns[name](P)
                u, v = camera_xy(c, p[0], p[2])
                e = []
                if fit in ("xy", "x"):
                    e.append((u - px_) / unit * w)
                if fit in ("xy", "y"):
                    e.append((v - py_) / unit * w)
            if report is not None:
                report[name] = float(np.sqrt(np.mean(np.square(e))) / max(w, 1e-6))
            out += e
        return np.nan_to_num(np.array(out), nan=50.0)
    return res


def solve(group, vars_, a0, cam0, unit, lam, bounds_fn, fix_scale=False):
    res = build_residuals(group, unit, ref)
    nc = len(cam0)

    def f(x):
        c, w = x[:nc], x[nc:]
        a = a0.copy()
        a[vars_] = w
        return np.concatenate([res(c, mesh(a)), lam * w])
    clo, chi = [-np.inf] * nc, [np.inf] * nc
    if fix_scale:  # the camera's scale held (within 0.1 %): it is set by the face's height, not traded for shape
        clo[0], chi[0] = cam0[0] * 0.999, cam0[0] * 1.001
    lo = np.array(clo + [bounds_fn(names[i])[0] for i in vars_])
    hi = np.array(chi + [bounds_fn(names[i])[1] for i in vars_])
    x0 = np.concatenate([cam0, np.zeros(len(vars_))])
    before = {}
    res(cam0, mesh(a0), before)
    # The camera first, shape held at zero: a sound start for the joint solve.
    rc = least_squares(lambda c: res(c, mesh(a0)), cam0, bounds=(clo, chi), x_scale="jac")
    x0[:nc] = rc.x
    r = least_squares(f, x0, bounds=(lo, hi), diff_step=1e-3, x_scale="jac", max_nfev=200, verbose=1)
    a = a0.copy()
    a[vars_] = r.x[nc:]
    after = {}
    res(r.x[:nc], mesh(a), after)
    return a, r.x[:nc], before, after


_have = json.load(open(base_preset, encoding="utf-8")).get("face", {})


def bounds(n):
    """Macros +-0.25 units; a target up to what keeps its total weight (the preset's + the fit's) at 1."""
    if n.startswith("macro:"):
        return (-0.25, 0.25)
    room = 1.0 - max(_have.get(n, 0.0), _have.get(f"l-{n}", 0.0))
    return (0.0, max(room, 1e-3))


a = np.zeros(len(names))
# Body: painting px per model unit ≈ (sole − crown of skull) / model height; ty puts the soles on the sole row.
P0 = base[bidx]
h_model = P0[:, 2].max() - P0[:, 2].min()
s0 = (ref_sole - 90.0) / h_model
cam_b0 = np.array([s0, 2975.0, ref_sole + s0 * P0[:, 2].min()])
H = ref_sole - 90.0
a, cam_b, bb, ba = solve("body", body_vars, a, cam_b0, H / 100.0, 3.0, bounds)
iod = ref["iris_L"][0] - ref["iris_R"][0]
P1 = mesh(a)
eyez = P1[eyes, 2].mean()
iod_m = P1[eye_L].mean(0)[0] - P1[eye_R].mean(0)[0]
# The face's scale from its height (eye line to chin), so feature widths are judged against it (round 3: a free scale
# traded eye spacing for size).
chin_v = resolve_px(*mm["face"]["chin"]["px"])
sf = (ref["chin"][1] - (ref["iris_L"][1] + ref["iris_R"][1]) / 2) / (eyez - P1[chin_v, 2])
cam_f0 = np.array([sf, (ref["iris_L"][0] + ref["iris_R"][0]) / 2, (ref["iris_L"][1] + ref["iris_R"][1]) / 2 + sf * eyez, 0.0])
a, cam_f, fb, fa = solve("face", face_vars, a, cam_f0, iod / 100.0, 4.0, bounds, fix_scale=True)

preset = json.load(open(base_preset, encoding="utf-8"))
face = dict(preset.get("face", {}))
macro = dict(preset["macro"])
chosen = {}
for i, n in enumerate(names):
    w = float(a[i])
    if abs(w) < 0.02:
        continue
    chosen[n] = round(w, 3)
    if n.startswith("xp:"):
        continue  # a pose of the painting's face (its smile), not her shape
    if n.startswith("macro:"):
        macro[n[6:]] = round(macro[n[6:]] + w, 4)
        continue
    for t in ([f"l-{n}", f"r-{n}"] if n.split("-")[0] in ("eye", "cheek", "upperarm", "lowerarm", "upperleg", "lowerleg", "leg") else [n]):
        face[t] = round(face.get(t, 0.0) + w, 3)
for k, v in json.load(open(ref_path)).get("overrides", {}).get("macro", {}).items():
    macro[k] = v
preset["macro"], preset["face"] = macro, face
# The painting's own expression, for the gate renders (the shape stays at rest).
# (the fit's own smile read-out goes to the report; the renders use the authored smileSoft, body.face_keys)
preset["paintedExpression"] = {"smileSoft": 1.0, "squint": 0.2}
preset["faceCamera"] = [float(x) for x in cam_f]  # model → painting px, for the face projection (project.py)
preset["restExpression"] = {"blinkL": 0.1, "blinkR": 0.1}  # relaxed lids: MPFB's open eyes stare
json.dump(preset, open(out_path, "w", encoding="utf-8"), indent=2)
report = {"chosen": chosen, "camBody": cam_b.tolist(), "camFace": cam_f.tolist(),
          "bodyPctHeight": {"before": bb, "after": ba}, "facePctIOD": {"before": fb, "after": fa},
          "faceMeanPctIOD": {"before": float(np.mean(list(fb.values()))), "after": float(np.mean(list(fa.values())))},
          "bodyMeanPctHeight": {"before": float(np.mean(list(bb.values()))), "after": float(np.mean(list(ba.values())))}}
json.dump(report, open(os.path.join(build, "fit_report.json"), "w"), indent=1)
# The marks' base-mesh vertex ids (body vertices keep their index through the helper deletion), for the hero build.
json.dump(MARK_IDS, open(os.path.join(os.path.dirname(out_path), os.path.basename(out_path).replace(".json", ".marks.json")), "w"), indent=1)
print(json.dumps({k: report[k] for k in ("chosen", "faceMeanPctIOD", "bodyMeanPctHeight")}, indent=1))
