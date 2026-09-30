# The barrel and the whitewater pile: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape The Womb's barrel to match Andrew's photo (thick lip, thrown far, round tube, face drawn below sea level, lip glowing turquoise), and turn each broken section into a tall, churning whitewater pile. The pile starts at the lip's height (higher after heavy breaks), rises where the lip lands, and halves over about 50 m as it rolls in.

**Architecture:**
- The CPU model stays the source of truth, and the GPU mirrors it term by term:
  - `breaking.ts` / `breakingNodes.ts` (the lifecycle and the per-point shape);
  - `setWaveModel.ts` / `SetWaves.ts` (the sheet);
  - `lipProfile.ts` / `lipProfileNodes.ts` (the barrel).
- The onset record in the reef field gets uneven lags reaching 13 s, plus the wave's amplification at each lag, so every section knows how tall it was when it broke.
- The pile is a lift of the sheet toward a target height, blended in with a smooth max.
- The churn (the lumps on the pile) and the lip's light are render-only.

**Tech Stack:** TypeScript, Three.js WebGPU with TSL nodes, vitest (`npx vitest run …`), `npx tsc --noEmit -p .`, and GPU self-tests at `http://localhost:5173/?selftest` (the browser console prints `[selftest]` lines and a SUMMARY).

**Spec:** `docs/superpowers/specs/2026-09-29-barrel-and-whitewater-design.md` (Task 1 amends it with what the measurements below found).

## Global Constraints

- Branch `barrel-and-whitewater`. Commit after each task. Don't push or merge unless Andrew asks.
- Leave the README's music wording exactly as Andrew wrote it. This plan doesn't touch the README.
- The CPU model is the source of truth. Every GPU term mirrors a CPU term (the same constants, imported, never retyped). The GPU self-tests compare them.
- H is the crest's local wave height (`setWaveModel.localHeight`, with the lateral taper where the sheet applies it).
- Barrel targets, at the peak `(0, 0)`, biggest default wave, when the lip lands:

  | | Target |
  |---|---|
  | lip root | ≈ 0.25·H |
  | tip ÷ root | ≈ 0.4 |
  | lands ahead of the crest | 1.1–1.3·H |
  | tube width ÷ height (width at half height) | 0.9–1.2 |
  | wall back | ≈ 0.25·H, concave |
  | trough | ≥ 0.5·H below still water |

- Pile: `top = floor + (lip × surge − floor) × 0.5^(d / pileHalfM)`.
  - `pileHalfM` defaults to 50; d is metres rolled since the lip landed.
  - The surge is up to `pileSurge` = 0.3: full at the peak's ratio of 3.4, none at ρ = 1.
  - The pile never stands back up.
- Churn and lip light are render detail. The height probe (`displacementNode`) never includes the churn.
- New Break sliders use ranges identical to `normalizeBreakParams` (`DevPanel.test.ts` checks this).
- Measurements taken while writing this plan: the peak's H is 3.16 m and c is 7.55 m/s. With the new defaults (lipThickness 0.25, TIP_THICKNESS_RATIO 0.4, WALL_BACK_H 0.25, troughDrain 0.7, throwStrength 0.6) the barrel measures:

  | root | tip | lands | tube ratio at half height | wall | trough |
  |---|---|---|---|---|---|
  | 0.25·H | 0.4 | 1.19·H | 1.15 | 0.25·H | 0.52·H |

  With those defaults, the whole `src/breaker` + `src/whitewater` suite passes except the two tests that pin the old defaults.

## Review Focus

1. **A small wave breaking in deep water**, where the settled bore is already at or above its lip: there must be no pile, and the surface must be exactly as before. This is pinned in Task 5 ("no pile where the floor is at or above the lip").
2. **Points off the onset record's grid** (the far field, with no record): no pile, no NaN. The GPU and the CPU must agree. Pinned in Task 5 ("off the record grid there is no pile") and Task 7 (the self-test points include the far field).
3. **A section broken longer ago than the record reaches** (tb past 13 s, or Infinity): the pile must hold its 13 s height with no jump at 13 s, and stay finite on the GPU's 1e6 stand-in. Pinned in Task 4 ("the pile holds its 13 s height past the record").
4. **Saved custom settings from before this build** (breaking model 4, water optics without `lipSideSkylight`): these must load with the new defaults, never NaN sliders. Pinned in Task 2 (the model bump) and Task 9 (the water optics merge).
5. **Extremes**: 12 ft / 25 s / −1.5 m tide, and every new slider at both ends. The sheet must stay finite and above the seabed, and the churn must stay bounded. Pinned in Task 5 (the extended extremes and slider tests) and Task 8 (the churn bound).

---

## File Structure

| File | Change |
|---|---|
| `docs/superpowers/specs/2026-09-29-barrel-and-whitewater-design.md` | Amendments (Task 1) |
| `src/breaker/lipProfile.ts` | `barrelMetrics`, new constants, `buildProfile(…, frameBase)` |
| `src/breaker/breaking.ts` | New params, uneven lags, `onsetHeight`, the pile in `lifecycle` and `breakPoint`, `smoothMax`, `pileShape` |
| `src/breaker/reefField.ts`, `fieldWorker.ts` | `onsetAmp`, uneven hops |
| `src/breaker/setWaveModel.ts` | `crestFrame`, `Crest.lipH`, `SetWaveResult.pile`, `BreakOptions.pile`, `crestPileTop` |
| `src/breaker/crestTrace.ts` | Record scratch length |
| `src/breaker/breakingNodes.ts` | Mirrors: uniforms, `onsetTimeNode`, `lifecycleNode`, `breakPointNode` |
| `src/breaker/SetWaves.ts` | One record texture, the pile, churn in the render displacement |
| `src/breaker/BreakingRibbon.ts` | Frame on the pile-free base, churn at the home, the lip's light inputs |
| `src/ocean/waterSurface.ts` | `displacement(…, pile)`, `displacementWithSetFoam` out gains `pile` |
| `src/ocean/OceanSurface.ts` | Churn slope in the sheet's normal |
| `src/whitewater/pileChurn.ts` | New: churn height and slope nodes |
| `src/whitewater/sprayEmitters.ts` | The lip frame on the pile-free sheet |
| `src/ocean/waterOptics.ts`, `src/ocean/waterShading.ts` | Lip transmission by thickness, side skylight |
| `src/dev/DevPanel.ts`, `src/dev/devSettings.ts` | Sliders, `BREAKING_MODEL` 5 |
| Tests | Beside each; GPU in `breaker.selftest.ts` and `ribbon.selftest.ts` |

---

### Task 1: Amend the spec with what the measurements found

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-barrel-and-whitewater-design.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Edit §3.1.**
  - In the bullet under the table, replace "The tube's width runs from the back wall to where the lip lands; its height from the tube's floor (the foot of the face) to the underside of the lip at its highest." with:
    > The tube's width is measured at half its height, from the back wall to the underside of the falling lip; its height from the tube's floor (the foot of the face) to the underside of the lip at its root. (Measured from the wall to where the lip lands, no round tube fits: the landing is 1.2·H ahead and the tube only ~0.9·H tall.)
  - Replace the bullet starting "The throw's speed stays physical" with:
    > Measured at the peak (H 3.16 m, c 7.55 m/s): today the lip lands 0.99·H ahead, 0.12·H thick, the wall 0.11·H back, the trough 0.34·H down, the tube 1.0 wide for its height at half height. With lipThickness 0.25, TIP_THICKNESS_RATIO 0.4, WALL_BACK_H 0.25, troughDrain 0.7 and throwStrength 0.6 (from 0.55: the deeper trough alone reached only 1.12·H), it lands 1.19·H ahead, the tube 1.15, the wall 0.25·H back, the trough 0.52·H down. FOOT_WIDTHS and LAND_CLEARANCE_M stay as they are.
- [ ] **Step 2: Edit §3.2.**
  - Replace the **lip** bullet with:
    > **lip:** how high the crest stood above still water when the section broke: (H_o/2)·(1 + B), where H_o = the deep-water height × the amplification where it broke. The onset record carries the amplification at each lag, and it is read where the lags cross the breaking level, as the time is.
  - Replace the **d** bullet with:
    > **d:** the time since the lip landed (the time since onset less the landing estimate, never below 0) × the local crest speed. From the landing, not the onset, so the pile starts at the lip's full height.
  - In **The clock**, replace "No extra textures (still two RGBA per field node)." with:
    > The record also stores the amplification at each lag (for the lip). On the GPU the whole record is one texture with four RGBA texels per field node, side by side (one binding instead of two; sixteen texel loads per breaking sample instead of eight).
  - In **The ribbon**, append:
    > The ribbon's frame (where the lip lands, when, how fast it throws) is measured on the sheet without the pile: the whitewater rising under the curl must not pull the lip back (with the pile in it, the tube's floor rose ~2 m and the lip flipped up level). The ribbon's points still settle onto the sheet with the pile.
- [ ] **Step 3: Edit §3.3 and §3.4.**
  - In §3.3 **The lip**, append:
    > The path the light takes through the lip scales with its thickness: transmissionThicknessM (the Water folder's slider, 2 m) at 0.3 m of lip. A new Water slider, "lip side skylight" (0.6), sets the skylight through it from the side.
  - In §3.4, replace "with no new field samples: it reads the onset record already sampled for the clock" with:
    > with no new field samples: it reads the onset record already sampled for the clock (now 16 texel loads, from 8)
- [ ] **Step 4: Edit §4.** Add these lines:
  - `src/whitewater/pileChurn.ts` (new: the churn's height and slope);
  - `src/ocean/waterOptics.ts` (the lip's colour by thickness);
  - `src/ocean/waterSurface.ts`, `src/breaker/crestTrace.ts`, `src/breaker/fieldWorker.ts`;
  - `src/whitewater/sprayEmitters.ts` (the lip frame on the pile-free sheet);
  - `src/dev/devSettings.ts` (breaking model 5).
- [ ] **Step 5: Commit.**

```bash
git add docs/superpowers/specs/2026-09-29-barrel-and-whitewater-design.md
git commit -m "docs(spec): barrel + pile amendments from the measurements (tube at half height, lip from the record, d from the landing, pile-free ribbon frame)"
```

---

### Task 2: The barrel's proportions

**Files:**
- Modify: `src/breaker/lipProfile.ts` (constants at lines 40 and 47; add `barrelMetrics` after `buildProfile`)
- Modify: `src/breaker/breaking.ts:40-55` (`DEFAULT_BREAK_PARAMS`)
- Modify: `src/dev/devSettings.ts:31-37` (`BREAKING_MODEL` 4 → 5 and its comment)
- Test: `src/breaker/lipProfile.test.ts`, `src/breaker/breaking.test.ts:280-294`

**Interfaces:**
- Produces:
  - `export interface BarrelMetrics { rootThickness; tipRatio; landAhead; tubeRatio; wallBack; troughBelow; wallBulge }` (numbers);
  - `export function barrelMetrics(p: Profile, H: number): BarrelMetrics`.
- `lipProfileNodes.ts` imports `TIP_THICKNESS_RATIO` and `WALL_BACK_H`, so the GPU follows with no edit.

- [ ] **Step 1: Write the failing test** in `lipProfile.test.ts`. Add `barrelMetrics` to the `./lipProfile` import. Add inside `describe('lipProfile', …)`:

```ts
  it('the barrel matches Andrew\'s photo when the lip lands (spec §3.1: thick lip, thrown far, round tube, face below sea level)', () => {
    const probe = stationAt(0, 0, big, 0);
    const tau = profileFrame(probe.base, probe.input, LIP).tauLand;
    const { base, input } = stationAt(0, 0, big, tau);
    const m = barrelMetrics(buildProfile(base, input, LIP), input.H);
    console.log(`barrel at the peak: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(3)])))}`);
    expect(m.rootThickness, 'lip root (× H)').toBeGreaterThan(0.22);
    expect(m.rootThickness).toBeLessThan(0.28);
    expect(m.tipRatio, 'tip ÷ root').toBeCloseTo(0.4, 2);
    expect(m.landAhead, 'lands ahead of the crest (× H)').toBeGreaterThanOrEqual(1.1);
    expect(m.landAhead).toBeLessThanOrEqual(1.3);
    expect(m.tubeRatio, 'tube width at half height ÷ height').toBeGreaterThanOrEqual(0.9);
    expect(m.tubeRatio).toBeLessThanOrEqual(1.2);
    expect(m.wallBack, 'wall behind the crest (× H)').toBeGreaterThan(0.2);
    expect(m.wallBack).toBeLessThan(0.3);
    expect(m.wallBulge, 'the wall curves concave up into the lip (m behind its chord)').toBeGreaterThan(0.02 * input.H);
    expect(m.troughBelow, 'trough below still water (× H)').toBeGreaterThanOrEqual(0.5);
  });
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run src/breaker/lipProfile.test.ts -t "matches Andrew"`
Expected: FAIL, with "barrelMetrics is not a function" (or, once it exists, rootThickness ≈ 0.12).

- [ ] **Step 3: Add `barrelMetrics`** after `buildProfile` in `lipProfile.ts`:

```ts
/** The barrel's proportions at one moment (spec §3.1; tests and the gallery). Lengths are × H. */
export interface BarrelMetrics {
  /** The lip's thickness at its root (× H), and at its tip as a fraction of the root. */
  rootThickness: number;
  tipRatio: number;
  /** Where the lip lands, ahead of the crest (× H). */
  landAhead: number;
  /** The tube's width at half its height (the wall to the underside of the falling lip) ÷ its height (the foot to the
   * lip's underside at the root). NaN until the lip has fallen below half the tube's height. */
  tubeRatio: number;
  /** How far the back wall stands behind the crest (× H). */
  wallBack: number;
  /** How far the water in front of the face is drawn below still water (× H). */
  troughBelow: number;
  /** The most the wall bulges behind the straight line from W to the lip's root R (m; > 0: concave up into the lip). */
  wallBulge: number;
}

export function barrelMetrics(p: Profile, H: number): BarrelMetrics {
  const f = p.frame, n = PROFILE_SEGMENTS;
  const faceStart = n.front, wallStart = n.front + n.face, wallEnd = wallStart + n.wall, capEnd = wallEnd + n.under + n.cap;
  let wallX = Infinity, trough = Infinity, bulge = -Infinity;
  for (let j = faceStart; j < wallEnd; j++) wallX = Math.min(wallX, p.points[j][0]);
  for (let j = 0; j < wallStart; j++) trough = Math.min(trough, p.points[j][1]);
  for (let j = wallStart; j < wallEnd; j++) {
    const [x, y] = p.points[j];
    const chordX = f.W[0] + ((f.R[0] - f.W[0]) * (y - f.W[1])) / (f.R[1] - f.W[1] || 1e-9);
    bulge = Math.max(bulge, chordX - x);
  }
  const mid = (f.F[1] + f.R[1]) / 2;
  const crossAt = (a: number, b: number): number => {
    for (let j = a; j < b; j++) {
      const [x0, y0] = p.points[j], [x1, y1] = p.points[j + 1];
      if ((y0 - mid) * (y1 - mid) <= 0 && y0 !== y1) return x0 + ((x1 - x0) * (mid - y0)) / (y1 - y0);
    }
    return NaN;
  };
  const width = crossAt(wallEnd, capEnd - 1) - crossAt(faceStart, wallEnd - 1);
  return {
    rootThickness: f.eRoot / H,
    tipRatio: f.eRoot > 0 ? lipThicknessAt(f, 1) / f.eRoot : 0,
    landAhead: (f.vj * f.tauLand) / H,
    tubeRatio: width / (f.R[1] - f.F[1]),
    wallBack: (f.K[0] - wallX) / H,
    troughBelow: -trough / H,
    wallBulge: bulge,
  };
}
```

- [ ] **Step 4: Run it again.** Expected: FAIL on the numbers (root ≈ 0.12, lands ≈ 0.99, wall ≈ 0.11, trough ≈ 0.27). This confirms the metric reads today's barrel.

- [ ] **Step 5: Set the new proportions.**
  - In `lipProfile.ts`:
    - `TIP_THICKNESS_RATIO = 0.4`;
    - `WALL_BACK_H = 0.25`;
    - update the two doc comments ("…at the tip, as a fraction of its thickness at the root (Andrew's photo: a thick lip all the way out)"; "The tube's back wall W: this many H behind the crest at full throw (a round tube, spec §3.1)…").
  - In `breaking.ts` `DEFAULT_BREAK_PARAMS`: `troughDrain: 0.7`, `throwStrength: 0.6`, `lipThickness: 0.25`.
  - In `breaking.test.ts` (lines 287 and 293), change both `toEqual([0.55, 0.12, 1.8, 0.7])` to `toEqual([0.6, 0.25, 1.8, 0.7])`.
  - In `devSettings.ts`:
    - set `BREAKING_MODEL = 5`;
    - append to its comment: "; model 5: the barrel's new proportions (trough drain 0.7, throw 0.6, lip 0.25·H) and the whitewater pile";
    - if `devSettings.test.ts` pins the number, update it there too (`grep -n "BREAKING_MODEL\|breakingModel" src/dev/devSettings.test.ts`).

- [ ] **Step 6: Run the barrel test and the whole breaker and whitewater suites.**

Run: `npx vitest run src/breaker src/whitewater src/dev`
Expected: all pass. The barrel line logs roughly root 0.25, tip 0.4, lands 1.19, tube 1.15, wall 0.25, trough 0.52. If any other test fails, stop and report it with its output. Don't loosen it.

- [ ] **Step 7: Type-check and commit.**

```bash
npx tsc --noEmit -p .
git add src/breaker/lipProfile.ts src/breaker/lipProfile.test.ts src/breaker/breaking.ts src/breaker/breaking.test.ts src/dev/devSettings.ts src/dev/devSettings.test.ts
git commit -m "feat(barrel): the photo's proportions: lip 0.25·H thick, tip 40%, lands 1.2·H out, round tube, trough 0.5·H down"
```

---

### Task 3: The onset record reaches 13 s and remembers how tall the wave was

**Files:**
- Modify: `src/breaker/breaking.ts:213-246` (lags, `onsetTime`; add `onsetHeight`)
- Modify: `src/breaker/reefField.ts:29-31, 245-340` (`onsetAmp`, uneven hops, `sampleOnset`)
- Modify: `src/breaker/fieldWorker.ts:11` (transfer `field.onsetAmp`)
- Modify: `src/breaker/setWaveModel.ts:88-92` (`breakOptions` scratch length)
- Modify: `src/breaker/crestTrace.ts:94` (scratch length)
- Test: `src/breaker/breaking.test.ts:296-312`, `src/breaker/reefField.test.ts:151-190`

**Interfaces:**
- Produces, in `breaking.ts`:
  - `export const ONSET_LAG_TIMES_S: readonly number[] = [0, 0.4, 0.8, 1.2, 2, 3.5, 7, 13]`;
  - `export const ONSET_LAGS = 8`;
  - `export const ONSET_REACH_S = 13`;
  - `export const ONSET_RECORD_LENGTH = 16`;
  - `onsetTime(rec, offset, heightM, p): number | null` (same signature, uneven lags);
  - `export function onsetHeight(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null`.
- `ONSET_LAG_S` is removed.
- Produces, in `reefField.ts`: `ReefField.onsetAmp: Float32Array` (n × ONSET_LAGS). `sampleOnset(f, x, z, out = new Float32Array(ONSET_RECORD_LENGTH))` fills `out[0..7]` with the running maxima and `out[8..15]` with the amplification.
- Record layout, for everyone downstream: `rec[offset + j]` is the running max of amp/hminBreak at lag j, and `rec[offset + ONSET_LAGS + j]` is amp at lag j.

- [ ] **Step 1: Rewrite the `onsetTime` test for the uneven lags, and add `onsetHeight` tests.**
  - In `breaking.test.ts`, replace `ONSET_LAG_S` in the import with `ONSET_LAG_TIMES_S, ONSET_REACH_S, onsetHeight`.
  - Replace the body of `it('onsetTime: null below the breaking level, …')` with:

```ts
    expect(onsetTime(lags(0.4, 0.3, 0.2, 0.1, 0, 0, 0, 0), 0, height, P)).toBeNull();
    expect(onsetTime(lags(0.5, 0.4, 0, 0, 0, 0, 0, 0), 0, height, P)).toBe(0);
    // Lag 1 (0.4 s) at the level, lag 2 below it: 0.4 s ago.
    expect(onsetTime(lags(0.7, 0.5, 0.45, 0.4, 0, 0, 0, 0), 0, height, P)).toBeCloseTo(ONSET_LAG_TIMES_S[1], 6);
    // Halfway between lags 1 and 2 (0.4 and 0.8 s).
    expect(onsetTime(lags(0.7, 0.6, 0.4, 0.3, 0, 0, 0, 0), 0, height, P)).toBeCloseTo(0.6, 6);
    // Halfway between the coarse lags 5 and 6 (3.5 and 7 s).
    expect(onsetTime(lags(0.7, 0.7, 0.7, 0.7, 0.7, 0.6, 0.4, 0.3), 0, height, P)).toBeCloseTo(5.25, 6);
    expect(onsetTime(lags(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7), 0, height, P)).toBe(Infinity);
    // The first lag below the level ends it, whatever is further back.
    expect(onsetTime(lags(0.7, 0.3, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9), 0, height, P)).toBeCloseTo(0.2, 6);
    // Read from an offset (the record is interleaved per node).
    expect(onsetTime(lags(9, 9, 0.7, 0.6, 0.4, 0.3, 0, 0, 0, 0), 2, height, P)).toBeCloseTo(0.6, 6);
    expect(ONSET_LAG_TIMES_S.at(-1)).toBe(ONSET_REACH_S);
```

  - Add, after it:

```ts
  it('onsetHeight: the wave\'s height where the section broke, read where the lags cross the level (as the time is)', () => {
    // Running maxima, then amplification, per lag.
    const rec = lags(0.7, 0.6, 0.4, 0.3, 0, 0, 0, 0, 2, 1.8, 1.6, 1.4, 1, 1, 1, 1);
    expect(onsetHeight(rec, 0, height, P)).toBeCloseTo(height * 1.7, 6); // halfway between lags 1 and 2
    expect(onsetHeight(lags(0.4, 0.3, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2), 0, height, P)).toBeNull();
    // Past the record: the far lag's.
    expect(onsetHeight(lags(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 2, 2, 2, 2, 2, 2, 2, 1.25), 0, height, P)).toBeCloseTo(height * 1.25, 6);
    // From an offset.
    expect(onsetHeight(lags(9, 9, ...Array.from(rec)), 2, height, P)).toBeCloseTo(height * 1.7, 6);
  });
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run src/breaker/breaking.test.ts -t "onset"`
Expected: FAIL, with "onsetHeight is not a function" and the 0.4/0.6/5.25 expectations.

- [ ] **Step 3: Implement the uneven lags in `breaking.ts`.** Replace the block from `export const ONSET_LAGS = 8;` to the end of `onsetTime`:

```ts
/** The lags' times (s upstream of the node): fine while the lip throws and the curl collapses, coarse over the pile's
 * slow decay, 13 s (≈ 90 m) back at the far end. */
export const ONSET_LAG_TIMES_S: readonly number[] = [0, 0.4, 0.8, 1.2, 2, 3.5, 7, 13];
export const ONSET_LAGS = ONSET_LAG_TIMES_S.length;
/** How far back the record reaches (s): a section broken longer ago reads Infinity. */
export const ONSET_REACH_S = ONSET_LAG_TIMES_S[ONSET_LAGS - 1];
/** Values per record sample: ONSET_LAGS running maxima, then ONSET_LAGS amplifications (reefField.sampleOnset). */
export const ONSET_RECORD_LENGTH = 2 * ONSET_LAGS;

/** Where the lags cross the breaking level: the first lag j below it and the fraction phi of the way from j − 1; j =
 * ONSET_LAGS once every lag is at or above it; null if the section hasn't broken. */
function onsetCrossing(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): { j: number; phi: number } | null {
  const g = heightM * onsetGain(p);
  if (!(g > 0) || !(g * rec[offset] >= 1)) return null;
  for (let j = 1; j < ONSET_LAGS; j++) {
    const a = g * rec[offset + j - 1], b = g * rec[offset + j];
    if (b < 1) return { j, phi: Math.min(1, Math.max(0, (a - 1) / Math.max(a - b, 1e-9))) };
  }
  return { j: ONSET_LAGS, phi: 0 };
}
```

  Then rewrite `onsetTime` (update its doc comment to "…Infinity if it broke longer ago than the record reaches (ONSET_REACH_S). Linear between the lags' times…"):

```ts
export function onsetTime(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const c = onsetCrossing(rec, offset, heightM, p);
  if (!c) return null;
  if (c.j === ONSET_LAGS) return Infinity;
  const t0 = ONSET_LAG_TIMES_S[c.j - 1];
  return t0 + c.phi * (ONSET_LAG_TIMES_S[c.j] - t0);
}

/**
 * The wave's height (m) where the section broke: heightM × the amplification the record carries (rec[offset +
 * ONSET_LAGS + j]), interpolated where the lags cross the breaking level as onsetTime interpolates the time; the far lag's
 * once the section broke beyond the record's reach; null if it hasn't broken. At onset ρ = 1, so this height is the
 * breaking height there, uncapped by the depth (it is below 0.78·hmin wherever hminBreak is hmin).
 */
export function onsetHeight(rec: ArrayLike<number>, offset: number, heightM: number, p: Pick<BreakParams, 'gamma' | 'delta'>): number | null {
  const c = onsetCrossing(rec, offset, heightM, p);
  if (!c) return null;
  const amp = offset + ONSET_LAGS;
  if (c.j === ONSET_LAGS) return heightM * rec[amp + ONSET_LAGS - 1];
  return heightM * (rec[amp + c.j - 1] + c.phi * (rec[amp + c.j] - rec[amp + c.j - 1]));
}
```

  Also update the record's doc comment above the lags ("…at the node itself and at the lag times ONSET_LAG_TIMES_S upstream, with the wave's amplification at each (onsetHeight)…").

- [ ] **Step 4: Run the unit tests.**

Run: `npx vitest run src/breaker/breaking.test.ts`
Expected: PASS. (`breakingNodes.ts` still imports `ONSET_LAG_S`, and `tsc` will flag it until Task 7. That's fine for vitest, which only loads what each test imports. `breakingNodes.test.ts` may fail to import: if it does, add Step 4a.)

- [ ] **Step 4a (only if `breakingNodes.test.ts` fails to import):** In `breakingNodes.ts`, replace the `ONSET_LAG_S` import with `ONSET_LAG_TIMES_S`. In `onsetTimeNode`, make this interim change (Task 7 rewrites the node):
  - `tb = tb.add(select(alive, seg, float(0.0)))` becomes `tb = tb.add(select(alive, seg.mul(ONSET_LAG_TIMES_S[j] - ONSET_LAG_TIMES_S[j - 1]), float(0.0)))`;
  - the return's `tb.mul(ONSET_LAG_S)` becomes `tb`.

- [ ] **Step 5: Write the failing record tests** in `reefField.test.ts`. Import `ONSET_LAG_TIMES_S, ONSET_RECORD_LENGTH` from `./breaking`. Add inside `describe('the onset record', …)`:

```ts
  it('each lag carries the amplification where the crest was that long ago (5% to 3.5 s back, 10% at 7 and 13 s)', () => {
    let checked = 0;
    for (const [px, pz] of [[11, -30], [27, -75], [25, 28], [0, 0]] as const) {
      // 20 m inshore of the ledge point.
      let x = px, z = pz;
      for (let d = 0; d < 20; d += 0.5) { const s = sampleField(f, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5; }
      const rec = sampleOnset(f, x, z)!;
      expect(rec.length).toBe(ONSET_RECORD_LENGTH);
      const tau0 = sampleField(f, x, z).tau;
      ONSET_LAG_TIMES_S.forEach((lagS, j) => {
        // March back along the ray in 0.25 m steps to where the crest was lagS earlier.
        let bx = x, bz = z;
        for (let n = 0; n < 4000 && sampleField(f, bx, bz).tau > tau0 - lagS; n++) { const s = sampleField(f, bx, bz); bx -= s.dirX * 0.25; bz -= s.dirZ * 0.25; }
        const want = sampleField(f, bx, bz).amp, got = rec[ONSET_LAGS + j];
        expect(Math.abs(got - want) / want, `(${px}, ${pz}) lag ${lagS} s: record ${got.toFixed(3)} vs ray ${want.toFixed(3)}`).toBeLessThan(lagS <= 3.5 ? 0.05 : 0.1);
        checked++;
      });
    }
    expect(checked).toBe(4 * ONSET_LAG_TIMES_S.length);
  });
```

  Run: `npx vitest run src/breaker/reefField.test.ts`
  Expected: FAIL (the record is still 8 long).

- [ ] **Step 6: Implement it in `reefField.ts`.**
  - Import `ONSET_LAG_TIMES_S, ONSET_RECORD_LENGTH` (drop `ONSET_LAG_S`).
  - Add to `ReefField`, after `onset`:

```ts
  /** The wave's amplification at the same lags (n × ONSET_LAGS): where the crest was, for breaking.onsetHeight. */
  onsetAmp: Float32Array;
```

  - Update `onset`'s doc comment to say "at the lag times breaking.ONSET_LAG_TIMES_S upstream".
  - Change `computeOnsetRecord` to return `{ onset: Float32Array; onsetAmp: Float32Array }`. Add above it:

```ts
/** A hop back along the ray is never longer than this (s): a straight hop cuts across a ray that curves over the ledge. */
const MAX_HOP_S = 1;
```

  - Replace the per-node loop body with:

```ts
    const i = row * nx + col;
    let x = grid.x0 + col * grid.cellM, z = grid.z0 + row * grid.cellM;
    const tau0 = f.tau[i];
    out[i * ONSET_LAGS] = run[i];
    outAmp[i * ONSET_LAGS] = f.amp[i];
    for (let j = 1; j < ONSET_LAGS; j++) {
      const from = ONSET_LAG_TIMES_S[j - 1], to = ONSET_LAG_TIMES_S[j];
      const hops = Math.max(1, Math.ceil((to - from) / MAX_HOP_S - 1e-9));
      for (let h = 1; h <= hops; h++) {
        // Straight back along the ray to arrival time t, from where the last hop landed. Each hop aims at an absolute
        // time, so a hop's error does not carry into the next.
        const t = tau0 - (from + ((to - from) * h) / hops);
        cell(x, z);
        const dx = lerp(dirX), dz = lerp(dirZ), len = Math.hypot(dx, dz) || 1;
        const back = ((lerp(f.tau) - t) * f.omega) / Math.max(lerp(f.k), 1e-4);
        x -= (dx / len) * back;
        z -= (dz / len) * back;
      }
      cell(x, z);
      out[i * ONSET_LAGS + j] = lerp(run);
      outAmp[i * ONSET_LAGS + j] = lerp(f.amp);
    }
```

  - Keep the suffix max over `out` only, not over `outAmp`. Declare `const outAmp = new Float32Array(n * ONSET_LAGS);` beside `out`, and `return { onset: out, onsetAmp: outAmp };`.
  - Update the function's doc comment: "lag j is R at the point the crest was over ONSET_LAG_TIMES_S[j] earlier, reached in hops of at most MAX_HOP_S…; the amplification there goes into onsetAmp (no running maximum)".
  - In `computeReefField`: `const { onset, onsetAmp } = computeOnsetRecord(…)`, and return `onsetAmp` beside `onset`.
  - Rewrite `sampleOnset`:

```ts
export function sampleOnset(f: ReefField, x: number, z: number, out = new Float32Array(ONSET_RECORD_LENGTH)): Float32Array | null {
  const g = f.grid;
  if (!(x >= g.x0 && z >= g.z0 && x <= g.x0 + (g.nx - 1) * g.cellM && z <= g.z0 + (g.nz - 1) * g.cellM)) return null;
  const fx = Math.min(g.nx - 1, (x - g.x0) / g.cellM), fz = Math.min(g.nz - 1, (z - g.z0) / g.cellM);
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const L = ONSET_LAGS;
  const lerp4 = (a: Float32Array, j: number): number => {
    const top = a[i * L + j] + (a[(i + 1) * L + j] - a[i * L + j]) * tx;
    const bottom = a[(i + g.nx) * L + j] + (a[(i + g.nx + 1) * L + j] - a[(i + g.nx) * L + j]) * tx;
    return top + (bottom - top) * tz;
  };
  for (let j = 0; j < L; j++) { out[j] = lerp4(f.onset, j); out[L + j] = lerp4(f.onsetAmp, j); }
  return out;
}
```

  - Update its doc comment to "…ONSET_RECORD_LENGTH values: the running maxima, then the amplification…".
  - In `fieldWorker.ts`, add `field.onsetAmp.buffer` (following the pattern of the existing entries) to `transfer`.
  - In `setWaveModel.breakOptions`, change the scratch to `new Float32Array(ONSET_RECORD_LENGTH)` (import it).
  - In `crestTrace.ts`, change `onsetScratch` the same way (import `ONSET_RECORD_LENGTH`).
  - Run `grep -rn "onset: " src --include=*.ts` for hand-built `ReefField` objects in tests, and add `onsetAmp: new Float32Array(<same length>)` beside each.

- [ ] **Step 7: Run the record and field suites.**

Run: `npx vitest run src/breaker/reefField.test.ts src/breaker/breakingField.test.ts src/breaker/crestTrace.test.ts src/breaker/lipProfile.test.ts`
Expected: PASS. The one-clock tests still pass: the collapse now reads lags 0.8, 1.2, 2 and 3.5 s where it read 0.7-spaced ones.

- [ ] **Step 8: Measure the field build.**

Run: `npx vitest run src/breaker/reefField.test.ts --reporter=verbose`. Compare the `computeReefField` time with `git stash` (before) and without it. If the tests don't log the time, time one call in a scratch test (in the scratchpad, never committed).
Expected: at most +50% (about 1.6 s → ≤ 2.4 s). If more, report it before continuing.

- [ ] **Step 9: Commit.**

```bash
git add src/breaker/breaking.ts src/breaker/breaking.test.ts src/breaker/reefField.ts src/breaker/reefField.test.ts src/breaker/fieldWorker.ts src/breaker/setWaveModel.ts src/breaker/crestTrace.ts src/breaker/breakingNodes.ts
git commit -m "feat(record): onset lags reach 13 s (fine early, coarse late) and carry the wave's amplification (the lip's height)"
```

---

### Task 4: The pile's clock (lifecycle) and its sliders

**Files:**
- Modify: `src/breaker/breaking.ts` (`BreakParams`, `DEFAULT_BREAK_PARAMS`, `normalizeBreakParams`, `Lifecycle`, `lifecycle`)
- Modify: `src/dev/DevPanel.ts:122-136` (`BREAK_BINDINGS`)
- Test: `src/breaker/breaking.test.ts`, `src/dev/DevPanel.test.ts` (it checks every numeric BreakParams field automatically)

**Interfaces:**
- Consumes: `ONSET_REACH_S` (Task 3).
- Produces:
  - `BreakParams.pileHalfM` (50), `.pileSurge` (0.3), `.churnSize` (0.2), `.churnSpeed` (1);
  - constants `PILE_RISE_S = 0.5`, `SURGE_RISE_S = 0.5`, `SURGE_FALL_S = 1.5`, `SURGE_FULL_RATIO = 3.4`;
  - `Lifecycle` gains `pile`, `pileReach`, `surge`, `decay` (numbers);
  - `lifecycle(r, tb, H, p, rMax = r, c = 0)`, where c is the crest speed (m/s).

- [ ] **Step 1: Write the failing tests** in `breaking.test.ts`, inside `describe('one clock: …')`. Import `PILE_RISE_S, SURGE_RISE_S, SURGE_FALL_S, ONSET_REACH_S` (the last may already be imported). First change the existing no-record test's expectation to:

```ts
      expect(lifecycle(r, undefined, 3, P)).toEqual({ steep: steepening(r, P), stage: breakingStage(r, P), drain: c.drain, collapse: c.collapse, pile: 0, pileReach: 0, surge: 1, decay: 1 });
```

  Then add:

```ts
  it('the pile rises over PILE_RISE_S from the landing, partial on a section that broke only a little', () => {
    const H = 3, land = landingEstimate(H, P), c = 7;
    expect(lifecycle(3, land, H, P, 3, c).pile).toBe(0);
    expect(lifecycle(3, land + PILE_RISE_S, H, P, 3, c).pile).toBeCloseTo(breakingStage(3, P), 12);
    expect(lifecycle(1.1, land + PILE_RISE_S, H, P, 1.1, c).pile).toBeCloseTo(breakingStage(1.1, P), 12);
    expect(lifecycle(1.1, land + PILE_RISE_S, H, P, 1.1, c).pile).toBeLessThan(0.5);
    expect(lifecycle(0.9, null, H, P).pile).toBe(0);
  });
  it('the pile\'s top moves from the crest to the landing spot as the curl collapses (pileReach)', () => {
    const H = 3, land = landingEstimate(H, P), span = settleSpan(H, P);
    expect(lifecycle(3, land, H, P, 3, 7).pileReach).toBe(0);
    expect(lifecycle(3, land + span / 2, H, P, 3, 7).pileReach).toBeCloseTo(0.5, 12);
    expect(lifecycle(3, land + span, H, P, 3, 7).pileReach).toBe(1);
  });
  it('the surge lifts the pile above the lip on the heaviest breaks only, then eases back', () => {
    const H = 3, land = landingEstimate(H, P);
    expect(lifecycle(3.4, land + SURGE_RISE_S, H, P, 3.4, 7).surge).toBeCloseTo(1 + P.pileSurge, 12);
    expect(lifecycle(1.05, land + SURGE_RISE_S, H, P, 1.05, 7).surge).toBeLessThan(1.001);
    expect(lifecycle(3.4, land + SURGE_RISE_S + SURGE_FALL_S, H, P, 3.4, 7).surge).toBe(1);
    expect(lifecycle(3.4, land, H, P, 3.4, 7).surge).toBe(1);
  });
  it('the pile halves every pileHalfM it rolls past the landing, and holds its 13 s height past the record', () => {
    const H = 3, land = landingEstimate(H, P), c = 7;
    expect(lifecycle(3, land, H, P, 3, c).decay).toBe(1);
    expect(lifecycle(3, land + P.pileHalfM / c, H, P, 3, c).decay).toBeCloseTo(0.5, 12);
    const atReach = lifecycle(3, ONSET_REACH_S, H, P, 3, c).decay;
    expect(lifecycle(3, Infinity, H, P, 3, c).decay).toBeCloseTo(atReach, 12);
    expect(lifecycle(3, 1e6, H, P, 3, c).decay).toBeCloseTo(atReach, 12);
    let prev = 2;
    for (let tb = 0; tb <= 20; tb += 0.1) { const d = lifecycle(3, tb, H, P, 3, c).decay; expect(d).toBeLessThanOrEqual(prev); prev = d; }
  });
```

  In the existing "continuous across the onset, only runs forward" test, extend the monotone key list to `['steep', 'stage', 'drain', 'collapse', 'pile', 'pileReach'] as const`.

  In `describe('normalizeBreakParams')`, add:

```ts
  it('fills the pile and churn fields a saved setting from before them lacks, and clamps them', () => {
    const old = { ...P } as Partial<BreakParams>;
    delete old.pileHalfM; delete old.pileSurge; delete old.churnSize; delete old.churnSpeed;
    normalizeBreakParams(old as BreakParams);
    expect([old.pileHalfM, old.pileSurge, old.churnSize, old.churnSpeed]).toEqual([50, 0.3, 0.2, 1]);
    const wild = { ...P, pileHalfM: 1, pileSurge: 9, churnSize: -1, churnSpeed: 99 };
    normalizeBreakParams(wild);
    expect([wild.pileHalfM, wild.pileSurge, wild.churnSize, wild.churnSpeed]).toEqual([10, 0.6, 0, 3]);
  });
```

  (Import `type BreakParams` if it isn't already.)

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run src/breaker/breaking.test.ts`
Expected: FAIL (the fields don't exist).

- [ ] **Step 3: Implement in `breaking.ts`.**
  - Add to `BreakParams`, after `ribbonOnset`:

```ts
  /** The whitewater pile halves its height above its floor every this many metres it rolls past the landing (m). */
  pileHalfM: number;
  /** How far the pile surges above the lip right after the landing, on the heaviest breaks (× the lip; 0 on a shoulder). */
  pileSurge: number;
  /** The pile's churn (render only; the CPU model ignores it): lumps up to this fraction of the pile's height… */
  churnSize: number;
  /** …churning at this rate (× CHURN_RATE_PER_S, pileChurn.ts). */
  churnSpeed: number;
```

  - Defaults: `pileHalfM: 50, pileSurge: 0.3, churnSize: 0.2, churnSpeed: 1`.
  - In `normalizeBreakParams`:

```ts
  p.pileHalfM = clampTo(p.pileHalfM, 10, 150, d.pileHalfM);
  p.pileSurge = clampTo(p.pileSurge, 0, 0.6, d.pileSurge);
  p.churnSize = clampTo(p.churnSize, 0, 0.4, d.churnSize);
  p.churnSpeed = clampTo(p.churnSpeed, 0, 3, d.churnSpeed);
```

  (`clampTo` already maps undefined, which is not finite, to the default.)
  - Constants, above `Lifecycle`:

```ts
/** The pile rises this long after the lip lands (s): where the lip hits the water, the whitewater stands up. */
export const PILE_RISE_S = 0.5;
/** The impact's surge rises over SURGE_RISE_S from the landing and eases back over SURGE_FALL_S… */
export const SURGE_RISE_S = 0.5;
export const SURGE_FALL_S = 1.5;
/** …in full on a section whose crest reached this breaking ratio (the peak's), not at all at ρ = 1. */
export const SURGE_FULL_RATIO = 3.4;
```

  - `Lifecycle` gains four fields:

```ts
  /** The whitewater pile's weight [0, 1]: 0 until the lip lands, full PILE_RISE_S later, × the section's extent. */
  pile: number;
  /** How far the pile's top has moved from the crest to where the lip landed [0, 1]: the settle's progress. */
  pileReach: number;
  /** The impact's surge on the pile's height (≥ 1): 1 + pileSurge·smoothstep(1, SURGE_FULL_RATIO, rMax)·rise·fall. */
  surge: number;
  /** The pile's decay toward its floor: 0.5^(d / pileHalfM), d the metres rolled since the landing (the time past it,
   * capped at ONSET_REACH_S since onset, × the crest speed c). */
  decay: number;
}
const NO_PILE = { pile: 0, pileReach: 0, surge: 1, decay: 1 } as const;
```

  - `lifecycle` gets a sixth parameter, `c = 0`, documented: "c is the crest speed (m/s): the pile's decay runs on the metres it has rolled." Both early returns spread `...NO_PILE`. The final return becomes:

```ts
  const extent = breakingStage(Math.max(r, rMax), p);
  const land = landingEstimate(H, p);
  const span = settleSpan(H, p);
  const thrown = smoothstep(0, land, t) * extent;
  const rolled = Math.max(0, Math.min(t, ONSET_REACH_S) - land) * c;
  const surgeWeight = p.pileSurge * smoothstep(1, SURGE_FULL_RATIO, Math.max(r, rMax));
  return {
    steep: Math.max(steep, thrown),
    stage: Math.max(stage, thrown),
    drain: Math.max(c0.drain, thrown),
    collapse: smoothstep(land, land + span, t) * extent,
    pile: smoothstep(land, land + PILE_RISE_S, t) * extent,
    pileReach: smoothstep(land, land + span, t),
    surge: 1 + surgeWeight * smoothstep(land, land + SURGE_RISE_S, t) * (1 - smoothstep(land + SURGE_RISE_S, land + SURGE_RISE_S + SURGE_FALL_S, t)),
    decay: 0.5 ** (rolled / p.pileHalfM),
  };
```

  (Rename the existing `const c = stageCurves(r, p)` to `c0` so it doesn't shadow the new parameter. Update its two uses.)
  - Add to `lifecycle`'s doc comment: "From the landing the section turns into a whitewater pile (breakPoint): its weight, where its top is, its surge and its decay."

- [ ] **Step 4: Add the sliders** to `BREAK_BINDINGS` in `DevPanel.ts`, after `ribbonOnset`:

```ts
  pileHalfM: { label: 'pile half distance (m)', min: 10, max: 150, step: 1 },
  pileSurge: { label: 'pile surge (× lip)', min: 0, max: 0.6, step: 0.01 },
  churnSize: { label: 'churn size (× pile)', min: 0, max: 0.4, step: 0.01 },
  churnSpeed: { label: 'churn speed', min: 0, max: 3, step: 0.05 },
```

- [ ] **Step 5: Run the tests.**

Run: `npx vitest run src/breaker src/dev`
Expected: PASS. `DevPanel.test.ts` finds the four new bindings inside the normalizer's ranges. Other callers of `lifecycle` still compile, since c defaults to 0 (no decay until Task 5 passes c).

- [ ] **Step 6: Type-check and commit.**

```bash
npx tsc --noEmit -p .
git add src/breaker/breaking.ts src/breaker/breaking.test.ts src/dev/DevPanel.ts
git commit -m "feat(pile): the pile's clock: rises at the landing, surges on heavy breaks, halves every 50 m rolled; Break sliders"
```

(If `tsc` still flags `breakingNodes.ts` for `ONSET_LAG_S`, Step 4a of Task 3 was skipped: do it now.)

---

### Task 5: The pile on the sheet (CPU)

**Files:**
- Modify: `src/breaker/breaking.ts` (`smoothMax`, `pileShape`, pile constants, `BreakPointInput.lipTop`, `BreakPointResult.pile`, `breakPoint`)
- Modify: `src/breaker/setWaveModel.ts` (`BreakOptions.pile`, `Crest.lipH`, `crestAt`, `crestFrame`, `waveAtCrest`, `SetWaveResult.pile`, `accumulate`, `crestPileTop`)
- Test: `src/breaker/breaking.test.ts`, `src/breaker/breakingField.test.ts`

**Interfaces:**
- Consumes: `lifecycle(…, c)`, `onsetHeight` (Tasks 3–4).
- Produces:
  - in `breaking.ts`:
    - `smoothMax(a, b, k): { value: number; dA: number }`;
    - `pileShape(v, H): { g: number; dg: number }`;
    - constants `PILE_LAND_H = 1.2`, `PILE_FRONT_H = 0.5`, `PILE_BACK_H = 2.5`, `PILE_BLEND_H = 0.1`, `PILE_MIN_LIFT = [1, 1.2]`, `PILE_FOAM_THIN = 0.5`, `PILE_FOAM_EDGE = [0.02, 0.25]`;
    - `BreakPointInput.lipTop: number`;
    - `BreakPointResult.pile: number`;
    - `export function settledCrestTop(etaCrest, hmin, boreH, p): number`;
    - `export function pileTop(lipTop, floorTop, lc: Lifecycle): number`;
  - in `setWaveModel.ts`:
    - `BreakOptions.pile?: boolean` (false: no pile, which is the ribbon frame's sheet);
    - `Crest.lipH: number | null`;
    - `SetWaveResult.pile: number` (the pile's height where it is the surface, max over waves; the churn's scale);
    - `export function crestPileTop(x, z, t, f, w, ctx, o): { top: number; floor: number } | null`.

- [ ] **Step 1: Write the failing unit tests** in `breaking.test.ts`. Import `smoothMax, pileShape, pileTop, settledCrestTop, breakPoint, type BreakPointInput, type Lifecycle, PILE_LAND_H` (skip any already imported). Add:

```ts
describe('the whitewater pile (spec 2026-09-29 §3.2)', () => {
  it('smoothMax is max where a and b differ by k or more, C1 between, with ∂/∂a = dA', () => {
    expect(smoothMax(3, 1, 0.5)).toEqual({ value: 3, dA: 1 });
    expect(smoothMax(1, 3, 0.5)).toEqual({ value: 3, dA: 0 });
    for (const a of [-0.3, -0.1, 0, 0.1, 0.24]) {
      const h = 1e-6, num = (smoothMax(a + h, 0, 0.5).value - smoothMax(a - h, 0, 0.5).value) / (2 * h);
      expect(smoothMax(a, 0, 0.5).dA).toBeCloseTo(num, 5);
      expect(smoothMax(a, 0, 0.5).value).toBeGreaterThanOrEqual(Math.max(a, 0));
    }
  });
  it('pileShape: 1 at its top, steep in front, a long back, slope continuous at the top', () => {
    const H = 3;
    expect(pileShape(0, H).g).toBe(1);
    expect(Math.abs(pileShape(0, H).dg)).toBe(0);
    expect(pileShape(H, H).g).toBeLessThan(pileShape(-H, H).g);
    for (const v of [-4, -1, 0.5, 2]) {
      const h = 1e-6;
      expect(pileShape(v, H).dg).toBeCloseTo((pileShape(v + h, H).g - pileShape(v - h, H).g) / (2 * h), 6);
    }
  });
  const lcFull: Lifecycle = { steep: 1, stage: 1, drain: 1, collapse: 1, pile: 1, pileReach: 1, surge: 1, decay: 1 };
  // A synthetic cross-section: η = 1.5·cos(0.1·a), the crest at a = 0, H 3.
  const inputAt = (a: number, lipTop = 2): BreakPointInput => ({
    theta: -0.1 * a, env: 1, uUnbroken: a, eta: 1.5 * Math.cos(0.1 * a), uCrest: 0, etaCrest: 1.5, H: 3, k: 0.1, hmin: 4, boreH: 3,
    slope: -0.15 * Math.sin(0.1 * a), dThetaDAhead: -0.1, dEnvDAhead: 0, crestConfidence: 1, lipTop,
  });
  it('at its top (PILE_LAND_H·H ahead once the curl has collapsed) the sheet stands at the pile\'s height, fully foamed', () => {
    const top = pileTop(2, settledCrestTop(1.5, 4, 3, P), lcFull);
    expect(top).toBeCloseTo(2, 12); // decay 1, surge 1: the lip's own height
    const b = breakPoint(inputAt(PILE_LAND_H * 3), lcFull, P);
    expect(b.eta).toBeCloseTo(top, 6);
    expect(b.pile).toBeCloseTo(top, 6);
    expect(b.foam).toBeGreaterThan(0.99);
  });
  it('no pile where the floor is at or above the lip: the sheet is exactly as without it (a small wave in deep water)', () => {
    const floor = settledCrestTop(1.5, 4, 3, P);
    for (const a of [-6, 0, 2, 3.6, 8]) {
      const low = breakPoint(inputAt(a, floor * 0.99), lcFull, P), none = breakPoint(inputAt(a, 0), lcFull, P);
      expect(low.eta).toBe(none.eta);
      expect(low.pile).toBe(0);
    }
  });
  it('breakPoint\'s slope with the pile matches central differences of its height', () => {
    const lc: Lifecycle = { steep: 1, stage: 1, drain: 1, collapse: 0.5, pile: 0.8, pileReach: 0.6, surge: 1.1, decay: 0.9 };
    let worst = 0;
    for (let a = -20.03; a <= 20; a += 0.37) {
      const h = 1e-5;
      const num = (breakPoint(inputAt(a + h), lc, P).eta - breakPoint(inputAt(a - h), lc, P).eta) / (2 * h) - inputAt(a).slope;
      worst = Math.max(worst, Math.abs(num - breakPoint(inputAt(a), lc, P).dEtaDAhead));
    }
    expect(worst).toBeLessThan(2e-3);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run src/breaker/breaking.test.ts -t "pile"`
Expected: FAIL (`smoothMax` is not exported).

- [ ] **Step 3: Implement the pile in `breaking.ts`.**
  - Add after `boreScale`:

```ts
/** The collapsed crest's top above still water: the crest at etaCrest, settled to its bore (boreScale at collapse 1). */
export function settledCrestTop(etaCrest: number, hmin: number, boreH: number, p: BreakParams): number {
  return etaCrest * boreScale(boreH, hmin, 1, p);
}

/** The pile's top above still water (spec §3.2): floor + (lip × surge − floor) × decay. */
export function pileTop(lipTop: number, floorTop: number, lc: Lifecycle): number {
  return floorTop + (lipTop * lc.surge - floorTop) * lc.decay;
}

/** The pile's top sits this many H ahead of the crest once the curl has collapsed: where the lip landed (spec §3.1). */
export const PILE_LAND_H = 1.2;
/** Its steep front falls away over this many H (a Gaussian's width)… */
export const PILE_FRONT_H = 0.5;
/** …its back slopes away over this many. */
export const PILE_BACK_H = 2.5;
/** The pile meets the wave under it over this many H (smoothMax's k), so the join has no crease. */
export const PILE_BLEND_H = 0.1;
/** No pile where the lip stands no higher than the settled bore; full once it is this much (×) higher. */
export const PILE_MIN_LIFT: readonly [number, number] = [1, 1.2];
/** The pile's foam thins to this as it decays to its floor… */
export const PILE_FOAM_THIN = 0.5;
/** …and covers the pile out to where its shape falls to these (smoothstep over g, front and back). */
export const PILE_FOAM_EDGE: readonly [number, number] = [0.02, 0.25];

/** A polynomial smooth maximum: exactly max(a, b) where they differ by k or more, C1 everywhere; dA = ∂/∂a (∂/∂b = 1 − dA). */
export function smoothMax(a: number, b: number, k: number): { value: number; dA: number } {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return { value: Math.max(a, b) + (h * h * k) / 4, dA: Math.min(1, Math.max(0, 0.5 + (a - b) / (2 * k))) };
}

/** The pile's shape g(v) ∈ (0, 1] at v metres ahead of its top (negative behind), and dg/dv: a steep front, a long back. */
export function pileShape(v: number, H: number): { g: number; dg: number } {
  const w = (v >= 0 ? PILE_FRONT_H : PILE_BACK_H) * H;
  const x = v / w, g = Math.exp(-x * x);
  return { g, dg: ((-2 * x) / w) * g };
}
```

  - Add to `BreakPointInput`:

```ts
  /** How high the crest stood above still water when the section broke (m, with the lateral taper; spec §3.2's lip): the
   * whitewater pile's height. 0: no pile (unbroken, off the record, or the ribbon frame's sheet). */
  lipTop: number;
```

  - Add `pile: number;` to `BreakPointResult`, documented: "The pile's height (m) where it is the surface, 0 elsewhere: the churn's scale (render)."
  - Make the early return `{ eta: i.eta, foam: 0, dEtaDAhead: 0, pile: 0 }`.
  - Replace the end of `breakPoint` (from `const scale = …` on) with:

```ts
  const scale = boreScale(i.boreH, i.hmin, c.collapse, p);
  const base = (i.eta - drop - drain) * scale;
  const dBase = i.slope * (scale - 1) - (dDrop + dDrain) * scale;
  const out: BreakPointResult = { eta: base, foam: foamWeight(i.theta, ahead, i.H, i.env, c, p), dEtaDAhead: dBase, pile: 0 };
  // The whitewater pile (spec §3.2): the sheet lifted toward the pile's top T, most at its top (PILE_LAND_H·H ahead once
  // the curl has collapsed), fading over its front and back: eta = base + w·(smoothMax(base, T) − base), w = weight·g(v).
  // Where the wave under it is higher (the crest before it settles) the pile adds nothing.
  const floorTop = settledCrestTop(i.etaCrest, i.hmin, i.boreH, p);
  const weight = lc.pile * i.crestConfidence * smoothstep(PILE_MIN_LIFT[0], PILE_MIN_LIFT[1], i.lipTop / Math.max(floorTop, 1e-6));
  if (weight > 0) {
    const T = pileTop(i.lipTop, floorTop, lc);
    const { g, dg } = pileShape(ahead - PILE_LAND_H * i.H * lc.pileReach, i.H);
    const m = smoothMax(base, T, PILE_BLEND_H * i.H);
    const lift = m.value - base, w = weight * g;
    out.eta = base + w * lift;
    // d/dahead: the base's slope, + weight·g′·lift, + w·(dA − 1)·(the base's whole slope, Phase 1's included).
    out.dEtaDAhead = dBase + weight * dg * lift + w * (m.dA - 1) * (i.slope + dBase);
    out.pile = w * (1 - m.dA) * T;
    out.foam = Math.max(out.foam, weight * smoothstep(PILE_FOAM_EDGE[0], PILE_FOAM_EDGE[1], g) * (1 - m.dA) * (PILE_FOAM_THIN + (1 - PILE_FOAM_THIN) * lc.decay));
  }
  return out;
```

  - Update `breakPoint`'s doc comment to end: "…and the whitewater pile on top (spec §3.2), which lifts it toward the pile's height by a smooth maximum."

- [ ] **Step 4: Run the unit tests.**

Run: `npx vitest run src/breaker/breaking.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the pile through `setWaveModel.ts`.**
  - `BreakOptions` gains:

```ts
  /** false: the sheet without the whitewater pile, which is the ribbon frame's sheet (the lip is thrown from the wave as it
   * stood, not from the whitewater rising under it). Absent: with it. */
  pile?: boolean;
```

  - `SetWaveResult` gains `pile: number` (doc: "The whitewater pile's height (m) where it is the surface (max over waves): the render's churn scale. 0 without breaking."). Add `pile: 0` to `ZERO`, and `out.pile = Math.max(out.pile, r.pile);` to `accumulate`.
  - `Crest` gains `lipH: number | null` ("The wave's height where the section broke (breaking.onsetHeight): the pile's lip. null before it breaks or without a record."). In `crestAt`, import `onsetHeight`, then:

```ts
  const rMax = rec ? onsetRatio(rec, 0, w.heightM, o.params) : r;
  const lc = lifecycle(r, tb, localHeight(w, fc), o.params, rMax, ctx.omega / fc.k);
  const lipH = rec ? onsetHeight(rec, 0, w.heightM, o.params) : null;
  return { x: cx, z: cz, f: fc, r, s: lc.stage, tb, lc, confidence, lipH };
```

  - Factor the crest frame out of `waveAtCrest` into:

```ts
/** The crest's frame for one wave (setWaveModel.waveAtCrest's second half): its height, lean and crest height, the bore
 * it settles to, and the pile's lip, with the lateral taper `lateral`. */
function crestFrame(w: ActiveWave, crest: Crest, lateral: number, o: BreakOptions) {
  const fc = crest.f;
  const Hc = localHeight(w, fc);
  const ac = (Hc / 2) * lateral;
  const sigmaC = Math.max(Math.tanh(fc.k * fc.depth), 0.05);
  const stokes = (height: number): number => Math.min(STOKES_CAP, (fc.k * (height / 2) * (3 - sigmaC * sigmaC)) / (4 * sigmaC * sigmaC * sigmaC));
  const nearBreakingC = smoothstep(0.3, BREAKING_RATIO, Hc / Math.max(fc.hmin, MIN_DEPTH_M));
  const pitchC = Math.min(PITCH_MAX * nearBreakingC, PITCH_KA_CAP / Math.max(fc.k * ac, 1e-4));
  const etaCrest = ac * (1 + stokes(Hc));
  const boreH = Math.min(w.heightM * fc.amp, BREAKING_RATIO * fc.hminBreak) * lateral;
  const lipTop = o.pile !== false && crest.lipH ? (crest.lipH / 2) * (1 + stokes(crest.lipH)) * lateral : 0;
  return { Hc, pitchC, etaCrest, boreH, lipTop };
}
```

  - `waveAtCrest` then uses `const cf = crestFrame(w, crest, lateral, o);`, passing `uCrest: cf.pitchC * cf.etaCrest, etaCrest: cf.etaCrest, H: cf.Hc * lateral, boreH: cf.boreH, lipTop: cf.lipTop`, with the other fields as before, and sets `out.pile = b.pile;`. Delete the local `Hc…etaCrest` lines it replaces. The numbers are identical: `Bc` is `stokes(Hc)`.
  - Add, after `waveAt`:

```ts
/**
 * The whitewater pile's top above still water at w's crest nearest (x, z), and its floor (the settled bore's top): null
 * where there is no pile (unbroken, off the record, or the lip no higher than the floor). Tests and diagnostics: the
 * sheet stands at `top` at the pile's top once the curl has collapsed.
 */
export function crestPileTop(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions): { top: number; floor: number } | null {
  const crest = crestAt(x, z, t, f, w, ctx, o);
  if (!crest || crest.lipH === null || !(crest.lc.pile > 0)) return null;
  const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, Math.hypot(x, z));
  const q = (2 * (-x * w.travelZ + z * w.travelX - w.crestOffsetM)) / w.crestLengthM;
  const lateral = 1 + (Math.exp(-(q * q * q * q)) - 1) * wFar;
  const cf = crestFrame(w, crest, lateral, o);
  const floor = settledCrestTop(cf.etaCrest, crest.f.hminBreak, cf.boreH, o.params);
  return cf.lipTop > floor ? { top: pileTop(cf.lipTop, floor, crest.lc), floor } : null;
}
```

  (Import `pileTop, settledCrestTop, onsetHeight` from `./breaking`.)
  - In `sprayEmitters.ts:188`, give the lip frame the pile-free sheet:

```ts
  // The lip is thrown from the wave as it stood: the frame reads the sheet without the whitewater pile (as the ribbon's).
  const opts: BreakOptions = { ...breakOptions(field, params), pile: false };
```

- [ ] **Step 6: Write the failing field tests** in `breakingField.test.ts`. Import `crestPileTop` from `./setWaveModel`, and `landingEstimate, settleSpan` from `./breaking` (if missing).
  - Narrow the existing "while the wave throws" test to the throw. Inside its loop, first compute the crest's section clock and skip once the lip has landed:

```ts
      const cp = line[Math.max(1, line.findIndex((p) => p.tau >= t))];
      const cc = crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet)!;
      if (cc.tb !== null && cc.tb !== undefined && cc.tb >= landingEstimate(localHeight(w, cc.f), P)) continue;
```

    Change `expect(checked).toBe(7)` to `expect(checked).toBeGreaterThanOrEqual(4)`. Retitle it: "…while the wave throws (onset to the landing), its crest is its highest water…". Add a comment: "From the landing on, the whitewater pile is the highest water (the next describe)."
  - Add a helper next to `ray` (below it):

```ts
/** When the section on the ray through (px, pz) broke (s): from the record at the crest, at the first point from the
 * ledge point inshore (0.5 m steps, up to 40 m) where the crest has broken. */
function onsetAt(px: number, pz: number, w: ActiveWave): { tOn: number; H: number } {
  for (const p of ray(px, pz, 0, 40)) {
    const f = at(p.x, p.z), c = crestAt(p.x, p.z, f.tau, f, w, ctx, sheet)!;
    if (c.tb !== null && c.tb !== undefined && Number.isFinite(c.tb)) return { tOn: f.tau - c.tb, H: localHeight(w, c.f) };
  }
  throw new Error(`(${px}, ${pz}) has not broken within 40 m inshore`);
}
/** The highest water within 20 m of w's crest at t on `line`, its index, and the crest's index. */
function topNear(line: { x: number; z: number; tau: number }[], t: number, w: ActiveWave, o = sheet) {
  const eta = line.map((p) => sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, o).eta);
  const j = line.findIndex((p) => p.tau >= t);
  let top = -1;
  for (let i = 0; i < line.length; i++) if (Math.abs(i - j) * 0.5 <= 20 && (top < 0 || eta[i] > eta[top])) top = i;
  return { eta, top, j, height: eta[top] };
}
```

  - Add a describe block:

```ts
describe('the whitewater pile on the real reef (spec 2026-09-29 §3.2)', () => {
  const P = DEFAULT_BREAK_PARAMS;
  const w = testWave(REF_BIGGEST.heightM);
  it('when the pile has risen it stands at least as high as the lip, and above it at the peak (the surge)', { timeout: 60_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 40, 80);
      const { tOn, H } = onsetAt(px, pz, w);
      const lip = topNear(line, tOn, w).height;
      const risen = topNear(line, tOn + landingEstimate(H, P) + PILE_RISE_S, w).height;
      console.log(`(${px}, ${pz}) lip ${lip.toFixed(2)} m, pile ${risen.toFixed(2)} m`);
      expect(risen, `(${px}, ${pz})`).toBeGreaterThanOrEqual(0.97 * lip);
      if (px === 0 && pz === 0) expect(risen, 'the peak surges').toBeGreaterThan(1.1 * lip);
    }
  });
  it('once the curl has collapsed its top is where the lip landed, 1–1.4·H ahead of the crest', { timeout: 60_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 40, 80);
      const { tOn, H } = onsetAt(px, pz, w);
      const t = tOn + landingEstimate(H, P) + settleSpan(H, P);
      const { top, j } = topNear(line, t, w);
      const cp = line[j], cc = crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet)!;
      const ahead = ((top - j) * 0.5) / localHeight(w, cc.f);
      expect(ahead, `(${px}, ${pz}) top ahead of the crest (× H)`).toBeGreaterThanOrEqual(1.0);
      expect(ahead).toBeLessThanOrEqual(1.4);
    }
  });
  it('the sheet stands at the pile\'s height as it rolls in, never growing, and a low bore by 90 m', { timeout: 120_000 }, () => {
    for (const [px, pz] of LEDGE_POINTS) {
      const line = ray(px, pz, 20, 110);
      const { tOn, H } = onsetAt(px, pz, w);
      const from = tOn + landingEstimate(H, P) + settleSpan(H, P) + 0.5;
      let prev = Infinity, halfAt: number | null = null, first: { top: number; floor: number; j: number } | null = null;
      for (let t = from; t <= tOn + 12 + 1e-9; t += 0.5) {
        const { height, j } = topNear(line, t, w);
        if (j < 1) break;
        const cp = line[j], pt = crestPileTop(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet);
        if (!pt) break;
        expect(Math.abs(height - pt.top), `(${px}, ${pz}) t ${(t - tOn).toFixed(1)} s: sheet ${height.toFixed(2)} vs pile ${pt.top.toFixed(2)}`).toBeLessThan(Math.max(0.05, 0.05 * pt.top));
        expect(pt.top, `(${px}, ${pz}) t ${(t - tOn).toFixed(1)} s: the pile never grows`).toBeLessThanOrEqual(prev + 0.02);
        prev = pt.top;
        first ??= { ...pt, j };
        if (halfAt === null && pt.top - pt.floor <= 0.5 * (first.top - first.floor)) halfAt = (j - first.j) * 0.5;
      }
      console.log(`(${px}, ${pz}) the pile halved above its floor ${halfAt?.toFixed(0) ?? '> 12 s'} m after the collapse`);
    }
  });
  it('off the record grid there is no pile, and the sheet is as without it', () => {
    const x = field.grid.x0 - 30, z = 0, f = at(x, z);
    const r = sumWaves(x, z, f.tau + 3, f, [w], ctx, sheet), n = sumWaves(x, z, f.tau + 3, f, [w], ctx, { ...sheet, pile: false });
    expect(r.pile).toBe(0);
    expect(r.eta).toBe(n.eta);
  });
});
```

  (Import `PILE_RISE_S` from `./breaking`.)
  - Extend the two finiteness tests:
    - In 'extremes: 12 ft / 25 s…', also expect `Number.isFinite(r.pile)` for every sample.
    - In 'the Break sliders at their ends keep the surface finite…', add these param sets:

```ts
{ ...P, pileHalfM: 10 }, { ...P, pileHalfM: 150 }, { ...P, pileSurge: 0 }, { ...P, pileSurge: 0.6 }
```

    (Match the test's own list syntax. Read it first.)

- [ ] **Step 7: Run the field suite.**

Run: `npx vitest run src/breaker/breakingField.test.ts`
Expected: PASS, logging each ledge point's lip, pile and half distance. The half distances should mostly be 40–60 m. They're measured from the collapse's end, so the formula's halving from the landing reads a little shorter. Report the numbers.

If "never grows" fails where the reef deepens behind the ledge (the floor rising), report the ledge point, the times and the numbers, and stop. Don't loosen the test: Task 5's reviewer decides whether the floor needs a memory (the spec says the pile never stands back up).

- [ ] **Step 8: Run everything on the CPU side and type-check.**

Run: `npx vitest run src/breaker src/whitewater && npx tsc --noEmit -p .`
Expected: PASS. (`tsc` may still flag `breakingNodes.ts` or `SetWaves.ts` for `breakPointNode`'s curves: those are Task 7's. If it does, leave them, and note it in the commit message.)

- [ ] **Step 9: Commit.**

```bash
git add src/breaker/breaking.ts src/breaker/breaking.test.ts src/breaker/setWaveModel.ts src/breaker/breakingField.test.ts src/whitewater/sprayEmitters.ts
git commit -m "feat(pile): the whitewater pile on the sheet: stands at the lip's height where the lip lands, surges, halves as it rolls in"
```

---

### Task 6: The ribbon's frame reads the sheet without the pile (CPU)

**Files:**
- Modify: `src/breaker/lipProfile.ts:264-274` (`buildProfile`)
- Test: `src/breaker/lipProfile.test.ts`

**Interfaces:**
- Consumes: `BreakOptions.pile` (Task 5).
- Produces: `buildProfile(base, input, p, frameBase = base)`. The frame (`profileFrame`) is built on `frameBase`, and the points on `base`.

- [ ] **Step 1: Write the failing test.** In `lipProfile.test.ts`, extend `stationAt` to also return `frameBase`, the same function over `{ ...sheet, pile: false }`:

```ts
  const flat: BreakOptions = { ...sheet, pile: false };
  const frameBase = (u: number): Vec2 => {
    const x = x0 + f0.dirX * u, z = z0 + f0.dirZ * u;
    const s = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, flat);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  return { base, frameBase, input };
```

  Then add:

```ts
  it('as the whitewater rises under the curl the lip keeps falling: it never pulls back or flips up level', () => {
    const probe = stationAt(0, 0, big, 0);
    const tau = profileFrame(probe.base, probe.input, LIP).tauLand;
    const tipAt = (tb: number) => {
      const { base, frameBase, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, input, LIP, frameBase);
      const tip = PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under;
      return { reach: p.frame.reach, y: p.frame.K[1] - 0.5 * GRAVITY_MS2 * (p.frame.reach / p.frame.vj) ** 2, tip: p.points[tip] };
    };
    const landed = tipAt(tau);
    for (const extra of [0.2, 0.5, 0.8, 1.2]) {
      const now = tipAt(tau + extra);
      expect(now.reach, `${extra} s after landing: the lip's reach`).toBeGreaterThanOrEqual(0.95 * landed.reach);
      expect(now.y, `${extra} s after landing: the lip tip's height`).toBeLessThanOrEqual(landed.y + 0.1 * big.heightM);
    }
  });
```

- [ ] **Step 2: Run it with `frameBase` ignored, to see it fail.** Before changing `buildProfile`, the fourth argument is ignored (TypeScript flags the extra argument, but vitest runs).

Run: `npx vitest run src/breaker/lipProfile.test.ts -t "never pulls back"`
Expected: FAIL. The reach shrinks, or the tip rises toward the crest, as the pile lifts the foot. If it PASSES, report it (the pile doesn't disturb the frame at the peak) and still do Step 3: the GPU frame must agree with the CPU's.

- [ ] **Step 3: Implement.** In `lipProfile.ts`:

```ts
/**
 * The whole profile for one station (CPU reference and tests). The frame (where and when the lip lands, how fast it
 * throws) is measured on `frameBase`, the sheet without the whitewater pile: the lip is thrown from the wave as it stood,
 * and the whitewater rising under the curl must not pull it back. The points settle onto `base`, the sheet with it.
 */
export function buildProfile(base: (u: number) => Vec2, input: ProfileInput, p: LipParams, frameBase: (u: number) => Vec2 = base): Profile {
  const frame = profileFrame(frameBase, input, p);
```

  (The rest is unchanged.)

- [ ] **Step 4: Run the lip tests.**

Run: `npx vitest run src/breaker/lipProfile.test.ts src/breaker/lipProfileNodes.test.ts src/breaker/BreakingRibbon.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/breaker/lipProfile.ts src/breaker/lipProfile.test.ts
git commit -m "feat(ribbon): the lip's frame is measured on the sheet without the pile (the whitewater rising under it doesn't pull it back)"
```

---

### Task 7: The GPU mirror (record texture, lifecycle, pile, ribbon frame)

**Files:**
- Modify: `src/breaker/breakingNodes.ts` (uniforms, `onsetTimeNode`, `lifecycleNode`, `breakPointNode`)
- Modify: `src/breaker/SetWaves.ts` (record texture, `sampleOnset`, `sumBreaking(xz, frame, pile)`, outputs, `displacementNode(xz, pile)`, public `time`, churn uniforms getter)
- Modify: `src/ocean/waterSurface.ts:51-62` (`displacement(…, pile)`, `displacementWithSetFoam` out gains `pile`)
- Modify: `src/breaker/BreakingRibbon.ts` (`RibbonSurface.frameBase`, `modelRibbonSurface`, the frame pass)
- Modify: `src/ocean/OceanSurface.ts:185-190` (pass a `pile` varying; Task 8 uses it)
- Test: `src/breaker/breaker.selftest.ts`, `src/breaker/ribbon.selftest.ts`, `src/breaker/BreakingRibbon.limits.test.ts`, `src/breaker/breakingNodes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces:
  - `createBreakUniforms` gains `pileHalfM, pileSurge, churnSize, churnSpeed`;
  - `onsetTimeNode(rec: N[] /* 16 */, heightM, u): { broken, tb, rMax, lipH }`;
  - `lifecycleNode(r, hasRecord, broken, tb, rMax, H, c, u): { steep, stage, drain, collapse, pile, pileReach, surge, decay }`;
  - `breakPointNode(i /* + lipTop */, steep, u, curves: { drain, collapse, pile, pileReach, surge, decay }): { eta, foam, dEtaDAhead, pile }`;
  - in SetWaves:
    - `displacementNode(xz, pile = true)`;
    - `breakSampleNode(xz)` returns `pile`;
    - `displacementWithSetFoamNode(xz, out: { slope; foam; foamFrame; pile })`;
    - `readonly time`;
    - `get churn(): { churnSize: N; churnSpeed: N }`;
  - `RibbonSurface.frameBase?: BaseSurfaceNode`;
  - `WaterSurfaceModel.displacement(xz, lod, pile = true)`.

- [ ] **Step 1: Extend the GPU self-tests first** (they fail until the mirror is done). In `breaker.selftest.ts`:
  - `BREAK_DTS = [0, 0.3, 0.6, 0.9, 1.2, 1.8, 2.4, 4, 7]`, and add to `ALT_BREAK_PARAMS`: `pileHalfM: 30, pileSurge: 0.15`.
  - Add the pile's reach inshore, and a point off the grid:

```ts
/** Where the pile rolls: 20–70 m shoreward of the peak along its ray, every 5 m, and one point off the record grid. */
function pileRay(field: ReefField): [number, number][] {
  let x = 0, z = 0;
  const out: [number, number][] = [];
  for (let d = 0; d <= 70 + 1e-9; d += 0.5) {
    if (d >= 20 && Math.abs(d % 5) < 1e-9) out.push([x, z]);
    const s = sampleField(field, x, z); x += s.dirX * 0.5; z += s.dirZ * 0.5;
  }
  out.push([field.grid.x0 - 30, 0]);
  return out;
}
```

  - The sheet test uses `const points = [...peakRay(field), ...OFF_RAY, ...pileRay(field)];` and outputs `vec4(b.stage, b.pile, 0.0, 0.0)` as its second vec4. Compare the pile with `const pile = new Worst(true, 0)`, adding `pile.see(Math.abs(g[5] - c.pile), dt, i, …)`.
  - Add `pile.value < 0.05` to `ok`, and count the samples with `c.pile > 0.3` (`pileSamples`). Require `> 0` so the test proves it saw the pile. Add both to the detail line.
  - `ribbon.selftest.ts:45`: add `frameBase: (xz) => sets.displacementNode(xz, false)` to the surface. Wherever it builds CPU profiles (`grep -n "buildProfile\|profileFrame" src/breaker/ribbon.selftest.ts`), pass the pile-free base as `frameBase`: the same base function over `{ ...opts, pile: false }`.

- [ ] **Step 2: Mirror the record and the lifecycle in `breakingNodes.ts`.**
  - Imports: replace `ONSET_LAG_S` with `ONSET_LAG_TIMES_S, ONSET_REACH_S`, and add `PILE_RISE_S, SURGE_RISE_S, SURGE_FALL_S, SURGE_FULL_RATIO, PILE_LAND_H, PILE_FRONT_H, PILE_BACK_H, PILE_BLEND_H, PILE_MIN_LIFT, PILE_FOAM_THIN, PILE_FOAM_EDGE` from `./breaking`. Add `abs, exp2, mix` to the `three/tsl` import.
  - Uniforms: add `pileHalfM: uniform(50), pileSurge: uniform(0), churnSize: uniform(0), churnSpeed: uniform(1)` to `createBreakUniforms`. In `updateBreakUniforms`: `u.pileHalfM.value = p.pileHalfM; u.pileSurge.value = p.pileSurge; u.churnSize.value = p.churnSize; u.churnSpeed.value = p.churnSpeed;`.
  - `onsetTimeNode` (rec now has ONSET_LAGS maxima, then ONSET_LAGS amplifications):

```ts
export function onsetTimeNode(rec: readonly N[], heightM: N, u: BreakUniforms): { broken: N; tb: N; rMax: N; lipH: N } {
  const g: N = float(heightM).mul(u.onsetGain);
  const rho: N[] = rec.slice(0, ONSET_LAGS).map((v) => g.mul(v));
  const amp: N[] = rec.slice(ONSET_LAGS, 2 * ONSET_LAGS);
  let tb: N = float(0.0);
  let ampO: N = float(amp[ONSET_LAGS - 1]);
  let alive: N = rho[0].greaterThanEqual(1.0);
  for (let j = 1; j < ONSET_LAGS; j++) {
    const a = rho[j - 1], b = rho[j];
    const phi = clamp(a.sub(1.0).div(max(a.sub(b), 1e-9)), 0.0, 1.0);
    const below = b.lessThan(1.0);
    tb = tb.add(select(alive, select(below, phi, float(1.0)).mul(ONSET_LAG_TIMES_S[j] - ONSET_LAG_TIMES_S[j - 1]), float(0.0)));
    ampO = select(alive.and(below), mix(amp[j - 1], amp[j], phi), ampO);
    alive = alive.and(below.not());
  }
  return { broken: rho[0].greaterThanEqual(1.0), tb: select(alive, float(ONSET_LONG_AGO_S), tb), rMax: rho[0], lipH: float(heightM).mul(ampO) };
}
```

  - Update its doc comment: uneven lags, and `lipH` = `breaking.onsetHeight` (meaningless when not broken).
  - `lifecycleNode` gains `c` (after `H`), and its return gains the four pile values:

```ts
export interface LifecycleNodes { steep: N; stage: N; drain: N; collapse: N; pile: N; pileReach: N; surge: N; decay: N }

export function lifecycleNode(r: N, hasRecord: N, broken: N, tb: N, rMax: N, H: N, c: N, u: BreakUniforms): LifecycleNodes {
  const steepR = steepeningNode(r, u), stageR = breakingStageNode(r, u), cr = stageCurvesNode(r, u);
  const isBroken = hasRecord.and(broken.or(r.greaterThanEqual(1.0)));
  const t = select(broken, tb, float(0.0));
  // landingEstimate: landingTime(H·(1 + troughDrain·δ)), the fall floored at 0.05 m; settleSpan is collapseTime × it.
  const land = max(H.mul(u.drainGrowth), 0.05).mul(2 / GRAVITY_MS2).sqrt();
  const span = land.mul(u.collapseTime);
  const rAll = max(r, rMax);
  const extent = breakingStageNode(rAll, u);
  const thrown = smoothstep(0.0, land, t).mul(extent);
  const settled = smoothstep(land, land.add(span), t);
  const rolled = max(min(t, ONSET_REACH_S).sub(land), 0.0).mul(c);
  const surgeW = u.pileSurge.mul(smoothstep(1.0, SURGE_FULL_RATIO, rAll));
  const surge = float(1.0).add(surgeW.mul(smoothstep(land, land.add(SURGE_RISE_S), t))
    .mul(float(1.0).sub(smoothstep(land.add(SURGE_RISE_S), land.add(SURGE_RISE_S + SURGE_FALL_S), t))));
  return {
    steep: select(isBroken, max(steepR, thrown), steepR),
    stage: select(isBroken, max(stageR, thrown), stageR),
    drain: select(isBroken, max(cr.drain, thrown), cr.drain),
    collapse: select(hasRecord, select(isBroken, settled.mul(extent), float(0.0)), cr.collapse),
    pile: select(isBroken, smoothstep(land, land.add(PILE_RISE_S), t).mul(extent), float(0.0)),
    pileReach: select(isBroken, settled, float(0.0)),
    surge: select(isBroken, surge, float(1.0)),
    decay: select(isBroken, exp2(rolled.div(u.pileHalfM).negate()), float(1.0)),
  };
}
```

  Note: the old `settled` was `smoothstep(land, land·(1 + collapseTime), t)·extent`, and `land + span` is the same edge.
  - `BreakPointNodes` gains `lipTop: N`. `breakPointNode`'s `curves` param becomes `curves: { drain: N; collapse: N; pile: N; pileReach: N; surge: N; decay: N }`. Replace its tail, from `// boreScale` to the return, with:

```ts
  // boreScale
  const scale = float(1.0).add(min(float(1.0), u.beta.mul(max(i.hmin, 0.0)).div(i.boreH)).sub(1.0).mul(collapse));
  const base = i.eta.sub(drop).sub(drained).mul(scale);
  const dBase = i.slope.mul(scale.sub(1.0)).sub(dDrop.add(dDrained).mul(scale));
  // foamWeight: the H > MIN_BREAKING_HEIGHT_M gate keeps the front edge's smoothstep edges apart.
  const fw = u.faceWidth.mul(i.H);
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1.0, collapse);
  const edge = fw.mul(0.5);
  const reach = fw.mul(smoothstep(FOAM_SETTLE_COLLAPSE, 1.0, collapse));
  const front = float(1.0).sub(smoothstep(reach.sub(edge), reach, ahead));
  const trail = float(1.0).sub(smoothstep(Math.PI / 2, Math.PI, i.theta))
    .mul(float(1.0).sub(smoothstep(i.H.mul(FOAM_DENSE_BEHIND_H), i.H.mul(FOAM_TRAIL_H), ahead.negate())));
  const foam0 = land.mul(i.env).mul(front).mul(trail);
  // The whitewater pile (breaking.breakPoint): base + w·(smoothMax(base, T) − base), w = weight·g(v). With weight 0 it
  // is the base exactly (w = 0), as the CPU's `if (weight > 0)`.
  const floorTop = i.etaCrest.mul(min(float(1.0), u.beta.mul(max(i.hmin, 0.0)).div(i.boreH)));
  const weight = curves.pile.mul(i.crestConfidence).mul(smoothstep(PILE_MIN_LIFT[0], PILE_MIN_LIFT[1], i.lipTop.div(max(floorTop, 1e-6))));
  const T = floorTop.add(i.lipTop.mul(curves.surge).sub(floorTop).mul(curves.decay));
  const v = ahead.sub(i.H.mul(PILE_LAND_H).mul(curves.pileReach));
  const wS = select(v.greaterThanEqual(0.0), i.H.mul(PILE_FRONT_H), i.H.mul(PILE_BACK_H));
  const xs = v.div(wS);
  const g = exp(xs.mul(xs).negate());
  const dg = xs.mul(-2.0).div(wS).mul(g);
  const kB = i.H.mul(PILE_BLEND_H);
  const hB = max(kB.sub(abs(base.sub(T))), 0.0).div(kB);
  const lift = max(base, T).add(hB.mul(hB).mul(kB).mul(0.25)).sub(base);
  const dA = clamp(base.sub(T).div(kB.mul(2.0)).add(0.5), 0.0, 1.0);
  const w = weight.mul(g);
  const pileFoam = weight.mul(smoothstep(PILE_FOAM_EDGE[0], PILE_FOAM_EDGE[1], g)).mul(float(1.0).sub(dA)).mul(mix(float(PILE_FOAM_THIN), float(1.0), curves.decay));
  return {
    eta: base.add(w.mul(lift)),
    foam: max(foam0, pileFoam),
    dEtaDAhead: dBase.add(weight.mul(dg).mul(lift)).add(w.mul(dA.sub(1.0)).mul(i.slope.add(dBase))),
    pile: w.mul(float(1.0).sub(dA)).mul(T),
  };
```

  The CPU `smoothstep` of an H-scaled edge is avoided: `PILE_MIN_LIFT` has constant edges, and kB > 0 inside the H gate.

- [ ] **Step 3: One record texture in `SetWaves.ts`.**
  - Replace `onsetA`/`onsetB` with:

```ts
  /** The onset record (ReefField.onset and onsetAmp), four texels per field node side by side along x: the running maxima
   * at lags 0–3 and 4–7, then the amplification at lags 0–3 and 4–7. One texture, so the record is one binding. */
  private readonly onsetRec = floatTexture(FIELD_NX * 4, FIELD_NZ);
```

  - In `setField`, replace the onset fill with:

```ts
    const od = this.onsetRec.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      const col = i % FIELD_NX, row = (i - col) / FIELD_NX, o = (row * FIELD_NX * 4 + col * 4) * 4;
      od.set(f.onset.subarray(i * ONSET_LAGS, i * ONSET_LAGS + ONSET_LAGS), o);
      od.set(f.onsetAmp.subarray(i * ONSET_LAGS, i * ONSET_LAGS + ONSET_LAGS), o + ONSET_LAGS);
    }
```

    Swap `onsetA, onsetB` for `onsetRec` in the `needsUpdate` list.
  - `sampleOnset`:

```ts
  /** reefField.sampleOnset: the record's ONSET_RECORD_LENGTH values at world xz (bilinear between nodes), and whether xz
   * is on the grid. Inside an Fn. */
  private sampleOnset(xz: N): { inside: N; values: N[] } {
    const g = xz.sub(this.origin).div(this.cell).toVar();
    const inside = g.x.greaterThanEqual(0.0).and(g.y.greaterThanEqual(0.0)).and(g.x.lessThanEqual(this.fieldMax.x)).and(g.y.lessThanEqual(this.fieldMax.y));
    const gc = clamp(g, vec2(0.0), this.fieldMax.sub(0.001));
    const base = floor(gc).toVar();
    const t = gc.sub(base).toVar();
    const i0 = ivec2(base).toVar();
    const texel = (m: number): N => {
      const load = (dx: number, dz: number): N => textureLoad(this.onsetRec, ivec2(i0.x.add(dx).mul(4).add(m), i0.y.add(dz)), int(0));
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y).toVar();
    };
    const v = [texel(0), texel(1), texel(2), texel(3)];
    return { inside, values: v.flatMap((q) => [q.x, q.y, q.z, q.w]) };
  }
```

  - `sumBreaking(xz, frame, pile = true)`:
    - add `const pileOut = float(0.0).toVar();` with the other outputs;
    - add `pile: float(0.0).toVar(), pileReach: float(0.0).toVar(), surge: float(1.0).toVar(), decay: float(1.0).toVar()` to the `lc` vars;
    - add `const lipTop0 = float(0.0).toVar();`.
  - Inside `If(breaking, …)`:

```ts
            const Hcrest = min(a.y.mul(fc.amp), fc.hmin.mul(BREAKING_RATIO));
            const l = lifecycleNode(rC, rec.inside, onset.broken, onset.tb, onset.rMax, Hcrest, this.meanOmega.div(fc.k), brk);
            lc.steep.assign(l.steep); lc.stage.assign(l.stage); lc.drain.assign(l.drain); lc.collapse.assign(l.collapse);
            lc.pile.assign(l.pile); lc.pileReach.assign(l.pileReach); lc.surge.assign(l.surge); lc.decay.assign(l.decay);
            if (pile) {
              // setWaveModel.crestFrame's lipTop before the lateral taper: (H_o/2)·(1 + B(H_o)) at the crest's field.
              const sigmaL = max(tanh(fc.k.mul(fc.depth)), 0.05);
              const Bl = min(float(STOKES_CAP), fc.k.mul(onset.lipH.mul(0.5)).mul(float(3.0).sub(sigmaL.mul(sigmaL))).div(sigmaL.mul(sigmaL).mul(sigmaL).mul(4.0)));
              lipTop0.assign(onset.lipH.mul(0.5).mul(Bl.add(1.0)));
            }
```

    (This replaces the old `const l = lifecycleNode(…)` line and its assign line.)
  - In the `breakPointNode` call, add `lipTop: lipTop0.mul(lateral)` to its inputs, pass `{ drain: lc.drain, collapse: lc.collapse, pile: lc.pile, pileReach: lc.pileReach, surge: lc.surge, decay: lc.decay }`, and after `foam.assign(…)` add `pileOut.assign(max(pileOut, br.pile));`.
  - Return `pile: pileOut` from `sumBreaking`.
  - `displacementNode(xz: N, pile = true)` calls `this.sumBreaking(xz, false, pile)`. Doc: "`pile` false: without the whitewater pile (the ribbon's frame)".
  - `breakSampleNode` returns `pile: s.pile`.
  - `displacementWithSetFoamNode(xz, out: { slope: N; foam: N; foamFrame: N; pile: N })` assigns `out.pile.assign(s.pile)`. The churn comes in Task 8.
  - Make the constructor's `private readonly time` into `readonly time`, and add:

```ts
  /** The churn's sliders (BreakParams.churnSize, churnSpeed) as uniforms, for the render's pileChurn nodes. */
  get churn(): { churnSize: N; churnSpeed: N } { return { churnSize: this.brk.churnSize, churnSpeed: this.brk.churnSpeed }; }
```

- [ ] **Step 4: Plumb the pile-free base and the pile output.**
  - `waterSurface.ts`:
    - `displacement(xz, lod = …, pile = true)` passes `pile` to `this.sets.displacementNode(xz, pile)`. Doc: "`pile` false: the sheet without the whitewater pile (the ribbon's frame)".
    - `displacementWithSetFoam`'s `out` type gains `pile: N`.
  - `OceanSurface.ts`: `const setPile = varyingProperty('float', 'vSetPile');`, and pass `{ slope: setSlope, foam: setFoam, foamFrame: setFoamFrame, pile: setPile }`. Task 8 reads it.
  - `BreakingRibbon.ts`:
    - `RibbonSurface` gains:

```ts
  /** The smooth sheet without the whitewater pile, for the frame pass's four samples (lipProfile.buildProfile's
   * frameBase: the lip is thrown from the wave as it stood). Absent: `smooth`. */
  frameBase?: BaseSurfaceNode;
```

    - `modelRibbonSurface` adds:

```ts
    frameBase: (xz) => {
      const l = lod(xz);
      return model.displacement(xz, (c) => (c === CHOP_CASCADE ? float(0.0) : l(c)), false);
    },
```

    - In `buildFramePass`: `const frameSurface = this.surface.frameBase ?? this.surface.smooth;`, and `baseAt` uses `frameSurface(xz)`.
  - `grep -rn "displacementWithSetFoam\|displacementWithSetFoamNode" src` for any other caller, and add `pile` to its `out`.

- [ ] **Step 5: CPU checks and binding limits.**

Run: `npx vitest run src/breaker src/whitewater src/ocean && npx tsc --noEmit -p .`
Expected: PASS, with 0 type errors. `BreakingRibbon.limits.test.ts` re-counts the frame pass's bindings: its textures are SetWaves' (the record is now one texture, one fewer), so the counts hold. If it pins a texture count, lower that by one and note why in the test.

- [ ] **Step 6: Run the GPU self-tests** in the browser pane. Call `preview_start` with `{ name: "liquid-dreams" }`, navigate to `http://localhost:5173/?selftest`, wait for the SUMMARY, then `read_console_messages` with pattern `[selftest]`.
Expected: every self-test passes. The sheet test reports |Δpile| < 0.05 and pile samples > 0; the ribbon test passes with the pile-free frame; the probe and slope tests pass.
If a comparison fails, read its per-point table, find the term that differs, fix the mirror (never the CPU model), and re-run. Watch for the iGPU banner (see memory): if the pane runs on the integrated GPU, say so in the report.

- [ ] **Step 7: Commit.**

```bash
git add src/breaker/breakingNodes.ts src/breaker/SetWaves.ts src/ocean/waterSurface.ts src/ocean/OceanSurface.ts src/breaker/BreakingRibbon.ts src/breaker/breaker.selftest.ts src/breaker/ribbon.selftest.ts src/breaker/BreakingRibbon.limits.test.ts src/breaker/breakingNodes.test.ts
git commit -m "feat(gpu): the pile, the 13 s record (one texture) and the pile-free ribbon frame on the GPU, matched to the CPU"
```

---

### Task 8: The churn (render only)

**Files:**
- Create: `src/whitewater/pileChurn.ts`
- Modify: `src/breaker/SetWaves.ts` (`displacementWithSetFoamNode` adds the churn height)
- Modify: `src/ocean/OceanSurface.ts` (the churn's slope in the normal)
- Modify: `src/breaker/BreakingRibbon.ts` (the churn at the home: position and slope)
- Test: `src/breaker/breaker.selftest.ts` (a churn self-test)

**Interfaces:**
- Consumes: `SetWaves.time`, `SetWaves.churn`, `SetWaves.meanTravel`, and `pile` + `foamFrame` from `sumBreaking` / `breakSampleNode` (Task 7).
- Produces:
  - `churnHeightNode(pile: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N` (m);
  - `churnSlopeNode(pile: N, frame: N, travel: N, time: N, u): N` (vec2 world slope);
  - `CHURN_SCALE_PER_M`, `CHURN_RATE_PER_S`.

- [ ] **Step 1: Write the self-test** in `breaker.selftest.ts`. Import `churnHeightNode, churnSlopeNode` from `../whitewater/pileChurn`, and `float, vec2` from `three/tsl` if missing. `computeAt(points, perPoint, body)` (line 141) runs `body(xz)` per point and returns `perPoint` vec4s each, so here each "point" is a crest-frame coordinate, and there is one pass per pile height:

```ts
registerSelfTest({
  name: 'breaker: the pile\'s churn is bounded by churnSize × pile, zero off the pile, and its slope is finite',
  async run(renderer) {
    const time = uniform(3.7);
    const u = { churnSize: uniform(0.2), churnSpeed: uniform(1) };
    const piles = [0, 0.5, 2];
    const frames: [number, number][] = Array.from({ length: 40 }, (_, i) => [-12 + 0.61 * i, 7 - 0.37 * i]);
    let worstOver = -Infinity, nonZero = 0, zeroOff = true, finite = true;
    for (const pile of piles) {
      const { pass, outAttr } = computeAt(frames, 1, (frame) => {
        const h = churnHeightNode(float(pile), frame, time, u);
        const s = churnSlopeNode(float(pile), frame, vec2(0.6, 0.8), time, u);
        return [vec4(h, s.x, s.y, 0.0)];
      });
      renderer.compute(pass);
      const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
      frames.forEach((_, i) => {
        const [h, sx, sz] = out.slice(i * 4, i * 4 + 3);
        worstOver = Math.max(worstOver, Math.abs(h) - 0.5 * 0.2 * pile);
        if (pile === 0 && h !== 0) zeroOff = false;
        if (pile > 0 && Math.abs(h) > 0.02 * pile) nonZero++;
        if (![h, sx, sz].every(Number.isFinite)) finite = false;
      });
    }
    const ok = worstOver <= 1e-5 && zeroOff && finite && nonZero > 20;
    return { pass: ok, detail: `worst |h| over its bound ${worstOver.toExponential(2)} m; zero off the pile ${zeroOff}; finite ${finite}; lumps > 2% of the pile ${nonZero}/80` };
  },
});
```

- [ ] **Step 2: See it fail.**

Run: `npx tsc --noEmit -p .`
Expected: FAIL with "Cannot find module '../whitewater/pileChurn'".

- [ ] **Step 3: Create `src/whitewater/pileChurn.ts`.**

```ts
import { Fn, If, float, mx_noise_float, vec2, vec3 } from 'three/tsl';

type N = any;

/**
 * The whitewater pile's churn (spec 2026-09-29 §3.3): lumps on the pile's top, rolling with the wave (read in its crest
 * frame, SetWaves' foamFrame: m behind the crest, m along it) and changing over time, up to ± half of churnSize × the
 * pile's height. Render detail like the FFT chop: the height probe reads the smooth pile; the sheet and the ribbon add
 * this in their vertex stages and its slope to their shading normals.
 */
/** The lumps: this many cycles per metre in the crest frame (about 2 m across)… */
export const CHURN_SCALE_PER_M = 0.5;
/** …churning at this many cycles per second × churnSpeed. */
export const CHURN_RATE_PER_S = 0.5;
/** The slope's finite-difference half step (m). */
const SLOPE_STEP_M = 0.2;

function churnNoise(p: N, time: N, speed: N): N {
  const t = time.mul(speed).mul(CHURN_RATE_PER_S);
  const n1 = mx_noise_float(vec3(p.x.mul(CHURN_SCALE_PER_M), p.y.mul(CHURN_SCALE_PER_M), t));
  const n2 = mx_noise_float(vec3(p.x.mul(CHURN_SCALE_PER_M * 2.3).add(7.1), p.y.mul(CHURN_SCALE_PER_M * 2.3), t.mul(1.7)));
  return n1.mul(0.7).add(n2.mul(0.3));
}

/** The churn's height (m) for a pile `pile` m high: 0 off the pile. */
export function churnHeightNode(pile: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const h = float(0.0).toVar();
    If(pile.greaterThan(1e-3), () => { h.assign(churnNoise(frame, time, u.churnSpeed).mul(pile).mul(u.churnSize).mul(0.5)); });
    return h;
  })();
}

/**
 * The churn's world slope (∂h/∂x, ∂h/∂z), the pile's height held constant (its own slope is in SetWaves' analytic
 * slope): central differences in the crest frame, turned to world axes by the wave's travel `travel` (the frame's x runs
 * back against it, its y across it: SetWaves' foamFrame).
 */
export function churnSlopeNode(pile: N, frame: N, travel: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const s = vec2(0.0).toVar();
    If(pile.greaterThan(1e-3), () => {
      const e = SLOPE_STEP_M;
      const gx = churnNoise(frame.add(vec2(e, 0.0)), time, u.churnSpeed).sub(churnNoise(frame.sub(vec2(e, 0.0)), time, u.churnSpeed)).div(2 * e);
      const gy = churnNoise(frame.add(vec2(0.0, e)), time, u.churnSpeed).sub(churnNoise(frame.sub(vec2(0.0, e)), time, u.churnSpeed)).div(2 * e);
      const across = vec2(travel.y.negate(), travel.x);
      s.assign(travel.mul(gx.negate()).add(across.mul(gy)).mul(pile.mul(u.churnSize).mul(0.5)));
    });
    return s;
  })();
}
```

- [ ] **Step 4: Run the self-tests** (as in Task 7 Step 6).
Expected: the churn self-test PASSES. If `mx_noise_float` ever exceeds ±1, so that the bound fails by a hair, report the excess. Don't widen the bound silently.

- [ ] **Step 5: Put the churn on the sheet.**
  - In `SetWaves.displacementWithSetFoamNode`, after the assigns:

```ts
      // The pile's churn (render only: the probe's displacementNode leaves it out).
      const churn = churnHeightNode(s.pile, s.foamFrame, this.time, this.churn);
      return vec3(s.dh.x, s.eta.add(churn), s.dh.y);
```

    (`sumBreaking(xz, true)` already computes `foamFrame` here.) Update the doc comment: "…+ the whitewater pile's churn (pileChurn.ts)".
  - In `OceanSurface.ts`, after `const fft = …`:

```ts
    // The pile's churn tilts the shading (its height is in the vertex stage, SetWaves.displacementWithSetFoamNode).
    const churnSlope = churnSlopeNode(setPile, setFoamFrame, model.sets.meanTravel, model.sets.time, model.sets.churn);
    const normal = sheetNormal(fft, setSlope.add(churnSlope));
```

    (This replaces the existing `const normal = sheetNormal(fft, setSlope);`. Update the comment above `setFoamFrame` use, "setFoamFrame … unused here", to "the churn reads it".)

- [ ] **Step 6: Put the same churn on the ribbon** (its edges must meet the sheet, which is churned at the same base point). In `buildMaterial`, replace the `vSetFoam` block with:

```ts
    // The sheet at the home, from one set-wave sum per vertex (the sheet's own vertex-stage sum): its foam, foam frame,
    // analytic slope and pile reach the fragment through varying properties, and the pile's churn lifts the vertex as it
    // lifts the sheet there, so the ribbon's edges stay on the sheet.
    const vSetSlope: N = varyingProperty('vec2', 'vRibbonSetSlope');
    const vSetFoam: N = varyingProperty('float', 'vRibbonSetFoam');
    const vPile: N = varyingProperty('float', 'vRibbonPile');
    const vFrame: N = varyingProperty('vec2', 'vRibbonFrame');
    const churn = Fn(() => {
      const b = model.sets.breakSampleNode(home.xy);
      vSetSlope.assign(b.slope);
      vSetFoam.assign(sheetFoamWeight(b.foam, foamMap ? foamMap.sampleNode(home.xy) : null));
      vPile.assign(b.pile);
      vFrame.assign(b.foamFrame);
      return churnHeightNode(b.pile, b.foamFrame, model.sets.time, model.sets.churn);
    })();
    material.positionNode = vec3(pos.x, model.seabed.tide.add(pos.y).add(churn).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)), pos.z);
```

  - Delete the earlier `material.positionNode = …` line that this replaces (it sits above, after `radial`).
  - In `ribbonShadingNormal({ … setSlope: vSetSlope … })`, pass `setSlope: vSetSlope.add(churnSlopeNode(vPile, vFrame, model.sets.meanTravel, model.sets.time, model.sets.churn))`.
  - Imports: `varyingProperty` if missing, and `churnHeightNode, churnSlopeNode` from `../whitewater/pileChurn`.

- [ ] **Step 7: Check it builds and renders.**

Run: `npx tsc --noEmit -p . && npx vitest run src/breaker src/ocean src/whitewater`
Expected: PASS.

Then in the browser pane:
- open `http://localhost:5173/#ref=surf-from-the-lineup`;
- `read_console_messages` with `onlyErrors: true`: expect none;
- re-run `?selftest`: expect all pass;
- take a screenshot of the whitewater.

- [ ] **Step 8: Commit.**

```bash
git add src/whitewater/pileChurn.ts src/breaker/SetWaves.ts src/ocean/OceanSurface.ts src/breaker/BreakingRibbon.ts src/breaker/breaker.selftest.ts
git commit -m "feat(look): the pile churns: rolling lumps up to a fifth of its height, on the sheet and the ribbon alike (render only)"
```

---

### Task 9: The lip's light (turquoise by thickness, skylight from the side)

**Files:**
- Modify: `src/ocean/waterOptics.ts` (`WaterOpticsParams.lipSideSkylight`, `LIP_REFERENCE_THICKNESS_M`, `lipTransmissionColour`)
- Modify: `src/ocean/waterShading.ts` (uniforms, `WaterSurfaceInputs.lipThickness`, the transmission)
- Modify: `src/breaker/BreakingRibbon.ts:530, 538-540` (`lip`, `lipThickness`)
- Modify: `src/dev/DevPanel.ts:344-346` (Water slider)
- Test: `src/ocean/waterOptics.test.ts`, `src/dev/devSettings.test.ts`

**Interfaces:**
- Produces:
  - `lipTransmissionColour(p: WaterOpticsParams, thicknessM: number): Rgb`;
  - `LIP_REFERENCE_THICKNESS_M = 0.3`;
  - uniforms `absorption`, `transmissionThicknessM`, `lipSideSkylight`;
  - `WaterSurfaceInputs.lipThickness?: N`.

- [ ] **Step 1: Write the failing tests.** In `waterOptics.test.ts`:

```ts
  it('the lip\'s colour deepens with its thickness: turquoise where thin, blue-green where thick (Beer–Lambert)', () => {
    const p = DEFAULT_WATER_OPTICS;
    const thin = lipTransmissionColour(p, 0.3), thick = lipTransmissionColour(p, 0.8);
    expect(thin).toEqual(transmissionColour(p)); // the reference thickness is the slider's path
    expect(thin[1]).toBeGreaterThan(thin[0]);
    expect(thin[2]).toBeGreaterThan(thin[0]);
    for (let i = 0; i < 3; i++) expect(thick[i]).toBeLessThanOrEqual(thin[i]);
    expect(thick[0] / thin[0]).toBeLessThan(thick[1] / thin[1]); // red goes first: deeper blue-green
    expect(lipTransmissionColour(p, 0)).toEqual([1, 1, 1]);
  });
```

  In `devSettings.test.ts`, beside "a profile stored before the toggle existed…" (it uses the file's `store`, `defaults` and `tweaked` helpers):

```ts
  it('a water look saved before the lip\'s side skylight loads with its default and keeps its other tweaks', () => {
    const raw = JSON.parse(JSON.stringify(tweaked()));
    delete raw.water.lipSideSkylight;
    const got = loadDevSettings(store(raw), defaults())!;
    expect(got.water.lipSideSkylight).toBe(DEFAULT_WATER_OPTICS.lipSideSkylight);
    expect(got.water.bodyScale).toBe(tweaked().water.bodyScale);
  });
  it('a breaking look saved by model 4 (before the barrel and the pile) loads the new defaults', () => {
    const got = loadDevSettings(store(JSON.parse(JSON.stringify(tweaked())), 4), defaults())!;
    expect(got.breaking).toEqual(DEFAULT_BREAK_PARAMS);
  });
```

  (`mergeValue` over the defaults and the `BREAKING_MODEL` check should already make both pass once the field exists. The tests pin that.)

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run src/ocean/waterOptics.test.ts src/dev/devSettings.test.ts`
Expected: FAIL (`lipTransmissionColour` is missing; `lipSideSkylight` is undefined).

- [ ] **Step 3: Implement the CPU side.**
  - In `waterOptics.ts`, add to `WaterOpticsParams`:

```ts
  /** Diffuse skylight through the lip seen from the side (the lineup, down the line), as a fraction of the transmission's
   * scale; from beneath it is lipSkyTransmission. */
  lipSideSkylight: number;
```

  - Add `lipSideSkylight: 0.6` to `DEFAULT_WATER_OPTICS`, then add:

```ts
/** The lip thickness (m) at which the light through it has come transmissionThicknessM through the water. */
export const LIP_REFERENCE_THICKNESS_M = 0.3;

/** The colour of light through a lip `thicknessM` thick: exp(−a·transmissionThicknessM·thickness / LIP_REFERENCE_THICKNESS_M). */
export function lipTransmissionColour(p: WaterOpticsParams, thicknessM: number): Rgb {
  const path = (p.transmissionThicknessM * Math.max(thicknessM, 0)) / LIP_REFERENCE_THICKNESS_M;
  return [0, 1, 2].map((i) => Math.exp(-p.absorptionPerM[i] * path)) as Rgb;
}
```

  - In `DevPanel.ts`, after the `lipSkyTransmission` binding:

```ts
    water.addBinding(m.water, 'lipSideSkylight', { label: 'lip side skylight', min: 0, max: 2, step: 0.01 }).on('change', h.onWater);
```

- [ ] **Step 4: Implement the GPU side** in `waterShading.ts`.
  - Uniforms, in `createWaterOpticsUniforms`:

```ts
    absorption: uniform(new THREE.Vector3(...p.absorptionPerM)),
    transmissionThicknessM: uniform(p.transmissionThicknessM),
    lipSideSkylight: uniform(p.lipSideSkylight),
```

    and the matching lines in `updateWaterOpticsUniforms`:

```ts
  u.absorption.value.set(...p.absorptionPerM);
  u.transmissionThicknessM.value = p.transmissionThicknessM;
  u.lipSideSkylight.value = p.lipSideSkylight;
```

  - `WaterSurfaceInputs` gains:

```ts
  /** The lip's thickness (m) where `lip` is set: the light through it takes the water's colour over a path growing with
   * it (waterOptics.lipTransmissionColour). Absent: the fixed transmissionThicknessM path. */
  lipThickness?: N;
```

  - Replace the two transmission lines with:

```ts
  // Lip transmission: light through the lip toward the viewer (spec 2026-09-29 §3.3), coloured by the water it crossed:
  // turquoise where the lip is thin, deeper blue-green toward its thick root (Beer–Lambert over a path that grows with the
  // thickness). The sun from behind it, and the skylight through it from beneath (the tube's ceiling) and from the side.
  const backlight = pow(saturate(dot(v.negate(), l)), 4.0);
  const lipLight = sky.sunIlluminance.mul(backlight).mul(sv)
    .add(sky.skyIrradiance.mul(u.lipSkyTransmission).mul(max(underside, u.lipSideSkylight)));
  const lipColour = i.lipThickness
    ? exp(u.absorption.mul(u.transmissionThicknessM.mul(i.lipThickness).div(LIP_REFERENCE_THICKNESS_M)).negate())
    : u.transmission;
  const transmitted = i.lip ? lipColour.mul(lipLight).mul(saturate(i.lip)).mul(u.transmissionIntensity).div(PI) : vec3(0.0);
```

    Import `exp` from `three/tsl` and `LIP_REFERENCE_THICKNESS_M` from `./waterOptics`. Note that the side term is `lipSkyTransmission × max(underside, lipSideSkylight)`: from beneath it keeps today's value, and from the side it is `lipSkyTransmission × lipSideSkylight`.
  - `BreakingRibbon.ts`: replace the thin-keyed mask

```ts
    const lip = float(1.0).sub(smoothstep(0.05, 0.6, thickness)).mul(lipness);
```

    with

```ts
    // The whole lip transmits (spec §3.3): its colour comes from its thickness (shadeWater's lipThickness), so the thick
    // root glows deeper, not dark.
    const lip = lipness;
```

    and add `lipThickness: thickness,` to the `shadeWater({ … lip, underside, … })` inputs.

- [ ] **Step 5: Run the tests and type-check.**

Run: `npx vitest run src/ocean src/dev src/breaker && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Look at it.** In the browser pane, open `http://localhost:5173/#ref=lip-close-up` and then `#ref=barrel-peeling`. Screenshot each. The lip should glow turquoise toward its edge and deeper blue-green at the root, not white and not dark. Check `read_console_messages` with `onlyErrors: true` shows nothing.

- [ ] **Step 7: Commit.**

```bash
git add src/ocean/waterOptics.ts src/ocean/waterOptics.test.ts src/ocean/waterShading.ts src/breaker/BreakingRibbon.ts src/dev/DevPanel.ts src/dev/devSettings.test.ts
git commit -m "feat(look): the lip glows by its thickness (turquoise thin, blue-green thick) with skylight through it from the side"
```

---

### Task 10: Verify against the photo, measure the cost, report

**Files:**
- Create: `docs/superpowers/gallery/barrel-and-whitewater/README.md` (captures, measurements, notes), plus screenshots in that folder
- Modify: memory `barrel-whitewater-design.md` (status)

**Interfaces:** none.

- [ ] **Step 1: Run the full suite and the type check.**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass. The heath plant-cache test is a known timing flake near 5 s: if it alone fails, re-run it on its own (`npx vitest run -t "plant cache"`) and note it.

- [ ] **Step 2: Run the GPU self-tests** (`http://localhost:5173/?selftest`). Record the SUMMARY line (n/n passing) in the gallery README.

- [ ] **Step 3: Gallery shots.** Read `docs/superpowers/gallery/phase-5/` first for how captures and costs were recorded, and follow the same format.
  - The barrel side on from the channel: `#ref=the-drain` as the lip lands.
  - Down the line: `#ref=barrel-peeling`, `#ref=lip-close-up`.
  - From the lineup: `#ref=surf-from-the-lineup`.
  - The whitewater pile at +2, +4 and +7 s after the landing: from `the-drain`, resume with `P`, then pause with `P` at each moment and screenshot. Or copy a moment link with `L` and edit its time.
  - Save the screenshots in the gallery folder. In the README, set each one beside what the photo shows (thick lip, far throw, round tube, trough below sea level, turquoise lip, a pile at or above lip height in front of the falls, lumpy and bright).

  Send the side-on barrel and the +2 s pile shot to Andrew with SendUserFile when done.

- [ ] **Step 4: Measure the cost.** Measure frame time at the default moment (`morning-offshore`) and at `barrel-peeling`, on the RTX (check the stats overlay names it), before (`git stash` or check out `13a7719` in a scratch worktree) and after, the way the phase-5 gallery measured. Record both. Flag anything more than +1 ms.

- [ ] **Step 5: Update memory.** In `C:\Users\Andre\.claude\projects\C--Dev-andrew-dev-personal-projects-liquid-dreaming\memory\barrel-whitewater-design.md`, change the status to "built on branch `barrel-and-whitewater` (not merged); awaiting Andrew's look", and add the measured numbers (barrel metrics, half distances, cost). Update the `MEMORY.md` line's hook to match.

- [ ] **Step 6: Commit the gallery.**

```bash
git add docs/superpowers/gallery/barrel-and-whitewater
git commit -m "docs(gallery): the barrel and the whitewater pile beside Andrew's photo; cost at the default moment and barrel-peeling"
```

- [ ] **Step 7: Report to Andrew.** Keep it short and plain:
  - what he'll see;
  - the barrel's numbers against the photo;
  - the pile's height at landing and its half distance;
  - the cost;
  - anything that didn't meet the spec, and why.

  Don't merge or push: wait for his look.
