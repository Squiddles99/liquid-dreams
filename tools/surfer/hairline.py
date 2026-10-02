"""The hairline (dune select spec §13.1): one curve round the head, shared by the painted scalp (face.py) and the hair's
roots (hair.py). Blender axes: -y the front, +z up.

Measured as the angle round the head's centre in the horizontal plane (0° the middle of the forehead, 180° the nape) and
a height above the eyes. It sits well above the brows at the forehead, recedes a little at the temple corners, comes
down the temple into a short sideburn in front of the ear, rises over the ear and falls behind it to the nape. The old
rule stepped from the forehead's height to one flat line at the brows along the sides, which showed as a straight cut
across the side hair.
"""
import math


def angle(co, centre):
    """Degrees round the head from the middle of the forehead (0) to the nape (180), either side."""
    return math.degrees(math.atan2(abs(co.x - centre.x), -(co.y - centre.y)))


def knots(ear_angle, ear_top_dz):
    """(angle°, height above the eyes m), forehead to nape. `ear_top_dz`: the top of the ear above the eyes. The temple's
    knots sit at fixed fractions of the way from 40° to the sideburn, so a head whose ears sit further forward keeps
    them in order; spaced so no 5° drops much more than a centimetre (a steep drop reads as a cut)."""
    burn = ear_angle - 22.0
    temple = lambda f: 40.0 + f * (burn - 40.0)
    return [
        (0.0, 0.065),
        (25.0, 0.062),
        (40.0, 0.055),
        (temple(0.4), 0.044),
        (temple(0.75), 0.030),
        (burn, 0.010),
        (ear_angle - 16.0, 0.004),  # the sideburn's foot, in front of the ear
        (ear_angle - 10.0, 0.014),
        (ear_angle, ear_top_dz + 0.008),  # over the ear
        (ear_angle + 18.0, ear_top_dz),
        (ear_angle + 38.0, -0.045),
        (180.0, -0.088),  # the nape, about 9 cm under the eyes (5 cm left the back of the neck bare under braids)
    ]


def height(a, ks):
    """The hairline's height above the eyes at angle `a`: straight between the knots (a cosine blend between them made
    each knot a short flat and each middle twice as steep; the painted scalp's 1.5 cm ramp softens the corners)."""
    if a <= ks[0][0]:
        return ks[0][1]
    for (a0, z0), (a1, z1) in zip(ks, ks[1:]):
        if a <= a1:
            return z0 + (z1 - z0) * (a - a0) / (a1 - a0)
    return ks[-1][1]


def line_z(co, centre, eye_z, ear_angle=95.0, ear_top_dz=0.023):
    """The hairline's height (Blender z) above the point `co`'s place round the head."""
    return eye_z + height(angle(co, centre), knots(ear_angle, ear_top_dz))


def ear_params(L):
    """The ear's angle round the head and the ear's top above the eyes, from the landmarks (bodymap.landmarks)."""
    centre, ear = L["head_centre"], L["ears"]["l"]
    return angle(ear, centre), (ear.z + 0.028) - L["eye_z"]


def stats(roots, centre, eye_z, ear_angle, inset=0.0):
    """The check for the manifest: the sideburn, the lowest root in front of the ear less the roots' inset (so the painted
    hairline that shows), above the eyes (cm). The old rule stopped the side hair flat at 2.5 cm above the eyes."""
    side = [co.z - eye_z - inset for co in roots if ear_angle - 32 <= angle(co, centre) <= ear_angle - 10]
    return {"sideburnAboveEyeCm": round(100 * min(side or [9.0]), 2)}
