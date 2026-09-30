# Grommet: Design

**Date:** 2026-09-30 · **Branch:** `grommet` (worktree `ld-surfer`) · **Status:** brainstormed with Andrew; sections
1–5 approved in chat; written spec awaiting his review. Calls marked **Ruling** are mine, made while writing it up; each
is his to overturn.

## 1. What Andrew asked for, and what we agreed

The game gets a crew of three who always surf together; the two the player doesn't pick are NPCs (later
sub-projects):
- **Shazza (Sharon):** surfer. This is the existing female body.
- **T-Bone (Tom):** surfer. This is the existing male body.
- **Grommet (Bradley):** a bodyboarder, and the subject of this spec.

This is step 1 of the front-door roadmap:
0. finish the surfer on the stand (done, merged);
1. **Grommet's body**;
2. close-up detail and idle life;
3. walking clothes and backpacks;
4. the dune select-and-setup screen;
5. the intro cinematic;
6. on foot and paddling out;
7. the two NPC mates.

**Andrew's brief:** about 13 and "really goofy":
- buck teeth, pimples, freckles;
- red hair, which he picked as **a wild curly mop**;
- glasses on land but not in the water, which he picked as **big round frames**;
- shorter than Shazza and T-Bone;
- bodyboard only, one board.

**Agreed approach (A):** the full Grommet now, at the same detail level as the other two, built with the same scripted
Blender + MPFB (CC0) pipeline. His freckles, pimples and sunburn are drawn in the skin shader, so they carry straight
into step 2. Step 2 lifts all three characters to close-up quality together.

The tone throughout is a realistic 13-year-old with these features, goofy but loveable, never a cartoon or a
gross-out, sitting in the same grounded style as the other two.

## 2. His body and face (section 1)

- **Frame:**
  - MPFB macros: gender 1.0, and **age ≈ 0.23** (MPFB's age runs 11 → 25 years between 0.1875 and 0.5, so 13 years
    sits there). That gives a child's proportions: a larger head for his body, narrow shoulders, long thin limbs.
  - Muscle about 0.35 and weight about 0.3, for the gangly, pre-growth-spurt look.
  - Scaled to **1.52 m**, against Shazza's 1.65 m and T-Bone's 1.78 m. The final macro values are tuned at the gate.
- **Face (MPFB face targets, as for Shazza):**
  - the upper lip pushed forward and the lips slightly parted, so the teeth show at rest;
  - a softer, slightly receding chin;
  - ears standing out a little;
  - a slightly bigger nose with an upturned tip;
  - wide, eager eyes.
- **Skeleton:** the same 23-bone contract, so every pose, the solver, the stand and the sweep tests work unchanged.

## 3. The curly mop (section 2)

- **Shape:**
  - it sits 7–9 cm out from the scalp at the crown and sides, so the silhouette reads at the chase camera;
  - curls spill over the forehead to the top of the glasses and flick out over the ears and the nape.
- **Build:** a new `curly` style in `tools/surfer/hair.py`.
  - Each lock is a narrow card twisted into a loose spiral, rooted on the scalp, with enough overlap that no scalp
    shows.
  - A light frizz layer of short fine cards breaks the outline so it isn't a helmet.
  - The scalp is painted in the hair colour underneath (`face.py`'s scalp channel), as for the others.
  - Curl radius, pitch, length and angle vary from lock to lock (seeded) so it never reads as regular noodles.
- **Colour:** carrot-ginger, auburn roots to copper tips, with lock-to-lock variation. It's lit as one volume from the
  head-centre normal, like the existing hair.
- **Wetness (new; a uniform, 0 dry … 1 wet):**
  - Dry, on land: full size, a soft sheen.
  - Wet, in the water: darker and glossier, and the curls tighten toward the head (a vertex-shader pull toward the
    head centre, stronger at the tips).
  - The same uniform darkens and glosses the skin for all three.
  - Only Grommet's hair changes shape. Shazza's and T-Bone's dry hairstyles belong to steps 2–3 (Ruling: their hair
    keeps its wet geometry and only its shading dries; cost if wrong, a slicked look on the dune until then).

## 4. The glasses and the teeth (section 3)

- **Glasses:** a new `tools/surfer/glasses.py`.
  - Big round frames: lenses about 5 cm across, thick dark-brown plastic rims (Ruling: brown over black, softer
    against the ginger and freckles), a keyhole bridge, and arms back over the ears.
  - Fitted to his eye and ear landmarks from the build (`bodymap.landmarks`, with an `ears` landmark added), skinned
    entirely to `head`.
  - Lenses are a separate material: clear, with a sky reflection and a crisp specular highlight.
  - The eyes-swimming magnification belongs to step 2.
  - Exported as their own mesh (`<name>_glasses`), so the game can show or hide them.
- **Teeth:** a new `tools/surfer/teeth.py`.
  - An upper row fitted to the mouth landmark: two large central incisors, slightly long, tipped forward about 4 mm
    and splayed a touch, with smaller laterals and canines.
  - Off-white with slight translucency at the tips.
  - Skinned to `head`; when step 2 adds a jaw, the teeth stay with the upper jaw.
  - `face.py` paints the mouth interior dark, so the parted lips never show through the head.
  - Exported as `<name>_teeth`.

## 5. Freckles, pimples and sunburn (section 4)

All three are drawn in the body shader (`surferShading.bodyMaterial`), pinned to the unskinned geometry position (TSL
`positionGeometry`), so they move with the skin in every pose and stay crisp up close.

- **Base skin:** fair (`skin` about [0.62, 0.45, 0.36] linear, `tan` 0.1). The final values are tuned at the gate.
- **Freckles:**
  - cellular noise gives irregular 1–4 mm speckles, clustered, in a light orange-brown, darker where dense;
  - a density field sets where they fall: heavy across the nose and cheeks, thinning to the jaw and forehead, and
    light on the shoulders, upper back and forearms;
  - the zones are built from his landmarks (eyes, nose tip, shoulders), passed as preset data from the manifest.
- **Pimples:** about 8 seeded spots, placed at build time on the forehead, chin and beside the nose. They're written
  to the manifest as rest-pose points with radii and drawn as a red bump, a lighter centre and a pink halo, with a
  normal perturbation.
- **Sunburn:** a soft pink flush on the nose bridge, cheekbones, the tops of the ears and the shoulders.
- **Other presets:** everything here is off for Shazza and T-Bone (their preset fields are empty), so their look is
  unchanged.

## 6. Wardrobe, board and joining the game (section 5)

- **Wardrobe:** the same months as the others.
  - Dec–Mar: the new outfit **`rashieAndBoardies`**, knee-length boardies with a short-sleeve rash vest.
  - Apr–Jun and Oct–Nov: a springsuit.
  - Jul–Sep: a short-arm steamer.
  - Colours: a lime rash vest and navy boardies.
  - The player's override works as for the others.
  - `rashieAndBoardies` is the rash-vest mask plus the boardies mesh.
- **Board:** a bodyboard of about 38 in × 20 in × 2.5 in (Ruling: shaper sizing for a 1.52 m, roughly 40 kg rider;
  cost if wrong, a size tweak), with a yellow deck and blue rails. His fins size from his own feet (the existing
  `1.58 × ankle-to-toe` rule).
- **Presets:**
  - A third preset key, **`grommet`**. The keys `female` and `male` stay, so saved settings and links keep working.
  - Every preset gains `nickname` and `realName`, and the panel shows *Shazza (Sharon)*, *T-Bone (Tom)* and
    *Grommet (Bradley)*.
  - `SurferPreset.quiver` becomes `Partial<Record<BoardKind, BoardDims>>`; the boards a preset may ride are its
    quiver's keys.
- **Bodyboard only:**
  - With Grommet selected, the panel's board list shows only the bodyboard.
  - `normalizeSurferParams` repairs any other board to the preset's first board, and the pose to one valid on it.
  - Grommet still has a stance, for the drop-knee.
- **An `onLand` switch** (SurferParams, default off, in settings and links, sanitised):
  - **on:** glasses shown, wetness 0;
  - **off:** glasses hidden, wetness 1;
  - the game sets it by itself in later steps; for now it's a dev-panel toggle.
- **Licences:** MPFB CC0 data and our own scripts only. `LICENSES.md` names the rig, weights and face targets used
  (this also takes care of the deferred minor from the last review).

## 7. Testing

- **Build (`manifest.test.ts`):**
  - `grommet.glb` plus its manifest pass the skeleton contract;
  - the glb has `grommet_glasses` and `grommet_teeth` meshes, skinned only to `head`;
  - the manifest carries the pimple points and the freckle landmarks;
  - the height is 1.52 m ±1 cm.
- **Params:**
  - Grommet on a surfboard, from a link or stored settings, repairs to the bodyboard;
  - an invalid pose repairs to a valid one;
  - `onLand` sanitises to a boolean;
  - old links without `onLand` still open.
- **Poses:** the existing sweeps run over a Grommet-proportioned reference skeleton as well:
  - nothing sinks through the board;
  - no buried hands;
  - prone elbows stay low;
  - the drop-knee's knee on its spot;
  - ankles land within 1 cm.
- **Glasses fit:**
  - a test that the lens centres sit within 1 cm of the eyes' axis in front of them;
  - the arms reach the ears;
  - no frame vertex is inside the head's surface.
- **Teeth:** a test that the incisors sit behind the upper lip's front and in front of the head's inner surface at the
  mouth landmark.
- **Shader:** a GPU self-test that Grommet's face renders with visible freckle contrast and Shazza's does not.
- **Gate (Andrew):** turntable sheets (front, side, back and three-quarter views, plus face close-ups):
  - dry with glasses on, and wet with glasses off;
  - in each outfit.

  Then in-game shots on the stand. Nothing merges until he signs off.

## 8. Out of scope

- Close-up detail (pores, the lens magnification) and idle life (breathing, blinks, the jaw): step 2.
- Walking clothes, backpacks, and the glasses packed away: step 3.
- The select screen: step 4.
- Dry hairstyles for Shazza and T-Bone: steps 2–3.

## 9. Rulings

1. His glasses rims are dark brown, not black.
2. Shazza's and T-Bone's hair only dries in its shading for now, not in shape.
3. His bodyboard is about 38 × 20 × 2.5 in.
4. The existing preset keys stay `female` and `male`; names are shown from the new `nickname` / `realName` fields.
5. `onLand` couples the glasses and the dryness in one switch, rather than two toggles.
