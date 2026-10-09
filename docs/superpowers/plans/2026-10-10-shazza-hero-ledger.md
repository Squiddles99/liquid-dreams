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
