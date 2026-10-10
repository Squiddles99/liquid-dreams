"""Start frames for Andrew's next ChatGPT reference sequences (session 2, 2026-10-10: he asked for all seven).
Rendered grey and side-on with `--mannequin`; each is the first frame of a sequence he generates image-to-image.
Prone poses are authored in the world (board along y, nose at -y); standing ones in her standing frame (+x her left,
-y her front, +z up; regular stance, left foot to the nose at +x).
"""
from rigging import POSES, _n
from sequences import _PRONE_LEGS

_PRONE = {"prone": True}
_STAND_FLAT = {"flat": {"foot_l": 20.0, "foot_r": -15.0}, "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]}

START = {
    # 1. Lying on the board between sets, not paddling: propped on her forearms (elbows under the shoulders), head up
    # watching the horizon for the next set, legs long.
    "proneWaiting": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -1, 0.04), "spine_01": _n(0, -1, 0.12), "spine_02": _n(0, -0.95, 0.3), "spine_03": _n(0, -0.88, 0.47),
        "neck": _n(0, -0.55, 0.83), "head": _n(0, -0.12, 1),
        "upperarm_l": _n(0.1, -0.25, -1), "forearm_l": _n(0.06, -1, -0.04), "hand_l": _n(0.02, -1, -0.08),
        "upperarm_r": _n(-0.1, -0.25, -1), "forearm_r": _n(-0.06, -1, -0.04), "hand_r": _n(-0.02, -1, -0.08), **_PRONE_LEGS},
        "floor": ["forearm_l", "forearm_r", "pelvis", "thigh_l", "thigh_r"], "level": (["forearm_l", "forearm_r"], ["thigh_l", "thigh_r"]),
        "levelRange": (-25, 25), "nose": ["hand_l", "hand_r"], "tail": ["thigh_l", "thigh_r"], "noseGap": 0.4, **_PRONE},
    # 2. Whitewater coming: chest down flat on the deck, hands gripping both rails beside the chest, elbows up, head low,
    # ready to roll the board over on top of her.
    "turtleRoll": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -1, 0.0), "spine_01": _n(0, -1, 0.04), "spine_02": _n(0, -1, 0.08), "spine_03": _n(0, -0.98, 0.16),
        "neck": _n(0, -0.85, 0.5), "head": _n(0, -0.55, 0.83),
        "upperarm_l": _n(0.45, 0.35, 0.45), "forearm_l": _n(-0.3, -0.3, -0.9), "hand_l": _n(-0.5, -0.2, -0.85),
        "upperarm_r": _n(-0.45, 0.35, 0.45), "forearm_r": _n(0.3, -0.3, -0.9), "hand_r": _n(0.5, -0.2, -0.85), **_PRONE_LEGS},
        "floor": ["spine_02", "spine_03", "pelvis", "thigh_l", "thigh_r"], "nose": ["spine_03"], "tail": ["thigh_l", "thigh_r"],
        "noseGap": 0.75, **_PRONE},
    # 3. Just back on top after a duck dive: lying flat, hands still on the rails ahead of the shoulders on near-straight
    # arms, head up shaking off the water, the right knee still bent up from pushing the tail under.
    "duckDiveSurface": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -1, 0.02), "spine_01": _n(0, -1, 0.08), "spine_02": _n(0, -0.97, 0.2), "spine_03": _n(0, -0.93, 0.35),
        "neck": _n(0, -0.7, 0.7), "head": _n(0, -0.3, 0.95),
        "upperarm_l": _n(0.25, -0.9, -0.35), "forearm_l": _n(0.15, -0.9, -0.4), "hand_l": _n(0.4, -0.6, -0.7),
        "upperarm_r": _n(-0.25, -0.9, -0.35), "forearm_r": _n(-0.15, -0.9, -0.4), "hand_r": _n(-0.4, -0.6, -0.7),
        "thigh_l": _PRONE_LEGS["thigh_l"], "shin_l": _PRONE_LEGS["shin_l"], "foot_l": _PRONE_LEGS["foot_l"],
        "thigh_r": _n(-0.08, 1, -0.05), "shin_r": _n(-0.04, 0.35, 0.94), "foot_r": _n(0, -0.2, 1)},
        "floor": ["spine_02", "pelvis", "thigh_l", "thigh_r"], "nose": ["hand_l", "hand_r"], "tail": ["thigh_l", "thigh_r"],
        "noseGap": 0.3, **_PRONE},
    # 4. A late take-off: the pop-up just done at the top of the wave, the board tipping nose-down into the drop; low,
    # front knee driven forward, chest over the front foot, both arms forward for balance, eyes down the face.
    "takeoffLate": {"turn": 0, "lift": None, "pitch": -16, "bones": {
        "spine_01": _n(0.25, -0.25, 1), "spine_02": _n(0.38, -0.35, 1), "spine_03": _n(0.45, -0.35, 1), "neck": _n(0.45, -0.15, 1), "head": _n(0.7, 0.0, 1),
        "upperarm_l": _n(1, -0.45, -0.35), "forearm_l": _n(1, -0.35, -0.05),
        "upperarm_r": _n(0.15, -1, -0.45), "forearm_r": _n(0.5, -1, -0.15),
        "thigh_l": _n(0.55, -0.55, -0.65), "shin_l": _n(0.05, 0.35, -0.95), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.3, -0.6, -0.75), "shin_r": _n(0.15, 0.55, -0.85), "foot_r": _n(-0.25, -1, -0.05)}, **_STAND_FLAT},
    # 5. Setting up a cutback: riding, then the head and shoulders turning back toward the tail (the curl), the back arm
    # reaching back, the front arm coming across the body, weight settling onto the back foot, knees bent.
    "cutbackSetup": {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(-0.08, 0.05, 1), "spine_02": _n(-0.1, 0.02, 1), "spine_03": _n(-0.1, 0.0, 1), "neck": _n(-0.1, -0.05, 1), "head": _n(-0.2, 0.0, 1),
        "upperarm_l": _n(-0.1, -1, -0.45), "forearm_l": _n(-0.6, -0.8, -0.15),
        "upperarm_r": _n(-1, 0.15, -0.5), "forearm_r": _n(-1, 0.25, -0.3),
        "thigh_l": _n(0.35, -0.5, -0.8), "shin_l": _n(0.15, 0.4, -0.9), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.3, -0.6, -0.75), "shin_r": _n(-0.05, 0.5, -0.9), "foot_r": _n(-0.25, -1, -0.05)},
        "twist": {"spine_02": -15, "spine_03": -20, "neck": -15, "head": -40}, **_STAND_FLAT},
    # 6. The end of a ride: standing tall and relaxed, knees soft, weight going onto the back foot so the nose starts to
    # lift (board slightly nose-up), arms loose, about to kick the board out over the back of the wave.
    "kickout": {"turn": 0, "lift": None, "pitch": 7, "bones": {
        "spine_01": _n(-0.08, 0.0, 1), "spine_02": _n(-0.1, 0.0, 1), "spine_03": _n(-0.1, -0.02, 1), "neck": _n(-0.05, -0.08, 1), "head": _n(0.1, 0.0, 1),
        "upperarm_l": _n(0.5, -0.3, -0.9), "forearm_l": _n(0.5, -0.6, -0.5),
        "upperarm_r": _n(-0.4, -0.1, -1), "forearm_r": _n(-0.4, -0.45, -0.8),
        "thigh_l": _n(0.3, -0.2, -0.95), "shin_l": _n(0.1, 0.15, -1), "foot_l": _n(0.35, -1, -0.05),
        "thigh_r": _n(-0.25, -0.25, -0.95), "shin_r": _n(-0.05, 0.2, -1), "foot_r": _n(-0.25, -1, -0.05)}, **_STAND_FLAT},
    # 7. On the sand, the board on its rail under her right arm (deck against her hip, nose forward, the hand cupping the
    # bottom rail), standing upright, about to walk to the water.
    "walkBoard": {"turn": 0, "lift": None, "carry": True, "camYaw": 90, "bones": {
        "spine_01": _n(0.03, -0.02, 1), "spine_02": _n(0.06, -0.04, 1), "spine_03": _n(0.06, -0.03, 1), "neck": _n(0.03, -0.1, 1), "head": _n(0.0, 0.0, 1),
        "upperarm_l": _n(0.15, 0.05, -1), "forearm_l": _n(0.1, -0.15, -1),
        "upperarm_r": _n(-0.4, -0.05, -1), "forearm_r": _n(0.15, -0.35, -0.95), "hand_r": _n(0.45, -0.3, -0.85),
        "thigh_l": _n(0.03, 0.0, -1), "shin_l": _n(0.0, 0.05, -1),
        "thigh_r": _n(-0.03, 0.0, -1), "shin_r": _n(0.0, 0.05, -1)},
        "flat": {"foot_l": 8.0, "foot_r": -8.0}, "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]},
}
POSES.update(START)

# prone-turn-and-paddle (from the proneWaiting start frame above; Andrew's sheet, 8 frames, fixed side-on camera; session 3): 1 propped on her forearms
# watching the horizon (proneWaiting); 2 chest down on the deck, an arm in the water each side; 3-6 the right arm pulls
# back while the left pushes forward, spinning the board to her left (nose toward the camera at 90, away at 135);
# 7 turned 180, chest up, right arm reaching (the paddle cycle's pdl5); 8 paddling. Arms in the world frame (board along
# y, nose at -y, her left +x) before the turn (`spin`).
_PT_BODY = {**POSES["paddle"]}
_PT_DOWN = {"upperarm_l": _n(0.55, -0.1, -0.7), "forearm_l": _n(0.3, -0.3, -0.9),
            "upperarm_r": _n(-0.55, -0.1, -0.7), "forearm_r": _n(-0.3, -0.3, -0.9)}
# The sweep, hands just under the surface beside the rails: right arm forward starting its pull, left arm back starting
# its push (A); halfway through, swapped (B).
_PT_A = {"upperarm_r": _n(-0.45, -0.65, -0.55), "forearm_r": _n(-0.2, -0.75, -0.6),
         "upperarm_l": _n(0.45, 0.6, -0.55), "forearm_l": _n(0.2, 0.75, -0.6)}
_PT_B = {"upperarm_r": _n(-0.45, 0.6, -0.55), "forearm_r": _n(-0.2, 0.75, -0.6),
         "upperarm_l": _n(0.45, -0.65, -0.55), "forearm_l": _n(0.2, -0.75, -0.6)}
PT = {
    "pt1": {**POSES["proneWaiting"]},
    "pt2": {**_PT_BODY, "world": _PT_DOWN, "noseGap": 0.6},
    "pt3": {**_PT_BODY, "world": _PT_A, "noseGap": 0.6, "spin": 20},
    "pt4": {**_PT_BODY, "world": _PT_B, "noseGap": 0.6, "spin": 50},
    "pt5": {**_PT_BODY, "world": _PT_A, "noseGap": 0.6, "spin": 90},
    "pt6": {**_PT_BODY, "world": _PT_B, "noseGap": 0.6, "spin": 135},
    "pt7": {**POSES["pdl5"], "spin": 180},
    "pt8": {**POSES["pdl6"], "spin": 180},
}
POSES.update(PT)

# bail (Andrew's sheet, 8 frames, side-on; session 3; he ruled it replaces the turtle roll: "a massive wave breaks
# forcing her to push her board away from her and swim under the wave"): 1 paddling; 2 up on her hands; 3 shoves the
# board away ahead and slides off into the water; 4 dives head-first under, arms over her head, the board left at the
# surface on the leash; 5 swims along under the wave; 6 coming up, her right hand reaching back for the leg rope;
# 7 at the surface pulling the rope, the board coming back to her; 8 back on, paddling. World frame as the paddle
# (board along y, nose at -y, her left +x); `board` floats the board on its own (dx, dy from her pelvis, origin height,
# pitch), `offset` sinks her.
_STREAM = {  # streamlined: straight body, arms over the head, legs together, toes pointed
    "pelvis": _n(0, -1, 0.0), "spine_01": _n(0, -1, 0.0), "spine_02": _n(0, -1, 0.02), "spine_03": _n(0, -1, 0.03),
    "neck": _n(0, -1, 0.1), "head": _n(0, -1, 0.15),
    "upperarm_l": _n(0.08, -1, 0.12), "forearm_l": _n(0.04, -1, 0.06), "hand_l": _n(0.0, -1, 0.0),
    "upperarm_r": _n(-0.08, -1, 0.12), "forearm_r": _n(-0.04, -1, 0.06), "hand_r": _n(0.0, -1, 0.0),
    "thigh_l": _n(0.04, 1, 0.0), "shin_l": _n(0.02, 1, 0.0), "foot_l": _n(0, 1, -0.25),
    "thigh_r": _n(-0.04, 1, 0.0), "shin_r": _n(-0.02, 1, 0.0), "foot_r": _n(0, 1, -0.25)}
_SWIM = {"turn": 0, "bones": {}, "floor": ["pelvis", "spine_02", "thigh_l", "thigh_r"], "nose": ["spine_03"],
         "tail": ["thigh_l", "thigh_r"], "prone": True}
BL = {
    "bl1": dict(POSES["pdl1"]),
    "bl2": {**POSES["dd2"], "pitch": 0, "offset": (0, 0, 0)},
    "bl3": {**_SWIM, "offset": (0, 0, -0.3), "board": (0, -2.1, -0.02, 0), "world": {**_STREAM,
        "neck": _n(0, -0.9, 0.45), "head": _n(0, -0.45, 0.9),
        "upperarm_l": _n(0.15, -1, 0.05), "forearm_l": _n(0.1, -1, 0.05), "hand_l": _n(0.05, -1, -0.1),
        "upperarm_r": _n(-0.15, -1, 0.05), "forearm_r": _n(-0.1, -1, 0.05), "hand_r": _n(-0.05, -1, -0.1)}},
    "bl4": {**_SWIM, "pitch": -35, "offset": (0, 0, -0.75), "board": (0, -1.3, -0.02, 0), "world": _STREAM},
    "bl5": {**_SWIM, "offset": (0, 0, -1.2), "board": (0, -1.2, -0.02, 0), "world": _STREAM},
    "bl6": {**_SWIM, "pitch": 12, "offset": (0, 0, -0.7), "board": (0.15, -1.5, -0.02, 0), "world": {**_STREAM,
        "spine_02": _n(0, -1, 0.1), "spine_03": _n(0, -1, 0.15), "neck": _n(0, -0.85, 0.5), "head": _n(0, -0.4, 0.9),
        "upperarm_r": _n(-0.4, 0.6, -0.2), "forearm_r": _n(-0.15, 0.95, -0.2), "hand_r": _n(-0.05, 1, -0.2),
        "thigh_r": _n(-0.04, 1, -0.1), "shin_r": _n(-0.02, 0.6, 0.8), "foot_r": _n(0, 0.4, 0.9)}},
    "bl7": {**_SWIM, "pitch": 5, "offset": (0, 0, -0.28), "board": (0.4, -1.75, -0.02, 0), "world": {**_STREAM,
        "spine_02": _n(0, -1, 0.12), "spine_03": _n(0, -1, 0.18), "neck": _n(0, -0.8, 0.6), "head": _n(0, -0.35, 0.94),
        "upperarm_l": _n(0.25, -1, -0.1), "forearm_l": _n(0.15, -1, 0.0),
        "upperarm_r": _n(-0.45, 0.25, -0.5), "forearm_r": _n(-0.1, 0.95, 0.25), "hand_r": _n(0, 1, 0.1),
        "thigh_r": _n(-0.04, 1, 0.0), "shin_r": _n(-0.02, 0.45, 0.9), "foot_r": _n(0, 0.3, 0.95)}},
    "bl8": dict(POSES["pdl1"]),
}
POSES.update(BL)
