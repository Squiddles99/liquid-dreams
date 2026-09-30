# The Surfer on the Stand: Design

**Date:** 2026-09-30 · **Branch:** `surfer-on-the-stand` (worktree `ld-surfer`) · **Status:** brainstormed with Andrew,
sections 1–4 approved in chat; waiting on his review of this written spec. Calls marked **Ruling** are mine, made while
writing it up; each is his to overturn.

## 1. What Andrew asked for, and what we agreed

**He said** (2026-09-30): now is the time to look toward the protagonist, the surfer: their boards ("a few different
boards depending on the conditions that feel very different"), their appearance, and their stances "depending on the
part of the wave they are on and how they ride it". He has never done game graphics and will be guided on how the
models are made.

**Decided in the brainstorm:**
- **Two preset surfers, a male and a female, both in their late teens**, Andrew's age when he surfed the Womb. A
  character creator may come later, so every look is built as numbers underneath the presets.
- **Stance is the player's pick, per surfer** (goofy or regular). The Womb is a left, so that is the biggest single change
  in how a ride looks and feels: goofy rides it frontside, regular rides it backside (the pig-dog barrel).
- **The quiver:** a shortboard thruster (3–5 ft), a step-up / semi-gun (6 ft+) and a bodyboard (prone and drop-knee).
- **The ride camera is a chase camera**, behind and slightly above. The art budget goes to silhouette, wet materials and
  motion, not faces.
- **Wardrobe:** the season (from the date) picks it; the player can override.
- **Style:** grounded realism, matching the physically based ocean: real proportions, physically lit materials, detail
  sized for the chase camera. Not photoreal faces.
- **Approach 1, a scripted Blender pipeline:** bodies from MakeHuman bases, shaped by Python scripts that run Blender in
  the background. Boards are generated in TypeScript from shaper numbers. Poses are solved in the game at runtime.

**Assumed:**
- **Steam:** Liquid Dreams is heading to Steam (decided 2026-09-30), so every asset must be licensed for
  commercial use. MakeHuman's base mesh, targets, skins and exported characters are **CC0**, confirmed on its licence
  pages; only the addon's code is GPL, and that doesn't reach what it exports.
- **Poses are procedural,** driven by the ride through inverse kinematics (IK) and anchored by hand-set key poses, rather
  than canned animation clips.

**What success looks like:** Andrew picks a surfer, a stance and a board, freezes a set wave at the Womb, puts the surfer
in the pocket, and it reads at a glance as a teenager surfing that wave that morning: the body, the suit, the board, the
pose and the light.

## 2. The surfer roadmap: this spec is sub-project 1 of 4

The protagonist is too big for one spec. Each sub-project gets its own spec, plan and build.

| # | Sub-project | What you experience at the end |
|---|---|---|
| **1** | **The surfer on the stand** (this spec) | Both surfers, their wardrobe, the three boards and every key pose, in both stances, standing on a frozen Womb wave, lit by the real sky |
| 2 | Riding physics | Paddling in, the take-off on the ledge, trim, turns, the barrel, bailing: the feel. Each board's handling comes from its shaper numbers |
| 3 | Stances driven by the ride | Sub-project 2 fills in `RideState` and the poses from sub-project 1 follow it live, with transitions and the balance layer |
| 4 | The chase camera | The ride camera proper, beyond the stand's rough preview |

Sub-project 1 comes first because it gives Andrew something to see and judge quickly. It also fixes the one seam between
physics and pose (`RideState`, §3.4) before the physics is built.

## 3. The pieces

### 3.1 The build side: `tools/surfer/` (Blender, run by scripts)

- **Preset files** (`tools/surfer/presets/female.json`, `male.json`): build, height, skin tone, tan, hair style and colour,
  and the suits to fit.
- **`npm run build:surfers`** runs Blender in the background (`blender --background --python tools/surfer/build.py`).
  The script:
  1. builds the MakeHuman base through the MPFB addon from the preset's numbers;
  2. fits the wardrobe (§4.3);
  3. adds the hair cards (§4.2);
  4. trims the rig to our skeleton (§3.3), with a simplified weight paint;
  5. exports `public/surfer/female.glb` and `public/surfer/male.glb`;
  6. writes `public/surfer/<name>.manifest.json` (bone names, rest pose, triangle counts, material slots) for the tests;
  7. renders turntable previews (8 angles × every suit) to a git-ignored `tools/surfer/previews/`.
- **The .glb files are committed,** so players and the launcher never need Blender. Only rebuilding the surfers does.
- **The script fails loudly and early,** with a plain message, if Blender or MPFB is missing or the wrong version.
- **Pinned versions:** the Blender and MPFB versions the build was made with go in `tools/surfer/README.md`, with
  install steps written for Andrew (Blender is a free download from blender.org; MPFB installs from Blender's extensions
  menu).
- **Ruling:** Blender is found through a `BLENDER_PATH` environment variable, or the default Windows install path. It is a
  build tool only, like `tools/bakeTerrain.ts`; `npm run dev` and `npm test` never need it.

### 3.2 The game side: `src/surfer/`

| File | Purpose |
|---|---|
| `presets.ts` | The two surfers: display name, body .glb, default stance, board sizes (§5.1), colours |
| `wardrobe.ts` | Pure: date → water temperature → suit (§4.3), with the player's override on top |
| `rig.ts` | The skeleton contract (§3.3): bone names, parent chain, joint limits |
| `poses.ts` | The key poses as data (§3.5): targets, not bone angles |
| `ik.ts` | Pure: two-bone IK for the legs and arms, the spine distributing bend and twist, joint-limit clamps |
| `solvePose.ts` | Pure: `RideState` + pose + dials + board foot spots → the joint rotations for every bone |
| `balance.ts` | Pure: the balance layer (§3.6) |
| `leash.ts` | Pure: the leash curve from the ankle (or wrist, on the bodyboard) to the leash plug |
| `Surfer.ts` | Loads the .glb, applies the materials (§4.4), applies the solved rotations each frame |
| `surferParams.ts` | Dev settings, with a `normalize…` function like the other params modules |

### 3.3 The skeleton contract

23 bones: `root`, `pelvis`, `spine_01`–`spine_03`, `neck`, `head`, and per side `clavicle`, `upperarm`, `forearm`,
`hand`, `thigh`, `shin`, `foot`, `toe`. Fingers are one fixed grip pose per hand. There are no face bones: the chase camera
never shows expressions. The Blender script maps MPFB's game-engine rig onto these names. A test checks every manifest
against `rig.ts`: names, parents, and a rest pose where the bones are no shorter than 1 cm and the legs point down.

### 3.4 `RideState`, the seam for later

```ts
interface RideState {
  board: { position: Vec3; forward: Vec3; up: Vec3 };  // world space; up tilts with rail angle and pitch
  speedMs: number;
  railAngleRad: number;       // + into the wave face
  compression: number;        // 0 tall … 1 fully low (the pose dial, until physics drives it)
  zone: 'flats' | 'face' | 'pocket' | 'tube' | 'lip' | 'whitewater';
  phase: 'sit' | 'paddle' | 'popup' | 'ride' | 'kickout' | 'bail';
  phaseT: number;             // 0…1 through a phase (the pop-up's three beats, the paddle stroke)
  lookAt: Vec3;               // where the eyes go: down the line, the drop, the tube's exit
}
```

The pose solver reads only this, plus the surfer's settings (preset, stance, board). On the stand, the dev panel sets it
by hand. In sub-project 2 the riding physics fills it in, and the surfer code does not change.

### 3.5 Key poses

A key pose is a named target, not a frozen frame. It lists:
- where each foot goes, as a foot spot on the board (`front`, `back`, `knee` for drop-knee, `trailing` for legs off the
  bodyboard's tail);
- the pelvis height over the deck, and its shift fore/aft;
- the chest's bend and twist against the hips;
- the hand targets (on the rail, on the nose, dragging in the face, out for balance);
- the head's look target.

Four dials move each pose continuously: **compression, lean, twist and reach**. On the stand they are sliders; in
sub-project 3 they are derived from `RideState` (compression directly, lean from the rail angle, twist and reach from the
turn and the zone). Every stand-up pose exists in a **frontside** and a **backside** version. The solver mirrors the feet for goofy and regular, but frontside and backside are authored separately because they are different postures,
not mirror images.

**Stand-up boards** (thruster, step-up):

| Pose | Description |
|---|---|
| `sit` | Straddling the board, legs dangling, hands on the rails |
| `paddle` | Prone, chest up, arms stroking (a cycle, `phaseT` 0→1) |
| `popup` | Three beats: hands under the chest → feet swing through → standing low (`phaseT`) |
| `drop` | Weight forward, low, arms out, eyes down the face |
| `bottomTurn` | Deep compression into the inside rail, leading arm pointing the line |
| `trim` | Taller and relaxed, the high line, arms loose |
| `barrel` frontside | Crouched facing the wall, trailing hand dragging in the face |
| `barrel` backside | The pig-dog: back knee dropped, leading hand on the outside rail, head tucked |
| `kickout` | Pushing the board over the back of the wave |
| `bail` | Pushing the board away and diving |

**Bodyboard:**

| Pose | Description |
|---|---|
| `sit` | Waiting in the lineup (sitting or lying on the board, a pose variant) |
| `paddle` | Prone, fins kicking, arms stroking (a cycle) |
| `prone` | Chest up, one hand on the nose, one on the rail, legs trailing |
| `proneBarrel` | Elbow drop into the pocket, chest low, head up |
| `dropKnee` | Leading foot flat, back knee on the board, one hand on the nose (goofy/regular sets the leading foot) |
| `bail` | Pushing the board away and diving |

**Left for later sub-projects:** duck-dives, cutbacks, airs (the Womb is a pit, not a turn wave), transitions between
poses, and the wipeout tumble.

### 3.6 The balance layer

Small automatic corrections on top of any pose, so held poses don't look like statues:
- the head holds its look target steady against the board's motion;
- the arms make small, slow balancing drifts (seeded noise, a few degrees, 0.3–0.8 Hz);
- the knees absorb the board's heave.

It is pure and deterministic (seeded, and driven by simulation time, so a moment link reproduces it), and it has an
on/off switch and an amount dial.

### 3.7 Boards: `src/board/`

| File | Purpose |
|---|---|
| `boardSpec.ts` | The boards as shaper numbers (§5.1), plus the derived volume, foot spots, leash plug and fin positions |
| `boardGeometry.ts` | Pure: the spec → vertex and index arrays (outline × rocker × foil × rail profile, plus fins) |
| `BoardMesh.ts` | The GPU mesh and its materials (§4.5) |

## 4. The look

### 4.1 Bodies

- Late-teen surfer builds: lean and paddle-strong, not gym-bulky.
  - **Female:** about 1.65 m.
  - **Male:** about 1.78 m.
- Skin tone, tan, build and height are preset numbers.
- About 20k triangles each, in one skinned mesh with at most 4 material slots.

### 4.2 Hair

- **Hair cards:** mesh strips carrying a see-through hair texture, the standard game technique.
- **Sun-bleached ends.**
- **Always wet while surfing:** darker, glossier and clumped. A dry variant is out of scope.
- **Female:** longer, tied back. **Male:** short to mid-length, messy.
- Style and colour are preset numbers.
- **Ruling:** the hair textures are made by our own build script (procedural strands baked to a texture in Blender), so
  their licence is ours.

### 4.3 Wardrobe by water temperature

Monthly average sea temperatures at Margaret River, from a web search on 2026-09-30 (seatemperature.info,
surf-forecast.com):

| Month | J | F | M | A | M | J | J | A | S | O | N | D |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| °C | 20.8 | 21.1 | 21.6 | 21.6 | 21.3 | 20.3 | 19.4 | 18.6 | 18.2 | 18.4 | 19.1 | 19.9 |

- **Interpolation:** `wardrobe.ts` interpolates between mid-month values for the date. Plan Task 1 double-checks the
  numbers against a satellite climatology (NOAA OISST) before they are frozen.
- **The re-fit:** the water is warmer than the table Andrew approved in chat assumed (that one had a 4/3 below 17.5 °C,
  which the Capes' averages never reach). The thresholds below keep all four suits in the year. **Ruling, Andrew to
  confirm:**

| Water | Months (on average) | Male | Female |
|---|---|---|---|
| ≥ 21.0 °C | Feb – May | Boardies | Bikini + rashie |
| 19.6 – 21.0 °C | Dec – Jan, Jun | Springsuit | Springsuit |
| 18.8 – 19.6 °C | Jul, Nov | 3/2 steamer | 3/2 steamer |
| < 18.8 °C | Aug – Oct | 4/3 steamer | 4/3 steamer |

- **Why a 4/3 at 18 °C:** in the coldest months, cold dawn air and the wind make it what locals wear, even though the water
  itself isn't that cold.
- **The override:** a dropdown with "season" (the default) and each suit.
- **How suits are built:**
  - **Wetsuits are painted onto the body surface,** a thin raised offset with seam and panel detail, rather than separate
    cloth. That means no clipping when the knees go deep in a pig-dog.
  - **Boardies are the one loose garment:** a separate skinned mesh.
  - **The bikini and rashie** are painted regions like the wetsuits.
  - **Bodyboard fins:** on the bodyboard, the surfer wears swim fins, a small mesh on each foot. The foot spots of the
    bodyboard poses account for them.

### 4.4 Materials

The surfer is lit the way the rocks and plants are: a custom TSL node material using the sky's sun direction,
illuminance, sky irradiance, ground bounce, sun visibility (shadows) and aerial perspective. A dawn surfer glows orange
and an overcast one goes flat grey, with no extra work.
- **Wet skin:** a soft base, plus a tight specular highlight from the real sun.
- **Neoprene:** matte black with a broad wet sheen, and the preset's accent colour on the panels.
- **Wet hair:** dark and glossy, with an anisotropic highlight along the strands (simplified), and alpha-tested cards.

### 4.5 Board materials

- **Thruster:** white glass slightly yellowed with age, a wax haze on the deck, a dark tail pad, fins and a leash plug.
- **Step-up:** the same, with a tinted rail band, so it reads as "the big-day board" at a glance.
- **Bodyboard:** a coloured foam deck, a slick bottom, the crescent tail, and the leash to the wrist or bicep.
- Colours are preset numbers.

## 5. The boards in numbers

### 5.1 Sized to each surfer

A real quiver fits its rider, so each preset has its own sizes. **Ruling** (standard sizing for a light, fit teenager):

| Board | Female (about 55 kg) | Male (about 68 kg) |
|---|---|---|
| Thruster | 5'10" × 18¾" × 2⁵⁄₁₆" (about 26 L) | 6'0" × 19¼" × 2⁷⁄₁₆" (about 29 L) |
| Step-up | 6'4" × 19" × 2½" (about 30 L) | 6'8" × 19½" × 2⅝" (about 34 L) |
| Bodyboard | 40", crescent tail | 42", crescent tail |

Each spec also carries:
- the outline (the widths at nose, 12" from the nose, mid, 12" from the tail, and tail);
- the tail shape (squash, rounded pin, crescent);
- the nose and tail rocker;
- the foil (the thickness profile);
- the rail profile;
- the fins (thruster: three; step-up: three, set further forward; bodyboard: none).

Volume is computed from the generated shape, not typed in. The handling numbers (paddle, catch, turn, hold) come in
sub-project 2, derived from these same numbers.

## 6. The stand

- **A "Surfer" folder in the dev panel:**
  - preset;
  - stance;
  - board;
  - the suit override;
  - pose;
  - `phaseT`;
  - the four dials;
  - the balance layer's on/off and amount;
  - placement: "lineup" or "on the wave";
  - a nudge (along the wave, up/down the face, the heading).
- **Placement:** the board sits on the water height the lineup camera already uses (the `HeightProbe`), sampled at the
  nose, tail and both rails, so the board pitches and rolls with the water. The rider solves on top.
- **Posing on a wave:** press `P` to freeze a set wave mid-break, choose "on the wave", and move the surfer into the pocket.
- **Known limit:** if the breaking face or the lip isn't in the probe's height (the ribbon is drawn separately), the board
  may sit under the curl. The stand then offers a manual height and pitch nudge, and a proper wave-face query is listed as
  a first requirement of sub-project 2. **Ruling:** a stand does not need physically exact placement.
- **Camera:**
  - **Orbit:** the free camera, as now.
  - **Chase preview:** a stand option puts the camera behind and above the surfer, looking down the line, to judge poses
    from the angle we'll play from. It's a rough placeholder for sub-project 4.
- **The surfer's shadow:** the surfer casts a shadow on the board through a contact-shadow term. **Ruling:** its shadow on
  the water is left out; the ocean shader doesn't take object shadows today.
- **Screenshots, moment links and reference moments** carry the surfer settings: moment-link schema version bump, old
  links load with the surfer off.

## 7. Testing

**Automated tests (vitest):**
- **Wardrobe:** the thresholds; dates at each season boundary; the override wins; interpolation across the year end.
- **Boards:**
  - volumes within ±1.5 L of §5.1;
  - left/right symmetric;
  - a closed mesh (every edge shared by exactly two triangles);
  - the foot spots and leash plug on the deck;
  - the fins on the bottom.
- **IK:**
  - the feet reach their spots within 1 cm across a sweep of every dial value in every pose;
  - the knees and elbows bend the right way;
  - no joint passes its `rig.ts` limit;
  - out-of-reach targets clamp without flipping.
- **Rig contract:** every manifest matches `rig.ts`.
- **Poses:** every pose exists for every stance, board and preset combination that uses it; `phaseT` cycles are continuous
  at 0/1.
- **Balance and leash:** the same inputs give the same output (determinism); the leash never passes through the board's
  deck.
- **In-browser self-test** (the existing `selfTests` pattern): both .glb files load, skin, and render a frame without
  errors.

**By eye, with two stop gates:**
1. **After the bodies (build side):** turntable renders of both surfers in every suit. Andrew signs off before they go in
   the game.
2. **After the poses:** stand screenshots of every key pose, frontside and backside, on each board, beside real photos.
   Andrew supplies the reference shots (like the barrel deck): a backside pig-dog at a slab, a frontside pit, a drop-knee,
   a pop-up, sitting in the lineup. They go in `reference/surfer/`, which stays out of any public repo.

**Performance:** the surfer plus board cost ≤ 0.5 ms of GPU time at the chase camera's distance (measured with the
existing perf overlay on the RTX).

## 8. Licences

`public/surfer/LICENSES.md` records the source of every asset:
- the MakeHuman / MPFB version, with its CC0 statement and a link;
- that the hair textures, suit textures and boards are made by this project;
- the Blender version used.

This is ready for Steam's store review.

## 9. Out of scope

- Riding physics, transitions between poses, the chase camera proper (sub-projects 2–4).
- The character creator.
- Faces and expressions.
- Water running off the body, suit wrinkles, sand on the skin, sunglasses and hats.
- The dry-hair variant.
- The surfer seen in walk mode (walking is first-person).
- The surfer's shadow on the water.

## 10. Rulings for Andrew to confirm

1. **Wardrobe thresholds (§4.3).** Re-fitted to the real water temperatures, which are warmer than the chat table assumed.
2. **Board sizes per surfer (§5.1).** Standard sizing for their weights. Andrew may remember what he actually rode.
3. **Hair textures made by our own script (§4.2)** rather than taken from outside packs, for a clean licence.
4. **Wave placement on the stand (§6).** It uses the lineup camera's height, plus a manual nudge where the curl isn't in
   it.
5. **No surfer shadow on the water (§6)** in this sub-project.
