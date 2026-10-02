# Hair v2 (strand atlas) and Shazza's braids: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native) to implement this plan task by
> task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** real strands on every rider's hair cards from a baked atlas, and Shazza's low pigtail braids, dry and wet.

**Architecture:**
- A Blender script renders strand tiles into one RGBA atlas PNG.
- `hair.py` maps every card into a tile by role, and builds the braids as plaited tubes of cards with elastics.
- `hairMaterial` samples the atlas.
- The riders are rebuilt.

**Tech stack:** Blender 5.2 (curves, EEVEE orthographic renders), three 0.186 WebGPU and TSL, vitest, and the GPU
self-tests (`?selftest`).

**Spec:** `docs/superpowers/specs/2026-10-02-dune-select-design.md` §13.1, §13.2.

**Branch:** `face-hair` in `ld-surfer`. It merges to main after Andrew's gate (he said "merge face-hair after").

## Global constraints

- Assets must be project-made or CC0 (Steam). The atlas is rendered by our own build.
- The reference photos in `reference/` are git-ignored and never committed or published.
- Every limb and every braid must render in every pose: "be careful everything renders".
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files are CRLF in the worktree. Edit Python with line endings kept.

## Review focus

- The atlas's alpha mipmaps at distance: hair must not thin or vanish at 10 m or more.
- Wet braids against the swimwear: no braid inside the bikini or steamer.
- The braids in the carry pose (the arm under the board) and the wave: they must not pass through the arm.
- T-Bone's and Grommet's hair under hats still passes `hatHairUnder` after the UV change.
- Texture loading failure: the hair must still draw with a flat fallback, never black or missing.

---

### Task 1: The strand atlas bake

**Files:**
- Create `tools/surfer/hair_atlas.py`;
- create `src/surfer/hairAtlas.test.ts`;
- modify `tools/buildSurfers.ts` (a `--atlas` step, run before the riders);
- produces `public/surfer/hairAtlas.png` and `public/surfer/hairAtlas.json` (the tile table).

**Produces:**
- `HAIR_TILES`: an ordered list of `{ name, role, col, row }`, 8 columns × 2 rows;
- the tile UV rect = `((col + pad) / 8, (row + pad) / 2)` with pad = 8 / tile px;
- `hairAtlas.json`: `{ size: 2048, cols: 8, rows: 2, padPx: 8, tiles: [...] }`.

**Steps:**
- [ ] **Write the failing test** (`hairAtlas.test.ts`). Decode the PNG with `src/land/png.ts` and read the JSON. It
  asserts:
  - 2048²;
  - 16 tiles;
  - each tile's mean coverage is in 0.25–0.75, with zero coverage in its 8 px border;
  - G rises root → tip (the mean over strands at v = 0.1 is below that at v = 0.9);
  - B varies (std > 0.15) under covered pixels.
- [ ] Run `npx vitest run src/surfer/hairAtlas.test.ts`. Expected: FAIL (no file).
- [ ] **Implement `hair_atlas.py`.** Per tile:
  - a Blender curves object of 40–90 strands rooted along the tile's top edge;
  - each strand a polyline with a role-specific shape (straight, wave, flyaway arc, frayed, short fringe, braid surface
    twist, tail spray);
  - radius 35 µm, tapering to 10 µm at the tip.
  - **Four EEVEE orthographic renders** of the tile area (camera over the tile plane, transparent film), each with an
    emission material:
    - coverage (white);
    - intercept (Curves Info → Intercept), for G;
    - per-strand random (Curves Info → Random), for B;
    - depth (strands at z offsets in ±1 mm; emission = a normalised z), for A.
  - Pack the four renders into one RGBA PNG.
  - Write the tile table JSON.
- [ ] **Wire `buildSurfers.ts --atlas`** to run Blender on it.
- [ ] Run `npm run build:surfers -- --atlas`, then the test. Expected: PASS.
- [ ] Commit: `feat(build): the hair strand atlas, rendered from Blender curves (16 tiles, coverage/root/strand/depth)`.

### Task 2: Cards mapped into the atlas

**Files:**
- Modify `tools/surfer/hair.py` (`_cards_object` takes a role per card and maps UVs into a tile; the roles: core,
  outer, flyaway, fringe, tail);
- modify `src/surfer/manifest.test.ts`.

**Consumes:** Task 1's `hairAtlas.json` (read by `hair.py`).

**Steps:**
- [ ] **Failing test** (manifest, for each rider's `hair`, `hairDry` and `hairHat` meshes, read from the glb's UV
  accessor bounds and a per-card check):
  - every UV lies inside one tile's padded rect;
  - at least 4 distinct tiles are used per rider.
- [ ] **Implement:**
  - each card's role is chosen at creation (lock core vs. outer layer by its root's depth in the lock, flyaways from
    `_frizz`, fringe near the hairline, tails);
  - the role picks one of that role's tiles at random;
  - u maps into the tile's x range, v (root 0 → tip 1) into its y range;
  - COLOR_0.a = the tile index / 16.
- [ ] Rebuild all three (`npm run build:surfers`). Run the manifest tests. Expected: PASS. The existing tests stay
  green.
- [ ] Commit.

### Task 3: The shader samples the atlas

**Files:**
- Modify `src/surfer/surferShading.ts` (`hairMaterial(…, atlas?: THREE.Texture)`);
- modify `src/surfer/Surfer.ts` (load `surfer/hairAtlas.png` once, cache it, pass it in; on a load error use null);
- modify `src/surfer/hair.selftest.ts`.

**Steps:**
- [ ] **Failing GPU self-test:** "hair: strands read at 0.6 m". The hair region's local contrast (`speckle` cv) is at
  least 1.5× the pre-atlas render's (measured with the atlas forced off by passing null), and the existing four hair
  tests still pass.
- [ ] **Implement:**
  - coverage = atlas.r (with the alpha sharpened: `saturate((a − 0.5) / max(fwidth(a), 1e-4) + 0.5)` blended with the
    raw alpha by distance) × the root fade × the card-edge feather, two passes as now;
  - albedo = mix(root colour, tip colour, atlas.g) × (0.85 + 0.3 × atlas.b) × the per-card tone;
  - depth darkens (0.7 + 0.3 × atlas.a);
  - the strand lanes and the noise lines are dropped when the atlas is present;
  - texture: sRGB off (data), mipmaps on, anisotropy 8.
- [ ] **A distance self-test:** at 10 m, the dry hair's covered pixel count is within 20% of the same hair at 10 m with
  a 1 px coverage (no thinning).
- [ ] Run the self-tests (`?selftest=hair`). Expected: all PASS.
- [ ] Commit.

### Task 4: Shazza's braids (dry and wet)

**Files:**
- Modify `tools/surfer/hair.py` (style `braids`, with options `wet: bool`);
- modify `tools/surfer/presets/female.json` (`hair` and `dryHair` → braids);
- modify `tools/surfer/build.py` (the elastics, material `hairTie`; checks);
- modify `src/surfer/Surfer.ts` (the `hairTie` material: plastic, dark navy);
- modify `src/surfer/manifest.test.ts`.

**Steps:**
- [ ] **Failing manifest tests** for the female build:
  - `checks.braids` = 2;
  - each braid's end z between the clavicle bone − 4 cm and the clavicle bone − 22 cm;
  - each end in front of the shoulder (y ahead of the clavicle);
  - `checks.braidsOutside` true;
  - the `hairTie` material present;
  - the dry and wet hair both have braids (each mesh's lowest vertex well below the shoulders, on both sides).
- [ ] **Implement the geometry:**
  - **The scalp locks:** from the part, combed down and back over the ears to each braid's anchor (behind and below the
    ear, 1.5 cm out from the neck, at jaw height). Locks converge on the anchor along a curve, not straight.
  - **The front pieces:** the existing curtain locks, shortened to the jaw.
  - **Each braid:** a path from its anchor down over the front of the shoulder to the upper chest (pushed out of the
    body, the tee and the straps by the BVH, 1 cm clear).
    - Three strands, each lateral offset `w·sin(θ + 2πk/3)` and depth `d·sin(2(θ + 2πk/3))`, with θ advancing 2π per
      4 cm, w = 1.1 cm (tapering to 0.6 cm), d = 0.5 cm.
    - Each strand is a tube of six cards (braid tiles) around its path, with a few flyaway cards.
  - **The elastic:** a 6 mm torus at the braid end.
  - **The tail:** 4 cm of tail cards fanning out.
  - **Wet:** a 0.85× radius, darker (the wet uniform as now), the front pieces combed back behind the ears instead.
  - **Skin:** the head blend into the neck (as `_long_skin`), then spine_03 and the side's clavicle below the jaw.
- [ ] Rebuild the female. Run the tests. Expected: PASS. The other hair tests stay green.
- [ ] **Capture sheets:** front, 3/4, side and back at 0.6 m and 2 m, dry and wet, plus the carry pose and the wave.
  Check that no braid passes through the arm (and fix by the clearance if it does).
- [ ] Commit.

### Task 5: The gate and the merge

- [ ] The full suite, `tsc` and `npm run build`; the GPU self-tests (`?selftest`).
- [ ] Gate sheets for all three riders, sent to Andrew beside the reference.
- [ ] After his OK: merge `face-hair` into main, with the wave session's OK, and push only if he says so.
