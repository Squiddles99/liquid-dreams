"""Key poses read off Andrew's ChatGPT reference sequences (reference/anim/, 2026-10-10), as rigging.POSES entries.

sit-to-paddle (8 keys): 1 sitting astride, hands on thighs; 2 looks back over her right shoulder at the set; 3 leans
back, turning, right hand planted behind, legs kicking the board round; 4 turned further, hands to the rails; 5 down onto
the board, chest up on straight arms; 6 lower, elbows bending; 7 paddling, right arm reaching; 8 paddling, left arm
reaching. The reference's camera moved between frames, so these are read by eye as poses, not measured.
Standing-frame aims in "bones" (+x her left, -y her front, +z up); world aims in "world" (board along y, nose at -y).
"twist" turns a bone about its own axis (degrees; negative turns her face toward her right); "boardYaw" turns the board
under her (degrees) while she swings it round.
"""
from rigging import POSES, _n

_SIT_LEGS = {"thigh_l": _n(0.45, -0.75, -0.45), "shin_l": _n(0.1, 0.1, -1), "foot_l": _n(0.08, -0.7, -0.7),
             "thigh_r": _n(-0.45, -0.75, -0.45), "shin_r": _n(-0.1, 0.1, -1), "foot_r": _n(-0.08, -0.7, -0.7)}
_SIT_SPINE = {"spine_01": _n(0, -0.05, 1), "spine_02": _n(0, -0.06, 1), "spine_03": _n(0, -0.03, 1), "neck": _n(0, -0.15, 1), "head": _n(0, 0.0, 1)}
_HANDS_ON_THIGHS = {"upperarm_l": _n(0.12, -0.15, -1), "forearm_l": _n(0.1, -0.75, -0.65),
                    "upperarm_r": _n(-0.12, -0.15, -1), "forearm_r": _n(-0.1, -0.75, -0.65)}
_SIT_CONTACT = {"floor": ["pelvis"], "nose": ["thigh_l", "thigh_r"], "tail": ["pelvis"]}

_PRONE_LEGS = {"thigh_l": _n(0.06, 1, -0.03), "shin_l": _n(0.04, 1, 0.04), "foot_l": _n(0.0, 0.6, -0.8),
               "thigh_r": _n(-0.06, 1, -0.03), "shin_r": _n(-0.04, 1, 0.04), "foot_r": _n(0.0, 0.6, -0.8)}
_PRONE_CONTACT = {"nose": ["hand_l", "hand_r"], "tail": ["thigh_l", "thigh_r"], "prone": True, "noseGap": 0.3}

STP = {
    "stp1": {"turn": 0, "bones": {**_SIT_SPINE, **_HANDS_ON_THIGHS, **_SIT_LEGS}, **_SIT_CONTACT},
    "stp2": {"turn": 0, "bones": {**_SIT_SPINE, **_HANDS_ON_THIGHS, **_SIT_LEGS},
             "twist": {"spine_03": -12, "neck": -20, "head": -55}, **_SIT_CONTACT},
    # The turn (Andrew, r1: still astride the whole way, never side-saddle; she and the board turn together, the
    # board's nose swinging to wherever she will paddle). Leaning back, a hand behind on the deck, the legs kicking
    # either side of the board.
    "stp3": {"turn": 0, "bones": {
        "spine_01": _n(0, 0.25, 1), "spine_02": _n(0, 0.38, 1), "spine_03": _n(0, 0.42, 1), "neck": _n(0, 0.12, 1), "head": _n(0, 0.0, 1),
        "upperarm_r": _n(-0.3, 0.75, -0.6), "forearm_r": _n(-0.2, 0.5, -0.85),
        "upperarm_l": _n(0.15, -0.15, -1), "forearm_l": _n(0.1, -0.75, -0.65),
        "thigh_l": _n(0.5, -0.8, -0.3), "shin_l": _n(0.15, -0.6, -0.8), "foot_l": _n(0.1, -0.9, -0.4),
        "thigh_r": _n(-0.5, -0.7, -0.5), "shin_r": _n(-0.1, 0.2, -1), "foot_r": _n(-0.08, -0.7, -0.7)},
        "twist": {"head": -20}, **_SIT_CONTACT},
    "stp4": {"turn": 0, "bones": {
        "spine_01": _n(0, 0.45, 1), "spine_02": _n(0, 0.6, 1), "spine_03": _n(0, 0.62, 1), "neck": _n(0, 0.25, 1), "head": _n(0, 0.0, 1),
        "upperarm_r": _n(-0.35, 0.55, -0.75), "forearm_r": _n(-0.2, 0.3, -1),
        "upperarm_l": _n(0.35, 0.55, -0.75), "forearm_l": _n(0.2, 0.3, -1),
        "thigh_l": _n(0.55, -0.75, -0.35), "shin_l": _n(0.15, -0.5, -0.85), "foot_l": _n(0.1, -0.9, -0.4),
        "thigh_r": _n(-0.55, -0.75, -0.35), "shin_r": _n(-0.15, -0.3, -0.95), "foot_r": _n(-0.1, -0.8, -0.6)},
        "twist": {"head": -15}, **_SIT_CONTACT},
    "stp5": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -0.97, 0.25), "spine_01": _n(0, -0.9, 0.42), "spine_02": _n(0, -0.8, 0.6), "spine_03": _n(0, -0.7, 0.7),
        "neck": _n(0, -0.6, 0.8), "head": _n(0, -0.3, 0.95),
        "upperarm_l": _n(0.12, 0.1, -1), "forearm_l": _n(0.06, 0.0, -1), "hand_l": _n(0.05, -1, -0.12),
        "upperarm_r": _n(-0.12, 0.1, -1), "forearm_r": _n(-0.06, 0.0, -1), "hand_r": _n(-0.05, -1, -0.12), **_PRONE_LEGS},
        "floor": ["hand_l", "hand_r", "pelvis", "thigh_l", "thigh_r"], "level": (["hand_l", "hand_r"], ["thigh_l", "thigh_r"]),
        "levelRange": (-25, 25), **_PRONE_CONTACT},
    "stp6": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -1, 0.1), "spine_01": _n(0, -0.97, 0.22), "spine_02": _n(0, -0.92, 0.38), "spine_03": _n(0, -0.86, 0.5),
        "neck": _n(0, -0.7, 0.7), "head": _n(0, -0.35, 0.94),
        "upperarm_l": _n(0.25, 0.45, -0.85), "forearm_l": _n(0.1, -0.35, -0.95), "hand_l": _n(0.05, -1, -0.12),
        "upperarm_r": _n(-0.25, 0.45, -0.85), "forearm_r": _n(-0.1, -0.35, -0.95), "hand_r": _n(-0.05, -1, -0.12), **_PRONE_LEGS},
        "floor": ["hand_l", "hand_r", "pelvis", "thigh_l", "thigh_r"], "level": (["hand_l", "hand_r"], ["thigh_l", "thigh_r"]),
        "levelRange": (-25, 25), **_PRONE_CONTACT},
    "stp7": dict(POSES["paddle"]),
    "stp8": {**POSES["paddle"], "world": {
        "upperarm_l": _n(0.22, -1, -0.35), "forearm_l": _n(0.12, -1, -0.55),
        "upperarm_r": _n(-0.3, 0.12, -1), "forearm_r": _n(-0.12, 0.35, -1)}},
}
# The game joins these as four clips (Andrew, 2026-10-10: sit → paddle is not only for catching a wave; she may paddle
# to shift her take-off spot or further out for a big set):
#   sitIdle (stp1-2) · sitTurn (stp3-4, the angle is the game's: any heading, not a fixed 180°) ·
#   sitToProne (stp5-6) · paddleCycle (stp7-8, loops, any heading).
# For this strip she turns a half circle over frames 3-5 (to face the shore), as in the reference.
for k, sp in (("stp3", -60), ("stp4", -120), ("stp5", -180), ("stp6", -180), ("stp7", -180), ("stp8", -180)):
    STP[k] = {**STP[k], "spin": sp}
POSES.update(STP)
