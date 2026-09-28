# Phase 4a: The View Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real land behind the Womb, seen from the lineup: a hand-shaped beach, rust limestone band and heath climbing to the ridge from real elevation data, the coast running 15 km north and south into haze, lit with the scene's sun and sky, casting its shadow on the lineup until the sun clears the ridge (about 08:05 on the default date), and reflected in the water near the beach.

**Architecture:**
- A one-off Node script bakes the downloaded terrarium tiles into `public/terrain/womb-land.bin`: height grids, the real waterline per row and a sky-view factor.
- At load the app composes the land's height on the CPU (the waterline pinned at the reef, the beach profile, the data behind it) and builds one static, graded mesh with per-vertex cover weights.
- The seabed outside the reef map follows the new waterline.
- A GPU compute pass builds a top-down sunlight map from a height texture whenever the sun moves. The water, seabed, ribbon, particles and land multiply their sun term by it.
- A CPU skyline table, sent as a uniform array, lets the water reflect the land below the skyline.

**Tech Stack:** TypeScript (tsgo 7), three.js 0.186.1 WebGPU + TSL, vitest 5, Node 24 (native type stripping for the bake tool), the in-browser GPU self-tests (`/?selftest`).

**Spec:** `docs/superpowers/specs/2026-09-28-the-view-back-design.md` (approved by Andrew 2026-09-28)

## Global Constraints

- **Frame:** +X east, +Z south, y = 0 mean sea level, origin at the peak (-33.895216, 114.983359). Metres per degree: 111,320 of latitude, × cos(lat₀) of longitude.
- **Data:** AWS Terrain Tiles (Tilezen `elevation-tiles-prod`, terrarium PNG), height = R·256 + G + B/256 − 32768 m. The raw tiles stay in Claude's scratch folder (`…/scratchpad/dem/<zoom>/<x>_<y>.png`) and are **never committed**. Only `public/terrain/womb-land.bin` and `public/terrain/CREDITS.md` are committed.
- **Waterline:** x_s(z) = 190 m exactly for |z − (−75)| ≤ 600, blending to the smoothed real waterline over the next 400 m (smoothstep). The real waterline is smoothed with a 400 m moving average, with no clamp.
- **Beach profile** (d = metres inland of x_s):
  - wet sand 0–12 m, rising −0.5 → 0.8 m;
  - dry beach 12–40 m, 0.8 → 2.5 m (gently concave);
  - limestone toe 40–55 m, 2.5 → 6 m;
  - face and blend into the data 55–120 m.
- **Seabed outside the reef map:** depth = depthBg(x − (x_s(z) − 190)); inside the map, unchanged. The wave model (far field, set waves, breaking) is unchanged.
- **Sunlight map:**
  - coverage x ∈ [−600, 2400], z ∈ [−4000, 4000] at 8 m, rgba16float, 1 outside;
  - march up to 4 km; soft edge = the sun's angular radius + 0.004 rad;
  - rebuilt when the sun moves > 0.05°.
- **Skyline table:** 360 bearings, a uniform array (not a texture), rebuilt when the camera moves > 25 m.
- **WebGPU baseline:** ≤ 8 storage buffers and ≤ 16 sampled textures per shader stage; ≤ 12 uniform buffers per stage. Don't raise requiredLimits. The water's above-surface material binds 13 sampled textures today; the sunlight map may add exactly one.
- **Cost:**
  - land draw ≤ 1 ms GPU;
  - sunlight rebuild ≤ 5 ms;
  - skyline rebuild ≤ 5 ms CPU;
  - load (fetch, compose, mesh) ≤ 1.5 s.
- **Repo rules:**
  - `reference/` is never committed;
  - stage files by path;
  - never commit `.superpowers/`;
  - every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - branch `phase-4a-the-view-back`; pushes are authorised; **do not merge without Andrew**.

## Plan rulings (made while planning, against the spec)

- **P1, fine grid extent:** x ∈ [−800, 2400], not [100, 2400]. 2–3 km north the DEM's waterline is at x ≈ −300…−600, so a grid starting at 100 would cut the coast off. This costs 0.7 MB more data.
- **P2, the waterline rule (spec Ruling L8):**
  - **Finding:** Andrew's 2 km aerial has no compass. It agrees with the DEM at the Womb (190 vs 176) but disagrees by up to ~290 m 2 km north, so it can't calibrate the far checkpoints.
  - **What we use instead:** the DEM's own coast signal. SRTM's water mask leaves a sea-level trough (< 0.5 m) at the true coast, between the smeared sea band and the land.
  - **Per row:** find the first sample above 10 m, walk back west to the nearest sample below 0.5 m, and take one cell east of it as the waterline. With no trough, use the first crossing of 3 m.
  - **Smoothing:** a median over ±12 rows (100 m) in the bake, then the runtime's 400 m average.
  - **Checks:** the Womb checkpoint (x_r(0) within 190 ± 30) is a test. The far coast is judged by Andrew in the gallery.
- **P3, data layout:** 16-bit heights (0.05 m steps), an 8-bit sky-view grid at 16 m, and f32 waterlines, about 3.8 MB. The spec estimated 2–3 MB before P1.
- **P4, no GPU height composition:** the mesh is built on the CPU with heights in the vertex buffer, so there is no TSL mirror of the composed height. The spec's "GPU composed height matches CPU" self-test is replaced by Task 8's GPU sunlight self-test. It reads the height texture through the whole march and compares against the CPU march over the same heights, so a wrong texture, origin or filter fails it.
- **P5, sky-view factor:** baked from the DEM at 16 m (spec §4.5 said per vertex from the heightfield). Per vertex at load would cost seconds; the bake has time.
- **P6, mesh size:** six nested levels (2, 4, 8, 16, 32, 64 m) with the sea culled come to about 650k triangles, not the spec's ~400k estimate. The cost target that matters is the draw (≤ 1 ms GPU), which Task 10 measures. A unit test caps the mesh at 750k triangles.
- **P7, underwater view:** the underwater view's seabed and Snell's window stay unshadowed by the land (spec §4.8 lists only the view from above). It would cost textures in materials that don't need them yet.
- **P8, reflection geometry:** the skyline table stores each bearing's skyline point (distance, curvature-corrected height) seen from the camera. The shader recomputes the elevation from each water point along the bearing, because a point 150 m closer to the ridge sees it much higher.
- **P9, the reversed depth buffer** (spec L7) is already on (`createRenderer.ts`). Task 10 only checks the far waterline in captures.
- **P10, seabed shift reaches the waves' shallow fade:** `Seabed.waterDepthNode` feeds the FFT's shallow-water fade, so shifting the seabed also fades the swell before the shifted beaches. It is consistent with the land, so it stays.

## Review Focus

1. **The land file fails to load** (404, offline, a stale or corrupt file): the game runs landless with one console warning, the seabed unshifted, nothing thrown into the frame loop. Pinned by Task 6's `Land.load` rejection test.
2. **Scrubbing time fast across dawn, the sunbreak or into night:** at most one sunlight rebuild per frame, and no NaN when the sun is straight overhead or below the horizon. Pinned by Task 7's overhead, below-horizon and `sunMoved` tests, and by `SunlightMap.update`'s one-march-per-call structure (Task 8).
3. **The free camera high or far away** (overview 40 m up, a drone 300 m up): the skyline rebuilds at most once per 25 m moved, elevations go negative when the eye is above the ridge, and the reflection's land cover falls to 0. Pinned by Task 9's high-eye test.
4. **Tide at its extremes (±1.5 m):** the land mesh's seaward edge stays under water at −1.5 m, and the beach stays continuous with the seabed. Pinned by Task 5's seaward-edge test.
5. **Stored dev settings from before this phase** (no `land` key, or a partial one): the Land folder loads its defaults and nothing else changes. Pinned by Task 6's settings test.

---

## File structure

| File | Responsibility |
|---|---|
| `src/land/png.ts` (+test) | Minimal PNG decoder (8-bit RGB/RGBA) and the terrarium formula. No imports. |
| `src/land/landData.ts` (+test) | The `.bin` format: `GridSpec`, `LandFile`, `encodeLandFile`, `decodeLandFile`. No imports. |
| `src/land/bake.ts` (+test) | Tile geometry, mosaic sampling, row waterlines, median filter, sky-view grid. Type-only imports. |
| `tools/bakeTerrain.ts` | Node script: tiles → `public/terrain/womb-land.bin`. |
| `src/land/bakedLand.testutil.ts` | Test-only reader for the committed `.bin` (vitest runs in Node). |
| `src/land/landHeight.ts` (+test) | `LandHeight`: the waterline curves, the beach profile, the composed height. |
| `src/land/landCover.ts` (+test) | Cover weights from distance inland, slope and noise. |
| `src/land/landMesh.ts` (+test) | The graded, stitched, sea-culled static mesh with its attributes. |
| `src/land/landParams.ts` (+test) | `LandParams`, defaults, ranges, normalize. |
| `src/land/landShading.ts` | The land's TSL material. |
| `src/land/sunlight.ts` (+test) | CPU sunlight: the march height grid, the sampler, `sunVisibility`, `sunMoved`. |
| `src/land/SunlightMap.ts` | The GPU sunlight map and `visibilityNode`. |
| `src/land/skyline.ts` (+test) | CPU skyline table and the per-point elevation/cover mirrors. |
| `src/land/SkylineTable.ts` | The uniform array and `reflectionNode`. |
| `src/land/Land.ts` (+test) | Owns load, `LandHeight`, mesh, material, sunlight map, skyline table. |
| `src/land/land.selftest.ts` | GPU self-tests. |
| Changed | `bathymetry.ts`, `Seabed.ts`, `seabed.selftest.ts`, `seabedShading.ts`, `waterShading.ts`, `OceanSurface.ts`, `BreakingRibbon.ts`, `SprayParticles.ts`, `App.ts`, `DevPanel.ts`, `devSettings.ts`, `referenceMoments.ts`, `selfTests.ts`, `BreakingRibbon.limits.test.ts` and their tests. |

Run commands (PowerShell or bash; from the repo root):
- one test file: `npx vitest run src/land/png.test.ts`
- full suite: `npx vitest run` (redirect to a file and read its tail)
- typecheck: `npx tsc --noEmit`
- GPU self-tests: the `liquid-dreams` dev server (`.claude/launch.json`), then `http://localhost:5173/?selftest` with the pane **visible**, and read the `[selftest] SUMMARY` console line.

---

### Task 1: The PNG decoder

**Files:**
- Create: `src/land/png.ts`
- Test: `src/land/png.test.ts`

**Interfaces:**
- Produces: `decodePng(bytes: Uint8Array): Promise<{ width: number; height: number; rgba: Uint8Array }>`, `terrariumHeight(r: number, g: number, b: number): number`.

- [ ] **Step 1: Write the failing test** (`src/land/png.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { decodePng, terrariumHeight } from './png';

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([new Uint8Array(data)]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out; // CRC left zero: the decoder doesn't check it
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A test encoder: row y uses filters[y % filters.length] (the forward filters, from the unfiltered neighbours). */
async function encodePng(w: number, h: number, channels: 3 | 4, px: Uint8Array, filters: number[], depth = 8): Promise<Uint8Array> {
  const stride = w * channels, raw = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length];
    raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w); iv.setUint32(4, h);
  ihdr[8] = depth; ihdr[9] = channels === 3 ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const pixels = (n: number, seed: number): Uint8Array => {
  const a = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a[i] = s >>> 24; }
  return a;
};

describe('decodePng', () => {
  it('decodes 8-bit RGB through every filter type', async () => {
    const px = pixels(7 * 5 * 3, 1);
    const png = await encodePng(7, 5, 3, px, [0, 1, 2, 3, 4]);
    const d = await decodePng(png);
    expect([d.width, d.height]).toEqual([7, 5]);
    for (let i = 0; i < 35; i++) {
      expect([d.rgba[i * 4], d.rgba[i * 4 + 1], d.rgba[i * 4 + 2], d.rgba[i * 4 + 3]]).toEqual([px[i * 3], px[i * 3 + 1], px[i * 3 + 2], 255]);
    }
  });
  it('decodes 8-bit RGBA', async () => {
    const px = pixels(4 * 3 * 4, 2);
    const d = await decodePng(await encodePng(4, 3, 4, px, [4, 3, 1]));
    expect(Array.from(d.rgba)).toEqual(Array.from(px));
  });
  it('rejects what the tiles never use (16-bit) and non-PNGs', async () => {
    await expect(decodePng(await encodePng(2, 2, 3, pixels(12, 3), [0], 16))).rejects.toThrow(/unsupported/);
    await expect(decodePng(new Uint8Array(16))).rejects.toThrow(/not a PNG/);
  });
});

describe('terrariumHeight', () => {
  it('is R·256 + G + B/256 − 32768', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(127, 255, 128)).toBe(-0.5);
    expect(terrariumHeight(128, 100, 64)).toBe(100.25);
  });
});
```

- [ ] **Step 2: Run it:** `npx vitest run src/land/png.test.ts`. Expected: FAIL, cannot resolve `./png`.

- [ ] **Step 3: Implement** `src/land/png.ts`:

```ts
/**
 * A minimal PNG decoder for the terrain tiles (8-bit RGB or RGBA, non-interlaced; spec 2026-09-28-the-view-back-design.md
 * §3). No imports, so tools/bakeTerrain.ts runs it under plain Node and vitest tests it. The zlib stream is inflated with
 * DecompressionStream; chunk CRCs are not checked.
 */
export interface DecodedPng {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel (alpha 255 for RGB). */
  rgba: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  if (bytes.length < 8 || SIGNATURE.some((s, i) => bytes[i] !== s)) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, channels = 0;
  const idat: Uint8Array[] = [];
  for (let p = 8; p + 8 <= bytes.length;) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      const depth = body[8], colour = body[9], interlace = body[12];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
        throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${colour}, interlace ${interlace})`);
      }
      channels = colour === 2 ? 3 : 4;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!channels) throw new Error('PNG has no IHDR');
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of idat) { joined.set(c, o); o += c.length; }
  const raw = await inflate(joined);
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) throw new Error('PNG data truncated');
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error(`bad PNG filter ${filter}`);
    const src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[row + x - channels] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = x >= channels && y > 0 ? px[prev + x - channels] : 0;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      px[row + x] = (raw[src + x] + pred) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = px[i * channels];
    rgba[i * 4 + 1] = px[i * channels + 1];
    rgba[i * 4 + 2] = px[i * channels + 2];
    rgba[i * 4 + 3] = channels === 4 ? px[i * channels + 3] : 255;
  }
  return { width, height, rgba };
}

/** Terrarium encoding (Tilezen): height (m) = R·256 + G + B/256 − 32768. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}
```

- [ ] **Step 4: Run it:** `npx vitest run src/land/png.test.ts`. Expected: PASS (4 tests). Then `npx tsc --noEmit`: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/land/png.ts src/land/png.test.ts
git commit -m "feat(land): a minimal PNG decoder for the terrain tiles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The bake and the land file

**Files:**
- Create: `src/land/landData.ts`, `src/land/landData.test.ts`, `src/land/bake.ts`, `src/land/bake.test.ts`, `src/land/bakedLand.testutil.ts`, `tools/bakeTerrain.ts`, `public/terrain/womb-land.bin` (generated), `public/terrain/CREDITS.md`

**Interfaces:**
- Consumes: `decodePng`, `terrariumHeight` (Task 1).
- Produces:
  - `landData.ts`:
    - `GridSpec { x0; z0; cellM; nx; nz }` (sample i at x0 + i·cellM);
    - `LandFile { fine; ring; sky: GridSpec; fineHeights; ringHeights; skyView; fineWaterline; ringWaterline: Float32Array }`;
    - `encodeLandFile(f): Uint8Array`, `decodeLandFile(bytes): LandFile`;
    - `LAND_MAGIC`, `LAND_VERSION`, `HEIGHT_STEP_M`.
  - `bake.ts`:
    - `LAT0`, `LON0`, `M_PER_DEG_LAT`, `M_PER_DEG_LON`;
    - `FINE_GRID`, `RING_GRID`, `SKY_GRID`;
    - `worldToLatLon`, `latLonToTile`, `tileRange`, `TileMosaic`, `sampleMosaic`, `sampleGrid`, `gridSampler`;
    - `rowWaterline`, `medianFilter`, `gridWaterlines`, `skyViewGrid`;
    - `SEA_TROUGH_M`, `LAND_RISE_M`, `FALLBACK_CROSS_M`.
  - `bakedLand.testutil.ts`: `readBakedLand(): Uint8Array`.

- [ ] **Step 1: Write the failing tests.**

`src/land/landData.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HEIGHT_STEP_M, type LandFile, decodeLandFile, encodeLandFile } from './landData';

const grid = (x0: number, nx: number, nz: number, cellM = 4) => ({ x0, z0: -8, cellM, nx, nz });

function sample(): LandFile {
  const fine = grid(-8, 5, 3), ring = grid(-64, 3, 4, 32), sky = grid(-8, 2, 2, 16);
  return {
    fine, ring, sky,
    fineHeights: Float32Array.from({ length: 15 }, (_, i) => i * 7.31 - 3),
    ringHeights: Float32Array.from({ length: 12 }, (_, i) => i * 50.02),
    skyView: Float32Array.from([1, 0.5, 0.25, 0.9]),
    fineWaterline: Float32Array.from([190, NaN, 176.5]),
    ringWaterline: Float32Array.from([100, 120, NaN, 140]),
  };
}

describe('the land file', () => {
  it('round-trips: heights to 0.05 m (negative stored as 0), sky view to 1/255, waterlines exactly (NaN kept)', () => {
    const f = sample();
    const g = decodeLandFile(encodeLandFile(f));
    expect([g.fine, g.ring, g.sky]).toEqual([f.fine, f.ring, f.sky]);
    f.fineHeights.forEach((h, i) => expect(Math.abs(g.fineHeights[i] - Math.max(0, h))).toBeLessThanOrEqual(HEIGHT_STEP_M / 2 + 1e-6));
    f.ringHeights.forEach((h, i) => expect(Math.abs(g.ringHeights[i] - h)).toBeLessThanOrEqual(HEIGHT_STEP_M / 2 + 1e-6));
    f.skyView.forEach((v, i) => expect(Math.abs(g.skyView[i] - v)).toBeLessThanOrEqual(1 / 510 + 1e-6));
    expect(Array.from(g.fineWaterline)).toEqual([190, NaN, 176.5]);
    expect(Array.from(g.ringWaterline)).toEqual([100, 120, NaN, 140]);
  });
  it('is deterministic', () => {
    expect(Array.from(encodeLandFile(sample()))).toEqual(Array.from(encodeLandFile(sample())));
  });
  it('rejects a wrong magic, a wrong version and a truncated file', () => {
    const bytes = encodeLandFile(sample());
    const badMagic = bytes.slice(); badMagic[0] ^= 0xff;
    expect(() => decodeLandFile(badMagic)).toThrow(/magic/);
    const badVersion = bytes.slice(); badVersion[4] = 99;
    expect(() => decodeLandFile(badVersion)).toThrow(/version/);
    expect(() => decodeLandFile(bytes.slice(0, bytes.length - 3))).toThrow(/size/);
  });
});
```

`src/land/bake.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FINE_GRID, LAT0, LON0, M_PER_DEG_LAT, RING_GRID, type TileMosaic, gridSampler, latLonToTile, medianFilter, rowWaterline, sampleMosaic,
  skyViewGrid, tileRange, worldToLatLon,
} from './bake';

describe('tile geometry', () => {
  it('maps world metres to latitude and longitude around the peak', () => {
    expect(worldToLatLon(0, 0)).toEqual([LAT0, LON0]);
    const [lat] = worldToLatLon(0, 1000);
    expect((LAT0 - lat) * M_PER_DEG_LAT).toBeCloseTo(1000, 6); // +z is south
  });
  it('puts the peak where the downloaded tiles say (zoom 15: 26850.04, 19666.72)', () => {
    const [tx, ty] = latLonToTile(LAT0, LON0, 15);
    expect(tx).toBeCloseTo(26850.04, 2);
    expect(ty).toBeCloseTo(19666.72, 2);
  });
  it('lists the tiles the grids need (exactly the downloaded sets)', () => {
    expect(tileRange(FINE_GRID, 15)).toEqual({ tx0: 26847, ty0: 19662, tx1: 26853, ty1: 19670 });
    const r = tileRange(RING_GRID, 12);
    expect(r.tx0).toBeGreaterThanOrEqual(3355); expect(r.tx1).toBeLessThanOrEqual(3356);
    expect(r.ty0).toBeGreaterThanOrEqual(2456); expect(r.ty1).toBeLessThanOrEqual(2460);
  });
  it('samples a mosaic bilinearly between pixel centres, NaN outside', () => {
    const [tx, ty] = latLonToTile(LAT0, LON0, 15);
    const m: TileMosaic = { zoom: 15, tx0: Math.floor(tx), ty0: Math.floor(ty), cols: 1, rows: 1, heights: new Float32Array(256 * 256) };
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) m.heights[j * 256 + i] = i; // height = pixel column
    const px = (tx - Math.floor(tx)) * 256 - 0.5;
    expect(sampleMosaic(m, 0, 0)).toBeCloseTo(px, 3);
    expect(Number.isNaN(sampleMosaic(m, 50000, 0))).toBe(true);
  });
});

describe('rowWaterline (plan ruling P2)', () => {
  const cell = 4, x0 = 0;
  it('finds the sea-level trough between the smeared sea band and the land', () => {
    // sea 0, smear 2–6 m, trough < 0.5 at index 10, then land rising
    const row = [0, 0, 1, 3, 5, 6, 5, 4, 3, 2, 0.2, 1, 4, 8, 12, 20, 30];
    expect(rowWaterline(row, x0, cell)).toBe(44); // one cell east of index 10
  });
  it('falls back to the first 3 m crossing when there is no trough', () => {
    const row = [0, 1, 2, 2.5, 3.5, 6, 11, 20];
    expect(rowWaterline(row, x0, cell)).toBe(16);
  });
  it('is NaN for a row with no land', () => {
    expect(Number.isNaN(rowWaterline([0, 1, 2, 3, 0], x0, cell))).toBe(true);
  });
  it('the median filter removes a lone outlier and skips NaN', () => {
    const a = Float32Array.from([190, 191, 189, -300, 190, 192, NaN, 191]);
    const m = medianFilter(a, 2);
    expect(m[3]).toBeGreaterThan(185);
    expect(m[6]).toBeGreaterThan(185);
  });
});

describe('skyViewGrid', () => {
  it('is 1 on open flat ground and lower at the foot of a wall', () => {
    const flat = skyViewGrid(() => 0, { x0: 0, z0: 0, cellM: 16, nx: 2, nz: 2 });
    expect(Math.min(...flat)).toBeCloseTo(1, 6);
    const wall = skyViewGrid((x) => (x > 40 ? 200 : 0), { x0: 0, z0: 0, cellM: 16, nx: 2, nz: 1 });
    expect(wall[0]).toBeLessThan(0.95);
  });
  it('gridSampler is bilinear over a GridSpec and 0 outside', () => {
    const s = gridSampler({ x0: 0, z0: 0, cellM: 10, nx: 2, nz: 2 }, Float32Array.from([0, 10, 20, 30]));
    expect(s(5, 5)).toBeCloseTo(15, 6);
    expect(s(-1, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them:** `npx vitest run src/land/landData.test.ts src/land/bake.test.ts`. Expected: FAIL, the modules don't exist.

- [ ] **Step 3: Implement** `src/land/landData.ts`:

```ts
/**
 * The baked land file (spec 2026-09-28-the-view-back-design.md §4.2; plan ruling P3), little-endian:
 *   u32 magic 'WLND', u32 version, 3 × grid (f32 x0, z0, cellM; u32 nx, nz): fine, ring, sky;
 *   u16 fine heights, u16 ring heights (HEIGHT_STEP_M steps, negative stored as 0); u8 sky view (/255);
 *   f32 fine waterline (per fine row), f32 ring waterline (per ring row; NaN where a row has no land).
 * No imports: tools/bakeTerrain.ts runs this under plain Node.
 */
export interface GridSpec {
  /** Sample i is at x0 + i·cellM (m), sample j at z0 + j·cellM. */
  x0: number;
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

export interface LandFile {
  fine: GridSpec;
  ring: GridSpec;
  sky: GridSpec;
  fineHeights: Float32Array;
  ringHeights: Float32Array;
  skyView: Float32Array;
  fineWaterline: Float32Array;
  ringWaterline: Float32Array;
}

export const LAND_MAGIC = 0x444e4c57; // 'WLND' read as a little-endian u32
export const LAND_VERSION = 1;
export const HEIGHT_STEP_M = 0.05;
const GRID_BYTES = 20;
const HEADER_BYTES = 8 + 3 * GRID_BYTES;

const count = (g: GridSpec): number => g.nx * g.nz;

function byteSize(fine: GridSpec, ring: GridSpec, sky: GridSpec): number {
  return HEADER_BYTES + 2 * (count(fine) + count(ring)) + count(sky) + 4 * (fine.nz + ring.nz);
}

export function encodeLandFile(f: LandFile): Uint8Array {
  const out = new Uint8Array(byteSize(f.fine, f.ring, f.sky));
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint32(o, LAND_MAGIC, true); o += 4;
  v.setUint32(o, LAND_VERSION, true); o += 4;
  for (const g of [f.fine, f.ring, f.sky]) {
    v.setFloat32(o, g.x0, true); v.setFloat32(o + 4, g.z0, true); v.setFloat32(o + 8, g.cellM, true);
    v.setUint32(o + 12, g.nx, true); v.setUint32(o + 16, g.nz, true);
    o += GRID_BYTES;
  }
  for (const hs of [f.fineHeights, f.ringHeights]) {
    for (let i = 0; i < hs.length; i++) {
      v.setUint16(o, Math.min(65535, Math.round(Math.max(0, hs[i]) / HEIGHT_STEP_M)), true);
      o += 2;
    }
  }
  for (let i = 0; i < f.skyView.length; i++) out[o++] = Math.round(Math.min(1, Math.max(0, f.skyView[i])) * 255);
  for (const w of [f.fineWaterline, f.ringWaterline]) {
    for (let i = 0; i < w.length; i++) { v.setFloat32(o, w[i], true); o += 4; }
  }
  return out;
}

export function decodeLandFile(bytes: Uint8Array): LandFile {
  if (bytes.length < HEADER_BYTES) throw new Error('land file: size too small for the header');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== LAND_MAGIC) throw new Error('land file: bad magic');
  if (v.getUint32(4, true) !== LAND_VERSION) throw new Error(`land file: version ${v.getUint32(4, true)}, expected ${LAND_VERSION}`);
  let o = 8;
  const grids: GridSpec[] = [];
  for (let k = 0; k < 3; k++) {
    grids.push({ x0: v.getFloat32(o, true), z0: v.getFloat32(o + 4, true), cellM: v.getFloat32(o + 8, true), nx: v.getUint32(o + 12, true), nz: v.getUint32(o + 16, true) });
    o += GRID_BYTES;
  }
  const [fine, ring, sky] = grids;
  if (bytes.length !== byteSize(fine, ring, sky)) throw new Error(`land file: size ${bytes.length}, expected ${byteSize(fine, ring, sky)}`);
  const heights = (n: number): Float32Array => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) { a[i] = v.getUint16(o, true) * HEIGHT_STEP_M; o += 2; }
    return a;
  };
  const fineHeights = heights(count(fine)), ringHeights = heights(count(ring));
  const skyView = new Float32Array(count(sky));
  for (let i = 0; i < skyView.length; i++) skyView[i] = bytes[o++] / 255;
  const floats = (n: number): Float32Array => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) { a[i] = v.getFloat32(o, true); o += 4; }
    return a;
  };
  return { fine, ring, sky, fineHeights, ringHeights, skyView, fineWaterline: floats(fine.nz), ringWaterline: floats(ring.nz) };
}
```

`src/land/bake.ts`:

```ts
import type { GridSpec } from './landData';

/**
 * The terrain bake (spec 2026-09-28-the-view-back-design.md §3, §4.1–4.2; plan rulings P1, P2, P5): terrarium tiles →
 * the land's height grids, the real waterline per row and the sky-view factor. Type-only imports (erased under Node's
 * type stripping), so tools/bakeTerrain.ts runs this under plain Node and vitest tests it directly.
 */
export const LAT0 = -33.895216;
export const LON0 = 114.983359;
export const M_PER_DEG_LAT = 111320;
export const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);

/** 4 m, x ∈ [−800, 2400], z ∈ [−4000, 4000] (plan ruling P1: from −800, the coast 2–3 km north is west of 100). */
export const FINE_GRID: GridSpec = { x0: -800, z0: -4000, cellM: 4, nx: 801, nz: 2001 };
/** 32 m, x ∈ [−3000, 5992], z ∈ [−15000, 14984]: the outer ring (spec L1). */
export const RING_GRID: GridSpec = { x0: -3000, z0: -15000, cellM: 32, nx: 282, nz: 938 };
/** The sky-view factor: the fine grid's extent at 16 m (plan ruling P5). */
export const SKY_GRID: GridSpec = { x0: -800, z0: -4000, cellM: 16, nx: 201, nz: 501 };

export function worldToLatLon(x: number, z: number): [number, number] {
  return [LAT0 - z / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
}

/** Fractional web-mercator tile coordinates at a zoom level. */
export function latLonToTile(lat: number, lon: number, zoom: number): [number, number] {
  const n = 2 ** zoom, r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

/** The whole tiles covering a grid's world box at a zoom. */
export function tileRange(g: GridSpec, zoom: number): { tx0: number; ty0: number; tx1: number; ty1: number } {
  const x1 = g.x0 + (g.nx - 1) * g.cellM, z1 = g.z0 + (g.nz - 1) * g.cellM;
  const [ax, ay] = latLonToTile(...worldToLatLon(g.x0, g.z0), zoom);
  const [bx, by] = latLonToTile(...worldToLatLon(x1, z1), zoom);
  return { tx0: Math.floor(Math.min(ax, bx)), ty0: Math.floor(Math.min(ay, by)), tx1: Math.floor(Math.max(ax, bx)), ty1: Math.floor(Math.max(ay, by)) };
}

/** Whole tiles at one zoom decoded to heights (m), row-major over (cols·256) × (rows·256) pixels. */
export interface TileMosaic {
  zoom: number;
  tx0: number;
  ty0: number;
  cols: number;
  rows: number;
  heights: Float32Array;
}

/** Bilinear height at world (x, z), between pixel centres; NaN outside the mosaic. */
export function sampleMosaic(m: TileMosaic, x: number, z: number): number {
  const [tx, ty] = latLonToTile(...worldToLatLon(x, z), m.zoom);
  const w = m.cols * 256, h = m.rows * 256;
  const px = (tx - m.tx0) * 256 - 0.5, py = (ty - m.ty0) * 256 - 0.5;
  if (!(px >= 0 && py >= 0 && px <= w - 1 && py <= h - 1)) return NaN;
  const i = Math.min(w - 2, Math.floor(px)), j = Math.min(h - 2, Math.floor(py));
  const fx = px - i, fy = py - j, k = j * w + i, H = m.heights;
  return (H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fy) + (H[k + w] * (1 - fx) + H[k + w + 1] * fx) * fy;
}

/** The mosaic resampled onto a grid (NaN → 0). */
export function sampleGrid(m: TileMosaic, g: GridSpec): Float32Array {
  const out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const h = sampleMosaic(m, g.x0 + i * g.cellM, g.z0 + j * g.cellM);
      out[j * g.nx + i] = Number.isFinite(h) ? h : 0;
    }
  }
  return out;
}

/** Bilinear sampler over a grid's samples; 0 outside it. */
export function gridSampler(g: GridSpec, h: ArrayLike<number>): (x: number, z: number) => number {
  return (x, z) => {
    const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
    if (!(fx >= 0 && fz >= 0 && fx <= g.nx - 1 && fz <= g.nz - 1)) return 0;
    const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j, k = j * g.nx + i;
    return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
  };
}

/** SRTM's water mask leaves a trough below this at the true coast (plan ruling P2). */
export const SEA_TROUGH_M = 0.5;
/** A row's land has clearly begun once its height passes this. */
export const LAND_RISE_M = 10;
/** Without a trough, the waterline is the first crossing of this height. */
export const FALLBACK_CROSS_M = 3;

/**
 * The real waterline along one row (heights west → east, `cellM` apart from `x0`): the first sample above LAND_RISE_M,
 * then back west to the nearest sample below SEA_TROUGH_M; the waterline is one cell east of it. Without a trough, the
 * first crossing of FALLBACK_CROSS_M. NaN for a row with no land.
 */
export function rowWaterline(row: ArrayLike<number>, x0: number, cellM: number): number {
  let rise = -1;
  for (let i = 0; i < row.length; i++) if (row[i] > LAND_RISE_M) { rise = i; break; }
  if (rise < 0) return NaN;
  for (let i = rise; i >= 0; i--) if (row[i] < SEA_TROUGH_M) return x0 + (i + 1) * cellM;
  for (let i = 0; i <= rise; i++) if (row[i] > FALLBACK_CROSS_M) return x0 + i * cellM;
  return x0 + rise * cellM;
}

/** Median over `half` samples each side, ignoring NaN (NaN only where the whole window is NaN). */
export function medianFilter(a: Float32Array, half: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const w: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(a.length - 1, i + half); k++) if (Number.isFinite(a[k])) w.push(a[k]);
    if (w.length === 0) { out[i] = NaN; continue; }
    w.sort((p, q) => p - q);
    out[i] = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
  }
  return out;
}

/** Each row's waterline, median-filtered over ±`half` rows. */
export function gridWaterlines(g: GridSpec, h: Float32Array, half: number): Float32Array {
  const raw = new Float32Array(g.nz);
  for (let j = 0; j < g.nz; j++) raw[j] = rowWaterline(h.subarray(j * g.nx, (j + 1) * g.nx), g.x0, g.cellM);
  return medianFilter(raw, half);
}

const SKY_DIRS = 8;
const SKY_STEPS = 12;

/**
 * The fraction of the sky a point 1 m above the ground sees: over 8 directions, the mean of 1 − sin(max(0, horizon)),
 * with the horizon found at 16 m to ~1 km (16·1.45^k). 1 on open ground; lower in gullies and at the foot of slopes.
 */
export function skyViewGrid(sample: (x: number, z: number) => number, g: GridSpec): Float32Array {
  const out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cellM, z = g.z0 + j * g.cellM;
      const h0 = Math.max(sample(x, z), 0) + 1;
      let sum = 0;
      for (let d = 0; d < SKY_DIRS; d++) {
        const a = (d / SKY_DIRS) * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
        let best = 0;
        for (let k = 0; k < SKY_STEPS; k++) {
          const r = 16 * 1.45 ** k;
          best = Math.max(best, Math.atan((sample(x + dx * r, z + dz * r) - h0) / r));
        }
        sum += 1 - Math.sin(best);
      }
      out[j * g.nx + i] = sum / SKY_DIRS;
    }
  }
  return out;
}
```

`src/land/bakedLand.testutil.ts`:

```ts
/**
 * Test-only: the committed land file, read from disk. vitest runs in Node, but the app's tsconfig carries no Node types,
 * so Node's fs is reached through process.getBuiltinModule (Node 22+).
 */
export function readBakedLand(): Uint8Array {
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
  const fs = proc.getBuiltinModule('node:fs') as { readFileSync(p: URL): Uint8Array };
  return new Uint8Array(fs.readFileSync(new URL('../../public/terrain/womb-land.bin', import.meta.url)));
}
```

`tools/bakeTerrain.ts`:

```ts
// Bakes the terrarium tiles into public/terrain/womb-land.bin (spec 2026-09-28-the-view-back-design.md §4.2).
// Run from the repo root:  node tools/bakeTerrain.ts <tile folder>
// The folder holds <zoom>/<x>_<y>.png (zoom 15 for the fine grid, 12 for the ring). The tiles are never committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FINE_GRID, RING_GRID, SKY_GRID, type TileMosaic, gridSampler, gridWaterlines, sampleGrid, skyViewGrid, tileRange } from '../src/land/bake.ts';
import { decodeLandFile, encodeLandFile } from '../src/land/landData.ts';
import { decodePng, terrariumHeight } from '../src/land/png.ts';

async function mosaic(dir: string, zoom: number, grid: typeof FINE_GRID): Promise<TileMosaic> {
  const r = tileRange(grid, zoom);
  const cols = r.tx1 - r.tx0 + 1, rows = r.ty1 - r.ty0 + 1, w = cols * 256;
  const heights = new Float32Array(w * rows * 256);
  for (let ty = r.ty0; ty <= r.ty1; ty++) {
    for (let tx = r.tx0; tx <= r.tx1; tx++) {
      const file = join(dir, String(zoom), `${tx}_${ty}.png`);
      const png = await decodePng(new Uint8Array(readFileSync(file)));
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const p = (j * 256 + i) * 4;
          heights[((ty - r.ty0) * 256 + j) * w + (tx - r.tx0) * 256 + i] = terrariumHeight(png.rgba[p], png.rgba[p + 1], png.rgba[p + 2]);
        }
      }
    }
  }
  return { zoom, tx0: r.tx0, ty0: r.ty0, cols, rows, heights };
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/bakeTerrain.ts <tile folder>'); process.exit(2); }
const fineHeights = sampleGrid(await mosaic(dir, 15, FINE_GRID), FINE_GRID);
const ringHeights = sampleGrid(await mosaic(dir, 12, RING_GRID), RING_GRID);
const fineWaterline = gridWaterlines(FINE_GRID, fineHeights, 12);
const ringWaterline = gridWaterlines(RING_GRID, ringHeights, 3);
const skyView = skyViewGrid(gridSampler(FINE_GRID, fineHeights), SKY_GRID);
const bytes = encodeLandFile({ fine: FINE_GRID, ring: RING_GRID, sky: SKY_GRID, fineHeights, ringHeights, skyView, fineWaterline, ringWaterline });
decodeLandFile(bytes); // self-check
const row0 = Math.round((0 - FINE_GRID.z0) / FINE_GRID.cellM);
const womb = fineWaterline[row0];
console.log(`waterline at z = 0: ${womb.toFixed(1)} m (checkpoint 190 ± 30)`);
for (const z of [-3000, -2000, -1000, -500, 500, 1000, 2000, 3000]) {
  console.log(`  z = ${z}: ${fineWaterline[Math.round((z - FINE_GRID.z0) / FINE_GRID.cellM)].toFixed(1)} m`);
}
if (!(Math.abs(womb - 190) <= 30)) { console.error('Womb checkpoint failed'); process.exit(1); }
mkdirSync('public/terrain', { recursive: true });
writeFileSync('public/terrain/womb-land.bin', bytes);
console.log(`wrote public/terrain/womb-land.bin (${(bytes.length / 1e6).toFixed(2)} MB)`);
```

- [ ] **Step 4: Run the tests:** `npx vitest run src/land/landData.test.ts src/land/bake.test.ts`. Expected: PASS. `npx tsc --noEmit`: no errors (`tools/` is outside the tsconfig include).

- [ ] **Step 5: Bake:** `node tools/bakeTerrain.ts "C:/Users/Andre/AppData/Local/Temp/claude/C--Dev-andrew-dev-personal-projects-liquid-dreaming/a1dec920-ae87-426f-87b6-a12275775cb4/scratchpad/dem"`.
  - Expected: the line `waterline at z = 0: 17x–19x m`, eight more rows, and `wrote … (≈3.8 MB)`.
  - A missing tile throws ENOENT with its path. Download only tiles already covered by Andrew's permission (zoom 15: x 26847–26853, y 19662–19670; zoom 12: x 3355–3356, y 2456–2460); anything else, stop and ask.
  - Ledger the printed waterlines.

- [ ] **Step 6: Credits:** write `public/terrain/CREDITS.md`:

```md
# Terrain data

`womb-land.bin` is baked by `tools/bakeTerrain.ts` from the **AWS Terrain Tiles** open dataset
(Tilezen / Mapzen, `s3://elevation-tiles-prod`, terrarium encoding), zoom 15 and zoom 12 tiles around the Womb
(-33.895216, 114.983359), downloaded 2026-09-28.

The tiles combine several public elevation sources; for this area the data is **SRTM** (NASA / USGS, public domain).
Attribution requested by Tilezen: "Terrain tiles: Mapzen, and the sources listed at
https://github.com/tilezen/joerd/blob/master/docs/attribution.md".

The raw tiles are not in this repository.
```

- [ ] **Step 7: Commit**

```bash
git add src/land/landData.ts src/land/landData.test.ts src/land/bake.ts src/land/bake.test.ts src/land/bakedLand.testutil.ts tools/bakeTerrain.ts public/terrain/womb-land.bin public/terrain/CREDITS.md
git commit -m "feat(land): bake the terrain tiles into the land file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The composed height

**Files:**
- Create: `src/land/landHeight.ts`
- Test: `src/land/landHeight.test.ts`

**Interfaces:**
- Consumes: `LandFile`, `GridSpec`, `decodeLandFile` (Task 2), `readBakedLand` (Task 2), `depthBg`, `SHORE_X`, `SHORE_FLAT_DEPTH_M` (`coastProfile.ts`), `smoothstep` (`math/smoothstep.ts`), `valueNoise2` (`seabed/noise.ts`, returns [−1, 1]).
- Produces:
  - `BeachProfile { wetWidthM; dryWidthM; toeWidthM; blendEndM; wetTopM; beachTopM; toeTopM }`, `DEFAULT_BEACH`;
  - `beachHeight(d, p?)`;
  - `REEF_CENTRE_Z` = −75, `PIN_HALF_M` = 600, `PIN_BLEND_M` = 400, `COAST_Z0` = −15000, `COAST_DZ` = 4, `COAST_NZ` = 7501;
  - `class LandHeight` with:
    - `constructor(file: LandFile, profile?: BeachProfile)`;
    - `profile`;
    - `realWaterlineAt(z)`, `waterlineAt(z)`;
    - `demAt(x, z)`, `heightAt(x, z)`;
    - `skyViewAt(x, z)`;
    - `waterlineSamples(stepM: number): Float32Array` (z from COAST_Z0 to −COAST_Z0 inclusive).

- [ ] **Step 1: Write the failing test** (`src/land/landHeight.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { depthBg, SHORE_X } from '../seabed/coastProfile';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile, type LandFile } from './landData';
import { DEFAULT_BEACH, LandHeight, PIN_BLEND_M, PIN_HALF_M, REEF_CENTRE_Z, beachHeight } from './landHeight';

/** A synthetic coast: the real waterline at x = wl(z), land rising 0.2 m per m inland of it. */
function synthetic(wl: (z: number) => number): LandFile {
  const fine = { x0: -800, z0: -4000, cellM: 8, nx: 401, nz: 1001 };
  const ring = { x0: -3000, z0: -15000, cellM: 32, nx: 282, nz: 938 };
  const sky = { x0: -800, z0: -4000, cellM: 16, nx: 2, nz: 2 };
  const fill = (g: typeof fine) => {
    const h = new Float32Array(g.nx * g.nz);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cellM, z = g.z0 + j * g.cellM;
      h[j * g.nx + i] = Math.max(0, (x - wl(z)) * 0.2);
    }
    return h;
  };
  return {
    fine, ring, sky, fineHeights: fill(fine), ringHeights: fill(ring), skyView: new Float32Array(4).fill(1),
    fineWaterline: Float32Array.from({ length: fine.nz }, (_, j) => wl(fine.z0 + j * fine.cellM)),
    ringWaterline: Float32Array.from({ length: ring.nz }, (_, j) => wl(ring.z0 + j * ring.cellM)),
  };
}

describe('beachHeight', () => {
  it('rises steadily from the seabed through the toe (never dips)', () => {
    let prev = -Infinity;
    for (let d = -45; d <= 60; d += 0.25) {
      const h = beachHeight(d);
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
  });
  it('is continuous at every breakpoint and meets the seabed at the waterline', () => {
    for (const d of [0, 12, 40, 55]) expect(Math.abs(beachHeight(d + 1e-6) - beachHeight(d - 1e-6))).toBeLessThan(1e-3);
    expect(beachHeight(0)).toBeCloseTo(-depthBg(SHORE_X), 6);
    expect(beachHeight(-30)).toBeCloseTo(-depthBg(SHORE_X - 30), 6);
    expect(beachHeight(12)).toBeCloseTo(DEFAULT_BEACH.wetTopM, 6);
    expect(beachHeight(40)).toBeCloseTo(DEFAULT_BEACH.beachTopM, 6);
    expect(beachHeight(55)).toBeCloseTo(DEFAULT_BEACH.toeTopM, 6);
  });
});

describe('LandHeight on a synthetic coast', () => {
  const land = new LandHeight(synthetic((z) => (z < 1500 ? 250 : 350)));
  it('pins the waterline at exactly 190 m around the reef, and follows the real one beyond', () => {
    for (let z = REEF_CENTRE_Z - PIN_HALF_M; z <= REEF_CENTRE_Z + PIN_HALF_M; z += 50) expect(land.waterlineAt(z)).toBe(190);
    expect(land.waterlineAt(-3000)).toBeCloseTo(250, 3);
    expect(land.waterlineAt(REEF_CENTRE_Z + PIN_HALF_M + PIN_BLEND_M / 2)).toBeGreaterThan(190);
  });
  it('smooths a 100 m step in the real waterline over about 400 m', () => {
    expect(land.realWaterlineAt(1250)).toBeCloseTo(250, 1); // its ±200 m window ends before the step
    expect(land.realWaterlineAt(1500)).toBeGreaterThan(280);
    expect(land.realWaterlineAt(1500)).toBeLessThan(320);
    expect(land.realWaterlineAt(1720)).toBeCloseTo(350, 1);
  });
  it('is continuous across the beach band, the blend and the fine grid edge', () => {
    for (const z of [0, 2500]) {
      const xs = land.waterlineAt(z);
      for (const d of [0, 12, 40, 55, 120]) expect(Math.abs(land.heightAt(xs + d + 0.01, z) - land.heightAt(xs + d - 0.01, z))).toBeLessThan(0.05);
    }
    for (let x = 2150; x <= 2410; x += 7) expect(Math.abs(land.heightAt(x + 0.01, 0) - land.heightAt(x - 0.01, 0))).toBeLessThan(0.05);
  });
  it('keeps the beach above the sea and the land behind it at least beach height', () => {
    for (const z of [-2000, 0, 800, 3000]) {
      const xs = land.waterlineAt(z);
      for (let d = 12; d < 40; d += 1) expect(land.heightAt(xs + d, z)).toBeGreaterThan(0.6);
      for (let d = 40; d < 400; d += 5) expect(land.heightAt(xs + d, z)).toBeGreaterThan(DEFAULT_BEACH.beachTopM - 1.6);
    }
  });
  it('gives the seabed shift samples every 50 m from z = −15000 to 15000', () => {
    const s = land.waterlineSamples(50);
    expect(s.length).toBe(601);
    expect(s[0]).toBeCloseTo(land.waterlineAt(-15000), 6);
    expect(s[Math.round((0 + 15000) / 50)]).toBe(190);
  });
});

describe('LandHeight on the baked data', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  it('finds the real waterline at the Womb within 190 ± 30 m', () => {
    expect(Math.abs(land.realWaterlineAt(0) - 190)).toBeLessThanOrEqual(30);
    expect(land.waterlineAt(REEF_CENTRE_Z)).toBe(190);
  });
  it('climbs to the ridge behind the Womb (≥ 60 m by 600 m inland)', () => {
    expect(land.heightAt(190 + 600, 0)).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run it:** `npx vitest run src/land/landHeight.test.ts`. Expected: FAIL, cannot resolve `./landHeight`.

- [ ] **Step 3: Implement** `src/land/landHeight.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { SHORE_FLAT_DEPTH_M, SHORE_X, depthBg } from '../seabed/coastProfile';
import { valueNoise2 } from '../seabed/noise';
import type { GridSpec, LandFile } from './landData';

/** The hand-shaped beach (spec §4.3.3, Ruling L2): widths inland of the waterline and heights at their ends (m). */
export interface BeachProfile {
  wetWidthM: number;
  dryWidthM: number;
  toeWidthM: number;
  /** The real data takes over completely this far inland. */
  blendEndM: number;
  wetTopM: number;
  beachTopM: number;
  toeTopM: number;
}

export const DEFAULT_BEACH: Readonly<BeachProfile> = { wetWidthM: 12, dryWidthM: 28, toeWidthM: 15, blendEndM: 120, wetTopM: 0.8, beachTopM: 2.5, toeTopM: 6 };

/** The reef map's centre along the coast; the waterline is pinned at SHORE_X within PIN_HALF_M of it (spec L3). */
export const REEF_CENTRE_Z = -75;
export const PIN_HALF_M = 600;
export const PIN_BLEND_M = 400;
/** The waterline curves are sampled every COAST_DZ m of z from COAST_Z0 (both ends inclusive). */
export const COAST_Z0 = -15000;
export const COAST_DZ = 4;
export const COAST_NZ = (2 * -COAST_Z0) / COAST_DZ + 1;
const COAST_SMOOTH_M = 400;
/** The fine grid hands over to the ring over its last FINE_EDGE_M (all four edges); the ring tapers to 0 at its own. */
const FINE_EDGE_M = 200;
const RING_TAPER_Z_M = 1500;
const RING_TAPER_X_M = 800;
/** The fine waterline hands over to the ring's between |z| = 3800 and 4000. */
const WATERLINE_HANDOVER: [number, number] = [3800, 4000];

/** The beach's height (m above mean sea level) d m inland of the waterline; seaward (d < 0), the coast profile's seabed. */
export function beachHeight(d: number, p: BeachProfile = DEFAULT_BEACH): number {
  if (d < 0) return -depthBg(SHORE_X + d);
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM, low = -SHORE_FLAT_DEPTH_M;
  if (d < wetEnd) return low + (p.wetTopM - low) * (d / wetEnd);
  if (d < dryEnd) return p.wetTopM + (p.beachTopM - p.wetTopM) * ((d - wetEnd) / p.dryWidthM) ** 1.4;
  if (d < toeEnd) return p.beachTopM + (p.toeTopM - p.beachTopM) * smoothstep(dryEnd, toeEnd, d);
  return p.toeTopM + 0.25 * (d - toeEnd);
}

function bilinear(g: GridSpec, h: Float32Array, x: number, z: number): number {
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  const i = Math.min(g.nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(g.nz - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), k = j * g.nx + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
}

const edgeDistance = (g: GridSpec, x: number, z: number): number =>
  Math.min(x - g.x0, g.x0 + (g.nx - 1) * g.cellM - x, z - g.z0, g.z0 + (g.nz - 1) * g.cellM - z);

/** A per-row waterline array at z (linear between rows; NaN outside or where a row has none). */
function rowValue(g: GridSpec, w: Float32Array, z: number): number {
  const f = (z - g.z0) / g.cellM;
  if (f < 0 || f > g.nz - 1) return NaN;
  const j = Math.min(g.nz - 2, Math.floor(f)), t = f - j;
  return w[j] * (1 - t) + w[j + 1] * t;
}

/**
 * The land's height (spec §4.3): the waterline pinned at the reef, the hand-shaped beach, then the real data measured
 * from its own waterline, plus small detail. CPU only (plan ruling P4): the mesh carries the heights.
 */
export class LandHeight {
  readonly profile: BeachProfile;
  private readonly file: LandFile;
  private readonly xr = new Float32Array(COAST_NZ);
  private readonly xs = new Float32Array(COAST_NZ);

  constructor(file: LandFile, profile: BeachProfile = DEFAULT_BEACH) {
    this.file = file;
    this.profile = { ...profile };
    const raw = new Float32Array(COAST_NZ);
    for (let k = 0; k < COAST_NZ; k++) {
      const z = COAST_Z0 + k * COAST_DZ;
      const f = rowValue(file.fine, file.fineWaterline, z), r = rowValue(file.ring, file.ringWaterline, z);
      const w = smoothstep(WATERLINE_HANDOVER[0], WATERLINE_HANDOVER[1], Math.abs(z));
      raw[k] = !Number.isFinite(f) ? r : !Number.isFinite(r) ? f : f + (r - f) * w;
    }
    // Fill gaps (rows with no land) from the nearest valid row, then a 400 m moving average (prefix sums).
    let last = NaN;
    for (let k = 0; k < COAST_NZ; k++) { if (Number.isFinite(raw[k])) last = raw[k]; else raw[k] = last; }
    last = NaN;
    for (let k = COAST_NZ - 1; k >= 0; k--) { if (Number.isFinite(raw[k])) last = raw[k]; else raw[k] = Number.isFinite(last) ? last : SHORE_X; }
    const half = COAST_SMOOTH_M / COAST_DZ / 2, prefix = new Float64Array(COAST_NZ + 1);
    for (let k = 0; k < COAST_NZ; k++) prefix[k + 1] = prefix[k] + raw[k];
    for (let k = 0; k < COAST_NZ; k++) {
      const a = Math.max(0, k - half), b = Math.min(COAST_NZ - 1, k + half);
      this.xr[k] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
      const z = COAST_Z0 + k * COAST_DZ;
      const pin = smoothstep(PIN_HALF_M, PIN_HALF_M + PIN_BLEND_M, Math.abs(z - REEF_CENTRE_Z));
      this.xs[k] = pin === 0 ? SHORE_X : SHORE_X + (this.xr[k] - SHORE_X) * pin;
    }
  }

  private curve(a: Float32Array, z: number): number {
    const f = Math.min(COAST_NZ - 1, Math.max(0, (z - COAST_Z0) / COAST_DZ));
    const k = Math.min(COAST_NZ - 2, Math.floor(f)), t = f - k;
    return t === 0 ? a[k] : a[k] * (1 - t) + a[k + 1] * t;
  }

  /** x_r(z): the smoothed real waterline. */
  realWaterlineAt(z: number): number {
    return this.curve(this.xr, z);
  }

  /** x_s(z): the waterline the land and the seabed use (190 m around the reef). */
  waterlineAt(z: number): number {
    return this.curve(this.xs, z);
  }

  /** The data's height: the fine grid, handing over to the ring near its edges; the ring tapers to 0 at its own. */
  demAt(x: number, z: number): number {
    const { fine, ring } = this.file;
    const er = edgeDistance(ring, x, z);
    if (er < 0) return 0;
    const taper = smoothstep(0, RING_TAPER_Z_M, ring.z0 + (ring.nz - 1) * ring.cellM - Math.abs(z)) *
      smoothstep(0, RING_TAPER_X_M, ring.x0 + (ring.nx - 1) * ring.cellM - x);
    const r = bilinear(ring, this.file.ringHeights, x, z) * taper;
    const wf = smoothstep(0, FINE_EDGE_M, edgeDistance(fine, x, z));
    return wf <= 0 ? r : r + (bilinear(fine, this.file.fineHeights, x, z) - r) * wf;
  }

  /** The composed height at (x, z) (m above mean sea level). */
  heightAt(x: number, z: number): number {
    const p = this.profile, xs = this.waterlineAt(z), d = x - xs;
    const toeEnd = p.wetWidthM + p.dryWidthM + p.toeWidthM;
    let h = beachHeight(d, p);
    if (d > toeEnd) {
      // The data measured from its own waterline, so the dune stays attached to the beach where the waterline is pinned.
      const dem = this.demAt(x + (this.realWaterlineAt(z) - xs), z);
      h = Math.max(p.beachTopM, h + (dem - h) * smoothstep(toeEnd, p.blendEndM, d));
    }
    return h + this.detail(x, z, d);
  }

  /** Small relief: ±0.15 m on the sand, ±1.5 m on the rock band and the heath. */
  private detail(x: number, z: number, d: number): number {
    if (d <= 0) return 0;
    const n = 0.5 * (0.65 * valueNoise2(x / 7, z / 7, 411) + 0.35 * valueNoise2(x / 2.3, z / 2.3, 412));
    const dryEnd = this.profile.wetWidthM + this.profile.dryWidthM;
    const amp = d < dryEnd - 2 ? 0.3 * smoothstep(0, 6, d) : 0.3 + 2.7 * smoothstep(dryEnd - 2, dryEnd + 2, d);
    return n * amp;
  }

  /** The baked sky-view factor (1 outside its grid). */
  skyViewAt(x: number, z: number): number {
    const g = this.file.sky;
    return edgeDistance(g, x, z) < 0 ? 1 : bilinear(g, this.file.skyView, x, z);
  }

  /** x_s every stepM from COAST_Z0 to −COAST_Z0 inclusive (Seabed.setWaterline). */
  waterlineSamples(stepM: number): Float32Array {
    const n = Math.round((2 * -COAST_Z0) / stepM) + 1, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.waterlineAt(COAST_Z0 + i * stepM);
    return out;
  }
}
```

- [ ] **Step 4: Run it:** `npx vitest run src/land/landHeight.test.ts`. Expected: PASS. If the synthetic step-smoothing bounds miss by a few metres, check the moving-average window (±50 samples = ±200 m) before touching the test. `npx tsc --noEmit`: clean.

- [ ] **Step 5: Commit**

```bash
git add src/land/landHeight.ts src/land/landHeight.test.ts
git commit -m "feat(land): the composed height (the pinned waterline, the beach, the data)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The seabed follows the waterline

**Files:**
- Modify: `src/seabed/bathymetry.ts` (`bedHeightAt`, lines 174–186), `src/seabed/Seabed.ts`, `src/seabed/seabed.selftest.ts`
- Test: `src/seabed/bathymetry.test.ts`, `src/land/landHeight.test.ts` (seam test)

**Interfaces:**
- Consumes: `LandHeight.waterlineSamples` (Task 3).
- Produces:
  - `bedHeightAt(b, x, z, shiftAt?: (z: number) => number)`: outside the map, `−depthBg(x − shiftAt(z))`;
  - `Seabed`:
    - `WATERLINE_STEP_M` = 50, `WATERLINE_Z0` = −15000, `WATERLINE_COUNT` = 601;
    - `setWaterline(xs: Float32Array)` (601 samples of x_s);
    - `shiftAt(z): number` (CPU);
    - `bedHeightNode` shifted outside the map.

- [ ] **Step 1: Write the failing tests.** Append to `src/seabed/bathymetry.test.ts`:

```ts
describe('bedHeightAt with a waterline shift (Phase 4a spec §4.4)', () => {
  it('moves the coast profile east by the shift outside the map, and leaves the map alone', () => {
    const shift = (z: number) => (z > 1000 ? 120 : 0);
    expect(bedHeightAt(bathy, 300, 2000, shift)).toBeCloseTo(-depthBg(300 - 120), 6);
    expect(bedHeightAt(bathy, 300, 0, shift)).toBeCloseTo(bedHeightAt(bathy, 300, 0), 6);
    expect(bedHeightAt(bathy, 0, 0, shift)).toBe(bedHeightAt(bathy, 0, 0)); // inside the reef map
  });
});
```

(Add `import { depthBg } from './coastProfile';` if the file lacks it.)

Append to `src/land/landHeight.test.ts`, inside `describe('LandHeight on the baked data', …)`:

```ts
  it('meets the shifted seabed at the waterline everywhere outside the reef map (no lagoons)', async () => {
    const { bedHeightAt, buildBathymetry } = await import('../seabed/bathymetry');
    const bathy = buildBathymetry();
    const samples = land.waterlineSamples(50);
    const shiftAt = (z: number) => {
      const f = Math.min(599.999, Math.max(0, (z + 15000) / 50)), i = Math.floor(f), t = f - i;
      return samples[i] * (1 - t) + samples[i + 1] * t - 190;
    };
    for (let z = -14000; z <= 14000; z += 137) {
      if (z > -500 && z < 350) continue; // the reef map
      const xs = land.waterlineAt(z);
      expect(Math.abs(bedHeightAt(bathy, xs - 0.01, z, shiftAt) - land.heightAt(xs + 0.01, z))).toBeLessThan(0.1);
    }
  });
```

- [ ] **Step 2: Run them:** `npx vitest run src/seabed/bathymetry.test.ts src/land/landHeight.test.ts`. Expected: FAIL. The shift is ignored, so the first test fails, and the seam test fails wherever x_s ≠ 190.

- [ ] **Step 3: Implement.**
  - **`bathymetry.ts`:** change the signature to `export function bedHeightAt(b: Bathymetry, x: number, z: number, shiftAt?: (z: number) => number): number` and the outside branch to `return -depthBg(x - (shiftAt ? shiftAt(z) : 0));`. Update its doc comment: "outside it, the coast profile shifted with the land's waterline (Phase 4a §4.4)".
  - **`Seabed.ts`:** add the following to `Seabed`:

```ts
// imports: add clamp, floor, fract, int, mix, uniformArray to the three/tsl import

/** The waterline shift outside the reef map (Phase 4a spec §4.4): x_s − SHORE_X every 50 m of z, z ∈ [−15000, 15000]. */
export const WATERLINE_STEP_M = 50;
export const WATERLINE_Z0 = -15000;
export const WATERLINE_COUNT = 601;

  // in the class:
  private readonly shiftCpu = new Float32Array(WATERLINE_COUNT);
  private readonly shiftGpu = uniformArray(new Array<number>(WATERLINE_COUNT).fill(0), 'float');

  /** The land's waterline x_s at WATERLINE_COUNT samples (LandHeight.waterlineSamples(WATERLINE_STEP_M)). */
  setWaterline(xs: Float32Array): void {
    if (xs.length !== WATERLINE_COUNT) throw new Error(`setWaterline wants ${WATERLINE_COUNT} samples, got ${xs.length}`);
    for (let i = 0; i < WATERLINE_COUNT; i++) {
      this.shiftCpu[i] = xs[i] - SHORE_X;
      (this.shiftGpu.array as number[])[i] = this.shiftCpu[i];
    }
  }

  /** The shift at z (CPU mirror of shiftNode). */
  shiftAt(z: number): number {
    const f = Math.min(WATERLINE_COUNT - 1.001, Math.max(0, (z - WATERLINE_Z0) / WATERLINE_STEP_M));
    const i = Math.floor(f), t = f - i;
    return this.shiftCpu[i] * (1 - t) + this.shiftCpu[i + 1] * t;
  }

  private shiftNode(z: N): N {
    const f = clamp(z.sub(WATERLINE_Z0).div(WATERLINE_STEP_M), 0.0, WATERLINE_COUNT - 1.001);
    const i = int(floor(f));
    return mix(this.shiftGpu.element(i), this.shiftGpu.element(i.add(1)), fract(f));
  }
```

  Change `bedHeightNode`'s outside branch to `depthBgNode(xz.x.sub(this.shiftNode(xz.y))).negate()`, and its comment to "the coast profile, shifted with the land's waterline, outside the map".
  - **`seabed.selftest.ts`:** add a second test:

```ts
registerSelfTest({
  name: 'seabed: the waterline shift moves the coast outside the map, GPU = CPU (±3 cm)',
  async run(renderer) {
    const bathy = buildBathymetry();
    const seabed = new Seabed(bathy);
    const xs = new Float32Array(WATERLINE_COUNT);
    for (let i = 0; i < WATERLINE_COUNT; i++) xs[i] = 190 + 150 * Math.sin(i * 0.05);
    seabed.setWaterline(xs);
    const pts: [number, number][] = [[400, 1200], [-1000, 5000], [250, -9000], [0, 0], [300, 700], [150, -2000]];
    const n = pts.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(pts.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    renderer.compute(Fn(() => {
      output.element(instanceIndex).assign(vec4(seabed.bedHeightNode(input.element(instanceIndex).xy), 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = pts.map(([x, z], i) => {
      const cpu = bedHeightAt(bathy, x, z, (zz) => seabed.shiftAt(zz));
      worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
      return `(${x},${z}) gpu ${out[i * 4].toFixed(3)} cpu ${cpu.toFixed(3)}`;
    });
    return { pass: worst < 0.03, detail: `worst ${worst.toFixed(4)} m; ${rows.join('; ')}` };
  },
});
```

  (import `WATERLINE_COUNT` from `./Seabed`.)

- [ ] **Step 4: Run** `npx vitest run src/seabed src/land`. Expected: PASS. Then run the full suite (`npx vitest run`) and the limits test output. Check that the water materials' uniform-buffer bindings stayed ≤ 12 by adding this to the limits test's "sheet's materials" block:

```ts
const uniformBuffers = (wgsl: string): number => (wgsl.match(/var<uniform>/g) ?? []).length;
// inside the per-material `it`:
console.log(`sheet ${which} uniform buffers: vertex ${uniformBuffers(w.vertex)}, fragment ${uniformBuffers(w.fragment)}`);
for (const stage of [w.vertex, w.fragment]) expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
```

- [ ] **Step 5: GPU self-tests:** the dev server, then `/?selftest` with the pane visible. Expected: 43/43 (42 plus the new shift test).

- [ ] **Step 6: Commit**

```bash
git add src/seabed/bathymetry.ts src/seabed/bathymetry.test.ts src/seabed/Seabed.ts src/seabed/seabed.selftest.ts src/land/landHeight.test.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(seabed): outside the reef map the seabed follows the land's waterline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The mesh and its cover

**Files:**
- Create: `src/land/landCover.ts`, `src/land/landCover.test.ts`, `src/land/landMesh.ts`, `src/land/landMesh.test.ts`

**Interfaces:**
- Consumes: `LandHeight` (Task 3), `valueNoise2`, `smoothstep`, `BeachProfile`.
- Produces:
  - `coverAt(d, slope, x, z, heightM, p): Cover`, where `Cover { wet; sand; rock; heath; rockGrey }` and the first four sum to 1;
  - `MESH_LEVELS`, `SEAWARD_M` = 45;
  - `buildLandMesh(land: LandHeight): LandMeshData`, where `LandMeshData { positions; normals: Float32Array (3 per vertex); cover: Float32Array (4: wet, sand, rock, heath); detail: Float32Array (2: skyView, rockGrey); indices: Uint32Array; triangles: number }`.

- [ ] **Step 1: Write the failing tests.**

`src/land/landCover.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coverAt } from './landCover';
import { DEFAULT_BEACH } from './landHeight';

const p = DEFAULT_BEACH;
const sum = (c: ReturnType<typeof coverAt>) => c.wet + c.sand + c.rock + c.heath;

describe('coverAt', () => {
  it('wet sand at the waterline, dry sand on the beach, rock at the toe, heath inland', () => {
    const at = (d: number, slope = 0.05) => coverAt(d, slope, 0, 1234, 5, p);
    expect(at(5).wet + at(5).rock).toBeGreaterThan(0.9);
    expect(at(25).sand).toBeGreaterThan(0.9);
    expect(at(47).rock).toBeGreaterThan(0.9);
    expect(at(300, 0).heath).toBeGreaterThan(0.99); // flat heath: no blowouts or outcrops
  });
  it('always sums to 1', () => {
    for (let k = 0; k < 500; k++) {
      const c = coverAt((k * 7.3) % 400 - 20, (k * 0.137) % 1, k * 13.1, k * -7.7, (k * 3.1) % 150, p);
      expect(sum(c)).toBeCloseTo(1, 5);
    }
  });
  it('blowouts and outcrops only on slopes', () => {
    for (let x = 0; x < 2000; x += 9) expect(coverAt(300, 0.02, x, 50, 60, p).heath).toBeGreaterThan(0.99);
    let bare = 0;
    for (let x = 0; x < 2000; x += 9) { const c = coverAt(300, 0.6, x, 50, 60, p); if (c.heath < 0.5) bare++; }
    expect(bare).toBeGreaterThan(0);
  });
  it('rock is rust low down and grey higher up', () => {
    expect(coverAt(47, 0.1, 0, 0, 4, p).rockGrey).toBeLessThan(0.05);
    expect(coverAt(300, 0.6, 0, 0, 40, p).rockGrey).toBeGreaterThan(0.95);
  });
});
```

`src/land/landMesh.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { MESH_LEVELS, SEAWARD_M, buildLandMesh } from './landMesh';

const land = new LandHeight(decodeLandFile(readBakedLand()));
const mesh = buildLandMesh(land);

describe('the land mesh', () => {
  it('nests each level inside the next, on the next level\'s cell grid', () => {
    for (let k = 0; k + 1 < MESH_LEVELS.length; k++) {
      const a = MESH_LEVELS[k], b = MESH_LEVELS[k + 1];
      expect(b.cellM).toBe(2 * a.cellM);
      for (const v of a.box) expect(v % b.cellM).toBe(0);
      expect(a.box[0]).toBeGreaterThanOrEqual(b.box[0]); expect(a.box[1]).toBeGreaterThanOrEqual(b.box[1]);
      expect(a.box[2]).toBeLessThanOrEqual(b.box[2]); expect(a.box[3]).toBeLessThanOrEqual(b.box[3]);
    }
  });
  it('stays within the triangle budget (plan ruling P6)', () => {
    expect(mesh.triangles).toBeLessThanOrEqual(750_000);
    expect(mesh.indices.length).toBe(mesh.triangles * 3);
  });
  it('matches the composed height at its vertices (except stitched edge vertices)', () => {
    let within = 0, n = 0;
    for (let v = 0; v < mesh.positions.length / 3; v += 997) {
      const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
      n++;
      if (Math.abs(y - land.heightAt(x, z)) < 1e-3) within++;
    }
    expect(within / n).toBeGreaterThan(0.95);
  });
  it('keeps its seaward edge under water at the lowest tide (−1.5 m)', () => {
    // every vertex further than SEAWARD_M − 1 m seaward of the waterline is below −1.8 m
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3], z = mesh.positions[v * 3 + 2];
      if (x - land.waterlineAt(z) < -(SEAWARD_M - 1)) expect(mesh.positions[v * 3 + 1]).toBeLessThan(-1.8);
    }
  });
  it('has unit normals and cover weights summing to 1', () => {
    for (let v = 0; v < mesh.positions.length / 3; v += 1013) {
      expect(Math.hypot(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2])).toBeCloseTo(1, 4);
      expect(mesh.cover[v * 4] + mesh.cover[v * 4 + 1] + mesh.cover[v * 4 + 2] + mesh.cover[v * 4 + 3]).toBeCloseTo(1, 4);
    }
  });
  it('has no cracks: every stitched edge vertex lies on the coarse edge between its neighbours', () => {
    // For each level but the last, sample its outer boundary and compare with the straight line between the even vertices.
    for (let k = 0; k + 1 < MESH_LEVELS.length; k++) {
      const { cellM, box } = MESH_LEVELS[k];
      const z = box[1], y = (x: number) => land.heightAt(x, z);
      for (let x = box[0] + cellM; x < box[2]; x += 2 * cellM * 17) {
        const want = (y(x - cellM) + y(x + cellM)) / 2;
        const got = findVertexY(x, z);
        if (got !== null) expect(Math.abs(got - want)).toBeLessThan(1e-3);
      }
    }
  });
});

function findVertexY(x: number, z: number): number | null {
  for (let v = 0; v < mesh.positions.length / 3; v++) {
    if (mesh.positions[v * 3] === x && mesh.positions[v * 3 + 2] === z) return mesh.positions[v * 3 + 1];
  }
  return null;
}
```

- [ ] **Step 2: Run them:** `npx vitest run src/land/landCover.test.ts src/land/landMesh.test.ts`. Expected: FAIL, the modules are missing.

- [ ] **Step 3: Implement.**

`src/land/landCover.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { valueNoise2 } from '../seabed/noise';
import type { BeachProfile } from './landHeight';

/** What covers the ground (spec §4.6): wet + sand + rock + heath = 1; rockGrey 0 = rust, 1 = weathered grey. */
export interface Cover {
  wet: number;
  sand: number;
  rock: number;
  heath: number;
  rockGrey: number;
}

/** [0, 1] noise from the seabed's value noise. */
const n01 = (x: number, z: number, seed: number): number => 0.5 + 0.5 * valueNoise2(x, z, seed);

/**
 * The cover at d m inland of the waterline, on ground of this slope (1 − normal.y), at (x, z) and this height. Wet sand to
 * the end of the wet band, dry sand to the toe, the rust limestone toe, then heath, with pale sand blowouts and grey
 * outcrops on steep faces (noise-selected) and stretches of rock at the waterline.
 */
export function coverAt(d: number, slope: number, x: number, z: number, heightM: number, p: BeachProfile): Cover {
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM;
  const shoreRock = smoothstep(0.62, 0.75, n01(0.5, z / 80, 421)) * (1 - smoothstep(wetEnd - 4, wetEnd + 4, d));
  let wet = (1 - smoothstep(wetEnd - 2, wetEnd + 2, d)) * (1 - shoreRock);
  const toe = smoothstep(dryEnd - 2, dryEnd + 2, d) * (1 - smoothstep(toeEnd - 2, toeEnd + 4, d));
  const heathZone = smoothstep(toeEnd - 3, toeEnd + 5, d);
  const blowout = heathZone * smoothstep(0.62, 0.72, n01(x / 45, z / 45, 422)) * smoothstep(0.25, 0.45, slope);
  const outcrop = heathZone * (1 - blowout) * smoothstep(0.45, 0.6, slope) * smoothstep(0.55, 0.65, n01(x / 25, z / 25, 423));
  let rock = Math.max(toe, shoreRock * (1 - toe)) * (1 - heathZone) + outcrop;
  let heath = heathZone * (1 - blowout - outcrop);
  let sand = Math.max(0, 1 - wet - rock - heath);
  const total = wet + sand + rock + heath;
  wet /= total; sand /= total; rock /= total; heath /= total;
  return { wet, sand, rock, heath, rockGrey: smoothstep(8, 25, heightM) };
}
```

`src/land/landMesh.ts`:

```ts
import { coverAt } from './landCover';
import type { LandHeight } from './landHeight';

/**
 * The land's static mesh (spec §4.5, plan ruling P6): nested square-ish levels, each twice the previous level's cell, each
 * covering its box minus the finer level's box. A level's outer-edge vertices at odd positions take the average of their
 * neighbours along the edge, so they lie on the coarser level's edge: no cracks. Quads wholly seaward of the waterline
 * by more than SEAWARD_M are dropped (under water, never seen).
 */
export interface MeshLevel {
  cellM: number;
  /** [x0, z0, x1, z1], multiples of the next level's cell. */
  box: [number, number, number, number];
}

export const MESH_LEVELS: MeshLevel[] = [
  { cellM: 2, box: [128, -384, 384, 384] },
  { cellM: 4, box: [-128, -768, 768, 768] },
  { cellM: 8, box: [-512, -1792, 1792, 1792] },
  { cellM: 16, box: [-1024, -3584, 3584, 3584] },
  { cellM: 32, box: [-2944, -7168, 5952, 7168] },
  { cellM: 64, box: [-2944, -14976, 5952, 14976] },
];

/** The mesh reaches this far seaward of the waterline (−2.1 m there: under the lowest tide, −1.5 m). */
export const SEAWARD_M = 45;

export interface LandMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** wet, sand, rock, heath per vertex. */
  cover: Float32Array;
  /** skyView, rockGrey per vertex. */
  detail: Float32Array;
  indices: Uint32Array;
  triangles: number;
}

export function buildLandMesh(land: LandHeight): LandMeshData {
  const pos: number[] = [], nor: number[] = [], cov: number[] = [], det: number[] = [], idx: number[] = [];
  for (let k = 0; k < MESH_LEVELS.length; k++) {
    const { cellM, box } = MESH_LEVELS[k];
    const hole = k > 0 ? MESH_LEVELS[k - 1].box : null;
    const stitch = k + 1 < MESH_LEVELS.length;
    const nx = (box[2] - box[0]) / cellM, nz = (box[3] - box[1]) / cellM;
    const xAt = (i: number) => box[0] + i * cellM, zAt = (j: number) => box[1] + j * cellM;
    // Heights on this level's full vertex grid, stitched along its outer edge.
    const H = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = land.heightAt(xAt(i), zAt(j));
    if (stitch) {
      for (let i = 1; i < nx; i += 2) {
        H[i] = (H[i - 1] + H[i + 1]) / 2;
        H[nz * (nx + 1) + i] = (H[nz * (nx + 1) + i - 1] + H[nz * (nx + 1) + i + 1]) / 2;
      }
      for (let j = 1; j < nz; j += 2) {
        H[j * (nx + 1)] = (H[(j - 1) * (nx + 1)] + H[(j + 1) * (nx + 1)]) / 2;
        H[j * (nx + 1) + nx] = (H[(j - 1) * (nx + 1) + nx] + H[(j + 1) * (nx + 1) + nx]) / 2;
      }
    }
    const remap = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const vertex = (i: number, j: number): number => {
      const g = j * (nx + 1) + i;
      if (remap[g] >= 0) return remap[g];
      const x = xAt(i), z = zAt(j), y = H[g];
      const e = cellM;
      const hx = land.heightAt(x + e, z) - land.heightAt(x - e, z), hz = land.heightAt(x, z + e) - land.heightAt(x, z - e);
      const len = Math.hypot(hx, 2 * e, hz);
      const ny = (2 * e) / len;
      const c = coverAt(x - land.waterlineAt(z), 1 - ny, x, z, y, land.profile);
      remap[g] = pos.length / 3;
      pos.push(x, y, z);
      nor.push(-hx / len, ny, -hz / len);
      cov.push(c.wet, c.sand, c.rock, c.heath);
      det.push(land.skyViewAt(x, z), c.rockGrey);
      return remap[g];
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = xAt(i), z0 = zAt(j), x1 = x0 + cellM, z1 = z0 + cellM;
        if (hole && x0 >= hole[0] && x1 <= hole[2] && z0 >= hole[1] && z1 <= hole[3]) continue;
        const seaward = (x: number, z: number) => x - land.waterlineAt(z) < -SEAWARD_M;
        if (seaward(x0, z0) && seaward(x1, z0) && seaward(x0, z1) && seaward(x1, z1)) continue;
        const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
        idx.push(a, c, b, b, c, d); // counter-clockwise seen from above (+y)
      }
    }
  }
  return {
    positions: Float32Array.from(pos), normals: Float32Array.from(nor), cover: Float32Array.from(cov), detail: Float32Array.from(det),
    indices: Uint32Array.from(idx), triangles: idx.length / 3,
  };
}
```

Winding check: with +X east and +Z south, a → c → b goes (x0, z0) → (x0, z1) → (x1, z0). Its face normal is (c − a) × (b − a) = (0, 0, dz) × (dx, 0, 0) = (0, dz·dx, 0), so it points +y. If the material culls back faces, the land is visible from above.

- [ ] **Step 4: Run them:** `npx vitest run src/land/landCover.test.ts src/land/landMesh.test.ts`.
  - Expected: PASS.
  - If the triangle count exceeds 750k, ledger the number and shrink level 0's box to `[128, -320, 320, 320]` (or level 1's to `[-128, -640, 640, 640]`); keep the boxes on the next level's cell grid.
  - Time the build: add `console.time` locally and remove it before committing. Ledger it; the target is ≤ 1 s in Node.
  - `npx tsc --noEmit`: clean.

- [ ] **Step 5: Commit**

```bash
git add src/land/landCover.ts src/land/landCover.test.ts src/land/landMesh.ts src/land/landMesh.test.ts
git commit -m "feat(land): the graded, stitched land mesh and its cover weights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The land on screen (material, Land, App, Land folder)

**Files:**
- Create: `src/land/landParams.ts`, `src/land/landParams.test.ts`, `src/land/landShading.ts`, `src/land/Land.ts`, `src/land/Land.test.ts`
- Modify:
  - `src/ocean/OceanSurface.ts`: add `coverMap` and `sunlightMap` to `DebugOverlays` and `DEFAULT_DEBUG_OVERLAYS` (both false);
  - `src/dev/DevPanel.ts`: `OVERLAY_BINDINGS` gains `coverMap: { label: 'cover map' }` and `sunlightMap: { label: 'sunlight map' }`, plus a `LAND_BINDINGS` Land folder and the `onLand` handler;
  - `src/dev/devSettings.ts`: `land` in `DevLookParams` and `LOOK_KEYS`;
  - `src/app/App.ts`;
  - `src/dev/DevPanel.test.ts`, `src/dev/devSettings.test.ts`.

**Interfaces:**
- Consumes: Tasks 2–5; `Sky`; `schlickWater` (`waterShading.ts`); `WATERLINE_STEP_M` (Task 4).
- Produces:
  - `LandParams { sandBrightness; heathBrightness; heathSilver; heathOrange; beachWidthM; toeHeightM; shadow: boolean }`;
  - `DEFAULT_LAND_PARAMS`, `LAND_PARAM_RANGES`, `normalizeLandParams(p)`, `beachProfileFor(p): BeachProfile`;
  - `LandLookUniforms`, `createLandLookUniforms()`;
  - `createLandMaterial(sky, u, sunVisibility?: (xz) => N): MeshBasicNodeMaterial`;
  - `class Land` with:
    - `constructor(sky: Sky)`;
    - `mesh: THREE.Mesh`;
    - `height: LandHeight | null`;
    - `load(fetchBytes?: () => Promise<Uint8Array>): Promise<void>`;
    - `setParams(p: LandParams): boolean` (true when the shape changed and `rebuild()` is due);
    - `rebuild(): void`;
    - `setOverlays(o: DebugOverlays)`;
    - `setSunVisibility(fn)` (Task 8 uses it before the material is built).

- [ ] **Step 1: Write the failing tests.**

`src/land/landParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAND_PARAMS, LAND_PARAM_RANGES, beachProfileFor, normalizeLandParams } from './landParams';
import { DEFAULT_BEACH } from './landHeight';

describe('LandParams', () => {
  it('defaults give the spec beach', () => {
    expect(beachProfileFor(DEFAULT_LAND_PARAMS)).toEqual(DEFAULT_BEACH);
  });
  it('normalize clamps every numeric field to its range and fixes non-finite values', () => {
    const p = { ...DEFAULT_LAND_PARAMS, sandBrightness: 99, heathSilver: -1, beachWidthM: Number.NaN };
    normalizeLandParams(p);
    expect(p.sandBrightness).toBe(LAND_PARAM_RANGES.sandBrightness.max);
    expect(p.heathSilver).toBe(LAND_PARAM_RANGES.heathSilver.min);
    expect(p.beachWidthM).toBe(DEFAULT_LAND_PARAMS.beachWidthM);
  });
});
```

`src/land/Land.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { readBakedLand } from './bakedLand.testutil';
import { Land } from './Land';
import { DEFAULT_LAND_PARAMS } from './landParams';

describe('Land', () => {
  it('stays landless (mesh hidden, no height) when the file is bad, and the promise rejects', async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    await expect(land.load(async () => new Uint8Array(40))).rejects.toThrow(/land file/);
    expect(land.height).toBeNull();
    expect(land.mesh.visible).toBe(false);
  });
  it('shows the mesh once loaded, and asks for a rebuild only when the beach shape changes', async () => {
    const land = new Land(new Sky(DEFAULT_ATMOSPHERE));
    await land.load(async () => readBakedLand());
    expect(land.height).not.toBeNull();
    expect(land.mesh.visible).toBe(true);
    expect(land.setParams({ ...DEFAULT_LAND_PARAMS, sandBrightness: 1.2 })).toBe(false);
    expect(land.setParams({ ...DEFAULT_LAND_PARAMS, beachWidthM: 35 })).toBe(true);
  });
});
```

Append to `src/dev/DevPanel.test.ts`, following its existing Impact block:

```ts
describe('Land folder sliders', () => {
  it('has a slider for every numeric LandParams field, with exactly normalizeLandParams ranges', () => {
    const numeric = (Object.keys(DEFAULT_LAND_PARAMS) as (keyof LandParams)[]).filter((k) => typeof DEFAULT_LAND_PARAMS[k] === 'number');
    expect(Object.keys(LAND_BINDINGS).sort()).toEqual(numeric.sort());
    for (const k of Object.keys(LAND_BINDINGS) as (keyof typeof LAND_BINDINGS)[]) {
      expect(LAND_BINDINGS[k].min).toBe(LAND_PARAM_RANGES[k].min);
      expect(LAND_BINDINGS[k].max).toBe(LAND_PARAM_RANGES[k].max);
    }
  });
});
```

Append to `src/dev/devSettings.test.ts`: add `land: DEFAULT_LAND_PARAMS` to its `defaults()` builder, `s.land.sandBrightness = 1.3; s.land.shadow = false;` to its round-trip mutation block, and:

```ts
it('settings stored before Phase 4a (no land) load the land defaults', () => {
  const store = memoryStorage();
  const old = JSON.parse(JSON.stringify({ ...defaults(), breakingModel: BREAKING_MODEL })) as Record<string, unknown>;
  delete old.land;
  store.setItem(DEV_SETTINGS_KEY, JSON.stringify(old));
  expect(loadDevSettings(store, defaults())!.land).toEqual(DEFAULT_LAND_PARAMS);
});
```

(Use the file's existing fake-storage helper; if it is named differently from `memoryStorage`, use that name.)

- [ ] **Step 2: Run them:** `npx vitest run src/land src/dev`. Expected: FAIL (missing modules and exports).

- [ ] **Step 3: Implement.**

`src/land/landParams.ts`:

```ts
import { type BeachProfile, DEFAULT_BEACH } from './landHeight';

/** The Land folder (spec §4.11): look uniforms, two beach-shape values (a mesh rebuild) and the shadow switch. */
export interface LandParams {
  sandBrightness: number;
  heathBrightness: number;
  /** Share of silver-grey daisy-bush in the heath mix. */
  heathSilver: number;
  /** Share of orange-tipped pigface. */
  heathOrange: number;
  /** The dry beach's width (m). */
  beachWidthM: number;
  /** The limestone toe's top (m above mean sea level). */
  toeHeightM: number;
  /** The land's shadow on (off for comparison captures). */
  shadow: boolean;
}

export const DEFAULT_LAND_PARAMS: Readonly<LandParams> = {
  sandBrightness: 1, heathBrightness: 1, heathSilver: 0.35, heathOrange: 0.12, beachWidthM: DEFAULT_BEACH.dryWidthM, toeHeightM: DEFAULT_BEACH.toeTopM, shadow: true,
};

export const LAND_PARAM_RANGES = {
  sandBrightness: { min: 0.5, max: 1.5 },
  heathBrightness: { min: 0.5, max: 2 },
  heathSilver: { min: 0, max: 1 },
  heathOrange: { min: 0, max: 0.5 },
  beachWidthM: { min: 15, max: 45 },
  toeHeightM: { min: 3, max: 10 },
} as const;

export function normalizeLandParams(p: LandParams): void {
  for (const k of Object.keys(LAND_PARAM_RANGES) as (keyof typeof LAND_PARAM_RANGES)[]) {
    const r = LAND_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_LAND_PARAMS[k];
  }
  p.shadow = p.shadow !== false;
}

export function beachProfileFor(p: LandParams): BeachProfile {
  return { ...DEFAULT_BEACH, dryWidthM: p.beachWidthM, toeTopM: p.toeHeightM };
}
```

`src/land/landShading.ts`:

```ts
import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, dot, float, length, max, mix, mx_noise_float, normalize, positionWorld, reflect, saturate, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { schlickWater } from '../ocean/waterShading';
import type { Sky } from '../sky/Sky';

type N = any;

/** Albedos (linear), set by eye against reference/place/ (spec §4.6). */
const DRY_SAND = vec3(0.62, 0.55, 0.42);
const WET_SAND = vec3(0.3, 0.26, 0.2);
const ROCK_RUST = vec3(0.34, 0.19, 0.1);
const ROCK_GREY = vec3(0.42, 0.4, 0.36);
const HEATH_OLIVE = vec3(0.11, 0.14, 0.065);
const HEATH_SILVER = vec3(0.33, 0.35, 0.31);
const PIGFACE = vec3(0.15, 0.19, 0.07);
const PIGFACE_TIPS = vec3(0.45, 0.22, 0.06);
const RICE_PINK = vec3(0.55, 0.36, 0.4);
const HEATH_GAP = vec3(0.03, 0.035, 0.025);
/** What the mottled heath averages to at a distance (the fade target, so 2 km of heath doesn't alias). */
const HEATH_AVG = vec3(0.12, 0.14, 0.085);

export interface LandLookUniforms {
  sandBrightness: THREE.UniformNode<'float', number>;
  heathBrightness: THREE.UniformNode<'float', number>;
  heathSilver: THREE.UniformNode<'float', number>;
  heathOrange: THREE.UniformNode<'float', number>;
  coverOn: THREE.UniformNode<'float', number>;
  sunlightOn: THREE.UniformNode<'float', number>;
}

export function createLandLookUniforms(): LandLookUniforms {
  return { sandBrightness: uniform(1), heathBrightness: uniform(1), heathSilver: uniform(0.35), heathOrange: uniform(0.12), coverOn: uniform(0), sunlightOn: uniform(0) };
}

/**
 * The land's material (spec §4.6–4.7): the cover's albedos with world-space detail (faded to averages with distance), lit
 * by the sun (× the sunlight map, × the heath canopy's self-shading) and the sky (× the baked sky view), a faint sky sheen
 * on wet sand, then aerial perspective.
 */
export function createLandMaterial(sky: Sky, u: LandLookUniforms, sunVisibility?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.FrontSide;
  const p = positionWorld;
  const n = normalize(attribute('normal', 'vec3'));
  const cover = attribute('cover', 'vec4');
  const det = attribute('detail', 'vec2');
  const toCam = cameraPosition.sub(p);
  const dist = length(toCam);
  const v = toCam.div(max(dist, 1e-3));
  const l = sky.sunDirection;
  const fade = float(1.0).sub(smoothstep(300.0, 1500.0, dist));
  const n1 = mx_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 3.1)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(p.x.mul(0.25), p.z.mul(0.25), 7.3)).mul(0.5).add(0.5);
  const n3 = mx_noise_float(vec3(p.x.mul(0.12), p.z.mul(0.12), 1.7)).mul(0.5).add(0.5);
  const n4 = mx_noise_float(vec3(p.x.mul(2.6), p.z.mul(2.6), 9.9)).mul(0.5).add(0.5);

  const ripple = mx_noise_float(vec3(p.x.mul(1.3), p.z.mul(0.35), 5.0)).mul(0.08).mul(fade);
  const dry = DRY_SAND.mul(ripple.add(0.97)).mul(u.sandBrightness);
  const wet = WET_SAND.mul(n1.sub(0.5).mul(0.1).mul(fade).add(1.0)).mul(u.sandBrightness);
  const rock = mix(ROCK_RUST, ROCK_GREY, det.y).mul(mix(float(0.85), n1.mul(0.35).add(0.7), fade));
  const base = mix(HEATH_OLIVE, HEATH_SILVER, smoothstep(0.6, 0.7, n2.add(u.heathSilver).sub(0.35)));
  const pig = mix(PIGFACE, PIGFACE_TIPS, smoothstep(0.55, 0.8, n1));
  const withPig = mix(base, pig, smoothstep(0.66, 0.74, n3.add(u.heathOrange).sub(0.12)));
  const withPink = mix(withPig, RICE_PINK, smoothstep(0.9, 0.95, n4).mul(0.8));
  const heathNear = mix(withPink, HEATH_GAP, smoothstep(0.35, 0.2, n1).mul(0.7));
  const heath = mix(HEATH_AVG, heathNear, fade).mul(u.heathBrightness);
  const albedo = wet.mul(cover.x).add(dry.mul(cover.y)).add(rock.mul(cover.z)).add(heath.mul(cover.w));

  const vis = sunVisibility ? sunVisibility(p.xz) : float(1.0);
  const back = saturate(dot(v.negate(), l));
  const canopy = float(1.0).sub(cover.w.mul(0.55).mul(back).mul(float(1.0).sub(max(l.y, 0.0))));
  const sunE = sky.sunIlluminance.mul(vis).mul(max(dot(n, l), 0.0)).mul(canopy).mul(step(0.0, l.y));
  const skyE = sky.skyIrradiance.mul(det.x).mul(n.y.mul(0.5).add(0.5));
  const r: N = reflect(v.negate(), n);
  const sheen = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z))).mul(schlickWater(max(dot(n, v), 0.0))).mul(cover.x).mul(0.6);
  const lit = albedo.mul(sunE.add(skyE)).div(PI).add(sheen);
  // Overlays: the cover map in false colours (wet blue, sand yellow, rock red, heath green); the sunlight map (shade blue).
  const white = sky.skyIrradiance.add(sky.sunIlluminance.mul(max(l.y, 0.0))).div(PI);
  const falseColour = vec3(0.1, 0.3, 1.0).mul(cover.x).add(vec3(1.0, 0.9, 0.3).mul(cover.y)).add(vec3(1.0, 0.2, 0.1).mul(cover.z)).add(vec3(0.2, 0.9, 0.2).mul(cover.w));
  const withCover = mix(lit, white.mul(falseColour).mul(0.6), u.coverOn);
  const withSun = mix(withCover, mix(withCover, white.mul(vec3(0.1, 0.2, 1.0)).mul(0.6), float(1.0).sub(vis).mul(0.7)), u.sunlightOn);
  m.colorNode = sky.applyAerialPerspective(withSun, dist, v.negate());
  return m;
}
```

`src/land/Land.ts`:

```ts
import * as THREE from 'three/webgpu';
import type { DebugOverlays } from '../ocean/OceanSurface';
import type { Sky } from '../sky/Sky';
import { type LandFile, decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { buildLandMesh } from './landMesh';
import { DEFAULT_LAND_PARAMS, type LandParams, beachProfileFor, normalizeLandParams } from './landParams';
import { type LandLookUniforms, createLandLookUniforms, createLandMaterial } from './landShading';

type N = any;

export const LAND_URL = `${import.meta.env?.BASE_URL ?? '/'}terrain/womb-land.bin`;

async function fetchLand(): Promise<Uint8Array> {
  const r = await fetch(LAND_URL);
  if (!r.ok) throw new Error(`land file: HTTP ${r.status} for ${LAND_URL}`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * The land (spec 2026-09-28-the-view-back-design.md): the baked file, the composed height, the static mesh and its
 * material. Until load() succeeds the mesh is hidden and height is null, and the game runs landless.
 */
export class Land {
  readonly mesh: THREE.Mesh;
  height: LandHeight | null = null;
  /** Bumped on every (re)build: the skyline and sunlight caches key on it. */
  version = 0;
  private file: LandFile | null = null;
  private readonly params: LandParams = { ...DEFAULT_LAND_PARAMS };
  private readonly look: LandLookUniforms = createLandLookUniforms();
  private readonly sky: Sky;
  private sunVisibility: ((xz: N) => N) | undefined;

  constructor(sky: Sky) {
    this.sky = sky;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), createLandMaterial(sky, this.look));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The sunlight map's lookup (Task 8); rebuilds the material. Call before the first render. */
  setSunVisibility(fn: (xz: N) => N): void {
    this.sunVisibility = fn;
    this.mesh.material = createLandMaterial(this.sky, this.look, fn);
  }

  async load(fetchBytes: () => Promise<Uint8Array> = fetchLand): Promise<void> {
    const file = decodeLandFile(await fetchBytes());
    this.file = file;
    this.rebuild();
  }

  /** Recompose the height and rebuild the mesh from the current beach params. */
  rebuild(): void {
    if (!this.file) return;
    this.height = new LandHeight(this.file, beachProfileFor(this.params));
    const d = buildLandMesh(this.height);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('cover', new THREE.BufferAttribute(d.cover, 4));
    g.setAttribute('detail', new THREE.BufferAttribute(d.detail, 2));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = true;
    this.version++;
  }

  /** Copies the params in (normalized) and sets the look. Returns true when the beach shape changed (call rebuild()). */
  setParams(p: LandParams): boolean {
    const shape = p.beachWidthM !== this.params.beachWidthM || p.toeHeightM !== this.params.toeHeightM;
    Object.assign(this.params, p);
    normalizeLandParams(this.params);
    this.look.sandBrightness.value = this.params.sandBrightness;
    this.look.heathBrightness.value = this.params.heathBrightness;
    this.look.heathSilver.value = this.params.heathSilver;
    this.look.heathOrange.value = this.params.heathOrange;
    return shape && this.file !== null;
  }

  get shadowOn(): boolean {
    return this.params.shadow;
  }

  setOverlays(o: DebugOverlays): void {
    this.look.coverOn.value = o.coverMap ? 1 : 0;
    this.look.sunlightOn.value = o.sunlightMap ? 1 : 0;
  }
}
```

Note: `import.meta.env` is undefined under vitest's node environment only when Vite doesn't inject it. vitest does inject it, but the `?.` guard keeps the module importable either way.

**DevPanel.ts:**
- Import `LAND_PARAM_RANGES` and `type LandParams`.
- Add `land: LandParams` to the model interface and `onLand(): void` to the handlers.
- Add:

```ts
/** Land folder sliders (Phase 4a spec §4.11), ranges exactly normalizeLandParams's (DevPanel.test.ts). */
export const LAND_BINDINGS = {
  sandBrightness: { label: 'sand brightness', ...LAND_PARAM_RANGES.sandBrightness, step: 0.01 },
  heathBrightness: { label: 'heath brightness', ...LAND_PARAM_RANGES.heathBrightness, step: 0.01 },
  heathSilver: { label: 'heath silver', ...LAND_PARAM_RANGES.heathSilver, step: 0.01 },
  heathOrange: { label: 'heath orange', ...LAND_PARAM_RANGES.heathOrange, step: 0.01 },
  beachWidthM: { label: 'beach width (m)', ...LAND_PARAM_RANGES.beachWidthM, step: 1 },
  toeHeightM: { label: 'rock band top (m)', ...LAND_PARAM_RANGES.toeHeightM, step: 0.1 },
} as const;
```

- Build the folder after the Impact folder:

```ts
    const landFolder = this.pane.addFolder({ title: 'Land', expanded: false });
    for (const [key, opts] of Object.entries(LAND_BINDINGS) as [keyof typeof LAND_BINDINGS, (typeof LAND_BINDINGS)[keyof typeof LAND_BINDINGS]][]) {
      landFolder.addBinding(m.land, key, opts).on('change', h.onLand);
    }
    landFolder.addBinding(m.land, 'shadow', { label: 'land shadow' }).on('change', h.onLand);
```

- Add `coverMap` and `sunlightMap` to `OVERLAY_BINDINGS`.

**devSettings.ts:** `import type { LandParams } from '../land/landParams';`, `land: LandParams;` in `DevLookParams`, and `'land'` appended to `LOOK_KEYS`.

**App.ts:**
- Imports: `Land` from `../land/Land`; `DEFAULT_LAND_PARAMS`, `type LandParams`, `normalizeLandParams` from `../land/landParams`; `WATERLINE_STEP_M` from `../seabed/Seabed`.
- Field: `readonly landParams: LandParams = { ...DEFAULT_LAND_PARAMS };` next to `impactParams`.
- Field, right after `readonly seabed = …`: `readonly land = new Land(this.sky);` and `private landTimer: number | undefined;`.
- Constructor, after `this.scene.add(this.impact.mesh);`:

```ts
    this.scene.add(this.land.mesh);
    void this.land.load().then(() => this.onLandBuilt(), (e: unknown) => {
      console.warn(`The land didn't load (${e instanceof Error ? e.message : String(e)}); running without it.`);
    });
```

- Panel model: `land: this.landParams`. Handler:

```ts
        onLand: () => {
          normalizeLandParams(this.landParams);
          this.panel.refresh();
          if (this.land.setParams(this.landParams)) this.scheduleLandRebuild();
        },
```

- `onOverlays` and `applyAllParams` gain `this.land.setOverlays(this.overlays);`. `applyAllParams` also gains `normalizeLandParams(this.landParams); if (this.land.setParams(this.landParams)) this.scheduleLandRebuild();`.
- `lookParams()` gains `land: this.landParams`; `assignLook` gains `assignParams(this.landParams, look.land);`.
- Methods:

```ts
  /** The land was (re)built: the seabed outside the reef map follows its waterline (spec §4.4). */
  private onLandBuilt(): void {
    if (this.land.height) this.seabed.setWaterline(this.land.height.waterlineSamples(WATERLINE_STEP_M));
  }

  /** Beach-shape edits rebuild the mesh (about half a second), debounced like the reef. */
  private scheduleLandRebuild(): void {
    clearTimeout(this.landTimer);
    this.landTimer = window.setTimeout(() => { this.land.rebuild(); this.onLandBuilt(); }, SPECTRUM_REBUILD_DEBOUNCE_MS);
  }
```

- `frame()`: `this.land.mesh.visible = this.land.height !== null && !this.underwater;`, next to the spray's visibility line.

- [ ] **Step 4: Run** `npx vitest run` (full suite) and `npx tsc --noEmit`. Expected: all green. The earlier suites stay unchanged apart from the extended settings and panel tests.

- [ ] **Step 5: In the browser:** start the dev server and open `/` with the pane visible.
  - Expected: no console errors; a `The land didn't load` warning must not appear.
  - Pick `pre-dawn` (facing east): the land is a dark silhouette against the dawn sky.
  - At noon, facing east from the lineup: pale beach, rust band, heath rising to the ridge.
  - The `cover map` overlay shows blue, yellow, red and green bands in that order from the waterline.
  - Take a screenshot for the ledger and check `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add src/land/landParams.ts src/land/landParams.test.ts src/land/landShading.ts src/land/Land.ts src/land/Land.test.ts src/ocean/OceanSurface.ts src/dev/DevPanel.ts src/dev/DevPanel.test.ts src/dev/devSettings.ts src/dev/devSettings.test.ts src/app/App.ts
git commit -m "feat(land): the land on screen, its material, the Land folder and the cover overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sunlight on the CPU

**Files:**
- Create: `src/land/sunlight.ts`
- Test: `src/land/sunlight.test.ts`

**Interfaces:**
- Consumes: `LandHeight` (Task 3), `SUN_ANGULAR_RADIUS_RAD` (`sky/Sky.ts`), `sunForConditions` (`astro/sunForConditions.ts`), `DEFAULT_LINEUP_POSITION` (`dev/referenceMoments.ts`), `smoothstep`, `GridSpec`.
- Produces:
  - `SUN_GRID` (x0 −600, z0 −4000, 8 m, 375 × 1000; texel centres at x0 + (i + 0.5)·cell);
  - `MARCH_GRID` (x0 −600, z0 −6000, 8 m, 826 × 1501; samples at x0 + i·cell);
  - `MARCH_STEPS` = 48, `MARCH_MIN_M` = 8, `MARCH_MAX_M` = 4000, `SUN_SOFT_RAD`;
  - `marchDistance(i)`, `buildMarchHeights(heightAt): Float32Array`, `sampleMarch(h, x, z)`;
  - `sunVisibility(h, x, z, sun: readonly [number, number, number]): number`;
  - `sunMoved(last, now, thresholdRad): boolean`, with `SUN_REBUILD_RAD` = 0.05° in radians.

- [ ] **Step 1: Write the failing test** (`src/land/sunlight.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { sunForConditions } from '../astro/sunForConditions';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { MARCH_GRID, MARCH_STEPS, SUN_REBUILD_RAD, SUN_SOFT_RAD, buildMarchHeights, marchDistance, sampleMarch, sunMoved, sunVisibility } from './sunlight';

const sunAt = (elevDeg: number, towardX: number, towardZ: number): [number, number, number] => {
  const e = (elevDeg * Math.PI) / 180, h = Math.hypot(towardX, towardZ);
  return [(towardX / h) * Math.cos(e), Math.sin(e), (towardZ / h) * Math.cos(e)];
};

describe('sunVisibility on a synthetic wall', () => {
  // A 100 m wall from x = 500 eastwards. The march samples at discrete distances, so the horizon it sees is the highest
  // of its own samples (the first one past the wall is at ~551 m), not the wall's true edge.
  const h = buildMarchHeights((x) => (x >= 500 ? 100 : 0));
  let maxTan = -1e3;
  for (let i = 0; i < MARCH_STEPS; i++) maxTan = Math.max(maxTan, (sampleMarch(h, marchDistance(i), 0) - (sampleMarch(h, 0, 0) + 0.5)) / marchDistance(i));
  const wallDeg = (Math.atan(maxTan) * 180) / Math.PI;
  it('is 0 below the wall, 1 above it, one half exactly at it', () => {
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg - 1, 1, 0))).toBe(0);
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg + 1, 1, 0))).toBe(1);
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg, 1, 0))).toBeCloseTo(0.5, 2);
    expect(SUN_SOFT_RAD).toBeGreaterThan(0.004);
  });
  it('is 1 with the sun behind the camera (the wall is the other way) and straight overhead, 0 below the horizon, never NaN', () => {
    expect(sunVisibility(h, 0, 0, sunAt(5, -1, 0))).toBe(1);
    expect(sunVisibility(h, 0, 0, [0, 1, 0])).toBe(1);
    expect(sunVisibility(h, 0, 0, sunAt(-3, 1, 0))).toBe(0);
  });
  it('samples the march grid bilinearly and clamps outside', () => {
    expect(sampleMarch(h, 600, 0)).toBe(100);
    expect(sampleMarch(h, MARCH_GRID.x0 - 1000, 0)).toBe(sampleMarch(h, MARCH_GRID.x0, 0));
  });
});

describe('sunMoved', () => {
  it('fires past the threshold only', () => {
    const a: [number, number, number] = [0.6, 0.1, 0.79];
    const b = sunAt(5.74, 0.6, 0.79);
    expect(sunMoved(a, a, SUN_REBUILD_RAD)).toBe(false);
    expect(sunMoved([0, -1, 0], a, SUN_REBUILD_RAD)).toBe(true);
    expect(typeof sunMoved(a, b, SUN_REBUILD_RAD)).toBe('boolean');
  });
});

describe('the ridge shades the lineup at sunrise (spec §3: sunbreak about 08:05 on 15 July)', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  const h = buildMarchHeights((x, z) => land.heightAt(x, z));
  const [lx, , lz] = DEFAULT_LINEUP_POSITION;
  const vis = (hours: number) => sunVisibility(h, lx, lz, sunForConditions({ date: '2026-07-15', timeOfDay: hours }).direction);
  it('is in shade at 07:45 and in sun at 08:15', () => {
    expect(vis(7.75)).toBe(0);
    expect(vis(8.25)).toBe(1);
  });
  it('the sunbreak falls between 08:00 and 08:10', () => {
    let lo = 7.75, hi = 8.25;
    for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (vis(mid) < 0.5) lo = mid; else hi = mid; }
    expect(lo).toBeGreaterThan(8.0);
    expect(lo).toBeLessThan(8 + 10 / 60);
  });
});
```

- [ ] **Step 2: Run it:** `npx vitest run src/land/sunlight.test.ts`. Expected: FAIL, missing module.

- [ ] **Step 3: Implement** `src/land/sunlight.ts`:

```ts
import { smoothstep } from '../math/smoothstep';
import { SUN_ANGULAR_RADIUS_RAD } from '../sky/Sky';
import type { GridSpec } from './landData';

/** The sunlight map's texels (spec §4.8): centre of texel (i, j) at x0 + (i + 0.5)·cell, z0 + (j + 0.5)·cell. */
export const SUN_GRID: GridSpec = { x0: -600, z0: -4000, cellM: 8, nx: 375, nz: 1000 };
/** The heights the march reads: sample (i, j) at x0 + i·cell (reaches 4 km toward the morning sun from the lineup). */
export const MARCH_GRID: GridSpec = { x0: -600, z0: -6000, cellM: 8, nx: 826, nz: 1501 };
export const MARCH_STEPS = 48;
export const MARCH_MIN_M = 8;
export const MARCH_MAX_M = 4000;
/** The shadow's soft edge: the sun's disc plus about one terrain cell's angle. */
export const SUN_SOFT_RAD = SUN_ANGULAR_RADIUS_RAD + 0.004;
/** Rebuild the map when the sun has moved this far (0.05°: about 12 s of sim time). */
export const SUN_REBUILD_RAD = (0.05 * Math.PI) / 180;
/** The eye of each texel: this far above the ground (or the sea). */
const EYE_M = 0.5;

export function marchDistance(i: number): number {
  return MARCH_MIN_M * (MARCH_MAX_M / MARCH_MIN_M) ** (i / (MARCH_STEPS - 1));
}

/** max(height, 0) at every MARCH_GRID sample (the sea blocks no sun). */
export function buildMarchHeights(heightAt: (x: number, z: number) => number): Float32Array {
  const g = MARCH_GRID, out = new Float32Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) out[j * g.nx + i] = Math.max(0, heightAt(g.x0 + i * g.cellM, g.z0 + j * g.cellM));
  return out;
}

/** Bilinear between samples, clamped to the grid's edge (the GPU's clamp-to-edge filtering at (g + 0.5)/size). */
export function sampleMarch(h: Float32Array, x: number, z: number): number {
  const g = MARCH_GRID;
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM)), fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM));
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j, k = j * g.nx + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
}

/** The fraction of the sun's disc a point sees over the land (CPU reference of SunlightMap's pass). */
export function sunVisibility(h: Float32Array, x: number, z: number, sun: readonly [number, number, number]): number {
  const horiz = Math.hypot(sun[0], sun[2]);
  if (horiz < 1e-3) return sun[1] > 0 ? 1 : 0;
  const dx = sun[0] / horiz, dz = sun[2] / horiz, h0 = sampleMarch(h, x, z) + EYE_M;
  let maxTan = -1e3;
  for (let i = 0; i < MARCH_STEPS; i++) {
    const s = marchDistance(i);
    maxTan = Math.max(maxTan, (sampleMarch(h, x + dx * s, z + dz * s) - h0) / s);
  }
  const elev = Math.asin(Math.max(-1, Math.min(1, sun[1])));
  return smoothstep(-SUN_SOFT_RAD, SUN_SOFT_RAD, elev - Math.atan(maxTan));
}

/** True when the angle between two sun directions exceeds the threshold. */
export function sunMoved(last: readonly [number, number, number], now: readonly [number, number, number], thresholdRad: number): boolean {
  const la = Math.hypot(...last), na = Math.hypot(...now);
  const c = (last[0] * now[0] + last[1] * now[1] + last[2] * now[2]) / (la * na);
  return Math.acos(Math.max(-1, Math.min(1, c))) > thresholdRad;
}
```

- [ ] **Step 4: Run it:** `npx vitest run src/land/sunlight.test.ts`.
  - Expected: PASS.
  - If the sunbreak lands outside 08:00–08:10, ledger the time found. Check the default lineup position first, then the beach-shift δ in `heightAt`. The DEM prototype gave 08:05 from (−30, 20).
  - Rule on the test only if the land is right and the spec's 08:05 estimate was off; the spec is an estimate, not a requirement.
  - `npx tsc --noEmit`: clean.

- [ ] **Step 5: Commit**

```bash
git add src/land/sunlight.ts src/land/sunlight.test.ts
git commit -m "feat(land): sunlight over the land on the CPU (the sunbreak test)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The sunlight map on the GPU, and everything that reads it

**Files:**
- Create: `src/land/SunlightMap.ts`, `src/land/land.selftest.ts`
- Modify:
  - `src/ocean/waterShading.ts` (`WaterSurfaceInputs`, `shadeWater`);
  - `src/seabed/seabedShading.ts` (`seabedRadianceNode`, `seabedTerms`);
  - `src/ocean/OceanSurface.ts` (options, constructor, `setOverlays`);
  - `src/breaker/BreakingRibbon.ts` (`RibbonShading`, its shading call at lines 529–537);
  - `src/whitewater/SprayParticles.ts` (constructor, `buildMaterial`);
  - `src/land/Land.ts`, `src/app/App.ts`, `src/dev/selfTests.ts`, `src/breaker/BreakingRibbon.limits.test.ts`.

**Interfaces:**
- Consumes: `SUN_GRID`, `MARCH_GRID`, `MARCH_STEPS`, `MARCH_MIN_M`, `MARCH_MAX_M`, `SUN_SOFT_RAD`, `SUN_REBUILD_RAD`, `sunMoved`, `buildMarchHeights`, `sampleMarch`, `sunVisibility` (Task 7).
- Produces:
  - `interface SunlightSource { visibilityNode(xz: N): N }`;
  - `class SunlightMap implements SunlightSource` with `constructor()`, `setHeights(h: Float32Array)`, `setEnabled(on: boolean)`, `update(renderer, sun: readonly [number, number, number]): boolean` (true if it rebuilt), and `texture`;
  - `Land.sunlight: SunlightMap`;
  - `WaterSurfaceInputs.sunVisibility?: N`;
  - `overlay.sunOn?: N`;
  - `seabedTerms(i, seabed, sky, u, sunVisibility?)`;
  - `OceanSurfaceOptions.sunlight?`, `RibbonShading.sunlight?`;
  - `new SprayParticles(sky, kind?, sunlight?)`.

- [ ] **Step 1: Write the failing limits tests.** In `src/breaker/BreakingRibbon.limits.test.ts`, inside `describe("the sheet's materials", …)`:

```ts
    const sunlight = new SunlightMap();
    it('the sunlight map adds exactly one sampled texture to the sheet above, and keeps every stage within the limits', () => {
      const w0 = renderWgsl(new THREE.Mesh(withFoam.mesh.geometry, withFoam.aboveMaterial));
      const lit = new OceanSurface(model, sky, optics, { foamMap: foam, sunlight });
      const w1 = renderWgsl(new THREE.Mesh(lit.mesh.geometry, lit.aboveMaterial));
      console.log(`sheet above with sunlight: fragment sampled ${sampledTextures(w1.fragment)}, uniform buffers ${uniformBuffers(w1.fragment)}`);
      expect(sampledTextures(w1.fragment) - sampledTextures(w0.fragment)).toBe(1);
      for (const stage of [w1.vertex, w1.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    });
    it('the ribbon, the spray and the land with the sunlight map stay within the limits', () => {
      const r = new BreakingRibbon(modelRibbonSurface(model), DEFAULT_BREAK_PARAMS, { model, sky, optics, foamMap: foam, sunlight });
      const spray = new SprayParticles(sky, undefined, sunlight);
      const land = new Land(sky);
      land.setSunVisibility((xz) => sunlight.visibilityNode(xz));
      for (const w of [renderWgsl(r.mesh), renderWgsl(spray.mesh as unknown as THREE.Mesh), renderWgsl(land.mesh)]) {
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
          expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
        }
      }
      for (const p of ['clearPass', 'marchPass'] as const) {
        expect(storageBindings(computeWgsl((sunlight as unknown as Record<string, THREE.ComputeNode>)[p]))).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
      }
    });
```

(Imports: `SunlightMap` from `../land/SunlightMap`, `Land` from `../land/Land`. `uniformBuffers` was added in Task 4. The empty land geometry needs a position attribute for the builder; if `renderWgsl(land.mesh)` throws on the empty geometry, give the test mesh `new THREE.PlaneGeometry()` with `cover` and `detail` attributes of matching length.)

- [ ] **Step 2: Run it:** `npx vitest run src/breaker/BreakingRibbon.limits.test.ts`. Expected: FAIL, `../land/SunlightMap` is missing.

- [ ] **Step 3: Implement** `src/land/SunlightMap.ts`:

```ts
import * as THREE from 'three/webgpu';
import { Fn, Loop, asin, atan, clamp, float, instanceIndex, length, max, mix, pow, select, smoothstep, texture, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import { MARCH_GRID, MARCH_MAX_M, MARCH_MIN_M, MARCH_STEPS, SUN_GRID, SUN_REBUILD_RAD, SUN_SOFT_RAD, sunMoved } from './sunlight';

type N = any;

/** Anything that tells a material how much of the sun reaches world xz (1 = all of it). */
export interface SunlightSource {
  visibilityNode(xz: N): N;
}

/**
 * The land's shadow (spec §4.8): a top-down map of the sun's visibility, marched through the land's heights on the GPU
 * whenever the sun moves more than SUN_REBUILD_RAD (CPU reference: sunlight.sunVisibility). Until the land loads it
 * holds 1 everywhere; outside its grid, and with the shadow switched off, visibilityNode is 1.
 */
export class SunlightMap implements SunlightSource {
  readonly texture: THREE.StorageTexture;
  private readonly heights: THREE.DataTexture;
  private readonly sun = uniform(new THREE.Vector3(0, 1, 0));
  private readonly enabled = uniform(1);
  private readonly clearPass: THREE.ComputeNode;
  private readonly marchPass: THREE.ComputeNode;
  private cleared = false;
  private hasHeights = false;
  private dirty = false;
  private last: [number, number, number] = [0, -1, 0];

  constructor() {
    const s = SUN_GRID, g = MARCH_GRID;
    this.texture = new THREE.StorageTexture(s.nx, s.nz);
    this.texture.type = THREE.HalfFloatType;
    this.texture.format = THREE.RGBAFormat;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.heights = new THREE.DataTexture(new Uint16Array(g.nx * g.nz), g.nx, g.nz, THREE.RedFormat, THREE.HalfFloatType);
    this.heights.minFilter = THREE.LinearFilter;
    this.heights.magFilter = THREE.LinearFilter;
    this.heights.wrapS = THREE.ClampToEdgeWrapping;
    this.heights.wrapT = THREE.ClampToEdgeWrapping;
    this.heights.generateMipmaps = false;
    this.heights.needsUpdate = true;

    const texel = (i: N): N => uvec2(i.mod(s.nx), i.div(s.nx));
    // sampleMarch's mirror: hardware bilinear at (g + 0.5) / size, clamped to the edge.
    const heightAt = (xz: N): N => texture(this.heights, xz.sub(vec2(g.x0, g.z0)).div(g.cellM).add(0.5).div(vec2(g.nx, g.nz))).level(float(0)).x;
    this.clearPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), vec4(1.0, 0.0, 0.0, 1.0));
    })().compute(s.nx * s.nz) as THREE.ComputeNode;
    this.marchPass = Fn(() => {
      const i = instanceIndex;
      const p = vec2(float(i.mod(s.nx)).add(0.5), float(i.div(s.nx)).add(0.5)).mul(s.cellM).add(vec2(s.x0, s.z0)).toVar();
      const h0 = heightAt(p).add(0.5);
      const horiz = length(this.sun.xz);
      const dir = this.sun.xz.div(max(horiz, 1e-4));
      const maxTan = float(-1e3).toVar();
      Loop(MARCH_STEPS, ({ i: k }: N) => {
        const dist = float(MARCH_MIN_M).mul(pow(float(MARCH_MAX_M / MARCH_MIN_M), float(k).div(MARCH_STEPS - 1)));
        maxTan.assign(max(maxTan, heightAt(p.add(dir.mul(dist))).sub(h0).div(dist)));
      });
      const elev = asin(clamp(this.sun.y, -1.0, 1.0));
      const soft = smoothstep(-SUN_SOFT_RAD, SUN_SOFT_RAD, elev.sub(atan(maxTan)));
      const vis = select(horiz.lessThan(1e-3), select(this.sun.y.greaterThan(0.0), float(1.0), float(0.0)), soft);
      textureStore(this.texture, texel(i), vec4(vis, 0.0, 0.0, 1.0));
    })().compute(s.nx * s.nz) as THREE.ComputeNode;
  }

  /** The land's march heights (sunlight.buildMarchHeights); the next update() rebuilds. */
  setHeights(h: Float32Array): void {
    const data = this.heights.image.data as Uint16Array;
    for (let k = 0; k < h.length; k++) data[k] = THREE.DataUtils.toHalfFloat(h[k]);
    this.heights.needsUpdate = true;
    this.hasHeights = true;
    this.dirty = true;
  }

  setEnabled(on: boolean): void {
    this.enabled.value = on ? 1 : 0;
  }

  /**
   * At most one march per call: the first call fills the map with 1 (sunlit); after setHeights, a march whenever the
   * heights changed or the sun moved past SUN_REBUILD_RAD. Returns true if it marched.
   */
  update(renderer: THREE.WebGPURenderer, sun: readonly [number, number, number]): boolean {
    if (!this.cleared) { renderer.compute(this.clearPass); this.cleared = true; }
    if (!this.hasHeights) return false;
    if (!this.dirty && !sunMoved(this.last, sun, SUN_REBUILD_RAD)) return false;
    this.sun.value.set(sun[0], sun[1], sun[2]);
    renderer.compute(this.marchPass);
    this.last = [sun[0], sun[1], sun[2]];
    this.dirty = false;
    return true;
  }

  visibilityNode(xz: N): N {
    const s = SUN_GRID;
    const uv = xz.sub(vec2(s.x0, s.z0)).div(vec2(s.nx * s.cellM, s.nz * s.cellM));
    const inside = uv.x.greaterThanEqual(0.0).and(uv.y.greaterThanEqual(0.0)).and(uv.x.lessThanEqual(1.0)).and(uv.y.lessThanEqual(1.0));
    const v = texture(this.texture, clamp(uv, vec2(0.0), vec2(1.0))).level(float(0)).x;
    return mix(float(1.0), select(inside, v, float(1.0)), this.enabled);
  }
}
```

**waterShading.ts:**
- Add to `WaterSurfaceInputs`:

```ts
  /** The land's shadow: the fraction of the sun reaching this point (Phase 4a §4.8). Absent means 1. */
  sunVisibility?: N;
```

  and to `overlay` add `sunOn?: N`.
- In `shadeWater`, after `const l = sky.sunDirection;`, add `const sv = i.sunVisibility ?? float(1.0);`. Then:
  - multiply `specular`'s `min(…)` argument by `sv` (apply `.mul(sv)` to the whole `specular` expression);
  - `upwelling`: `sky.skyIrradiance.add(sky.sunIlluminance.mul(sunIntoBody).mul(sv))`;
  - `lipLight`: `sky.sunIlluminance.mul(backlight).mul(sv).add(…)`;
  - `foamLight`: `sky.skyIrradiance.add(sky.sunIlluminance.mul(saturate(nDotL)).mul(sv))`.
- In the overlay `Fn`, add:

```ts
      if (o.sunOn) {
        const on = o.sunOn;
        If(on.greaterThan(0.5), () => { c.assign(mix(c, foamLight.mul(vec3(0.1, 0.2, 1.0)), float(1.0).sub(sv).mul(0.7))); });
      }
```

**seabedShading.ts:** `seabedRadianceNode(hitPos, seabed, sky, u, sunVisibility?: N)` computes `eSun` as today, then `.mul(sunVisibility ?? float(1.0))`. `seabedTerms(i, seabed, sky, u, sunVisibility?: N)` passes it into its `seabedRadianceNode` call. The underwater callers (`WaterVolume`) pass nothing (plan ruling P7).

**OceanSurface.ts:**
- `OceanSurfaceOptions` gains `sunlight?: SunlightSource` (type-only import from `../land/SunlightMap`).
- In the constructor, `const sunVis = options.sunlight ? options.sunlight.visibilityNode(vBaseXZ) : undefined;`. Pass it as the fifth argument of `seabedTerms` and as `sunVisibility: sunVis` to `shadeWater`. Add `sunOn: this.overlaySun` to the overlay object, with `private readonly overlaySun = uniform(0);`.
- `setOverlays` sets `this.overlaySun.value = o.sunlightMap ? 1 : 0;`.

**BreakingRibbon.ts:** `RibbonShading` gains `sunlight?: SunlightSource`. At the shading site, `const sunVis = shading.sunlight ? shading.sunlight.visibilityNode(positionWorld.xz) : undefined;`, passed to `seabedTerms(…, sunVis)` and as `sunVisibility: sunVis` in the `shadeWater` inputs. Use the variable the file already has for the shading options at line 529; read the surrounding lines before editing.

**SprayParticles.ts:** `constructor(sky: Sky, readonly kind: ParticleKind = SPRAY_KIND, sunlight?: SunlightSource)`, passing `sunlight` into `buildMaterial(sky, sunlight)`. There:

```ts
    const vis = sunlight ? sunlight.visibilityNode(centre.xz) : float(1.0);
    const radiance = sky.sunIlluminance.mul(vis).mul(sprayPhaseNode(dot(viewDir, sky.sunDirection), this.kind.isotropic)).add(sky.skyIrradiance.mul(SPRAY_SKY_SCALE));
```

**Land.ts:**
- Add `readonly sunlight = new SunlightMap();`.
- In the constructor, after creating the mesh: `this.setSunVisibility((xz) => this.sunlight.visibilityNode(xz));`.
- In `rebuild()`, after the mesh: `const lh = this.height; this.sunlight.setHeights(buildMarchHeights((x, z) => lh.heightAt(x, z)));`.
- In `setParams`: `this.sunlight.setEnabled(this.params.shadow);`.
- Add `update(renderer: THREE.WebGPURenderer, sun: readonly [number, number, number]): void { this.sunlight.update(renderer, sun); }`.

**App.ts:**
- `readonly land = new Land(this.sky);` must stay declared **before** `spray`, `impact` and `ribbon`: move it above them if needed.
- Pass `sunlight: this.land.sunlight` into:
  - the `BreakingRibbon` shading options;
  - both `SprayParticles` constructors (`new SprayParticles(this.sky, undefined, this.land.sunlight)`, `new SprayParticles(this.sky, IMPACT_KIND, this.land.sunlight)`);
  - `OceanSurface`'s options.
- In `frame()`, after `this.sky.update(…)`: `this.land.update(this.renderer, sun.direction);`.
- `onOverlays` / `applyAllParams` already call `oceanSurface.setOverlays` and `land.setOverlays`.

**land.selftest.ts** (and add `import '../land/land.selftest';` to `src/dev/selfTests.ts`):

```ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, vec4 } from 'three/tsl';
import { sunForConditions } from '../astro/sunForConditions';
import { registerSelfTest } from '../dev/selfTest';
import { LAND_URL } from './Land';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { SunlightMap } from './SunlightMap';
import { buildMarchHeights, sunVisibility } from './sunlight';

async function bakedLand(): Promise<LandHeight> {
  const r = await fetch(LAND_URL);
  return new LandHeight(decodeLandFile(new Uint8Array(await r.arrayBuffer())));
}

/** Sample points snapped to sunlight-map texel centres (the map filters between centres; the CPU value is a point). */
const snap = (v: number, o: number): number => o + (Math.floor((v - o) / 8) + 0.5) * 8;
const POINTS: [number, number][] = ([[-25, 45], [-200, 0], [0, -300], [150, 200], [400, 0], [800, 100], [-500, -3000], [300, 2500], [1500, 0], [100, -1200]] as [number, number][])
  .map(([x, z]) => [snap(x, -600), snap(z, -4000)]);

registerSelfTest({
  name: 'land: the baked file loads; the waterline is 190 m at the reef',
  async run() {
    const land = await bakedLand();
    const xr = land.realWaterlineAt(0), xs = land.waterlineAt(-75);
    return { pass: Math.abs(xr - 190) <= 30 && xs === 190, detail: `x_r(0) ${xr.toFixed(1)} m, x_s(−75) ${xs}` };
  },
});

registerSelfTest({
  name: 'land: the GPU sunlight map matches the CPU visibility (±0.1) at 07:45 and 08:15',
  async run(renderer) {
    const land = await bakedLand();
    const heights = buildMarchHeights((x, z) => land.heightAt(x, z));
    const map = new SunlightMap();
    map.setHeights(heights);
    const n = POINTS.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(POINTS.flatMap(([x, z]) => [x, z, 0, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const read = Fn(() => { output.element(instanceIndex).assign(vec4(map.visibilityNode(input.element(instanceIndex).xy), 0.0, 0.0, 0.0)); })().compute(n) as THREE.ComputeNode;
    let worst = 0;
    const rows: string[] = [];
    for (const hours of [7.75, 8.25]) {
      const sun = sunForConditions({ date: '2026-07-15', timeOfDay: hours }).direction;
      map.update(renderer, sun);
      renderer.compute(read);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      POINTS.forEach(([x, z], i) => {
        const cpu = sunVisibility(heights, x, z, sun);
        worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
        rows.push(`${hours}h (${x},${z}) gpu ${out[i * 4].toFixed(2)} cpu ${cpu.toFixed(2)}`);
      });
    }
    return { pass: worst <= 0.1, detail: `worst ${worst.toFixed(3)}; ${rows.join('; ')}` };
  },
});
```

- [ ] **Step 4: Run** the limits test, the full suite and `npx tsc --noEmit`. Expected: green. The sheet-above fragment goes from 13 to 14 sampled textures and uniform buffers stay ≤ 12. Ledger the counts.

- [ ] **Step 5: In the browser:**
  - `/?selftest`: 45/45 (43 plus 2).
  - Then `/`, and set 07:45 facing east from the lineup: the water around the lineup has no glitter and is lit by the sky; the `sunlight map` overlay shows the shade in blue over the lineup and the beach.
  - Scrub to 08:10: the shade edge has crossed the lineup.
  - Toggle `land shadow` off: the sun is back at 07:45.
  - Screenshot both states for the ledger.

- [ ] **Step 6: Commit**

```bash
git add src/land/SunlightMap.ts src/land/land.selftest.ts src/land/Land.ts src/ocean/waterShading.ts src/seabed/seabedShading.ts src/ocean/OceanSurface.ts src/breaker/BreakingRibbon.ts src/whitewater/SprayParticles.ts src/app/App.ts src/dev/selfTests.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(land): the land's shadow on the water, seabed, ribbon, particles and land

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The land in the water's reflections

**Files:**
- Create: `src/land/skyline.ts`, `src/land/skyline.test.ts`, `src/land/SkylineTable.ts`
- Modify: `src/ocean/waterShading.ts`, `src/ocean/OceanSurface.ts`, `src/breaker/BreakingRibbon.ts`, `src/land/Land.ts`, `src/app/App.ts`, `src/land/land.selftest.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: `LandHeight` (Task 3), `Sky`, `DEFAULT_LINEUP_POSITION`.
- Produces:
  - `skyline.ts`:
    - `SKYLINE_BEARINGS` = 360, `SKYLINE_STEPS` = 160, `SKYLINE_MIN_M` = 20, `SKYLINE_MAX_M` = 15000, `SKYLINE_MOVE_M` = 25;
    - `skylineTable(heightAt, eye: { x; y; z }): Float32Array` (2 per bearing: distance m, height m with curvature, 0/0 = no land);
    - `bearingIndex(dx, dz): number`;
    - `skylineElevationFrom(table, bearing, alongM, yM): number` (rad; −π/2 for no land);
    - `reflectionCover(table, eye, p, r): number`, the CPU mirror of the shader's cover.
  - `SkylineTable.ts`: `class SkylineTable { update(land: LandHeight | null, version: number, eye: THREE.Vector3): boolean; reflectionNode(p: N, r: N, sky: Sky): { cover: N; radiance: N } }`.
  - `WaterSurfaceInputs.landReflection?: (r: N) => { cover: N; radiance: N }`;
  - `OceanSurfaceOptions.skyline?: SkylineTable`, `RibbonShading.skyline?: SkylineTable`, `Land.skyline: SkylineTable`.

- [ ] **Step 1: Write the failing test** (`src/land/skyline.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { bearingIndex, reflectionCover, skylineElevationFrom, skylineTable } from './skyline';

const deg = (r: number) => (r * 180) / Math.PI;

describe('skylineTable on a synthetic ridge', () => {
  const ridge = (x: number) => (x >= 500 ? 100 : 0);
  const eye = { x: 0, y: 1.5, z: 0 };
  const t = skylineTable(ridge, eye);
  it('finds the ridge to the east and nothing to the west', () => {
    expect(bearingIndex(1, 0)).toBe(90);
    expect(deg(skylineElevationFrom(t, 90, 0, eye.y))).toBeCloseTo(deg(Math.atan((100 - 1.5) / 500)), 0);
    expect(skylineElevationFrom(t, 270, 0, eye.y)).toBe(-Math.PI / 2);
  });
  it('sees the ridge higher from a point closer to it (plan ruling P8)', () => {
    expect(skylineElevationFrom(t, 90, 200, 0)).toBeGreaterThan(skylineElevationFrom(t, 90, 0, 0));
  });
  it('covers reflections below the skyline and not above it', () => {
    const down = (e: number): [number, number, number] => [Math.cos(e), Math.sin(e), 0];
    const sk = Math.atan((100 - 0) / 500);
    expect(reflectionCover(t, eye, [0, 0, 0], down(sk - 0.02))).toBe(1);
    expect(reflectionCover(t, eye, [0, 0, 0], down(sk + 0.02))).toBe(0);
    expect(reflectionCover(t, eye, [0, 0, 0], [-1, 0.01, 0])).toBe(0);
  });
  it('from high above the ridge the skyline is below the horizon, and the reflection sees no land', () => {
    const high = skylineTable(ridge, { x: 0, y: 300, z: 0 });
    expect(skylineElevationFrom(high, 90, 0, 300)).toBeLessThan(0);
    expect(reflectionCover(high, { x: 0, y: 300, z: 0 }, [0, 0, 0], [0.99, 0.1, 0])).toBe(0);
  });
});

describe('the skyline from the lineup (spec §3)', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  const [x, y, z] = DEFAULT_LINEUP_POSITION;
  const t = skylineTable((a, b) => land.heightAt(a, b), { x, y, z });
  it('is 7–8.5° due east and 0.5–2.5° along the coast', () => {
    const e = (b: number) => deg(skylineElevationFrom(t, b, 0, y));
    expect(e(90)).toBeGreaterThan(7); expect(e(90)).toBeLessThan(8.5);
    expect(e(0)).toBeGreaterThan(0.5); expect(e(0)).toBeLessThan(2.5);
    expect(e(165)).toBeGreaterThan(0.5); expect(e(165)).toBeLessThan(2.5);
  });
});
```

- [ ] **Step 2: Run it:** `npx vitest run src/land/skyline.test.ts`. Expected: FAIL, missing module.

- [ ] **Step 3: Implement.**

`src/land/skyline.ts`:

```ts
/**
 * The skyline table (spec §4.9, Ruling L6; plan ruling P8): for each whole degree of bearing (0 = north, 90 = east), the
 * land sample seen highest from the eye, as (distance m, height m with the Earth's curvature drop). The water's
 * reflection recomputes the elevation from its own point along the bearing.
 */
export const SKYLINE_BEARINGS = 360;
export const SKYLINE_STEPS = 160;
export const SKYLINE_MIN_M = 20;
export const SKYLINE_MAX_M = 15000;
/** Rebuild when the eye moves this far. */
export const SKYLINE_MOVE_M = 25;
/** Half the soft edge of the land in a reflection (rad): 0.3° in all. */
export const SKYLINE_EDGE_RAD = 0.0026;
const EARTH_RADIUS_M = 6_371_000;

export function bearingIndex(dx: number, dz: number): number {
  const b = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI);
  return ((b % 360) + 360) % 360;
}

export function skylineTable(heightAt: (x: number, z: number) => number, eye: { x: number; y: number; z: number }): Float32Array {
  const out = new Float32Array(2 * SKYLINE_BEARINGS);
  for (let b = 0; b < SKYLINE_BEARINGS; b++) {
    const a = (b * Math.PI) / 180, dx = Math.sin(a), dz = -Math.cos(a);
    let best = -Infinity, bestD = 0, bestH = 0;
    for (let k = 0; k < SKYLINE_STEPS; k++) {
      const d = SKYLINE_MIN_M * (SKYLINE_MAX_M / SKYLINE_MIN_M) ** (k / (SKYLINE_STEPS - 1));
      const h = heightAt(eye.x + dx * d, eye.z + dz * d);
      if (h <= 0.5) continue; // the sea (and the wet beach) is no skyline
      const hEff = h - (d * d) / (2 * EARTH_RADIUS_M);
      const e = (hEff - eye.y) / d;
      if (e > best) { best = e; bestD = d; bestH = hEff; }
    }
    out[2 * b] = bestD;
    out[2 * b + 1] = bestH;
  }
  return out;
}

/** The skyline's elevation (rad) along a bearing, seen from a point alongM along it from the eye at height yM. */
export function skylineElevationFrom(t: Float32Array, bearing: number, alongM: number, yM: number): number {
  const d = t[2 * bearing];
  if (d <= 0) return -Math.PI / 2;
  return Math.atan((t[2 * bearing + 1] - yM) / Math.max(d - alongM, 10));
}

/** CPU mirror of SkylineTable.reflectionNode's cover: 1 where the reflected ray r from water point p hits the land. */
export function reflectionCover(t: Float32Array, eye: { x: number; z: number }, p: [number, number, number], r: [number, number, number]): number {
  const b = bearingIndex(r[0], r[2]);
  const h = Math.hypot(r[0], r[2]) || 1;
  const along = ((p[0] - eye.x) * r[0] + (p[2] - eye.z) * r[2]) / h;
  const sk = skylineElevationFrom(t, b, along, p[1]);
  if (sk === -Math.PI / 2) return 0;
  const e = Math.asin(Math.max(-1, Math.min(1, r[1] / Math.hypot(...r))));
  const x = Math.min(1, Math.max(0, (e - (sk - SKYLINE_EDGE_RAD)) / (2 * SKYLINE_EDGE_RAD)));
  return 1 - x * x * (3 - 2 * x);
}
```

`src/land/SkylineTable.ts`:

```ts
import * as THREE from 'three/webgpu';
import { PI, asin, atan, clamp, dot, float, floor, int, length, max, mod, normalize, select, smoothstep, uniform, uniformArray, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { LandHeight } from './landHeight';
import { SKYLINE_BEARINGS, SKYLINE_EDGE_RAD, SKYLINE_MOVE_M, skylineTable } from './skyline';

type N = any;

/** What the land looks like in a reflection: dark heath facing back along the ray (spec §4.9). */
const REFLECT_ALBEDO = vec3(0.1, 0.12, 0.075);

/** The skyline table on the GPU: a uniform array (not a texture: the water's material is near its texture limit). */
export class SkylineTable {
  private readonly entries = uniformArray(Array.from({ length: SKYLINE_BEARINGS }, () => new THREE.Vector2()), 'vec2');
  private readonly eye = uniform(new THREE.Vector3(1e9, 0, 1e9));
  private builtFor = -1;

  /** Rebuild when the land changed (its version) or the eye moved SKYLINE_MOVE_M. Returns true if it rebuilt. */
  update(land: LandHeight | null, version: number, eye: THREE.Vector3): boolean {
    if (!land) return false;
    const e = this.eye.value;
    if (version === this.builtFor && Math.hypot(eye.x - e.x, eye.z - e.z) < SKYLINE_MOVE_M && Math.abs(eye.y - e.y) < SKYLINE_MOVE_M) return false;
    const t = skylineTable((x, z) => land.heightAt(x, z), { x: eye.x, y: eye.y, z: eye.z });
    const arr = this.entries.array as THREE.Vector2[];
    for (let b = 0; b < SKYLINE_BEARINGS; b++) arr[b].set(t[2 * b], t[2 * b + 1]);
    e.copy(eye);
    this.builtFor = version;
    return true;
  }

  /** How much of reflected ray r from world point p hits the land, and the land's radiance there. */
  reflectionNode(p: N, r: N, sky: Sky): { cover: N; radiance: N } {
    const deg = atan(r.x, r.z.negate()).mul(180.0 / Math.PI);
    const idx = int(mod(floor(deg.add(0.5)).add(360.0), 360.0));
    const entry = this.entries.element(idx);
    const dirH = normalize(vec2(r.x, r.z));
    const along = dot(p.xz.sub(this.eye.xz), dirH);
    const dist = max(entry.x.sub(along), 10.0);
    const sk = atan(entry.y.sub(p.y).div(dist));
    const rElev = asin(clamp(r.y, -1.0, 1.0));
    const cover = select(entry.x.greaterThan(0.0), float(1.0).sub(smoothstep(sk.sub(SKYLINE_EDGE_RAD), sk.add(SKYLINE_EDGE_RAD), rElev)), float(0.0));
    const l = sky.sunDirection;
    const face = normalize(vec3(r.x.negate().mul(0.97), 0.26, r.z.negate().mul(0.97)));
    const lum = REFLECT_ALBEDO.mul(sky.skyIrradiance.mul(0.7).add(sky.sunIlluminance.mul(max(dot(face, l), 0.0)))).div(PI);
    const radiance = sky.applyAerialPerspective(lum, length(vec2(dist, entry.y.sub(p.y))), normalize(r));
    return { cover, radiance };
  }
}
```

Implementation notes:
- Check the name of three's float modulo (`mod`) before using it. `atan(y, x)` is the two-argument form in r186.
- If `uniformArray` of `Vector2` doesn't update after `.array` mutation, set `this.entries.needsUpdate = true` (or `.value`, whichever the r186 `UniformArrayNode` reads). The selftest below proves it either way.

**waterShading.ts:** add to `WaterSurfaceInputs`:

```ts
  /** The land seen in the reflection (Phase 4a §4.9): how much of the reflected ray r hits it, and its radiance. */
  landReflection?: (r: N) => { cover: N; radiance: N };
```

In `shadeWater`, after `skyReflection`:

```ts
  const land = i.landReflection ? i.landReflection(r) : null;
  const seen = land ? mix(skyReflection, land.radiance, land.cover) : skyReflection;
```

and use `seen` in place of `skyReflection` in the `reflection = mix(…)` line.

**OceanSurface.ts / BreakingRibbon.ts:** options gain `skyline?: SkylineTable` (type-only import). Pass `landReflection: options.skyline ? (r: N) => options.skyline!.reflectionNode(positionWorld, r, sky) : undefined` into `shadeWater`; the ribbon does the same with its shading options.

**Land.ts:** `readonly skyline = new SkylineTable();`. `update(renderer, sun, eye: THREE.Vector3)` also calls `this.skyline.update(this.height, this.version, eye)`.

**App.ts:** pass `skyline: this.land.skyline` into `OceanSurface`'s and the ribbon's options; call `this.land.update(this.renderer, sun.direction, this.camera.position)`.

**Limits test:** in the sunlight `it` for the sheet above, build `lit` with `{ foamMap: foam, sunlight, skyline: new SkylineTable() }`. Assert sampled textures unchanged by the skyline (still +1 over `w0` in total) and uniform buffers ≤ 12.

**Selftest** (append to `land.selftest.ts`):

```ts
registerSelfTest({
  name: 'land: the GPU reflection cover matches the CPU skyline (0/1 away from the edge)',
  async run(renderer) {
    const land = await bakedLand();
    const table = new SkylineTable();
    const eye = new THREE.Vector3(-25, 0.8, 45);
    table.update(land, 1, eye);
    const cpuTable = skylineTable((x, z) => land.heightAt(x, z), eye);
    const cases: [number[], number[]][] = [
      [[-25, 0, 45], [1, 0.02, 0]], [[-25, 0, 45], [1, 0.3, 0]], [[-25, 0, 45], [-1, 0.02, 0]],
      [[100, 0, 0], [1, 0.1, 0.1]], [[-25, 0, 45], [0.2, 0.01, -1]],
    ];
    const n = cases.length;
    const pAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([p]) => [...p, 0])), 4);
    const rAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([, r]) => [...r, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const P = storage(pAttr, 'vec4', n).toReadOnly(), R = storage(rAttr, 'vec4', n).toReadOnly(), O = storage(outAttr, 'vec4', n);
    const sky = new Sky();
    renderer.compute(Fn(() => {
      const c = table.reflectionNode(P.element(instanceIndex).xyz, normalize(R.element(instanceIndex).xyz), sky).cover;
      O.element(instanceIndex).assign(vec4(c, 0.0, 0.0, 0.0));
    })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    const rows = cases.map(([p, r], i) => {
      const len = Math.hypot(...r);
      const cpu = reflectionCover(cpuTable, eye, p as [number, number, number], r.map((v) => v / len) as [number, number, number]);
      worst = Math.max(worst, Math.abs(out[i * 4] - cpu));
      return `gpu ${out[i * 4].toFixed(2)} cpu ${cpu.toFixed(2)}`;
    });
    return { pass: worst <= 0.05, detail: `worst ${worst.toFixed(3)}; ${rows.join('; ')}` };
  },
});
```

(Imports: `normalize` from `three/tsl`; `Sky` from `../sky/Sky`; `SkylineTable`, `skylineTable` and `reflectionCover`.)

- [ ] **Step 4: Run** the skyline test, the limits test, the full suite and `npx tsc --noEmit`. Expected: green.

- [ ] **Step 5: In the browser:**
  - `/?selftest`: 46/46.
  - Then noon from the lineup facing east: the water toward the beach reflects dark land below the skyline and bright sky above it, with no hard stair-step (the 1° bearing table with its soft edge).
  - Screenshot for the ledger.

- [ ] **Step 6: Commit**

```bash
git add src/land/skyline.ts src/land/skyline.test.ts src/land/SkylineTable.ts src/land/Land.ts src/land/land.selftest.ts src/ocean/waterShading.ts src/ocean/OceanSurface.ts src/breaker/BreakingRibbon.ts src/app/App.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(land): the land in the water's reflections (the skyline table)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Reference moments, costs, gallery, docs

**Files:**
- Modify: `src/dev/referenceMoments.ts`, `src/dev/referenceMoments.test.ts`, `docs/superpowers/specs/2026-09-28-the-view-back-design.md`
- Create: `docs/superpowers/gallery/phase-4/README.md` and the gallery images

**Interfaces:**
- Consumes: everything above; `captureFrame()` on `window.liquidDreams` (dev builds).

- [ ] **Step 1: The reference moments (test first).**
  - In `referenceMoments.test.ts`, extend the expected name list with `'in-the-shade', 'sunbreak'` at the end, and run it. Expected: FAIL.
  - Then append to `REFERENCE_MOMENTS`:

```ts
  ref('in-the-shade', "07:45 facing the land (east): the lineup still in the ridge's shade, a glow along the skyline where the sun will break.",
    conditions({ timeOfDay: 7.75 }), lineup(90, 4)),
  ref('sunbreak', '08:05 facing the sun (ENE): the sun clearing the ridge, the light arriving across the water.',
    conditions({ timeOfDay: 8 + 5 / 60 }), lineup(58, 4)),
```

  - Run the test again. Expected: PASS.

- [ ] **Step 2: Measure** (dev server, pane **visible**, default 1080p view). Ledger each number:
  - **The land's draw:** at `morning-offshore` turned to face east (yaw 90), fence `picture.render` with `device.queue.onSubmittedWorkDone()` over 60 frames with `land.mesh.visible` true vs false. Target ≤ 1 ms.
  - **The sunlight rebuild:** `renderer.compute(marchPass)` fenced, the mean of 20. Target ≤ 5 ms.
  - **The skyline rebuild:** `performance.now()` around `skylineTable`. Target ≤ 5 ms.
  - **The load:** from `land.load()` start to the mesh visible. Target ≤ 1.5 s.
  - **The triangle count and uniform/texture counts** from the limits test log.
  - If any target is missed, ledger the numbers for Andrew; don't stall.

- [ ] **Step 3: Depth check (plan ruling P9).** At `overview` and at the lineup facing north along the coast (yaw 0), zoom the screenshot on the far waterline (5–15 km). Flicker between frames means a depth fight. Reversed depth is on, so there should be none. If there is, lift the outer ring's land 5 cm where it meets the sea (`heightAt` for d ∈ [0, 12] and |z| > 4000) and ledger it.

- [ ] **Step 4: Gallery** (`docs/superpowers/gallery/phase-4/`). Point the shot server's `OUT` at this folder (the scratchpad `shot_server.py`: edit its `OUT` path and restart it). For each shot, set the moment, then `await window.liquidDreams.captureFrame()` and POST the blob to `http://127.0.0.1:8765/?name=<file>`:
  - `01-in-the-shade.png`: `in-the-shade`;
  - `02-sunbreak.png`: `sunbreak`;
  - `03-default-facing-east.png`: 08:15, lineup yaw 90, pitch 4;
  - `04-north-to-lefthanders.png`: 08:15, lineup yaw 0, pitch 2;
  - `05-south-to-ellensbrook.png`: 08:15, lineup yaw 170, pitch 2;
  - `06-midday-east.png`: 12:30, lineup yaw 90;
  - `07-sunset-land-gold.png`: 17:25, lineup yaw 90;
  - `08-beach-from-inside.png`: free camera at (120, 3, −20), yaw 90, pitch −3, 10:30;
  - `09-shadow-off.png`: `in-the-shade` with `land shadow` off;
  - `00-sheet.png`: a contact sheet of 01–09 (PIL in the scratchpad).
  
  Send `00-sheet.png` to Andrew with SendUserFile.

- [ ] **Step 5: Docs.**
  - `gallery/phase-4/README.md`: what each shot shows, the measured costs, and the data credit (point to `public/terrain/CREDITS.md`).
  - The spec's Status line becomes "Implemented on `phase-4a-the-view-back`; not merged".
  - Add a short "As built" note under §4.12 with the measured costs and plan rulings P1–P10.

- [ ] **Step 6: Final checks and commit.** Run the full suite, `npx tsc --noEmit` and `/?selftest` (46/46). Then:

```bash
git add src/dev/referenceMoments.ts src/dev/referenceMoments.test.ts docs/superpowers/gallery/phase-4 docs/superpowers/specs/2026-09-28-the-view-back-design.md
git commit -m "docs(land): gallery, measured cost, as-built notes; the in-the-shade and sunbreak moments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin phase-4a-the-view-back
```

**Do not merge.**
