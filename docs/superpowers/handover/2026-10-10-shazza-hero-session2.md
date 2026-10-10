# Shazza hero — handover for the next session (2026-10-10, end of session 1)

Read this, then `docs/superpowers/plans/2026-10-10-shazza-hero-ledger.md` (every ruling, in order) and the spec
`docs/superpowers/specs/2026-10-10-shazza-hero-design.md`. Memory: `aaa-characters`.

## Where the work lives
- Branch `shazza-hero`, pushed (last commit 93ee2ef). Work in the worktree **`C:\Dev\andrew-dev-personal-projects\ld-shazza-hero`**
  (the main checkout is on `main` under other sessions; don't switch it). Build outputs: `ld-shazza-hero/build/hero/female/`
  (git-ignored; the main checkout's stray `build/` is a leftover copy, untracked).
- Andrew's art: `art/riders/<preset>/` (front paintings + side/back views, committed on the branch). His reference
  sequences: `C:\Dev\andrew-dev-personal-projects\liquid-dreaming\reference\anim\` (git-ignored, never commit):
  `sit-to-paddle.png` (done: tools/hero/sequences.py), **`trimming.png` and `paddle-cycle.png` (new, not yet used)**,
  `_start/` (the start frames), `README.md` (the brief he follows).
- Never merge to main without Andrew's word. Branch `quiet-captures` (Electron capture windows off-screen) is also
  unmerged, waiting on him.

## Commands (run from the worktree)
- Fit: `blender --background --python tools/hero/fit_export.py -- tools/hero/presets/female.base.json build/hero/female`
  then `py -3.11 tools/hero/fit_solve.py build/hero/female tools/hero/ref/female.json tools/hero/ref/model_marks.json
  tools/hero/presets/female.json --base-preset tools/hero/presets/female.base.json --side tools/hero/ref/female_side.json`.
- Renders: `blender --background --python tools/hero/build.py -- tools/hero/presets/female.json build/hero/female
  --views face,face_smile,face_q3,front,q3,side,back --samples 192` (+ `py -3.11 tools/hero/compose_gate1b.py
  build/hero/female/renders build/hero/female/sheets`).
- Poses: `--views "" --poses paddle,popup,bottomTurn,tube,duckDive` (clothed, on a board) or add `--mannequin` for grey
  side-on start frames (`build/hero/female/mannequin/`); sequence keys `stp1..stp8` render as one fixed-camera strip.
- Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Python for the fit: `py -3.11` (numpy, scipy,
  Pillow). The Bash tool breaks on apostrophes inside heredocs: write patch scripts with the Write tool instead.

## FIRST: more start frames for Andrew (he asked for this before anything else)
He makes ChatGPT key-frame sequences from our grey mannequin start frames (`--mannequin`, side-on to the board,
whole board in frame). He has done sit-to-paddle, trimming, paddle-cycle. The brief's remaining moves (pop-up, duck
dive, bottom turn, top turn, tube crouch, wipeout) start from frames he already has (paddle, trim). Give him **new
start positions** for moves the brief doesn't cover yet, each as a mannequin render + one line of what the sequence
should show, copied into `reference/anim/_start/` and sent with SendUserFile. Suggested set (author as new POSES in
rigging.py / sequences.py, render with `--poses <names> --mannequin`):
1. **proneWaiting** (lying on the board, not paddling, head up watching a set) → sequences: turn-to-shore while prone,
   start paddling for a wave.
2. **takeoffLate** (pop-up just completed at the top of the wave, weight forward) → the drop to the bottom turn.
3. **cutbackSetup** (standing, shoulders turning back toward the curl) → full cutback.
4. **kickout** (standing at the end of a ride) → kick out over the back and drop to sit/prone.
5. **turtleRoll** (prone gripping rails, for big whitewater) → roll under and back.
6. **walking with the board** under the arm on the sand (no board on the water) → walk / enter water / lie on board.
7. **duckDiveSurface** (just resurfaced after a duck dive) → back to paddling.
Ask him which he wants; he decides the list. Remind him: **the camera stays fixed for all frames; she turns, the
camera doesn't** (his first sequence's camera orbited, so it could only be read by eye).

## Then, in order
1. Turn `trimming.png` and `paddle-cycle.png` into keys (like `sequences.py` STP: read each frame, author bone aims,
   render a strip beside his sheet, fix by comparison). If his camera is fixed this time, consider measuring joints
   on the frames (the face-mark method) instead of eyeballing.
2. Hair: the brown smudges at the temples (skin.py's scalp tint where the hairline ramps and no hair covers): tint
   only under real coverage, or lighten the ramp. The locks below the ears still thin out into the braid start.
3. Muscle definition (abs, shoulders, quads: the painting is toned) as baked detail normals.
4. Game variant: bake skin + face projection to 2K maps on the decimated mesh, export the glb with the twist bones
   (the rig.ts contract change is sub-project 5).
5. Then T-Bone and Grommet (sub-projects 2-3) once Andrew signs off Shazza: their front + side views are in
   art/riders (Grommet's side/back only in rashie + boardies: ChatGPT refused him shirtless).

## Andrew's rulings this session (all in the ledger)
Approach A (MPFB upgrade); Shazza bikini first; the painting's face baked on through the fit camera (reverses the
spec); cupsize 0.68, muscle 0.72; trim stance back foot 45 cm from the tail; sit-to-paddle as four joinable clips
(sitIdle, sitTurn at any heading, sitToProne, paddleCycle in any direction — sit → paddle is not only for catching
waves); she stays astride in the turn and the board turns with her; no fringe, no mullet (hair sweeps back from the
centre part into the braids).
