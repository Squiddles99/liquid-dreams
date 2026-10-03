# Reef build B (the flow and the kelp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The water under the Womb's waves moves (a flow worked out from the drawn waves), and a short kelp canopy on the
weedy reef leans, streams and springs back in it, seen from the take-off and from underwater.

**Architecture:**
- **The flow:** linear wave theory on the set-wave surface η the game already draws. It's a CPU model in
  `src/breaker/flow.ts` with a TSL mirror in `src/breaker/flowNodes.ts`.
- **The kelp's lean:** a CPU spring in `src/seabed/kelp.ts` (with its TSL mirror in `src/seabed/kelpNodes.ts`), stepped
  on a 128 × 128 toroidal grid of 1 m cells around the camera:
  - `KelpField` (compute) writes the grid.
  - `KelpMap`, owned by `Seabed`, holds the grid's display texture and the sample node.
- **The look:** a canopy layer inside `seabedRadianceNode` (`src/seabed/kelpLook.ts`), so the look-through from above
  and the underwater march both show it.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU/TSL, Vitest 5. GPU checks are browser self-tests
(`?selftest=<filter>`).

**Spec:** `docs/superpowers/specs/2026-10-02-reef-flow-and-kelp-design.md` (approved by Andrew, 2026-10-02).

## Global Constraints

- **Kelp only shows the flow:** no drifting specks, sand puffs or carried bubbles (spec §2).
- **The flow comes from the drawn waves,** u(y) = η · ω · cosh(k(h + y)) / sinh(k·h) along the local ray direction,
  capped at √(g·(h + η)). Exactly zero with no waves (spec §4.1).
- **True to the flow in the lulls:** no added surge (spec §2).
- **Kelp only on weed:** coverage follows build A's weed weight; none on bare rock or sand. Clumped beds about 5 m across
  (spec §4.2).
- **Steady lean** tanh((u / 2.2)²) toward the flow. **Spring:** period 1.5 s, damping ratio 0.45. **Flow read** 0.5 m
  above the bed (spec §4.2).
- **The canopy's mean tone** over a weedy patch is within 20% of `bedLook.WEED_ALBEDO` (spec §4.2).
- **Lean grid:** 128 × 128 cells of 1 m, toroidal, motion fading over its last 8 m. **Ticks:** the foam's 20 Hz. **A
  jump** replays 4 s (spec §4.3).
- **Cost:** at most 1.5 ms of GPU time per frame on the RTX at the take-off during a 12 ft set (spec §3.6).
- **Merge:** the branch is `reef-build-b`. It merges to main only on Andrew's word. Pushing the branch is routine.
- **Gates:** Gate 1 (Task 3) and Gate 2 (Task 8) are stops for Andrew. Show pictures, then wait.
- **Tests:** run with `npx vitest run --maxWorkers=3` (the machine is loaded). `--silent=false` shows a passing test's
  console output.
- **Worktrees:** never junction `node_modules` into a worktree. `ld-kelp` has its own install.

## Review Focus

1. **A teleport** (a moment link to a far spot, or the free camera flying > 128 m in one frame): every cell is new, and
   every cell must start at its steady lean, not jolt from a stale neighbour's state. Pinned in Task 4 (window maths) and
   Task 5 (GPU grid self-test).
2. **No reef field yet** (start-up), or depth ≈ 0 at the waterline: the flow must stay finite (no NaN from sinh(0) or
   √(negative)). Pinned in Task 1.
3. **Level and rising underwater rays** (the march meets reef walls side-on): the canopy's parallax offset must stay
   bounded (≤ 3 m) and finite. Pinned in Task 6.
4. **Kelp switched off** (the dev toggle, for captures and cost): the bed must shade exactly as build A did. Pinned in
   Task 6.
5. **Sim time going backwards or jumping** (scrubbing, a set call): the kelp must replay rather than spring from a stale
   state. Pinned in Task 5 (the schedule's plan on a backwards step) and Task 7 (invalidation wiring).

---

### Task 1: The flow (CPU model)

**Files:**
- Create: `src/breaker/flow.ts`
- Test: `src/breaker/flow.test.ts`

**Interfaces:**
- Consumes: `FieldSample` (`./fieldSample`: k, dirX, dirZ, depth); `sumWaves`, `ActiveWave`, `WaveContext`,
  `BreakOptions` (`./setWaveModel`); `GRAVITY` (`../ocean/spectrum`); `MIN_DEPTH_M` (`./dispersion`).
- Produces:
  - `FLOW_MIN_DEPTH_M: number` (0.05)
  - `flowGain(omega: number, k: number, depth: number, y: number): number`: m/s per m of η.
  - `flowCap(depth: number, eta: number): number`
  - `flowFromEta(eta: number, f: Pick<FieldSample, 'k' | 'dirX' | 'dirZ' | 'depth'>, omega: number, y: number): { ux: number; uz: number }`
  - `flowAt(x: number, z: number, y: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o?: BreakOptions, backgroundEta?: number): { ux: number; uz: number; eta: number }`
  - Here y is the height above still water (−depth at the bed, 0 at the surface), clamped into [−depth, 0].

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaker/flow.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { GRAVITY } from '../ocean/spectrum';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt, flowCap, flowFromEta, flowGain } from './flow';
import { computeReefField, sampleField } from './reefField';
import { breakOptions, toActiveWave } from './setWaveModel';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
const BED_Y = 0.5; // the kelp reads the flow 0.5 m above the bed

/** The near-bed flow along the local ray (+ shoreward) at the peak, every 0.1 s around the biggest wave of set 1. */
function peakSeries(ft: number): { along: number; dt: number }[] {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell = { sizeFt: ft, periodS: 15, directionDeg: 225 };
  c.tideM = 0;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const f = sampleField(field, 0, 0);
  const out: { along: number; dt: number }[] = [];
  for (let dt = -20; dt <= 20; dt += 0.1) {
    const t = big.arrivalS + dt;
    const u = flowAt(0, 0, -f.depth + BED_Y, t, f, wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave), ctx, o);
    out.push({ along: u.ux * f.dirX + u.uz * f.dirZ, dt });
  }
  return out;
}

describe('the flow under the waves (spec §4.1)', () => {
  it('still water: exactly zero', () => {
    const f = sampleField(field, 0, 0);
    expect(flowAt(0, 0, -3, 100, f, [], ctx, o)).toEqual({ ux: 0, uz: 0, eta: 0 });
    expect(flowFromEta(0, f, field.omega, -3)).toEqual({ ux: 0, uz: 0 });
  });
  it('runs along the local ray: shoreward under a crest (η > 0), seaward under a trough (η < 0)', () => {
    const f = sampleField(field, 0, 0);
    const up = flowFromEta(1, f, field.omega, -f.depth), down = flowFromEta(-1, f, field.omega, -f.depth);
    expect(up.ux * f.dirX + up.uz * f.dirZ).toBeGreaterThan(0);
    expect(down.ux * f.dirX + down.uz * f.dirZ).toBeLessThan(0);
    expect(Math.abs(up.ux * f.dirZ - up.uz * f.dirX)).toBeLessThan(1e-9); // no cross-ray part
  });
  it('slower at the bed than at the surface; the shallow-water limit is c·η/h', () => {
    const w = field.omega;
    expect(flowGain(w, 0.05, 10, -10)).toBeLessThan(flowGain(w, 0.05, 10, 0));
    const h = 2, k = 0.01; // kh = 0.02: shallow
    expect(flowGain(w, k, h, -h)).toBeCloseTo(w / (k * h), 2);
  });
  it('capped at √(g·(h + η)), and finite at zero depth or wavenumber (Review Focus 2)', () => {
    expect(flowCap(6, 1)).toBeCloseTo(Math.sqrt(GRAVITY * 7), 9);
    const f = { k: 0.056, dirX: 1, dirZ: 0, depth: 6 };
    expect(flowFromEta(50, f, 0.42, -6).ux).toBeCloseTo(Math.sqrt(GRAVITY * 56), 6);
    for (const g of [{ k: 0, dirX: 1, dirZ: 0, depth: 6 }, { k: 0.05, dirX: 1, dirZ: 0, depth: 0 }, { k: 0, dirX: 1, dirZ: 0, depth: 0 }]) {
      const u = flowFromEta(-0.3, g, 0.42, -1);
      expect(Number.isFinite(u.ux) && Number.isFinite(u.uz)).toBe(true);
    }
  });
  it('the background swell adds its own flow (deep water, where the FFT long swell runs)', () => {
    const f = sampleField(field, -300, 0);
    const u = flowAt(-300, 0, -f.depth + BED_Y, 100, f, [], ctx, o, 0.8);
    expect(u.eta).toBeCloseTo(0.8, 9);
    expect(u.ux * f.dirX + u.uz * f.dirZ).toBeGreaterThan(0);
  });
  it('12 ft at the peak: the draw runs 3–8 m/s seaward before the crest, then shoreward under it', () => {
    const s = peakSeries(12);
    const draw = s.reduce((a, b) => (b.along < a.along ? b : a));
    const shove = s.reduce((a, b) => (b.along > a.along ? b : a));
    expect(-draw.along).toBeGreaterThanOrEqual(3);
    expect(-draw.along).toBeLessThanOrEqual(8);
    expect(shove.along).toBeGreaterThan(-draw.along * 0.8);
  });
  it('4 ft at the peak: the draw runs 1–2.5 m/s seaward', () => {
    const s = peakSeries(4);
    const draw = Math.min(...s.map((p) => p.along));
    expect(-draw).toBeGreaterThanOrEqual(1);
    expect(-draw).toBeLessThanOrEqual(2.5);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/breaker/flow.test.ts`
Expected: FAIL. The module `./flow` doesn't exist ("Failed to resolve import").

- [ ] **Step 3: Write the implementation**

```ts
// src/breaker/flow.ts
import { GRAVITY } from '../ocean/spectrum';
import type { FieldSample } from './fieldSample';
import { type ActiveWave, type BreakOptions, type WaveContext, sumWaves } from './setWaveModel';

/**
 * The water's flow under the waves (spec 2026-10-02-reef-flow-and-kelp-design.md §4.1): linear wave theory on the
 * surface the game draws. Under a wave the water moves along the wave's travel with u(y) = η·ω·cosh(k(h + y))/sinh(kh):
 * shoreward under a crest, seaward under a trough (the draw toward a wave standing up, whose trough build A drains), and
 * c·η/h in shallow water. Capped at the shallow-water wave speed √(g(h + η)). Exactly zero with no waves.
 */

/** The depth and the water column floored here (m), so the gain and the cap stay finite at the waterline. */
export const FLOW_MIN_DEPTH_M = 0.05;
/** kh floored here: sinh(kh) → 0 with no field (k = 0) or no water. */
const MIN_KH = 1e-3;

/** m/s of flow per metre of η at height y above still water (−h at the bed, 0 at the surface). */
export function flowGain(omega: number, k: number, depth: number, y: number): number {
  const h = Math.max(depth, FLOW_MIN_DEPTH_M);
  const kh = Math.max(k * h, MIN_KH), kk = kh / h;
  const yc = Math.min(0, Math.max(-h, y));
  return (omega * Math.cosh(kk * (h + yc))) / Math.sinh(kh);
}

/** The fastest the water can run: the shallow-water wave speed over the water column h + η. */
export function flowCap(depth: number, eta: number): number {
  return Math.sqrt(GRAVITY * Math.max(depth + eta, FLOW_MIN_DEPTH_M));
}

/** The flow (m/s, world xz) for a surface height η over a field sample, at height y. */
export function flowFromEta(eta: number, f: Pick<FieldSample, 'k' | 'dirX' | 'dirZ' | 'depth'>, omega: number, y: number): { ux: number; uz: number } {
  if (eta === 0) return { ux: 0, uz: 0 };
  const cap = flowCap(f.depth, eta);
  const u = Math.max(-cap, Math.min(cap, eta * flowGain(omega, f.k, f.depth, y)));
  return { ux: u * f.dirX, uz: u * f.dirZ };
}

/**
 * The flow at (x, z), height y, time t: the set waves' surface (sumWaves, breaking included) plus `backgroundEta` (the FFT
 * long swell's height where it runs; the CPU model has no FFT, so the caller passes it), along the local ray.
 */
export function flowAt(x: number, z: number, y: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o?: BreakOptions, backgroundEta = 0): { ux: number; uz: number; eta: number } {
  const eta = (waves.length ? sumWaves(x, z, t, f, waves, ctx, o).eta : 0) + backgroundEta;
  return { ...flowFromEta(eta, f, ctx.omega, y), eta };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/breaker/flow.test.ts --silent=false`
Expected: PASS, 7/7. Planning measured these at the peak, near the bed: 12 ft draw 4.7 m/s, shove 8.3 m/s; 4 ft draw
1.7 m/s.
- **If a band misses:** don't widen it silently. Ledger a ruling with the measured value and Andrew's spec band.

- [ ] **Step 5: Commit**

```bash
git add src/breaker/flow.ts src/breaker/flow.test.ts
git commit -m "feat(flow): the water's flow under the waves, from the drawn surface (linear theory, capped)"
```

---

### Task 2: The flow on the GPU (TSL mirror and self-test)

**Files:**
- Create: `src/breaker/flowNodes.ts`, `src/breaker/flow.selftest.ts`
- Modify: `src/breaker/SetWaves.ts` (a public `omega` getter next to `meanOmega`, line ~86), `src/dev/selfTests.ts`
  (one import)

**Interfaces:**
- Consumes:
  - Task 1's `FLOW_MIN_DEPTH_M`, `flowFromEta`, `flowAt`.
  - `SetWaves.sample(xz, hoist)` → `{ k, dir, depth, … }` and `SetWaves.displacementNode(xz)` → vec3(dx, η, dz).
  - `WaterSurfaceModel.fftCascadeDisplacement(xz, 0, lod)`: the long swell, with its shallow-water weight.
- Produces:
  - `flowFromEtaNode(eta: N, k: N, depth: N, dir: N /* vec2 */, omega: N, y: N): N /* vec2 m/s */`
  - `class ReefFlow { constructor(sets: SetWaves, background?: (xz: N) => N /* η */); flowNode(xz: N, heightAboveBed: number | N): N /* vec2 */ }`
    (compute-safe).
  - `SetWaves.omega: N` (the field's mean ω uniform).

- [ ] **Step 1: Add the `omega` getter to SetWaves**

In `src/breaker/SetWaves.ts`, after the line `private readonly meanOmega = uniform(1);` add:

```ts
  /** The field's mean angular frequency (rad/s): the flow's ω (flowNodes.ReefFlow). */
  get omega(): N {
    return this.meanOmega;
  }
```

- [ ] **Step 2: Write the TSL mirror**

```ts
// src/breaker/flowNodes.ts
import { clamp, cosh, float, max, min, sinh, sqrt, vec2 } from 'three/tsl';
import { GRAVITY } from '../ocean/spectrum';
import { FLOW_MIN_DEPTH_M } from './flow';
import type { SetWaves } from './SetWaves';

type N = any;

/** TSL mirror of flow.flowFromEta: vec2 (m/s, world xz) for η over depth h at height y, along `dir`. */
export function flowFromEtaNode(eta: N, k: N, depth: N, dir: N, omega: N, y: N): N {
  const h = max(depth, FLOW_MIN_DEPTH_M);
  const kh = max(k.mul(h), 1e-3), kk = kh.div(h);
  const yc = clamp(y, h.negate(), 0.0);
  const gain = omega.mul(cosh(kk.mul(h.add(yc)))).div(sinh(kh));
  const cap = sqrt(max(depth.add(eta), FLOW_MIN_DEPTH_M).mul(GRAVITY));
  const u = clamp(eta.mul(gain), cap.negate(), cap);
  return vec2(dir.x.mul(u), dir.y.mul(u));
}

/**
 * The flow at world xz, `heightAboveBed` metres over the still-water bed (flow.flowAt on the GPU): the set waves' surface
 * (the probe's displacementNode, breaking included) plus the background swell's η where it runs. Compute-safe.
 */
export class ReefFlow {
  constructor(private readonly sets: SetWaves, private readonly background?: (xz: N) => N) {}

  flowNode(xz: N, heightAboveBed: number | N): N {
    const s = this.sets.sample(xz, true);
    const eta = this.sets.displacementNode(xz).y.add(this.background ? this.background(xz) : float(0.0));
    const y = s.depth.negate().add(heightAboveBed);
    return flowFromEtaNode(eta, s.k, s.depth, s.dir, this.sets.omega, min(y, 0.0));
  }
}
```

- [ ] **Step 3: Write the self-test**

The self-test has two checks:
1. **The mirror:** over a table of η, k, depth and y, the TSL formula matches `flowFromEta`.
2. **The full path:** with breaking off, the GPU flow at reef points matches `flowAt` on the CPU. The set-wave η
   already agrees to 0.02 m (the breaker self-test), and the gain over the reef is about 1.3 /s, so 0.05 m/s.

```ts
// src/breaker/flow.selftest.ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec4 } from 'three/tsl';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt, flowFromEta } from './flow';
import { ReefFlow, flowFromEtaNode } from './flowNodes';
import { computeReefField, sampleField } from './reefField';
import { SetWaves } from './SetWaves';
import { toActiveWave } from './setWaveModel';

const field = () => computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });

async function run4(renderer: THREE.WebGPURenderer, rows: number[][], body: (q: any) => any): Promise<Float32Array> {
  const n = rows.length;
  const inAttr = new THREE.StorageBufferAttribute(new Float32Array(rows.flat()), 4);
  const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
  const input = storage(inAttr, 'vec4', n).toReadOnly();
  const output = storage(outAttr, 'vec4', n);
  renderer.compute(Fn(() => { output.element(instanceIndex).assign(body(input.element(instanceIndex))); })().compute(n) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(outAttr));
}

registerSelfTest({
  name: 'flow: the GPU formula matches flow.flowFromEta (η, k, depth, height, the cap, zero depth)',
  async run(renderer) {
    const omega = (2 * Math.PI) / 15;
    const rows: number[][] = [];
    for (const eta of [-4, -1.3, 0, 0.7, 6, 50]) for (const k of [0, 0.038, 0.056]) for (const depth of [0, 2, 6, 13]) for (const yf of [0, 0.5, 1]) rows.push([eta, k, depth, -depth * yf]);
    const out = await run4(renderer, rows, (q) => vec4(flowFromEtaNode(q.x, q.y, q.z, vec4(0.6, 0.8, 0, 0).xy, uniform(omega), q.w), 0.0, 0.0));
    let worst = 0;
    rows.forEach(([eta, k, depth, y], i) => {
      const c = flowFromEta(eta, { k, depth, dirX: 0.6, dirZ: 0.8 }, omega, y);
      worst = Math.max(worst, Math.abs(out[i * 4] - c.ux), Math.abs(out[i * 4 + 1] - c.uz));
    });
    return { pass: worst < 0.01, detail: `${rows.length} cases; worst ${worst.toExponential(2)} m/s` };
  },
});

registerSelfTest({
  name: 'flow: the GPU flow at the reef matches the CPU model (breaking off, ±0.05 m/s)',
  async run(renderer) {
    const f = field();
    const t = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS)[2].arrivalS;
    const events = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const sets = new SetWaves(uniform(t));
    sets.setField(f);
    sets.setEvents(events);
    sets.setBreakParams({ ...DEFAULT_BREAK_PARAMS, enabled: false });
    const flow = new ReefFlow(sets);
    const pts = [[0, 0], [-20, 30], [-30, -60], [25, 28], [50, -110], [-120, 10], [-5, -1]];
    const out = await run4(renderer, pts.map(([x, z]) => [x, z, 0, 0]), (q) => vec4(flow.flowNode(q.xy, 0.5), 0.0, 0.0));
    const ctx = { omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ };
    const waves = events.map(toActiveWave);
    let worst = 0;
    const notes: string[] = [];
    pts.forEach(([x, z], i) => {
      const s = sampleField(f, x, z);
      const c = flowAt(x, z, -s.depth + 0.5, t, s, waves, ctx);
      worst = Math.max(worst, Math.hypot(out[i * 4] - c.ux, out[i * 4 + 1] - c.uz));
      notes.push(`(${x},${z}) ${out[i * 4].toFixed(2)},${out[i * 4 + 1].toFixed(2)} / ${c.ux.toFixed(2)},${c.uz.toFixed(2)}`);
    });
    return { pass: worst < 0.05, detail: `worst ${worst.toFixed(4)} m/s; ${notes.join('; ')}` };
  },
});
```

Register it: in `src/dev/selfTests.ts`, after `import '../breaker/ribbon.selftest';` add
`import '../breaker/flow.selftest';`.

- [ ] **Step 4: Typecheck, then run the GPU self-tests**

Run: `npx tsc --noEmit -p .`
Expected: no output.

Run the flow self-tests in the browser:
- Add an `ld-kelp` entry to the main checkout's `.claude/launch.json` (uncommitted, port 5183):
  `npm --prefix ../ld-kelp run dev -- --port 5183 --strictPort`.
- Start it (preview_start `ld-kelp`) and open `http://localhost:5183/?selftest=flow`.
- Read the console (`[selftest]` lines).
- Or run build A's Electron self-test runner (the session scratchpad's `selftest-runner.mjs`):
  `npx electron <runner> --url=http://localhost:5183/?selftest=flow --out=<file>`.

Expected: `[selftest] SUMMARY 2/2 passed`.

- [ ] **Step 5: Run the breaker self-tests (nothing else moved)**

Open `http://localhost:5183/?selftest=breaker`.
Expected: every breaker test passes, as on main.

- [ ] **Step 6: Commit**

```bash
git add src/breaker/flowNodes.ts src/breaker/flow.selftest.ts src/breaker/SetWaves.ts src/dev/selfTests.ts
git commit -m "feat(flow): the flow on the GPU (TSL mirror, ReefFlow) and its self-tests"
```

---

### Task 3: Gate 1, the flow drawn (STOP for Andrew)

**Files:**
- Create: `src/breaker/flowDrawing.test.ts`. It only runs with `LD_DRAW=1`. It writes HTML/SVG to
  `.superpowers/drawings/reef-flow/` (git-ignored).

**Interfaces:**
- Consumes: Task 1's `flowAt`, plus `sampleField`, `wavesOfSet`, `wavesNear`, `breakOptions` and `toActiveWave`.
- Produces: the drawings for Andrew. No code later tasks use.

- [ ] **Step 1: Write the drawing generator**

```ts
// src/breaker/flowDrawing.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt } from './flow';
import { computeReefField, sampleField } from './reefField';
import { breakOptions, sumWaves, toActiveWave } from './setWaveModel';

const OUT = '.superpowers/drawings/reef-flow';
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const o = breakOptions(field, DEFAULT_BREAK_PARAMS);

function setFor(ft: number) {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell = { sizeFt: ft, periodS: 15, directionDeg: 225 };
  c.tideM = 0;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  return { c, big };
}

/** Plan view, 120 m around the peak: arrows 0.5 m above the bed every 6 m (red seaward, blue shoreward, 1 m/s = 4 m). */
function planView(ft: number, dt: number): string {
  const { c, big } = setFor(ft), t = big.arrivalS + dt;
  const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
  const S = 4, R = 60; // px per m, half-width m
  let body = '';
  for (let x = -R; x <= R; x += 2) for (let z = -R; z <= R; z += 2) {
    const f = sampleField(field, x, z), eta = sumWaves(x, z, t, f, waves, ctx, o).eta;
    const v = Math.max(0, Math.min(255, 128 + eta * 40));
    body += `<rect x="${(x + R) * S}" y="${(z + R) * S}" width="${2 * S}" height="${2 * S}" fill="rgb(${v},${v},${v})"/>`;
  }
  for (let x = -R; x <= R; x += 6) for (let z = -R; z <= R; z += 6) {
    const f = sampleField(field, x, z), u = flowAt(x, z, -f.depth + 0.5, t, f, waves, ctx, o);
    const along = u.ux * f.dirX + u.uz * f.dirZ, col = along < 0 ? '#d22' : '#22d';
    const x0 = (x + R) * S, z0 = (z + R) * S;
    body += `<line x1="${x0}" y1="${z0}" x2="${x0 + u.ux * 4 * S}" y2="${z0 + u.uz * 4 * S}" stroke="${col}" stroke-width="2"/><circle cx="${x0}" cy="${z0}" r="1.5" fill="${col}"/>`;
  }
  const W = 2 * R * S + 2 * S;
  return `<figure><figcaption>${ft} ft, ${dt >= 0 ? '+' : ''}${dt} s from the biggest wave reaching the peak (grey: surface height; arrows: near-bed flow)</figcaption><svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${body}<circle cx="${R * S}" cy="${R * S}" r="5" fill="none" stroke="#0a0"/></svg></figure>`;
}

/** Slice along the ray through the peak, 80 m seaward to 40 m inshore: surface, bed, and flow arrows at 3 heights. */
function slice(ft: number, dt: number): string {
  const { c, big } = setFor(ft), t = big.arrivalS + dt;
  const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
  const f0 = sampleField(field, 0, 0), SX = 6, SY = 20, Y0 = 200, W = 120 * SX;
  let surf = '', bed = '', arrows = '';
  for (let s = -80; s <= 40; s += 1) {
    const x = s * f0.dirX, z = s * f0.dirZ, f = sampleField(field, x, z), eta = sumWaves(x, z, t, f, waves, ctx, o).eta;
    const px = (s + 80) * SX;
    surf += `${px},${Y0 - eta * SY} `;
    bed += `${px},${Y0 + f.depth * SY} `;
    if (s % 5 === 0) for (const frac of [0.08, 0.5, 0.95]) {
      const y = -f.depth * frac, u = flowAt(x, z, y, t, f, waves, ctx, o), along = u.ux * f.dirX + u.uz * f.dirZ;
      const py = Y0 - y * SY;
      arrows += `<line x1="${px}" y1="${py}" x2="${px + along * 4 * SX}" y2="${py}" stroke="${along < 0 ? '#d22' : '#22d'}" stroke-width="2"/>`;
    }
  }
  return `<figure><figcaption>${ft} ft, ${dt >= 0 ? '+' : ''}${dt} s: slice along the ray through the peak (seaward left; ×${SY / SX} vertical)</figcaption><svg width="${W}" height="${Y0 + 16 * SY}"><polyline points="${surf}" fill="none" stroke="#06c" stroke-width="2"/><polyline points="${bed}" fill="none" stroke="#753" stroke-width="2"/>${arrows}<line x1="${80 * SX}" y1="0" x2="${80 * SX}" y2="${Y0 + 16 * SY}" stroke="#0a0" stroke-dasharray="4"/></svg></figure>`;
}

describe.runIf(process.env.LD_DRAW === '1')('Gate 1 drawings', () => {
  it('writes the flow drawings', () => {
    mkdirSync(OUT, { recursive: true });
    for (const ft of [4, 12]) {
      const figs = [-8, -3, 0, 3].map((dt) => planView(ft, dt) + slice(ft, dt)).join('');
      writeFileSync(`${OUT}/flow-${ft}ft.html`, `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif}figure{display:inline-block;margin:8px}</style>${figs}`);
    }
  }, 600000);
});
```

- [ ] **Step 2: Generate them**

Run (PowerShell): `$env:LD_DRAW='1'; npx vitest run src/breaker/flowDrawing.test.ts; Remove-Item Env:LD_DRAW`
Expected: `.superpowers/drawings/reef-flow/flow-4ft.html` and `flow-12ft.html` exist.
- **Without LD_DRAW:** the suite skips the file.

- [ ] **Step 3: Check them, and render them for Andrew**

- **Open and check:** open each HTML in the browser pane (a `file://` URL). Check that:
  - before the crest reaches the peak the near-bed arrows point seaward (red);
  - under the crest they point shoreward (blue);
  - the bed arrows are shorter than the surface arrows.
- **Render:** screenshot each figure group to PNG and send the PNGs to Andrew (SendUserFile).
- **Explain:** in plain words, cover what the arrows and the slice show, and the measured draw and shove at the peak for
  4 and 12 ft.

- [ ] **Step 4: Commit and push**

```bash
git add src/breaker/flowDrawing.test.ts
git commit -m "test(flow): Gate 1's drawings of the flow (LD_DRAW=1)"
git push
```

- [ ] **Step 5: STOP. Wait for Andrew's word on the flow before Task 4.** Ledger his answer.

---

### Task 4: The kelp's lean (CPU model)

**Files:**
- Create: `src/seabed/kelp.ts`
- Test: `src/seabed/kelp.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure maths).
- Produces:
  - **Constants:**
    - `KELP_FLAT_MS = 2.2`, `KELP_PERIOD_S = 1.5`, `KELP_DAMPING = 0.45`, `KELP_MAX_RATE = 20`, `KELP_HEIGHT_M = 0.8`,
      `KELP_FLATTEN = 0.8`, `KELP_FLOW_Y_M = 0.5`.
    - Grid: `KELP_GRID_N = 128`, `KELP_CELL_M = 1`, `KELP_FADE_M = 8`, `KELP_REPLAY_S = 4`.
  - `interface KelpState { lx: number; lz: number; vx: number; vz: number }`
  - `kelpSteadyLean(ux: number, uz: number): [number, number]`
  - `kelpStep(s: KelpState, ux: number, uz: number, dt: number): KelpState`
  - `kelpCanopyHeight(lean: number): number`
  - **The window:**
    - `kelpWindowMin(camX: number, camZ: number): [number, number]`: the min world cell indices.
    - `kelpSlot(wx: number, wz: number): number`
    - `kelpCellOfSlot(slot: number, minX: number, minZ: number): [number, number]`
    - `kelpInWindow(wx: number, wz: number, minX: number, minZ: number): boolean`
    - `kelpWindowFade(x: number, z: number, minX: number, minZ: number): number`

- [ ] **Step 1: Write the failing tests**

```ts
// src/seabed/kelp.test.ts
import { describe, expect, it } from 'vitest';
import {
  KELP_CELL_M, KELP_FADE_M, KELP_GRID_N, type KelpState, kelpCanopyHeight, kelpCellOfSlot, kelpInWindow, kelpSlot, kelpSteadyLean,
  kelpStep, kelpWindowFade, kelpWindowMin, KELP_HEIGHT_M,
} from './kelp';

const DT = 0.05; // the foam's 20 Hz tick
const rest: KelpState = { lx: 0, lz: 0, vx: 0, vz: 0 };

describe('the kelp\'s steady lean (spec §4.2)', () => {
  it('a quarter of flat or less at 1 m/s, over 0.9 at 3 m/s, never above 1, toward the flow', () => {
    expect(Math.hypot(...kelpSteadyLean(1, 0))).toBeLessThanOrEqual(0.25);
    expect(Math.hypot(...kelpSteadyLean(0, -3))).toBeGreaterThan(0.9);
    expect(Math.hypot(...kelpSteadyLean(40, 30))).toBeLessThanOrEqual(1);
    const [lx, lz] = kelpSteadyLean(-1.2, 1.6);
    expect(lx).toBeLessThan(0);
    expect(lz).toBeGreaterThan(0);
    expect(lx / lz).toBeCloseTo(-1.2 / 1.6, 6);
    expect(kelpSteadyLean(0, 0)).toEqual([0, 0]);
  });
});

describe('the kelp\'s spring', () => {
  const response = (u: number, seconds: number): number[] => {
    let s = rest;
    const out: number[] = [];
    for (let i = 0; i < seconds / DT; i++) { s = kelpStep(s, u, 0, DT); out.push(s.lx); }
    return out;
  };
  it('lags the flow, overshoots once by 15–25%, and settles within 2% by 6 s', () => {
    const target = kelpSteadyLean(1.6, 0)[0];
    const r = response(1.6, 10);
    expect(r[Math.round(0.2 / DT) - 1]).toBeLessThan(0.5 * target); // lag
    const peak = Math.max(...r);
    expect(peak / target - 1).toBeGreaterThanOrEqual(0.15);
    expect(peak / target - 1).toBeLessThanOrEqual(0.25);
    expect(Math.abs(r[Math.round(6 / DT) - 1] / target - 1)).toBeLessThan(0.02);
  });
  it('stays finite and within flat at extreme speeds and steps', () => {
    for (const dt of [DT, 0.2, 0.5]) {
      let s = rest;
      for (let i = 0; i < 200; i++) {
        s = kelpStep(s, 40 * Math.sin(i), -25, dt);
        expect(Number.isFinite(s.lx + s.lz + s.vx + s.vz)).toBe(true);
        expect(Math.hypot(s.lx, s.lz)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it('the canopy lies lower as it leans', () => {
    expect(kelpCanopyHeight(0)).toBeCloseTo(KELP_HEIGHT_M, 9);
    expect(kelpCanopyHeight(1)).toBeCloseTo(KELP_HEIGHT_M * 0.2, 9);
  });
});

describe('the lean grid around the camera (spec §4.3)', () => {
  it('is centred on the camera, anchored to world cells', () => {
    const [mx, mz] = kelpWindowMin(10.7, -3.2);
    expect(mx).toBe(Math.floor(10.7 / KELP_CELL_M) - KELP_GRID_N / 2);
    expect(mz).toBe(Math.floor(-3.2 / KELP_CELL_M) - KELP_GRID_N / 2);
  });
  it('a world cell keeps its slot as the window moves; each slot is one cell of the window', () => {
    const a = kelpWindowMin(0, 0), b = kelpWindowMin(37, -21);
    expect(kelpSlot(5, -9)).toBe(kelpSlot(5, -9));
    for (const slot of [0, 1, 127, 128, 16383, 9000]) {
      const [wx, wz] = kelpCellOfSlot(slot, b[0], b[1]);
      expect(kelpSlot(wx, wz)).toBe(slot);
      expect(kelpInWindow(wx, wz, b[0], b[1])).toBe(true);
    }
    // A cell in both windows is the same slot in both: its state carries over.
    const [wx, wz] = kelpCellOfSlot(4242, a[0], a[1]);
    if (kelpInWindow(wx, wz, b[0], b[1])) expect(kelpCellOfSlot(kelpSlot(wx, wz), b[0], b[1])).toEqual([wx, wz]);
  });
  it('a teleport makes every cell new (Review Focus 1)', () => {
    const a = kelpWindowMin(0, 0), b = kelpWindowMin(5000, -3000);
    for (const slot of [0, 77, 8191, 16383]) {
      const [wx, wz] = kelpCellOfSlot(slot, b[0], b[1]);
      expect(kelpInWindow(wx, wz, a[0], a[1])).toBe(false);
    }
  });
  it('the motion fades over the last 8 m and is zero outside', () => {
    const [mx, mz] = kelpWindowMin(0, 0);
    expect(kelpWindowFade(0, 0, mx, mz)).toBe(1);
    expect(kelpWindowFade(mx * KELP_CELL_M + KELP_FADE_M / 2, 0, mx, mz)).toBeCloseTo(0.5, 1);
    expect(kelpWindowFade(mx * KELP_CELL_M - 3, 0, mx, mz)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/seabed/kelp.test.ts`
Expected: FAIL. `./kelp` doesn't exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/seabed/kelp.ts
import { smoothstep } from '../math/smoothstep';

/**
 * The kelp's lean (spec 2026-10-02-reef-flow-and-kelp-design.md §4.2–4.3). The lean is a vector in xz: its direction
 * is where the fronds stream, its length how far over the kelp lies (0 upright, 1 flat). It follows a steady lean set by
 * the flow 0.5 m above the bed, through a damped spring, on a toroidal grid of world cells around the camera.
 */

/** Flow speed (m/s) setting the steady lean: tanh((u / KELP_FLAT_MS)²) of flat, toward the flow. */
export const KELP_FLAT_MS = 2.2;
/** The spring: natural period (s) and damping ratio (overshoot ≈ 20%). */
export const KELP_PERIOD_S = 1.5;
export const KELP_DAMPING = 0.45;
/** The lean's rate (1/s) is clamped here: finite at any step. */
export const KELP_MAX_RATE = 20;
/** The canopy's standing height (m), and how much of it a flat lean takes away. */
export const KELP_HEIGHT_M = 0.8;
export const KELP_FLATTEN = 0.8;
/** The kelp reads the flow this far above the bed (m). */
export const KELP_FLOW_Y_M = 0.5;
/** The lean grid: KELP_GRID_N × KELP_GRID_N world cells of KELP_CELL_M m centred on the camera, motion fading over its last KELP_FADE_M. */
export const KELP_GRID_N = 128;
export const KELP_CELL_M = 1;
export const KELP_FADE_M = 8;
/** A jump in sim time replays this much (s): the spring's lag is right when the picture appears. */
export const KELP_REPLAY_S = 4;

export interface KelpState {
  lx: number;
  lz: number;
  vx: number;
  vz: number;
}

export function kelpSteadyLean(ux: number, uz: number): [number, number] {
  const u = Math.hypot(ux, uz);
  if (!(u > 1e-9)) return [0, 0];
  const lean = Math.tanh((u / KELP_FLAT_MS) ** 2);
  return [(ux / u) * lean, (uz / u) * lean];
}

const W0 = (2 * Math.PI) / KELP_PERIOD_S;

/** One semi-implicit Euler step of the spring toward the steady lean for flow (ux, uz); the lean stays within flat. */
export function kelpStep(s: KelpState, ux: number, uz: number, dt: number): KelpState {
  const [tx, tz] = kelpSteadyLean(ux, uz);
  let vx = s.vx + dt * (W0 * W0 * (tx - s.lx) - 2 * KELP_DAMPING * W0 * s.vx);
  let vz = s.vz + dt * (W0 * W0 * (tz - s.lz) - 2 * KELP_DAMPING * W0 * s.vz);
  const rate = Math.hypot(vx, vz);
  if (rate > KELP_MAX_RATE) { vx *= KELP_MAX_RATE / rate; vz *= KELP_MAX_RATE / rate; }
  let lx = s.lx + dt * vx, lz = s.lz + dt * vz;
  const l = Math.hypot(lx, lz);
  if (l > 1) {
    lx /= l; lz /= l;
    const out = vx * lx + vz * lz; // no speed further over than flat
    if (out > 0) { vx -= out * lx; vz -= out * lz; }
  }
  return { lx, lz, vx, vz };
}

export function kelpCanopyHeight(lean: number): number {
  return KELP_HEIGHT_M * (1 - KELP_FLATTEN * Math.min(1, Math.max(0, lean)));
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function kelpWindowMin(camX: number, camZ: number): [number, number] {
  return [Math.floor(camX / KELP_CELL_M) - KELP_GRID_N / 2, Math.floor(camZ / KELP_CELL_M) - KELP_GRID_N / 2];
}

export function kelpSlot(wx: number, wz: number): number {
  return mod(wx, KELP_GRID_N) + KELP_GRID_N * mod(wz, KELP_GRID_N);
}

/** The world cell slot `slot` holds in the window starting at (minX, minZ). */
export function kelpCellOfSlot(slot: number, minX: number, minZ: number): [number, number] {
  const sx = slot % KELP_GRID_N, sz = Math.floor(slot / KELP_GRID_N);
  return [minX + mod(sx - minX, KELP_GRID_N), minZ + mod(sz - minZ, KELP_GRID_N)];
}

export function kelpInWindow(wx: number, wz: number, minX: number, minZ: number): boolean {
  return wx >= minX && wx < minX + KELP_GRID_N && wz >= minZ && wz < minZ + KELP_GRID_N;
}

/** The lean's weight at world (x, z): 1 inside, fading to 0 over the window's last KELP_FADE_M, 0 outside. */
export function kelpWindowFade(x: number, z: number, minX: number, minZ: number): number {
  const x0 = minX * KELP_CELL_M, z0 = minZ * KELP_CELL_M, size = KELP_GRID_N * KELP_CELL_M;
  const edge = Math.min(x - x0, x0 + size - x, z - z0, z0 + size - z);
  return smoothstep(0, KELP_FADE_M, edge);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/seabed/kelp.test.ts`
Expected: PASS, 8/8.
- **If the overshoot lands outside 15–25%:** the Euler step's damping shifts it a little. Ledger the measured value;
  don't change ζ without a ruling.

- [ ] **Step 5: Commit**

```bash
git add src/seabed/kelp.ts src/seabed/kelp.test.ts
git commit -m "feat(kelp): the kelp's lean: steady lean from the flow, the spring, the toroidal grid's maths"
```

---

### Task 5: The lean grid on the GPU (KelpMap, KelpField, self-test)

**Files:**
- Create: `src/seabed/kelpNodes.ts`, `src/seabed/KelpMap.ts`, `src/seabed/KelpField.ts`, `src/seabed/kelp.selftest.ts`
- Modify:
  - `src/seabed/Seabed.ts`: add `readonly kelp = new KelpMap();` as the first field in the class.
  - `src/dev/selfTests.ts`: one import.

**Interfaces:**
- Consumes:
  - Task 4's constants, `kelpStep`, `kelpSteadyLean`, `kelpWindowMin`, `kelpWindowFade`.
  - Task 2's `ReefFlow.flowNode(xz, heightAboveBed)`.
  - `FoamSchedule`, `tickTime`, `tickIndex`, `FOAM_TICK_S` from `../whitewater/foamStep`.
- Produces:
  - `kelpSteadyLeanNode(u: N): N` (vec2) and `kelpStepNode(state: N /* vec4 lean.xy vel.xy */, u: N /* vec2 */, dt: N): N /* vec4 */`.
  - `class KelpMap`:
    - `readonly texture: THREE.StorageTexture`: rgba = cur.xy, prev.xy.
    - `readonly windowMin: N` (vec2 uniform, cells), `readonly alpha: N`, `readonly on: N` (motion 0/1),
      `readonly show: N` (canopy 0/1), `readonly time: N`.
    - `leanNode(xz: N): N`: vec2, interpolated, faded, 0 outside or when `on` = 0.
    - `setWindow(minX: number, minZ: number): void`
  - `class KelpField`:
    - `constructor(map: KelpMap, flow: ReefFlow)`
    - `invalidate(): void`
    - `advance(renderer, simTime: number, camX: number, camZ: number, prepare: (t: number) => void): number` returns the
      ticks run.
    - `setEnabled(on: boolean): void`

- [ ] **Step 1: Write the TSL mirror of the spring**

```ts
// src/seabed/kelpNodes.ts
import { dot, float, length, max, min, select, tanh, vec2, vec4 } from 'three/tsl';
import { KELP_DAMPING, KELP_FLAT_MS, KELP_MAX_RATE, KELP_PERIOD_S } from './kelp';

type N = any;
const W0 = (2 * Math.PI) / KELP_PERIOD_S;

/** TSL mirror of kelp.kelpSteadyLean. */
export function kelpSteadyLeanNode(u: N): N {
  const s = length(u);
  const r = s.div(KELP_FLAT_MS);
  return select(s.greaterThan(1e-9), u.div(max(s, 1e-9)).mul(tanh(r.mul(r))), vec2(0.0));
}

/** TSL mirror of kelp.kelpStep: vec4(lean.xy, vel.xy) one step of dt toward the steady lean for flow u (vec2). */
export function kelpStepNode(state: N, u: N, dt: N): N {
  const target = kelpSteadyLeanNode(u);
  const v0 = state.zw.add(target.sub(state.xy).mul(W0 * W0).sub(state.zw.mul(2 * KELP_DAMPING * W0)).mul(dt));
  const rate = length(v0);
  const v1 = v0.mul(min(float(1.0), float(KELP_MAX_RATE).div(max(rate, 1e-9))));
  const l0 = state.xy.add(v1.mul(dt));
  const ll = length(l0);
  const over = ll.greaterThan(1.0);
  const l1 = select(over, l0.div(max(ll, 1e-9)), l0);
  const out = max(dot(v1, l1), 0.0);
  const v2 = select(over, v1.sub(l1.mul(out)), v1);
  return vec4(l1, v2);
}
```

- [ ] **Step 2: Write KelpMap (the display grid, owned by Seabed)**

```ts
// src/seabed/KelpMap.ts
import * as THREE from 'three/webgpu';
import { clamp, float, min, mix, smoothstep, texture, uniform } from 'three/tsl';
import { KELP_CELL_M, KELP_FADE_M, KELP_GRID_N } from './kelp';

type N = any;

/**
 * The kelp's lean as the bed's shading reads it (spec §4.3): a KELP_GRID_N² toroidal texture of world cells (rgba = this
 * tick's lean, the last tick's), sampled with repeat wrapping at xz / (N·cell), interpolated between ticks by `alpha`, and
 * faded to zero over the window's last KELP_FADE_M (outside it the texture holds other cells). `on` 0: no motion (the
 * kelp stands upright); `show` 0: no canopy (build A's bed). KelpField writes it.
 */
export class KelpMap {
  readonly texture: THREE.StorageTexture;
  readonly windowMin = uniform(new THREE.Vector2(-KELP_GRID_N / 2, -KELP_GRID_N / 2));
  readonly alpha = uniform(1);
  readonly on = uniform(0);
  readonly show = uniform(1);
  readonly time = uniform(0);

  constructor() {
    const t = new THREE.StorageTexture(KELP_GRID_N, KELP_GRID_N);
    t.type = THREE.HalfFloatType;
    t.format = THREE.RGBAFormat;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = false;
    this.texture = t;
  }

  setWindow(minX: number, minZ: number): void {
    this.windowMin.value.set(minX, minZ);
  }

  /** The lean (vec2) at world xz: kelp.kelpWindowFade × the interpolated texel. */
  leanNode(xz: N): N {
    const size = KELP_GRID_N * KELP_CELL_M;
    const local = xz.sub(this.windowMin.mul(KELP_CELL_M));
    const edge = min(min(local.x, float(size).sub(local.x)), min(local.y, float(size).sub(local.y)));
    const fade = smoothstep(0.0, KELP_FADE_M, edge).mul(this.on);
    const s = texture(this.texture, xz.div(size)).level(float(0)); // three typings gap: level() wants a node
    return mix(s.zw, s.xy, clamp(this.alpha, 0.0, 1.0)).mul(fade);
  }
}
```

The texture's texel (i, j) covers world cell (wx, wz) with wx ≡ i (mod N). Its centre is at
((wx + 0.5)·cell), and uv = xz / (N·cell) puts that centre on texel i's centre: repeat wrapping does the rest.

In `src/seabed/Seabed.ts`:
- add `import { KelpMap } from './KelpMap';`
- add the field `/** The kelp's lean grid (reef build B): the bed's shading reads it, KelpField writes it. */ readonly kelp = new KelpMap();`

- [ ] **Step 3: Write KelpField (the compute stepping)**

```ts
// src/seabed/KelpField.ts
import * as THREE from 'three/webgpu';
import { Fn, If, float, instanceIndex, instancedArray, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import type { ReefFlow } from '../breaker/flowNodes';
import { FOAM_TICK_S, FoamSchedule, tickIndex, tickTime } from '../whitewater/foamStep';
import { KELP_CELL_M, KELP_FLOW_Y_M, KELP_GRID_N, KELP_REPLAY_S, kelpWindowMin } from './kelp';
import type { KelpMap } from './KelpMap';
import { kelpStepNode, kelpSteadyLeanNode } from './kelpNodes';

type N = any;
const COUNT = KELP_GRID_N * KELP_GRID_N;

/**
 * Steps the kelp's lean (spec §4.2–4.3) at the foam's 20 Hz sim-time ticks: per slot, the world cell it holds in the
 * current window, the flow there KELP_FLOW_Y_M above the bed, one spring step (kelpStepNode) — or, for a cell new to the
 * window or after a jump, the steady lean at rest — into the state buffer, and (prev ← cur, cur ← lean) into the map's
 * display texture.
 */
export class KelpField {
  private readonly state = instancedArray(COUNT, 'vec4');
  private readonly schedule = new FoamSchedule();
  private readonly prevMin = uniform(new THREE.Vector2(1e9, 1e9));
  private readonly fresh = uniform(1);
  private readonly dt = uniform(FOAM_TICK_S);
  private readonly pass: THREE.ComputeNode;
  private enabled = true;
  private lastMin: [number, number] | null = null;

  constructor(private readonly map: KelpMap, flow: ReefFlow) {
    const n = KELP_GRID_N;
    const posMod = (a: N): N => a.mod(n).add(n).mod(n);
    this.pass = Fn(() => {
      const sx = instanceIndex.mod(n), sz = instanceIndex.div(n);
      const minC = map.windowMin;
      const wx = minC.x.add(posMod(float(sx).sub(minC.x))), wz = minC.y.add(posMod(float(sz).sub(minC.y)));
      const centre = vec2(wx.add(0.5), wz.add(0.5)).mul(KELP_CELL_M);
      const p = this.prevMin;
      const known = wx.greaterThanEqual(p.x).and(wx.lessThan(p.x.add(n))).and(wz.greaterThanEqual(p.y)).and(wz.lessThan(p.y.add(n))).and(this.fresh.lessThan(0.5));
      const u = flow.flowNode(centre, KELP_FLOW_Y_M);
      const old = this.state.element(instanceIndex).toVar();
      const display = vec4(0.0).toVar();
      If(known, () => {
        const next = kelpStepNode(old, u, this.dt);
        this.state.element(instanceIndex).assign(next);
        display.assign(vec4(next.xy, old.xy));
      }).Else(() => {
        const steady = kelpSteadyLeanNode(u);
        this.state.element(instanceIndex).assign(vec4(steady, 0.0, 0.0));
        display.assign(vec4(steady, steady));
      });
      textureStore(map.texture, uvec2(sx, sz), display);
    })().compute(COUNT) as THREE.ComputeNode;
  }

  /** The next advance replays KELP_REPLAY_S, every cell starting at its steady lean (a jump, new conditions, a new field). */
  invalidate(): void {
    this.schedule.invalidate();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.map.on.value = on ? 1 : 0;
    this.map.show.value = on ? 1 : 0;
    if (on) this.invalidate();
  }

  /** Runs this frame's ticks; `prepare(t)` points the set waves at tick time t (App.pointFoamSourceAt). Returns the ticks run. */
  advance(renderer: THREE.WebGPURenderer, simTime: number, camX: number, camZ: number, prepare: (t: number) => void): number {
    if (!this.enabled) return 0;
    const [mx, mz] = kelpWindowMin(camX, camZ);
    const plan = this.schedule.planTicks(simTime, Math.ceil(KELP_REPLAY_S / FOAM_TICK_S));
    this.map.setWindow(mx, mz);
    this.map.on.value = 1;
    let first = plan.clear;
    for (const k of plan.ticks) {
      prepare(tickTime(k));
      this.fresh.value = first ? 1 : 0;
      const [px, pz] = this.lastMin ?? [1e9, 1e9];
      this.prevMin.value.set(px, pz);
      renderer.compute(this.pass);
      this.lastMin = [mx, mz];
      first = false;
    }
    this.map.alpha.value = Math.min(1, Math.max(0, (simTime - tickTime(tickIndex(simTime))) / FOAM_TICK_S));
    this.map.time.value = simTime;
    return plan.ticks.length;
  }
}
```

**Rule:** `prevMin` is the window the state was last stepped in. A cell outside it, or any cell on a replay's first
tick, starts at rest at its steady lean.

**If `instancedArray` read/write in one pass fails to compile:** ledger a ruling and fall back to a second `vec4` storage
texture written by a copy pass (as `FoamField` does).

The `prevMin` test also covers a window that moved between ticks: the next tick initialises the new cells.

- [ ] **Step 4: Write the self-test**

The self-test covers three things:
1. **The step mirror:** `kelpStepNode` matches `kelpStep` over a table of states and flows.
2. **The grid:** a cell's state survives the window moving 37 cells (it matches a CPU replay of that cell). A teleport
   re-initialises every cell to its steady lean. A replay's first tick starts at the steady lean.
3. **The schedule (Review Focus 5):** `FoamSchedule.planTicks` on a backwards step plans a replay (`clear` true).

```ts
// src/seabed/kelp.selftest.ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, storage, uniform, vec2, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { FoamSchedule } from '../whitewater/foamStep';
import { type KelpState, kelpSteadyLean, kelpStep } from './kelp';
import { KelpField } from './KelpField';
import { KelpMap } from './KelpMap';
import { kelpStepNode } from './kelpNodes';

registerSelfTest({
  name: 'kelp: the GPU spring step matches kelp.kelpStep',
  async run(renderer) {
    const cases: [KelpState, number, number, number][] = [];
    for (const l of [0, 0.4, 0.99]) for (const v of [-3, 0, 2]) for (const u of [0, 1.6, -4.7, 30]) for (const dt of [0.05, 0.5]) cases.push([{ lx: l, lz: -l / 2, vx: v, vz: v / 3 }, u, u / 2, dt]);
    const n = cases.length;
    const inA = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([s]) => [s.lx, s.lz, s.vx, s.vz])), 4);
    const inB = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap(([, ux, uz, dt]) => [ux, uz, dt, 0])), 4);
    const outA = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const a = storage(inA, 'vec4', n).toReadOnly(), b = storage(inB, 'vec4', n).toReadOnly(), o = storage(outA, 'vec4', n);
    renderer.compute(Fn(() => { const q = b.element(instanceIndex); o.element(instanceIndex).assign(kelpStepNode(a.element(instanceIndex), q.xy, q.z)); })().compute(n) as THREE.ComputeNode);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outA));
    let worst = 0;
    cases.forEach(([s, ux, uz, dt], i) => {
      const c = kelpStep(s, ux, uz, dt);
      worst = Math.max(worst, ...[c.lx, c.lz, c.vx, c.vz].map((v, j) => Math.abs(out[i * 4 + j] - v) / Math.max(1, Math.abs(v))));
    });
    return { pass: worst < 1e-3, detail: `${n} cases; worst ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'kelp: the grid keeps a cell\'s state as the window moves, and starts new cells at their steady lean',
  async run(renderer) {
    // A uniform flow along +x that the test sets per tick (stands in for ReefFlow).
    const u = uniform(new THREE.Vector2(1.6, 0));
    const flow = { flowNode: () => u } as never;
    const map = new KelpMap();
    const field = new KelpField(map, flow);
    const notes: string[] = [];
    let pass = true;
    const readCell = async (x: number, z: number): Promise<[number, number]> => {
      const outA = new THREE.StorageBufferAttribute(new Float32Array(4), 4);
      const o = storage(outA, 'vec4', 1);
      map.alpha.value = 1;
      renderer.compute(Fn(() => { o.element(instanceIndex).assign(vec4(map.leanNode(vec2(x + 0.5, z + 0.5)), 0.0, 0.0)); })().compute(1) as THREE.ComputeNode);
      const r = new Float32Array(await renderer.getArrayBufferAsync(outA));
      return [r[0], r[1]];
    };
    // From a jump: every cell at its steady lean.
    field.advance(renderer, 100, 0, 0, () => {});
    const steady = kelpSteadyLean(1.6, 0)[0];
    const [l0] = await readCell(3, 4);
    pass &&= Math.abs(l0 - steady) < 0.01;
    notes.push(`after the jump ${l0.toFixed(3)} (steady ${steady.toFixed(3)})`);
    // The flow drops to 0; step 1 s with the camera still, then 1 s with it 37 cells east: cell (3, 4) stays in the window.
    u.value.set(0, 0);
    let s: KelpState = { lx: steady, lz: 0, vx: 0, vz: 0 };
    const k0 = Math.floor(100 * 20 + 1e-6);
    for (let k = 1; k <= 40; k++) {
      field.advance(renderer, (k0 + k) / 20, k <= 20 ? 0 : 37, 0, () => {});
      s = kelpStep(s, 0, 0, 0.05);
    }
    const [l1] = await readCell(3, 4);
    pass &&= Math.abs(l1 - s.lx) < 0.01;
    notes.push(`after 2 s and a 37-cell move ${l1.toFixed(3)} (CPU ${s.lx.toFixed(3)})`);
    // A teleport: every cell is new, so it starts at the steady lean of the flow now (Review Focus 1).
    u.value.set(0, -3);
    field.advance(renderer, (k0 + 41) / 20, 5000, -3000, () => {});
    const [, lz] = await readCell(5003, -2996);
    pass &&= Math.abs(lz - kelpSteadyLean(0, -3)[1]) < 0.01;
    notes.push(`after a teleport ${lz.toFixed(3)} (steady ${kelpSteadyLean(0, -3)[1].toFixed(3)})`);
    // A backwards step replays (Review Focus 5).
    const sch = new FoamSchedule();
    sch.planTicks(200, 80);
    pass &&= sch.planTicks(150, 80).clear;
    return { pass, detail: notes.join('; ') };
  },
});
```

Register it: in `src/dev/selfTests.ts`, after `import '../seabed/seabedShading.selftest';` add
`import '../seabed/kelp.selftest';`.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npx tsc --noEmit -p .` then `npx vitest run --maxWorkers=3`
Expected: no type errors. The suite is green (the `Seabed` change adds a field, nothing else).

- [ ] **Step 6: Run the GPU self-tests**

Open `http://localhost:5183/?selftest=kelp`.
Expected: `SUMMARY 2/2 passed`.

Then open `?selftest=seabed` and `?selftest=underwater`.
Expected: all pass, as on main. The map is unread until Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/seabed/kelpNodes.ts src/seabed/KelpMap.ts src/seabed/KelpField.ts src/seabed/kelp.selftest.ts src/seabed/Seabed.ts src/dev/selfTests.ts
git commit -m "feat(kelp): the lean grid on the GPU: the toroidal map the bed reads, stepped at 20 Hz from the flow"
```

---

### Task 6: The canopy in the bed's shading

**Files:**
- Create: `src/seabed/kelpLook.ts`, `src/seabed/kelpLook.selftest.ts`
- Modify:
  - `src/seabed/seabedShading.ts`: `seabedRadianceNode` gains an optional `rayDir`, and its albedo goes through the
    canopy. `seabedTerms` passes `t`.
  - `src/ocean/WaterVolume.ts`: `reefOrNode` passes `dir`.
  - `src/seabed/bedLook.ts`: `KELP_GAP_SHADE`.
  - `src/dev/selfTests.ts`: one import.

**Interfaces:**
- Consumes:
  - Task 5's `KelpMap` (`leanNode`, `show`, `time`), reached as `seabed.kelp`.
  - Task 4's `KELP_HEIGHT_M` and `KELP_FLATTEN`.
  - `bedLook`'s `REEF_ALBEDO` and `WEED_ALBEDO`.
- Produces:
  - `kelpWeedAlbedoNode(hitPos: N, rayDir: N, kelp: KelpMap): N`: vec3, the weedy part's albedo (it replaces
    `WEED_ALBEDO` in the bed's mix).
  - `kelpParallaxNode(rayDir: N, height: N): N`: vec2, the xz shift (m), at most `height / KELP_MIN_DOWN`.
  - `KELP_MIN_DOWN = 0.3`.
  - `seabedRadianceNode(hitPos, seabed, sky, u, sunVisibility?, rayDir?)`.

- [ ] **Step 1: Write the canopy**

```ts
// src/seabed/kelpLook.ts
import { dot, float, length, max, mix, mx_noise_float, select, smoothstep, vec2, vec3 } from 'three/tsl';
import { KELP_GAP_SHADE, REEF_ALBEDO, WEED_ALBEDO } from './bedLook';
import { KELP_FLATTEN, KELP_HEIGHT_M } from './kelp';
import type { KelpMap } from './KelpMap';

type N = any;

/** A ray this close to level is treated as this steep for the canopy's parallax: the shift stays ≤ height / 0.3 (Review Focus 3). */
export const KELP_MIN_DOWN = 0.3;

/** Where the ray met the canopy's top before the bed: −dir.xz · height / max(−dir.y, KELP_MIN_DOWN). */
export function kelpParallaxNode(rayDir: N, height: N): N {
  return rayDir.xz.negate().mul(height.div(max(rayDir.y.negate(), KELP_MIN_DOWN)));
}

/**
 * The weedy bed's albedo with the kelp canopy on it (spec §4.2): fronds streaming along the lean, in clumped beds,
 * over the rock in their shade; lying lower, stretched and brighter as they lean; fluttering in strong flow. `show` 0
 * gives build A's WEED_ALBEDO exactly (Review Focus 4).
 */
export function kelpWeedAlbedoNode(hitPos: N, rayDir: N, kelp: KelpMap): N {
  const lean = kelp.leanNode(hitPos.xz);
  const l = length(lean);
  const height = float(KELP_HEIGHT_M).mul(float(1.0).sub(l.mul(KELP_FLATTEN)));
  const top = hitPos.xz.add(kelpParallaxNode(rayDir, height));
  // Beds about 5 m across.
  const clump = smoothstep(0.35, 0.65, mx_noise_float(vec3(top.x.mul(0.18), top.y.mul(0.18), 3.7)).mul(0.5).add(0.5));
  const density = mix(float(0.55), float(1.0), clump);
  // The fronds' frame: along the lean (x when upright), stretched with it; the tips move downstream.
  const dir = select(l.greaterThan(1e-4), lean.div(max(l, 1e-4)), vec2(1.0, 0.0));
  const p = top.sub(lean.mul(KELP_HEIGHT_M * 0.6));
  const along = dot(p, dir).div(l.mul(2.0).add(1.0));
  const across = dot(p, vec2(dir.y.negate(), dir.x));
  const flutter = kelp.time.mul(l.mul(l).mul(1.5).add(0.2));
  const n = mx_noise_float(vec3(along.mul(2.2), across.mul(4.5), flutter)).mul(0.5).add(0.5);
  const cover = smoothstep(0.3, 0.45, n.add(density.sub(0.75).mul(0.5)));
  const fronds = vec3(...WEED_ALBEDO).mul(l.mul(0.3).add(0.85));
  const gaps = vec3(...REEF_ALBEDO).mul(KELP_GAP_SHADE);
  return mix(vec3(...WEED_ALBEDO), mix(gaps, fronds, cover), kelp.show);
}
```

In `src/seabed/bedLook.ts`, after `WEED_ALBEDO` add:

```ts
/** The rock between kelp plants, in the canopy's shade (× REEF_ALBEDO): the canopy's mean tone stays near WEED_ALBEDO (reef build B §4.2). */
export const KELP_GAP_SHADE = 0.3;
```

- [ ] **Step 2: Wire it into the bed's shading**

In `src/seabed/seabedShading.ts`:
- **The signature:** change `seabedRadianceNode` to
  `export function seabedRadianceNode(hitPos: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms, sunVisibility?: N, rayDir?: N): N`.
- **The albedo line:** replace it with:

```ts
  const weedy = kelpWeedAlbedoNode(hitPos, rayDir ?? vec3(0.0, -1.0, 0.0), seabed.kelp);
  const albedo = mix(mix(REEF_ALBEDO, weedy, mat.y), SAND_ALBEDO, mat.x).mul(detail.mul(0.4).add(0.8));
```

- **The import:** add `import { kelpWeedAlbedoNode } from './kelpLook';`.
- **In `seabedTerms`:** pass the refracted ray. The call becomes
  `seabedRadianceNode(i.surfacePos.add(t.mul(march.x)), seabed, sky, u, sunVisibility, t)`.
- **The comment:** update the albedo comment so it says the weedy part is the kelp canopy (reef build B).

In `src/ocean/WaterVolume.ts` `reefOrNode`, the call becomes
`seabedRadianceNode(origin.add(dir.mul(march.x)), seabed, sky, u, sky.cloudSunTransmittance, dir)`.

- [ ] **Step 3: Write the canopy's self-test**

The self-test covers three things:
1. **The tone:** over a 40 × 40 m weedy patch of upright canopy, seen straight down and along a tilted ray, the mean
   albedo's luminance is within 20% of `WEED_ALBEDO`'s.
2. **Kelp off:** with `show` = 0 the weedy albedo is exactly `WEED_ALBEDO` (Review Focus 4).
3. **Level and rising rays:** the parallax shift stays ≤ `KELP_HEIGHT_M / KELP_MIN_DOWN` and the albedo stays finite
   (Review Focus 3).

```ts
// src/seabed/kelpLook.selftest.ts
import * as THREE from 'three/webgpu';
import { Fn, instanceIndex, length, storage, vec3, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { WEED_ALBEDO, luminance } from './bedLook';
import { KELP_HEIGHT_M } from './kelp';
import { KelpMap } from './KelpMap';
import { KELP_MIN_DOWN, kelpParallaxNode, kelpWeedAlbedoNode } from './kelpLook';

async function sample(renderer: THREE.WebGPURenderer, rows: number[][], body: (q: any) => any): Promise<Float32Array> {
  const n = rows.length;
  const inA = new THREE.StorageBufferAttribute(new Float32Array(rows.flat()), 4);
  const outA = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
  const i = storage(inA, 'vec4', n).toReadOnly(), o = storage(outA, 'vec4', n);
  renderer.compute(Fn(() => { o.element(instanceIndex).assign(body(i.element(instanceIndex))); })().compute(n) as THREE.ComputeNode);
  return new Float32Array(await renderer.getArrayBufferAsync(outA));
}

registerSelfTest({
  name: 'kelp: the canopy keeps the weed\'s tone (±20%), is build A\'s weed when off, and stays bounded on level rays',
  async run(renderer) {
    const map = new KelpMap();
    const rows: number[][] = [];
    for (let x = 0; x < 40; x += 0.37) for (let z = 0; z < 40; z += 0.41) rows.push([x, z, 0, 0]);
    const notes: string[] = [];
    let pass = true;
    const target = luminance(WEED_ALBEDO);
    // The upright canopy (no lean: the map's motion off), seen straight down and along a tilted ray (parallax). The
    // leaning canopy's tone is checked by eye in Gate 2's stills.
    map.on.value = 0;
    map.show.value = 1;
    for (const tilt of [0, 0.5]) {
      const out = await sample(renderer, rows, (q) => vec4(kelpWeedAlbedoNode(vec3(q.x, -6.0, q.y), vec3(tilt, -1.0, 0.0).normalize(), map), 0.0));
      let sum = 0;
      for (let k = 0; k < rows.length; k++) sum += luminance([out[k * 4], out[k * 4 + 1], out[k * 4 + 2]]);
      const mean = sum / rows.length;
      pass &&= Math.abs(mean / target - 1) <= 0.2;
      notes.push(`ray tilt ${tilt}: mean luminance ${(mean / target).toFixed(3)} × weed`);
    }
    map.show.value = 0;
    const off = await sample(renderer, rows.slice(0, 50), (q) => vec4(kelpWeedAlbedoNode(vec3(q.x, -6.0, q.y), vec3(0.0, -1.0, 0.0), map), 0.0));
    let worstOff = 0;
    for (let k = 0; k < 50; k++) for (let c = 0; c < 3; c++) worstOff = Math.max(worstOff, Math.abs(off[k * 4 + c] - WEED_ALBEDO[c]));
    pass &&= worstOff < 1e-4;
    notes.push(`off: worst ${worstOff.toExponential(1)} from WEED_ALBEDO`);
    const dirs = [[1, 0, 0], [0.7, 0.05, 0.7], [0, 0.3, 1], [0, -1, 0]].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, 0]; });
    const shift = await sample(renderer, dirs, (q) => vec4(length(kelpParallaxNode(q.xyz, KELP_HEIGHT_M)), 0.0, 0.0, 0.0));
    const maxShift = Math.max(...dirs.map((_, k) => shift[k * 4]));
    pass &&= Number.isFinite(maxShift) && maxShift <= KELP_HEIGHT_M / KELP_MIN_DOWN + 1e-4;
    notes.push(`level/rising rays: shift ≤ ${maxShift.toFixed(2)} m`);
    return { pass, detail: notes.join('; ') };
  },
});
```

**A rule for this test:** the upright canopy's tone is what the test must pin. If its tone misses the band, tune the
cover thresholds (0.3, 0.45) or the density mix in `kelpLook.ts` and ledger the values. Never tune `KELP_GAP_SHADE`
alone without re-running the leaning case in Gate 2's stills.

Register it: in `src/dev/selfTests.ts`, after the kelp self-test import, add `import '../seabed/kelpLook.selftest';`.

- [ ] **Step 4: Typecheck, run the suite and the GPU self-tests**

Run: `npx tsc --noEmit -p .` then `npx vitest run --maxWorkers=3`
Expected: clean, and the suite is green.

Open `?selftest=kelp`, `?selftest=seabed`, `?selftest=underwater` and `?selftest=breaker` on :5183.
Expected:
- **Kelp:** 3/3.
- **Seabed, underwater, breaker:** all pass.
- **If an existing seabed-shading check fails** on the weedy bed's new pattern (it compared shading to a CPU
  expectation), compare with `seabed.kelp.show` = 0. If it passes then, the canopy moved the value the test pinned:
  ledger a ruling and set the test's own `KelpMap` `show` to 0 so it keeps testing build A's shading.

- [ ] **Step 5: Commit**

```bash
git add src/seabed/kelpLook.ts src/seabed/kelpLook.selftest.ts src/seabed/seabedShading.ts src/ocean/WaterVolume.ts src/seabed/bedLook.ts src/dev/selfTests.ts
git commit -m "feat(kelp): the kelp canopy in the bed's shading: fronds streaming along the lean, clumped, seen from above and below"
```

---

### Task 7: Wire it into the game

**Files:**
- Modify: `src/app/App.ts`

**Interfaces:**
- Consumes:
  - `ReefFlow` (Task 2): background = the FFT long swell's η, `(xz) => this.surfaceModel.fftCascadeDisplacement(xz, 0, float(1.0)).y`.
  - `KelpField` (Task 5).
  - `this.seabed.kelp`.
  - The existing `pointFoamSourceAt(t)`, `invalidateParticles()` and the frame loop at `this.stepFoam(events);`.
- Produces:
  - `App.kelp: KelpField`
  - `App.setKelp(on: boolean): void` (dev: `window.liquidDreams.setKelp(false)`)
  - `App.measureKelpGpu(frames?: number): Promise<{ on: number; off: number }>` (dev: mean GPU ms per frame, kelp on vs
    off).

- [ ] **Step 1: Construct the flow and the field**

In `App.ts`, after the `foamField` field (line ~238), add:

```ts
  /** The water's flow under the waves (reef build B §4.1): the set waves' surface plus the FFT long swell where it runs. */
  readonly reefFlow = new ReefFlow(this.setWaves, (xz) => this.surfaceModel.fftCascadeDisplacement(xz, 0, float(1.0)).y);
  /** The kelp's lean grid around the camera (reef build B §4.2–4.3), stepped with the foam's ticks. */
  readonly kelp = new KelpField(this.seabed.kelp, this.reefFlow);
```

with imports:
- `import { ReefFlow } from '../breaker/flowNodes';`
- `import { KelpField } from '../seabed/KelpField';`
- `float` from `three/tsl`, if `App.ts` doesn't import it already.

- [ ] **Step 2: Step it each frame and invalidate it on jumps**

Add the method next to `stepFoam`:

```ts
  /** The kelp's ticks this frame (none while paused; a replay after a jump), like the foam's: each tick points the set waves at its time. */
  private stepKelp(events: readonly WaveEvent[]): void {
    const steps = this.kelp.advance(this.renderer, this.clock.simTime, this.camera.position.x, this.camera.position.z, (t) => this.pointFoamSourceAt(t));
    if (steps === 0) return;
    this.ocean.time.value = this.clock.simTime;
    this.setWaves.setEvents(events);
  }
```

- **The frame loop:** right after `this.stepFoam(events);`, call `this.stepKelp(events);`.
- **Invalidation:** in `invalidateParticles()`, add `this.kelp.invalidate();`. It already runs on a jump, new
  conditions and a new field.

- [ ] **Step 3: The dev toggle and the cost measurement**

```ts
  /** Dev: the kelp on or off (off: build A's bed, no lean steps). For captures and the cost check. */
  setKelp(on: boolean): void {
    this.kelp.setEnabled(on);
  }

  /** Dev (spec §3.6): mean GPU ms per frame over `frames` frames with the kelp on, then off (window.__ldGpuMs). */
  async measureKelpGpu(frames = 120): Promise<{ on: number; off: number }> {
    const w = window as unknown as { __ldGpuMs?: number[] };
    const take = async (): Promise<number> => {
      w.__ldGpuMs = [];
      while ((w.__ldGpuMs?.length ?? 0) < frames) await new Promise((r) => requestAnimationFrame(r));
      const a = w.__ldGpuMs!.slice(-frames);
      return a.reduce((s, v) => s + v, 0) / a.length;
    };
    this.setKelp(true);
    const on = await take();
    this.setKelp(false);
    const off = await take();
    this.setKelp(true);
    return { on, off };
  }
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit -p .` then `npx vitest run --maxWorkers=3`
Expected: clean and green. An App-level test that snapshots the scene's materials may need its expectations refreshed:
ledger it if so.

- [ ] **Step 5: Check it in the game**

On :5183:
- **The console:** load the default moment and check `read_console_messages` for no errors.
- **Paused frames:** run `window.liquidDreams.setKelp(false)` and `(true)`. The bed changes between build A's weed and
  the canopy.
- **The full self-tests:** run every self-test (`?selftest=` with an empty filter). Expected: all pass (the counts as on
  main, plus the new flow and kelp tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/App.ts
git commit -m "feat(kelp): the game steps the kelp with the foam's ticks, from the flow; dev toggle and cost readout"
```

---

### Task 8: Gate 2, the kelp looked at (STOP for Andrew)

**Files:**
- Create: `tools/captureMoments.mjs` (dev tool: loads moment links in Electron, saves frames)

**Interfaces:**
- Consumes: `window.liquidDreams.captureFrame()`, `setKelp`, `measureKelpGpu` (Task 7).
- Produces: the stills, the clip frames and the cost numbers for Andrew.

- [ ] **Step 1: Write the capture tool**

```js
// tools/captureMoments.mjs
// Dev tool: npx electron tools/captureMoments.mjs --base=http://localhost:5183/ --out=<prefix> --times=<t1,t2,…> --m=<base64 moment JSON> [--pre=<js>]
// Loads the moment at each sim time (paused), waits for the game, optionally runs --pre, and saves captureFrame() PNGs.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base'), out = arg('out'), pre = arg('pre'), times = arg('times').split(',').map(Number);
const moment = JSON.parse(Buffer.from(arg('m'), 'base64').toString('utf8'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  // Stored dev settings would override the code's defaults: start every capture from the defaults.
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  for (const [k, t] of times.entries()) {
    const m = { ...moment, simTime: t, paused: true };
    const b64 = Buffer.from(JSON.stringify(m)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await win.loadURL(`${base}?shot=${k}#m=${b64}`);
    for (let i = 0; i < 90; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams')) break; await sleep(1000); }
    await sleep(25000);
    if (pre) { await win.webContents.executeJavaScript(pre); await sleep(1500); }
    const png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
    writeFileSync(`${out}-${t.toFixed(1)}.png`, Buffer.from(png, 'base64'));
    console.log('saved', t);
  }
  app.quit();
});
```

- [ ] **Step 2: Build the moments**

**The take-off:**
- **Camera:** free, at (−3, 1.5, 3), pitched −40°, looking into the swell. The yaw makes `look.lookDirection` point
  against the travel: yaw = atan2(−travelX, travelZ) in degrees, with travel from
  `travelDirectionXZ(225)` (`src/conditions/directions.ts`).
- **Conditions:** mid tide (tideM 0), 225°, 15 s, seed 2002. At 4 ft and at 12 ft.
- **Times:** around the biggest wave of set 1 (`wavesOfSet(1, c, DEFAULT_SET_PARAMS)`): arrival −8, −4, −2, 0, +2 s.
  Compute them with a one-off `node --input-type=module` or a scratch vitest (`--silent=false`), then delete the
  scratch.

**Underwater:** camera at (−3, −4, 3), pitched −10°, same yaw, 12 ft, arrival −4 s.

- [ ] **Step 3: Capture**

For each moment and time:
- **Kelp on:** capture with `--pre=window.liquidDreams.setKelp(true)`.
- **Kelp off:** capture with `--pre=window.liquidDreams.setKelp(false)`, for the side-by-side.

**The clip:** for one clip at 12 ft, capture every 0.25 s from −8 to +4 s with the kelp on.

Put the frames into side-by-side sheets (Python PIL, as for the shore-foam fix) under
`.superpowers/drawings/reef-kelp/`.

- [ ] **Step 4: Measure the cost**

On :5183 (in-app browser on the RTX), load the 12 ft take-off moment at arrival −2 s, unpaused. Run
`await window.liquidDreams.measureKelpGpu(240)`.

Expected: `on − off ≤ 1.5` (ms).
- **If over:** shrink the grid to 96 (and then 64) by `KELP_GRID_N` (update the Task 4 tests that use it) and ledger
  the measured costs. Don't cheapen the look first.

- [ ] **Step 5: Push and show Andrew**

```bash
git add tools/captureMoments.mjs
git commit -m "chore(tools): the moment capture tool (Electron), for the gates"
git push
```

Send Andrew the sheets: 4 ft and 12 ft, kelp off/on side by side; the 12 ft clip frames as a strip; the underwater
still. Also send the cost (on, off, difference) and a plain-words note on what to look for:
- the beds lean seaward a beat after the draw starts;
- they flatten at 12 ft;
- they swing shoreward and overshoot as the crest passes.

- [ ] **Step 6: STOP. Wait for Andrew's word.** Tuning he asks for loops back through Task 6's self-test (the tone band)
  and a fresh capture. Merge to main only on his word, after the whole-branch review.
