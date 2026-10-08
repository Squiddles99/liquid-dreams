# Painted riders

Andrew's originals for Choose your rider and Grab your gear (painted riders spec, 2026-10-08): ChatGPT, image-to-image
from one picture per rider, upscaled and cut out in Canva, 6000 × 3375. `tools/riderArt.py` crops, defringes and sizes
them into `public/riders/`, which the game loads; rerun it after any change here.

One folder per preset (`male` = T-Bone, `female` = Shazza, `grommet` = Grommet); one file per outfit, named as the game
names it (`src/surfer/presets.ts`): `walking` is the civvies. A new outfit needs its name in the preset's `wardrobe` too.

| Andrew's file | Here |
|---|---|
| `*-civvies` | `walking.png` |
| `t-bone-rashie`, `grommit-rashie` | `rashieAndBoardies.png` |
| `grommit-shorts` | `boardies.png` |
| `shazza-boardies-rashie` | `rashieAndBottoms.png` |
| `shazza-one-piece` | `onePiece.png` |
| `*-shortarm-steamer`, `grommit-short-arm-steamer` | `shortArmSteamer.png` |
| the rest | the same name |
