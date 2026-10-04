# Peel Stretch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Womb's left breaks along the line about 1.7× slower (a "peel" dial baked into the reef's onset record), with the wall ahead of the curl held until its turn, identically on the CPU and the GPU.

**Architecture:** The reef bake (`reefField.computeOnsetRecord`) carries a per-level delay D along each ray, set at each ray's onset node from its earlier-breaking neighbours; the record stores the stretched time since onset (negative while held) plus a D block. `breaking.onsetTime`/`onsetDelay` read it; `breaking.lifecycle` holds a crest with negative time at its r = 1 shape and fades the live ratio in after its turn. The GPU mirrors the same (D in the ψ texture's spare channels; `onsetTimeNode`, `lifecycleNode`).

**Tech Stack:** TypeScript, three.js WebGPU/TSL, vitest, Electron scratch tools against the Vite dev server.

**Spec:** `docs/superpowers/specs/2026-10-04-peel-stretch-design.md`

## Global Constraints

- peel ≥ 1; 1 = physics as today (the record identical except a zero delay block, lifecycle identical); default 1.7; slider and clamp range [1, 3].
- A section that starts on its own keeps its first break where the physics puts it (D = 0 at a section start).
- The GPU copy of the record gains no new binding: D goes in the ψ₀ texture's z and w channels.
- `ONSET_RECORD_LENGTH` = 1 + 4·ONSET_LEVELS (49); `ONSET_DELAY_OFFSET` = 1 + 3·ONSET_LEVELS.
- Station `tb` is null while negative (held reads as unbroken to the ribbon, spray, sound).
- The ramp after a held turn: r_eff = min(r, 1 + (r − 1)·smoothstep(0, τ_land, tb)), weighted by smoothstep(0, 0.2 s, D).
- Nothing merges to main, and the dial is not retuned, before Andrew signs off the before/after pictures (Task 7).
- Work in worktree `C:/Dev/andrew-dev-personal-projects/ld-peel` on branch `peel-stretch`. Its node_modules is a junction to main's: never `git worktree remove` it without first `cmd /c rmdir ..\ld-peel\node_modules`.
- Code style: match the surrounding comments (prose, Andrew's words quoted with dates), names and idioms.

## Review Focus

- A held section reaching very shallow water before its turn: it must break there, not run into the beach as an unbroken wall (Task 1 adds PEEL_HOLD_RATIO and its test). *(Added beyond the spec; flag it to Andrew.)*
- Two sections breaking toward each other (an A-frame, sections merging): the delay where they meet stays bounded by (peel − 1) × the time since the nearer start (Task 1 test).
- A swell too small to break anywhere: the delay block is all zeros and the record finite (Task 1 test).
- A saved or typed peel of NaN, 0.5, 9 or a string: normalised to [1, 3] (Task 4 test).
- Moving the peel slider re-bakes the field (debounced) and only then; the field key changes with peel and not otherwise (Task 4 test on the pure key function).

---

### Task 1: The delay in the bake

**Files:**
- Modify: `src/breaker/breaking.ts` (record layout constants, near line 258)
- Modify: `src/breaker/reefField.ts` (`ReefFieldRequest` line 10, `computeReefField` line ~369, `computeOnsetRecord` lines ~384-460, export it)
- Test: `src/breaker/peelStretch.test.ts` (new)

**Interfaces:**
- Produces: `ONSET_RECORD_LENGTH = 1 + 4 * ONSET_LEVELS`, `ONSET_DELAY_OFFSET = 1 + 3 * ONSET_LEVELS` (breaking.ts); `ReefFieldRequest.peel?: number`; `export function computeOnsetRecord(f: OnsetInput): Float32Array` with `OnsetInput` = today's input object plus `peel?: number` (default 1); `PEEL_NEIGHBOUR_CELLS = 2`, `PEEL_HOLD_RATIO = 1.6` (reefField.ts). Record semantics: level k's time slot holds the stretched time since onset tbS (negative while held); `rec[ONSET_DELAY_OFFSET + k]` holds D_k (s).

- [ ] **Step 1: Write the failing tests**

Create `src/breaker/peelStretch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ONSET_DELAY_OFFSET, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH } from './breaking';
import { PEEL_HOLD_RATIO, computeOnsetRecord } from './reefField';

/**
 * A synthetic reef: the swell runs +x at C m/s over a 1 m grid; amp/hminBreak rises shoreward as
 * 0.3·exp((x − line(z))/15), so every level breaks along a line x = line(z) + 15·ln(q/0.3): the shelf's breaking line.
 */
const NX = 140, NZ = 220, C = 8;
function shelf(line: (z: number) => number, peel: number, gain = 0.3) {
  const n = NX * NZ, grid = { x0: 0, z0: 0, cellM: 1, nx: NX, nz: NZ };
  const tau = new Float32Array(n), amp = new Float32Array(n), hmin = new Float32Array(n), hminBreak = new Float32Array(n);
  const k = new Float32Array(n), dirX = new Float32Array(n), dirZ = new Float32Array(n), fixed = new Uint8Array(n);
  const psiHere = new Float32Array(n * ONSET_LEVELS).fill(0.05);
  const omega = (2 * Math.PI) / 14;
  for (let row = 0; row < NZ; row++) for (let col = 0; col < NX; col++) {
    const i = row * NX + col;
    tau[i] = col / C; amp[i] = 1; hmin[i] = 6; k[i] = omega / C; dirX[i] = 1; dirZ[i] = 0;
    hminBreak[i] = 1 / (gain * Math.exp((col - line(row)) / 15));
  }
  const order = Uint32Array.from(Array.from({ length: n }, (_, i) => i).sort((a, b) => tau[a] - tau[b] || a - b));
  const rec = computeOnsetRecord({ grid, tau, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, peel });
  const at = (col: number, row: number, j: number): number => rec[(row * NX + col) * ONSET_RECORD_LENGTH + j];
  // Level k's onset time on the ray at `row`, read where the section has long broken (col), and its delay there.
  const onsetT = (row: number, lvl: number, col = 130): number => col / C - at(col, row, 1 + 2 * lvl);
  const delay = (row: number, lvl: number, col = 130): number => at(col, row, ONSET_DELAY_OFFSET + lvl);
  return { rec, at, onsetT, delay };
}
// Level 3 (q ≈ 0.075) breaks 21 m seaward of line(z): every shelf below keeps its breaking line inside the grid (x 6–65),
// off the boundary nodes that break at themselves.
const LVL = 3;

describe('the peel stretch in the onset record (spec 2026-10-04 §1)', () => {
  it('the record has a delay block per level after the ψ₀ block', () => {
    expect(ONSET_RECORD_LENGTH).toBe(1 + 4 * ONSET_LEVELS);
    expect(ONSET_DELAY_OFFSET).toBe(1 + 3 * ONSET_LEVELS);
  });

  it('peel 1 is today: no delay anywhere, every time since onset ≥ 0', () => {
    const { rec } = shelf((z) => 30 + 0.25 * z, 1);
    for (let i = 0; i < NX * NZ; i++) for (let lvl = 0; lvl < ONSET_LEVELS; lvl++) {
      expect(rec[i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET + lvl]).toBe(0);
      expect(rec[i * ONSET_RECORD_LENGTH + 1 + 2 * lvl]).toBeGreaterThanOrEqual(0);
    }
  });

  it('an oblique shelf peels 1/peel as fast along the line', () => {
    const line = (z: number): number => 30 + 0.25 * z;
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    const rate = (s: typeof phys): number => (s.onsetT(160, LVL) - s.onsetT(60, LVL)) / 100;
    expect(rate(slow) / rate(phys)).toBeGreaterThan(1.7 * 0.9);
    expect(rate(slow) / rate(phys)).toBeLessThan(1.7 * 1.1);
  });

  it("a section starting on its own keeps its first break; the delay is constant along a ray past onset", () => {
    // A V: the shelf comes closest at z = 110, so the peak breaks first and peels both ways.
    const line = (z: number): number => 40 + 0.25 * Math.abs(z - 110);
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    expect(slow.onsetT(110, LVL)).toBeCloseTo(phys.onsetT(110, LVL), 1);
    expect(slow.delay(110, LVL)).toBeLessThan(0.05);
    expect(slow.delay(40, LVL, 125)).toBeCloseTo(slow.delay(40, LVL, 135), 4);
    expect(slow.delay(40, LVL)).toBeGreaterThan(0.5);
  });

  it('where two sections meet, the delay stays bounded by (peel − 1) × the time since the nearer start', () => {
    // An inverted V: both ends break first and peel toward z = 110.
    const line = (z: number): number => 55 - 0.25 * Math.abs(z - 110);
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    const nearerStart = Math.min(phys.onsetT(2, LVL), phys.onsetT(NZ - 3, LVL));
    expect(slow.delay(110, LVL)).toBeLessThanOrEqual(0.7 * (phys.onsetT(110, LVL) - nearerStart) + 0.05);
  });

  it(`a held section breaks anyway once its ray is ${PEEL_HOLD_RATIO}× past its level (never an unbroken wall into the shallows)`, () => {
    const line = (z: number): number => 30 + 0.25 * z;
    const slow = shelf(line, 3);
    const q = ONSET_LEVEL_Q[LVL];
    for (let row = 5; row < NZ - 5; row += 10) for (let col = 0; col < NX; col++) {
      const run = slow.at(col, row, 0), tbS = slow.at(col, row, 1 + 2 * LVL);
      if (run >= PEEL_HOLD_RATIO * q * 1.02) expect(tbS, `row ${row} col ${col}`).toBeGreaterThanOrEqual(-1e-4);
    }
  });

  it('a swell too small to break: no delay, all finite', () => {
    const { rec } = shelf((z) => 30 + 0.25 * z, 1.7, 1e-6);
    expect(rec.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < NX * NZ; i++) expect(rec[i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET + LVL]).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/breaker/peelStretch.test.ts`
Expected: FAIL (`computeOnsetRecord` is not exported; `ONSET_DELAY_OFFSET` undefined).

- [ ] **Step 3: The record layout**

In `src/breaker/breaking.ts`, replace the record length constants:

```ts
/** Values per record sample: the running maximum; per level (time since onset, the throw's height ÷ the level's
 * deep-water height); then per level ψ₀ where that level broke (reefField.psiFromStep, plan 2026-10-02); then per level
 * the peel stretch's delay (s, spec 2026-10-04 §1). The time since onset is the stretched one: negative while the section
 * waits its turn. */
export const ONSET_RECORD_LENGTH = 1 + 4 * ONSET_LEVELS;
/** Offset of level 0's ψ₀ in a record sample. */
export const ONSET_PSI_OFFSET = 1 + 2 * ONSET_LEVELS;
/** Offset of level 0's peel delay in a record sample. */
export const ONSET_DELAY_OFFSET = 1 + 3 * ONSET_LEVELS;
```

- [ ] **Step 4: The request and the march**

In `src/breaker/reefField.ts`:

1. Import `ONSET_DELAY_OFFSET` from `./breaking` (add it to the existing import list on line 4).
2. Add to `ReefFieldRequest`:

```ts
  /** The peel stretch (≥ 1; 1 = physics; BreakParams.peel): each part of the line breaks this much later after the part
   * up the line than the reef alone says (spec 2026-10-04 §1). Absent: 1. */
  peel?: number;
```

3. In `computeReefField`, pass it: `computeOnsetRecord({ grid, tau: tau32, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, peel: req.peel ?? 1 })`.
4. Above `computeOnsetRecord` add:

```ts
/** The peel stretch reads the onset nodes already marched within this many cells: the line upstream of a new onset. */
export const PEEL_NEIGHBOUR_CELLS = 2;
/** A held section breaks anyway once its ray's running ratio is this many times its level: it never waits into the shallows. */
export const PEEL_HOLD_RATIO = 1.6;
```

5. Change the signature to `export function computeOnsetRecord(f: { …today's fields…; peel?: number }): Float32Array` and inside, after `const out = new Float32Array(n * R);`, add:

```ts
  const D = ONSET_DELAY_OFFSET, stretch = Math.max(1, f.peel ?? 1) - 1;
  // Each level's onset time T = τ − tb at its onset nodes (NaN elsewhere), for the peel stretch's neighbour search.
  const onsetT = new Float32Array(n * ONSET_LEVELS).fill(Number.NaN);
  /** The delay at onset node i (column col, row row) for level k breaking at T: from the earlier-breaking onset nodes
   * nearby, D_j + (peel − 1)·(T − T_j) at most; 0 where none broke earlier (a section starting on its own). */
  const delayAt = (col: number, row: number, k: number, T: number): number => {
    if (stretch === 0) return 0;
    let best = 0;
    for (let dr = -PEEL_NEIGHBOUR_CELLS; dr <= PEEL_NEIGHBOUR_CELLS; dr++) for (let dc = -PEEL_NEIGHBOUR_CELLS; dc <= PEEL_NEIGHBOUR_CELLS; dc++) {
      const c = col + dc, r = row + dr;
      if ((dc === 0 && dr === 0) || c < 0 || r < 0 || c >= nx || r >= nz) continue;
      const j = r * nx + c, Tj = onsetT[j * ONSET_LEVELS + k];
      if (Tj < T) best = Math.max(best, out[j * R + D + k] + stretch * (T - Tj));
    }
    return best;
  };
```

6. In the `!inside` branch (a node breaking at itself), inside its level loop add, after the ψ line:

```ts
        if (own >= ONSET_LEVEL_Q[k]) onsetT[i * ONSET_LEVELS + k] = f.tau[i];
```

7. Replace the per-level body of the inside branch (from `const q = ONSET_LEVEL_Q[k];` to the end of the `else` block) with:

```ts
      const q = ONSET_LEVEL_Q[k];
      // Back there: the stretched time since onset tbS and the delay D (tbS + D is the physical time). Broken back there:
      // its ratio reached q, or its physical clock is running and its ratio is within RUN_DIP of q (where the running
      // maximum dips a hair under q between rays, the clock would otherwise restart; further below, a running clock is a
      // broken neighbour's, blended in).
      const tbSB = lerp(out, R, 1 + 2 * k), dB = lerp(out, R, D + k);
      const brokenB = runB >= q || (tbSB + dB > 0 && runB >= q * (1 - RUN_DIP));
      const here = throwAt(f.amp[i], f.hmin[i], k);
      if (run < q && !brokenB) {
        out[base + 2 + 2 * k] = here;
        out[base + S + k] = f.psiHere[i * ONSET_LEVELS + k];
      } else if (brokenB) {
        // The delay rides along the ray, so the stretched clock runs as the physical one does. A held section whose ray
        // has gone PEEL_HOLD_RATIO past its level breaks now: the delay drops to the physical time.
        let d = dB, tbS = tbSB + dTau;
        if (tbS < 0 && run >= PEEL_HOLD_RATIO * q) { d = tbS + d; tbS = 0; }
        out[base + 1 + 2 * k] = tbS;
        out[base + D + k] = d;
        // While held the section measures as unbroken (the node's own throw and ψ₀); the throw's window opens at its turn.
        const thrownB = lerp(out, R, 2 + 2 * k), turned = tbSB >= 0;
        out[base + 2 + 2 * k] = tbS < 0 || !turned ? here : tbS <= LIP_THROW_S ? Math.max(thrownB, here) : thrownB;
        out[base + S + k] = tbS < 0 || !turned ? f.psiHere[i * ONSET_LEVELS + k] : lerp(out, R, S + k);
      } else {
        const fr = (q - runB) / (run - runB), tb = (1 - fr) * dTau, T = f.tau[i] - tb;
        const d = delayAt(col, row, k, T);
        onsetT[i * ONSET_LEVELS + k] = T;
        out[base + 1 + 2 * k] = tb - d;
        out[base + D + k] = d;
        const atOnset = throwAt(ampB + fr * (f.amp[i] - ampB), hminB + fr * (f.hmin[i] - hminB), k);
        out[base + 2 + 2 * k] = d > 0 ? here : Math.max(atOnset, here);
        const psiB = lerp(f.psiHere, ONSET_LEVELS, k);
        out[base + S + k] = d > 0 ? f.psiHere[i * ONSET_LEVELS + k] : psiB + fr * (f.psiHere[i * ONSET_LEVELS + k] - psiB);
      }
```

Note on peel 1: `d` is always 0, so `tbS = tbSB + dTau` and `turned` is true wherever the section is broken back there, which reproduces today's branch exactly. Check the old `brokenB` used `tbB > 0`: with d = 0 that is `tbSB + dB > 0`, the same.

- [ ] **Step 5: Run the new tests and the record's existing tests**

Run: `npx vitest run src/breaker/peelStretch.test.ts src/breaker/reefField.test.ts src/breaker/breaking.test.ts`
Expected: PASS (the existing record tests run at peel 1).

If "an oblique shelf peels 1/peel as fast" misses its 10% band, print `rate(slow)/rate(phys)` and the delays along row 60..160 before changing anything: the neighbour radius or the onset-node detection is the likely cause, not the band.

- [ ] **Step 6: Commit**

```bash
git add src/breaker/breaking.ts src/breaker/reefField.ts src/breaker/peelStretch.test.ts
git commit -m "feat(breaker): the peel stretch's delay in the onset record (spec 2026-10-04 §1)"
```

---

### Task 2: Reading the stretched time and the delay

**Files:**
- Modify: `src/breaker/breaking.ts` (`onsetTime` ~line 292; add `onsetDelay`)
- Test: `src/breaker/breaking.test.ts` (the `describe('one clock: …')` block, line ~339)

**Interfaces:**
- Consumes: `ONSET_DELAY_OFFSET` (Task 1).
- Produces: `onsetTime(rec, offset, heightM, p): number | null` (now negative while held; toRun target −D_k); `export function onsetDelay(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number` (0 when unbroken).

- [ ] **Step 1: Write the failing tests**

In `src/breaker/breaking.test.ts`, add `ONSET_DELAY_OFFSET` and `onsetDelay` to the imports from `./breaking`, and inside `describe('one clock: the onset record and the lifecycle', …)` after the "just broken" test add:

```ts
  it('onsetTime and onsetDelay: the stretched clock is negative while the section waits its turn, toRun reads −D (spec 2026-10-04 §2)', () => {
    const run = qMid;
    const rec = recOf(run, (_, j) => (j === k ? -1 : 5), () => 1);
    rec[ONSET_DELAY_OFFSET + k] = 3;
    expect(onsetTime(rec, 0, heightFor(qk), P)).toBeCloseTo(-1, 5);
    // At the running maximum: breaking here now by the reef, its turn in D = 3 s.
    expect(onsetTime(rec, 0, heightFor(run), P)).toBeCloseTo(-3, 5);
    expect(onsetDelay(rec, 0, heightFor(qk), P)).toBeCloseTo(3, 5);
    expect(onsetDelay(rec, 0, heightFor(run), P)).toBeCloseTo(3, 5);
    // Between two broken levels, log-linearly.
    const two = recOf(1.3, () => 0, () => 1);
    two[ONSET_DELAY_OFFSET + k] = 2; two[ONSET_DELAY_OFFSET + k + 1] = 4;
    expect(onsetDelay(two, 0, heightFor(qMid), P)).toBeCloseTo(3, 5);
    expect(onsetDelay(recOf(0.2, () => 1, () => 1), 0, heightFor(0.3), P)).toBe(0);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/breaker/breaking.test.ts -t "stretched clock"`
Expected: FAIL (`onsetDelay` is not exported).

- [ ] **Step 3: Implement**

In `src/breaker/breaking.ts` replace `onsetTime` and add `onsetDelay` after it:

```ts
/** The time (s) since the section at a crest first broke, from the onset record there, for a wave of deep-water height
 * `heightM`: null if it hasn't broken. The peel stretch's (spec 2026-10-04 §2): negative while the section, broken by the
 * reef, waits its turn; just broken by the reef (toRun), it runs to −D, its turn D seconds off. */
export function onsetTime(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const l = onsetLevel(rec, offset, heightM, p);
  if (!l) return null;
  const lo = rec[offset + 1 + 2 * l.k], hi = l.toRun ? -rec[offset + ONSET_DELAY_OFFSET + l.k] : rec[offset + 3 + 2 * l.k];
  return lo + l.w * (hi - lo);
}

/** The peel stretch's delay (s) of the section at a crest (level k toward k + 1 as onsetTime reads; level k's own where
 * toRun): 0 if it hasn't broken. */
export function onsetDelay(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number {
  const l = onsetLevel(rec, offset, heightM, p);
  if (!l) return 0;
  const lo = rec[offset + ONSET_DELAY_OFFSET + l.k], hi = l.toRun ? lo : rec[offset + ONSET_DELAY_OFFSET + l.k + 1];
  return lo + l.w * (hi - lo);
}
```

- [ ] **Step 4: Run the breaking tests**

Run: `npx vitest run src/breaker/breaking.test.ts`
Expected: PASS (the old toRun test has D = 0, so its target is still 0).

- [ ] **Step 5: Commit**

```bash
git add src/breaker/breaking.ts src/breaker/breaking.test.ts
git commit -m "feat(breaker): onsetTime reads the stretched clock, onsetDelay the section's delay (spec 2026-10-04 §2)"
```

---

### Task 3: The held wall in the CPU lifecycle

**Files:**
- Modify: `src/breaker/breaking.ts` (`lifecycle`, line ~404)
- Test: `src/breaker/breaking.test.ts` (same describe block)

**Interfaces:**
- Produces: `lifecycle(r, tb, H, p, rMax = r, rSlurp = r, plunge = 0, thrown = 0, delay = 0): Lifecycle`; `export const PEEL_RAMP_DELAY_S = 0.2`.

- [ ] **Step 1: Write the failing tests**

Add `PEEL_RAMP_DELAY_S` to the imports and these tests:

```ts
  it('a held crest (negative time since onset) stands as the unbroken wave at r = 1, whatever its ratio (spec 2026-10-04 §3)', () => {
    const H = 3, rMax = 2.5;
    const atOne = lifecycle(1 - 1e-9, null, H, P, rMax, 0.5);
    for (const r of [1, 1.3, 2, 4]) {
      const held = lifecycle(r, -0.7, H, P, rMax, 0.5, 0, 0, 1.5);
      for (const key of ['steep', 'stage', 'drain'] as const) expect(held[key], `${key} at r ${r}`).toBeCloseTo(atOne[key], 6);
      expect(held.collapse).toBe(0);
      expect(held.release).toBe(0);
      expect(held.pile).toBe(0);
    }
  });

  it('a delayed section turns without a jump: its ratio past 1 fades in over the landing', () => {
    const H = 3, rMax = 2.5, r = 2;
    const before = lifecycle(r, -0.01, H, P, rMax, r, 0, 0, 1.5), after = lifecycle(r, 0.01, H, P, rMax, r, 0, 0, 1.5);
    for (const key of ['steep', 'stage', 'drain'] as const) expect(Math.abs(after[key] - before[key]), key).toBeLessThan(0.05);
    // Landed, it is the wave at its own ratio again.
    const land = landingEstimate(H, P);
    const late = lifecycle(r, land + 0.01, H, P, rMax, r, 0, 0, 1.5), plain = lifecycle(r, land + 0.01, H, P, rMax, r);
    for (const key of ['steep', 'stage', 'drain', 'collapse'] as const) expect(late[key], key).toBeCloseTo(plain[key], 6);
  });

  it('with no delay the lifecycle is exactly today\'s', () => {
    const H = 3, rMax = 2.5;
    for (const r of [0.7, 1, 1.4, 3]) for (const tb of [null, 0, 0.3, 1, 4]) {
      expect(lifecycle(r, tb, H, P, rMax, r, 0.5, 0.5, 0)).toEqual(lifecycle(r, tb, H, P, rMax, r, 0.5, 0.5));
    }
    expect(PEEL_RAMP_DELAY_S).toBe(0.2);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/breaker/breaking.test.ts -t "held crest|turns without a jump|no delay"`
Expected: FAIL (`PEEL_RAMP_DELAY_S` undefined; a held crest still breaks).

- [ ] **Step 3: Implement**

In `src/breaker/breaking.ts`, above `lifecycle` add:

```ts
/** A delayed section's ratio past 1 fades in over the landing from its turn, weighted in by its delay over this (s), so an
 * undelayed section (and every section at peel 1) reads its ratio exactly as before (spec 2026-10-04 §3). */
export const PEEL_RAMP_DELAY_S = 0.2;
```

Replace the start of `lifecycle` (its signature through the `const t = …` / `if (t === null)` lines) with:

```ts
export function lifecycle(r: number, tb: number | null | undefined, H: number, p: BreakParams, rMax = r, rSlurp = r, plunge = 0, thrown = 0, delay = 0): Lifecycle {
  const land = landingEstimate(H, p);
  // The peel stretch (spec 2026-10-04 §3): a held section (broken by the reef, its turn still to come) stands as the wave
  // at r = 1, the moment it pitches; once its turn comes its ratio past 1 fades in over the landing (no jump).
  const held = typeof tb === 'number' && tb < 0;
  let rE = r;
  if (held) rE = Math.min(r, 1);
  else if (typeof tb === 'number' && delay > 0) rE = r - smoothstep(0, PEEL_RAMP_DELAY_S, delay) * (r - Math.min(r, 1 + (r - 1) * smoothstep(0, land, tb)));
  const own = stageCurves(rE, p), pulled = slurp(rSlurp, p);
  const c0 = { drain: Math.max(own.drain, pulled), collapse: own.collapse };
  const steep = Math.max(steepening(rE, p), pulled), stage = breakingStage(rE, p);
  if (tb === undefined) return { steep, stage, drain: c0.drain, collapse: c0.collapse, release: c0.collapse, ...NO_PILE };
  const t = held ? null : tb ?? (r >= 1 ? 0 : null);
  if (t === null) return { steep, stage, drain: c0.drain, collapse: 0, release: 0, ...NO_PILE };
```

and delete the later `const land = landingEstimate(H, p);` line (it is now computed first). Leave the rest of the function unchanged (it reads `r` and `rMax` for `extent` and the surge, as today).

- [ ] **Step 4: Run the breaking tests**

Run: `npx vitest run src/breaker/breaking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/breaker/breaking.ts src/breaker/breaking.test.ts
git commit -m "feat(breaker): a held crest stands at its pitching shape until its turn, then fades in (spec 2026-10-04 §3)"
```

---

### Task 4: The peel dial (BreakParams, the panel, the re-bake)

**Files:**
- Modify: `src/breaker/breaking.ts` (`BreakParams`, `DEFAULT_BREAK_PARAMS`, `normalizeBreakParams`)
- Modify: `src/dev/DevPanel.ts` (`BREAK_BINDINGS`, line ~164)
- Modify: `src/app/App.ts` (`requestFieldIfNeeded` ~line 1497, the `onBreak` handler ~line 518)
- Create: `src/breaker/fieldKey.ts`; Test: `src/breaker/fieldKey.test.ts`
- Test: `src/breaker/breaking.test.ts` (normalisation)

**Interfaces:**
- Produces: `BreakParams.peel: number` (default 1.7, range [1, 3]); `export function fieldKey(c: { swell: { periodS: number; directionDeg: number }; tideM: number }, reef: unknown, peel: number): string`; App's field request carries `peel: this.breakParams.peel`.

- [ ] **Step 1: Write the failing tests**

Create `src/breaker/fieldKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fieldKey } from './fieldKey';

const c = { swell: { periodS: 14, directionDeg: 225 }, tideM: -0.25 };
describe('the reef field key (what re-bakes the field)', () => {
  it('changes with the peel and the conditions it bakes from, and with nothing else', () => {
    const base = fieldKey(c, { a: 1 }, 1.7);
    expect(fieldKey(c, { a: 1 }, 1.7)).toBe(base);
    expect(fieldKey(c, { a: 1 }, 1.8)).not.toBe(base);
    expect(fieldKey({ ...c, tideM: 0 }, { a: 1 }, 1.7)).not.toBe(base);
    expect(fieldKey(c, { a: 2 }, 1.7)).not.toBe(base);
  });
});
```

In `src/breaker/breaking.test.ts` add (top-level `describe`, using the file's existing imports plus `normalizeBreakParams` and `DEFAULT_BREAK_PARAMS` if not already imported):

```ts
describe('the peel dial (spec 2026-10-04 §1)', () => {
  it('defaults to 1.7 and keeps any saved value usable, within [1, 3]', () => {
    expect(DEFAULT_BREAK_PARAMS.peel).toBe(1.7);
    for (const [raw, want] of [[Number.NaN, 1.7], [0.5, 1], [9, 3], ['x' as unknown as number, 1.7], [2.2, 2.2]] as const) {
      const p = { ...DEFAULT_BREAK_PARAMS, peel: raw };
      normalizeBreakParams(p);
      expect(p.peel, String(raw)).toBe(want);
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/breaker/fieldKey.test.ts src/breaker/breaking.test.ts -t "field key|peel dial"`
Expected: FAIL (module `./fieldKey` missing; `peel` undefined).

- [ ] **Step 3: Implement**

`src/breaker/fieldKey.ts`:

```ts
/** What the reef wave field is baked from (App re-bakes when it changes): the swell's period and direction, the tide,
 * the reef's own params, and the peel stretch (spec 2026-10-04 §1). */
export function fieldKey(c: { swell: { periodS: number; directionDeg: number }; tideM: number }, reef: unknown, peel: number): string {
  return JSON.stringify([c.swell.periodS, c.swell.directionDeg, c.tideM, reef, peel]);
}
```

In `src/breaker/breaking.ts`: add to `BreakParams` (after `randomDial`):

```ts
  /** The peel stretch (spec 2026-10-04, Andrew: "the wave is simply breaking too fast for the surfer to ride"): each part
   * of the line breaks this much later after the part up the line than the reef alone says; 1 is physics. Baked into the
   * reef field's onset record (a change re-bakes it). */
  peel: number;
```

to `DEFAULT_BREAK_PARAMS`: `peel: 1.7,`; and in `normalizeBreakParams` next to the randomDial line: `p.peel = clampTo(p.peel, 1, 3, d.peel);`. (clampTo returns the fallback for a non-finite value; a string is not finite.)

In `src/dev/DevPanel.ts` `BREAK_BINDINGS` add after `randomDial`:

```ts
  peel: { label: 'peel stretch (× slower along the line)', min: 1, max: 3, step: 0.05 },
```

In `src/app/App.ts`:
1. `import { fieldKey } from '../breaker/fieldKey';`
2. In `requestFieldIfNeeded`, replace the key line and the request with:

```ts
    const key = fieldKey(c, this.reefParams, this.breakParams.peel);
    if (!force && key === this.fieldKey) return;
    this.fieldKey = key;
    this.fieldClient.request({ bed: downsample(this.seabed.bathymetry, 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: this.breakParams.peel });
```

3. Add a field next to `reefTimer`: `/** The peel slider re-bakes the field once you stop dragging (as the reef sliders do). */ private peelTimer = 0;`
4. In the `onBreak` handler, after `normalizeBreakParams(this.breakParams);` add:

```ts
          clearTimeout(this.peelTimer);
          this.peelTimer = window.setTimeout(() => this.requestFieldIfNeeded(false), REEF_REBUILD_DEBOUNCE_MS);
```

- [ ] **Step 4: Run the tests, the dev panel's and the typecheck**

Run: `npx vitest run src/breaker src/dev && npx tsc --noEmit -p .`
Expected: PASS, no type errors. (DevPanel.test checks every numeric BreakParams field has a binding; breakingNodes.test checks the uniforms; peel is bake-only and needs no uniform. If a test enumerates BreakParams keys against uniforms, exempt `peel` there with a one-line comment saying it is baked, not a uniform.)

- [ ] **Step 5: Commit**

```bash
git add src/breaker/breaking.ts src/breaker/fieldKey.ts src/breaker/fieldKey.test.ts src/breaker/breaking.test.ts src/dev/DevPanel.ts src/app/App.ts
git commit -m "feat(breaker): the peel dial (default 1.7): a Break slider that re-bakes the reef field (spec 2026-10-04 §1)"
```

---

### Task 5: The CPU model reads the stretch (crestAt, the stations)

**Files:**
- Modify: `src/breaker/setWaveModel.ts` (`crestAt`, line ~257-270)
- Modify: `src/breaker/crestTrace.ts` (`timeSinceOnset`, line ~107)
- Test: `src/breaker/crestTrace.test.ts`

**Interfaces:**
- Consumes: `onsetDelay` (Task 2), `lifecycle(..., delay)` (Task 3).
- Produces: `timeSinceOnset(...)` returns null while the stretched time is negative.

- [ ] **Step 1: Write the failing test**

Append to `src/breaker/crestTrace.test.ts` (add imports as needed: `ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, DEFAULT_BREAK_PARAMS, onsetGain` from `./breaking`, `timeSinceOnset` from `./crestTrace`, `type ReefField` from `./reefField`):

```ts
describe('a held section reads as unbroken to the stations (spec 2026-10-04 §4)', () => {
  it('timeSinceOnset is null while the stretched clock is negative, the time once it runs', () => {
    const k = 5, q = ONSET_LEVEL_Q[k], heightM = 1 / (q * onsetGain(DEFAULT_BREAK_PARAMS));
    const fieldWith = (tb: number): ReefField => {
      const onset = new Float32Array(4 * ONSET_RECORD_LENGTH);
      for (let i = 0; i < 4; i++) { onset[i * ONSET_RECORD_LENGTH] = 1.3; for (let j = 0; j <= k + 1; j++) onset[i * ONSET_RECORD_LENGTH + 1 + 2 * j] = tb; }
      return { grid: { x0: 0, z0: 0, cellM: 1, nx: 2, nz: 2 }, onset } as unknown as ReefField;
    };
    const w = { heightM } as Parameters<typeof timeSinceOnset>[1];
    const ctx = { omega: 1, travelX: 1, travelZ: 0 };
    expect(timeSinceOnset(fieldWith(-0.5), w, 0.5, 0.5, ctx, DEFAULT_BREAK_PARAMS)).toBeNull();
    expect(timeSinceOnset(fieldWith(0.5), w, 0.5, 0.5, ctx, DEFAULT_BREAK_PARAMS)).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/breaker/crestTrace.test.ts -t "held section"`
Expected: FAIL (returns −0.5).

- [ ] **Step 3: Implement**

`src/breaker/crestTrace.ts`, `timeSinceOnset`:

```ts
export function timeSinceOnset(field: ReefField, w: ActiveWave, x: number, z: number, _ctx: WaveContext, p: BreakParams): number | null {
  const rec = sampleOnset(field, x, z, onsetScratch);
  const tb = rec ? onsetTime(rec, 0, w.heightM, p) : null;
  // Held by the peel stretch (spec 2026-10-04 §4): unbroken to the ribbon, the spray and the sound until its turn.
  return tb !== null && tb < 0 ? null : tb;
}
```

and extend its doc comment's first sentence with "; null too while the section waits its turn (the peel stretch)".

`src/breaker/setWaveModel.ts`, in `crestAt`: import `onsetDelay` from `./breaking`; after the `const tb = …` line add

```ts
  const delay = rec ? onsetDelay(rec, 0, w.heightM, o.params) : 0;
```

and pass it as the lifecycle's ninth argument: `lifecycle(r, tb, localHeight(w, fc), params, rMax, rSlurp, smoothstep(PSI_NONE, PSI_MIN, psi), smoothstep(TUBE_THROWN_PSI[0], TUBE_THROWN_PSI[1], psi), delay)`.

- [ ] **Step 4: Run the breaker tests**

Run: `npx vitest run src/breaker src/ride src/whitewater`
Expected: PASS (the tests' fields bake at peel 1).

- [ ] **Step 5: Commit**

```bash
git add src/breaker/crestTrace.ts src/breaker/setWaveModel.ts src/breaker/crestTrace.test.ts
git commit -m "feat(breaker): the CPU sheet holds the wall, the stations wait for the turn (spec 2026-10-04 §4)"
```

---

### Task 6: The GPU mirror

**Files:**
- Modify: `src/breaker/SetWaves.ts` (`setField` ψ texture loop ~line 142; `sampleOnset` ~line 260; the lifecycle call ~line 385; add `onsetTimeAt` beside `onsetPsiAt` line 189)
- Modify: `src/breaker/breakingNodes.ts` (`onsetTimeNode` line 108, `lifecycleNode` line 140)
- Modify: `src/breaker/breaker.selftest.ts`, `src/breaker/ribbon.selftest.ts` (their `getField` bakes at the default peel; one new self-test)
- Create: `tools/_selftest.mjs` (Electron runner)

**Interfaces:**
- Consumes: the record layout (Task 1), `onsetTime`/`onsetDelay` (Task 2), `PEEL_RAMP_DELAY_S` and the lifecycle rule (Task 3), `DEFAULT_BREAK_PARAMS.peel` (Task 4).
- Produces: `onsetTimeNode(rec: { run; tbLo; ampLo; tbHi; ampHi; delayLo; delayHi }, level, heightM, u): { broken; tb; rMax; lipH; delay }`; `lifecycleNode(r, hasRecord, broken, tb, rMax, H, rSlurp, u, sh?, delay?: N)`; `SetWaves.onsetTimeAt(xz: N, heightM: N): N` (vec4(tb, delay, broken ? 1 : 0, 0)).

- [ ] **Step 1: The self-test runner and the failing self-test**

Create `tools/_selftest.mjs`:

```js
// Scratch: runs the in-app GPU self-tests (?selftest=<filter>) in Electron on the RTX and prints the report.
// npx electron tools/_selftest.mjs [--base=http://localhost:5189/] [--filter=breaker]
import { app, BrowserWindow } from 'electron';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/', filter = arg('filter') ?? 'breaker';
app.commandLine.appendSwitch('force_high_performance_gpu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true });
  await win.loadURL(`${base}?frontend=off&selftest=${encodeURIComponent(filter)}`);
  for (let i = 0; i < 600; i++) {
    const text = await win.webContents.executeJavaScript('document.body.innerText');
    if (/GPU self-tests: \d+\/\d+ passed/.test(text)) { console.log(text.slice(text.indexOf('GPU self-tests'))); break; }
    await sleep(1000);
  }
  app.quit();
});
```

Add a launch config for the worktree's dev server in the main checkout's `.claude/launch.json` (name `ld-peel`, `npm --prefix ../ld-peel run dev -- --port 5189 --strictPort`, port 5189) and start it with the preview tool (park the pane on `http://localhost:5189/src/main.ts` so it doesn't render).

In `src/breaker/breaker.selftest.ts` and `src/breaker/ribbon.selftest.ts`, make `getField` bake at the default peel: add `peel: DEFAULT_BREAK_PARAMS.peel` to the `computeReefField({...})` request (import `DEFAULT_BREAK_PARAMS` from `./breaking` in ribbon.selftest.ts if missing). Then register a new self-test in `breaker.selftest.ts` after the ψ₀ one:

```ts
registerSelfTest({
  name: 'breaker: GPU onset time and delay match the CPU on the stretched record (held sections included)',
  async run(renderer) {
    const field = getField();
    const sets = new SetWaves(uniform(0));
    sets.setField(field);
    sets.setBreakParams(DEFAULT_BREAK_PARAMS);
    // Along the left (the line runs toward −z from the peak) and either side of it.
    const points: [number, number][] = [];
    for (let x = -10; x <= 60; x += 5) for (let z = -160; z <= 20; z += 10) points.push([x, z]);
    let worst = 0, at = '', held = 0, flagMismatch = 0;
    for (const h of [REF_BIGGEST.heightM, 1.6 * REF_BIGGEST.heightM]) {
      const { pass, outAttr } = computeAt(points, 1, (xz) => [sets.onsetTimeAt(xz, float(h))]);
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      points.forEach(([x, z], i) => {
        const rec = sampleOnset(field, x, z);
        if (!rec) return;
        const tb = onsetTime(rec, 0, h, DEFAULT_BREAK_PARAMS), d = onsetDelay(rec, 0, h, DEFAULT_BREAK_PARAMS);
        if ((tb !== null) !== (out[i * 4 + 2] > 0.5)) { flagMismatch++; return; }
        if (tb === null) return;
        if (tb < 0) held++;
        const e = Math.max(Math.abs(out[i * 4] - tb), Math.abs(out[i * 4 + 1] - d));
        if (e > worst) { worst = e; at = `h ${h.toFixed(2)} (${x}, ${z}) GPU tb ${out[i * 4].toFixed(4)} CPU ${tb.toFixed(4)}`; }
      });
    }
    return { pass: worst < 1e-3 && flagMismatch === 0 && held > 0, detail: `worst |Δ| ${worst.toExponential(2)} s ${at}; broken-flag mismatches ${flagMismatch}; held samples ${held}` };
  },
});
```

(Import `onsetTime`, `onsetDelay` from `./breaking` in that file.)

- [ ] **Step 2: Run the self-tests to see the new one fail**

Run: `npx electron tools/_selftest.mjs --filter=breaker`
Expected: the new test FAILS (`sets.onsetTimeAt` is not a function, or the delay reads 0), and the CPU-vs-GPU sheet tests FAIL wherever sections are held (the GPU doesn't hold yet). Note which; they must all pass at Step 5.

- [ ] **Step 3: The texture and the sampler**

In `SetWaves.setField`, the ψ texture loop becomes:

```ts
    const pd = this.onsetPsiTex.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      const col = i % FIELD_NX, row = (i - col) / FIELD_NX, r = i * ONSET_RECORD_LENGTH + ONSET_PSI_OFFSET, d = i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET;
      for (let k = 0; k < PSI_TEXELS; k++) {
        const o = ((row * FIELD_NX + col) * PSI_TEXELS + k) * 4;
        // (ψ_k, ψ_{k+1}, D_k, D_{k+1}): the peel stretch's delay rides in the spare channels (spec 2026-10-04 §1).
        pd[o] = f.onset[r + k]; pd[o + 1] = f.onset[r + k + 1]; pd[o + 2] = f.onset[d + k]; pd[o + 3] = f.onset[d + k + 1];
      }
    }
```

(import `ONSET_DELAY_OFFSET`; update the ψ texture's field comment to say the z, w channels hold the delay pair). In `sampleOnset`, add `delayLo: N; delayHi: N` to the return type and `delayLo: psi.z, delayHi: psi.w` to the returned object.

Add beside `onsetPsiAt`:

```ts
  /** The onset record's stretched time since onset, delay and broken flag at xz for a wave of deep-water height heightM,
   * as vec4(tb, delay, broken, 0) (self-tests). Inside an Fn. */
  onsetTimeAt(xz: N, heightM: N): N {
    const level = onsetLevelNode(heightM, this.brk);
    const o = onsetTimeNode(this.sampleOnset(xz, level.k), level, heightM, this.brk);
    return vec4(o.tb, o.delay, select(o.broken, float(1.0), float(0.0)), 0.0);
  }
```

- [ ] **Step 4: The nodes**

In `breakingNodes.ts`, `onsetTimeNode` takes `delayLo`, `delayHi` in `rec` and returns:

```ts
    tb: mix(rec.tbLo, select(toRun, rec.delayLo.negate(), rec.tbHi), w),
    delay: mix(rec.delayLo, select(toRun, rec.delayLo, rec.delayHi), w),
```

(add `delay: N` to its return type and update its doc comment: "the stretched time since onset, negative while held; toward −D where toRun").

`lifecycleNode` gains a last parameter `delay: N = float(0.0)` and, replacing its first lines up to `const t = …`:

```ts
  const drainGrowth = sh?.drainGrowth ?? u.drainGrowth, pileSurge = sh?.pileSurge ?? u.pileSurge, plunge = sh?.plunge ?? float(0.0);
  // landingEstimate: landingTime(H·(1 + troughDrain·δ)), the fall floored at 0.05 m; settleSpan is collapseTime × it.
  const land = max(H.mul(drainGrowth), 0.05).mul(2 / GRAVITY_MS2).sqrt().toVar();
  // The peel stretch (breaking.lifecycle): held (broken, its time still negative) stands at r = 1; after its turn a delayed
  // section's ratio past 1 fades in over the landing.
  const held = hasRecord.and(broken).and(tb.lessThan(0.0));
  const ramp = smoothstep(0.0, land, max(tb, 0.0));
  const rTurned = r.sub(smoothstep(0.0, PEEL_RAMP_DELAY_S, delay).mul(r.sub(min(r, float(1.0).add(r.sub(1.0).mul(ramp))))));
  const rE = select(held, min(r, 1.0), select(broken, rTurned, r)).toVar();
  const pulled = slurpNode(rSlurp, u);
  const steepR = max(steepeningNode(rE, u), pulled), stageR = breakingStageNode(rE, u), own = stageCurvesNode(rE, u);
  const c = { drain: max(own.drain, pulled), collapse: own.collapse };
  const isBroken = hasRecord.and(select(broken, tb.greaterThanEqual(0.0), r.greaterThanEqual(1.0)));
  const t = select(broken, max(tb, 0.0), float(0.0));
```

and delete the old `const land = …` line further down (it is now first). Import `PEEL_RAMP_DELAY_S` from `./breaking`. Everything after uses `t`, `land`, `isBroken` as before. TSL note (repo lesson): `land` and `rE` are shared by several branches, so they are `.toVar()` before any `select` chain reads them.

In `SetWaves` (~line 389) pass `onset.delay` as the new last argument of `lifecycleNode(...)`.

- [ ] **Step 5: Run the self-tests and the unit tests**

Run: `npx electron tools/_selftest.mjs --filter=breaker` then `npx electron tools/_selftest.mjs --filter=ribbon`, then `npx vitest run src/breaker && npx tsc --noEmit -p .`
Expected: every breaker and ribbon self-test PASSES (the new one with `held samples` > 0), the unit tests pass, no type errors. If a sheet test fails only where sections are held, compare the CPU `lifecycle` and the node for that point's (r, tb, delay) before touching tolerances.

- [ ] **Step 6: Commit**

```bash
git add src/breaker/SetWaves.ts src/breaker/breakingNodes.ts src/breaker/breaker.selftest.ts src/breaker/ribbon.selftest.ts tools/_selftest.mjs
git commit -m "feat(breaker): the GPU sea holds the wall and reads the stretched record as the CPU does (spec 2026-10-04 §1-3)"
```

---

### Task 7: Measure, picture, and Andrew's gate

**Files:**
- Modify: `tools/_peelProbe.mjs` (default base 5189; print the per-second peel table itself)
- Create: `tools/_peelShots.mjs` (channel-view frames over time), `tools/_peelRide.mjs` (physics bot)
- Output (not committed): the session scratchpad's `peel-before-after.html`, frames

**Interfaces:**
- Consumes: the app's `window.liquidDreams` (`field`, `rideSet`, `rideWave`, `toggleRide`, `setPaused`, `applyMoment`, `clock`, `rig`, `captureFrame`, `rideWater`, `ride.body`), `ridePhysics.stepRide`.

- [ ] **Step 1: The peel, before and after**

In `tools/_peelProbe.mjs`, after collecting `rows`, group the left section (stations with x < 80) and print, per ~1 s window of onset time, `onset a..b  z a..b  peel <m/s>` (the distance between the window's first and last station ÷ the time), as the session's analysis did. Run it on main's server (5173, physics) and on the branch (5189, peel 1.7), at 5.5 ft and 4 ft:

```bash
npx electron tools/_peelProbe.mjs --base=http://localhost:5173/ --cond={"swell":{"sizeFt":5.5,"periodS":14},"tideM":-0.25}
npx electron tools/_peelProbe.mjs --base=http://localhost:5189/ --cond={"swell":{"sizeFt":5.5,"periodS":14},"tideM":-0.25}
npx electron tools/_peelProbe.mjs --base=http://localhost:5173/ --cond={"swell":{"sizeFt":4,"periodS":15},"tideM":0}
npx electron tools/_peelProbe.mjs --base=http://localhost:5189/ --cond={"swell":{"sizeFt":4,"periodS":15},"tideM":0}
```

Expected: on the branch, the left's sustained peel at ~7–10 m/s (from 12–18), its first section ~15 m/s (from ~25), and the first onset within 0.1 s of main's. Also confirm the rights still close out: run the probe with the right-hand group (x < 80, z > 10) and report its speed (it should still be well above 15 m/s).

- [ ] **Step 2: A ride bot, before and after**

Create `tools/_peelRide.mjs`, an Electron tool on the same pattern as `_peelProbe.mjs` (load, wait for `field`, apply `--cond`, pause, `toggleRide()`), that rides the set's wave with `ridePhysics.stepRide` at 60 Hz for aims of 45°, 60° and 75° off the swell's travel to the left (paddle from arr − 4, pop up 0.4 s after `caught`, then steer to the aim with full lock until within 8°). For each it prints the ride's seconds, its metres along the line (displacement ⟂ to the swell's travel) and how it ended (`wipeout`, `kickout`, or still riding at arr + 20). Run on 5173 and 5189 at 5.5 ft / 14 s.
Expected: on the branch, longer rides along the line for at least two of the three aims, ending in a kickout or still riding rather than an early wipeout.

- [ ] **Step 3: Pictures for Andrew**

Create `tools/_peelShots.mjs`: load, apply `--cond`, pause, `toggleRide()` to call the set, then stop the ride (`toggleRide()` again) and put the camera in the channel looking back up the line at the peak, `a.rig.setPose({ mode: 'free', position: [70, 8, -150], yawDeg: <toward (0, 0)>, pitchDeg: -4 })` (compute the yaw as `atan2(dx, -dz)` in degrees toward the peak); for t = arr − 1 … arr + 9 every 1 s: `a.clock.setTime(t)`, wait 3 frames, `captureFrame()` → `<out><t>.png`. Run on 5173 and 5189 at 5.5 ft. Then write `peel-before-after.html` in the session scratchpad: a static page (no scripts; Andrew's file viewer doesn't run them) with the frames side by side per second (main | peel 1.7), the probe's peel tables under them, and the ride bot's results.
Look at every frame yourself first: the held wall should read as a steep unbroken face ahead of the curl, with no square step or flat shelf where the held part meets the breaking part. If you see one, stop and report it with the frame rather than tuning.

- [ ] **Step 4: Performance and the full suite**

Time `computeReefField` for the app's field at peel 1 and 1.7 (a throwaway vitest, or node with `--experimental-strip-types` like `tools/bakeBreakMap.ts`) and report both times and the record's size (`field.onset.byteLength`). Run `npx tsc --noEmit -p . && npx vitest run`; any failure outside `src/breaker` gets rerun on its own file before it counts (the suite has timing-sensitive tests under load).

- [ ] **Step 5: Commit the tools, and the gate**

```bash
git add tools/_peelProbe.mjs tools/_peelShots.mjs tools/_peelRide.mjs
git commit -m "chore(tools): the peel probe, the channel shots and the ride bot for the peel stretch's before/after"
```

Send Andrew `peel-before-after.html` (SendUserFile) with the numbers in one short message. **Stop here.** The dial is tuned and the branch merged only on his sign-off.
