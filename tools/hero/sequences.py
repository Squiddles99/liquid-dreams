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
        "floor": ["hand_l", "hand_r", "pelvis", "thigh_l", "thigh_r", "shin_l", "shin_r"], "level": (["hand_l", "hand_r"], ["shin_l", "shin_r"]),
        "levelRange": (-25, 25), **_PRONE_CONTACT},
    "stp6": {"turn": 0, "bones": {}, "world": {
        "pelvis": _n(0, -1, 0.1), "spine_01": _n(0, -0.97, 0.22), "spine_02": _n(0, -0.92, 0.38), "spine_03": _n(0, -0.86, 0.5),
        "neck": _n(0, -0.7, 0.7), "head": _n(0, -0.35, 0.94),
        "upperarm_l": _n(0.25, 0.45, -0.85), "forearm_l": _n(0.1, -0.35, -0.95), "hand_l": _n(0.05, -1, -0.12),
        "upperarm_r": _n(-0.25, 0.45, -0.85), "forearm_r": _n(-0.1, -0.35, -0.95), "hand_r": _n(-0.05, -1, -0.12), **_PRONE_LEGS},
        "floor": ["hand_l", "hand_r", "pelvis", "thigh_l", "thigh_r", "shin_l", "shin_r"], "level": (["hand_l", "hand_r"], ["shin_l", "shin_r"]),
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
# Andrew (2026-10-10 review): the turn finishes while she sits (turning while lying down put her leg through the board),
# and she leans forward onto her hands before going down (stp4b), so there is no leap between sitting and prone.
STP["stp4b"] = {"turn": 0, "bones": {
    "spine_01": _n(0, -0.35, 1), "spine_02": _n(0, -0.55, 1), "spine_03": _n(0, -0.6, 1), "neck": _n(0, -0.5, 1), "head": _n(0, -0.2, 1),
    "upperarm_l": _n(0.15, -0.75, -0.7), "forearm_l": _n(0.08, -0.35, -1), "hand_l": _n(0.05, -1, -0.12),
    "upperarm_r": _n(-0.15, -0.75, -0.7), "forearm_r": _n(-0.08, -0.35, -1), "hand_r": _n(-0.05, -1, -0.12),
    **{k: v for k, v in _SIT_LEGS.items()}}, **_SIT_CONTACT}
for k, sp in (("stp3", -90), ("stp4", -180), ("stp4b", -180), ("stp5", -180), ("stp6", -180), ("stp7", -180), ("stp8", -180)):
    STP[k] = {**STP[k], "spin": sp}
POSES.update(STP)

# paddle-cycle (Andrew's sheet, fixed camera, 8 frames = the 4-phase stroke twice): one arm reaches and enters past the
# nose while the other is out of the water recovering, elbow high; then each pulls straight down under the chest,
# pushes back under the hip, exits at the hip. The arms are opposite (half a cycle apart), so 8 phases loop.
# Left-arm aims in the world (x out, -y toward the nose, z up); the right arm mirrors x.
_STROKE = [  # one per frame of his sheet (left arm = the near arm; frame k+4 shows the same with the arms swapped)
    (_n(0.2, -1, -0.4), _n(0.12, -1, -0.65)),    # 0 entry, the hand dipping in ahead of the nose
    (_n(0.25, -0.15, -1), _n(0.1, 0.2, -1)),     # 1 pull, straight down under the chest
    (_n(0.25, 0.45, -0.9), _n(0.1, 0.8, -0.6)),  # 2 push, back toward the hip
    (_n(0.3, 0.95, -0.15), _n(0.2, 0.9, 0.1)),   # 3 exit beside the hip, hand at the rail
    (_n(0.35, 0.7, 0.6), _n(0.1, 0.95, -0.15)),  # 4 recovery, elbow up, hand over the back
    (_n(0.4, 0.15, 0.9), _n(0.15, 0.6, -0.8)),   # 5 recovery, elbow high over the shoulder
    (_n(0.35, -0.6, 0.7), _n(0.15, -0.95, -0.2)),  # 6 swinging forward, hand ahead of the face
    (_n(0.25, -1, -0.1), _n(0.15, -1, -0.3)),    # 7 reaching for the water past the nose
]


def _mirror(v):
    return _n(-v.x, v.y, v.z)


PDL = {}
for k in range(8):
    lu, lf = _STROKE[k]
    ru, rf = _STROKE[(k + 4) % 8]
    PDL[f"pdl{k + 1}"] = {**POSES["paddle"], "world": {"upperarm_l": lu, "forearm_l": lf, "upperarm_r": _mirror(ru), "forearm_r": _mirror(rf)}}
POSES.update(PDL)

# trimming (Andrew's sheet, fixed camera, 8 frames): a pumping trim down the line, twice: 1 settled trim, arms out low
# either side; 2 sinking, arms reaching forward; 3 deep compression, hips low, chest over the knees; 4 extended tall,
# legs long; 5 settled again; 6 leaning to the nose, front arm pointing down the line; 7 deep again; 8 tall again.
# Eyes down the line (toward the nose) throughout. Standing frame, regular: nose +x.
def _lerp(a, b, t):
    return _n(*(a[i] + (b[i] - a[i]) * t for i in range(3)))


def _trim(knee, lean, fwd, arm_l, fore_l, arm_r, fore_r):
    """knee 0 tall .. 1 deep; lean: torso toward the nose (+x); fwd: torso forward over the knees (-y).
    The feet stay ~0.75 m apart as in Andrew's sheet: sinking drives the front knee toward the nose (thigh near level,
    shin slanting in) and folds the back leg under the hip (weight back over the tail, as in his frames 3 and 7)."""
    return {"turn": 0, "lift": None, "bones": {
        "spine_01": _n(0.05 + lean * 0.5, -0.05 - fwd * 0.5, 1), "spine_02": _n(0.08 + lean * 0.7, -0.08 - fwd * 0.8, 1),
        "spine_03": _n(0.1 + lean * 0.8, -0.08 - fwd, 1), "neck": _n(0.1 + lean * 0.6, -0.05 - fwd * 0.4, 1), "head": _n(0.15 + lean * 0.5, 0.0, 1),
        "upperarm_l": arm_l, "forearm_l": fore_l, "upperarm_r": arm_r, "forearm_r": fore_r,
        "thigh_l": _lerp((0.32, -0.05, -1), (0.8, -0.35, -0.5), knee), "shin_l": _lerp((0.33, 0.05, -1), (0.15, 0.2, -1), knee),
        "thigh_r": _lerp((-0.32, -0.05, -1), (-0.2, -0.7, -0.65), knee), "shin_r": _lerp((-0.33, 0.05, -1), (-0.35, 0.4, -0.8), knee)},
        "twist": {"spine_02": 10, "spine_03": 12, "neck": 25, "head": 45},
        # Andrew (trim review): both feet flat on the deck (the front one hovered).
        "plant": ["foot_l", "foot_r"],
        "flat": {"foot_l": 20.0, "foot_r": -15.0}, "floor": ["foot_l", "foot_r"], "nose": ["foot_l"], "tail": ["foot_r"]}


_LOW_OUT = (_n(0.6, -0.2, -0.8), _n(0.55, -0.35, -0.75), _n(-0.6, -0.2, -0.8), _n(-0.55, -0.35, -0.75))
_FWD_OUT = (_n(0.55, -0.55, -0.65), _n(0.5, -0.7, -0.5), _n(-0.65, -0.4, -0.65), _n(-0.55, -0.55, -0.6))
_WIDE = (_n(0.7, -0.55, -0.45), _n(0.65, -0.65, -0.4), _n(-0.75, -0.45, -0.4), _n(-0.65, -0.55, -0.45))
_POINT = (_n(0.85, -0.35, 0.05), _n(0.9, -0.3, 0.2), _n(-0.7, -0.1, -0.7), _n(-0.6, -0.2, -0.7))
TRM = {
    "trm1": _trim(0.55, 0.0, 0.05, *_LOW_OUT),
    "trm2": _trim(0.72, 0.0, 0.15, *_FWD_OUT),
    "trm3": _trim(1.0, -0.2, 0.3, *_WIDE),
    "trm4": _trim(0.3, 0.0, 0.0, *_LOW_OUT),
    "trm5": _trim(0.55, 0.0, 0.05, *_LOW_OUT),
    "trm6": _trim(0.6, 0.15, 0.1, *_POINT),
    "trm7": _trim(1.0, -0.2, 0.3, *_WIDE),
    "trm8": _trim(0.3, 0.0, 0.0, *_LOW_OUT),
}
POSES.update(TRM)

# The trim the game plays (Andrew, 2026-10-10 review: "less lungey and smoother ... balance is achieved by using the
# smaller muscles in the body - not such fast animations"): his sheet's moves damped to small weight shifts. Knees
# flex a little, the weight rocks gently fore and aft, the hands make small corrections; one cycle is 6 s.
def _arms(a, b, t):
    return tuple(_lerp(a[i], b[i], t) for i in range(4))


TRC = {
    "trc1": _trim(0.5, 0.0, 0.05, *_LOW_OUT),
    "trc2": _trim(0.56, 0.03, 0.07, *_arms(_LOW_OUT, _FWD_OUT, 0.35)),
    "trc3": _trim(0.62, -0.05, 0.1, *_arms(_LOW_OUT, _WIDE, 0.3)),
    "trc4": _trim(0.53, -0.02, 0.06, *_LOW_OUT),
    "trc5": _trim(0.47, 0.0, 0.04, *_arms(_LOW_OUT, _FWD_OUT, 0.15)),
    "trc6": _trim(0.55, 0.06, 0.07, *_arms(_LOW_OUT, _POINT, 0.3)),
    "trc7": _trim(0.6, -0.04, 0.09, *_arms(_LOW_OUT, _WIDE, 0.25)),
    "trc8": _trim(0.52, 0.0, 0.05, *_LOW_OUT),
}
POSES.update(TRC)
