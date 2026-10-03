# The Dune Up Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dune hold up at 2–5 m anywhere near the camera. That means:
- real heath shrubs with leaves and branches;
- grasses and sedges;
- sand, soil and limestone with real surface detail;
- the Cape to Cape, the junction clearing (the crew's new stand spot) and the beach path, worn into the ground with
  footprints.

**Architecture:**
- **Offline (Blender, `tools/heath/`):** builds a plant kit (glb, manifest, atlas). numpy builds the ground layers.
  Everything is committed under `public/heath/`.
- **Runtime, by distance:**
  - near (0–12 m): full plants;
  - mid (12–40 m): leaf-cluster cards;
  - far (beyond 40 m): today's hulls, recoloured.
- **Each plant is one placement in every band**, cross-faded with a dither in the shader.
- **The ground patch:** gains height-blended material layers, 25 cm relief and a tracks mask.
- **Tracks:** routed once with the land build, by least-cost paths over our own terrain.

**Tech Stack:**
- TypeScript, three 0.186.1 (WebGPU, TSL), vitest 5;
- Blender 5.2.2 (bpy, bmesh, mathutils, its bundled numpy);
- Python 3 with numpy and Pillow (outside Blender);
- Vite 8's `runnerImport` for the launcher's TS imports.

**Spec:** `docs/superpowers/specs/2026-10-02-dune-up-close-design.md` (approved 2026-10-02).

## Global Constraints

- Assets are CC0 or project-made (Steam). Every file in `public/heath/` gets a line in `public/heath/LICENSES.md`.
- `reference/` (Andrew's photos: `C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/dune/flora/`) is
  git-ignored. Never commit, publish or trace it, and never use it in an Artifact. The gate 1 sheet is a local file in
  git-ignored `tools/heath/previews/`.
- Never trace Google imagery. The tracks come from rules over our terrain only.
- The files are CRLF. Edit with Python that preserves `\r\n`, or the Edit tool; never `sed -i` (it converts to LF).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never commit `.claude/launch.json` in the main checkout. No push or merge unless Andrew says so.
- **Budgets** on the RTX 4060 Laptop at 1080p:

  | | Cap |
  |---|---|
  | Plants, all bands | ≤ 1.0 ms GPU |
  | Ground patch | ≤ 0.5 ms GPU |
  | Scatter | ≤ 0.4 ms GPU |
  | Footprints | ≤ 0.1 ms GPU |
  | Total | ≤ 2.0 ms GPU |
  | Re-lay and culling, worst frame | ≤ 2 ms CPU |
  | Tracks mask | ≤ 0.5 ms CPU |
  | Track routing | ≤ 500 ms |
  | Shadow rebuild | ≤ 3 ms |
  | `public/heath/` | ≤ 30 MB on disk |

- **Shader limits per stage:** ≤ 16 sampled textures, ≤ 12 uniform buffers, ≤ 8 storage buffers.
- **"Be careful everything renders":** every new mesh is checked by a GPU self-test that it draws pixels.
- **Shader prewarm:** new materials are prewarmed in the scene pass (`compileAsync` misses it), and no instanced mesh is
  ever built on empty geometry (`docs/superpowers/specs` shader-prewarm lessons, memory `shader-prewarm.md`).
- **Dev server:** `ld-step2` on port 5177 serves this worktree (`../ld-surfer`). GPU self-tests run at
  `http://localhost:5177/?selftest=<filter>`. Page loads take 2–3 min after a rebuild, so poll in separate short checks.

## Review Focus

Plan rulings against the spec's letter (decided here; the executor ledgers them as given):
- **Culling:** the kit plants are culled per plant (a bounding-sphere test, about 3,000 a frame) rather than per 4 m
  cell (§4.2). It is finer and as cheap.
- **Relief fade:** the 25 cm relief fades only at the patch's edge, not with camera distance. Geometry that moved with
  the camera would slide under the scatter. The shading detail fades 16 → 30 m as §4.3 says.
- **Ground layers:** synthesised with numpy rather than baked in Blender from sculpts (§4.3). They're still
  project-made, and they're reproducible and testable without a GPU.
- **Hull overlap:** the far hulls also draw the 37–43 m overlap, so they appear wherever L1 fades. §3.1's L2 starts at
  40 m. Here the hulls' existing 25 m LOD switch never applies, and the 70 m one stays.

1. **A beach-shape slider rebuild** (`Land.rebuild` on the main thread) must re-route the tracks and re-seat
   everything. Expected: the tracks, the stand spot, plants and scatter follow the new land; no stale corridor.
   Test: Task 4, `landHeight` rebuild keeps a network.
2. **Plant density 0** (the Land folder's bush slider). Expected: no kit plants, no hulls and no tufts. Ground items
   still lie on the ground, and the painted heath stands. Test: Task 21, `nearScatter` with density 0 keeps stones
   and twigs only; Task 12, the kit draws none.
3. **The camera underwater, or the patch hidden** (free camera high up). Expected: no near kit plants or scatter drawn
   against a missing patch; the hulls cover. Test: Task 12, `KitMeshes.update` with `patch.on = false` draws only
   beyond `NEAR_M`.
4. **A land with no stretch near the lineup that can see the break.** Expected: the highest ground is chosen and the
   game still runs. Test: Task 2, a ridge between the track and the sea.
5. **Walking fast along the Cape to Cape** (the re-lay keeping up). Expected: no plant missing within 12 m for more than
   one frame after a 10 m jump. Test: Task 7, after any move the ring drains its queue in at most 4 frames.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/land/tracks.ts` | route the Cape to Cape, junction and beach path; `TrackNetwork` queries (distance, worn, sink, clearing, reach, stand spot) | 2, 3 |
| `src/land/landHeight.ts` | `baseHeightAt` (no sink) and `heightAt` (+ sink); `setTracks`; `fineZRange` | 4 |
| `src/land/landBuild.ts`, `landWorker.ts`, `Land.ts`, `landMesh.ts`, `sunlight` call | the build routes tracks; mesh and march use base heights | 4 |
| `src/surfer/placement.ts`, `gang.ts`, `src/app/App.ts`, `src/dev/DevPanel.ts` | `standSpot`, gang camera inside the clearing, clearings from corridors | 5 |
| `src/heath/plants.ts`, `src/sound/levels.ts` | closed-cover density, `dead`, corridor exclusion, density reference | 6 |
| `src/heath/plantRing.ts` (new), `src/heath/PlantMeshes.ts` | incremental per-cell re-lay of the far hulls | 7 |
| `tools/heath/*` (new), `package.json` | Blender kit build, hull export, ground layers | 8–11, 15, 20 |
| `src/heath/kit.ts`, `src/heath/KitMeshes.ts` (new) | load the kit; near and mid instanced meshes, fades, wind, culling | 12 |
| `src/dev/speciesSheet.ts` (new) | gate 1 sheet capture | 13 |
| `src/beach/groundHeights.ts` (new) | CPU mirror of the patch surface (base, relief, sink) | 16 |
| `src/beach/groundDetail.ts` (new), `GroundPatchMesh.ts`, `groundPatch.ts`, `src/land/landShading.ts` | layers, height blend, relief, tracks mask | 17 |
| `src/beach/Footprints.ts` (new) | footprint decals | 18 |
| `src/beach/RockMeshes.ts` | limestone triplanar on face rocks within 16 m | 19 |
| `src/heath/nearScatter.ts`, `src/heath/ScatterMeshes.ts` (new) | scatter placement and drawing | 21, 22 |
| `src/beach/rockShadows.ts`, `src/heath/plants.ts` | canopy-silhouette shadows | 23 |
| `src/heath/PlantMeshes.ts`, `src/heath/heath.selftest.ts` | far recolour; colour-match, no-pop, renders and timing self-tests | 24, 25 |

---

### Task 1: Texture-slot headroom on the patch

**Files:**
- Modify: `src/breaker/BreakingRibbon.limits.test.ts` (the `'the ground patch, the rocks and the land…'` case, ~line 183)

**Interfaces:**
- Consumes: the existing `renderWgsl`, `sampledTextures`, `uniformBuffers`.
- Produces: `PATCH_TEXTURE_HEADROOM = 3`, a known count before Task 17 adds three fragment slots and two vertex slots.

- [ ] **Step 1: Write the failing test.** Add after the patch case:

```ts
    it('the ground patch has room for the dune-up-close layers (3 fragment and 2 vertex slots; spec §4.3)', () => {
      const patch = new GroundPatch(sky, createLandLookUniforms(), { sunVisibility: (xz) => sunlight.visibilityNode(xz) });
      const w = renderWgsl(patch.mesh);
      console.log(`patch headroom: vertex ${16 - sampledTextures(w.vertex)}, fragment ${16 - sampledTextures(w.fragment)}`);
      expect(sampledTextures(w.fragment)).toBeLessThanOrEqual(16 - 3);
      expect(sampledTextures(w.vertex)).toBeLessThanOrEqual(16 - 2);
    });
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run src/breaker/BreakingRibbon.limits.test.ts -t "room for the dune"`
Expected: PASS, with the printed headroom at least 3/2. This is a measurement, so a pass is the expected outcome. If it
FAILS, stop and ledger a ruling: pack `detail` and `zones` into one RGBA texture (`detail.xyz` + `zones.w` unused today
→ move `zones` into `detail.w` …). Record the counts in the ledger either way.

- [ ] **Step 3: Commit.**

```bash
git add src/breaker/BreakingRibbon.limits.test.ts
git commit -m "test(limits): the ground patch's texture headroom for the dune-up-close layers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Routing the tracks

**Files:**
- Create: `src/land/tracks.ts`
- Test: `src/land/tracks.test.ts`

**Interfaces:**
- Consumes: `BeachProfile`, `DEFAULT_BEACH` from `./landHeight`; `smoothstep`.
- Produces:

```ts
export interface RouteLand {
  baseHeightAt(x: number, z: number): number;
  waterlineAt(z: number): number;
  profile: BeachProfile;
}
export interface TrackPiece { name: 'capeToCape' | 'beachPath'; points: [number, number][]; halfWidthM: number }
export interface TrackData { pieces: TrackPiece[]; junction: { x: number; z: number; along: [number, number] } }
export const WOMB_LINEUP: { x: number; z: number }; // { x: -25, z: 45 } (DEFAULT_SURFER_PARAMS)
export function routeTracks(land: RouteLand, zRange: [number, number], lineup?: { x: number; z: number }): TrackData;
```

- [ ] **Step 1: Write the failing tests.** The synthetic land has the waterline at x = 190, the default beach, and
behind it a dune rising 0.25 m per metre to a plateau at x = 320. One variant puts a ridge 4 m high at x = 280 between
the track band and the sea.

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BEACH, beachHeight } from './landHeight';
import { WOMB_LINEUP, routeTracks, type RouteLand } from './tracks';

const toeEnd = DEFAULT_BEACH.wetWidthM + DEFAULT_BEACH.dryWidthM + DEFAULT_BEACH.toeWidthM;
function land(ridge = false): RouteLand {
  return {
    profile: DEFAULT_BEACH,
    waterlineAt: () => 190,
    baseHeightAt: (x, z) => {
      const d = x - 190;
      let h = d <= toeEnd ? beachHeight(d) : Math.min(DEFAULT_BEACH.toeTopM + 0.25 * (d - toeEnd), 40) + 0.6 * Math.sin(z / 37);
      if (ridge) h += 30 * Math.exp(-(((x - 280) / 6) ** 2));
      return h;
    },
  };
}
const grade = (l: RouteLand, a: [number, number], b: [number, number]): number =>
  Math.abs(l.baseHeightAt(b[0], b[1]) - l.baseHeightAt(a[0], a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('routeTracks', () => {
  const l = land();
  const t = routeTracks(l, [-600, 600]);
  const c2c = t.pieces.find((p) => p.name === 'capeToCape')!, beach = t.pieces.find((p) => p.name === 'beachPath')!;
  it('is deterministic', () => {
    expect(JSON.stringify(routeTracks(land(), [-600, 600]))).toBe(JSON.stringify(t));
  });
  it('runs the Cape to Cape the length of the range, 1 m wide, behind the dunes', () => {
    expect(c2c.halfWidthM).toBe(0.5);
    expect(c2c.points[0][1]).toBeLessThanOrEqual(-598);
    expect(c2c.points.at(-1)![1]).toBeGreaterThanOrEqual(598);
    for (const [x] of c2c.points) expect(x - 190).toBeGreaterThan(toeEnd + 20);
  });
  it('keeps every track walkable (grade ≤ 0.35 over any 2 m)', () => {
    for (const p of [c2c, beach]) {
      for (let i = 2; i < p.points.length; i += 2) expect(grade(l, p.points[i - 2], p.points[i])).toBeLessThanOrEqual(0.35);
    }
  });
  it('puts the junction on the Cape to Cape within 40 m of the lineup', () => {
    expect(Math.abs(t.junction.z - WOMB_LINEUP.z)).toBeLessThanOrEqual(40);
    const near = Math.min(...c2c.points.map(([x, z]) => Math.hypot(x - t.junction.x, z - t.junction.z)));
    expect(near).toBeLessThan(0.6);
  });
  it('ends the beach path at the waterline within 5 m of the lineup, 0.9 m wide', () => {
    const end = beach.points.at(-1)!;
    expect(beach.halfWidthM).toBe(0.45);
    expect(Math.abs(end[0] - 190)).toBeLessThan(1);
    expect(Math.abs(end[1] - WOMB_LINEUP.z)).toBeLessThanOrEqual(5);
    expect(Math.hypot(beach.points[0][0] - t.junction.x, beach.points[0][1] - t.junction.z)).toBeLessThan(0.6);
  });
  it('without a clear view anywhere near the lineup, takes the highest ground there (Review Focus 4)', () => {
    const r = routeTracks(land(true), [-600, 600]);
    const c = r.pieces[0].points.filter(([, z]) => Math.abs(z - WOMB_LINEUP.z) <= 40);
    const top = Math.max(...c.map(([x, z]) => land(true).baseHeightAt(x, z)));
    expect(land(true).baseHeightAt(r.junction.x, r.junction.z)).toBeCloseTo(top, 1);
  });
});
```

- [ ] **Step 2: Run them.** Run: `npx vitest run src/land/tracks.test.ts`. Expected: FAIL, "Cannot find module './tracks'".

- [ ] **Step 3: Implement `routeTracks`.**

```ts
import { smoothstep } from '../math/smoothstep';
import type { BeachProfile } from './landHeight';

/** The walk to the Womb (dune-up-close spec §4.1): rebuilt by rule on our own terrain, never traced. */
export interface RouteLand {
  baseHeightAt(x: number, z: number): number;
  waterlineAt(z: number): number;
  profile: BeachProfile;
}
export interface TrackPiece { name: 'capeToCape' | 'beachPath'; points: [number, number][]; halfWidthM: number }
export interface TrackData { pieces: TrackPiece[]; junction: { x: number; z: number; along: [number, number] } }

export const WOMB_LINEUP = { x: -25, z: 45 };
const STEP_M = 2;
/** The Cape to Cape prefers 50–90 m inland of the dune toe and may wander 20–160 m. */
const C2C_BAND: [number, number] = [50, 90], C2C_ALLOWED: [number, number] = [20, 160];
const MAX_GRADE = 0.35, LATERAL_CELLS = 3;
const JUNCTION_REACH_M = 40, EYE_M = 1.6, HEATH_TOP_M = 1.4, CLEAR_M = 0.2, PLANTS_FROM_D = 45;

const toeEndOf = (p: BeachProfile): number => p.wetWidthM + p.dryWidthM + p.toeWidthM;
/** The step's cost: its length, dearer the steeper (a grade over MAX_GRADE all but forbidden). */
function stepCost(len: number, dh: number): number {
  const g = Math.abs(dh) / len;
  return len * (1 + 40 * g * g) + (g > MAX_GRADE ? 1000 * len : 0);
}

/** Chaikin corner-cutting, then 1 m resampling (ends kept). */
export function smoothLine(pts: [number, number][], passes = 2): [number, number][] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    q.push(p.at(-1)!);
    p = q;
  }
  const out: [number, number][] = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i], len = Math.hypot(bx - ax, bz - az);
    let s = 1 - carry;
    while (s <= len) { out.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len]); s += 1; }
    carry = len - (s - 1);
  }
  if (Math.hypot(out.at(-1)![0] - p.at(-1)![0], out.at(-1)![1] - p.at(-1)![1]) > 0.05) out.push(p.at(-1)!);
  return out;
}

/** The Cape to Cape: dynamic programming row by row along z (2 m), each row choosing its distance inland. */
function routeCapeToCape(land: RouteLand, zRange: [number, number]): [number, number][] {
  const toe = toeEndOf(land.profile);
  const d0 = toe + C2C_ALLOWED[0], nCols = Math.floor((C2C_ALLOWED[1] - C2C_ALLOWED[0]) / STEP_M) + 1;
  const nRows = Math.floor((zRange[1] - zRange[0]) / STEP_M) + 1;
  const xAt = (r: number, c: number): number => land.waterlineAt(zRange[0] + r * STEP_M) + d0 + c * STEP_M;
  const h = new Float64Array(nRows * nCols);
  for (let r = 0; r < nRows; r++) for (let c = 0; c < nCols; c++) h[r * nCols + c] = land.baseHeightAt(xAt(r, c), zRange[0] + r * STEP_M);
  const band = (c: number): number => {
    const d = d0 + c * STEP_M - toe, out = d < C2C_BAND[0] ? C2C_BAND[0] - d : d > C2C_BAND[1] ? d - C2C_BAND[1] : 0;
    return (out / 20) ** 2 * STEP_M;
  };
  const cost = new Float64Array(nRows * nCols), from = new Int32Array(nRows * nCols);
  for (let c = 0; c < nCols; c++) cost[c] = band(c);
  for (let r = 1; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      let best = Infinity, arg = c;
      for (let k = -LATERAL_CELLS; k <= LATERAL_CELLS; k++) {
        const p = c + k;
        if (p < 0 || p >= nCols) continue;
        const len = Math.hypot(STEP_M, k * STEP_M);
        const v = cost[(r - 1) * nCols + p] + stepCost(len, h[r * nCols + c] - h[(r - 1) * nCols + p]);
        if (v < best || (v === best && Math.abs(k) < Math.abs(arg - c))) { best = v; arg = p; }
      }
      cost[r * nCols + c] = best + band(c);
      from[r * nCols + c] = arg;
    }
  }
  let c = 0;
  for (let k = 1; k < nCols; k++) if (cost[(nRows - 1) * nCols + k] < cost[(nRows - 1) * nCols + c]) c = k;
  const pts: [number, number][] = [];
  for (let r = nRows - 1; r >= 0; r--) { pts.push([xAt(r, c), zRange[0] + r * STEP_M]); c = from[r * nCols + c]; }
  return smoothLine(pts.reverse());
}

/** From the junction at eye height, does the line to the lineup clear the heath tops (ground + 1.4 m, inland of 45 m) by 0.2 m? */
function seesLineup(land: RouteLand, x: number, z: number, lineup: { x: number; z: number }): boolean {
  const eye = land.baseHeightAt(x, z) + EYE_M, len = Math.hypot(lineup.x - x, lineup.z - z);
  for (let s = 3; s < len; s += 1) {
    const px = x + ((lineup.x - x) * s) / len, pz = z + ((lineup.z - z) * s) / len, d = px - land.waterlineAt(pz);
    if (d < 0) break; // over the water: nothing more to hide it
    const top = land.baseHeightAt(px, pz) + (d >= PLANTS_FROM_D ? HEATH_TOP_M : 0) + CLEAR_M;
    if (eye + (0 - eye) * (s / len) < top) return false;
  }
  return true;
}

function pickJunction(land: RouteLand, c2c: [number, number][], lineup: { x: number; z: number }): number {
  const near = c2c.map((p, i) => ({ i, dz: Math.abs(p[1] - lineup.z) })).filter((q) => q.dz <= JUNCTION_REACH_M).sort((a, b) => a.dz - b.dz || a.i - b.i);
  for (const q of near) if (seesLineup(land, c2c[q.i][0], c2c[q.i][1], lineup)) return q.i;
  let best = near[0].i;
  for (const q of near) if (land.baseHeightAt(...c2c[q.i]) > land.baseHeightAt(...c2c[best])) best = q.i;
  return best;
}

/** The beach path: Dijkstra on a 2 m grid from the junction to the back of the dry sand within 5 m of the lineup, then straight across the sand. */
function routeBeachPath(land: RouteLand, start: [number, number], lineupZ: number): [number, number][] {
  const p = land.profile, dryEnd = p.wetWidthM + p.dryWidthM;
  const x0 = land.waterlineAt(lineupZ) + dryEnd - 4, x1 = start[0] + 6, z0 = lineupZ - 80, z1 = lineupZ + 80;
  const nx = Math.ceil((x1 - x0) / STEP_M) + 1, nz = Math.ceil((z1 - z0) / STEP_M) + 1, n = nx * nz;
  const X = (i: number): number => x0 + (i % nx) * STEP_M, Z = (i: number): number => z0 + Math.floor(i / nx) * STEP_M;
  const H = new Float64Array(n);
  for (let i = 0; i < n; i++) H[i] = land.baseHeightAt(X(i), Z(i));
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const s = Math.round((start[1] - z0) / STEP_M) * nx + Math.round((start[0] - x0) / STEP_M);
  dist[s] = 0;
  const goal = (i: number): boolean => X(i) - land.waterlineAt(Z(i)) <= dryEnd && Math.abs(Z(i) - lineupZ) <= 5;
  // A binary heap keyed on dist.
  const heap: number[] = [s];
  const up = (k: number): void => { while (k > 0) { const q = (k - 1) >> 1; if (dist[heap[q]] <= dist[heap[k]]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
  const down = (k: number): void => { for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && dist[heap[a]] < dist[heap[m]]) m = a; if (b < heap.length && dist[heap[b]] < dist[heap[m]]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } };
  let end = -1;
  while (heap.length) {
    const i = heap[0];
    heap[0] = heap.at(-1)!; heap.pop(); down(0);
    if (done[i]) continue;
    done[i] = 1;
    if (goal(i)) { end = i; break; }
    const ix = i % nx, iz = Math.floor(i / nx);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
      const j = jz * nx + jx, v = dist[i] + stepCost(Math.hypot(dx, dz) * STEP_M, H[j] - H[i]);
      if (v < dist[j]) { dist[j] = v; prev[j] = i; heap.push(j); up(heap.length - 1); }
    }
  }
  if (end < 0) throw new Error('routeTracks: no beach path from the junction to the sand near the lineup');
  const pts: [number, number][] = [];
  for (let i = end; i >= 0; i = prev[i]) pts.push([X(i), Z(i)]);
  pts.reverse();
  pts[0] = start;
  const last = pts.at(-1)!;
  pts.push([land.waterlineAt(last[1]), last[1]]);
  return smoothLine(pts, 1);
}

export function routeTracks(land: RouteLand, zRange: [number, number], lineup = WOMB_LINEUP): TrackData {
  const c2c = routeCapeToCape(land, zRange);
  const j = pickJunction(land, c2c, lineup);
  const a = c2c[Math.max(0, j - 2)], b = c2c[Math.min(c2c.length - 1, j + 2)], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const junction = { x: c2c[j][0], z: c2c[j][1], along: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as [number, number] };
  const beach = routeBeachPath(land, [junction.x, junction.z], lineup.z);
  return { pieces: [{ name: 'capeToCape', points: c2c, halfWidthM: 0.5 }, { name: 'beachPath', points: beach, halfWidthM: 0.45 }], junction };
}

export { smoothstep as _smoothstep }; // re-exported for Task 3's queries in this module
```

Delete the `export { smoothstep as _smoothstep }` line in Task 3. It only keeps the import used until then.

- [ ] **Step 4: Run the tests.** Run: `npx vitest run src/land/tracks.test.ts`. Expected: PASS (6 tests). If the
grade test fails on the beach path's last straight segment across the sand, that is the dry beach slope (≤ 0.06),
not a bug. Re-read the failure before changing the cost.

- [ ] **Step 5: Commit.**

```bash
git add src/land/tracks.ts src/land/tracks.test.ts
git commit -m "feat(tracks): route the Cape to Cape, the junction and the beach path by least cost on our own terrain (dune-up-close §4.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Track queries (`TrackNetwork`)

**Files:**
- Modify: `src/land/tracks.ts`
- Test: `src/land/tracks.test.ts`

**Interfaces:**
- Consumes: `TrackData` (Task 2).
- Produces:

```ts
export const CLEARING_SEMI_M: [number, number]; // [3.5, 2.5]: along the Cape to Cape, across
export const SINK_M = 0.04, CLEARING_SINK_M = 0.03, SHOULDER = 1.5, LATTICE_M = 0.25;
export class TrackNetwork {
  constructor(data: TrackData);
  readonly data: TrackData;
  /** Distance to the nearest corridor centreline and that corridor's half-width. */
  nearest(x: number, z: number): { d: number; halfWidthM: number };
  inClearing(x: number, z: number): boolean;
  /** Inside a corridor or the clearing. */
  onTrack(x: number, z: number): boolean;
  /** 1 on a track, easing to 0 at SHOULDER × the half-width (the clearing: 1 inside, 0 by 0.5 m outside). */
  worn(x: number, z: number): number;
  /** The analytic sink (m ≥ 0). */
  sinkExact(x: number, z: number): number;
  /** The sink as the GPU sees it: bilinear between sinkExact on the global 0.25 m lattice. */
  sinkAt(x: number, z: number): number;
  /** The furthest distance ≤ maxM along (dirX, dirZ) from (x, z) that stays on a track. */
  reach(x: number, z: number, dirX: number, dirZ: number, maxM: number): number;
  /** The crew's spot: 1.2 m seaward of the junction across the clearing, facing inland (heading 90). */
  standSpot(): { x: number; z: number; headingDeg: number };
}
```

- [ ] **Step 1: Write the failing tests.** Append to `tracks.test.ts`:

```ts
import { CLEARING_SEMI_M, LATTICE_M, SINK_M, TrackNetwork } from './tracks';

describe('TrackNetwork', () => {
  const t = new TrackNetwork(routeTracks(land(), [-600, 600]));
  const j = t.data.junction;
  it('knows the clearing as a 7 × 5 m ellipse along the Cape to Cape', () => {
    expect(t.inClearing(j.x, j.z)).toBe(true);
    expect(t.inClearing(j.x + j.along[0] * (CLEARING_SEMI_M[0] - 0.1), j.z + j.along[1] * (CLEARING_SEMI_M[0] - 0.1))).toBe(true);
    expect(t.inClearing(j.x - j.along[1] * (CLEARING_SEMI_M[1] + 0.1), j.z + j.along[0] * (CLEARING_SEMI_M[1] + 0.1))).toBe(false);
  });
  it('sinks a corridor 4 cm at its centre and nothing beyond its shoulders', () => {
    const p = t.data.pieces[0].points[200];
    expect(t.sinkExact(p[0], p[1])).toBeCloseTo(SINK_M, 3);
    expect(t.sinkExact(p[0] + 5, p[1])).toBe(0);
  });
  it('changes the sink by at most 1 cm per 25 cm', () => {
    const p = t.data.pieces[1].points[10];
    for (let s = -2; s < 2; s += 0.05) expect(Math.abs(t.sinkAt(p[0] + s + LATTICE_M, p[1]) - t.sinkAt(p[0] + s, p[1]))).toBeLessThanOrEqual(0.01);
  });
  it('matches sinkExact on the lattice and interpolates between', () => {
    expect(t.sinkAt(j.x - (j.x % LATTICE_M), j.z - (j.z % LATTICE_M))).toBeCloseTo(t.sinkExact(j.x - (j.x % LATTICE_M), j.z - (j.z % LATTICE_M)), 6);
  });
  it('puts the stand spot in the clearing, facing inland', () => {
    const s = t.standSpot();
    expect(t.inClearing(s.x, s.z)).toBe(true);
    expect(s.headingDeg).toBe(90);
    expect(s.x).toBeLessThan(j.x);
  });
  it('reaches along a heading only as far as the track goes', () => {
    const s = t.standSpot();
    const r = t.reach(s.x, s.z, 1, 0, 5.5);
    expect(r).toBeGreaterThan(2);
    expect(t.onTrack(s.x + r, s.z)).toBe(true);
    expect(r).toBeLessThanOrEqual(5.5);
  });
});
```

- [ ] **Step 2: Run them.** Run: `npx vitest run src/land/tracks.test.ts`. Expected: FAIL, "TrackNetwork is not a
constructor" (or not exported).

- [ ] **Step 3: Implement.** Replace the `export { smoothstep as _smoothstep }` line with:

```ts
export const CLEARING_SEMI_M: [number, number] = [3.5, 2.5];
export const SINK_M = 0.04, CLEARING_SINK_M = 0.03, SHOULDER = 1.5, LATTICE_M = 0.25;
const BUCKET_M = 4;

export class TrackNetwork {
  private readonly buckets = new Map<number, { ax: number; az: number; bx: number; bz: number; hw: number }[]>();
  constructor(readonly data: TrackData) {
    for (const p of data.pieces) {
      for (let i = 1; i < p.points.length; i++) {
        const [ax, az] = p.points[i - 1], [bx, bz] = p.points[i], seg = { ax, az, bx, bz, hw: p.halfWidthM };
        const reach = p.halfWidthM * SHOULDER + 1;
        for (let gx = Math.floor((Math.min(ax, bx) - reach) / BUCKET_M); gx <= Math.floor((Math.max(ax, bx) + reach) / BUCKET_M); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - reach) / BUCKET_M); gz <= Math.floor((Math.max(az, bz) + reach) / BUCKET_M); gz++) {
            const k = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
            let b = this.buckets.get(k);
            if (!b) this.buckets.set(k, (b = []));
            b.push(seg);
          }
        }
      }
    }
  }

  nearest(x: number, z: number): { d: number; halfWidthM: number } {
    const b = this.buckets.get((Math.floor(x / BUCKET_M) + 0x8000) * 0x10000 + (Math.floor(z / BUCKET_M) + 0x8000));
    let d = Infinity, hw = 0;
    for (const s of b ?? []) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, l2 = ex * ex + ez * ez;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * ex + (z - s.az) * ez) / l2)) : 0;
      const q = Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t));
      if (q - s.hw < d - hw) { d = q; hw = s.hw; }
    }
    return { d, halfWidthM: hw };
  }

  /** The clearing's ellipse radius at (x, z): < 1 inside. */
  private ellipse(x: number, z: number): number {
    const j = this.data.junction, dx = x - j.x, dz = z - j.z;
    const u = dx * j.along[0] + dz * j.along[1], v = -dx * j.along[1] + dz * j.along[0];
    return Math.hypot(u / CLEARING_SEMI_M[0], v / CLEARING_SEMI_M[1]);
  }

  inClearing(x: number, z: number): boolean {
    return this.ellipse(x, z) < 1;
  }

  onTrack(x: number, z: number): boolean {
    const n = this.nearest(x, z);
    return n.d <= n.halfWidthM || this.inClearing(x, z);
  }

  worn(x: number, z: number): number {
    const n = this.nearest(x, z);
    const corridor = Number.isFinite(n.d) ? 1 - smoothstep(n.halfWidthM, n.halfWidthM * SHOULDER, n.d) : 0;
    const e = this.ellipse(x, z), r = Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1]);
    const clearing = 1 - smoothstep(1, 1 + 0.5 / r, e);
    return Math.max(corridor, clearing);
  }

  sinkExact(x: number, z: number): number {
    const n = this.nearest(x, z);
    const corridor = Number.isFinite(n.d) ? SINK_M * (1 - smoothstep(0, n.halfWidthM * SHOULDER, n.d)) : 0;
    const e = this.ellipse(x, z), r = Math.min(CLEARING_SEMI_M[0], CLEARING_SEMI_M[1]);
    return Math.max(corridor, CLEARING_SINK_M * (1 - smoothstep(1, 1 + 0.5 / r, e)));
  }

  sinkAt(x: number, z: number): number {
    const fx = x / LATTICE_M, fz = z / LATTICE_M, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
    const s = (a: number, b: number): number => this.sinkExact(a * LATTICE_M, b * LATTICE_M);
    return (s(i, k) * (1 - tx) + s(i + 1, k) * tx) * (1 - tz) + (s(i, k + 1) * (1 - tx) + s(i + 1, k + 1) * tx) * tz;
  }

  reach(x: number, z: number, dirX: number, dirZ: number, maxM: number): number {
    const l = Math.hypot(dirX, dirZ);
    let best = 0;
    for (let s = 0.1; s <= maxM + 1e-9; s += 0.1) {
      if (!this.onTrack(x + (dirX / l) * s, z + (dirZ / l) * s)) break;
      best = s;
    }
    return best;
  }

  standSpot(): { x: number; z: number; headingDeg: number } {
    const j = this.data.junction;
    // Across the clearing, the side toward the sea (−x).
    let ax = -j.along[1], az = j.along[0];
    if (ax > 0) { ax = -ax; az = -az; }
    const tidy = (v: number): number => Math.round(v * 100) / 100;
    return { x: tidy(j.x + ax * 1.2), z: tidy(j.z + az * 1.2), headingDeg: 90 };
  }
}
```

- [ ] **Step 4: Run the tests.** Run: `npx vitest run src/land/tracks.test.ts`. Expected: PASS (12 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/land/tracks.ts src/land/tracks.test.ts
git commit -m "feat(tracks): the network's queries: corridors, the clearing, the worn mask, the sink on the 0.25 m lattice, the stand spot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The land carries the tracks

**Files:**
- Modify: `src/land/landHeight.ts` (`heightAt` → `baseHeightAt`; new `heightAt`, `setTracks`, `trackNetwork`, `fineZRange`)
- Modify: `src/land/landMesh.ts` (`buildLandMesh`, `coarseMeshHeightAt`: `land.heightAt` → `land.baseHeightAt`)
- Modify: `src/land/landBuild.ts` (`LandBuild.tracks`), `src/land/landWorker.ts`, `src/land/Land.ts` (`show`)
- Modify: `src/beach/groundPatch.ts` (`buildPatchGrids`: `heightAt` → `baseHeightAt`; the GPU adds the sink, Task 17)
- Test: `src/land/landHeight.test.ts` (append), `src/land/landBuild.test.ts` (append or create)

**Interfaces:**
- Consumes: `routeTracks`, `TrackNetwork` (Tasks 2–3).
- Produces: `LandHeight.baseHeightAt(x, z)`, `LandHeight.heightAt(x, z)` (base + `sinkAt`),
  `LandHeight.setTracks(t: TrackNetwork | null)`, `LandHeight.trackNetwork: TrackNetwork | null`,
  `LandHeight.fineZRange(): [number, number]`, `LandBuild.tracks: TrackData`.

- [ ] **Step 1: Write the failing tests.**

```ts
// landHeight.test.ts (uses the file's existing synthetic LandFile helper; name it `makeLand()` if it differs)
it('adds the tracks\' sink to heightAt and keeps baseHeightAt without it', () => {
  const lh = makeLand();
  const data = routeTracks(lh, [-300, 300]);
  lh.setTracks(new TrackNetwork(data));
  const [x, z] = data.pieces[0].points[100];
  expect(lh.baseHeightAt(x, z) - lh.heightAt(x, z)).toBeCloseTo(lh.trackNetwork!.sinkAt(x, z), 9);
  expect(lh.heightAt(x + 30, z)).toBe(lh.baseHeightAt(x + 30, z));
});
// landBuild.test.ts
it('routes the tracks with the build, and a rebuild keeps a network (Review Focus 1)', () => {
  const lh = makeLand();
  const b = buildLand(lh);
  expect(b.tracks.pieces.map((p) => p.name)).toEqual(['capeToCape', 'beachPath']);
  expect(structuredClone(b.tracks)).toEqual(b.tracks); // crosses the worker boundary
});
```

The heights are now *sub*tracted: `heightAt` is base **minus** the sink. In `TrackNetwork` the sink is a positive depth.

- [ ] **Step 2: Run them.** Run: `npx vitest run src/land`. Expected: FAIL, `baseHeightAt`/`setTracks` not functions and
`b.tracks` undefined.

- [ ] **Step 3: Implement.**

In `landHeight.ts`, rename the existing `heightAt` body to `baseHeightAt`, then add:

```ts
  private tracks: TrackNetwork | null = null;

  /** The walk to the Womb (dune-up-close §4.1); its sink is in heightAt, not in the coarse mesh. */
  setTracks(t: TrackNetwork | null): void {
    this.tracks = t;
  }

  get trackNetwork(): TrackNetwork | null {
    return this.tracks;
  }

  /** The composed height less the tracks' worn sink: where feet and the fine patch stand. */
  heightAt(x: number, z: number): number {
    const h = this.baseHeightAt(x, z);
    return this.tracks ? h - this.tracks.sinkAt(x, z) : h;
  }

  /** The fine grid's z extent (the Cape to Cape's length). */
  fineZRange(): [number, number] {
    const g = this.file.fine;
    return [g.z0, g.z0 + (g.nz - 1) * g.cellM];
  }
```

(Import `TrackNetwork` as a type from `./tracks`.) In `landMesh.ts`, change both `land.heightAt(` calls in
`coarseMeshHeightAt` and every one in `buildLandMesh` to `land.baseHeightAt(`. In `landBuild.ts`:

```ts
export interface LandBuild {
  mesh: LandMeshData;
  march: Float32Array;
  /** The tracks, routed on the composed height (plain arrays: they cross the worker boundary). */
  tracks: TrackData;
}
export function buildLand(height: LandHeight): LandBuild {
  return {
    mesh: buildLandMesh(height),
    march: buildMarchHeights((x, z) => height.baseHeightAt(x, z)),
    tracks: routeTracks(height, height.fineZRange()),
  };
}
```

In `Land.show`: `height.setTracks(new TrackNetwork(built.tracks));` before `this.height = height;`. The worker posts
`b` as it does, and `tracks` is structured-cloned with it. In `groundPatch.ts`, `buildPatchGrids` calls
`land.baseHeightAt` for `hm`. Its `heights`/`raw` are the base; Task 17's mask adds the sink on the GPU.

- [ ] **Step 4: Run the land, beach and placement tests.**

Run: `npx vitest run src/land src/beach src/surfer/placement.test.ts`
Expected: PASS. `landMesh.test`'s exact-surface check still passes (mesh and `coarseMeshHeightAt` both use the base).
Time the routing on the real file once:

```bash
npx vitest run src/land/landBuild.test.ts -t "routes" --reporter=verbose
```

Expected: under 500 ms for `routeTracks` on the 8 km fine grid. Add a `performance.now()` log in the test that loads
`public/terrain/womb-land.bin` if the file has such a test; ledger the number.

- [ ] **Step 5: Commit.**

```bash
git add src/land src/beach/groundPatch.ts
git commit -m "feat(land): the build routes the tracks; heightAt carries their worn sink, the coarse mesh and the patch grid keep the base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The stand spot and the gang

**Files:**
- Modify: `src/surfer/placement.ts` (`landSpots` → `standSpot` from the network, `duneCrest` alias; the crest finder deleted)
- Modify: `src/surfer/gang.ts` (`gangTrack` deleted; `gangCamera` unchanged)
- Modify: `src/app/App.ts` (~line 422 `onSurferSpot`, ~446 the gang camera distance, ~1365 the clearings)
- Modify: `src/dev/DevPanel.ts:87,449` (`'duneCrest'` → `'standSpot'`, button "stand spot (the junction above the Womb)")
- Test: `src/surfer/placement.test.ts`, `src/surfer/gang.test.ts`

**Interfaces:**
- Consumes: `LandHeight.trackNetwork` (Task 4), `TrackNetwork.standSpot`, `TrackNetwork.reach` (Task 3).
- Produces:

```ts
export interface TrackedSurface extends LandSurface { trackNetwork: TrackNetwork | null }
export function landSpots(land: TrackedSurface, beach: { wetWidthM: number; dryWidthM: number }, z?: number):
  { standSpot: LandSpot; /** @deprecated until step 4 lands */ duneCrest: LandSpot; beach: LandSpot };
export function gangCameraDistance(tracks: TrackNetwork, centre: LandSpot, wantM?: number): number; // in gang.ts
```

- [ ] **Step 1: Write the failing tests.** In `placement.test.ts`, replace the crest-finder cases. Keep the beach-spot
cases.

```ts
it('stands the crew in the junction clearing, facing inland', () => {
  const lh = testLand(); // src/land/testLand.ts: Task 2's synthetic land, moved there now and imported by tracks.test too
  const net = new TrackNetwork(routeTracks(lh, [-300, 300]));
  const tracked = { heightAt: (x: number, z: number) => lh.baseHeightAt(x, z), waterlineAt: (z: number) => lh.waterlineAt(z), trackNetwork: net };
  const s = landSpots(tracked, DEFAULT_BEACH).standSpot;
  expect(net.inClearing(s.x, s.z)).toBe(true);
  expect(s.headingDeg).toBe(90);
  expect(landSpots(tracked, DEFAULT_BEACH).duneCrest).toEqual(s);
});
it('needs the tracks', () => {
  const lh = testLand();
  expect(() => landSpots({ heightAt: (x, z) => lh.baseHeightAt(x, z), waterlineAt: (z) => lh.waterlineAt(z), trackNetwork: null }, DEFAULT_BEACH)).toThrow(/tracks/);
});
```

In `gang.test.ts`:

```ts
it('keeps the gang camera on the track: never more than 5.5 m, never off the clearing or a corridor', () => {
  const net = new TrackNetwork(routeTracks(testLand(), [-300, 300]));
  const s = net.standSpot();
  const d = gangCameraDistance(net, s);
  expect(d).toBeLessThanOrEqual(5.5);
  expect(d).toBeGreaterThan(2);
  const { fwd } = headingAxes(s.headingDeg);
  expect(net.onTrack(s.x + fwd[0] * d, s.z + fwd[1] * d)).toBe(true);
});
```

- [ ] **Step 2: Run them.** Run: `npx vitest run src/surfer/placement.test.ts src/surfer/gang.test.ts`. Expected: FAIL
(`standSpot` undefined; `gangCameraDistance` not exported).

- [ ] **Step 3: Implement.** First move Task 2's `land(ridge)` helper from `tracks.test.ts` into
`src/land/testLand.ts` as `export function testLand(ridge = false): RouteLand` and import it in `tracks.test.ts`. Then
`landSpots`:

```ts
export interface TrackedSurface extends LandSurface { trackNetwork: TrackNetwork | null }

/**
 * Named spots on land: the crew's stand spot in the junction clearing where the beach path leaves the Cape to Cape
 * (dune-up-close §4.1), facing inland to the gang camera with the break behind them; and the dry sand in front of the
 * lineup, facing the sea. `duneCrest` is the stand spot under its old name until the select screen (step 4) lands.
 */
export function landSpots(land: TrackedSurface, beach: { wetWidthM: number; dryWidthM: number }, z = WOMB_Z): { standSpot: LandSpot; duneCrest: LandSpot; beach: LandSpot } {
  if (!land.trackNetwork) throw new Error('landSpots: the land has no tracks yet (they come with its build)');
  const xs = land.waterlineAt(z), standSpot = land.trackNetwork.standSpot();
  return { standSpot, duneCrest: standSpot, beach: { x: xs + beach.wetWidthM + 0.6 * beach.dryWidthM, z, headingDeg: 270 } };
}
```

In `gang.ts`, delete `gangTrack` and add:

```ts
/** How far in front of the line the gang camera stands: up to `wantM`, but only as far as the clearing or a corridor reaches (spec §4.1). */
export function gangCameraDistance(tracks: TrackNetwork, centre: LandSpot, wantM = 5.5): number {
  const { fwd } = headingAxes(centre.headingDeg);
  return tracks.reach(centre.x, centre.z, fwd[0], fwd[1], wantM);
}
```

In `App.ts`:
- `onSurferSpot`: `landSpots(lh, lh.profile)[spot]` with `spot: 'standSpot' | 'beach'`.
- The gang camera (~446): `const dist = lh.trackNetwork ? gangCameraDistance(lh.trackNetwork, sp) : 5.5;` and pass
  `dist` to both `gangCamera` calls.
- The clearings (~1365): drop `...gangTrack(sp)` and keep the riders' r 1.2 circles and the pile.

In `DevPanel.ts`, rename the spot to `'standSpot'` and the button to `'stand spot (the junction above the Womb)'`. Fix
every other `duneCrest` reference (`grep -rn duneCrest src`) to `standSpot`, except the alias.

- [ ] **Step 4: Run the suite and typecheck.**

Run: `npx tsc --noEmit && npx vitest run src/surfer src/land src/heath`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit.**

```bash
git add src/surfer src/app/App.ts src/dev/DevPanel.ts
git commit -m "feat(placement): the crew stand in the junction clearing; the gang camera stays on the track (dune-up-close §4.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Closed-cover heath, dead shrubs, and no plants on the tracks

**Files:**
- Modify: `src/heath/plants.ts`
- Modify: `src/sound/levels.ts` (`SHRUB_AREA_M2` 3 → 1.6), `src/sound/levels.test.ts`
- Modify: `src/heath/PlantMeshes.ts` (kinds now include `dead`; `LOD_CAPACITY` far 6000 → 11000)
- Test: `src/heath/plants.test.ts`

**Interfaces:**
- Consumes: `LandHeight.trackNetwork` (Task 4).
- Produces: `PlantKind` gains `'dead'`; `PLANT_KINDS` = `['daisy','green','tall','pigface','rice','dead']`;
  `cellPlants(ci, cj, land, rocks, density)` excludes trunks within the corridors or the clearing; heath density about
  1 shrub per 1.6 m².

- [ ] **Step 1: Write the failing tests.**

```ts
describe('the dune up close heath', () => {
  const lh = heathLand(); // a LandHeight over a flat heath 150 m inland (the file's existing helper, with tracks set)
  it('is near-closed cover on heath: about one shrub per 1.6 m² (±25%)', () => {
    let shrubs = 0, area = 0;
    for (let ci = 30; ci < 40; ci++) for (let cj = -5; cj < 5; cj++) {
      area += 16;
      shrubs += cellPlants(ci, cj, lh, null, 1).filter((p) => ['daisy', 'green', 'tall'].includes(p.kind)).length;
    }
    expect(area / shrubs).toBeGreaterThan(1.6 * 0.75);
    expect(area / shrubs).toBeLessThan(1.6 * 1.25);
  });
  it('grows a dead shrub per ~25 m² on heath, never on the dune rise', () => {
    const dead = [];
    for (let ci = 30; ci < 40; ci++) for (let cj = -5; cj < 5; cj++) dead.push(...cellPlants(ci, cj, lh, null, 1).filter((p) => p.kind === 'dead'));
    expect(1600 / dead.length).toBeGreaterThan(25 * 0.75);
    expect(1600 / dead.length).toBeLessThan(25 * 1.25);
  });
  it('plants nothing with its trunk on a track or in the clearing', () => {
    const net = lh.trackNetwork!;
    for (const [x, z] of net.data.pieces[0].points.slice(0, 400)) {
      const ci = Math.floor(x / PLANT_CELL_M), cj = Math.floor(z / PLANT_CELL_M);
      for (const p of cellPlants(ci, cj, lh, null, 1)) expect(net.onTrack(p.x, p.z)).toBe(false);
    }
  });
});
```

In `levels.test.ts`, change the "full at one per 3 m²" case to 1.6 m².

- [ ] **Step 2: Run them.** Run: `npx vitest run src/heath/plants.test.ts src/sound/levels.test.ts`. Expected: FAIL
(density about 1 per 3 m²; no `dead`; plants on the track).

- [ ] **Step 3: Implement.** In `plants.ts`:

```ts
export type PlantKind = 'daisy' | 'green' | 'tall' | 'pigface' | 'rice' | 'dead';
export const PLANT_KINDS: readonly PlantKind[] = ['daisy', 'green', 'tall', 'pigface', 'rice', 'dead'];
// PLANT_SPECS: dead: { heightM: [0.5, 1.2], widthM: [0.6, 1.6] }
// FORM: dead: { lobes: 0.35, bumps: 0.18, scallop: 0 }
// ALBEDO: dead: [0.16, 0.155, 0.14]  (weathered grey wood)
export const LOD_CAPACITY = [400, 1000, 11000] as const;
/** Candidates per 16 m² cell (dune-up-close §4.5): shrubs at up to one per 1.45 m², low plants and dead wood. */
const SHRUB_CANDIDATES = 11, LOW_CANDIDATES = 2, DEAD_CANDIDATES = 1;
/** 11 × 0.91 / 16 m² = one shrub per 1.6 m² (near-closed, as from above); 1 × 0.64 / 16 = one dead per 25 m². */
const SHRUB_KEEP = 0.91, LOW_KEEP = 0.667, DEAD_KEEP = 0.64;
```

In `cellPlants`:
- `per = SHRUB_CANDIDATES + LOW_CANDIDATES + DEAD_CANDIDATES`, with `k % per` sorting the candidate type
  (`< SHRUB_CANDIDATES` shrub, `< SHRUB + LOW` low, else dead).
- Dead keeps on `heathW` only (`riseW` excluded): `if (dead && r(2) >= heathW * DEAD_KEEP * pass) continue;`.
- Kind `'dead'`.
- After the rock check: `if (land.trackNetwork?.onTrack(x, z) || (land.trackNetwork && land.trackNetwork.nearest(x, z).d < width / 2 + land.trackNetwork.nearest(x, z).halfWidthM)) continue;`
  This keeps crowns off the corridor, the way `clearOf` does for the riders' clearings. Compute `nearest` once.

The dune rise keeps today's density. Scale its keep so the rise is unchanged:
`const keep = riseW > heathW ? (shrub ? 0.89 * 6 / 11 : LOW_KEEP) : (shrub ? SHRUB_KEEP : LOW_KEEP);`.
In `PlantMeshes.material`, no change: `dead` uses the default foliage path with its grey tint.

- [ ] **Step 4: Run the heath, sound and limits tests.**

Run: `npx vitest run src/heath src/sound src/breaker/BreakingRibbon.limits.test.ts`
Expected: PASS. `plants.test`'s "per-mesh capacity holds on the inland heath" passes with 11000. If it fails, read the
count and set the capacity to 1.2× it; ledger the number.

- [ ] **Step 5: Commit.**

```bash
git add src/heath src/sound
git commit -m "feat(heath): near-closed cover (one shrub per 1.6 m²), dead grey shrubs, nothing planted on the tracks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The incremental re-lay

**Files:**
- Create: `src/heath/plantRing.ts`
- Modify: `src/heath/PlantMeshes.ts` (per-cell slot blocks; `addCell`/`removeCell`; hulls only beyond `MID_M − FADE_M`)
- Modify: `src/app/App.ts` (`updateBeach`'s plant block)
- Test: `src/heath/plantRing.test.ts`

**Interfaces:**
- Consumes: `PlantField` (cells), `Plant`.
- Produces:

```ts
export const NEAR_M = 12, MID_M = 40, BAND_FADE_M = 3;
export interface CellChange { key: number; ci: number; cj: number; add: boolean }
export class PlantRing {
  constructor(radiusM: number, innerM?: number);
  /** The cells to add and drop for a camera at (x, z): diffed against the last call. */
  move(x: number, z: number): CellChange[];
}
export class WorkQueue<T> {
  push(...items: T[]): void;
  /** Runs items until `budgetMs` is spent (at least one). Returns how many remain. */
  drain(run: (t: T) => void, budgetMs: number, now?: () => number): number;
  get length(): number;
}
// PlantMeshes
addCell(key: number, plants: readonly Plant[], seat: (p: Plant) => number): void;
removeCell(key: number): void;
```

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from 'vitest';
import { PlantRing, WorkQueue } from './plantRing';

describe('PlantRing', () => {
  it('adds every cell within the radius on the first move and nothing on a repeat', () => {
    const r = new PlantRing(20);
    const first = r.move(0, 0);
    expect(first.every((c) => c.add)).toBe(true);
    expect(first.length).toBeGreaterThan(70);
    expect(r.move(0, 0)).toEqual([]);
  });
  it('after a move, adds the cells that entered and drops the ones that left, and an incremental walk matches a fresh ring', () => {
    const a = new PlantRing(40, 37), held = new Set<number>();
    for (let s = 0; s <= 200; s += 1.7) for (const c of a.move(s, 0.3 * s)) c.add ? held.add(c.key) : held.delete(c.key);
    const fresh = new Set(new PlantRing(40, 37).move(200 - (200 % 1.7), 0.3 * (200 - (200 % 1.7))).map((c) => c.key));
    expect([...held].sort()).toEqual([...fresh].sort());
  });
});

describe('WorkQueue', () => {
  it('stops when the budget is spent but always runs one', () => {
    const q = new WorkQueue<number>();
    q.push(1, 2, 3, 4);
    let t = 0;
    const ran: number[] = [];
    const left = q.drain((n) => { ran.push(n); t += 1; }, 1.5, () => t);
    expect(ran).toEqual([1, 2]);
    expect(left).toBe(2);
  });
  it('drains a 10 m jump within 4 frames at 2 ms a frame (Review Focus 5)', () => {
    const r = new PlantRing(200, 37), q = new WorkQueue<number>();
    r.move(0, 0);
    q.push(...r.move(10, 0).map((c) => c.key));
    let frames = 0, t = 0;
    while (q.length && frames < 10) { q.drain(() => { t += 0.006; }, 2, () => t); frames++; } // ~6 µs per cell, measured in step 4
    expect(frames).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run them.** Run: `npx vitest run src/heath/plantRing.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `plantRing.ts`.**

```ts
import { PLANT_CELL_M } from './plants';

/** The bands (dune-up-close §3.1): near 0–12 m, mid 12–40 m, far beyond, each boundary cross-faded over 3 m. */
export const NEAR_M = 12, MID_M = 40, BAND_FADE_M = 3;

export interface CellChange { key: number; ci: number; cj: number; add: boolean }
export const cellKey = (ci: number, cj: number): number => (ci + 0x8000) * 0x10000 + (cj + 0x8000);

/** The 4 m cells whose centres lie within [innerM − one cell diagonal, radiusM] of the camera, diffed per move. */
export class PlantRing {
  private held = new Map<number, [number, number]>();
  constructor(private readonly radiusM: number, private readonly innerM = 0) {}

  move(x: number, z: number): CellChange[] {
    const want = new Map<number, [number, number]>(), n = Math.ceil(this.radiusM / PLANT_CELL_M) + 1;
    const inner = Math.max(0, this.innerM - PLANT_CELL_M * Math.SQRT2);
    const ci0 = Math.floor(x / PLANT_CELL_M), cj0 = Math.floor(z / PLANT_CELL_M);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const ci = ci0 + di, cj = cj0 + dj;
      const d = Math.hypot((ci + 0.5) * PLANT_CELL_M - x, (cj + 0.5) * PLANT_CELL_M - z);
      if (d <= this.radiusM && d >= inner) want.set(cellKey(ci, cj), [ci, cj]);
    }
    const out: CellChange[] = [];
    for (const [k, [ci, cj]] of this.held) if (!want.has(k)) out.push({ key: k, ci, cj, add: false });
    for (const [k, [ci, cj]] of want) if (!this.held.has(k)) out.push({ key: k, ci, cj, add: true });
    this.held = want;
    return out;
  }
}

export class WorkQueue<T> {
  private items: T[] = [];
  push(...items: T[]): void { this.items.push(...items); }
  get length(): number { return this.items.length; }
  drain(run: (t: T) => void, budgetMs: number, now: () => number = () => performance.now()): number {
    const t0 = now();
    let i = 0;
    while (i < this.items.length) {
      run(this.items[i++]);
      if (now() - t0 >= budgetMs) break;
    }
    this.items = this.items.slice(i);
    return this.items.length;
  }
}
```

In `PlantMeshes`, keep a `Map<number, { mesh: number; slot: number }[]>` per cell. `addCell` writes each plant into the
next free slot of its mesh: a free list per mesh, else `count++`, with the matrix written the way `update` does today.
`removeCell` swap-removes each slot with that mesh's last instance and fixes the moved instance's owner record, then
updates the ranges `[slot]` and `[count]`. Keep `update` for now. Task 12 deletes it once the kit takes the near and
mid bands.

The hull LOD is per cell, from the cell's centre distance at add time: a cell crossing 70 m is removed and re-added.
`PlantRing(PLANT_GONE_M, MID_M - BAND_FADE_M)` gives the far hull cells. A second ring at 70 m flags cells to re-add
when they cross the LOD line.

In `App.updateBeach`, replace the every-3 m relay with:
- `ring.move` each frame into the queue (the adds first, nearest first);
- `queue.drain(..., 2)`;
- on a patch recentre or show/hide, push the cells within the patch square again (remove + add) so they re-seat.

Measure: log `performance.now()` around `drain` for 300 frames of a scripted 10 m/s walk (dev console). The worst
frame must be ≤ 2 ms. Ledger the per-cell cost (the 6 µs in the test is a placeholder for that measurement; set it to
the real figure).

- [ ] **Step 4: Run.** Run: `npx vitest run src/heath && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Verify in the browser.** Reload `http://localhost:5177/`, go to the stand spot (DevPanel), and walk
(walk mode) 100 m along the Cape to Cape. Expected: no holes in the far heath, no plant popping. `plantStats.dropped`
stays 0.

- [ ] **Step 6: Commit.**

```bash
git add src/heath src/app/App.ts
git commit -m "perf(heath): the far plants re-lay per cell as the ring moves, under 2 ms a frame (was 3.1 ms every 3 m)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The heath kit build: scaffold, hulls and manifest

**Files:**
- Create: `tools/heath/buildHeath.ts`, `tools/heath/build.py`, `tools/heath/kitio.py`, `tools/heath/species.py`,
  `tools/heath/README.md`
- Create: `src/heath/kit.test.ts`
- Modify: `package.json` (`"build:heath": "node tools/heath/buildHeath.ts"`), `.gitignore` (`tools/heath/previews/`)

**Interfaces:**
- Consumes: `plantShapeGeometry`, `PLANT_KINDS`, `PLANT_SPECS`, `PLANT_SHAPES` (`src/heath/plants.ts`) via Vite's
  `runnerImport`.
- Produces: `public/heath/heathKit.glb` and `public/heath/heathKit.manifest.json`.

```ts
// manifest shape (TypeScript view, used by kit.ts in Task 12)
export interface KitVariant {
  kind: string; variant: number;
  lods: { name: string; triangles: number }[];  // glb node names `plant_<kind>_<v>_L0`, `_L1`
  boundsUnit: [number, number, number];          // the unit plant's max |x|, max y, max |z|
  leafColour: [number, number, number];          // linear, leaf-area weighted (Task 10)
  checks: Record<string, number | boolean>;
}
export interface KitManifest { version: 1; units: 'unit'; variants: KitVariant[]; items: KitVariant[]; atlas: { file: string; size: number; tiles: Record<string, [number, number, number, number]> } }
```

- [ ] **Step 1: Write the failing test.**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANT_KINDS, PLANT_SHAPES } from './plants';

const MANIFEST = 'public/heath/heathKit.manifest.json';
const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;

describe('the heath kit (dune-up-close §4.2, §7.1)', () => {
  it('is built', () => expect(m).not.toBeNull());
  it('has every kind\'s four variants, each with L0 and L1', () => {
    for (const kind of PLANT_KINDS) for (let v = 0; v < PLANT_SHAPES; v++) {
      const e = m.variants.find((x: { kind: string; variant: number }) => x.kind === kind && x.variant === v);
      expect(e, `${kind} ${v}`).toBeTruthy();
      expect(e.lods.map((l: { name: string }) => l.name)).toEqual([`plant_${kind}_${v}_L0`, `plant_${kind}_${v}_L1`]);
    }
  });
});
```

- [ ] **Step 2: Run it.** Run: `npx vitest run src/heath/kit.test.ts`. Expected: FAIL ("is built": `m` is null).

- [ ] **Step 3: Write the launcher.** `tools/heath/buildHeath.ts`:

```ts
// Builds the heath kit (spec 2026-10-02-dune-up-close-design.md §3.1). Run from the repo root:
//   npm run build:heath                 kit + atlas + ground layers → public/heath/, previews → tools/heath/previews/
//   npm run build:heath -- --only daisy one kind (the others kept from the last manifest)
//   npm run build:heath -- --ground     the ground layers only (numpy, no Blender)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const version = (d: string): number => { const [a, b] = d.replace('Blender ', '').split('.').map(Number); return a * 1000 + b; };
function findBlender(): string {
  const env = process.env.BLENDER_PATH;
  if (env) { if (existsSync(env)) return env; throw new Error(`BLENDER_PATH is ${env}, which doesn't exist.`); }
  const root = 'C:/Program Files/Blender Foundation';
  if (existsSync(root)) for (const d of readdirSync(root).filter((x) => /^Blender \d+\.\d+$/.test(x)).sort((a, b) => version(b) - version(a))) {
    const exe = join(root, d, 'blender.exe');
    if (existsSync(exe)) return exe;
  }
  throw new Error('Blender was not found. Install it (tools/surfer/README.md) or set BLENDER_PATH to blender.exe.');
}
const tools = resolve('tools/heath'), out = resolve('public/heath'), previews = join(tools, 'previews');
mkdirSync(out, { recursive: true });
mkdirSync(previews, { recursive: true });

function py(script: string, args: string[]): void {
  const r = spawnSync(process.env.PYTHON ?? 'python', [join(tools, script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${script} failed (${r.status ?? r.signal}); it needs Python 3 with numpy and Pillow.`); process.exit(1); }
}

if (process.argv.includes('--ground')) {
  py('ground_layers.py', [out]);
} else {
  // Today's hulls are the crowns' envelopes (spec §4.2 step 1): exported so Blender grows each variant inside its own.
  const { module: plants } = await runnerImport<typeof import('../../src/heath/plants')>('/src/heath/plants.ts');
  const hulls: Record<string, { positions: number[]; indices: number[] }> = {};
  for (const kind of plants.PLANT_KINDS) for (let v = 0; v < plants.PLANT_SHAPES; v++) {
    const g = plants.plantShapeGeometry(kind, v, 0);
    hulls[`${kind}_${v}`] = { positions: [...g.positions], indices: [...g.indices] };
  }
  const hullFile = join(previews, 'hulls.json');
  writeFileSync(hullFile, JSON.stringify({ specs: plants.PLANT_SPECS, hulls }));
  const onlyAt = process.argv.indexOf('--only');
  const args = [hullFile, out, previews, ...(onlyAt > 0 ? ['--only', process.argv[onlyAt + 1]] : [])];
  const r = spawnSync(findBlender(), ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(tools, 'build.py'), '--', ...args], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`Blender failed (${r.status ?? r.signal}) building the heath kit.`); process.exit(1); }
}
```

`tools/heath/kitio.py` (hull loading, glTF↔Blender axes, the manifest):

```python
"""The heath kit's I/O (dune-up-close spec §3.1): the hull envelopes in, the glb and manifest out."""
import json
import bpy
from mathutils import Vector


def gl_to_b(p):  # glTF (x, y-up, z) → Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))


def load_hulls(path):
    data = json.load(open(path))
    hulls = {}
    for key, h in data["hulls"].items():
        pts = [gl_to_b(h["positions"][i:i + 3]) for i in range(0, len(h["positions"]), 3)]
        tris = [tuple(h["indices"][i:i + 3]) for i in range(0, len(h["indices"]), 3)]
        hulls[key] = (pts, tris)
    return data["specs"], hulls


def export(objects, glb_path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB", use_selection=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials="NONE",
                              export_vertex_color="ACTIVE", export_apply=True)


def write_manifest(path, variants, items, atlas):
    json.dump({"version": 1, "units": "unit", "variants": variants, "items": items, "atlas": atlas},
              open(path, "w"), indent=1)
```

`tools/heath/species.py` holds each kind's construction table. Task 9 and Task 10 fill in the branch and leaf fields.
Task 8 needs only the keys:

```python
"""Each kind's build (dune-up-close spec §4.2). Sizes in metres; the build converts to the unit plant."""
SPECIES = {
    "daisy":   {"name": "coastal daisy bush (Olearia axillaris)"},
    "green":   {"name": "cushion fanflower (Scaevola crassifolia)"},
    "tall":    {"name": "coast tea-tree (Leptospermum laevigatum)"},
    "pigface": {"name": "pigface (Carpobrotus virescens)"},
    "rice":    {"name": "pink rice flower (Pimelea ferruginea)"},
    "dead":    {"name": "dead shrub skeleton"},
}
VARIANTS = 4
```

`tools/heath/build.py` (Task 8 version: one placeholder mesh per LOD, a small octahedron inside the hull, so the
pipeline runs end to end; Tasks 9–11 replace `build_variant`):

```python
"""Builds the heath kit (dune-up-close spec §3.1, §4.2): every kind × variant at L0 and L1, the atlas, the manifest."""
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(__file__))
import kitio  # noqa: E402
from species import SPECIES, VARIANTS  # noqa: E402


def mesh_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def build_variant(kind, v, hull, spec):
    """Task 8: a placeholder octahedron at L0 and L1. Tasks 9–11 grow the real plant."""
    objs = []
    for lod in (0, 1):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.5)
        objs.append(mesh_object(f"plant_{kind}_{v}_L{lod}", bm))
    return objs, {}


def triangles(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    hull_file, out_dir, previews = argv[:3]
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    specs, hulls = kitio.load_hulls(hull_file)
    objects, variants = [], []
    for kind in SPECIES:
        for v in range(VARIANTS):
            objs, checks = build_variant(kind, v, hulls[f"{kind}_{v}"], specs.get(kind))
            objects += objs
            bounds = [max(abs(c[i]) for o in objs for c in (vv.co for vv in o.data.vertices)) for i in (0, 2, 1)]
            variants.append({"kind": kind, "variant": v, "lods": [{"name": o.name, "triangles": triangles(o)} for o in objs],
                             "boundsUnit": [round(b, 4) for b in bounds], "leafColour": [0, 0, 0], "checks": checks})
    kitio.export(objects, os.path.join(out_dir, "heathKit.glb"))
    kitio.write_manifest(os.path.join(out_dir, "heathKit.manifest.json"), variants, [],
                         {"file": "heathAtlas.png", "size": 2048, "tiles": {}})


main()
```

`--only` is parsed and ignored until Task 10. Ledger that.

- [ ] **Step 4: Build and run the test.**

Run: `npm run build:heath`, then `npx vitest run src/heath/kit.test.ts`
Expected: Blender exits 0; `public/heath/heathKit.glb` and the manifest exist; tests PASS (2).

- [ ] **Step 5: Commit.** Add the README covering the commands, Blender 5.2.2, `--factory-startup` (no extensions
needed) and the assets' licence (project-made).

```bash
git add tools/heath package.json .gitignore public/heath src/heath/kit.test.ts
git commit -m "build(heath): the kit's build pipeline: hull envelopes out of the game, Blender in, glb and manifest (placeholders)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Branches (space colonisation and the pipe model)

**Files:**
- Create: `tools/heath/grow.py`
- Modify: `tools/heath/species.py` (branch fields), `tools/heath/build.py` (`build_variant` grows the skeleton → L0 tubes)
- Modify: `src/heath/kit.test.ts`

**Interfaces:**
- Consumes: the hull (`pts`, `tris` in Blender axes, unit space), `SPECIES[kind]`.
- Produces: `grow.skeleton(hull, sp, seed) -> Skeleton` with `nodes: list[Vector]`, `parent: list[int]` (−1 for a
  root), `radius: list[float]` (unit), `depth: list[float]` (normalised root distance 0–1), `dead: list[bool]`.
  Also `grow.tubes(bm, sk, sides_base=6, sides_tip=3) -> list[BMVert]` and the checks `pipe_ok`, `inside_share`.

- [ ] **Step 1: Write the failing test.** Append to `kit.test.ts`:

```ts
  it('grows branches that obey the pipe model and stay inside their hull (§7.1)', () => {
    for (const e of m.variants) {
      expect(e.checks.pipeModel, `${e.kind} ${e.variant}`).toBe(true);
      expect(e.checks.branchesInsideHull, `${e.kind} ${e.variant}`).toBeGreaterThanOrEqual(0.95);
    }
  });
```

- [ ] **Step 2: Rebuild and run.** Run: `npm run build:heath && npx vitest run src/heath/kit.test.ts`. Expected: FAIL
(`checks.pipeModel` undefined).

- [ ] **Step 3: Implement `grow.py`.**

```python
"""Woody skeletons grown into a hull by space colonisation (Runions et al. 2007) with pipe-model radii."""
import math
import random

from mathutils import Vector
from mathutils.bvhtree import BVHTree


class Skeleton:
    def __init__(self):
        self.nodes, self.parent, self.radius, self.depth, self.dead = [], [], [], [], []


def inside(tree, p):
    """Inside the closed hull: a ray up hits it an odd number of times."""
    hits, o = 0, p.copy()
    d = Vector((0.0001, 0.0002, 1.0)).normalized()
    while True:
        loc, _, _, _ = tree.ray_cast(o, d)
        if loc is None:
            return hits % 2 == 1
        hits, o = hits + 1, loc + d * 1e-5


def attractors(tree, rng, n, flat):
    pts = []
    while len(pts) < n:
        p = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 1)))
        if flat:
            p.z *= 0.35  # pigface: a mat along the ground
        if inside(tree, p):
            pts.append(p)
    return pts


def skeleton(hull, sp, seed):
    pts, tris = hull
    tree = BVHTree.FromPolygons(pts, tris)
    rng = random.Random(seed)
    att = attractors(tree, rng, sp["attractors"], sp.get("flat", False))
    sk = Skeleton()
    for k in range(sp["stems"]):  # stems from near the centre at the base
        a = 2 * math.pi * k / sp["stems"] + rng.uniform(-0.4, 0.4)
        sk.nodes.append(Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.0)))
        sk.parent.append(-1)
    step, kill, reach = sp["step"], sp["kill"], sp["reach"]
    up = Vector((0, 0, sp.get("tropism", 0.25)))
    for _ in range(sp["iterations"]):
        pull = {}
        for a in att:
            best, bd = None, reach
            for i, n in enumerate(sk.nodes):
                d = (a - n).length
                if d < bd:
                    best, bd = i, d
            if best is not None:
                pull.setdefault(best, Vector()).__iadd__((a - sk.nodes[best]).normalized())
        if not pull:
            break
        for i, v in pull.items():
            d = (v.normalized() + up).normalized()
            if sp.get("flat"):
                d.z *= 0.3
                d.normalize()
            sk.nodes.append(sk.nodes[i] + d * step)
            sk.parent.append(i)
        att = [a for a in att if min((a - n).length for n in sk.nodes) > kill]
    # Pipe model (r_parent² = Σ r_child²), from the twig radius at the tips inward.
    kids = [[] for _ in sk.nodes]
    for i, p in enumerate(sk.parent):
        if p >= 0:
            kids[p].append(i)
    r2 = [0.0] * len(sk.nodes)
    for i in reversed(range(len(sk.nodes))):
        r2[i] = sum(r2[c] for c in kids[i]) or sp["twig_r"] ** 2
    sk.radius = [math.sqrt(x) for x in r2]
    # Root distance along the branches, normalised (the wind's stiffness).
    dist = [0.0] * len(sk.nodes)
    for i, p in enumerate(sk.parent):
        if p >= 0:
            dist[i] = dist[p] + (sk.nodes[i] - sk.nodes[p]).length
    top = max(dist) or 1.0
    sk.depth = [d / top for d in dist]
    # Dead wood: whole subtrees from a share of the first-order branches (10–30% of the wood; dead kind: all).
    sk.dead = [sp.get("all_dead", False)] * len(sk.nodes)
    firsts = [i for i, p in enumerate(sk.parent) if p >= 0 and sk.parent[p] == -1]
    for i in rng.sample(firsts, int(len(firsts) * sp.get("dead_share", 0.2))):
        stack = [i]
        while stack:
            j = stack.pop()
            sk.dead[j] = True
            stack += kids[j]
    sk.kids = kids
    sk.tree = tree
    return sk


def pipe_ok(sk):
    return all(sk.radius[i] + 5e-4 >= math.sqrt(sum(sk.radius[c] ** 2 for c in sk.kids[i])) for i in range(len(sk.nodes)) if sk.kids[i])


def inside_share(sk):
    return sum(1 for n in sk.nodes if inside(sk.tree, n * 0.999 + Vector((0, 0, 1e-3)))) / len(sk.nodes)


def chains(sk):
    """The skeleton as polylines: each starts at a root or a branching point and runs to a tip."""
    out = []
    starts = [i for i, p in enumerate(sk.parent) if p == -1]
    while starts:
        i = starts.pop()
        line = [sk.parent[i]] if sk.parent[i] >= 0 else []
        line.append(i)
        while len(sk.kids[i]) == 1:
            i = sk.kids[i][0]
            line.append(i)
        out.append(line)
        starts += sk.kids[i]
    return out


def tubes(bm, sk, scale, uv_layer, col_layer, sides_base=6, sides_tip=3):
    """Each chain as a tapered tube (6 sides thick, 3 at the twigs). Vertex colour: (AO 1 for now, root distance, 0, 0 = wood)."""
    made = []
    for line in chains(sk):
        r0 = sk.radius[line[0]]
        sides = sides_base if r0 > 4 * min(sk.radius) else sides_tip
        rings, u = [], None
        for k, i in enumerate(line):
            p = sk.nodes[i]
            a, b = sk.nodes[line[min(k + 1, len(line) - 1)]], sk.nodes[line[max(k - 1, 0)]]
            t = (a - b).normalized() if (a - b).length > 1e-9 else Vector((0, 0, 1))
            u = t.orthogonal().normalized() if u is None else (u - t * u.dot(t)).normalized()
            v = t.cross(u)
            ring = []
            for s in range(sides):
                ang = 2 * math.pi * s / sides
                off = (u * math.cos(ang) + v * math.sin(ang)) * sk.radius[i]
                ring.append(bm.verts.new(Vector((p.x + off.x * scale.x, p.y + off.y * scale.y, p.z + off.z * scale.z))))
            rings.append((i, ring))
        for (i0, a), (i1, b) in zip(rings, rings[1:]):
            for s in range(sides):
                f = bm.faces.new((a[s], a[(s + 1) % sides], b[(s + 1) % sides], b[s]))
                for lp, (uu, vv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    lp[uv_layer].uv = (uu, vv)  # remapped into the bark tile in Task 11
                    node = i0 if vv == 0 else i1
                    lp[col_layer] = (1.0, sk.depth[node], 0.0, 1.0 if sk.dead[node] else 0.0)
        made += [v for _, r in rings for v in r]
    return made
```

The tubes are in unit space, but a branch must be round in metres. `scale` converts a metre-round radius into the unit
plant's per-axis scale: `(2 / mean_width, 2 / mean_width, 1 / mean_height)` times the mean metre size of the radius.
Pass `Vector((1 / hx, 1 / hx, 1 / hz))` where `hx = mean_width / 2` and `hz = mean_height`, and give `twig_r` in metres.
Fill `species.py`. Starting values; tune at gate 1:

```python
BRANCH = {
    "daisy":   {"stems": 5, "attractors": 900, "iterations": 60, "step": 0.04, "kill": 0.05, "reach": 0.35, "twig_r": 0.0015, "dead_share": 0.2},
    "green":   {"stems": 4, "attractors": 700, "iterations": 50, "step": 0.05, "kill": 0.06, "reach": 0.35, "twig_r": 0.002, "dead_share": 0.1},
    "tall":    {"stems": 3, "attractors": 900, "iterations": 70, "step": 0.04, "kill": 0.05, "reach": 0.3, "twig_r": 0.0015, "dead_share": 0.3, "tropism": 0.4},
    "pigface": {"stems": 6, "attractors": 500, "iterations": 40, "step": 0.06, "kill": 0.07, "reach": 0.4, "twig_r": 0.003, "dead_share": 0.0, "flat": True, "tropism": 0.0},
    "rice":    {"stems": 4, "attractors": 400, "iterations": 35, "step": 0.05, "kill": 0.06, "reach": 0.35, "twig_r": 0.0012, "dead_share": 0.1},
    "dead":    {"stems": 4, "attractors": 500, "iterations": 45, "step": 0.05, "kill": 0.06, "reach": 0.35, "twig_r": 0.002, "all_dead": True},
}
```

In `build.py`, `build_variant` for L0:
1. `sk = grow.skeleton(hull, BRANCH[kind], seed=hash((kind, v)) & 0xffff)`.
2. Create a `bmesh` with a UV layer and a float colour layer `bm.loops.layers.float_color.new("Col")`.
3. Call `grow.tubes(...)` to build the tubes.
4. `mesh_object` → `me.shade_smooth()`; custom normals from the tube rings: each vertex's normal is its offset from its
   ring centre, set with `me.normals_split_custom_set_from_vertices`, the way the braids are built.
5. Checks: `{"pipeModel": grow.pipe_ok(sk), "branchesInsideHull": round(grow.inside_share(sk), 3)}`.

L1 stays a placeholder until Task 11.

- [ ] **Step 4: Build, test and look.** Run: `npm run build:heath && npx vitest run src/heath/kit.test.ts`. Expected:
PASS. Render previews: add to `build.py` a `preview(objs, path)` that frames the L0 in an orthographic side camera
with Workbench and writes `tools/heath/previews/<kind>_<v>_L0.png`. Open two in the Read tool. Expected: a believable
branch structure, thick at the base and twiggy at the top, filling the hull.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath public/heath src/heath/kit.test.ts
git commit -m "build(heath): branches grown into each hull by space colonisation, pipe-model radii, dead subtrees

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Leaves, flowers, AO and the wind data: L0 complete

**Files:**
- Create: `tools/heath/leaves.py`
- Modify: `tools/heath/species.py` (leaf fields), `tools/heath/build.py`
- Modify: `src/heath/kit.test.ts`

**Interfaces:**
- Consumes: `Skeleton` (Task 9).
- Produces:
  - **L0 meshes** with:
    - `COLOR_0` = (AO, root distance, flutter phase, kind flag: 0 wood, 0.5 leaf, 1 flower);
    - `TEXCOORD_0` into the atlas (Task 11 fills in the tiles; until then (0, 0));
  - **manifest checks:**
    - `trianglesL0`;
    - `leavesAttached` (max leaf-base distance to a twig, m);
    - `silhouetteTop` and `silhouetteSide` (coverage 0–1);
    - `outsideHull` (share of vertices outside the hull grown by 10%);
    - `badNormals`, `aoMin`, `aoMax`;
  - **manifest `leafColour`:** linear RGB, leaf-area weighted.

- [ ] **Step 1: Write the failing test.**

```ts
  const L0_CAP: Record<string, number> = { daisy: 8000, green: 8000, tall: 8000, pigface: 6000, rice: 3000, dead: 2000 };
  it('keeps L0 within its caps, leaves on twigs, the silhouette its hull\'s, normals sound, AO in range (§7.1)', () => {
    for (const e of m.variants) {
      const id = `${e.kind} ${e.variant}`;
      expect(e.lods[0].triangles, id).toBeLessThanOrEqual(L0_CAP[e.kind]);
      expect(e.checks.leavesAttached, id).toBeLessThanOrEqual(0.01);
      expect(e.checks.silhouetteTop, id).toBeGreaterThanOrEqual(0.85);
      expect(e.checks.silhouetteSide, id).toBeGreaterThanOrEqual(0.85);
      expect(e.checks.outsideHull, id).toBeLessThanOrEqual(0.05);
      expect(e.checks.badNormals, id).toBe(0);
      expect(e.checks.aoMin, id).toBeGreaterThanOrEqual(0.15);
      expect(e.checks.aoMax, id).toBeLessThanOrEqual(1);
      if (e.kind !== 'dead') expect(Math.max(...e.leafColour), id).toBeGreaterThan(0.02);
    }
  });
```

`dead` has no leaves. Its silhouette checks use the hull at 60%, and `leavesAttached` is 0.

- [ ] **Step 2: Rebuild and run.** Expected: FAIL (the checks are undefined).

- [ ] **Step 3: Implement `leaves.py`.**

```python
"""Leaves and flowers on the twig tips (dune-up-close spec §4.2 step 3), the AO bake and the build checks."""
import math
import random

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

GOLDEN = math.pi * (3 - math.sqrt(5))

# Each leaf shape as (u along, v across) outline points, triangulated as a fan from the base; size in metres.
SHAPES = {
    "needle":  [(0, 0), (0.5, 0.12), (1, 0), (0.5, -0.12)],                      # 4 tris with the midrib split
    "blade":   [(0, 0), (0.25, 0.3), (0.7, 0.35), (1, 0), (0.7, -0.35), (0.25, -0.3)],
    "oval":    [(0, 0), (0.3, 0.4), (0.75, 0.4), (1, 0), (0.75, -0.4), (0.3, -0.4)],
    "finger":  None,                                                              # a 3-sided prism, below
    "tiny":    [(0, 0), (0.5, 0.35), (1, 0), (0.5, -0.35)],
}


def leaf_quads(base, direction, normal, length, width, shape):
    """The leaf's triangles in metres-at-unit-scale: a fan around the midrib, slightly cupped."""
    side = direction.cross(normal).normalized()
    if shape == "finger":
        tip = base + direction * length
        ring = [base + (side * math.cos(a) + normal * math.sin(a)) * width * 0.5 for a in (0, 2.09, 4.19)]
        mid = [p + direction * length * 0.6 for p in ring]
        tris = []
        for k in range(3):
            a, b = ring[k], ring[(k + 1) % 3]
            c, d = mid[k], mid[(k + 1) % 3]
            tris += [(a, b, d), (a, d, c), (c, d, tip)]
        return tris[:12]
    pts = [base + direction * (u * length) + side * (v * width) + normal * (abs(v) * width * 0.25) for u, v in SHAPES[shape]]
    return [(pts[0], pts[i], pts[i + 1]) for i in range(1, len(pts) - 1)]  # a fan: len(pts) − 2 triangles


def place_leaves(sk, sp, rng):
    """(base, direction, normal) for each leaf: along the last few nodes of every living tip, set in a golden spiral."""
    out = []
    tips = [i for i in range(len(sk.nodes)) if not sk.kids[i] and not sk.dead[i]]
    for i in tips:
        chain = [i]
        while len(chain) < sp["leaf_nodes"] and sk.parent[chain[-1]] >= 0:
            chain.append(sk.parent[chain[-1]])
        for k, j in enumerate(chain):
            p = sk.parent[j] if sk.parent[j] >= 0 else j
            axis = (sk.nodes[j] - sk.nodes[p]).normalized() if j != p else Vector((0, 0, 1))
            for q in range(sp["leaves_per_node"]):
                ang = (k * sp["leaves_per_node"] + q) * (math.pi if sp.get("opposite") else GOLDEN)
                out_dir = axis.orthogonal().normalized()
                out_dir = Matrix.Rotation(ang, 3, axis) @ out_dir
                d = (out_dir * math.sin(sp["leaf_angle"]) + axis * math.cos(sp["leaf_angle"])).normalized()
                n = d.cross(axis.cross(d)).normalized() if abs(d.dot(axis)) < 0.999 else axis.orthogonal()
                out.append((sk.nodes[j] + d * sk.radius[j], d, n))
    rng.shuffle(out)
    return out[: sp["max_leaves"]]


# The unit plant's extent per axis (Blender axes): x and y in [−1, 1], z (up) in [0, 1].
EXTENT = {0: (-1.0, 1.0), 1: (-1.0, 1.0), 2: (0.0, 1.0)}


def coverage(points, hull_tree, axis, res=48):
    """The share of the hull's projection along `axis` (2: from the top; 1: from the side) that the points cover, on a res² grid."""
    a, b = [i for i in range(3) if i != axis]
    cell = lambda v, k: min(res - 1, max(0, int((v - EXTENT[k][0]) / (EXTENT[k][1] - EXTENT[k][0]) * res)))
    grid_h = set()
    for i in range(res):
        for j in range(res):
            o, d = Vector((0, 0, 0)), Vector((0, 0, 0))
            o[a] = EXTENT[a][0] + (EXTENT[a][1] - EXTENT[a][0]) * (i + 0.5) / res
            o[b] = EXTENT[b][0] + (EXTENT[b][1] - EXTENT[b][0]) * (j + 0.5) / res
            o[axis], d[axis] = 5.0, -1.0
            if hull_tree.ray_cast(o, d)[0] is not None:
                grid_h.add((i, j))
    grid_p = {(cell(p[a], a), cell(p[b], b)) for p in points}
    return len(grid_h & grid_p) / max(1, len(grid_h))
```

A leaf is `len(pts) − 2` triangles: 2 (needle), 2 (tiny), 4 (oval), 4 (blade) and 9 (finger, capped at 12). That's
under the spec's per-leaf table, which is a cap. If a kind reads too flat at gate 1, add midrib points to its outline.

Leaf fields in `species.py` (metres; the build converts to unit with the same `scale` as the tubes):

```python
LEAF = {
    "daisy":   {"shape": "needle", "length": 0.018, "width": 0.0025, "leaf_nodes": 4, "leaves_per_node": 3, "leaf_angle": 0.7, "max_leaves": 1800, "colour": (0.17, 0.2, 0.14)},
    "green":   {"shape": "blade",  "length": 0.03,  "width": 0.009,  "leaf_nodes": 3, "leaves_per_node": 2, "leaf_angle": 0.8, "max_leaves": 900,  "colour": (0.12, 0.16, 0.065)},
    "tall":    {"shape": "oval",   "length": 0.02,  "width": 0.008,  "leaf_nodes": 4, "leaves_per_node": 2, "leaf_angle": 0.6, "max_leaves": 1100, "colour": (0.09, 0.11, 0.06)},
    "pigface": {"shape": "finger", "length": 0.06,  "width": 0.012,  "leaf_nodes": 6, "leaves_per_node": 2, "leaf_angle": 0.9, "max_leaves": 450,  "colour": (0.15, 0.19, 0.07), "opposite": True},
    "rice":    {"shape": "tiny",   "length": 0.008, "width": 0.003,  "leaf_nodes": 3, "leaves_per_node": 2, "leaf_angle": 0.7, "max_leaves": 650,  "colour": (0.12, 0.16, 0.07), "opposite": True},
}
FLOWER = {"rice": {"tris": 16, "radius": 0.012, "count": 30, "colour": (0.55, 0.36, 0.4)},
          "pigface": {"tris": 24, "radius": 0.025, "count": 6, "colour": (0.6, 0.25, 0.45)}}
```

In `build.py`, `build_variant` L0 adds:
1. **Leaves:** `place_leaves`, then `leaf_quads` for each, as faces with colour (AO, depth, flutter = rng.random(),
   0.5) and UV (0, 0).
2. **Flowers:** a dome or star at random living tips, colour flag 1.
3. **AO:** Cycles `bpy.ops.object.bake(type='AO')` into the `Col` attribute's R channel with 32 samples, or (faster,
   deterministic) a per-vertex ray AO with 16 hemisphere rays against a `BVHTree` of the whole plant, distance 0.15
   unit. Use the BVH version; it is reproducible without a GPU.
4. **Checks:**
   - `leavesAttached` = max over leaves of base-to-nearest-tube-axis minus the radius, in metres;
   - `silhouetteTop`/`Side` via `coverage`;
   - `outsideHull` = the share of vertices failing `inside` against the hull scaled by 1.1 (a scaled copy of its BVH);
   - `badNormals` = vertices whose split normal has length < 0.5 or is NaN;
   - `aoMin`/`aoMax` from the AO channel.
5. **`leafColour`:** the leaf-area-weighted mean of `LEAF[kind]["colour"]` with the per-leaf jitter applied.

- [ ] **Step 4: Build, test and look.**

Run: `npm run build:heath && npx vitest run src/heath/kit.test.ts`
Expected: PASS. Open `tools/heath/previews/daisy_0_L0.png` and `pigface_0_L0.png` with Read. Expected: a dense
silver-needle shrub with grey twigs showing; a flat trailing mat of fingers. If the triangle cap is exceeded, lower
`max_leaves` and ledger the value.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath public/heath src/heath/kit.test.ts
git commit -m "build(heath): leaves, flowers, baked AO and the wind data on every variant's L0; the build checks in the manifest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: L1 cluster cards, the atlas and the canopy silhouettes

**Files:**
- Create: `tools/heath/atlas.py`, `tools/heath/lods.py`
- Modify: `tools/heath/build.py`, `src/heath/kit.test.ts`

**Interfaces:**
- Consumes: the L0 meshes (Task 10).
- Produces:
  - **`public/heath/heathAtlas.png`** (2048², RGBA).
  - **The atlas tiles in the manifest:**
    - `bark`, `deadBark`;
    - `leaf_<kind>`;
    - `card_<kind>_<v>_<k>`, with k in 0–3 (cluster cards);
    - `canopy_<kind>_<v>` (the top-down silhouette, alpha only).
  - **`heathAtlasNormal.png`** (2048², the cards' normals; RGB).
  - **L1 meshes** within 800 triangles: branches thicker than 1 cm (metres), plus crossed cards at the leaf clusters.

- [ ] **Step 1: Write the failing test.**

```ts
  it('keeps L1 within 800 triangles and maps every card and canopy into the atlas', () => {
    for (const e of m.variants) {
      const id = `${e.kind} ${e.variant}`;
      expect(e.lods[1].triangles, id).toBeLessThanOrEqual(800);
      expect(m.atlas.tiles[`canopy_${e.kind}_${e.variant}`], id).toHaveLength(4);
    }
    expect(existsSync('public/heath/heathAtlas.png')).toBe(true);
  });
```

- [ ] **Step 2: Rebuild and run.** Expected: FAIL.

- [ ] **Step 3: Implement.**
- **`lods.py`:**
  - `cluster(leaves, k)` groups the leaf bases by k-means (k = 6–14 by kind) into clusters.
  - `card_mesh(cluster)` makes two crossed quads per cluster, sized to the cluster's bounds and oriented to its mean
    normal, with UVs into `card_<kind>_<v>_<c mod 4>`.
  - `l1(sk, scale)` keeps the tube chains whose base radius × `scale` ≥ 0.005 m.
- **`atlas.py`:**
  - Render each card tile with Blender's Workbench: an orthographic camera looking down the card's normal at the
    cluster's leaves only, a transparent film, flat white lighting (colour from the vertex colours), 128 px.
  - Render the normal pass the same way (`Workbench` shading `NORMAL` matcap off, `color_type='VERTEX'` → a normal
    pass via an emission material of `Normal`).
  - Render the canopy silhouettes: top-down, the whole L0, alpha only, 64 px.
  - Make the bark tiles procedurally with numpy: grey fissured bark, 256 px, for both live and dead wood.
  - Pack everything with a shelf packer into 2048²; write the PNGs and return the `tiles` dict (u0, v0, u1, v1 in
    0–1).
- **`build.py`:** remap every L0 tube UV (0–1 per quad) into the `bark` tile, `deadBark` where the colour flag
  marks dead wood. Leaves get the `leaf_<kind>` tile (a small colour-variation strip; v = the jitter). L1 is
  `lods.l1(...)` plus `lods.card_mesh(...)`.

- [ ] **Step 4: Build, test and look.**

Run: `npm run build:heath && npx vitest run src/heath/kit.test.ts`
Expected: PASS. Open `public/heath/heathAtlas.png` with Read. Expected: card tiles that look like leaf clusters, not
noise.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath public/heath src/heath/kit.test.ts
git commit -m "build(heath): L1 leaf-cluster cards rendered from L0, the bark, leaf and canopy atlas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The kit in the game (`kit.ts`, `KitMeshes.ts`)

**Files:**
- Create: `src/heath/kit.ts`, `src/heath/KitMeshes.ts`, `src/heath/kitMeshes.test.ts`
- Modify: `src/heath/PlantMeshes.ts` (hulls only beyond `MID_M − BAND_FADE_M`, with a shader fade in; delete `update`
  if Task 7 left it), `src/app/App.ts`, `src/heath/heath.selftest.ts`,
  `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: the manifest and glb (Tasks 8–11), `NEAR_M`, `MID_M`, `BAND_FADE_M` (Task 7), `Plant`.
- Produces:

```ts
// kit.ts
export interface Kit { manifest: KitManifest; geometry(kind: string, variant: number, lod: 0 | 1): THREE.BufferGeometry; atlas: THREE.Texture; atlasNormal: THREE.Texture }
export async function loadKit(base?: string): Promise<Kit>;
/** The band weights for an instance at distance d: [L0, L1, hull]; they sum to 1. */
export function bandWeights(d: number): [number, number, number];
// KitMeshes.ts
export class KitMeshes {
  constructor(kit: Kit, sky: Sky, sunVisibility?: (xz: N) => N);
  readonly meshes: THREE.InstancedMesh[];
  /** Lays the near and mid plants (within MID_M + BAND_FADE_M) that the camera can see. */
  update(plants: readonly Plant[], camera: THREE.Camera, patch: { cx: number; cz: number; on: boolean }): { drawn: number; culled: number };
  tick(timeS: number, windSpeedMs: number): void;
  setVisible(on: boolean): void;
}
```

- [ ] **Step 1: Write the failing tests** (`kitMeshes.test.ts`; vitest, no GPU: the CPU parts).

```ts
import { describe, expect, it } from 'vitest';
import { bandWeights } from './kit';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';

describe('bandWeights', () => {
  it('sum to 1 and hand over across 3 m at 12 and 40 m', () => {
    for (let d = 0; d < 60; d += 0.25) {
      const w = bandWeights(d);
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 6);
    }
    expect(bandWeights(NEAR_M - BAND_FADE_M)).toEqual([1, 0, 0]);
    expect(bandWeights(NEAR_M + BAND_FADE_M / 2 + 0.01)[0]).toBe(0);
    expect(bandWeights(MID_M + BAND_FADE_M)).toEqual([0, 0, 1]);
  });
});
```

Plus a `KitMeshes.update` test with a stub kit (a `BoxGeometry` per variant and a fake manifest) and a
`PerspectiveCamera` at the origin looking down −z:
- a plant at (0, 0, −5) is drawn at L0;
- a plant at (0, 0, +5) behind the camera is culled;
- with `patch.on = false`, nothing is drawn nearer than `NEAR_M` (Review Focus 3);
- with an empty plant list, every mesh has `count` 0 and the geometry keeps its attributes (never emptied).

- [ ] **Step 2: Run them.** Expected: FAIL, the modules are missing.

- [ ] **Step 3: Implement.**

`kit.ts`:

```ts
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothstep } from '../math/smoothstep';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';

export interface KitVariant { kind: string; variant: number; lods: { name: string; triangles: number }[]; boundsUnit: [number, number, number]; leafColour: [number, number, number]; checks: Record<string, number | boolean> }
export interface KitManifest { version: 1; units: 'unit'; variants: KitVariant[]; items: KitVariant[]; atlas: { file: string; size: number; tiles: Record<string, [number, number, number, number]> } }
export interface Kit { manifest: KitManifest; geometry(kind: string, variant: number, lod: 0 | 1): THREE.BufferGeometry; atlas: THREE.Texture; atlasNormal: THREE.Texture }

export function bandWeights(d: number): [number, number, number] {
  const h = BAND_FADE_M / 2;
  const a = 1 - smoothstep(NEAR_M - h, NEAR_M + h, d), c = smoothstep(MID_M - h, MID_M + h, d);
  return [a, 1 - a - c, c];
}

export async function loadKit(base = import.meta.env.BASE_URL + 'heath/'): Promise<Kit> {
  const [manifest, gltf, atlas, atlasNormal] = await Promise.all([
    fetch(base + 'heathKit.manifest.json').then((r) => r.json() as Promise<KitManifest>),
    new GLTFLoader().loadAsync(base + 'heathKit.glb'),
    new THREE.TextureLoader().loadAsync(base + 'heathAtlas.png'),
    new THREE.TextureLoader().loadAsync(base + 'heathAtlasNormal.png'),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = atlasNormal.flipY = false;
  const byName = new Map<string, THREE.BufferGeometry>();
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) byName.set(o.name, (o as THREE.Mesh).geometry); });
  return {
    manifest, atlas, atlasNormal,
    geometry(kind, variant, lod) {
      const g = byName.get(`plant_${kind}_${variant}_L${lod}`);
      if (!g) throw new Error(`heath kit: no mesh plant_${kind}_${variant}_L${lod}`);
      return g;
    },
  };
}
```

`KitMeshes`:
- **Meshes:** one `InstancedMesh` per (kind, variant, lod) from `kit.geometry`. Instance attributes are `plantTint`
  (vec3) and `plantSeed` (float). Capacity is 600 at L0 and 3000 at L1 per mesh, and `frustumCulled = false`.
- **`update`:**
  - For each plant compute `d` to the camera and skip `d > MID_M + BAND_FADE_M`.
  - When `!patch.on`, skip `d < NEAR_M + BAND_FADE_M / 2` (the hulls cover).
  - Test a bounding sphere (centre at mid-height, radius `max(width / 2, height)`) against
    `new THREE.Frustum().setFromProjectionMatrix(cam.projectionMatrix × cam.matrixWorldInverse)`, padded by 1 m.
  - Write the matrix into L0 when `bandWeights(d)[0] > 0` and into L1 when `[1] > 0`, seated as
    `PlantMeshes.update` seats it.
  - Upload only the used ranges.
- **Material:** `MeshBasicNodeMaterial`, `side: DoubleSide`.

```ts
const col: N = attribute('color', 'vec4');            // AO, root distance, flutter phase, flag (0 wood, .5 leaf, 1 flower)
const uvA: N = attribute('uv', 'vec2');
const tex: N = texture(kit.atlas, uvA);
// Wind (spec §4.2): stiff at the root, the tips moving with the root distance cubed; leaves flutter on their own phase.
const bend: N = col.y.mul(col.y).mul(col.y).mul(this.sway);
const seed: N = attribute('plantSeed', 'float');
const sway: N = vec3(sin(this.time.mul(1.7).add(seed.mul(6.28))), 0, sin(this.time.mul(1.3).add(seed.mul(4.1))).mul(0.6)).mul(bend);
const flutter: N = normalLocal.mul(sin(this.time.mul(9.0).add(col.z.mul(6.28))).mul(0.004).mul(step(0.25, col.w)));
m.positionNode = positionLocal.add(sway).add(flutter);
// The band fade (spec §3.1): a dither shared by L0 and L1 so the two hand over pixel for pixel.
const d: N = length(positionWorld.xz.sub(cameraPosition.xz));
const h = BAND_FADE_M / 2;
const wNear: N = float(1).sub(smoothstep(NEAR_M - h, NEAR_M + h, d));
const wFar: N = smoothstep(MID_M - h, MID_M + h, d);
const weight: N = lod === 0 ? wNear : float(1).sub(wNear).sub(wFar);
const dither: N = fract(sin(dot(screenCoordinate.xy.add(seed.mul(97.0)), vec2(12.9898, 78.233))).mul(43758.5453));
const keepBand: N = lod === 0 ? dither.lessThan(weight) : dither.greaterThanEqual(wNear).and(dither.lessThan(wNear.add(weight)));
m.maskNode = keepBand.and(tex.a.greaterThan(0.5));
```

Lighting follows `PlantMeshes.material`:
- wrap sun, sky, bounce;
- backlit rim;
- `albedo = tex.rgb × plantTint / leafColour(kind)`, so the tint carries the per-plant jitter;
- × the AO (`col.x`);
- thin-leaf translucency `sky.sunIlluminance × vis × pow(saturate(dot(−v, l)), 4) × 0.5 × albedo`, where
  `col.w > 0.25`;
- `faceDirection` flips the normal on back faces;
- then aerial perspective.

The L1 cards read `kit.atlasNormal` for their normal (`col.w` is 0.5 on cards).

`PlantMeshes`:
- Its hull material gains the same dither with `weight = wFar`, so beyond 40 m hulls fade in as L1 fades out.
- `addCell` skips cells whose centre is nearer than `MID_M − BAND_FADE_M − PLANT_CELL_M`.
- Its `ALBEDO` comes from the manifest's `leafColour` per kind; Task 24 tests the match. Add
  `setKindColours(c: Record<PlantKind, [number, number, number]>)` now and call it from App when the kit loads.

App:
- After the land loads, `loadKit()`; then `this.kitMeshes = new KitMeshes(...)` and add its meshes to the scene.
- Prewarm them in the scene pass the way the plants are (Task 25 adds the test).
- Each frame, `kitMeshes.update(plantsWithin(MID_M + BAND_FADE_M), camera, patch)`. Keep a cheap near list from the
  `PlantField` cells within 43 m, rebuilt per 1 m of camera movement.
- Until the kit loads, the hulls draw everywhere: `PlantMeshes` takes `setNearCutoff(0)` before the kit and
  `setNearCutoff(MID_M − BAND_FADE_M)` after.
- Bush density 0 hides both (Review Focus 2).

Add the kit material to the limits test: `≤ 16` sampled textures and `≤ 12` uniform buffers per stage.

`heath.selftest.ts` gains: **"heath: every kit variant at L0 and L1 draws pixels"**. For each variant, render it
alone at 2 m (L0) and 20 m (L1) into a 64² target with the `coverage` helper from `board.selftest`; pass if every one
is above 20 px. The detail lists any under.

- [ ] **Step 4: Run.**

Run: `npx tsc --noEmit && npx vitest run src/heath src/breaker/BreakingRibbon.limits.test.ts`
Expected: PASS. Then the browser: `http://localhost:5177/?selftest=heath`. Expected: "every kit variant … draws
pixels" PASS, and the existing heath tests still PASS. Then `http://localhost:5177/`, the stand spot. Screenshot.
Expected: real shrubs round the clearing, no seam visible at 12 m or 40 m while walking.

- [ ] **Step 5: Commit.**

```bash
git add src/heath src/app/App.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(heath): real shrubs near the camera: the kit's L0 to 12 m, its cards to 40 m, the hulls beyond, dithered across each band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Gate 1, the species sheet: STOP for Andrew

**Files:**
- Create: `src/dev/speciesSheet.ts` (a dev view: `?sheet=species`)
- Create (git-ignored): `tools/heath/previews/species-sheet.html`
- Modify: `src/main.ts` (route `?sheet=species` like `?selftest`)

**Interfaces:**
- Consumes: `loadKit`, `KitMeshes`'s material through a `KitMeshes` with one plant, `Sky`, `GroundPatch`.
- Produces: one PNG per species × light in `scratchpad/snaps` → copied to `tools/heath/previews/sheet/` (git-ignored).

- [ ] **Step 1: Write the dev view.**
- `speciesSheet.ts` builds a scene: a 6 m ground patch of sand and soil (the land material, without Task 17 yet), the
  sky at 08:30 and at 12:30 (`DEFAULT_ATMOSPHERE`, sun set by time), and one plant of the kind at the centre at its
  kind's mean size.
- The camera is 2.5 m away at 1.2 m height, plus a close-up at 0.8 m.
- For each kind and the light, it renders 1280×720 and posts the PNG to the snapshot receiver (`snapsink.py`, already
  running on the scratchpad) as `__shot` does.
- It runs through the kinds automatically and writes `done` to the page.

- [ ] **Step 2: Capture.** Run `http://localhost:5177/?sheet=species` in the browser pane. Wait for `done`; poll with
`get_page_text`. Expected: 6 kinds × 2 lights × 2 distances = 24 PNGs in the snaps folder.

- [ ] **Step 3: Compose the sheet.** Write `tools/heath/previews/species-sheet.html`. For each species, a row with
Andrew's photo (an `<img>` with the absolute `file:///C:/Dev/andrew-dev-personal-projects/liquid-dreaming/reference/dune/flora/<n>.<name>.png`
path) beside our four renders. Candidate kinds (cutleaf hibbertia, coast cushion bush, cockies tongue, sea spinach)
and the grasses get their photos with an empty "not built yet: keep?" cell. This file stays local: never commit it,
publish it or make it an Artifact (Global Constraints).

- [ ] **Step 4: Show Andrew and STOP.** Open the sheet in the browser pane (`navigate` to the `file:///` path) and
take a screenshot. Ask Andrew, per species:
- approve, or say what to change;
- which of the four candidate kinds to add;
- confirm the grasses (club-rush, sword-sedge, tussock-grass).

Ledger his answers verbatim. Do not start Task 14 before he answers.

- [ ] **Step 5: Commit the dev view** (not the sheet or the PNGs).

```bash
git add src/dev/speciesSheet.ts src/main.ts
git commit -m "feat(dev): the species sheet (gate 1): each kit species at 2.5 m and 0.8 m, morning and midday

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Gate 1 changes and the candidate kinds

**Files:**
- Modify: `tools/heath/species.py`, `src/heath/plants.ts` (kinds Andrew added), `src/heath/kit.test.ts`

**Interfaces:**
- Consumes: Andrew's gate 1 answers (ledger).
- Produces: the approved kinds in `PLANT_KINDS`, each with `PLANT_SPECS`, `FORM`, `ALBEDO`, placement weights, and
  `BRANCH`/`LEAF` entries.

- [ ] **Step 1: Write the failing test.** For each approved candidate kind, add it to the `L0_CAP` table in
`kit.test.ts`. The existing "every kind's four variants" test then fails until it is built. The caps for the
candidates:

```ts
// hibbertia 8000, cushion 6000, templetonia 8000, spinach 6000
```

- [ ] **Step 2: Run it.** Run: `npx vitest run src/heath/kit.test.ts`. Expected: FAIL for each approved kind.

- [ ] **Step 3: Implement.** Use only the approved kinds; drop the rest. The sizes and tables:

```ts
// plants.ts
hibbertia:   { heightM: [0.4, 1.0], widthM: [0.6, 1.5] },  FORM { lobes: 0.25, bumps: 0.12 }, ALBEDO [0.1, 0.17, 0.06]
cushion:     { heightM: [0.3, 0.7], widthM: [0.5, 1.2] },  FORM { lobes: 0.12, bumps: 0.06 }, ALBEDO [0.26, 0.27, 0.25]
templetonia: { heightM: [0.6, 1.5], widthM: [0.8, 2.0] },  FORM { lobes: 0.3, bumps: 0.1 },  ALBEDO [0.11, 0.14, 0.09]
spinach:     { heightM: [0.08, 0.2], widthM: [0.8, 2.0] }, FORM { lobes: 0.15, bumps: 0.08, scallop: 0.12 }, ALBEDO [0.14, 0.17, 0.06]
```

```python
# species.py
BRANCH["hibbertia"] = {"stems": 4, "attractors": 800, "iterations": 55, "step": 0.045, "kill": 0.055, "reach": 0.35, "twig_r": 0.0015, "dead_share": 0.15}
BRANCH["cushion"] = {"stems": 6, "attractors": 900, "iterations": 50, "step": 0.035, "kill": 0.045, "reach": 0.3, "twig_r": 0.001, "dead_share": 0.05}
BRANCH["templetonia"] = {"stems": 3, "attractors": 800, "iterations": 60, "step": 0.05, "kill": 0.06, "reach": 0.35, "twig_r": 0.002, "dead_share": 0.15}
BRANCH["spinach"] = {**BRANCH["pigface"]}
LEAF["hibbertia"] = {"shape": "blade", "length": 0.015, "width": 0.006, "leaf_nodes": 4, "leaves_per_node": 2, "leaf_angle": 0.8, "max_leaves": 1100, "colour": (0.1, 0.17, 0.06)}
LEAF["cushion"] = {"shape": "tiny", "length": 0.004, "width": 0.0015, "leaf_nodes": 3, "leaves_per_node": 3, "leaf_angle": 0.5, "max_leaves": 1300, "colour": (0.26, 0.27, 0.25)}
LEAF["templetonia"] = {"shape": "oval", "length": 0.03, "width": 0.018, "leaf_nodes": 3, "leaves_per_node": 2, "leaf_angle": 0.8, "max_leaves": 900, "colour": (0.11, 0.14, 0.09)}
LEAF["spinach"] = {"shape": "oval", "length": 0.025, "width": 0.015, "leaf_nodes": 5, "leaves_per_node": 2, "leaf_angle": 0.9, "max_leaves": 600, "colour": (0.14, 0.17, 0.06), "opposite": True}
FLOWER["hibbertia"] = {"tris": 16, "radius": 0.012, "count": 12, "colour": (0.75, 0.6, 0.08)}
```

Placement in `cellPlants`:
- `hibbertia` and `templetonia` take shares of the heath shrubs (each 0.12 of the non-tall roll);
- `cushion` takes 0.1 of the dune rise's shrubs;
- `spinach` takes 0.5 of the low plants within 120 m of the waterline (pigface the rest).

Then apply each of Andrew's per-species changes to the tables, and ledger each one with his words.

- [ ] **Step 4: Build, test and re-sheet.** Run: `npm run build:heath && npx vitest run src/heath`. Expected: PASS. Run
`?sheet=species` again and show Andrew the updated rows. Continue when he's content. If he's not, repeat this task's
step 3.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath public/heath src/heath
git commit -m "feat(heath): the species as Andrew approved them at gate 1 (see ledger), and the candidate kinds he kept

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The ground layers

**Files:**
- Create: `tools/heath/ground_layers.py`, `public/heath/LICENSES.md`
- Create: `src/beach/groundLayers.test.ts`

**Interfaces:**
- Produces:
  - **`public/heath/groundLayers.colour.png`:** 1024 × 5120 sRGB; layers stacked top to bottom in the order
    0 sand, 1 soil, 2 limestone, 3 track, 4 footprints.
  - **`public/heath/groundLayers.nrh.png`:** 1024 × 5120; R G = the normal xy (0.5-centred), B = height 0–1,
    A = roughness.
  - **`public/heath/groundLayers.height.bin`:** 5 × 256 × 256 little-endian `Uint16`, height × 65535, at every
    4th texel of the 1024² height.
  - **`public/heath/groundLayers.json`:** `{ "tileM": 2, "layers": ["sand","soil","limestone","track","footprints"], "meanColour": [[r,g,b]×5] }`
    (linear).

Ruling recorded here: the spec says "baked in Blender from procedural sculpts". These are procedural height fields
synthesised with numpy instead. They're still project-made, and they're reproducible and testable without a GPU.

- [ ] **Step 1: Write the failing test.**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the ground layers (dune-up-close §4.3)', () => {
  it('are built: five layers, a 256² height copy for the CPU, licensed', () => {
    const meta = JSON.parse(readFileSync('public/heath/groundLayers.json', 'utf8'));
    expect(meta.layers).toEqual(['sand', 'soil', 'limestone', 'track', 'footprints']);
    expect(readFileSync('public/heath/groundLayers.height.bin').byteLength).toBe(5 * 256 * 256 * 2);
    expect(existsSync('public/heath/groundLayers.colour.png') && existsSync('public/heath/groundLayers.nrh.png')).toBe(true);
    expect(readFileSync('public/heath/LICENSES.md', 'utf8')).toMatch(/groundLayers/);
  });
  it('tile seamlessly (each height\'s opposite edges within 2% of the range)', () => {
    const b = readFileSync('public/heath/groundLayers.height.bin');
    const h = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2);
    for (let l = 0; l < 4; l++) for (let i = 0; i < 256; i++) {
      const at = (x: number, y: number): number => h[l * 65536 + y * 256 + x] / 65535;
      expect(Math.abs(at(0, i) - at(255, i))).toBeLessThan(0.02 + Math.abs(at(1, i) - at(0, i)) * 1.5);
    }
  });
});
```

- [ ] **Step 2: Run it.** Expected: FAIL (files missing).

- [ ] **Step 3: Implement `ground_layers.py`.** Everything is tileable: the noises are built by FFT-filtered white
noise on a periodic grid, and stamps wrap with `np.roll`.

```python
"""The ground's material layers (dune-up-close spec §4.3): 1024² per layer, tiling every 2 m (1 px ≈ 2 mm)."""
import json
import os
import sys

import numpy as np
from PIL import Image

N, TILE_M = 1024, 2.0
rng = np.random.default_rng(20261002)


def band_noise(lo_m, hi_m):
    """Periodic noise with features between lo_m and hi_m, normalised to 0–1."""
    f = np.fft.fftfreq(N, d=TILE_M / N)
    fx, fy = np.meshgrid(f, f)
    k = np.hypot(fx, fy)
    mask = (k >= 1 / hi_m) & (k <= 1 / lo_m)
    spec = np.fft.fft2(rng.standard_normal((N, N))) * mask
    n = np.real(np.fft.ifft2(spec))
    return (n - n.min()) / (np.ptp(n) or 1)


def stamp(h, shape, count, depth, size_px, rotate=True):
    """Adds `count` copies of the stamp (a 2D array, 0–1) at random places, wrapped, scaled by depth."""
    s = np.array(Image.fromarray((shape * 255).astype(np.uint8)).resize((size_px, size_px))) / 255.0
    for _ in range(count):
        t = np.rot90(s, rng.integers(4)) if rotate else s
        y, x = rng.integers(N, size=2)
        h[:] += depth * np.roll(np.roll(np.pad(t, ((0, N - size_px), (0, N - size_px))), y, 0), x, 1)


def leaf_shape(n=64, w=0.18):
    yy, xx = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    return np.clip(1 - (xx / 0.95) ** 2 - (yy / w) ** 2, 0, 1) ** 0.5


def foot_shape(n=96):
    yy, xx = np.mgrid[-1:1:n * 1j, -1:1:n * 1j]
    sole = np.clip(1 - (xx / 0.38) ** 2 - ((yy + 0.1) / 0.85) ** 2, 0, 1)
    toes = sum(np.clip(1 - ((xx - dx) / 0.08) ** 2 - ((yy - 0.82) / 0.09) ** 2, 0, 1) for dx in (-0.22, -0.1, 0.02, 0.13, 0.23))
    return np.clip(sole + toes, 0, 1) ** 0.6


def layers():
    sand = 0.55 * band_noise(0.004, 0.02) + 0.45 * band_noise(0.3, 1.2)
    soil = 0.5 * band_noise(0.01, 0.08) + 0.5 * band_noise(0.3, 1.0)
    stamp(soil, leaf_shape(), 900, 0.25, 22)            # fallen daisy needles and wattle leaves
    stamp(soil, leaf_shape(w=0.05), 400, 0.3, 36)        # twigs
    lime = 0.6 * band_noise(0.15, 0.9) + 0.4 * band_noise(0.005, 0.03)
    pits = band_noise(0.02, 0.12)
    lime = lime - 0.6 * np.clip(pits - 0.62, 0, 1) / 0.38  # solution pits
    track = 0.6 * band_noise(0.01, 0.05) + 0.4 * band_noise(0.4, 1.5)
    prints = np.zeros((N, N))
    stamp(prints, foot_shape(), 1, 1.0, 140, rotate=False)
    prints = 1 - prints
    norm = lambda a: (a - a.min()) / (np.ptp(a) or 1)
    heights = [norm(sand), norm(soil), norm(lime), norm(track), norm(prints)]
    colours = [
        (np.array([0.62, 0.55, 0.42]), 0.08),  # sand: the land's DRY_SAND, ±8% by height
        (np.array([0.12, 0.1, 0.07]), 0.3),    # dark sandy soil, leaf fall lighter
        (np.array([0.42, 0.4, 0.36]), 0.25),   # grey limestone; lichen below
        (np.array([0.36, 0.27, 0.17]), 0.12),  # tan-brown track soil (Andrew's Earth views)
        (np.array([0.36, 0.27, 0.17]), 0.0),
    ]
    return heights, colours


def normals(h, depth_m):
    gy, gx = np.gradient(h * depth_m, TILE_M / N)
    n = np.dstack([-gx, -gy, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


def main(out):
    heights, colours = layers()
    col_rows, nrh_rows, small, means = [], [], [], []
    lichen = band_noise(0.02, 0.3) > 0.7
    for i, (h, (base, vary)) in enumerate(zip(heights, colours)):
        c = base[None, None, :] * (1 - vary + 2 * vary * h[..., None])
        if i == 2:
            c[lichen] *= 0.45
        means.append([round(float(v), 4) for v in c.reshape(-1, 3).mean(0)])
        srgb = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.clip(c, 0, 1), 1 / 2.4) - 0.055)
        col_rows.append((np.clip(srgb, 0, 1) * 255).astype(np.uint8))
        n = normals(h, 0.025)
        rough = 0.95 - 0.1 * h if i != 2 else 0.8 - 0.2 * h
        nrh_rows.append((np.dstack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, h, rough]) * 255).astype(np.uint8))
        small.append((h[::4, ::4] * 65535).astype("<u2"))
    Image.fromarray(np.vstack(col_rows), "RGB").save(os.path.join(out, "groundLayers.colour.png"), optimize=True)
    Image.fromarray(np.vstack(nrh_rows), "RGBA").save(os.path.join(out, "groundLayers.nrh.png"), optimize=True)
    np.stack(small).tofile(os.path.join(out, "groundLayers.height.bin"))
    json.dump({"tileM": TILE_M, "layers": ["sand", "soil", "limestone", "track", "footprints"], "meanColour": means},
              open(os.path.join(out, "groundLayers.json"), "w"), indent=1)


main(sys.argv[1])
```

`public/heath/LICENSES.md`:

```markdown
# public/heath licences

All files here are project-made for Liquid Dreams (no third-party assets):
- heathKit.glb, heathKit.manifest.json, heathAtlas.png, heathAtlasNormal.png: grown procedurally by tools/heath (Blender 5.2.2).
- groundLayers.colour.png, groundLayers.nrh.png, groundLayers.height.bin, groundLayers.json: synthesised by tools/heath/ground_layers.py (numpy).
```

- [ ] **Step 4: Build, test and look.** Run: `npm run build:heath -- --ground && npx vitest run src/beach/groundLayers.test.ts`.
Expected: PASS. Open the colour PNG with Read. Expected: five readable tiles: fine sand; dark soil strewn with
leaves; pitted grey stone; tan track; one footprint.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath/ground_layers.py public/heath src/beach/groundLayers.test.ts
git commit -m "build(ground): five tileable ground layers (sand, soil with leaf fall, pitted limestone, tan track, a footprint) and their CPU heights

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The CPU mirror of the patch surface

**Files:**
- Create: `src/beach/groundHeights.ts`, `src/beach/groundHeights.test.ts`

**Interfaces:**
- Consumes: `PatchGrids` (`groundPatch.ts`), `TrackNetwork` (Task 3), `groundLayers.height.bin` (Task 15).
- Produces:

```ts
export const RELIEF_M = 0.05;      // ±2.5 cm
export const BLEND_SOFT = 0.02;    // the height blend's soft band (in layer height units ≈ 2 cm: spec §4.3)
export class GroundLayersCpu { constructor(heights: Uint16Array); height(layer: number, x: number, z: number): number }
export function loadGroundLayersCpu(bytes: ArrayBuffer): GroundLayersCpu;
/** The four blend weights (sand, soil, limestone, track) from the cover (wet, sand, rock, heath) and the worn mask. */
export function layerWeights(cover: [number, number, number, number], worn: number): [number, number, number, number];
/** Height-blended relief (m) at (x, z): Σ b̂_i h_i − 0.5, × RELIEF_M, × (1 − worn), × the patch edge fade. */
export function reliefAt(layers: GroundLayersCpu, cover: [number, number, number, number], worn: number, x: number, z: number, edge: number): number;
/** The patch surface exactly as the GPU draws it: base bilinear + relief − sink. */
export function patchSurfaceAt(g: PatchGrids, layers: GroundLayersCpu, tracks: TrackNetwork | null, x: number, z: number): number;
```

`reliefAt` samples each layer's height texel at the 0.25 m lattice point nearest (x, z): at 2 m per 256 texels, a
lattice point is every 32 texels, so the GPU's `textureLoad` at the vertex hits exactly the same texel.

- [ ] **Step 1: Write the failing tests.**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELIEF_M, layerWeights, loadGroundLayersCpu, reliefAt } from './groundHeights';

const layers = loadGroundLayersCpu(readFileSync('public/heath/groundLayers.height.bin').buffer as ArrayBuffer);
describe('groundHeights', () => {
  it('reads the tile wrapped every 2 m', () => {
    expect(layers.height(1, 0.5, 0.75)).toBe(layers.height(1, 2.5, -1.25));
  });
  it('blends by height: the winning layer takes the pixel, others only within the soft band', () => {
    const w = layerWeights([0, 0.6, 0, 0.4], 0);
    expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo(1, 6);
    expect(w[2]).toBe(0);
  });
  it('keeps the relief within ±2.5 cm and flat on a track', () => {
    for (let x = 0; x < 4; x += 0.25) {
      const r = reliefAt(layers, [0, 0.5, 0.2, 0.3], 0, x, 1, 1);
      expect(Math.abs(r)).toBeLessThanOrEqual(RELIEF_M / 2 + 1e-9);
      expect(reliefAt(layers, [0, 0.5, 0.2, 0.3], 1, x, 1, 1)).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL (module missing).

- [ ] **Step 3: Implement.**

```ts
import type { TrackNetwork } from '../land/tracks';
import { PATCH_FADE_M, PATCH_GRID_N, PATCH_SIZE_M, type PatchGrids } from './groundPatch';
import { smoothstep } from '../math/smoothstep';

export const RELIEF_M = 0.05, BLEND_SOFT = 0.02, LAYER_TILE_M = 2, LAYER_N = 256;

export class GroundLayersCpu {
  constructor(private readonly h: Uint16Array) {}
  height(layer: number, x: number, z: number): number {
    const t = (v: number): number => ((Math.round((v / LAYER_TILE_M) * LAYER_N) % LAYER_N) + LAYER_N) % LAYER_N;
    return this.h[layer * LAYER_N * LAYER_N + t(z) * LAYER_N + t(x)] / 65535;
  }
}
export const loadGroundLayersCpu = (bytes: ArrayBuffer): GroundLayersCpu => new GroundLayersCpu(new Uint16Array(bytes));

export function layerWeights(c: [number, number, number, number], worn: number): [number, number, number, number] {
  const keep = 1 - worn;
  return [(c[0] + c[1]) * keep, c[3] * keep, c[2] * keep, worn];
}

function blend(layers: GroundLayersCpu, w: [number, number, number, number], x: number, z: number): number {
  const s = w.map((wi, i) => (wi > 0 ? layers.height(i, x, z) + wi : -Infinity));
  const top = Math.max(...s);
  const b = s.map((si) => Math.max(0, si - (top - BLEND_SOFT)));
  const sum = b.reduce((a, v) => a + v, 0) || 1;
  return b.reduce((a, bi, i) => a + (bi / sum) * (w[i] > 0 ? layers.height(i, x, z) : 0), 0);
}

export function reliefAt(layers: GroundLayersCpu, cover: [number, number, number, number], worn: number, x: number, z: number, edge: number): number {
  if (worn >= 1) return 0;
  return (blend(layers, layerWeights(cover, worn), x, z) - 0.5) * RELIEF_M * (1 - worn) * edge;
}

function bilinear(g: PatchGrids, arr: Float32Array, ch: number, stride: number, x: number, z: number): number {
  const fx = Math.min(Math.max(x - g.cornerX, 0), PATCH_GRID_N - 1), fz = Math.min(Math.max(z - g.cornerZ, 0), PATCH_GRID_N - 1);
  const i = Math.min(Math.floor(fx), PATCH_GRID_N - 2), j = Math.min(Math.floor(fz), PATCH_GRID_N - 2), tx = fx - i, tz = fz - j;
  const v = (a: number, b: number): number => arr[(b * PATCH_GRID_N + a) * stride + ch];
  return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz;
}

export function patchSurfaceAt(g: PatchGrids, layers: GroundLayersCpu, tracks: TrackNetwork | null, x: number, z: number): number {
  const half = PATCH_SIZE_M / 2, cx = g.cornerX + half, cz = g.cornerZ + half;
  const edge = 1 - smoothstep(half - PATCH_FADE_M, half, Math.max(Math.abs(x - cx), Math.abs(z - cz)));
  const cover = [0, 1, 2, 3].map((c) => bilinear(g, g.cover, c, 4, x, z)) as [number, number, number, number];
  const worn = tracks ? tracks.worn(x, z) : 0;
  return bilinear(g, g.heights, 0, 1, x, z) + reliefAt(layers, cover, worn, x, z, edge) - (tracks ? tracks.sinkAt(x, z) : 0);
}
```

The GPU's worn mask is the 0.25 m raster of `tracks.worn`, bilinear (Task 17). To match exactly, `patchSurfaceAt`
must use the same lattice bilinear. Add `TrackNetwork.wornAt(x, z)` (lattice bilinear, like `sinkAt`) and use it here
and in Task 21; add a test in `tracks.test.ts` that `wornAt` equals `worn` on the lattice.

- [ ] **Step 4: Run.** Run: `npx vitest run src/beach/groundHeights.test.ts src/land/tracks.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/beach/groundHeights.ts src/beach/groundHeights.test.ts src/land/tracks.ts src/land/tracks.test.ts
git commit -m "feat(ground): the CPU mirror of the patch surface: height-blended layer relief, the worn mask and the sink

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The layers on the patch (`groundDetail.ts`)

**Files:**
- Create: `src/beach/groundDetail.ts`
- Modify: `src/beach/GroundPatchMesh.ts` (relief → layer relief + sink; tracks mask; detail into the material),
  `src/land/landShading.ts` (`LandMaterialOptions.patch.detail`), `src/app/App.ts` (load the layers; rebuild the mask
  on recentre), `src/beach/beach.selftest.ts`, `src/breaker/BreakingRibbon.limits.test.ts`
- Test: `src/beach/groundDetail.test.ts`

**Interfaces:**
- Consumes: `GroundLayersCpu`, `layerWeights`, `RELIEF_M`, `BLEND_SOFT` (Task 16), `TrackNetwork.wornAt`/`sinkAt`.
- Produces:

```ts
export interface GroundLayerTextures { colour: THREE.DataArrayTexture; nrh: THREE.DataArrayTexture; heights: THREE.DataArrayTexture; meanColour: [number, number, number][] }
export async function loadGroundLayerTextures(base?: string): Promise<GroundLayerTextures>;
/** The tracks mask round the patch: 128² at 0.25 m, RG = (worn, sink m), float. */
export function buildTracksMask(tracks: TrackNetwork | null, cornerX: number, cornerZ: number, out?: Float32Array): Float32Array;
export const MASK_N = 128, MASK_CELL_M = 0.25;
// GroundPatch
setLayers(t: GroundLayerTextures): void;
setTracksMask(data: Float32Array, cornerX: number, cornerZ: number): void;
// landShading: LandMaterialOptions.patch gains
detail?: { sand: N; soil: N; rock: N; track: N; trackW: N; normal: N; near: N };
```

- [ ] **Step 1: Write the failing tests.**

```ts
// groundDetail.test.ts
it('rasterises the worn mask and the sink on the 0.25 m lattice round the patch centre, in under 0.5 ms', () => {
  const net = new TrackNetwork(routeTracks(syntheticLand(), [-300, 300]));
  const [x, z] = net.data.pieces[0].points[150];
  const cornerX = Math.round(x / 4) * 4 - 16, cornerZ = Math.round(z / 4) * 4 - 16;
  const t0 = performance.now();
  const m = buildTracksMask(net, cornerX, cornerZ);
  expect(performance.now() - t0).toBeLessThan(0.5 * 4); // vitest's CPU is slower than the game's; the game logs the real figure
  const i = Math.round((x - cornerX) / MASK_CELL_M), j = Math.round((z - cornerZ) / MASK_CELL_M);
  expect(m[(j * MASK_N + i) * 2]).toBeCloseTo(net.worn(cornerX + i * MASK_CELL_M, cornerZ + j * MASK_CELL_M), 6);
  expect(m[(j * MASK_N + i) * 2 + 1]).toBeCloseTo(net.sinkExact(cornerX + i * MASK_CELL_M, cornerZ + j * MASK_CELL_M), 6);
});
```

`beach.selftest.ts`: add **"beach: the patch's full surface (relief and the tracks' sink) matches the CPU's
patchSurfaceAt, ±1 mm"**. It follows the existing heights test, evaluating
`patch.surfaceNode(xz)` at 12 points on and beside the beach path and in the clearing of the real land.

- [ ] **Step 2: Run them.** Run: `npx vitest run src/beach/groundDetail.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement.**

`buildTracksMask`: the mask is 32 m, the inner half of the 64 m patch, centred. It is laid out as MASK_N² RG floats,
`out[(j*MASK_N+i)*2] = tracks.worn(...)`, `+1 = tracks.sinkExact(...)`. Return zeros with no tracks.

`loadGroundLayerTextures` fetches the two PNGs, decodes them through `createImageBitmap` → `OffscreenCanvas` →
`getImageData`, and splits them into 5 layers of `DataArrayTexture(data, 1024, 1024, 5)`:
- colour: `SRGBColorSpace`, `RepeatWrapping`, mipmaps, `LinearMipmapLinearFilter`;
- nrh: linear, mipmapped;
- `heights`: from `groundLayers.height.bin` as a `RedFormat` `HalfFloatType` array texture, 256²×5, `NearestFilter`,
  no mips.

`GroundPatch`:
- Add `tracksMask` (`DataTexture` MASK_N², RG, FloatType, Nearest) and its `maskCorner` uniform.
- A `layerHeightNode(layer, xz)`: `textureLoad(heights, ivec2(mod(round(xz / 2 * 256), 256)), 0).depth(layer).x`.
- A `wornSinkNode(xz)`: bilinear `textureLoad` of the mask, as `bilinear()` does, with `(0, 0)` outside the 32 m.
- The vertex relief replaces `lumps`/`rough`. It mirrors `reliefAt`:

```ts
const cover: N = this.bilinear(this.cover, xz);               // wet, sand, rock, heath
const ws: N = this.wornSinkNode(xz);
const keep: N = float(1).sub(ws.x);
const w: N[] = [cover.x.add(cover.y).mul(keep), cover.w.mul(keep), cover.z.mul(keep), ws.x];
const h: N[] = [0, 1, 2, 3].map((i) => this.layerHeightNode(i, xz));
const score: N[] = w.map((wi, i) => select(wi.greaterThan(0), h[i].add(wi), float(-1e9)));
const top: N = max(max(score[0], score[1]), max(score[2], score[3]));
const b: N[] = score.map((s) => max(s.sub(top.sub(BLEND_SOFT)), 0));
const sum: N = max(b[0].add(b[1]).add(b[2]).add(b[3]), 1e-6);
const mixH: N = b.reduce((a: N, bi: N, i: number) => a.add(bi.div(sum).mul(select(w[i].greaterThan(0), h[i], float(0)))), float(0));
const relief: N = mixH.sub(0.5).mul(RELIEF_M).mul(keep).mul(edge);
const y = this.heightNode(xz).add(relief).sub(ws.y).sub(attribute('skirt', 'float').mul(PATCH_SKIRT_M));
```

Expose `surfaceNode(xz)` returning `y` without the skirt (for the self-test).

The fragment detail goes to `createLandMaterial` through `patch.detail`. Each layer tiles every 2 m: `uv = xz / 2`.
- `sand` = `texture(colour, uv).depth(0).rgb / meanColour[0]` (a multiplier on `DRY_SAND`).
- `rock` = layer 2 / its mean (a multiplier on the rock mix).
- `soil` = layer 1 (the albedo replacing the heath floor).
- `track` = layer 3 (albedo) and `trackW` = the worn mask.
- In the limestone band, a corridor's shoulders show rock steps (spec §4.1 gully): the rock weight there is
  `max(rF, cover.z × smoothstep(0.2, 0.6, ws.x) × (1 − step(0.95, ws.x)))`.
- `normal` = the height-blended layer normal (nrh.rg → xy, z = sqrt(1 − x² − y²)), weighted like the relief, in world
  xz (the layers lie flat).
- `near` = `1 − smoothstep(16, 30, dist)`: every detail term mixes back to today's look by 30 m.

In `createLandMaterial`, when `opts.patch?.detail`:
- `dry` × mix(1, sand, near);
- `rock` × mix(1, rockDetail, near);
- `floor` = mix(floor, soil, near);
- `albedo` = mix(albedo, track, trackW × near) (the track replaces whatever cover is under it);
- `n` = normalize(n + (detailNormal.x, 0, detailNormal.y) × near).

The ripples stay; they're already masked to dry sand.

App:
- When the land is built, `loadGroundLayerTextures()` then `patch.setLayers`.
- On every patch recentre, `buildTracksMask(lh.trackNetwork, c[0] − 16, c[1] − 16)` then `patch.setTracksMask`; log
  its time once to the console as `[ground] tracks mask N ms`.

Add the patch with layers set to the limits test: ≤ 16/12/8.

- [ ] **Step 4: Run.**

Run: `npx tsc --noEmit && npx vitest run src/beach src/land src/breaker/BreakingRibbon.limits.test.ts`
Expected: PASS. Browser: `?selftest=beach`. Expected: all three beach tests PASS, the new one with "worst ≤ 1.00 mm".
Then the game at the stand spot; screenshot from the Conditions camera. Expected:
- soil crumbling into sand at its edges;
- the tan track worn into the ground;
- limestone pits where the rock shows;
- no visible tiling at 2–5 m.

- [ ] **Step 5: Commit.**

```bash
git add src/beach src/land/landShading.ts src/app/App.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(ground): height-blended sand, soil, limestone and track layers on the patch, 25 cm relief, the tracks worn in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Footprints

**Files:**
- Create: `src/beach/Footprints.ts`, `src/beach/footprints.test.ts`
- Modify: `src/app/App.ts`, `src/beach/beach.selftest.ts`

**Interfaces:**
- Consumes: `TrackNetwork` (Task 3), `GroundLayerTextures` (layer 4), `patchSurfaceAt` (Task 16).
- Produces:

```ts
export interface Print { x: number; z: number; yaw: number; age: number; left: boolean }
export const MAX_PRINTS = 600;
/** The prints within `radiusM` of (x, z): two lanes per corridor and a scuff in the clearing; the same prints whatever the camera. */
export function printsNear(tracks: TrackNetwork, x: number, z: number, radiusM?: number): Print[];
export class Footprints { constructor(layers: GroundLayerTextures, sky: Sky); readonly mesh: THREE.InstancedMesh; update(prints: readonly Print[], surfaceAt: (x: number, z: number) => number): void; setVisible(on: boolean): void }
```

- [ ] **Step 1: Write the failing tests.**

```ts
describe('printsNear', () => {
  const net = new TrackNetwork(routeTracks(syntheticLand(), [-300, 300]));
  const [x, z] = net.data.pieces[1].points[20];
  const p = printsNear(net, x, z, 20);
  it('is capped at 600 and stays on the tracks', () => {
    expect(p.length).toBeLessThanOrEqual(MAX_PRINTS);
    for (const q of p) expect(net.onTrack(q.x, q.z)).toBe(true);
  });
  it('strides 0.6–0.8 m along each lane, about 2 per metre per lane', () => {
    const lane = p.filter((q) => q.left).sort((a, b) => a.x - b.x || a.z - b.z);
    const gaps = lane.slice(1).map((q, i) => Math.hypot(q.x - lane[i].x, q.z - lane[i].z)).filter((g) => g < 1.5);
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(0.55); expect(g).toBeLessThanOrEqual(0.85); }
  });
  it('is the same set whatever the camera', () => {
    const a = printsNear(net, x, z, 10).map((q) => `${q.x},${q.z}`);
    const b = printsNear(net, x + 3, z, 20).map((q) => `${q.x},${q.z}`);
    for (const k of a) expect(b).toContain(k);
  });
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement.**
- **`printsNear`:**
  - Walk each piece's polyline, carrying the arc length.
  - Two lanes, ±0.15 m off the centre.
  - The stride for print k is `0.6 + 0.2 × hash(piece, lane, k)` (`hash3` from `beach/procedural`).
  - Yaw is along the line ± 12° × (hash − 0.5) × 2; age is a hash in 0–1.
  - Keep those within `radiusM`.
  - **The clearing:** 40 prints at hashed points inside the ellipse, random yaw.
  - **Density:** the beach path and the clearing take every print; the Cape to Cape keeps a share of 0.4, so it thins
    out as the spec says.
  - Sort by distance; cap at 600.
- **`Footprints`:**
  - One `InstancedMesh` of a 0.28 × 0.11 m quad (2 triangles) laid flat; capacity 600.
  - Each instance is placed at `surfaceAt(x, z) + 0.002`, yawed and mirrored for the left foot.
  - **Material:**
    - reads layer 4's normal and height through `.depth(4)`;
    - alpha `= (1 − h) × (1 − 0.6 × age)`, softened at the edge by age;
    - colour `= the ground under it`, darkened 12% × alpha;
    - `transparent`, `depthWrite: false`, `polygonOffset −2`.
- **App:** rebuild the prints list per 2 m of camera movement while the patch shows.

`beach.selftest.ts`: **"beach: footprints draw on the clearing"**. Render the clearing from 2 m with prints on and
off; pass if the pixel difference is at least 50 px in a 128² target.

- [ ] **Step 4: Run.** Run: `npx vitest run src/beach && npx tsc --noEmit`. Expected: PASS. Then
`?selftest=beach`: PASS. Then a screenshot at the stand spot. Expected: soft prints scuffing the clearing and running
down the beach path.

- [ ] **Step 5: Commit.**

```bash
git add src/beach src/app/App.ts
git commit -m "feat(ground): bare-foot prints along the tracks and scuffing the clearing, as decals on the patch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Limestone on the face rocks within 16 m

**Files:**
- Modify: `src/beach/RockMeshes.ts` (`rockMaterial`: an optional `layers` triplanar; the `rockKind` instance attribute)
- Modify: `src/app/App.ts` (`rocks.setLayers` after the layers load)
- Test: `src/beach/RockMeshes.test.ts`

**Interfaces:**
- Consumes: `GroundLayerTextures` (layer 2).
- Produces: `Rocks.setLayers(t: GroundLayerTextures): void`; the instance attribute `rockFace` (1 for `kind === 'face'`).

- [ ] **Step 1: Write the failing test.** In `RockMeshes.test.ts`: after `update` with one `face` rock and one `toe`
rock, the `rockFace` attribute reads `[1, 0]` (in instance order).

- [ ] **Step 2: Run it.** Expected: FAIL (no attribute).

- [ ] **Step 3: Implement.**
- Write `rockFace` in `update`.
- In `rockMaterial`, when layers are set, project limestone onto three planes from world position / 2:

```ts
const wts: N = pow(abs(normalWorld), vec3(4)); const wn: N = wts.div(wts.x.add(wts.y).add(wts.z));
const tri = (layer: number): N => texture(L.colour, positionWorld.zy.div(2)).depth(layer).rgb.mul(wn.x)
  .add(texture(L.colour, positionWorld.xz.div(2)).depth(layer).rgb.mul(wn.y)).add(texture(L.colour, positionWorld.xy.div(2)).depth(layer).rgb.mul(wn.z));
const lime: N = tri(2).div(vec3(...L.meanColour[2]));
const on: N = attribute('rockFace', 'float').mul(float(1).sub(smoothstep(12.0, 16.0, dist)));
albedo = mix(albedo, albedo.mul(lime), on);
```

Rust (toe and shore) rocks are untouched (spec §1.2).

- [ ] **Step 4: Run.** Run: `npx vitest run src/beach/RockMeshes.test.ts src/breaker/BreakingRibbon.limits.test.ts`.
Expected: PASS. Browser screenshot of a face outcrop at 3 m. Expected: pitted grey stone matching the cap rock.

- [ ] **Step 5: Commit.**

```bash
git add src/beach/RockMeshes.ts src/beach/RockMeshes.test.ts src/app/App.ts
git commit -m "feat(rocks): the face outcrops take the limestone layer up close (triplanar), one stone with the cap rock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Tufts and ground items in the kit

**Files:**
- Create: `tools/heath/tufts.py`, `tools/heath/items.py`
- Modify: `tools/heath/build.py` (the manifest's `items`), `src/heath/kit.test.ts`

**Interfaces:**
- Produces, in the glb and the manifest's `items`:
  - **Tufts:** `tuft_clubrush_<v>`, `tuft_swordsedge_<v>`, `tuft_tussock_<v>` (v 0–3), each with `_L0` and `_L1`.
  - **Twigs and leaves:** `item_twig_<v>` (v 0–5) and `item_leaves_<kind>_<v>` (kind daisy or tall, v 0–3).
  - **Shells and stones:** `item_shell_<v>` (v 0–5) and `item_stone_<v>` (v 0–5).
  - Items are in metres, not unit, with `boundsUnit` holding their metre bounds.
  - The tuft species follow Andrew's gate 1 confirmation (Task 13); drop any he rejected.

- [ ] **Step 1: Write the failing test.**

```ts
  it('builds the tufts within 1,200 triangles at L0 and the ground items within their sizes (§4.4, §7.1)', () => {
    for (const e of m.items) {
      if (e.kind.startsWith('tuft_')) expect(e.lods[0].triangles, e.kind).toBeLessThanOrEqual(1200);
      const [bx, by, bz] = e.boundsUnit;
      if (e.kind === 'item_twig') expect(Math.max(bx, bz) * 2).toBeLessThanOrEqual(0.42);
      if (e.kind === 'item_stone') expect(Math.max(bx, bz) * 2).toBeLessThanOrEqual(0.21);
    }
    for (const k of ['tuft_clubrush', 'tuft_swordsedge', 'tuft_tussock', 'item_twig', 'item_shell', 'item_stone']) {
      expect(m.items.some((e: { kind: string }) => e.kind === k), k).toBe(true);
    }
  });
```

- [ ] **Step 2: Run it.** Expected: FAIL (`items` empty).

- [ ] **Step 3: Implement.**

`tufts.py`: a blade is a bent strip of 3–5 segments, 2 triangles each. Base points sit in a disc of radius 0.06–0.12 m,
and each blade leans out by its base offset and arches under gravity.

```python
import math
from mathutils import Vector


def blade(bm, uv_layer, col_layer, base, length, width, lean, droop, segs, flutter, crossed=False):
    """A bent strip: up and out along `lean` (a horizontal vector), drooping by `droop` at the tip, tapering to a
    point. `crossed`: a second strip at 90° (club-rush's round stems). Colour: (AO, t along the blade, flutter, 0.5)."""
    pts = [base + lean * (k / segs * length * 0.6) + Vector((0, 0, length * (k / segs - droop * (k / segs) ** 2))) for k in range(segs + 1)]
    sides = [lean.cross(Vector((0, 0, 1))).normalized()]
    if crossed:
        sides.append(lean.normalized())
    for side in sides:
        verts = []
        for k, p in enumerate(pts):
            w = width * (1 - k / segs) * 0.5
            verts.append((bm.verts.new(p - side * w), bm.verts.new(p + side * w), k / segs))
        for (a0, a1, t0), (b0, b1, t1) in zip(verts, verts[1:]):
            f = bm.faces.new((a0, a1, b1, b0))
            for lp, (u, t) in zip(f.loops, ((0, t0), (1, t0), (1, t1), (0, t1))):
                lp[uv_layer].uv = (u, t)
                lp[col_layer] = (0.35 + 0.65 * min(1.0, t * 3), t, flutter, 0.5)


def tuft(bm, uv_layer, col_layer, sp, rng):
    """One tuft: sp = {blades: (lo, hi), height: (lo, hi), width, segs, droop, crossed, base_r}."""
    for _ in range(rng.randint(*sp["blades"])):
        a, r = rng.uniform(0, 2 * math.pi), sp["base_r"] * math.sqrt(rng.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        lean = Vector((math.cos(a), math.sin(a), 0)) * (0.2 + r / sp["base_r"])
        blade(bm, uv_layer, col_layer, base, rng.uniform(*sp["height"]), sp["width"], lean, sp["droop"] * rng.uniform(0.5, 1.5),
              sp["segs"], rng.random(), sp.get("crossed", False))
```

Each blade is 2 triangles per segment per strip, so 60–90 crossed 3-segment club-rush stems are 720–1080 triangles,
plus the knob heads at 20%. That's within the 1,200 cap. Trim `blades` if the check fails.

The species values:

| Tuft | Blades | Height | Blade width | Heads | Colour |
|---|---|---|---|---|---|
| club-rush | 60–90 round stems (two crossed strips each, 3 segments) | 0.3–0.8 m | 3 mm | brown knob heads: a 12-triangle squashed sphere 1 cm below the tip, on 20% | dark green (0.08, 0.12, 0.05) |
| sword-sedge | 30–50 flat blades, 5 segments | up to 1 m | 1.5 cm, keeled | none | grey-green (0.13, 0.16, 0.1) |
| tussock-grass | 100–120 fine blades, 3 segments | 0.3–0.7 m | 2 mm | none | blue-grey (0.18, 0.2, 0.19) |

Every tuft:
- **L1:** a crossed card pair rendered into the atlas (Task 11's `atlas.py`, tile `tuft_<name>_<v>`);
- **Colour data:** the same layout as the plants: AO baked low at the base, root distance = t along the blade (the
  wind), flutter phase per blade, flag 0.5.

`items.py`:
- **Twigs:** a `grow.skeleton` of 2–3 branches laid flat (z squashed to 0.1) at 10–40 cm, as tubes, dead bark.
- **Fallen-leaf clumps:** 30–80 of the kind's leaf shapes scattered flat in a 12–25 cm patch with random tilt ±20°, in
  the kind's colour darkened 40% (dry).
- **Shells:** a ridged half-ellipsoid of 24–40 triangles, 1–4 cm, pale (0.7, 0.66, 0.6).
- **Stones:** an icosphere (subdivision 2) displaced by a pitted noise (as `rockShapeGeometry`), 3–20 cm, flattened
  bottom, limestone grey, UV-mapped to the `bark` tile (detail only).

- [ ] **Step 4: Build and test.** Run: `npm run build:heath && npx vitest run src/heath/kit.test.ts`. Expected: PASS.
Open `tools/heath/previews/tuft_clubrush_0_L0.png`. Expected: a believable tussock of round stems with brown knobs.

- [ ] **Step 5: Commit.**

```bash
git add tools/heath public/heath src/heath/kit.test.ts
git commit -m "build(heath): club-rush, sword-sedge and tussock-grass tufts; fallen twigs and leaves, shells and limestone stones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: The near scatter's placement

**Files:**
- Create: `src/heath/nearScatter.ts`, `src/heath/nearScatter.test.ts`

**Interfaces:**
- Consumes: `coverAt`, `LandHeight` (with tracks), `TrackNetwork.wornAt`/`nearest`, `PlantField` (crowns),
  `patchSurfaceAt` or a `surfaceAt` function, `hash3`.
- Produces:

```ts
export type ScatterKind = 'tuft_clubrush' | 'tuft_swordsedge' | 'tuft_tussock' | 'item_twig' | 'item_leaves_daisy' | 'item_leaves_tall' | 'item_shell' | 'item_stone';
export interface ScatterItem { kind: ScatterKind; variant: number; x: number; z: number; y: number; yaw: number; tiltX: number; tiltZ: number; scale: number; seed: number }
export const SCATTER_CELL_M = 2, TUFT_RANGE_M = 20, ITEM_RANGE_M = 12;
export interface ScatterContext { land: LandHeight; plants: (x: number, z: number) => { underCrown: boolean; crownKind: string | null }; surfaceAt(x: number, z: number): number; density: number; rockNear(x: number, z: number): boolean }
export function cellScatter(ci: number, cj: number, ctx: ScatterContext): ScatterItem[];
```

- [ ] **Step 1: Write the failing tests.**

```ts
describe('cellScatter (dune-up-close §4.4)', () => {
  const ctx = scatterContext(); // the synthetic land with tracks, a plant field, surfaceAt = patchSurfaceAt over grids built there
  const all = (fn: (it: ScatterItem) => boolean) => cells(ctx).flatMap(([ci, cj]) => cellScatter(ci, cj, ctx)).filter(fn);
  it('grows spinifex nowhere and tussock-grass only on sand', () => {
    for (const it of all((i) => i.kind === 'tuft_tussock')) expect(sandShare(ctx, it.x, it.z)).toBeGreaterThan(0.5);
  });
  it('grows sword-sedge only in the gully or within 2 m of limestone', () => {
    for (const it of all((i) => i.kind === 'tuft_swordsedge')) expect(ctx.rockNear(it.x, it.z)).toBe(true);
  });
  it('keeps track centres bare beyond one item per 10 m', () => {
    const net = ctx.land.trackNetwork!;
    const onCentre = all((i) => net.nearest(i.x, i.z).d < 0.2);
    expect(onCentre.length).toBeLessThanOrEqual(Math.ceil(trackLengthIn(ctx) / 10));
  });
  it('lays shells only on sand within 60 m of the waterline', () => {
    for (const it of all((i) => i.kind === 'item_shell')) expect(it.x - ctx.land.waterlineAt(it.z)).toBeLessThanOrEqual(60);
  });
  it('sits each item on the ground, sunk 1–2 cm', () => {
    for (const it of all(() => true).slice(0, 400)) {
      const g = ctx.surfaceAt(it.x, it.z);
      expect(g - it.y).toBeGreaterThanOrEqual(0.01 - 1e-6);
      expect(g - it.y).toBeLessThanOrEqual(0.02 + 1e-6);
    }
  });
  it('with plant density 0 keeps the stones and twigs and grows no tufts (Review Focus 2)', () => {
    const z0 = { ...ctx, density: 0 };
    const items = cells(z0).flatMap(([ci, cj]) => cellScatter(ci, cj, z0));
    expect(items.some((i) => i.kind.startsWith('tuft_'))).toBe(false);
    expect(items.some((i) => i.kind === 'item_stone')).toBe(true);
  });
});
```

Write the helpers (`scatterContext`, `cells`, `sandShare`, `trackLengthIn`) at the top of the test file over
`testLand()` (`src/land/testLand.ts`, created in Task 5).

- [ ] **Step 2: Run them.** Expected: FAIL.

- [ ] **Step 3: Implement `cellScatter`.** Candidates are 24 per 4 m² cell, each hashed (x, z, roll). Per candidate:
1. `d` = distance from the waterline, the cover at the point (`coverAt`), the slope from `surfaceAt` ±0.25 m, and
   `worn = wornAt`.
2. Pick the kind by context:

| Context | Kinds (probability per candidate) |
|---|---|
| corridor centre (`worn > 0.95`) | `item_stone` 0.01, `item_twig` 0.01; else nothing |
| corridor shoulder (`0.3 < worn ≤ 0.95`) | `item_twig` 0.25, `item_leaves_*` 0.2 (the nearest crown's kind), `item_stone` 0.05 |
| the clearing | `item_stone` 3–6 per clearing (fixed by hash), nothing else |
| under a crown (`plants(x, z).underCrown`) | `item_leaves_<crownKind>` 0.45, `item_twig` 0.25 |
| heath gap (`cover.heath > 0.5`, not under a crown) | `tuft_clubrush` 0.18 × density, `item_twig` 0.08, `item_stone` 0.03 |
| near limestone (`rockNear`) | `tuft_swordsedge` 0.2 × density, `item_stone` 0.15 |
| sand (`cover.sand + cover.wet > 0.5`) inland of the wet sand | `tuft_tussock` 0.06 × density (only in the foredune band d ≥ dryEnd − 4), `item_shell` 0.04 (d ≤ 60) |

3. `y = surfaceAt(x, z) − (0.01 + 0.01 × hash)`; tilt from the slope; scale = the item's size range by hash.

- [ ] **Step 4: Run.** Run: `npx vitest run src/heath/nearScatter.test.ts`. Expected: PASS (6).

- [ ] **Step 5: Commit.**

```bash
git add src/heath/nearScatter.ts src/heath/nearScatter.test.ts src/land/testLand.ts src/land/tracks.test.ts
git commit -m "feat(heath): the near scatter's placement: tufts and fallen twigs, leaves, shells and stones by what the ground is

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Drawing the scatter

**Files:**
- Create: `src/heath/ScatterMeshes.ts`, `src/heath/scatterMeshes.test.ts`
- Modify: `src/app/App.ts`, `src/heath/heath.selftest.ts`, `src/breaker/BreakingRibbon.limits.test.ts`

**Interfaces:**
- Consumes: `Kit` (items), `cellScatter`, `PlantRing`, `WorkQueue` (Task 7), `bandWeights`-style fade.
- Produces: `class ScatterMeshes { constructor(kit, sky, sunVisibility?); readonly meshes: THREE.InstancedMesh[]; addCell(key, items); removeCell(key); cull(camera); tick(t, wind); setVisible(on) }`.

- [ ] **Step 1: Write the failing test.** `scatterMeshes.test.ts`, with a stub kit:
- adding a cell with 3 tufts and 2 stones sets the counts 3 and 2;
- removing the cell sets them back to 0, and the geometry keeps its attributes.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement.**
- **Meshes:** per-cell slot blocks like Task 7's `PlantMeshes`, one `InstancedMesh` per item variant and LOD (tufts
  L0 ≤ 12 m, L1 12–20 m, dithered across 1.5 m).
- **Material:** the kit material from Task 12 (refactor it into `kitMaterial(kit, sky, opts)` in `KitMeshes.ts`, used
  by both).
- **Culling:** `cull(camera)` hides a mesh only when all its cells are behind the camera, by setting its count to 0.
  Per-instance culling is skipped: the scatter is small and the cost is the per-frame compaction.
- **App:**
  - one ring at `TUFT_RANGE_M` and one at `ITEM_RANGE_M`, sharing the plant ring's work queue with its 2 ms budget;
  - re-seat the cells in the patch square on a recentre;
  - hide everything with the patch.
- **Self-test:** `heath.selftest.ts` gains **"heath: every tuft and ground item draws pixels"**, built the same way as
  Task 12's.
- **Limits:** add the scatter material to the limits test.

- [ ] **Step 4: Run.** Run: `npx tsc --noEmit && npx vitest run src/heath src/breaker/BreakingRibbon.limits.test.ts`.
Expected: PASS. `?selftest=heath`: PASS. Screenshot at the stand spot and in the gully. Expected: club-rush in the
gaps, sword-sedge against the rock, fallen twigs at the track edges, a bare clearing.

- [ ] **Step 5: Commit.**

```bash
git add src/heath src/app/App.ts src/breaker/BreakingRibbon.limits.test.ts
git commit -m "feat(heath): the near scatter drawn: tufts to 20 m, fallen twigs, leaves, shells and stones to 12 m

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Dappled canopy shadows

**Files:**
- Modify: `src/beach/rockShadows.ts` (`ShadowCaster.silhouette?`), `src/heath/plants.ts` (`plantCaster`),
  `src/app/App.ts` (pass the atlas canopy tiles)
- Test: `src/beach/rockShadows.test.ts`

**Interfaces:**
- Consumes: the atlas `canopy_<kind>_<v>` tiles (Task 11), decoded once on load to `Uint8Array` alpha (64²).
- Produces: `ShadowCaster.silhouette?: { alpha: Uint8Array; n: number; yaw: number }`. When present, the sun shadow's
  coverage is the silhouette's alpha sampled along the shadow axis instead of the capsule.

- [ ] **Step 1: Write the failing test.** A caster with a silhouette that is a ring (alpha 0 at the centre) casts a
shadow with a lit hole: the texel behind the centre along the sun is less than 0.3, while the capsule caster's is
greater than 0.8.

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement.** In `buildGroundShadows`, for a caster with `silhouette`:
1. Map each texel back to the canopy plane along the sun: `q = p − (dx, dz) × t`, with `t` the projection, clamped to
   `len`.
2. Rotate by `−yaw`, scale by `radius`, and sample the alpha bilinearly.
3. Shadow = `alpha / 255 × s0 × (1 − smoothstep(0.7 len, len, t))`.

The ring term for a caster with a silhouette becomes the silhouette itself at zero offset (`0.5 × alpha / 255 × s0`).
That is the heath floor darkening under each crown at 0.25 m, which spec §4.3 calls the floor mask sharpened by the
canopy silhouettes. Add a test: a silhouette caster's ring channel at its centre is at least 0.4 and is 0 beyond its
radius. `plantCaster` sets the silhouette for kit plants, and App hands the decoded tiles to `patchCasters`.

- [ ] **Step 4: Run and time.**

Run: `npx vitest run src/beach/rockShadows.test.ts src/heath`
Expected: PASS. In the browser, time `buildGroundShadows` at the stand spot at a 20° sun (console log once). Expected:
≤ 3 ms. If over, cap silhouettes to plants within 8 m and ledger it.

- [ ] **Step 5: Commit.**

```bash
git add src/beach/rockShadows.ts src/beach/rockShadows.test.ts src/heath/plants.ts src/app/App.ts
git commit -m "feat(heath): shrubs drop dappled shade from their own canopy silhouettes on the patch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Far recolour, colour match and no pop

**Files:**
- Modify: `src/heath/PlantMeshes.ts` (`setKindColours` used by App since Task 12; verify the values)
- Modify: `src/heath/heath.selftest.ts`

**Interfaces:**
- Consumes: the manifest's `leafColour`, the `KitMeshes` and `PlantMeshes` materials.
- Produces: two GPU self-tests.

- [ ] **Step 1: Write the failing self-tests.**
- **"heath: each kind's near plant and its far hull match in colour (≤ 0.05 a channel)".** Render variant 0 of each
  kind at L0 alone at 6 m, and its hull alone at 6 m (forcing the band weights to 1 with a test uniform
  `forceBand`). Both are 64² against a black clear, same sky and sun. Take the mean colour of the drawn pixels of each
  and compare.
- **"heath: a plant's coverage changes ≤ 10% across each band boundary".** For each boundary (12 m and 40 m), render
  one daisy at d − 0.5 and d + 0.5 m with all its bands live. Compare coverage normalised by the distance² change.

Add `forceBand` (a `uniform(-1)`; when ≥ 0 it replaces the computed band weight) to both materials.

- [ ] **Step 2: Run them.** `http://localhost:5177/?selftest=heath`. Expected: the colour test FAILs where the hull's
painted albedo still differs (if `setKindColours` isn't applied to the hull material's tint path). The pop test may
pass; record its numbers.

- [ ] **Step 3: Fix.** `setKindColours` writes each kind's `leafColour` × (the kit material's mean AO from the
manifest) into the hull's base albedo. The hull's own leaf-noise brightening (`leaf.mul(0.6).add(0.7)`) averages 1.0,
so the means agree. For any kind still off by more than 0.05, scale its hull albedo by the measured ratio in
`setKindColours` and ledger it.

- [ ] **Step 4: Run.** `?selftest=heath`. Expected: all PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/heath
git commit -m "test(heath): near and far plants match in colour; nothing pops across the 12 m and 40 m bands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Prewarm, loading, disk and the budgets

**Files:**
- Modify: `src/app/App.ts` (the land-arrival prewarm list ~line 526 gains the kit, scatter, footprints and the patch
  with layers)
- Modify: `src/heath/heath.selftest.ts` (timing), `src/heath/kit.test.ts` (disk)

**Interfaces:**
- Consumes: every mesh from Tasks 12, 17, 18 and 22.
- Produces: the budget evidence in the ledger.

- [ ] **Step 1: Write the failing tests.**

```ts
// kit.test.ts
it('keeps public/heath under 30 MB', () => {
  const total = readdirSync('public/heath').reduce((a, f) => a + statSync(join('public/heath', f)).size, 0);
  expect(total).toBeLessThanOrEqual(30 * 1024 * 1024);
});
```

`heath.selftest.ts`, **"heath: the dune up close within its GPU budget"**:
- Load the real land and tracks.
- Stand the camera at each beat camera at the stand spot: Conditions, 3.8 m behind and 2.3 m up; rider, 2.35 m at
  0.95 m; board, 2.1 m at 1.35 m. Then at three beach-path points: the gully (the path's point nearest the rock
  band), the foredune (d = dryEnd + 2) and the beach.
- Render 60 frames each with `trackTimestamp`. Measure the scene with each part hidden in turn (plants, patch,
  scatter, footprints), with the part's cost = the median full frame − the median without it.
- Pass if each part is within §5 and the total is ≤ 2.0 ms. The detail prints every number.

- [ ] **Step 2: Run them.** Run: `npx vitest run src/heath/kit.test.ts`. Then `?selftest=heath` on the RTX (check that
the pane isn't on the iGPU: no iGPU banner). Expected: the disk test PASSes or reports the size; the budget test
prints the numbers. A FAIL here is a finding, not a broken test.

- [ ] **Step 3: Fix what's over.** In this order, re-running after each:
1. lower the L0 caps (`max_leaves`);
2. narrow the L0 band to 10 m;
3. thin the scatter's tuft probabilities;
4. shrink the mask/relief range.

Ledger each change with its before/after ms. Prewarm: add `...kitMeshes.meshes, ...scatter.meshes, footprints.mesh`
to the `shown` list in the land-arrival prewarm. Each already holds non-empty geometry (count 0), so nothing builds
from an empty buffer.

- [ ] **Step 4: Verify the first arrival.** Reload the game in a fresh tab at the stand spot (moment link). Expected:
- no freeze longer than the land's existing arrival (`[prewarm]` console timings within 10% of before; record both);
- no "pipeline" errors in `read_console_messages`;
- the hulls show until the kit loads, then the kit takes over with no pop.

- [ ] **Step 5: Commit.**

```bash
git add src/app/App.ts src/heath
git commit -m "perf(heath): the dune up close within 2 ms GPU at the beat cameras and down the beach path; prewarmed on arrival

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 26: Gate 2, the dune up close: STOP for Andrew

**Files:**
- Create: `docs/superpowers/gallery/dune-up-close/` (committed: game frames only, never reference photos)

- [ ] **Step 1: Capture.** At 1920×1080, with `__shot` from `public/_dev/cap.js`, capture:
- the three beat cameras in the clearing;
- the beach path's gully, foredune and beach;
- the Cape to Cape 20 m either side of the junction;
- each at 08:30, 12:30 and 17:30.

Then the far views from the lineup and from the beach, before (main `ac2a94f`, checked out in a temporary worktree on
port 5178; its node_modules must be junctioned per the worktree note, and removed before `git worktree remove`) and
after. Save the PNGs to the gallery folder with names `<place>-<time>.png` and `far-<place>-<before|after>.png`.

- [ ] **Step 2: Run the whole suite.** Run: `npx tsc --noEmit && npx vitest run`. Expected: all PASS. Then
`?selftest=heath`, `?selftest=beach`, `?selftest=surfer`, `?selftest=land`: all PASS. Record the counts.

- [ ] **Step 3: Show Andrew and STOP.** Send the frames (SendUserFile, a handful: the Conditions shot, the gully, and
the far before and after) and point to the gallery. Ask whether the dune is no longer crude and reads as the pristine
heath of his photos, with the far view no worse. Ledger his verdict. Changes he asks for become new tasks.

- [ ] **Step 4: Commit the gallery.**

```bash
git add docs/superpowers/gallery/dune-up-close
git commit -m "docs(gallery): the dune up close at the beat cameras, down the beach path and along the Cape to Cape (gate 2)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
