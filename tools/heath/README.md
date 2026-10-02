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

## Licence

Everything here and in `public/heath/` is project-made (see `public/heath/LICENSES.md`).
