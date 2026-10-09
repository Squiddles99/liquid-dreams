# Shazza hero: handover for Opus (2026-10-10 overnight)

Branch `shazza-hero` (pushed). Spec `docs/superpowers/specs/2026-10-10-shazza-hero-design.md`, plan + ledger
`docs/superpowers/plans/2026-10-10-shazza-hero*.md`. Gate sheets in `docs/superpowers/specs/2026-10-10-shazza-hero-gates/`.

## Run it
- Fit (only when marks or the base preset change): `blender --background --python tools/hero/fit_export.py --
  tools/hero/presets/female.base.json build/hero/female` then `py -3.11 tools/hero/fit_solve.py build/hero/female
  tools/hero/ref/female.json tools/hero/ref/model_marks.json tools/hero/presets/female.json --base-preset
  tools/hero/presets/female.base.json` (writes the preset, its `.marks.json`, the face camera, fit_report.json).
- Build + renders: `blender --background --python tools/hero/build.py -- tools/hero/presets/female.json
  build/hero/female --views face,face_smile,face_q3,front,q3,side,back --samples 192` (~10 min on the RTX 4060);
  poses: `--views "" --poses paddle,popup,bottomTurn,tube,duckDive`. Sheets: `py -3.11 tools/hero/compose_gate1b.py
  build/hero/female/renders build/hero/female/sheets`.
- Outputs are git-ignored under `build/hero/`; py 3.11 has numpy, scipy, Pillow (mediapipe installed, unused).

## Modules (tools/hero)
body.py (MPFB human from the fitted preset via tools/surfer, lash strips removed, face keys incl. authored smileSoft),
skin.py (masks + procedural Cycles skin), project.py (the painting's face baked on through the fit camera),
eyes.py, strands.py (curve hair: scalp guides × fibres, braids filled round cores, tails, brows, lashes),
garments.py (Coons-patch bikini panels projected onto the skin, cords, bows, thongs), rigging.py (twists, binding,
board, poses), studio.py (lights, camera, Cycles).

## Next, in order (until Andrew's notes say otherwise)
1. Scalp hair volume and waves over the temples (it still lies like a helmet); fewer, chunkier clumps.
2. Muscle definition: a baked detail normal for abs, shoulders, quads (the painting is toned).
3. Pose fixes (pop-up front foot onto the deck, duck dive head clear of the deck); braid bone chains with gravity.
4. Game variant: bake the skin + face projection to 2K maps on the decimated mesh, export glb with the extra bones
   (rig.ts contract change is sub-project 5).
