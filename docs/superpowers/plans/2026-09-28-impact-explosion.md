# Phase 3c: The Impact Explosion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Where each lip lands, a dense white burst rises about as high as the wave and falls back within about 1.5 s. It is deterministic per moment and reuses the 3b particle system.

**Architecture:** The 3b particle system becomes generic over a `ParticleKind`: drag, gravity, size, opacity and phase isotropy. The spray is `SPRAY_KIND`, unchanged. The explosion is a second `SprayParticles` instance with `IMPACT_KIND`. One crest trace and profile frame per station per tick feed both effects (`breakEmitters`). App caches each tick's emitters within a frame.

**Tech Stack:** TypeScript, three.js 0.186 WebGPU + TSL, vitest, the in-browser GPU self-tests.

**Spec:** `docs/superpowers/specs/2026-09-28-impact-explosion-design.md` (ruled overnight under Andrew's delegation; rulings I0–I4)

## Global Constraints

- **Kinds:**
  - `SPRAY_KIND` = { dragTauS 0.45, gravityMs2 1.2, sizeM [0.3, 2], opacity 0.08, isotropic 0.3 }. These are exactly 3b's values; the spray must be unchanged.
  - `IMPACT_KIND` = { dragTauS 1.1, gravityMs2 7, sizeM [0.5, 2.5], opacity 0.2, isotropic 0.6 }.
- **Impact emitters:**
  - `tb` finite and τ_land ≤ tb < τ_land + 0.35 s, with ρ > 0.1;
  - position: the lip tip at τ_land, plus the tide;
  - strength: `min(1, H/2)·ρ·impactAmount`;
  - lip: `min(1, ρ)`.
- **Impact births:**
  - count: `floor(strength·40·spacing·Δ + hashed fraction)`, at most 320 per tick;
  - scatter: half a spacing along the crest, 0–0.4 m up;
  - velocity: 0.6·vj along n; up `U(0.5, 1)·√(2·7·max(H, 0.5))`; ±1.5 m/s per axis;
  - life: U(0.8, 1.6) s;
  - hashes salted apart from the spray's.
- **The trace:** the calm-wind early exit skips only the spray. The trace runs when breaking is on, there are waves, and (spray amount > 0 with wind > 1 m/s, or impact amount > 0).
- **Slider:** `impact amount` 0–3, default 1 (an Impact folder, persisted). Its own debounced replay. `spray tint` tints both.
- **Cost targets:**
  - ≤ 1.5 ms CPU per tick in total (the shared trace);
  - ≤ 0.3 ms GPU per tick per system;
  - drawing ≤ 1 ms per system;
  - a replay ≤ 150 ms for both, at the default conditions;
  - if any is missed, record the numbers for Andrew.
- **Repo rules:**
  - `reference/` is never committed;
  - stage by path;
  - never commit `.superpowers/`;
  - the commit trailer is required;
  - **do not merge 3c** (Andrew authorised merging 3b only).

## Plan-time rulings

- **P1:** the class keeps its name, `SprayParticles` (now `new SprayParticles(sky, kind)`), rather than renaming to `ParticleSystem` (spec §3.1). The rename would churn every 3b import for no behaviour change.
- **P2:** the replay window becomes a property of the system: `setMaxLifeS(s)`. The spray sets 1.2·lifeS through `setParams`; the explosion sets 1.6 s once. Ticks = min(100, ceil((maxLife + 0.5)/Δ)).

## Review Focus

1. **The spray is unchanged by the refactor.** The existing spray tests and self-tests pass unmodified, and a new test pins `SPRAY_KIND` to the old constants.
2. **Glassy day:** the explosion still happens and the spray doesn't. Task 2: `impact happens with no wind`.
3. **The landing window's edges:** there is no emitter one tick before τ_land and none after the window. Task 2: `impact emitters only in the landing window`.
4. **A replay's shared per-tick emitters:** the spray and the explosion replay different tick counts, so the per-frame cache must key by tick. Task 3: covered by the live replay-equals-live checks.
5. **Cost when both are on:** Task 4 measures it.

---

### Task 1: Particle kinds (a refactor with the spray pinned)

**Files:**
- Create: `src/whitewater/particleKinds.ts`
- Test: `src/whitewater/particleKinds.test.ts`
- Modify: `src/whitewater/sprayStep.ts`, `src/whitewater/sprayLook.ts`, `src/whitewater/SprayParticles.ts`, `src/whitewater/spray.selftest.ts`, `src/whitewater/sprayEmitters.ts` (`replayTicksForMaxLife`)

**Interfaces:** Produces:
- `ParticleKind`, `SPRAY_KIND`, `IMPACT_KIND`;
- `stepPool(pool, windX, windZ, kind = SPRAY_KIND)`;
- `sprayPhase(cosT, isotropic = SPRAY_PHASE_ISOTROPIC)`, `sprayPhaseNode(cosT, isotropic)`;
- `new SprayParticles(sky, kind = SPRAY_KIND)`, `.setMaxLifeS(s)`;
- `replayTicksForMaxLife(maxLifeS)`.

- [ ] **Step 1: The failing tests** (`src/whitewater/particleKinds.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { IMPACT_KIND, SPRAY_KIND } from './particleKinds';
import { SPRAY_OPACITY, SPRAY_BIRTH_CAP, replayTicksForMaxLife, sprayReplayTicks } from './sprayEmitters';
import { SPRAY_PHASE_ISOTROPIC, sprayPhase } from './sprayLook';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, SprayPool, birthInto, stepPool } from './sprayStep';

describe('particle kinds', () => {
  it('the spray kind is exactly 3b (the refactor changes nothing)', () => {
    expect(SPRAY_KIND).toEqual({ dragTauS: SPRAY_DRAG_TAU_S, gravityMs2: SPRAY_SETTLE_MS2, sizeM: [0.3, 2], opacity: SPRAY_OPACITY, isotropic: SPRAY_PHASE_ISOTROPIC });
  });
  it('an impact puff rises and falls back under gravity well within its life', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP);
    birthInto(pool, 0, [{ x: 0, y: 1, z: 0, vx: 0, vy: 6, vz: 0, life: 1.6, strength: 1 }]);
    let peak = 1, t = 0;
    while (pool.posAge[3] < pool.velLife[3]) { stepPool(pool, 0, 0, IMPACT_KIND); peak = Math.max(peak, pool.posAge[1]); t += 0.05; }
    expect(peak).toBeGreaterThan(2.5);
    expect(pool.posAge[1]).toBeLessThan(peak - 1);
    expect(t).toBeLessThanOrEqual(1.65);
  });
  it('the default kind of stepPool is the spray', () => {
    const a = new SprayPool(SPRAY_BIRTH_CAP), b = new SprayPool(SPRAY_BIRTH_CAP);
    const puff = { x: 0, y: 1, z: 0, vx: 1, vy: 3, vz: 0, life: 2, strength: 1 };
    birthInto(a, 0, [puff]); birthInto(b, 0, [puff]);
    stepPool(a, 4, 1); stepPool(b, 4, 1, SPRAY_KIND);
    expect(a.posAge).toEqual(b.posAge);
    expect(a.velLife).toEqual(b.velLife);
  });
  it('a denser, more isotropic phase is still energy conserving and whiter side-on', () => {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const c = -1 + (2 * (i + 0.5)) / n; sum += sprayPhase(c, IMPACT_KIND.isotropic) * 2 * Math.PI * (2 / n); }
    expect(sum).toBeCloseTo(1, 3);
    expect(sprayPhase(0, IMPACT_KIND.isotropic)).toBeGreaterThan(sprayPhase(0));
  });
  it('the replay window follows the longest life, capped at the history', () => {
    expect(replayTicksForMaxLife(1.6)).toBe(42);
    expect(replayTicksForMaxLife(1.2 * 2)).toBe(sprayReplayTicks(2));
    expect(replayTicksForMaxLife(10)).toBe(100);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/whitewater/particleKinds.test.ts`. Expected: FAIL (no `./particleKinds`).

- [ ] **Step 3: Implement**

```ts
// src/whitewater/particleKinds.ts
/**
 * The particle system's kinds (spec 2026-09-28-impact-explosion-design.md §3.1): the 3b offshore spray (mist) and the 3c
 * impact explosion (dense, heavy water). One pool, schedule and material per system; only these numbers differ.
 */
export interface ParticleKind {
  /** The wind takes a puff over with this time constant (s). */
  dragTauS: number;
  /** Downward acceleration (m/s²): mist settles, thrown water falls. */
  gravityMs2: number;
  /** Size (m) at birth and at death. */
  sizeM: readonly [number, number];
  /** Per-puff opacity at strength 1. */
  opacity: number;
  /** The phase function's isotropic share (dense water scatters more evenly). */
  isotropic: number;
}

export const SPRAY_KIND: Readonly<ParticleKind> = { dragTauS: 0.45, gravityMs2: 1.2, sizeM: [0.3, 2], opacity: 0.08, isotropic: 0.3 };
export const IMPACT_KIND: Readonly<ParticleKind> = { dragTauS: 1.1, gravityMs2: 7, sizeM: [0.5, 2.5], opacity: 0.2, isotropic: 0.6 };
```

- **`sprayStep.ts`:** keep `SPRAY_DRAG_TAU_S` and `SPRAY_SETTLE_MS2` (3b's names) as the spray kind's values. `stepPool(pool, windX, windZ, kind: ParticleKind = SPRAY_KIND)` uses `kind.dragTauS` and `kind.gravityMs2` in place of the constants. To avoid a circular import, `particleKinds.ts` defines the numbers and `sprayStep.ts` imports it: `export const SPRAY_DRAG_TAU_S = SPRAY_KIND.dragTauS; export const SPRAY_SETTLE_MS2 = SPRAY_KIND.gravityMs2;`.
- **`sprayLook.ts`:** `sprayPhase(cosT, isotropic = SPRAY_PHASE_ISOTROPIC)` uses `isotropic` in place of the constant.
- **`sprayEmitters.ts`:** add

```ts
/** Ticks a replay covers for particles living at most maxLifeS: that plus 0.5 s, at most the pool's history. */
export function replayTicksForMaxLife(maxLifeS: number): number {
  return Math.min(SPRAY_HISTORY_TICKS, Math.ceil((maxLifeS + 0.5) / FOAM_TICK_S - 1e-9));
}
```

  and make `sprayReplayTicks(lifeS)` return `replayTicksForMaxLife(1.2 * lifeS)`.
- **`SprayParticles.ts`:**
  - constructor `(sky: Sky, readonly kind: ParticleKind = SPRAY_KIND)`;
  - the step uses `kind.dragTauS` and `kind.gravityMs2`;
  - the size uses `kind.sizeM`, the opacity `kind.opacity`, and the phase `sprayPhaseNode(cos, kind.isotropic)`;
  - `sprayPhaseNode(cosT, isotropic = SPRAY_PHASE_ISOTROPIC)`;
  - add `private maxLifeS = 1.2 * DEFAULT_SPRAY_PARAMS.lifeS`; `setParams` sets `this.maxLifeS = 1.2 * this.params.lifeS`; add `setMaxLifeS(s: number): void { this.maxLifeS = s; }`;
  - `advance` plans with `replayTicksForMaxLife(this.maxLifeS)`.
- **`spray.selftest.ts`:** the two pool self-tests loop over `[SPRAY_KIND, IMPACT_KIND]` (construct `new SprayParticles(sky, kind)`, CPU `stepPool(cpu, ...WIND, kind)`), reporting both.

- [ ] **Step 4: Run** `npx vitest run` (expected: all pass, 3b's tests unmodified) and `npm run typecheck`. Then open `/?selftest&fresh`: expected 42/42, with the kind loops inside the two tests.

- [ ] **Step 5: Commit** `feat(particles): particle kinds (spray unchanged, impact added)`.

---

### Task 2: Impact emitters and births (`breakEmitters`)

**Files:** Modify `src/whitewater/sprayEmitters.ts`; Test `src/whitewater/sprayEmitters.test.ts`.

**Interfaces:** Produces:
- `IMPACT_WINDOW_S` = 0.35, `IMPACT_RATE` = 40, `IMPACT_G` = 7;
- `ImpactEmitter { x; y; z; vx; vz; nx; nz; H; strength; lip; waveId; arc }`;
- `EmitterInput.impactAmount?: number` (default 0);
- `breakEmitters(i): { spray: SprayEmitter[]; impact: ImpactEmitter[] }`;
- `sprayEmitters(i)` = `breakEmitters(i).spray`;
- `impactBirths(emitters, tick): SprayBirth[]`;
- `ImpactParams { amount }`, `DEFAULT_IMPACT_PARAMS`, `IMPACT_PARAM_RANGES`, `normalizeImpactParams`.

- [ ] **Step 1: The failing tests** (append to `sprayEmitters.test.ts`, reusing its fixtures `input`, `BIGGEST`)

```ts
describe('the impact explosion', () => {
  const imp = (t: number, over: Partial<EmitterInput> = {}) => breakEmitters(input(t, { impactAmount: 1, ...over })).impact.filter((e) => e.waveId === BIGGEST.id);
  it('impact emitters only in the landing window: none before the lip lands, none long after', () => {
    const counts = [-1, 0, 0.3, 0.6, 0.9, 1.2, 1.6, 2, 3, 5, 8, 12].map((dt) => imp(BIGGEST.arrivalS + dt).length);
    expect(Math.max(...counts)).toBeGreaterThan(3);
    expect(counts[0]).toBe(0);
    expect(imp(BIGGEST.arrivalS + 12).length).toBe(0);
  });
  it('impact happens with no wind (a glassy day still explodes) while the spray does not', () => {
    let any = 0;
    for (const dt of [0.6, 0.9, 1.2, 1.6, 2]) {
      const r = breakEmitters(input(BIGGEST.arrivalS + dt, { impactAmount: 1, wind: { speedMs: 0, fromDeg: 57 } }));
      expect(r.spray).toEqual([]);
      any += r.impact.length;
    }
    expect(any).toBeGreaterThan(0);
  });
  it('an explosion throws higher for a bigger wave', () => {
    const one = (H: number) => ({ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H, strength: 1, lip: 1, waveId: 1, arc: 0 });
    const meanVy = (H: number) => { let s = 0, n = 0; for (let k = 0; k < 200; k++) for (const b of impactBirths([one(H)], k)) { s += b.vy; n++; } return s / n; };
    expect(meanVy(3)).toBeGreaterThan(meanVy(1) * 1.4);
  });
  it('impact births are capped, deterministic and salted apart from the spray', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ x: i, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, strength: 3, lip: 1, waveId: 1, arc: i }));
    const a = impactBirths(many, 9);
    expect(a.length).toBe(SPRAY_BIRTH_CAP);
    expect(impactBirths(many, 9)).toEqual(a);
    const s = sprayBirths(many.map((e) => ({ ...e })), 9, DEFAULT_SPRAY_PARAMS);
    expect(a[0].x).not.toBeCloseTo(s[0].x, 9);
    for (const b of a) { expect(b.life).toBeGreaterThanOrEqual(0.8); expect(b.life).toBeLessThanOrEqual(1.6); }
  });
  it('the spray is what it was when impact is off (sprayEmitters unchanged)', () => {
    expect(breakEmitters(input(BIGGEST.arrivalS + 0.6)).spray).toEqual(sprayEmitters(input(BIGGEST.arrivalS + 0.6)));
    expect(breakEmitters(input(BIGGEST.arrivalS + 0.6)).impact).toEqual([]);
  });
});
```

(Add `breakEmitters`, `impactBirths` to the file's import from `./sprayEmitters`.)

- [ ] **Step 2: Run** the file. Expected: FAIL (`breakEmitters` is not exported).

- [ ] **Step 3: Implement**
  - Rename the body of `sprayEmitters` to `breakEmitters`, returning `{ spray, impact }`.
  - The early return (no field, no ctx, breaking off, no events) returns empty lists. The spray part is skipped when `!(amount > 0) || !(wind.speedMs > WIND_CALM_MS)`, and the impact part when `!(impactAmount > 0)`. If both are skipped, return before the trace.
  - Per station with finite `tb`, compute the profile frame once (only when some part needs it), then:
    - **spray, as before:** wind factor > 0, 0 < prog < 1, weight·ρ > 0.1;
    - **impact:** `f.tauLand <= s.tb && s.tb < f.tauLand + IMPACT_WINDOW_S && f.rho > MIN_EMIT_WEIGHT`. Push `{ x/z: station + n·(K.u + vj·τ_land), y: K.y − ½·g·τ_land² + tide, vx/vz: n·vj, nx, nz, H: s.H, strength: min(1, s.H/2)·ρ·impactAmount, lip: min(1, ρ), waveId, arc }`.
  - `sprayEmitters = (i) => breakEmitters(i).spray`.
  - `impactBirths(emitters, tick)`:
    - the hash salt is `rand01(tick, waveId, arc, 0x40000000 + j*8 + q)`, and the count fraction uses `0x7f4a7c15`;
    - count `n = floor(strength·IMPACT_RATE·SPRAY_SPACING_M·FOAM_TICK_S + fraction)`;
    - scatter half a spacing along `(−nz, nx)`, and `r·0.4` up;
    - velocity `vx = 0.6·vx ± 1.5`, `vz = 0.6·vz ± 1.5`, `vy = (0.5 + 0.5r)·√(2·IMPACT_G·max(H, 0.5)) ± 1.5`;
    - life `0.8 + 0.8r`;
    - `strength = min(1, lip)`;
    - capped at `SPRAY_BIRTH_CAP`.
  - `ImpactParams { amount: number }`, with default 1, range 0–3, and `normalizeImpactParams`, mirroring the spray's.

- [ ] **Step 4: Run** the full suite and typecheck. Expected: pass.
  - If the landing-window test finds no emitters, scan dt 0–3 s in 0.1 s steps with a scratch test, then widen the list of dt values. Ledger it.

- [ ] **Step 5: Commit** `feat(impact): impact emitters at the landing, sharing the spray's trace`.

---

### Task 3: App, the Impact folder and persistence

**Files:** Modify `src/app/App.ts`, `src/dev/devSettings.ts` (+ test), `src/dev/DevPanel.ts` (+ test).

- [ ] **Step 1: The failing tests:**
  - an `IMPACT_BINDINGS` test in `DevPanel.test.ts` (keys = `DEFAULT_IMPACT_PARAMS`, ranges = `IMPACT_PARAM_RANGES`), in the Spray folder test's form;
  - `devSettings.test.ts`: `impact: DEFAULT_IMPACT_PARAMS` in `defaults()` and `s.impact.amount = 2.2` in `tweaked()`.

- [ ] **Step 2: Run** `npx vitest run src/dev`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - **`devSettings.ts`:** `impact: ImpactParams` in `DevLookParams`, and `'impact'` in `LOOK_KEYS`.
  - **`DevPanel.ts`:** `impact` in the model, `onImpact` in the handlers, `IMPACT_BINDINGS = { amount: { label: 'impact amount', ...IMPACT_PARAM_RANGES.amount, step: 0.05 } }`, and an Impact folder.
  - **`App.ts`:**
    - `readonly impactParams = { ...DEFAULT_IMPACT_PARAMS }`;
    - `readonly impact = new SprayParticles(this.sky, IMPACT_KIND)` (with `impact.setMaxLifeS(1.6)` in the constructor), added to the scene;
    - `invalidateParticles()` also calls `this.impact.invalidate()`;
    - `scheduleParticleReplay` (sets and breaking) covers all three;
    - `onImpact` normalizes, refreshes the panel and calls `scheduleImpactReplay()` (its own timer, `impact.invalidate()`);
    - look plumbing for `impact`;
    - `onOverlays` and `applyAllParams` call `impact.setOverlays(...)`;
    - underwater: `this.impact.mesh.visible = !this.underwater`;
    - `this.impact.setDisplayExposure(...)`.
  - **The per-tick emitter cache:** `private tickEmitters = new Map<number, { spray: SprayEmitter[]; impact: ImpactEmitter[] }>();`, cleared at the start of `stepSpray`. `emittersAt(k)` computes `breakEmitters({... amount: sprayParams.amount, impactAmount: impactParams.amount })` once per tick per frame. `sprayBirthsAt(k) = sprayBirths(emittersAt(k).spray, k, sprayParams)` and `impactBirthsAt(k) = impactBirths(emittersAt(k).impact, k)`. `stepSpray` sets the wind on both systems, then advances the spray, then the explosion.
  - **Dev:** `measureImpactReplay()`, mirroring `measureSprayReplay`.

- [ ] **Step 4: Run** everything, then in the browser:
  - `/?selftest&fresh`: 42/42;
  - `/`: no errors, the Impact folder is present;
  - at `behind-the-wave` − 6 s, the impact pool has live puffs.

- [ ] **Step 5: Commit** `feat(impact): App steps the impact explosion; Impact folder`.

---

### Task 4: Measure, capture, document

- [ ] **Step 1:** With the pane visible, measure `measureSprayReplay` and `measureImpactReplay` at `behind-the-wave` − 6 s, and the explosion's drawing cost (visible vs hidden, with a fenced `picture.render`). Compare against the Global Constraints. If any target is missed, ledger the numbers for Andrew; don't stall.
- [ ] **Step 2: Gallery** (`docs/superpowers/gallery/phase-3/impact/`):
  - `01-landing-from-lineup.png`: 3b's lineup camera, at the moment the lip lands (scan dt −6.4 … −5 for the biggest burst);
  - `02-side-on.png`;
  - `03-glassy-still-explodes.png`: wind 0;
  - `04-impact-off.png`: impact amount 0, for comparison;
  - `00-sheet.png`.
- [ ] **Step 3: Docs:**
  - an "Impact explosion" section in `gallery/phase-3/README.md`;
  - the spec's Status and As-built cost.
- [ ] **Step 4:** Full suite, typecheck and self-tests. Commit `docs(impact): gallery, measured cost, as-built notes`. Push the branch `phase-3c-impact-explosion`. **Do not merge.**
