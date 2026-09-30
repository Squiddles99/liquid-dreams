# Building the surfers

`npm run build:surfers` makes the two surfers' bodies (spec `docs/superpowers/specs/2026-09-30-surfer-on-the-stand-design.md` §3.1).
It runs Blender in the background with the scripts in this folder:

1. MPFB (MakeHuman's Blender extension) makes a late-teen body from `presets/<name>.json`.
2. The shape keys are baked in, the helper geometry removed, and the body scaled to the preset's exact height.
3. The rig is trimmed to the game's 23-bone skeleton (`src/surfer/rig.ts`), and the dropped bones' weights are merged
   into their nearest kept parent.
4. The body is decimated to about 21,000 triangles, with at most 4 bone weights per vertex.
5. The wardrobe masks, hair cards, eyes and (for the male) boardies are added (`wardrobe.py`, `hair.py`).
6. Out come `public/surfer/<name>.glb`, `public/surfer/<name>.manifest.json`, and turntable sheets in `previews/`
   (git-ignored).

The `.glb` files are committed, so `npm run dev`, `npm test` and the launcher never need Blender. Only rebuilding the
surfers does.

## Install (once)

1. Install Blender from https://www.blender.org/download/lts/ with the default options.
2. In Blender: Edit → Preferences → Get Extensions → search "MPFB" → Install. No other extension is needed.

Built with **Blender 5.2.2 LTS** and **MPFB 2.0.17** (see `api-probe.txt`).

## Commands

- `npm run build:surfers`: both surfers.
- `npm run build:surfers -- --only male`: one surfer.
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
