# The Lip and Tube Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the barrel read hollow from the shoulder and the beach: a clear lip curtain (foam only where it belongs), a lip that glows with the sun on any side, and a tube whose inside is lit only through its mouth and its lip.

**Architecture:** Three independent changes to the breaking ribbon (the mesh that draws the curl). (1) The curl's foam rule in `lipProfile.profilePoint` and its GPU mirror. (2) A bubble-scattering glow for the lip in `shadeWater`, with a CPU mirror in `waterOptics.ts`. (3) Per-vertex "tube light" numbers (sun through the lip, sun behind the wave's body, open sky) from the profile's own angles: a CPU reference in `lipProfile.ts`, a new GPU compute pass writing a new vertex attribute, and `shadeWater` using them.

**Tech Stack:** TypeScript, three.js WebGPU + TSL node shaders, Vitest (CPU), GPU self-tests in Electron.

**Spec:** `docs/superpowers/specs/2026-10-03-lip-and-tube-look-design.md` (with its §6 amendment).

## Global Constraints

- Work in the `ld-tube` worktree (`C:\Dev\andrew-dev-personal-projects\ld-tube`), branch `lip-look`. Never touch `ld-surfer` or `liquid-dreaming/.claude/worktrees/*`.
- Never merge to `main` without Andrew's explicit word. Pushing `lip-look` is routine.
- The tube's shape does not change: `hollowFace.test.ts` and `barrelSize.test.ts` stay green.
- Every ribbon compute pass binds at most `MAX_STORAGE_BUFFERS_PER_STAGE` (8) storage buffers; the vertex pass is already at 8 and is not touched.
- Every CPU change in `lipProfile.ts` has its mirror in `lipProfileNodes.ts` / the ribbon passes; the CPU is the source of truth.
- Vitest: `npx vitest run <files> --maxWorkers=3` (from the worktree root).
- GPU self-tests: dev server `ld-tube` (port 5185, `.claude/launch.json` in the main checkout; start it with the preview tool, `preview_start {name: "ld-tube"}`), then `npx electron C:/Users/Andre/AppData/Local/Temp/claude/C--Dev-andrew-dev-personal-projects-liquid-dreaming/2f1b1e6d-5dc1-4f2a-9291-0c8eb7bc831f/scratchpad/selftest-runner.mjs --url=http://localhost:5185/?selftest=<filter>`. The sound timing check flakes in full runs; it passes alone.
- Log every deviation from this plan as a ruling.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The sun below the horizon (dawn, dusk, night):** the tube light must stay finite and in [0, 1], and nothing inside the tube lights up. Pinned in Task 3 (sun at −20°).
2. **The young lip (the first few % of the throw, tip ≈ root):** the angles from a wall point to two nearly equal points must stay finite with no flicker. Pinned in Task 3 (4% of the throw).
3. **Dead and gap rows on the GPU:** the light pass reads stale positions there; the attribute must stay finite. Pinned in Task 4 (the self-test's non-finite count includes `lights`).
4. **Changing the time of day while paused:** the ribbon must recompute its light (R3.6). Pinned in Task 4 (App's key) and checked by eye in Task 6.
5. **Overcast (no direct sun):** the lip must still glow from the sky. Pinned in Task 2 (sun 0, sky only → glow > 0).

---

### Task 1: The curl's foam zones (CPU and GPU)

**Files:**
- Create: `src/breaker/lipFoam.test.ts`
- Modify: `src/breaker/lipProfile.ts` (constants near `LIP_SPRAY`, ~line 469; `profilePoint`, ~line 674)
- Modify: `src/breaker/lipProfileNodes.ts` (imports lines 6–7; `profilePointNode` foam block, ~lines 689–702)

**Interfaces:**
- Consumes: `buildProfile`, `sampleSegment`, `OUTER_LIP_SHARE`, `LANDING_FOAM_RISE`, `LIP_SPRAY_PROGRESS` (lipProfile.ts); `peakSetup`, `peakStation`, `peakLanding` (peakStation.fixture.ts); `TIDES`, `peakPsi`, `setWaveHeight` (reefReport.ts).
- Produces: `LIP_STREAK = 0.45`, `LIP_TIP_BAND = 0.85`, `LIP_TOP_BAND = 0.25`, `CLIMB_SOFT = 0.15` exported from lipProfile.ts; `LIP_SPRAY` and `LIP_SPRAY_FROM` removed.

- [ ] **Step 1: Write the failing test**

`src/breaker/lipFoam.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OUTER_LIP_SHARE, PROFILE_SEGMENTS, type Profile, buildProfile, sampleSegment } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * Andrew's foam zones (2026-09-29) and the clear curtain (spec 2026-10-03 lip-and-tube-look §3): while the tube is held
 * open the lip's outside is clear water with streaks at its top edge and tip; foam climbs up it from where it hit as the
 * tube collapses.
 */
const n = PROFILE_SEGMENTS;
const OUTER0 = n.front + n.face + n.wall + n.under + n.cap;
/** σ of an outer sample: 0 over the tube's top, 1 at the tip (lipProfile.profilePoint's). */
const sigmaOf = (j: number, p: Profile): number => (p.frame.xiTip > 0 ? Math.max(0, Math.min(1, 1 - sampleSegment(j).s / OUTER_LIP_SHARE)) : 0);
const onBand = (j: number): boolean => sampleSegment(j).s <= OUTER_LIP_SHARE;

describe("the lip's outside is a clear curtain while the tube is held open, and foams from where it hit as it collapses", () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [4, 8, 12]) {
      it(`${ft} ft, ${tide} tide`, { timeout: 180_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return; // doesn't break at the peak at this size and tide
        const tl = peakLanding(psi, { setup });
        const at = (tb: number): Profile => { const st = peakStation(psi, tb, { setup }); return buildProfile(st.base, st.input, st.lip, st.frameBase); };
        // The hold: landed, not yet collapsing.
        let held: Profile | null = null, tb = tl;
        for (; tb < tl + 3; tb += 0.05) { const p = at(tb); if (p.frame.landing > 0.99 && p.frame.collapse === 0) { held = p; break; } }
        if (held === null || held.frame.weight < 0.1) return; // no tube to hold (ψ too small at this size and tide)
        const where = `${ft} ft ${tide} held at tb ${tb.toFixed(2)}`;
        for (let j = OUTER0; j < OUTER0 + n.outer; j++) {
          const sg = sigmaOf(j, held);
          if (onBand(j) && sg >= 0.2 && sg <= 0.8) expect(held.curlFoam[j], `${where}: mid-curtain j ${j} σ ${sg.toFixed(2)}`).toBeLessThan(0.1);
        }
        const capMid = OUTER0 - n.cap / 2;
        expect(held.curlFoam[capMid], `${where}: the tip where it hit`).toBeGreaterThanOrEqual(0.5);
        const front = held.curlFoam.slice(0, n.front);
        expect(Math.max(...front), `${where}: the water where it landed`).toBeGreaterThanOrEqual(0.5);
        // The collapse: each outer sample's foam never falls, and it climbs (the middle before the top).
        let prev = held.curlFoam.slice(OUTER0, OUTER0 + n.outer), midFirst: number | null = null, topAtMid = 0, last = held;
        const mid = OUTER0 + Math.round((1 - 0.5) * OUTER_LIP_SHARE * n.outer);
        const tops = Array.from({ length: n.outer }, (_, k) => OUTER0 + k).filter((j) => onBand(j) && sigmaOf(j, held!) <= 0.1);
        for (let t = tb; t < tb + 8; t += 1 / 30) {
          const p = at(t);
          const cur = p.curlFoam.slice(OUTER0, OUTER0 + n.outer);
          cur.forEach((c, k) => expect(c, `${where}: outer ${k} at tb ${t.toFixed(2)} fell`).toBeGreaterThanOrEqual(prev[k] - 1e-6));
          if (midFirst === null && p.curlFoam[mid] > 0.5) { midFirst = t; topAtMid = Math.max(...tops.map((j) => p.curlFoam[j])); }
          prev = cur; last = p;
          if (p.frame.collapse >= 0.3 + 1e-3 && midFirst !== null) break; // past the foam's rise (LANDING_FOAM_RISE)
        }
        expect(midFirst, `${where}: the mid-curtain foams`).not.toBeNull();
        expect(topAtMid, `${where}: the top when the middle first foams`).toBeLessThan(0.5);
        for (let j = OUTER0; j < OUTER0 + n.outer; j++) if (onBand(j)) expect(last.curlFoam[j], `${where}: outer j ${j} after the rise`).toBeGreaterThanOrEqual(0.9);
      });
    }
  }
});
```

Note: `OUTER0 - n.cap / 2` is the cap's middle sample (the cap sits just before the outer segment).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/breaker/lipFoam.test.ts --maxWorkers=3`
Expected: FAIL on "mid-curtain … expected 1 to be less than 0.1" (today the whole outside is `landed` = 1 once landed).

- [ ] **Step 3: Write the CPU implementation**

In `src/breaker/lipProfile.ts`, replace the spray constants (the `LIP_SPRAY`, `LIP_SPRAY_PROGRESS`, `LIP_SPRAY_FROM` block):

```ts
/**
 * The lip's streaks (Andrew's sketch, 2026-09-29: the lip streaked white along its outer top as it throws; spec
 * 2026-10-03 lip-and-tube-look §3): at most this much foam, so the foam pattern breaks into streaks, not a sheet. At its
 * tip (σ from LIP_TIP_BAND) and along its top edge (σ below LIP_TOP_BAND), grown in over LIP_SPRAY_PROGRESS of the throw
 * and kept through the landing and the hold.
 */
export const LIP_STREAK = 0.45;
export const LIP_SPRAY_PROGRESS: readonly [number, number] = [0.2, 0.7];
export const LIP_TIP_BAND = 0.85;
export const LIP_TOP_BAND = 0.25;
/** Once landed, foam climbs the curtain from where it hit (σ 1) to its top (σ 0) over the foam's rise (LANDING_FOAM_RISE
 * of the collapse); its leading edge is this wide in σ. */
export const CLIMB_SOFT = 0.15;
```

In `profilePoint`, replace from the `// In the air: the outside's spray` comment through the `curlFoam` assignment with:

```ts
  // The lip's outside (σ: the tube's top 0 to the tip 1; the cap is the tip): streaks at its tip and along its top edge
  // while it throws and is held (the lip's band only: the outer samples past OUTER_LIP_SHARE run level to the crest), and
  // once landed foam climbing from where it hit as the tube collapses (Andrew, 2026-10-03: the solid white lip read as an
  // opaque pale curtain). The tube's inside stays clean in the air and while held.
  const sigma = seg === 'outer' ? (f.xiTip > 0 ? Math.max(0, Math.min(1, 1 - s / OUTER_LIP_SHARE)) : 0) : seg === 'cap' ? 1 : 0;
  const band = seg === 'cap' ? 1 : seg === 'outer' && f.xiTip > 0 ? 1 - smoothstep(OUTER_LIP_SHARE, 1, s) : 0;
  const streakAt = Math.max(smoothstep(LIP_TIP_BAND, 1, sigma), 1 - smoothstep(0, LIP_TOP_BAND, sigma));
  const streak = LIP_STREAK * smoothstep(LIP_SPRAY_PROGRESS[0], LIP_SPRAY_PROGRESS[1], f.prog) * streakAt * band * (f.weight + (1 - f.weight) * f.landing);
  const climb = smoothstep(0, LANDING_FOAM_RISE, f.collapse);
  const up = smoothstep(1 - climb - CLIMB_SOFT, 1 - climb, sigma);
  const air = f.weight * (1 - f.landing);
  // The tube's inside stays clean while it is held open after the landing, and turns to foam as it collapses (Andrew's
  // photo, 2026-09-29: full foam once it has imploded).
  const filled = landed * smoothstep(0, LANDING_FOAM_RISE, f.collapse);
  const curlFoam = seg === 'outer' || seg === 'cap' ? Math.max(landed * up, streak)
    : seg === 'face' || seg === 'wall' || seg === 'under' ? filled - air
      : landed;
```

Update the `ProfilePoint.curlFoam` doc comment's "(LIP_SPRAY, most at the tip)" to "(LIP_STREAK, at its tip and top edge)".

- [ ] **Step 4: Run the CPU tests**

Run: `npx vitest run src/breaker/lipFoam.test.ts src/breaker/lipProfile.test.ts src/breaker/hollowFace.test.ts --maxWorkers=3`
Expected: PASS. If `lipProfile.test.ts`'s "the foam zones" test fails on `tip > 0.3`, the streak at 0.8 τ is LIP_STREAK × ramp × weight: lower that bound to 0.2 and ledger it as a ruling (the tip's streak is capped at 0.45 by the spec).

- [ ] **Step 5: Write the GPU mirror**

In `src/breaker/lipProfileNodes.ts` imports, replace `LIP_SPRAY, LIP_SPRAY_FROM,` with `CLIMB_SOFT, LIP_STREAK, LIP_TIP_BAND, LIP_TOP_BAND,` (keep `LIP_SPRAY_PROGRESS`). In `profilePointNode`, replace the `sigma` … `curlFoam` lines with:

```ts
  const sigma = select(isOuter, select(f.xiTip.greaterThan(0.0), clamp(float(1.0).sub(sv.div(OUTER_LIP_SHARE)), 0.0, 1.0), float(0.0)), select(isCap, float(1.0), float(0.0)));
  // lipProfile.profilePoint: streaks at the tip and the top edge (the lip's band), foam climbing from where it hit.
  const band = select(isCap, float(1.0), select(isOuter.and(f.xiTip.greaterThan(0.0)), float(1.0).sub(smoothstep(OUTER_LIP_SHARE, 1.0, sv)), float(0.0)));
  const streakAt = max(smoothstep(LIP_TIP_BAND, 1.0, sigma), float(1.0).sub(smoothstep(0.0, LIP_TOP_BAND, sigma)));
  const streak = smoothstep(LIP_SPRAY_PROGRESS[0], LIP_SPRAY_PROGRESS[1], f.prog).mul(LIP_STREAK).mul(streakAt).mul(band).mul(mix(f.weight, float(1.0), f.landing));
  const climb = smoothstep(0.0, LANDING_FOAM_RISE, f.collapse);
  const up = smoothstep(float(1.0).sub(climb).sub(CLIMB_SOFT), float(1.0).sub(climb), sigma);
  const air = f.weight.mul(float(1.0).sub(f.landing));
  // The tube's inside stays clean while it is held open and foams as it collapses (lipProfile.profilePoint).
  const filled = landed.mul(smoothstep(0.0, LANDING_FOAM_RISE, f.collapse));
  const curlFoam = select(isOuter.or(isCap), max(landed.mul(up), streak), select(isInside, filled.sub(air), landed));
```

(`mix`, `max`, `clamp`, `select`, `smoothstep`, `float` are already imported there; add any that are not.)

- [ ] **Step 6: Run the node tests and the GPU mirror**

Run: `npx vitest run src/breaker/lipProfileNodes.test.ts src/breaker/BreakingRibbon.test.ts --maxWorkers=3`
Expected: PASS.

Then start `ld-tube` (preview_start `{name: "ld-tube"}`) and run:
`npx electron C:/Users/Andre/AppData/Local/Temp/claude/C--Dev-andrew-dev-personal-projects-liquid-dreaming/2f1b1e6d-5dc1-4f2a-9291-0c8eb7bc831f/scratchpad/selftest-runner.mjs --url=http://localhost:5185/?selftest=ribbon`
Expected: every `ribbon:` self-test passes; "ribbon: GPU profile matches lipProfile" reports `|Δextras|` < 2e-3 (it compares curlFoam per vertex).

- [ ] **Step 7: Commit**

```bash
git add src/breaker/lipFoam.test.ts src/breaker/lipProfile.ts src/breaker/lipProfileNodes.ts src/breaker/lipProfile.test.ts
git commit -m "feat(barrel): a clear lip curtain while the tube is held; foam climbs it from where it hit (Andrew, foam zones)"
```

---

### Task 2: The lip's glow (bubble scattering)

**Files:**
- Modify: `src/ocean/waterOptics.ts` (params, defaults, new functions)
- Modify: `src/ocean/waterOptics.test.ts`
- Modify: `src/ocean/waterShading.ts` (uniforms; `shadeWater`'s column)
- Modify: `src/dev/DevPanel.ts:502` (binding)

**Interfaces:**
- Consumes: `lipTransmissionColour(p, thicknessM)`, `waterAlbedo(p)` (waterOptics.ts).
- Produces: `WaterOpticsParams.lipBubbleScatter: number` (default 0.5); `lipScatterShare(p, thicknessM): number`; `lipGlow(p, thicknessM, sunCos, sun: Rgb, sky: Rgb): Rgb`; `lipThroughLight(p, thicknessM, backCos, underside, sun: Rgb, sky: Rgb): Rgb`; `deepUpwelling(p, sunY, sun: Rgb, sky: Rgb): Rgb`; `WaterOpticsUniforms.lipBubbleScatter`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ocean/waterOptics.test.ts` (and add `deepUpwelling, lipGlow, lipThroughLight` to its import from `./waterOptics`):

```ts
describe("the lip's glow: its bubbles scatter light out on every side (spec 2026-10-03 lip-and-tube-look §4)", () => {
  const p = DEFAULT_WATER_OPTICS;
  const sun: [number, number, number] = [1, 1, 1], sky: [number, number, number] = [0.3, 0.35, 0.45];
  const luma = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  it('a thinner lip glows more turquoise (green and blue over red)', () => {
    const thin = lipGlow(p, 0.3, 0.5, sun, sky), thick = lipGlow(p, 1.5, 0.5, sun, sky);
    expect(thin[1] / thin[0]).toBeLessThan(thick[1] / thick[0]); // thick: red absorbed more, relative to green
    expect(thin[1]).toBeGreaterThan(thin[0]);
    expect(thin[2]).toBeGreaterThan(thin[0]);
  });
  it('from 0.1 m to 3 m the glow is never darker than the deep water under the same light', () => {
    for (let t = 0.1; t <= 3; t += 0.1) expect(luma(lipGlow(p, t, 0.5, sun, sky)), `t ${t.toFixed(1)} m`).toBeGreaterThanOrEqual(luma(deepUpwelling(p, 0.5, sun, sky)));
  });
  it('the sun in front still lights it (no backlight)', () => {
    expect(luma(lipGlow(p, 1.5, 0.8, sun, [0, 0, 0]))).toBeGreaterThan(0);
  });
  it('overcast (no direct sun): the sky alone still lights it', () => {
    expect(luma(lipGlow(p, 1.5, 0, [0, 0, 0], sky))).toBeGreaterThan(0);
  });
  it('the sun behind the lip lights it more than the sun in front at the same angle to its surface', () => {
    const front = lipGlow(p, 1.5, 0.5, sun, sky).map((c, i) => c + lipThroughLight(p, 1.5, -0.5, 0, sun, sky)[i]);
    const behind = lipGlow(p, 1.5, 0.5, sun, sky).map((c, i) => c + lipThroughLight(p, 1.5, 0.9, 0, sun, sky)[i]);
    expect(luma(behind)).toBeGreaterThan(luma(front));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ocean/waterOptics.test.ts --maxWorkers=3`
Expected: FAIL: `lipGlow` is not exported.

- [ ] **Step 3: Implement the CPU side**

In `src/ocean/waterOptics.ts`, add to `WaterOpticsParams` after `lipSideSkylight`:

```ts
  /** The thrown lip's bubbles (1/m): of the light entering it, 1 − exp(−lipBubbleScatter × thickness) scatters back out,
   * on any side (spec 2026-10-03 lip-and-tube-look §4; tuned against Andrew's image10). */
  lipBubbleScatter: number;
```

Add `lipBubbleScatter: 0.5,` to `DEFAULT_WATER_OPTICS` after `lipSideSkylight`. Append:

```ts
/** The share of the light entering a lip `thicknessM` thick that its bubbles scatter back out. */
export function lipScatterShare(p: WaterOpticsParams, thicknessM: number): number {
  return 1 - Math.exp(-p.lipBubbleScatter * Math.max(thicknessM, 0));
}

/**
 * The lip's glow (shadeWater's mirror): sun (× |cos| to the lip's surface: it enters through whichever face it lights) and
 * sky entering the lip, scattered out by its bubbles, coloured by the water crossed (lipTransmissionColour). Radiance.
 */
export function lipGlow(p: WaterOpticsParams, thicknessM: number, sunCos: number, sun: Rgb, sky: Rgb): Rgb {
  const c = lipTransmissionColour(p, thicknessM), share = lipScatterShare(p, thicknessM), cos = Math.abs(sunCos);
  return [0, 1, 2].map((i) => (c[i] * (sun[i] * cos + sky[i]) * share) / Math.PI) as Rgb;
}

/** The light straight through the lip (shadeWater's `transmitted`, lip mask 1): the sun from behind it (backCos =
 * dot(−view, sun)) and the skylight through it from beneath and the side. Radiance. */
export function lipThroughLight(p: WaterOpticsParams, thicknessM: number, backCos: number, underside: number, sun: Rgb, sky: Rgb): Rgb {
  const c = lipTransmissionColour(p, thicknessM), back = Math.max(backCos, 0) ** 4, side = Math.max(underside, p.lipSideSkylight);
  return [0, 1, 2].map((i) => (c[i] * (sun[i] * back + sky[i] * p.lipSkyTransmission * side) * p.transmissionIntensity) / Math.PI) as Rgb;
}

/** The deep water's own light lit from straight up (shadeWater's upwelling, no tube): albedo × (sky + sun × sunY) / π. */
export function deepUpwelling(p: WaterOpticsParams, sunY: number, sun: Rgb, sky: Rgb): Rgb {
  const a = waterAlbedo(p);
  return [0, 1, 2].map((i) => (a[i] * (sky[i] + sun[i] * Math.max(sunY, 0)) * p.bodyScale) / Math.PI) as Rgb;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ocean/waterOptics.test.ts --maxWorkers=3`
Expected: PASS (5 new tests).

- [ ] **Step 5: The shader and the uniform**

In `src/ocean/waterShading.ts`:
- `createWaterOpticsUniforms`: add `lipBubbleScatter: uniform(p.lipBubbleScatter),`; `updateWaterOpticsUniforms`: add `u.lipBubbleScatter.value = p.lipBubbleScatter;`.
- Add `abs` to the `three/tsl` import.
- In `shadeWater`, move the `lipColour` declaration above `column`, and replace the `column` line with:

```ts
  // The lip's own light (spec 2026-10-03 lip-and-tube-look §4): a thrown lip is aerated, so sun (through whichever face it
  // lights) and sky entering it scatter back out, coloured by the water crossed. On the lip it replaces the deep water's
  // light: a lip 1.5 m thick is not a window onto deep water (it drew the same flat navy as the face, Andrew 2026-10-03).
  const deep = i.seabed ? i.seabed.radiance.mul(i.seabed.transmittance).add(upwelling.mul(vec3(1.0).sub(i.seabed.transmittance))) : upwelling;
  const glow = i.lip && i.lipThickness
    ? lipColour.mul(sky.sunIlluminance.mul(sv).mul(abs(nDotL)).mul(step(0.0, l.y)).add(sky.skyIrradiance))
      .mul(float(1.0).sub(exp(u.lipBubbleScatter.mul(i.lipThickness).negate()))).div(PI)
    : null;
  const column = glow ? mix(deep, glow, saturate(i.lip)) : deep;
```

(`lipColour` is `exp(−absorption × transmissionThicknessM × lipThickness / LIP_REFERENCE_THICKNESS_M)` when `lipThickness` is set, as today; keep its existing definition, just above this block.)

In `src/dev/DevPanel.ts`, after the `lipSideSkylight` binding (line 502):

```ts
    water.addBinding(m.water, 'lipBubbleScatter', { label: 'lip bubble scatter', min: 0, max: 5, step: 0.01 }).on('change', h.onWater);
```

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run src/ocean src/dev src/breaker/BreakingRibbon.limits.test.ts --maxWorkers=3`
Expected: PASS (devSettings fills a missing `lipBubbleScatter` from the defaults like the other water keys; if a devSettings test lists the water keys explicitly, add `lipBubbleScatter` to it).

- [ ] **Step 7: Commit**

```bash
git add src/ocean/waterOptics.ts src/ocean/waterOptics.test.ts src/ocean/waterShading.ts src/dev/DevPanel.ts
git commit -m "feat(water): the lip glows on every side: its bubbles scatter the sun and sky (lipBubbleScatter)"
```

---

### Task 3: The tube's light, CPU reference

**Files:**
- Create: `src/breaker/tubeLight.test.ts`
- Modify: `src/breaker/lipProfile.ts` (new constants and functions after `buildProfile`)

**Interfaces:**
- Consumes: `Profile`, `buildProfile`, `sampleSegment`, `PROFILE_SEGMENTS`, `OUTER_LIP_SHARE`, `smoothstep` (lipProfile.ts).
- Produces (lipProfile.ts): `TUBE_TIP_SAMPLE: number` (the cap's middle sample, 74), `TUBE_ROOT_SAMPLE: number` (the outer sample at σ = 0, 114), `TUBE_SHADE_SOFT_RAD: number` (4°), `interface TubeLight { sLip: number; sBody: number; o: number; tLip: number }`, `tubeLightAt(p: Vec2, T: Vec2, R: Vec2, a: number): { sLip: number; sBody: number; o: number }`, `tubeLight(profile: Profile, sun: Vec2): TubeLight[]` where `sun = [l·n, l.y]` (the sun's direction in the profile plane, not necessarily unit).

- [ ] **Step 1: Write the failing test**

`src/breaker/tubeLight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PROFILE_SAMPLES, PROFILE_SEGMENTS, type Profile, TUBE_ROOT_SAMPLE, TUBE_TIP_SAMPLE, type Vec2, buildProfile, sampleSegment, tubeLight } from './lipProfile';
import { peakLanding, peakSetup, peakStation } from './peakStation.fixture';
import { TIDES, peakPsi, setWaveHeight } from './reefReport';

/**
 * The tube's light (spec 2026-10-03 lip-and-tube-look §5): seen side-on from a point inside the tube, directions out of
 * the mouth (below the tip) are open, between the tip and the lip's root the lip is in the way, beyond the root the wave's
 * body is.
 */
const n = PROFILE_SEGMENTS;
const WALL_MID = n.front + n.face + Math.floor(n.wall / 2);
const deg = Math.PI / 180;
const sunAt = (a: number): Vec2 => [Math.cos(a), Math.sin(a)];
const angle = (from: Vec2, to: Vec2): number => Math.atan2(to[1] - from[1], to[0] - from[0]);
const inTube = (j: number): boolean => ['face', 'wall'].includes(sampleSegment(j).seg);

describe('the light inside the tube comes out of its mouth, through its lip, or not at all (behind the wave)', () => {
  const fields = Object.fromEntries((Object.keys(TIDES) as (keyof typeof TIDES)[]).map((t) => [t, peakSetup(12, TIDES[t])]));
  for (const tide of Object.keys(TIDES) as (keyof typeof TIDES)[]) {
    for (const ft of [8, 12]) {
      it(`${ft} ft, ${tide} tide`, { timeout: 180_000 }, () => {
        const base = fields[tide];
        const setup = { ...base, wave: { ...base.wave, heightM: setWaveHeight(ft) } };
        const psi = peakPsi(setup.field, setWaveHeight(ft), false);
        if (!Number.isFinite(psi)) return;
        const tl = peakLanding(psi, { setup });
        const at = (tb: number | null): Profile => { const st = peakStation(psi, tb, { setup }); return buildProfile(st.base, st.input, st.lip, st.frameBase); };
        let held: Profile | null = null, tb = tl;
        for (; tb < tl + 3; tb += 0.05) { const p = at(tb); if (p.frame.landing > 0.99 && p.frame.collapse === 0) { held = p; break; } }
        if (held === null || held.frame.weight < 0.5) return;
        const where = `${ft} ft ${tide} held at tb ${tb.toFixed(2)}`;
        const w = held.frame.weight, q = held.points[WALL_MID];
        const aT = angle(q, held.points[TUBE_TIP_SAMPLE]);
        let aR = angle(q, held.points[TUBE_ROOT_SAMPLE]);
        if (aR < aT) aR += 2 * Math.PI;
        const out = tubeLight(held, sunAt(aT - 10 * deg))[WALL_MID];
        expect(out.sLip + out.sBody, `${where}: sun out of the mouth`).toBeLessThanOrEqual(0.05);
        expect(tubeLight(held, sunAt((aT + aR) / 2))[WALL_MID].sLip, `${where}: sun through the lip`).toBeGreaterThanOrEqual(0.95 * w);
        expect(tubeLight(held, sunAt(aR + 10 * deg))[WALL_MID].sBody, `${where}: sun behind the wave`).toBeGreaterThanOrEqual(0.95 * w);
        const lights = tubeLight(held, sunAt(45 * deg));
        expect(lights[WALL_MID].o, `${where}: deep in, little sky`).toBeLessThan(0.3);
        const T = held.points[TUBE_TIP_SAMPLE];
        let nearest = -1, best = Infinity;
        for (let j = n.front; j < n.front + n.face; j++) { const d = Math.hypot(held.points[j][0] - T[0], held.points[j][1] - T[1]); if (d < best) { best = d; nearest = j; } }
        expect(lights[nearest].o, `${where}: more sky near the mouth`).toBeGreaterThan(lights[WALL_MID].o);
        lights.forEach((l, j) => {
          if (!inTube(j)) expect([l.sLip, l.sBody, l.o], `${where}: j ${j} (${sampleSegment(j).seg}) is open`).toEqual([0, 0, 1]);
        });
        // Review focus 1: the sun below the horizon stays finite and in range.
        for (const l of tubeLight(held, sunAt(-20 * deg))) for (const v of [l.sLip, l.sBody, l.o, l.tLip]) expect(Number.isFinite(v)).toBe(true);
        // Open before the throw and once collapsed; no jumps between (1/30 s steps, sun 45° from in front).
        for (const l of tubeLight(at(null), sunAt(45 * deg))) expect([l.sLip, l.sBody, l.o]).toEqual([0, 0, 1]);
        let prev = tubeLight(at(0), sunAt(45 * deg)), end: Profile | null = null;
        for (let t = 1 / 30; t < tb + 10; t += 1 / 30) {
          const p = at(t), cur = tubeLight(p, sunAt(45 * deg));
          cur.forEach((l, j) => {
            for (const v of [l.sLip, l.sBody, l.o]) { expect(Number.isFinite(v), `${where}: finite at tb ${t.toFixed(2)} j ${j}`).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
            const d = Math.max(Math.abs(l.sLip - prev[j].sLip), Math.abs(l.sBody - prev[j].sBody), Math.abs(l.o - prev[j].o));
            expect(d, `${where}: j ${j} jumps at tb ${t.toFixed(2)}`).toBeLessThanOrEqual(0.3);
          });
          prev = cur;
          if (p.frame.collapse >= 1) { end = p; break; }
        }
        expect(end, `${where}: collapses`).not.toBeNull();
        for (const l of tubeLight(end!, sunAt(45 * deg))) expect([l.sLip, l.sBody, l.o]).toEqual([0, 0, 1]);
        expect(PROFILE_SAMPLES).toBe(160);
      });
    }
  }
});
```

The 1/30 s loop starts at tb 0 (the onset), so it covers the young lip (Review Focus 2: the first few % of the throw, tip ≈ root) for finiteness and jumps.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/breaker/tubeLight.test.ts --maxWorkers=3`
Expected: FAIL: `tubeLight` is not exported.

- [ ] **Step 3: Implement**

In `src/breaker/lipProfile.ts`, after `buildProfile`:

```ts
/**
 * The tube's light (spec 2026-10-03 lip-and-tube-look §5). Side-on from a point in the tube (the profile plane: u along
 * the station's n, y up), the tip T is the cap's middle sample and the lip's root R the outer sample over the tube's top
 * (σ 0). Directions below T's (out of the mouth) are open, between T's and R's the lip is in the way (the sun through it
 * tinted by its thickness), beyond R's the wave's body is (the sun through metres of water: none). Andrew, 2026-10-03:
 * the tube's inside drew the same flat navy as the face, lit as if the lip were not there.
 */
export const TUBE_TIP_SAMPLE = PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under + PROFILE_SEGMENTS.cap / 2;
export const TUBE_ROOT_SAMPLE = PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under + PROFILE_SEGMENTS.cap
  + Math.ceil(OUTER_LIP_SHARE * PROFILE_SEGMENTS.outer);
/** The shade's soft edges (rad). */
export const TUBE_SHADE_SOFT_RAD = (4 * Math.PI) / 180;

export interface TubeLight {
  /** The share of the sun reaching the point through the lip [0, 1]. */
  sLip: number;
  /** The share of the sun behind the wave's body [0, 1] (sLip + sBody ≤ 1; the rest is direct). */
  sBody: number;
  /** The share of the sky's half circle seen out of the mouth [0, 1]. */
  o: number;
  /** The lip's mean thickness (m): the colour of light through it. */
  tLip: number;
}

/** One point's shade: the sun at angle `a` (atan2(l.y, l·n)) seen from p, against the tip T and the lip's root R. */
export function tubeLightAt(p: Vec2, T: Vec2, R: Vec2, a: number): { sLip: number; sBody: number; o: number } {
  const aT = Math.atan2(T[1] - p[1], T[0] - p[0]);
  let aR = Math.atan2(R[1] - p[1], R[0] - p[0]);
  if (aR < aT) aR += 2 * Math.PI;
  // Seen from inside the tube the lip spans well under half a turn; more only where the tip has not yet cleared the root
  // (the young lip, tip ≈ root, where the wrap above would flip the whole sky to "through the lip"): no lip there.
  if (aR - aT > Math.PI) aR = aT;
  const e = TUBE_SHADE_SOFT_RAD;
  const pastT = smoothstep(aT - e, aT + e, a), pastR = smoothstep(aR - e, aR + e, a);
  return { sLip: pastT * (1 - pastR), sBody: pastR, o: Math.min(Math.max(aT, 0), Math.PI) / Math.PI };
}

/** Every sample's tube light, the sun `sun` = (l·n, l.y). Only the tube's inside (face, wall) takes it, by the curl's
 * weight: the ceiling (under) is the lip's own underside, lit as the lip. */
export function tubeLight(profile: Profile, sun: Vec2): TubeLight[] {
  const f = profile.frame, T = profile.points[TUBE_TIP_SAMPLE], R = profile.points[TUBE_ROOT_SAMPLE];
  const a = Math.atan2(sun[1], sun[0]), tLip = 0.5 * (f.tTop + f.tipE), w = Math.max(0, Math.min(1, f.weight));
  return profile.points.map((q, j) => {
    const seg = sampleSegment(j).seg;
    if (w <= 0 || !(seg === 'face' || seg === 'wall')) return { sLip: 0, sBody: 0, o: 1, tLip };
    const l = tubeLightAt(q, T, R, a);
    return { sLip: l.sLip * w, sBody: l.sBody * w, o: 1 - (1 - l.o) * w, tLip };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/breaker/tubeLight.test.ts --maxWorkers=3`
Expected: PASS (6 cases; a size/tide that doesn't break at the peak returns early, as in hollowFace.test.ts). If `o < 0.3` fails at the wall's middle, print `aT` (deg) for the failing case: if the tip sits above the wall's middle (the tube opens high) the mouth really does see more sky, and the bound is a ruling to ledger with the measured value, not a code change.

- [ ] **Step 5: Commit**

```bash
git add src/breaker/tubeLight.test.ts src/breaker/lipProfile.ts
git commit -m "feat(barrel): the tube's light, CPU reference: out of the mouth, through the lip, or behind the wave"
```

---

### Task 4: The tube's light on the GPU (a new pass and attribute)

**Files:**
- Modify: `src/breaker/lipProfileNodes.ts` (new `tubeLightAtNode`)
- Modify: `src/breaker/BreakingRibbon.ts` (buffer, uniform, setter, pass, dispatch, compileAsync, geometry attribute, inventory comment)
- Modify: `src/breaker/BreakingRibbon.limits.test.ts` (passes list)
- Modify: `src/breaker/ribbon.selftest.ts` (compare the lights)
- Modify: `src/app/App.ts` (`updateRibbon`: setSun, key)

**Interfaces:**
- Consumes: `TUBE_TIP_SAMPLE`, `TUBE_ROOT_SAMPLE`, `TUBE_SHADE_SOFT_RAD`, `tubeLight(profile, sun)` (Task 3); `readFrameNodes` (lipProfileNodes.ts).
- Produces: `tubeLightAtNode(p: N, T: N, R: N, a: N): { sLip: N; sBody: N; o: N }` (lipProfileNodes.ts); `BreakingRibbon.lights: THREE.StorageBufferAttribute` (per vertex vec4(sLip, o, tLip, sBody)); `BreakingRibbon.setSun(dir: THREE.Vector3): void`; the geometry attribute `'ribbonLight'`.

- [ ] **Step 1: Write the failing limit test**

In `src/breaker/BreakingRibbon.limits.test.ts`, change the passes list to:

```ts
  const passes = ['framePass', 'vertexPass', 'developPass', 'lightPass', 'chopPass', 'normalPass'] as const;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/breaker/BreakingRibbon.limits.test.ts --maxWorkers=3`
Expected: FAIL: `lightPass` is undefined.

- [ ] **Step 3: The node mirror**

In `src/breaker/lipProfileNodes.ts` add `TUBE_SHADE_SOFT_RAD` to the import from `./lipProfile` and `atan` to the `three/tsl` import, then append:

```ts
/** lipProfile.tubeLightAt: one point's shade, the sun at angle `a`, against the tip T and the lip's root R. */
export function tubeLightAtNode(p: N, T: N, R: N, a: N): { sLip: N; sBody: N; o: N } {
  const aT = atan(T.y.sub(p.y), T.x.sub(p.x)).toVar();
  const aR0 = atan(R.y.sub(p.y), R.x.sub(p.x));
  const aRw = select(aR0.lessThan(aT), aR0.add(2 * Math.PI), aR0);
  // lipProfile.tubeLightAt: an arc over half a turn is the young lip's wrap, no lip.
  const aR = select(aRw.sub(aT).greaterThan(Math.PI), aT, aRw).toVar();
  const e = TUBE_SHADE_SOFT_RAD;
  const pastT = smoothstep(aT.sub(e), aT.add(e), a), pastR = smoothstep(aR.sub(e), aR.add(e), a);
  return { sLip: pastT.mul(float(1.0).sub(pastR)), sBody: pastR, o: clamp(aT, 0.0, Math.PI).div(Math.PI) };
}
```

(`atan` with two arguments is three's atan2: `MathNode.ATAN`, parameter length 1–2.)

- [ ] **Step 4: The pass**

In `src/breaker/BreakingRibbon.ts`:

1. Import `TUBE_ROOT_SAMPLE, TUBE_TIP_SAMPLE` from `./lipProfile` (with `PROFILE_SAMPLES, PROFILE_SEGMENTS`) and `tubeLightAtNode` from `./lipProfileNodes`; add `atan` only if used directly (it isn't: the node helper uses it).
2. Inventory comment: add `- light: stations, frames, positions, lights = 4;` after the develop line.
3. Fields, after `details`:

```ts
  /** Per vertex: vec4(sLip, o, tLip, sBody), the tube's light (lipProfile.tubeLight; spec 2026-10-03 lip-and-tube-look §5). */
  readonly lights: THREE.StorageBufferAttribute;
```

   and after `offshoreMs`:

```ts
  /** The sun's direction (world, unit, toward the sun): setSun. */
  private readonly sun = uniform(new THREE.Vector3(0, 1, 0));
  private readonly lightPass: THREE.ComputeNode;
```

4. Constructor: `this.lights = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);` with the other buffers; `this.lightPass = this.buildLightPass();` after `this.developPass = …`; `this.geometry.setAttribute('ribbonLight', this.lights);` after `ribbonDetail`.
5. Setter, after `setOffshore`:

```ts
  /** The sun's direction (world, unit, toward the sun), for the tube's light. */
  setSun(dir: THREE.Vector3): void {
    this.sun.value.copy(dir);
  }
```

6. `compileAsync`: `[this.framePass, this.vertexPass, this.developPass, this.lightPass, this.chopPass, this.normalPass]`.
7. `compute`: `this.lightPass.count = this.stationCount * V;` and the same order in `renderer.compute([...])`; update its doc comment to list the light pass.
8. The pass, after `buildDevelopPass`:

```ts
  /**
   * Each vertex's tube light (lipProfile.tubeLight): from the chop-free positions, the angles from the sample to the tip
   * (TUBE_TIP_SAMPLE) and the lip's root (TUBE_ROOT_SAMPLE) in the station's plane against the sun's; only the tube's
   * inside (face, wall) by the frame's weight, everything else open. Skirts take their edge sample's (open).
   */
  private buildLightPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * FRAME_VEC4S).toReadOnly();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V).toReadOnly();
    const lights = storage(this.lights, 'vec4', MAX_STATIONS * V);
    const FACE0 = PROFILE_SEGMENTS.front, UNDER0 = FACE0 + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall;
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const i: N = idx.div(V).toVar();
      const local: N = idx.sub(i.mul(V)).toVar();
      const j = local.sub(1).clamp(int(0), int(LAST)).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const S = a.xy, n = a.zw;
      const f = readFrameNodes((k) => frames.element(i.mul(FRAME_VEC4S).add(k)));
      /** Profile sample jj's (u along n, y). */
      const UY = (jj: N): N => {
        const p = positions.element(i.mul(V).add(jj).add(1));
        return vec2(dot(p.xz.sub(S), n), p.y);
      };
      const l = tubeLightAtNode(vec2(UY(j)).toVar(), vec2(UY(int(TUBE_TIP_SAMPLE))).toVar(), vec2(UY(int(TUBE_ROOT_SAMPLE))).toVar(), atan(this.sun.y, dot(this.sun.xz, n)));
      const inside = j.greaterThanEqual(int(FACE0)).and(j.lessThan(int(UNDER0)));
      const w = select(inside, clamp(f.weight, 0.0, 1.0), float(0.0));
      lights.element(idx).assign(vec4(l.sLip.mul(w), float(1.0).sub(float(1.0).sub(l.o).mul(w)), float(f.tTop).add(f.tipE).mul(0.5), l.sBody.mul(w)));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }
```

   (Add `atan` and `clamp` to the file's `three/tsl` import if absent.)

- [ ] **Step 5: Run the limit and ribbon tests**

Run: `npx vitest run src/breaker/BreakingRibbon.limits.test.ts src/breaker/BreakingRibbon.test.ts src/breaker/lipProfileNodes.test.ts --maxWorkers=3`
Expected: PASS (the light pass binds 4).

- [ ] **Step 6: The GPU self-test comparison**

In `src/breaker/ribbon.selftest.ts`, in "ribbon: GPU profile matches lipProfile":
- Import `tubeLight` from `./lipProfile`.
- Before the loops: `const SUN = new THREE.Vector3(0.35, 0.6, -0.72).normalize(); ribbon.setSun(SUN); const light = new Worst();`
- After `const gp = …, gf = …, ge = …`, add `gl = await read(renderer, ribbon.lights)` to that line.
- Inside the station loop, after `const { prof, world } = cpuRow(e, t, traced.waves);`: `const lights = tubeLight(prof, [SUN.x * e.nx + SUN.z * e.nz, SUN.y]);`
- Inside the sample loop, after the extras comparison:

```ts
          const cl = lights[j], gk = [gl[k], gl[k + 1], gl[k + 2], gl[k + 3]];
          if (!gk.every(Number.isFinite)) nonFinite++;
          const dl = Math.max(Math.abs(gk[0] - cl.sLip), Math.abs(gk[1] - cl.o), Math.abs(gk[3] - cl.sBody), Math.abs(gk[2] - cl.tLip));
          light.see(dl, `${where} j ${j} GPU (${gk.map((v) => v.toFixed(3)).join(', ')}) CPU (${[cl.sLip, cl.o, cl.tLip, cl.sBody].map((v) => v.toFixed(3)).join(', ')})`);
```

- Add `&& light.value < 2e-2` to `ok`, and `; worst |Δlight| ${light} (< 2e-2)` to `detail`.

- [ ] **Step 7: App**

In `src/app/App.ts` `updateRibbon`, make the key and the call:

```ts
    const sun = this.sky.sunDirection.value;
    const key = `${tracing}|${this.clock.simTime}|${cam.x}|${cam.z}|${sun.x}|${sun.y}|${sun.z}`;
```

and before `this.ribbon.compute(this.renderer);` add `this.ribbon.setSun(sun);`.

- [ ] **Step 8: Run the GPU self-tests and the suite**

Run: `npx vitest run --maxWorkers=3` (expect all green), then the self-test runner with `?selftest=ribbon`.
Expected: all `ribbon:` self-tests pass; "GPU profile matches lipProfile" shows `|Δlight|` < 2e-2 and 0 non-finite.

- [ ] **Step 9: Commit**

```bash
git add src/breaker/lipProfileNodes.ts src/breaker/BreakingRibbon.ts src/breaker/BreakingRibbon.limits.test.ts src/breaker/ribbon.selftest.ts src/app/App.ts
git commit -m "feat(ribbon): the tube's light on the GPU (light pass, ribbonLight), recomputed when the sun moves"
```

---

### Task 5: The tube's light in the shading

**Files:**
- Modify: `src/ocean/waterOptics.ts`, `src/ocean/waterOptics.test.ts` (CPU mirror of the factors)
- Modify: `src/ocean/waterShading.ts` (`WaterSurfaceInputs.tube`, the factors applied)
- Modify: `src/breaker/BreakingRibbon.ts` (`buildMaterial` passes `ribbonLight`)

**Interfaces:**
- Consumes: `lipTransmissionColour` (waterOptics.ts); the `ribbonLight` attribute (Task 4).
- Produces: `tubeLightFactors(p, sLip, sBody, o, tLip): { sun: Rgb; sky: Rgb; glitter: number }` (waterOptics.ts); `WaterSurfaceInputs.tube?: { sunLip: N; sunBody: N; skyOpen: N; lipThickness: N }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/ocean/waterOptics.test.ts` (import `tubeLightFactors`):

```ts
describe("the tube's light factors (spec 2026-10-03 lip-and-tube-look R3.4)", () => {
  const p = DEFAULT_WATER_OPTICS;
  it('fully open: the light is untouched (the sheet and every other surface)', () => {
    expect(tubeLightFactors(p, 0, 0, 1, 1.5)).toEqual({ sun: [1, 1, 1], sky: [1, 1, 1], glitter: 1 });
  });
  it('the sun through the lip takes its colour; behind the wave it is gone; glitter only from the direct sun', () => {
    const c = lipTransmissionColour(p, 1.5);
    const lip = tubeLightFactors(p, 1, 0, 1, 1.5);
    lip.sun.forEach((v, i) => expect(v).toBeCloseTo(c[i], 9));
    expect(lip.glitter).toBe(0);
    expect(tubeLightFactors(p, 0, 1, 1, 1.5).sun).toEqual([0, 0, 0]);
  });
  it('a closed sky comes only through the lip, tinted and dimmed, never brighter than open sky', () => {
    const c = lipTransmissionColour(p, 1.5), closed = tubeLightFactors(p, 0, 0, 0, 1.5).sky;
    closed.forEach((v, i) => { expect(v).toBeCloseTo(c[i] * p.lipSkyTransmission, 9); expect(v).toBeLessThanOrEqual(1); });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ocean/waterOptics.test.ts --maxWorkers=3`
Expected: FAIL: `tubeLightFactors` is not exported.

- [ ] **Step 3: The CPU mirror**

Append to `src/ocean/waterOptics.ts`:

```ts
/** The tube's light (shadeWater's mirror, spec 2026-10-03 lip-and-tube-look R3.4): the sun's factor (direct + through the
 * lip, tinted), the sky's (open + through the lip, tinted and dimmed) and the glitter's (the direct sun only). */
export function tubeLightFactors(p: WaterOpticsParams, sLip: number, sBody: number, o: number, tLip: number): { sun: Rgb; sky: Rgb; glitter: number } {
  const c = lipTransmissionColour(p, tLip), direct = Math.max(0, 1 - sLip - sBody);
  return {
    sun: [0, 1, 2].map((i) => direct + sLip * c[i]) as Rgb,
    sky: [0, 1, 2].map((i) => o + (1 - o) * c[i] * p.lipSkyTransmission) as Rgb,
    glitter: direct,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ocean/waterOptics.test.ts --maxWorkers=3`
Expected: PASS.

- [ ] **Step 5: The shader**

In `src/ocean/waterShading.ts`:

1. `WaterSurfaceInputs`, after `lipThickness`:

```ts
  /** The tube's light (spec 2026-10-03 lip-and-tube-look §5, BreakingRibbon's ribbonLight): the sun's share through the
   * lip and behind the wave's body, the open sky's share, and the lip's thickness. Absent: fully open. */
  tube?: { sunLip: N; sunBody: N; skyOpen: N; lipThickness: N };
```

2. At the top of `shadeWater` (after `fresnel`):

```ts
  // The tube's light (tubeLightFactors' mirror): inside the tube the sun comes direct, through the lip (its colour) or not
  // at all (behind the wave); the sky out of the mouth, or through the lip.
  const tc = i.tube ? exp(u.absorption.mul(u.transmissionThicknessM.mul(i.tube.lipThickness).div(LIP_REFERENCE_THICKNESS_M)).negate()) : null;
  const direct = i.tube ? saturate(float(1.0).sub(i.tube.sunLip).sub(i.tube.sunBody)) : float(1.0);
  const sunTint = i.tube && tc ? vec3(direct).add(tc.mul(i.tube.sunLip)) : vec3(1.0);
  const skyTint = i.tube && tc ? vec3(i.tube.skyOpen).add(tc.mul(u.lipSkyTransmission).mul(float(1.0).sub(i.tube.skyOpen))) : vec3(1.0);
```

3. `seen`: `const seen = (land ? mix(skyReflection, land.radiance, land.cover) : skyReflection).mul(skyTint);`
4. `specular`: append `.mul(direct)` after `.mul(sv)`.
5. `upwelling`: `u.albedo.mul(sky.skyIrradiance.mul(skyTint).add(sky.sunIlluminance.mul(sunIntoBody).mul(sv).mul(sunTint))).div(PI).mul(u.bodyScale)`.
6. `foamSky`: `sky.skyIrradiance.mul(skyTint).mul(u.foamAlbedo).div(PI)`; `foamSun`: append `.mul(sunTint)`.

In `src/breaker/BreakingRibbon.ts` `buildMaterial`, after `vConstructed`:

```ts
    const vLight: N = varying(attribute('ribbonLight', 'vec4'));
```

and in the `shadeWater({...})` inputs add `tube: { sunLip: vLight.x, sunBody: vLight.w, skyOpen: vLight.y, lipThickness: vLight.z },`.

- [ ] **Step 6: Run the suite and the self-tests**

Run: `npx vitest run --maxWorkers=3`, then the self-test runner with `?selftest=` (all).
Expected: vitest all green; self-tests all green except, possibly, the sound timing check in the full run (re-run `?selftest=sound` alone: passes).

- [ ] **Step 7: Commit**

```bash
git add src/ocean/waterOptics.ts src/ocean/waterOptics.test.ts src/ocean/waterShading.ts src/breaker/BreakingRibbon.ts
git commit -m "feat(barrel): the tube is lit only out of its mouth and through its lip"
```

---

### Task 6: Tune the glow against image10, and the pictures

**Files:**
- Modify: `src/ocean/waterOptics.ts` (`lipBubbleScatter` default, from the measurement)
- Create (scratchpad, not the repo): `look/measure.py`, `look/afternoon.b64`

**Interfaces:**
- Consumes: everything above; `tools/captureMoments.mjs`; the moment `scratchpad/hollow-game/close.b64` (seed 2002, 12 ft, 8:15).
- Produces: the tuned `DEFAULT_WATER_OPTICS.lipBubbleScatter`; before/after frames for Andrew.

Scratchpad below = `C:/Users/Andre/AppData/Local/Temp/claude/C--Dev-andrew-dev-personal-projects-liquid-dreaming/2f1b1e6d-5dc1-4f2a-9291-0c8eb7bc831f/scratchpad`.

- [ ] **Step 1: The measuring script**

`<scratchpad>/look/measure.py`:

```python
import sys
from PIL import Image, ImageDraw
# usage: measure.py frame.png "x0,y0,x1,y1" "x0,y0,x1,y1" out.png  (curtain box, face box, in the PNG's own pixels)
def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
im = Image.open(sys.argv[1]).convert('RGB')
boxes = {'curtain': tuple(map(int, sys.argv[2].split(','))), 'face': tuple(map(int, sys.argv[3].split(',')))}
lum = {}
for k, b in boxes.items():
    px = list(im.crop(b).getdata()); n = len(px)
    r, g, bb = [sum(lin(p[i]) for p in px) / n for i in range(3)]
    lum[k] = 0.2126 * r + 0.7152 * g + 0.0722 * bb
    print(k, 'lin rgb %.4f %.4f %.4f' % (r, g, bb), 'luma %.4f' % lum[k], 'G/B %.2f' % (g / max(bb, 1e-9)))
print('curtain/face %.2f (image10: 2.0, target 1.5-2.5)' % (lum['curtain'] / lum['face']))
d = ImageDraw.Draw(im)
for k, b in boxes.items():
    d.rectangle(b, outline=(255, 0, 0), width=3); d.text((b[0], b[1] - 14), k, fill=(255, 0, 0))
im.save(sys.argv[4])
```

Check it on image10: `python <scratchpad>/look/measure.py <scratchpad>/deck/ppt/media/image10.jpeg "520,320,600,380" "720,330,880,390" <scratchpad>/look/m-image10.png` → `curtain/face 2.00`.

- [ ] **Step 2: Capture the 8:15 frames**

With `ld-tube` running on 5185:

```bash
npx electron tools/captureMoments.mjs --base=http://localhost:5185/ --out=<scratchpad>/look/after --times=1468.49,1468.99,1469.49,1470.49 --m=$(cat <scratchpad>/hollow-game/close.b64)
```

Expected: four `after-<t>.png`. The "before" frames are `<scratchpad>/look/now-<t>.png` (main 400c92b, captured 2026-10-03).

- [ ] **Step 3: Place the boxes and measure**

Open `after-1469.49.png` (2379×1257). Place the curtain box on the lip's curtain hanging over the tube (left of the dark mouth; in the before frame the pale curtain spanned about x 1150–1350, y 560–760) and the face box on the unbroken face to the right (about x 1800–2200, y 600–760). Run `measure.py` and read the boxes' overlay picture to confirm each box sits on the right surface (curtain on clear lip water, not foam; face on the unbroken face). Move them if not.

- [ ] **Step 4: Tune `lipBubbleScatter`**

If the ratio is outside 1.5–2.5, recapture 1469.49 only, with the scatter set live:
`--pre="(()=>{const a=window.liquidDreams;a.waterParams.lipBubbleScatter=X;a.waterOptics.lipBubbleScatter.value=X;})()"`
Bisect X in [0.05, 5] until the ratio is in range (aim for 2.0). Set `DEFAULT_WATER_OPTICS.lipBubbleScatter` to it. Re-run `npx vitest run src/ocean/waterOptics.test.ts --maxWorkers=3`: the "never darker than the deep water" test must stay green; if the tuned value breaks it, stop and show Andrew both (the curtain matching image10 vs the glow floor) — that is his call.

- [ ] **Step 5: The afternoon moment**

`afternoon.b64`: the same moment with `conditions.timeOfDay` 16.5 (decode `close.b64`, set it, re-encode). Capture the same four times into `<scratchpad>/look/pm-after`, and the same on `main` (5173, start `liquid-dreams` if not running) into `<scratchpad>/look/pm-before`.

- [ ] **Step 6: Check the time-of-day change while paused (Review Focus 4)**

Load the 8:15 moment paused on 5185, change the time of day in the dev panel to 16.5 without unpausing, and capture (`captureFrame` via the console, or the capture tool with `--pre` setting the time): the tube's inside must change with the sun (the ribbon recomputed).

- [ ] **Step 7: Commit, push, and show Andrew**

```bash
git add src/ocean/waterOptics.ts
git commit -m "tune(water): lipBubbleScatter from image10 (curtain/face <ratio>)"
git push
```

Make a side-by-side page (before | after, 8:15 and 16:30, with image10 alongside) and send it to Andrew. Then the final branch review (executing-plans' Final Review), and wait for his word before any merge.
