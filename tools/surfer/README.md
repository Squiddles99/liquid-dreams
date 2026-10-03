# Building the surfers

`npm run build:surfers` makes the two surfers' bodies (spec `docs/superpowers/specs/2026-09-30-surfer-on-the-stand-design.md` §3.1).
It runs Blender in the background with the scripts in this folder:

1. MPFB (MakeHuman's Blender extension) makes a late-teen body from `presets/<name>.json`.
2. The shape keys are baked in, the helper geometry removed, and the body scaled to the preset's exact height.
3. The rig is trimmed to the game's 23-bone skeleton (`src/surfer/rig.ts`) plus MPFB's 30 finger bones, which keep
   their own weights (clip slice spec 2026-10-03 §2); the other dropped bones' weights are merged into their nearest
   kept parent.
4. The body is decimated to about 27,000 triangles (the head is kept whole), with at most 4 bone weights per vertex.
5. The face's morph targets ride along (`expressions.py`): MPFB's expression units (blinks, jaw, smile, brows,
   squint, nostrils) are loaded on the baked base mesh, carried through the helper deletion, the scaling and the
   decimation as vertex attributes, and turned back into shape keys (plus our own `breathe`), exported off at rest.
6. The wardrobe masks, face paint, baked occlusion, lashes (the base mesh's own lash strips), eyes fitted to MPFB's eye
   helper, teeth, hair cards (wet, and a dry style on land) and boardies are added (`wardrobe.py`, `face.py`,
   `skin.py`, `hair.py`, `teeth.py`). A ray check writes `checks.blinkCovers` to the manifest: the closed lids must
   cover the eyes.
7. The walking clothes (walking spec `docs/superpowers/specs/2026-10-01-walking-clothes-design.md`), from each
   preset's `walking` block:
   - `clothes.py`: the tee, a shell of the body hung straight down from the widest point above it (`geom.curtain`),
     smoothed over a smoothed copy of the body (so small bumps don't print), with clean bisected hems, Shazza's knotted
     at the hip; her denim cutoffs and bikini straps; thongs; the hats (the scalp above a band, cleared from the real
     head) with a third hair mesh pressed under them (`hair.py` styles `capped` and `bucket`).
   - `packs.py`: each rider's pack and straps over the tee, and Shazza's towel, T-Bone's wetsuit, Grommet's fins.
   - The dry hair is built after them and drapes over them.
   Ray checks write `checks.garmentsOutside` (no garment vertex inside the body) and `checks.hatHairUnder` (no hat hair
   through the hat or over its brim) to the manifest.
8. Out come `public/surfer/<name>.glb`, `public/surfer/<name>.manifest.json`, and turntable sheets in `previews/`
   (git-ignored): each outfit, the walking clothes, and the walking head close (the hats).
9. After a full build, `pile.py` makes `public/surfer/beachPile.glb` (and its manifest): the crew's clothes and packs
   dropped on the sand, from the three riders' glbs, with materials `pile_<part>_<preset>`.

The `.glb` files are committed, so `npm run dev`, `npm test` and the launcher never need Blender. Only rebuilding the
surfers does.

## Install (once)

1. Install Blender from https://www.blender.org/download/lts/ with the default options.
2. In Blender: Edit → Preferences → Get Extensions → search "MPFB" → Install. No other extension is needed.

Built with **Blender 5.2.2 LTS** and **MPFB 2.0.17** (see `api-probe.txt`).

## Commands

- `npm run build:surfers`: both surfers.
- `npm run build:surfers -- --only male`: one surfer (the pile isn't remade).
- `npm run build:surfers -- --pile`: only the beach pile, from the riders already built.
- `npm run build:surfers -- --probe`: writes `api-probe.txt`, which records what this Blender and MPFB offer (the macro
  keys, the vertex groups and the rig's bones). Run it after updating either.
- Blender is found in `C:\Program Files\Blender Foundation\Blender <version>\`. Set `BLENDER_PATH` to `blender.exe` if
  it lives elsewhere (for example a Steam or Microsoft Store install).

## When MPFB changes

Only two places know about MPFB:
- `mpfb_bridge.py`: every call into MPFB.
- `BONE_MAP` in `rig_trim.py`: MPFB's bone names → the game's.

Re-run `--probe`, fix those two if needed, rebuild, and run `npx vitest run src/surfer/manifest.test.ts`.

## Licences

MakeHuman's base mesh, targets and exported characters are CC0. MPFB's code is GPL, but it's a build tool only and is
never shipped. See `public/surfer/LICENSES.md`.

## Motion clips (clip slice spec 2026-10-03)

`npm run build:clips` bakes every clip in `clips.json` onto Shazza and T-Bone →
`public/surfer/clips/<rider>.clips.json`, which the stand plays when the Surfer folder's **motion** is set to *motion
clip*.

- **Sources are free and commercially usable.** Today that's the CMU Graphics Lab Motion Capture Database
  (mocap.cs.cmu.edu), subject 134 (skateboard), read as ASF/AMC by `src/surfer/asfAmc.ts` and mapped onto our skeleton
  by `src/surfer/cmuClip.ts`.
  - CMU's T-pose is aimed onto our A-pose bone by bone, the pelvis is scaled to each rider's leg, frames are resampled
    to 30 fps, and the loop's seam is eased.
  - Credit CMU in the game's credits.
- **The sources and the baked clips are git-ignored** (`anim-source/`, `public/surfer/clips/`): the repo is public.
  - Back up `anim-source/` outside git.
  - Set `LD_ANIM_SOURCE` to read the sources from elsewhere, e.g. a worktree pointing at main's
    `../liquid-dreaming/anim-source`.
- **Downloading the sources:** put `134.asf` and `134_03.amc` from `mocap.cs.cmu.edu/subjects/134/` in
  `anim-source/cmu-134/`.
- **Without the bake** the game runs as before: the panel says *clip: not built* and the code poses play.
- **FBX sources** (a bought pack) would go through `clips.py` in Blender instead. It's written but unused while the
  clips are free.
