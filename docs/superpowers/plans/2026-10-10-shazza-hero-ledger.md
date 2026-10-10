# Shazza hero — ledger

- 2026-10-10 night: Andrew approved approach A + Shazza bikini first, then went to sleep ("do what you can without
  me"). Spec + plan written under overnight delegation; rulings marked in the spec.
- Task 1–4 (Gate 1a) done. Marks by eye (no detector download overnight). Fit = scipy bounded lsq over 177 MPFB
  variables (targets, macro derivatives, 3 expression units for the painting's smile). Four rounds, judged on side
  views as well as the front:
  1. free face camera: mouth-width targets made a muzzle, head-fat/age hollowed the cheeks → excluded;
  2. cheek-volume puffed the cheeks chasing jaw silhouettes (hair-covered) → jaw/cheek marks + outline targets dropped;
  3. free scale traded eye spacing for size (eyes shrank and closed in) → face scale fixed from eye line to chin;
  4. accepted: face mean error 2.2 % IOD (target < 3 %), body 0.55 % of height; profile stays natural.
  Rulings: residual RBF warp skipped (errors already ~3 px in the painting); cupsize 0.45 → 0.55 by eye (bust fuller in
  the painting); head kept realistic size (the painting's head is ~1/6.5 of her height, stylised); the clay jaw is a
  little wider than the painting's (hair covers it there). Andrew to sign off Gate 1a.
  Sheets: docs/superpowers/specs/2026-10-10-shazza-hero-gates/gate1a-*.jpg.
- Tasks 5–10 round 1 (Gate 1b r1, NOT passed — for Andrew): `tools/hero/build.py` builds body (fitted preset,
  old build's sculpt + trim + landmarks, lash strips removed, face expression keys), procedural Cycles skin
  (`skin.py`: tan, rosy zones, freckle field, pores, lash line, RW-skin SSS), eyes (`eyes.py`: procedural iris under a
  refractive cornea), strand hair (`strands.py`: 1900 guide locks × 16 fibres over the old hairline, plaits filled
  with fibres round a core, long tails below the elastics, brows, lashes), bikini + thongs (`garments.py`: Coons
  patches projected onto the skin with bindings; halter, band, bows, knotted tie ends; EVA thongs). Arms posed down
  for the renders. Base body re-fitted with muscle 0.72 (ruling) — face 2.1 % IOD, body 0.55 %.
  Known gaps, worst first: face reads doll-like (eyes small/staring, no strong lash line yet, MPFB's smile unit is a
  grimace → needs an authored smile); scalp hair lies like a helmet (needs the painting's volume and waves over the
  temples); no muscle definition (abs, shoulders) — wants a baked detail normal; skin a little plastic.
  Sheets: gates/gate1b-face-r1.jpg, gate1b-body-r1.jpg. Renders ~1 min/view at 192 samples on the RTX 4060.
- Gate 1b round 2: RULING (reverses spec §5's "not a projection"): the painting's face is baked onto the front of the
  face through the Gate 1a face camera (`project.py`, with the painting's expression on), toned to the procedural tan,
  blended by `faceproj` (front-facing, below the hairline). The likeness jump was the largest of the night; the light
  painted into it is soft and frontal. Also: authored `smileSoft` key (MPFB's smile was a grimace), relaxed lids
  (blink 0.1), lash-line tint, iris 34°. Sheets gates/gate1b-*-r2.jpg.
- Task 11–12 round 1 (Gate 1c r1): `rigging.py` adds twist bones (upper arm, forearm, thigh, shin; weights split
  along each bone; forearm/shin copy half the hand's/foot's roll), skins the bikini from the body's weights, parents
  hair/eyes rigidly (head / spine_03), volume-preserving skinning for the renders; a plain 6'0" board; five blocking
  poses aimed bone by bone (`--poses paddle,popup,bottomTurn,tube,duckDive`). Deformation holds (no candy-wrapper).
  Known gaps: the pop-up's front leg hangs off the rail and the duck dive's face goes through the deck (pose authoring,
  not rig); the braids are rigid to the chest (bone chains + gravity not built); pose-space correctives not built
  (volume preservation stands in for the renders; the game needs them, sub-project 5); game-variant glb export
  (Task 11's second half) not done. Sheet gates/gate1c-r1.jpg.
- Gate 1c round 2 (Andrew's notes 2026-10-10: wrists bent back, paddle feet bent up, facing the tail prone, face and
  thigh through the board in the duck dive, a foot off the board / front foot on the rail standing, then "her left
  arm on the paddle pose is wrong"): the board is now seated from each pose's contacts (floor/nose/tail skin groups,
  measured with subdivision off so indices match), nose toward her head; wrists follow the forearms unless a pose
  plants palms; paddle arms authored in the world (right reaching past the nose, left mid-stroke straight down);
  feet pointed back-and-down; duck dive grips the rails half a metre back from the nose; the pop-up authored in the
  world with a level search (hands and back toes on the deck). Remaining: the pop-up's front foot lands beside the
  deck. Andrew offered ChatGPT key-frame sequences per motion — taken up (see the ref brief).
- Andrew's side + back views arrived (art/riders/*/...-side-and-behind.png, -side-and-back.png for Grommet in rashie +
  boardies). The fitter now takes a side view (`--side tools/hero/ref/female_side.json`): its own cameras (body; face
  with scale fixed eye line to nose base), silhouettes along y, the ear's centroid; depth targets exported (torso/hip/
  leg depth, buttocks, stomach, breast point/volume, head/nose/mouth/chin depth, firmness macro). The side view is in a
  more cartoon style: weighted 1/1.5 (body) and 1/2 (face); posture marks (neck, back curves) dropped. Result: front
  body 0.59 % height, side profile 0.2–2.3 %, face front 2.27 % IOD. Ruling: cupsize 0.68 (bust still ~1.6 % short in
  profile). Sheets gates/gate1a-side.jpg, gate1b-*-r3.jpg.
- Andrew's first reference sequence (reference/anim/sit-to-paddle.png, 8 frames, ChatGPT). Workable, but its camera
  orbits (side, behind, other side), so the keys are read by eye, not measured. `tools/hero/sequences.py` holds the 8
  keys (stp1..8) as rig poses: new pose options `twist` (a bone about its own axis), `boardYaw`, `spin` (the whole
  body turned on the water: she swings round over frames 2-5) and `noseGap` (the board's nose this far ahead of the
  nose contact: 0.3 m past the hands, 0.45 m past the chest when paddling). Rendered from one fixed camera as a strip
  (`--poses stp1,...,stp8 --mannequin`). Asked Andrew to keep the camera fixed in the next sequences.
- sit-to-paddle r2 (Andrew: "your sequence is wrong, mine is correct"): frames 3-4 had the board turned under her
  (side-saddle) then back; now she stays astride, leaning back with the legs kicking either side, and she and the board
  turn together (no boardYaw). Design note from Andrew: sit → paddle is not only for catching a wave (shifting the
  take-off spot, paddling out for a big set), so the keys are four joinable clips: sitIdle (1-2), sitTurn (3-4, any
  heading, the game's), sitToProne (5-6), paddleCycle (7-8, loops, any heading).
- Hair round 4 (Andrew: "you've also given Shazza a mullet! She doesn't have a fringe"): every lock sweeps back from
  the centre part (front locks sideways-back over the temple, over the ear's top, behind it into the braid; back locks
  hug the head down to it); no forward fall; more lift (12-24 mm), 1100 chunkier locks x 30 fibres, soft S-waves
  (9-13 cm, 4-8 mm), one shade per lock (`clump` curve attribute), honey blonde (melanin 0.42 → 0.14, red 0.28);
  temple wisps cut to 18 short ones; the face projection kept below eye line + 4-5.5 cm. Sheet gates/hair-r4.jpg.
  Open: brown smudges at the temples = the skin's scalp tint where the hairline ramps but no hair covers it.

## Session 2 (2026-10-10): the first clips, approved by Andrew
- Division of labour (Andrew): he makes the ChatGPT reference sequences; I build the animation in Blender from them.
- Set-2 start frames + prompts (bbecb6c): proneWaiting, turtleRoll, duckDiveSurface, takeoffLate, cutbackSetup,
  kickout, walkBoard; prompts in docs/art/animation-prompts-set-2.md.
- Clips (tools/hero/animate.py, `--animate`): keys keyframed as actions, her root sampled per frame turning about the
  pelvis, the board held in her pelvis frame per key and following her between keys; pass-through keys for continuous
  moves. Review outputs: MP4s (frames_to_mp4.py) and build/hero/female/female_review.blend (review_blend.py).
- Andrew's rulings over three review rounds: no leap / leg through the board going prone (lean forward onto the hands
  first, turn finished while sitting); paddle lying further back (noseGap 0.75); the board turns and travels with her;
  the half turn one smooth ~3.5 s move; trimming is balance by the small muscles: calm, slow (trc1-8, 6 s cycle), not
  his sheet's pumping (trimPump kept for reference); stance narrower, weight back when deep, both feet planted
  (pose `plant`); hair honey blonde in EEVEE too.
- APPROVED (Andrew, 2026-10-10): sit-to-paddle (sitIdle, sitTurn, sitToProne), paddleCycle, trim. Previews committed
  in docs/art/anim/shazza/ (sit-to-paddle.mp4, paddle-cycle.mp4, trim.mp4); the actions rebuild from code into
  build/hero/female/female_clips.blend.

## Session 3 (2026-10-10): duck dive and roundhouse cutback from Andrew's sheets
- duckdive-to-paddle (8 frames, side-on): keys dd1-8 in `sequences.py`, authored on a level board in the world frame,
  then rider and board pitched together (`pitch`: -5 hands to the rails, -25 pushing under and knee on the tail, +10/+7/+3
  resurfacing). dd1 = dd8 = pdl1, so the clip `duckDive` (pdl1 → dd2..dd7 → pdl1, ~2.8 s) joins the paddle cycle both
  ways. Each key seated its board differently (the board slid back a metre mid-dive): `animate.GLIDE` holds the board
  to a steady 0.6 m/s forward glide. Not modelled: sinking under the water (the game's water depth, not the clip).
- roundhouse cutback (12 frames, high 3/4 front + his legend SVG): keys rh1-12 are trim stances (`_trim`) with the
  board's heading (`spin`), rail lean (new pose option `roll`, + toes / - heels, after the feet are planted) and place on
  the track (new pose option `offset`), read off the legend's path at his markers (2 m per 100 px: a ~34 m figure 8;
  ~7 m/s, 4.8 s). The right loop turns +205 deg onto her heels, the left loop -235 deg onto her toes: two opposite
  turns, not one spin. Her pelvis follows a Catmull-Rom curve through the keys (`animate.TRACK`), the preview camera
  follows her, two suns light every heading. Ends on trc1 (the approved trim).
- Ruling (mine, flagged to Andrew): where the legend heads her left (frames 5-8), a regular-footer has her back to his
  camera; his sheet keeps her facing the camera all the way round (ChatGPT). I followed the legend and the physics.
  His sheet's squat is deeper than her planted-feet solve reaches; knees taken deeper (up to 1.35) but she stays a
  little taller than his frames.
- APPROVED (Andrew, 2026-10-10): roundhouse cutback (first look), duck dive r2 (sinks to 1.2 m at the knee push, floats
  back up nose-first toward the surface; preview water = tinted side cut-away). Previews in docs/art/anim/shazza/
  (roundhouse.mp4, duck-dive.mp4).
- Set-2 sequence 11 (duck-dive-surface: back on top, settles, paddles) is covered by the approved duckDive clip's
  end (dd5-dd7 → pdl1): dropped (Andrew, 2026-10-10). Remaining set 2: prone-turn-and-paddle, turtle-roll, late-drop,
  cutback, kickout, walk-cycle, enter-water.
- prone-turn-and-paddle (Andrew's sheet, delivered mid-session; 8 frames side-on): keys pt1-8 in `start_poses.py`
  (pt1 = proneWaiting; chest down, arms into the water; right arm pulls back while the left pushes forward, the board
  spinning to her left 20/50/90/135 deg; pt7 = pdl5 turned 180). Clip `proneTurn` (~5 s): the turn on the board's
  middle (`GLIDE` 0), then into the paddle cycle (pdl6s..pdl1s).
- Ruling (Andrew, 2026-10-10): the turtle roll isn't something he sees in surfing; set-2 #10 is replaced by a BAIL:
  paddling out, a big wave breaks, she pushes the board away and swims under it, surfaces, pulls the leg rope to get the
  board back and climbs on prone. His bail sheet is ready after prone-turn-and-paddle.
