# The heath kit

The dune up close's plants and ground, built offline (spec `docs/superpowers/specs/2026-10-02-dune-up-close-design.md`
§3.1). The output in `public/heath/` is committed, so `npm run dev`, `npm test` and the game never need Blender.

## Commands

- `npm run build:heath`: every plant kind × 4 variants at L0 (every branch and leaf) and L1 (main branches and
  leaf-cluster cards), the scatter's tufts and ground items, and the atlas. Writes `public/heath/heathKit.glb`,
  `heathKit.manifest.json` and `heathAtlas*.png`. Previews go to `tools/heath/previews/` (git-ignored).
- `npm run build:heath -- --only daisy`: one kind.
- `npm run build:heath -- --ground`: the ground layers only (`ground_layers.py`: Python 3 with numpy and Pillow, no
  Blender).

## How it works

1. **Hull export.** The launcher (`buildHeath.ts`) exports today's hull for every kind and shape from
   `src/heath/plants.ts` to `previews/hulls.json`. Each variant grows inside its own hull, so near and far plants share
   a silhouette.
2. **The build.** Blender runs `build.py` with `--factory-startup`, because the kit needs no extension. Built with
   Blender 5.2.2 LTS.
3. **The checks.** The manifest records each variant's checks (triangle caps, leaves on twigs, the silhouette against
   the hull, normals, AO). `src/heath/kit.test.ts` asserts them.
4. **The colour bleed.** `bleed.py` fills each atlas cell's clear texels with its leaves' colour, so the GPU's mips keep
   a leaf's colour at a distance (without it they faded toward black). `python tools/heath/bleed.py --check
   public/heath/heathAtlas.png` checks an atlas.

## After a rebuild: re-calibrate

The near, mid and far plants are matched in colour and coverage by two tables in `src/heath/KitMeshes.ts`, measured
on the GPU. After rebuilding the kit, re-measure them:

- `KIT_L1_CUT`: open `http://localhost:5177/?selftest=heath:%20a%20plant's%20coverage&fit=1`, and paste the table it
  prints (keep each value at 0.45 or more).
- `KIT_CALIBRATION`: open `?selftest=heath:%20each%20kind`; its "fit" multiplies the table's values. Fold it in and
  run again until it passes (two or three rounds).

## Licence

Everything here and in `public/heath/` is project-made (see `public/heath/LICENSES.md`).
