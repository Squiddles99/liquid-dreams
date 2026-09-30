"""Grommet's pimples (grommet spec §5): seeded spots on the forehead, chin and beside the nose, written to the manifest
for the game's skin shader. Blender axes: +x the character's left, -y the front, +z up."""
import random


def pimples(body, coords, L, seed):
    rng = random.Random(seed)
    eye_z, mouth = L["eye_z"], L["mouth"]
    front_y = min(p.y for p in L["eyes"].values() if p is not None)
    lash = body.data.attributes.get("lash")
    head = [v for v, (b, _) in zip(body.data.vertices, coords) if b == "head" and v.co.y < front_y + 0.01 and v.normal.y < -0.4
            and (lash is None or lash.data[v.index].value <= 0)]
    zones = [
        (3, lambda c: eye_z + 0.025 < c.z < eye_z + 0.06 and abs(c.x) < 0.035),                              # forehead
        (2, lambda c: mouth.z - 0.04 < c.z < mouth.z - 0.015 and abs(c.x) < 0.02),                             # chin
        (1, lambda c: eye_z - 0.04 < c.z < eye_z - 0.02 and 0.012 < abs(c.x) < 0.02),                          # beside the nose
        (2, lambda c: eye_z - 0.035 < c.z < eye_z - 0.01 and 0.025 < abs(c.x) < 0.045),                        # cheeks
    ]
    out = []
    for n, inside in zones:
        pool = [v for v in head if inside(v.co)]
        if len(pool) < n:
            raise SystemExit(f"only {len(pool)} face vertices in a pimple zone; check the landmarks")
        for v in rng.sample(pool, n):
            out.append((v.co + v.normal * 0.0005, rng.uniform(0.0015, 0.0025)))
    return out
