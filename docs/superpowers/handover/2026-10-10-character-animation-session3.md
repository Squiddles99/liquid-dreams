# Character animation: handover for the next session (2026-10-10, end of session 2)

Read this, then the ledger `docs/superpowers/plans/2026-10-10-shazza-hero-ledger.md` (the last section, "Session 2",
has every ruling from this session), and the earlier handover `2026-10-10-shazza-hero-session2.md` for the build
commands. Memory: `aaa-characters`.

## How we work (Andrew's ruling, emphatic)
Andrew makes the ChatGPT reference sequences (image sheets of key frames from my grey mannequin start frames). **I build
the animation in Blender** from them: keys on Shazza's rig, Blender fills the in-betweens, I review my own frames
first, then send him **MP4s** and the **review .blend**. He can't review a raw .blend: always send MP4s.

## Where the work lives
- Branch `shazza-hero` (pushed; last commit 96dc7b8), worktree **`C:\Dev\andrew-dev-personal-projects\ld-shazza-hero`**.
  Not merged to main; merge only on Andrew's word.
- His reference sheets: `C:\Dev\andrew-dev-personal-projects\liquid-dreaming\reference\anim\` (git-ignored, never
  commit). Start frames in `_start/`, the brief in `README.md`, set-2 prompts in `prompts-set-2.md` (copy committed as
  `docs/art/animation-prompts-set-2.md`).
- Approved clip previews (committed): `docs/art/anim/shazza/{sit-to-paddle,paddle-cycle,trim}.mp4`.
- Build outputs (git-ignored): `build/hero/female/` — `female_clips.blend` (all actions), `female_review.blend`,
  `clips/<clip>/####.png` + `clips/<clip>.mp4`, `mannequin/` (key stills), `sheets/` (key vs reference comparisons).

## APPROVED (Andrew, 2026-10-10) — don't change without asking
- **sit-to-paddle** as four joinable clips: `sitIdle` (loop: look back at the set), `sitTurn` (the half turn, one smooth
  ~3.5 s move, the board turning under her), `sitToProne` (leans forward onto her hands, lies down, ends on the paddle
  cycle's first pose), then `paddleCycle`.
- **paddleCycle**: 8 keys `pdl1-8`, 1.7 s loop (the arms half a cycle apart).
- **trim**: 8 keys `trc1-8`, calm 6 s loop. (`trimPump`/`trm1-8` = his sheet's pumping version, kept only for reference:
  he found it lungey.)

## NEXT: his new sheets are waiting (delivered during session 2, not yet used)
1. **`duckdive-to-paddle.png`** (8 frames, side-on, fixed camera): paddling → hands to the rails, chest up → pushes the
   nose under (board ~25° nose-down, arms straight, body along the board) → right knee onto the tail, left leg up behind
   → (5-6) board tilting back nose-up as it resurfaces, she's on the board on knees/hands → lying flat, legs kicking →
   paddling. Needs the board **pitched** per key (rigging has `tilt` from the hand/knee contacts, used by the old
   `duckDive` pose; `pitch` exists too) and the clip probably ends on `pdl1` so it joins `paddleCycle`.
2. **`roundhouse-cutback-part-1.png` + `part-2.png`** (12 frames, fixed high 3/4-front camera) +
   **`roundhouse-cutback-legend.png`** (actually an SVG with a .png name: open it as text). The legend: "board track,
   fixed camera, left-to-right start and exit; 1-5 right loop: ride right, carve up, turn back left; 6-10 cross to the
   breaking side and rebound around the left loop; 11-12 return to a rightward trim". So the board **yaws ~360°+ along a
   figure-8 path** and leans on its rails. Needs: per-key board **yaw (spin) and roll** (rail lean; `pose()` has no roll
   yet: add a `roll` option rotating rider + board about the board's long axis, like `pitch`), **root travel along the
   track** (keys currently pose in place; add a per-key world offset), and pass-through keys (`animate.THROUGH`) so the
   carve never stops. Start from the trim stance (`trc1`) and end in it.
3. The other set-2 sequences as he delivers them (prone-turn-and-paddle, turtle-roll, duck-dive-surface, late-drop,
   cutback, kickout, walk-cycle, enter-water); start frames are poses in `tools/hero/start_poses.py`.

## The pipeline (code in `tools/hero/`)
- Keys are entries in `rigging.POSES` (aims per bone: standing frame in `bones`, world frame in `world`, plus `turn`,
  `spin`, `twist`, `flat`, `pitch`, `carry`, `noseGap`, `level`, `plant`, contacts `floor/nose/tail`). Sequence keys
  live in `sequences.py` (stp, pdl, trm, trc), start frames in `start_poses.py`.
- `rigging.pose()` poses her and seats the board from her contacts; with `plant` it re-solves the legs (two-bone IK) so
  both feet sit flat on the deck.
- `animate.py`: `CLIPS` = name → (keys, frames to next key (int or per key), loops, camera). `build()` keys the bones
  (Bezier), samples her root every frame turning about the **pelvis** (Hermite easing; `THROUGH` = keys passed through
  without stopping) and keys the board **held in her pelvis frame** per key, following her between keys.
- Check keys against his sheet first: render stills (`--poses k1,..,k8 --mannequin`; add the prefix to the `strip`
  cameras in `build.py`), then `compose_strip.py <sheet> build/hero/female/mannequin female_<prefix> <out.png>` puts
  mine under his 4x2 sheet (his roundhouse sheets are 3x2: adapt the layout).

## Commands (from the worktree; Blender = `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`)
- All clips + previews: `blender --background --python tools/hero/build.py -- tools/hero/presets/female.json
  build/hero/female --views "" --animate paddleCycle,trim,sitIdle,sitTurn,sitToProne,sitToPaddleChain --preview <clips>`
  (`--preview none` to only rebuild the actions; ~3 s/frame EEVEE at 960x720, so a 260-frame preview ~13 min: run it in
  the background). **Always pass every clip to `--animate`**: it rewrites `female_clips.blend` with only those listed.
- MP4: `blender --background --python tools/hero/frames_to_mp4.py -- <abs frames dir> <abs out.mp4> 24 <repeats>`.
- Review file: `blender --background build/hero/female/female_clips.blend --python tools/hero/review_blend.py -- female
  build/hero/female` (add new clips to its `ORDER`). Verify it by rendering a few frames from it before sending.
- Bash heredocs break on apostrophes inside: write patch scripts with the Write tool or Python string replaces.

## Gotchas found this session
- `pose()` sets the board's heading via `rotation_euler`; `animate.build` switches objects to quaternions only after
  posing (otherwise the board silently stays at its first heading).
- EEVEE can't draw the melanin hair shader (it drew dark brown): `strands.hair_material` has an EEVEE output in honey
  blonde. Her hair must read honey blonde in every preview.
- Interpolating the rig root about its origin (at her feet) made her leap through the air between sitting and prone:
  that's why the root turns about the pelvis.
- Her feet overhang the tail when prone (she's short for a 6'0"): realistic, Andrew didn't object.
- Tracked `tools/hero/__pycache__/*.pyc` files show modified after every run: never stage them (Andrew may want them
  untracked: offered, no answer yet).

## Andrew's taste in motion (from three review rounds)
Slow and continuous beats key-to-key: a move split over keys must read as one move (no stop at a middle key). Balance
on a board is small muscles, not lunges. Weight goes over the tail when the front foot is far forward. The board never
jumps: it stays under her and moves with her. Nothing passes through the board.

## After the animations (from the session-2 handover, still open)
Hair temple smudges; muscle definition (abs, shoulders, quads) as baked detail normals; the game variant (2K bakes on
the decimated mesh, glb with twist bones, rig.ts contract = sub-project 5); then T-Bone and Grommet after Andrew signs
off Shazza.
