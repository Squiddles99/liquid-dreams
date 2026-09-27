# Underwater View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the camera is below the water surface, show the surface from below (Snell's window), the reef and seabed, and water that fades to its own colour with distance, instead of the sky dome's black lower half.

**Architecture:** A CPU reference (`underwaterOptics.ts`) and its TSL mirror (`underwaterNodes.ts`) hold the optics. The ocean sheet gets a second material for the view from below; App swaps it in while the eye is under the surface, so the above-water material is never touched. A water-volume dome replaces the sky dome underwater and ray-marches the seabed with the existing march. The seabed's lighting is extracted into a shared node, so the reef is lit the same from above and below.

**Tech Stack:** TypeScript 7.0.2 (strict), Vite 8.3.1, Vitest 5.0.2, three 0.186.1 (`three/webgpu`, `three/tsl`).

**Spec:** `docs/superpowers/specs/2026-09-27-underwater-view-design.md`

## Global Constraints

- `reference/` holds private photos and is never committed. Stage files by path; never commit `.superpowers/`.
- Stay within the WebGPU baseline: at most 8 storage buffers per shader stage, and no `requiredLimits` changes.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Above water, rendering and GPU cost are unchanged: the sheet's above-water material, the sky dome and the ribbon are exactly today's whenever the eye is above the surface.
- Water index of refraction: `WATER_IOR = 1.333` (`src/seabed/waterColumn.ts`). The critical angle is asin(1/1.333) = 48.6°.
- The underwater switch has hysteresis: under while `camera.y < water − 0.05 m`, above again when `camera.y > water + 0.05 m`.
- Match the surrounding code: comment density, naming, CRLF line endings where the file has them.

## Plan rulings (spec gaps found while planning)

- **Ruling: underwater, the sheet ignores the ribbon's footprint and the ribbon is hidden.** Spec §3.5 fogs the ribbon. But the ribbon is drawn single-sided (`FrontSide`), so from below it is mostly culled. Meanwhile the sheet discards its fragments under the ribbon's footprint, so from below the surface would show a hole. The below-water sheet material therefore has no footprint mask, and App hides the ribbon while underwater. **Cost if wrong:** the barrel isn't seen from below until a proper underside look is built (already out of scope).
- **Ruling: a second sheet material instead of a shader branch.** The spec says a uniform branch. A separate material swapped in by App guarantees the above-water shader is byte-identical, and TSL's "a temp first used inside one `If` is stale in the next" pitfall never arises. **Cost if wrong:** one extra pipeline compile the first time the camera goes under.
- **Ruling: water depth for the fading colour is `max(tide − y, 0)`.** The shader has the tide uniform (`seabed.tide`), not the wave-displaced surface height. **Cost if wrong:** under a crest, the water is lit as if a metre or two shallower (small).

## Review Focus

1. A camera riding the surface (the lineup camera floats at eye height) must not flicker between above and below as waves pass. Pinned by `nextUnderwater` hysteresis tests (Task 1).
2. Looking up near the window's rim (the critical angle), the Fresnel term must not go NaN (sqrt of a negative) and must reach exactly 1. Pinned by the Task 1 CPU tests and the Task 2 GPU sweep across the rim.
3. The sun seen through the window must stay finite (the sky dome's 30000 clamp). Pinned in the Task 2 self-test by a direction straight at the refracted sun.
4. The free camera flown into the reef (below the seabed) or far out over deep water (no bed within the march's reach) must show finite water colour, not NaN or black. Pinned by the Task 4 volume self-test cases.
5. Repeatedly crossing the surface must reuse the two built materials and not rebuild them. Pinned by the Task 5 test that `setUnderwater` swaps between two fixed instances.

---

### Task 1: The optics, CPU reference

**Files:**
- Create: `src/ocean/underwaterOptics.ts`
- Test: `src/ocean/underwaterOptics.test.ts`

**Interfaces:**
- Produces:
  - `CRITICAL_ANGLE_RAD: number`
  - `UNDERWATER_BAND_M = 0.05`
  - `refractOut(v: Vec3, nDown: Vec3): Vec3 | null`: the ray leaving the water into the air, for `v` (unit, from the surface point toward the camera, which is below) and `nDown` (unit surface normal pointing down, into the water); null beyond the critical angle.
  - `fresnelFromInside(cosI: number): number`: unpolarised dielectric reflectance for a ray in water meeting the surface at incidence cosine `cosI`; 1 at and beyond the critical angle.
  - `waterColourAtDepth(upwelling: Rgb, ext: Rgb, depthM: number): Rgb`: `upwelling × exp(−ext·depth)`.
  - `alongPath(end: Rgb, inf: Rgb, ext: Rgb, s: number): Rgb`: `end·T + inf·(1 − T)`, T = exp(−ext·s).
  - `nextUnderwater(prev: boolean, cameraY: number, waterY: number): boolean`: the hysteresis switch.
  - `type Vec3 = [number, number, number]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { WATER_IOR } from '../seabed/waterColumn';
import { CRITICAL_ANGLE_RAD, UNDERWATER_BAND_M, alongPath, fresnelFromInside, nextUnderwater, refractOut, waterColourAtDepth } from './underwaterOptics';

const deg = (d: number): number => (d * Math.PI) / 180;
const DOWN: [number, number, number] = [0, -1, 0];

describe('underwater optics', () => {
  it('the critical angle is asin(1 / 1.333) = 48.6°', () => {
    expect(CRITICAL_ANGLE_RAD).toBeCloseTo(Math.asin(1 / WATER_IOR), 12);
    expect((CRITICAL_ANGLE_RAD * 180) / Math.PI).toBeCloseTo(48.6, 1);
  });
  it('a ray 30° from straight up in the water leaves at 41.8° in the air (Snell), and none leaves beyond the critical angle', () => {
    // v points from the surface point down toward the camera: 30° off the downward normal.
    const v: [number, number, number] = [Math.sin(deg(30)), -Math.cos(deg(30)), 0];
    const t = refractOut(v, DOWN)!;
    expect(t).not.toBeNull();
    expect(Math.hypot(...t)).toBeCloseTo(1, 9);
    expect(t[1]).toBeGreaterThan(0);
    expect((Math.acos(t[1]) * 180) / Math.PI).toBeCloseTo((Math.asin(WATER_IOR * Math.sin(deg(30))) * 180) / Math.PI, 6);
    expect((Math.acos(t[1]) * 180) / Math.PI).toBeCloseTo(41.8, 1);
    // It bends away from the normal, to the side opposite the camera.
    expect(t[0]).toBeLessThan(0);
    const beyond: [number, number, number] = [Math.sin(deg(50)), -Math.cos(deg(50)), 0];
    expect(refractOut(beyond, DOWN)).toBeNull();
  });
  it('Fresnel from inside: 0.02 straight up, rising monotonically to exactly 1 at the critical angle, 1 beyond, never NaN', () => {
    expect(fresnelFromInside(1)).toBeCloseTo(((WATER_IOR - 1) / (WATER_IOR + 1)) ** 2, 9);
    expect(fresnelFromInside(1)).toBeCloseTo(0.0204, 3);
    let prev = 0;
    for (let a = 0; a < CRITICAL_ANGLE_RAD; a += deg(0.25)) {
      const r = fresnelFromInside(Math.cos(a));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
    expect(fresnelFromInside(Math.cos(CRITICAL_ANGLE_RAD))).toBeCloseTo(1, 6);
    expect(fresnelFromInside(Math.cos(CRITICAL_ANGLE_RAD - 1e-9))).toBeCloseTo(1, 3);
    for (const a of [50, 60, 89.9]) expect(fresnelFromInside(Math.cos(deg(a)))).toBe(1);
  });
  it('the water dims with depth, and a path blends from what is at its end to the water colour', () => {
    const up: [number, number, number] = [0.001, 0.01, 0.02], ext: [number, number, number] = [0.45, 0.07, 0.02];
    expect(waterColourAtDepth(up, ext, 0)).toEqual(up);
    const at10 = waterColourAtDepth(up, ext, 10);
    for (let i = 0; i < 3; i++) expect(at10[i]).toBeCloseTo(up[i] * Math.exp(-ext[i] * 10), 12);
    const end: [number, number, number] = [1, 2, 3];
    expect(alongPath(end, up, ext, 0)).toEqual(end);
    const far = alongPath(end, up, ext, 5000);
    for (let i = 0; i < 3; i++) expect(far[i]).toBeCloseTo(up[i], 9);
  });
  it('the underwater switch has a ±5 cm band, so a camera riding the surface does not flicker', () => {
    expect(UNDERWATER_BAND_M).toBe(0.05);
    expect(nextUnderwater(false, 0.0, 0.0)).toBe(false);
    expect(nextUnderwater(false, -0.04, 0.0)).toBe(false);
    expect(nextUnderwater(false, -0.06, 0.0)).toBe(true);
    expect(nextUnderwater(true, 0.04, 0.0)).toBe(true);
    expect(nextUnderwater(true, 0.06, 0.0)).toBe(false);
    // Riding a 1 m chop at the waterline: the state changes only when the band is crossed.
    let s = false, flips = 0;
    for (let i = 0; i < 1000; i++) { const n = nextUnderwater(s, 0.03 * Math.sin(i * 0.37), 0); if (n !== s) flips++; s = n; }
    expect(flips).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ocean/underwaterOptics.test.ts`
Expected: FAIL (module `./underwaterOptics` not found).

- [ ] **Step 3: Write the implementation**

```ts
import type { Rgb } from '../sky/atmosphereParams';
import { WATER_IOR } from '../seabed/waterColumn';

export type Vec3 = [number, number, number];

/** Beyond this angle from the surface normal, a ray in the water reflects completely (asin(1 / n_w) = 48.6°). */
export const CRITICAL_ANGLE_RAD = Math.asin(1 / WATER_IOR);
/** The eye is underwater below the water height minus this, and above again above it plus this (no flicker). */
export const UNDERWATER_BAND_M = 0.05;

/**
 * The ray leaving the water into the air (unit), for v (unit, from the surface point toward the camera below it) and
 * nDown (unit normal pointing down, into the water): GLSL refract(−v, nDown, n_w). Null beyond the critical angle.
 */
export function refractOut(v: Vec3, nDown: Vec3): Vec3 | null {
  const i: Vec3 = [-v[0], -v[1], -v[2]];
  const cosI = -(i[0] * nDown[0] + i[1] * nDown[1] + i[2] * nDown[2]);
  const eta = WATER_IOR;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  const a = eta * cosI - Math.sqrt(k);
  return [eta * i[0] + a * nDown[0], eta * i[1] + a * nDown[1], eta * i[2] + a * nDown[2]];
}

/**
 * Unpolarised reflectance of the water's surface seen from inside, at incidence cosine cosI: the exact dielectric
 * Fresnel (Schlick is wrong near the critical angle, where Snell's window has its rim). 1 at and beyond the critical angle.
 */
export function fresnelFromInside(cosI: number): number {
  const n1 = WATER_IOR, n2 = 1;
  const c = Math.min(1, Math.max(0, cosI));
  const sinT2 = (n1 / n2) ** 2 * (1 - c * c);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const rs = ((n1 * c - n2 * cosT) / (n1 * c + n2 * cosT)) ** 2;
  const rp = ((n1 * cosT - n2 * c) / (n1 * cosT + n2 * c)) ** 2;
  return (rs + rp) / 2;
}

/** The water's own colour at depth d: the deep-water upwelling the surface shows from above, dimmed by exp(−ext·d). */
export function waterColourAtDepth(upwelling: Rgb, ext: Rgb, depthM: number): Rgb {
  return [0, 1, 2].map((i) => upwelling[i] * Math.exp(-ext[i] * depthM)) as Rgb;
}

/** Along a path of length s through the water: what is at its end, fading into the water's colour. */
export function alongPath(end: Rgb, inf: Rgb, ext: Rgb, s: number): Rgb {
  return [0, 1, 2].map((i) => { const T = Math.exp(-ext[i] * s); return end[i] * T + inf[i] * (1 - T); }) as Rgb;
}

/** Whether the eye is underwater, with a ±UNDERWATER_BAND_M band around the water height so riding the surface can't flicker. */
export function nextUnderwater(prev: boolean, cameraY: number, waterY: number): boolean {
  if (prev) return cameraY < waterY + UNDERWATER_BAND_M;
  return cameraY < waterY - UNDERWATER_BAND_M;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ocean/underwaterOptics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ocean/underwaterOptics.ts src/ocean/underwaterOptics.test.ts
git commit -m "feat(underwater): the optics (Snell's window, Fresnel from inside, water colour, hysteresis), CPU reference"
```
(End the message with the Co-Authored-By line.)

---

### Task 2: The optics, TSL mirror and GPU self-test

**Files:**
- Create: `src/ocean/underwaterNodes.ts`
- Create: `src/ocean/underwater.selftest.ts`
- Modify: `src/dev/selfTests.ts` (register the new self-test)
- Modify: `src/ocean/waterShading.ts` (export `deepWaterUpwelling`)

**Interfaces:**
- Consumes: Task 1's CPU functions (as the reference in the self-test); `WaterOpticsUniforms` (`u.albedo`, `u.bodyScale`, `u.extinction`) and `Sky` (`sunDirection`, `sunIlluminance`, `skyIrradiance`, `radiance(dir)`).
- Produces:
  - `deepWaterUpwelling(sky: Sky, u: WaterOpticsUniforms): N` in `waterShading.ts`: `u.albedo × (skyIrradiance + sunIlluminance × max(sun.y, 0)) / π × bodyScale`, the same expression `shadeWater` uses when no `bodyLightNormal` is given.
  - In `underwaterNodes.ts`:
    - `fresnelFromInsideNode(cosI: N): N`
    - `waterColourAtDepthNode(upwelling: N, ext: N, depth: N): N`
    - `alongPathNode(end: N, inf: N, ext: N, s: N): N`
    - `cameraDepthNode(tide: N): N`, which is `max(tide − cameraPosition.y, 0)`
    - `sunThroughWindowNode(t: N, sky: Sky): N`, the sun disk seen along the transmitted ray `t`, clamped to 30000 as the sky dome clamps it.

- [ ] **Step 1: Add `deepWaterUpwelling` to `waterShading.ts`** (a new export beside `schlickWater`; `shadeWater` stays unchanged):

```ts
/** The deep water's own light, as the surface shows it from above with its body lit from straight up (shadeWater's upwelling). */
export function deepWaterUpwelling(sky: Sky, u: WaterOpticsUniforms): N {
  return u.albedo.mul(sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0)))).div(PI).mul(u.bodyScale);
}
```

- [ ] **Step 2: Write `underwaterNodes.ts`**

```ts
import { PI, acos, cameraPosition, clamp, dot, exp, float, max, min, select, sqrt, smoothstep, vec3 } from 'three/tsl';
import { WATER_IOR } from '../seabed/waterColumn';
import { SUN_ANGULAR_RADIUS_RAD, type Sky } from '../sky/Sky';

type N = any;

/** underwaterOptics.fresnelFromInside: exact dielectric Fresnel leaving the water; 1 at and beyond the critical angle. */
export function fresnelFromInsideNode(cosI: N): N {
  const c = clamp(cosI, 0.0, 1.0);
  const sinT2 = float(WATER_IOR * WATER_IOR).mul(float(1.0).sub(c.mul(c)));
  // max(…, 0) keeps sqrt finite beyond the critical angle, where the select returns 1 anyway.
  const cosT = sqrt(max(float(1.0).sub(sinT2), 0.0));
  const n1c = c.mul(WATER_IOR), n1t = cosT.mul(WATER_IOR);
  const rs = n1c.sub(cosT).div(max(n1c.add(cosT), 1e-6));
  const rp = n1t.sub(c).div(max(n1t.add(c), 1e-6));
  return select(sinT2.greaterThanEqual(1.0), float(1.0), rs.mul(rs).add(rp.mul(rp)).mul(0.5));
}

/** underwaterOptics.waterColourAtDepth. */
export function waterColourAtDepthNode(upwelling: N, ext: N, depth: N): N {
  return upwelling.mul(exp(ext.mul(depth).negate()));
}

/** underwaterOptics.alongPath. */
export function alongPathNode(end: N, inf: N, ext: N, s: N): N {
  const T = exp(ext.mul(s).negate());
  return end.mul(T).add(inf.mul(vec3(1.0).sub(T)));
}

/** The eye's depth below the still-water level (m, 0 above it). */
export function cameraDepthNode(tide: N): N {
  return max(tide.sub(cameraPosition.y), 0.0);
}

/** The sun's disk along the transmitted ray t (as the sky dome draws it, clamped to 30000). */
export function sunThroughWindowNode(t: N, sky: Sky): N {
  const angle = acos(clamp(dot(t, sky.sunDirection), -1.0, 1.0));
  const r = float(SUN_ANGULAR_RADIUS_RAD);
  const disk = float(1.0).sub(smoothstep(r.mul(0.92), r.mul(1.08), angle));
  return min(sky.sunIlluminance.div(PI.mul(r).mul(r)), vec3(30000.0)).mul(disk);
}
```

- [ ] **Step 3: Write the GPU self-test `underwater.selftest.ts`.** It compares Fresnel, colour at depth and the path blend with the CPU over a sweep that crosses the window's rim, and checks the sun through the window is finite.

```ts
import * as THREE from 'three/webgpu';
import { Fn, float, instanceIndex, storage, vec3, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { CRITICAL_ANGLE_RAD, alongPath, fresnelFromInside, waterColourAtDepth } from './underwaterOptics';
import { alongPathNode, fresnelFromInsideNode, waterColourAtDepthNode } from './underwaterNodes';

registerSelfTest({
  name: 'underwater: GPU Fresnel from inside, water colour and path blend match the CPU (sweep across the window rim)',
  async run(renderer) {
    // Incidence angles from straight up to beyond the rim, densest around it.
    const angles: number[] = [];
    for (let a = 0; a <= 80; a += 2) angles.push((a * Math.PI) / 180);
    for (let k = -8; k <= 8; k++) angles.push(CRITICAL_ANGLE_RAD + k * 1e-3);
    const n = angles.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(angles.flatMap((a, i) => [Math.cos(a), i * 0.7, i * 3.1, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 3 * 4), 4);
    const input = storage(inAttr, 'vec4', n).toReadOnly();
    const output = storage(outAttr, 'vec4', n * 3);
    const up = vec3(0.001, 0.01, 0.02), ext = vec3(0.45, 0.07, 0.02), end = vec3(1.0, 2.0, 3.0);
    const pass = Fn(() => {
      const p = input.element(instanceIndex);
      output.element(instanceIndex.mul(3)).assign(vec4(fresnelFromInsideNode(p.x), 0.0, 0.0, 0.0));
      output.element(instanceIndex.mul(3).add(1)).assign(vec4(waterColourAtDepthNode(up, ext, p.y), 0.0));
      output.element(instanceIndex.mul(3).add(2)).assign(vec4(alongPathNode(end, up, ext, p.z), 0.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worstR = 0, worstC = 0, finite = true;
    angles.forEach((a, i) => {
      const g = out.slice(i * 12, i * 12 + 12);
      if (!g.every(Number.isFinite)) finite = false;
      worstR = Math.max(worstR, Math.abs(g[0] - fresnelFromInside(Math.cos(a))));
      const c = waterColourAtDepth([0.001, 0.01, 0.02], [0.45, 0.07, 0.02], i * 0.7);
      const pth = alongPath([1, 2, 3], [0.001, 0.01, 0.02], [0.45, 0.07, 0.02], i * 3.1);
      for (let k = 0; k < 3; k++) worstC = Math.max(worstC, Math.abs(g[4 + k] - c[k]) / Math.max(c[k], 1e-6), Math.abs(g[8 + k] - pth[k]));
    });
    return { pass: finite && worstR < 2e-3 && worstC < 2e-3, detail: `${n} angles (0–80°, ±8 mrad about the rim); all finite ${finite}; worst |ΔR| ${worstR.toExponential(2)}; worst colour/path error ${worstC.toExponential(2)}` };
  },
});
```

Near the rim, f32 against f64 can differ by up to ~1e-3 in R, which is why the bound is 2e-3.

- [ ] **Step 4: Register it.** In `src/dev/selfTests.ts`, add `import '../ocean/underwater.selftest';` after `import '../ocean/probe.selftest';`.

- [ ] **Step 5: Type-check, run the unit tests and the GPU self-tests**

Run: `npx tsc --noEmit -p .` (expected: no output), then `npx vitest run` (expected: all pass). Then open `http://localhost:5173/?selftest` in the browser pane. Expected: `GPU self-tests: 31/31 passed`, including `underwater: GPU Fresnel…`.

- [ ] **Step 6: Commit**

```bash
git add src/ocean/underwaterNodes.ts src/ocean/underwater.selftest.ts src/dev/selfTests.ts src/ocean/waterShading.ts
git commit -m "feat(underwater): TSL mirror of the optics, GPU self-test across the window rim"
```

---

### Task 3: The seabed's lighting as a shared node

**Files:**
- Modify: `src/seabed/seabedShading.ts`

**Interfaces:**
- Produces: `seabedRadianceNode(hitPos: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N`, the lit seabed radiance at a world hit point (bed normal from four height fetches, material albedo with detail noise, sun through the surface dimmed along the water column, skylight dimmed with depth). `seabedTerms` calls it and its output is unchanged.

- [ ] **Step 1: Extract the lighting.** Move the body of the `If(march.y.greaterThan(0.5).and(fade.greaterThan(0.0)), …)` block that starts at `const e = 0.5;` and ends at `out.assign(albedo.mul(eSun.add(eSky)).div(PI));` into:

```ts
/**
 * The lit seabed at a world point: its normal (four height fetches), its material, and the sun and sky reaching it through
 * the water above. Shared by the look-through from above (seabedTerms) and the underwater view (WaterVolume).
 */
export function seabedRadianceNode(hitPos: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  const e = 0.5;
  const hx = seabed.bedHeightNode(hitPos.xz.add(vec2(e, 0.0))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(e, 0.0))));
  const hz = seabed.bedHeightNode(hitPos.xz.add(vec2(0.0, e))).sub(seabed.bedHeightNode(hitPos.xz.sub(vec2(0.0, e))));
  const nBed = normalize(vec3(hx.negate().div(2 * e), 1.0, hz.negate().div(2 * e)));
  const mat = seabed.materialNode(hitPos.xz);
  const detail = mx_noise_float(vec3(hitPos.x.mul(1.7), hitPos.z.mul(1.7), 0.0)).mul(0.5).add(0.5);
  const albedo = mix(mix(REEF_ALBEDO, WEED_ALBEDO, mat.y), SAND_ALBEDO, mat.x).mul(detail.mul(0.4).add(0.8));
  const l = sky.sunDirection;
  const lw = normalize(refract(l.negate(), vec3(0.0, 1.0, 0.0), float(1 / WATER_IOR)));
  const cosW = max(lw.y.negate(), 0.2);
  const depthHit = max(seabed.tide.sub(hitPos.y), 0.0);
  const sunIn = sky.sunIlluminance.mul(float(1.0).sub(schlickWater(max(l.y, 0.0)))).mul(step(0.0, l.y));
  const eSun = sunIn.mul(exp(u.extinction.mul(depthHit.div(cosW)).negate())).mul(max(dot(nBed, lw.negate()), 0.0));
  const eSky = sky.skyIrradiance.mul(exp(u.extinction.mul(depthHit.mul(1.2)).negate()));
  return albedo.mul(eSun.add(eSky)).div(PI);
}
```

In `seabedTerms`, the branch becomes:

```ts
    If(march.y.greaterThan(0.5).and(fade.greaterThan(0.0)), () => {
      out.assign(seabedRadianceNode(i.surfacePos.add(t.mul(march.x)), seabed, sky, u));
    });
```

- [ ] **Step 2: Verify nothing changed.** Run `npx tsc --noEmit -p .` and `npx vitest run` (expected: all pass). Run the GPU self-tests (expected: 31/31, including both `seabed` self-tests). Capture `the-drain` moment before and after this change at the same viewport (1600×1000) and compare. Expected: identical images. If they differ, the extraction changed evaluation order; fix it until they match.

- [ ] **Step 3: Commit**

```bash
git add src/seabed/seabedShading.ts
git commit -m "refactor(seabed): the seabed's lighting as a shared node (the view from above is unchanged)"
```

---

### Task 4: The water volume dome

**Files:**
- Create: `src/ocean/WaterVolume.ts`
- Modify: `src/ocean/underwater.selftest.ts` (add the volume test)

**Interfaces:**
- Consumes: `marchSeabedNode(p, d, seabed)` and `seabedRadianceNode` (Task 3), both from `src/seabed/seabedShading.ts`; `REACH_FADE_DEPTH_M`, `MAX_MARCH_DEPTH_M`, `REACH_FADE_DIST_M`, `MAX_MARCH_DIST_M` (`waterColumn.ts`); `deepWaterUpwelling` (Task 2); `waterColourAtDepthNode`, `alongPathNode`, `cameraDepthNode` (Task 2).
- Produces:
  - `class WaterVolume { readonly mesh: THREE.Mesh; constructor(seabed: Seabed, sky: Sky, u: WaterOpticsUniforms); followCamera(p: THREE.Vector3): void }`: the mesh starts hidden.
  - `waterVolumeColourNode(origin: N, dir: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N`, exported for the self-test.

- [ ] **Step 1: Write `WaterVolume.ts`**

```ts
import * as THREE from 'three/webgpu';
import { Fn, If, cameraPosition, exp, float, normalize, positionWorld, smoothstep, vec3 } from 'three/tsl';
import type { Seabed } from '../seabed/Seabed';
import { marchSeabedNode, seabedRadianceNode } from '../seabed/seabedShading';
import { MAX_MARCH_DEPTH_M, MAX_MARCH_DIST_M, REACH_FADE_DEPTH_M, REACH_FADE_DIST_M } from '../seabed/waterColumn';
import type { Sky } from '../sky/Sky';
import { alongPathNode, cameraDepthNode, waterColourAtDepthNode } from './underwaterNodes';
import { type WaterOpticsUniforms, deepWaterUpwelling } from './waterShading';

type N = any;

/**
 * What an underwater eye at `origin` sees along `dir` where nothing is drawn: the seabed where the march reaches it,
 * through the water, else the water's own colour at the eye's depth. The march's reach fade takes the bed into the water
 * colour before its cutoffs, as the look-through from above does.
 */
export function waterVolumeColourNode(origin: N, dir: N, seabed: Seabed, sky: Sky, u: WaterOpticsUniforms): N {
  return Fn(() => {
    const inf = waterColourAtDepthNode(deepWaterUpwelling(sky, u), u.extinction, cameraDepthNode(seabed.tide)).toVar();
    const out = inf.toVar();
    If(dir.y.lessThan(0.0), () => {
      const march = marchSeabedNode(origin, dir, seabed);
      const aboveBed = origin.y.sub(seabed.bedHeightNode(origin.xz));
      const fade = float(1.0).sub(smoothstep(REACH_FADE_DEPTH_M, MAX_MARCH_DEPTH_M, aboveBed))
        .mul(float(1.0).sub(smoothstep(REACH_FADE_DIST_M, MAX_MARCH_DIST_M, march.x)));
      If(march.y.greaterThan(0.5).and(fade.greaterThan(0.0)), () => {
        const bed = seabedRadianceNode(origin.add(dir.mul(march.x)), seabed, sky, u);
        // The bed through the path, then the reach fade toward the water colour.
        const seen = alongPathNode(bed, inf, u.extinction, march.x);
        out.assign(inf.add(seen.sub(inf).mul(fade)));
      });
    });
    return out;
  })();
}

/** The water around an underwater eye: drawn first, in place of the sky dome, wherever the sheet doesn't cover. */
export class WaterVolume {
  readonly mesh: THREE.Mesh;

  constructor(seabed: Seabed, sky: Sky, u: WaterOpticsUniforms) {
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const dir = normalize(positionWorld.sub(cameraPosition));
    material.colorNode = waterVolumeColourNode(cameraPosition, dir, seabed, sky, u);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
    this.mesh.scale.setScalar(1000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.visible = false;
  }

  followCamera(p: THREE.Vector3): void {
    this.mesh.position.copy(p);
  }
}
```

(The 1000 m radius is inside the camera's 60 km far plane and outside everything the march reaches, 80 m.)

- [ ] **Step 2: Add the volume self-test** (append the `registerSelfTest` call to `underwater.selftest.ts`, and merge its imports into the file's existing import block at the top). It evaluates `waterVolumeColourNode` in a compute pass on the real seabed, for:
  - an eye 3 m under the peak looking down, along and up;
  - an eye inside the reef (below the bed);
  - an eye far out over deep water (`[0, -3, -900]`).

It checks every result is finite and positive, and that looking down at the reef differs from the water colour (the bed shows).

```ts
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry } from '../seabed/bathymetry';
import { Seabed } from '../seabed/Seabed';
import { Sky } from '../sky/Sky';
import { createWaterOpticsUniforms } from './waterShading';
import { DEFAULT_WATER_OPTICS } from './waterOptics';
import { waterVolumeColourNode } from './WaterVolume';
import { sunForConditions } from '../astro/sun';

registerSelfTest({
  name: 'underwater: the water volume is finite everywhere and shows the reef below a diver',
  async run(renderer) {
    const sky = new Sky();
    const sun = sunForConditions(DEFAULT_CONDITIONS);
    sky.update(renderer, new THREE.Vector3(...sun.direction), 1);
    const seabed = new Seabed(buildBathymetry());
    const u = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    const cases: { o: [number, number, number]; d: [number, number, number]; tag: string }[] = [
      { o: [0, -3, 0], d: [0, -1, 0], tag: 'down at the reef' },
      { o: [0, -3, 0], d: [0.7071, -0.7071, 0], tag: '45° down' },
      { o: [0, -3, 0], d: [1, 0, 0], tag: 'along' },
      { o: [0, -3, 0], d: [0, 1, 0], tag: 'up' },
      { o: [0, -40, 0], d: [0, -1, 0], tag: 'inside the reef' },
      { o: [0, -3, -900], d: [0, -1, 0], tag: 'deep water' },
    ];
    const n = cases.length;
    const inAttr = new THREE.StorageBufferAttribute(new Float32Array(cases.flatMap((c) => [...c.o, 0, ...c.d, 0])), 4);
    const outAttr = new THREE.StorageBufferAttribute(new Float32Array(n * 4), 4);
    const input = storage(inAttr, 'vec4', n * 2).toReadOnly();
    const output = storage(outAttr, 'vec4', n);
    const pass = Fn(() => {
      const o = input.element(instanceIndex.mul(2)).xyz, d = input.element(instanceIndex.mul(2).add(1)).xyz;
      output.element(instanceIndex).assign(vec4(waterVolumeColourNode(o, d, seabed, sky, u), 1.0));
    })().compute(n) as THREE.ComputeNode;
    renderer.compute(pass);
    const out = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const rows = cases.map((c, i) => ({ tag: c.tag, rgb: [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]] }));
    const finite = rows.every((r) => r.rgb.every((v) => Number.isFinite(v) && v >= 0));
    const differs = rows[0].rgb.some((v, k) => Math.abs(v - rows[3].rgb[k]) > 1e-4 * Math.max(rows[3].rgb[k], 1e-3));
    return { pass: finite && differs, detail: rows.map((r) => `${r.tag} ${r.rgb.map((v) => v.toExponential(2)).join(',')}`).join('; ') };
  },
});
```

The compute pass here has no camera. `cameraDepthNode` reads `cameraPosition`, which in a compute pass is the renderer's last camera or the origin, so the water colour is whatever depth that gives. The test checks finiteness and that the bed shows, not absolute colour, so this doesn't matter. Before writing the test, check the actual export names of `sunForConditions` and `buildBathymetry`: `grep -rn "export function sunForConditions\|export function buildBathymetry" src`, and use the paths it prints.

- [ ] **Step 3: Type-check, run the unit tests and the GPU self-tests**

Run: `npx tsc --noEmit -p .`, `npx vitest run`, then `?selftest`. Expected: 32/32 passed.

- [ ] **Step 4: Commit**

```bash
git add src/ocean/WaterVolume.ts src/ocean/underwater.selftest.ts
git commit -m "feat(underwater): the water volume (seabed through the water, else the water's colour)"
```

---

### Task 5: The surface from below

**Files:**
- Modify: `src/ocean/waterShading.ts` (add `shadeWaterFromBelow`)
- Modify: `src/ocean/OceanSurface.ts` (second material, `setUnderwater`)
- Test: `src/ocean/OceanSurface.test.ts` (create; the swap test)

**Interfaces:**
- Consumes: `fresnelFromInsideNode`, `alongPathNode`, `waterColourAtDepthNode`, `cameraDepthNode`, `sunThroughWindowNode` (Task 2); `deepWaterUpwelling` (Task 2); `WATER_IOR`.
- Produces:
  - `shadeWaterFromBelow(i: { normal: N; viewDir: N; distance: N; foam: N; surfaceY: N; tide: N }, sky: Sky, u: WaterOpticsUniforms): N`.
  - `OceanSurface.setUnderwater(on: boolean): void`, which sets `mesh.material` to one of two materials built once in the constructor.
  - `OceanSurface.aboveMaterial` and `OceanSurface.belowMaterial` (readonly, for the test).

- [ ] **Step 1: Add `shadeWaterFromBelow` to `waterShading.ts`**

```ts
/**
 * The water's surface seen from below: Snell's window (the sky, and the sun, along the ray refracted out of the water) and,
 * by the Fresnel from inside (1 beyond the 48.6° rim), the water below reflected in it; foam blocks the window. Then the
 * path from the eye up to the surface point. No aerial perspective: the sky through the window already has it.
 */
export function shadeWaterFromBelow(
  i: { normal: N; viewDir: N; distance: N; foam: N; surfaceY: N; tide: N }, sky: Sky, u: WaterOpticsUniforms,
): N {
  const nDown = i.normal.negate();
  const cosI = max(dot(nDown, i.viewDir), 0.0);
  const R = fresnelFromInsideNode(cosI);
  const t: N = refract(i.viewDir.negate(), nDown, float(WATER_IOR)); // zero beyond the rim, where R = 1
  const tDir = normalize(vec3(t.x, max(t.y, 1e-3), t.z));
  const skyThrough = sky.radiance(tDir).add(sunThroughWindowNode(tDir, sky));
  const upwelling = deepWaterUpwelling(sky, u);
  const below = waterColourAtDepthNode(upwelling, u.extinction, max(i.tide.sub(i.surfaceY), 0.0));
  const surface = skyThrough.mul(float(1.0).sub(R)).add(below.mul(R));
  const foamLight = sky.skyIrradiance.add(sky.sunIlluminance.mul(max(sky.sunDirection.y, 0.0))).mul(u.foamAlbedo).div(PI);
  const seen = mix(surface, foamLight.mul(0.6), saturate(i.foam));
  const inf = waterColourAtDepthNode(upwelling, u.extinction, cameraDepthNode(i.tide));
  return alongPathNode(seen, inf, u.extinction, i.distance);
}
```

Add the imports: `refract` from `three/tsl`; `WATER_IOR` from `../seabed/waterColumn`; the four nodes from `./underwaterNodes`.

- [ ] **Step 2: Write the failing swap test `src/ocean/OceanSurface.test.ts`.** If `OceanSurface` can't be constructed under vitest (a WebGPU-only dependency), make the test pure instead: extract `pickSheetMaterial(on, above, below)` into `OceanSurface.ts`, test that, and note it in the commit.

```ts
import { describe, expect, it } from 'vitest';
import { pickSheetMaterial } from './OceanSurface';

describe('the sheet from below', () => {
  it('crossing the surface swaps between two fixed materials, never builds a new one', () => {
    const above = { name: 'above' }, below = { name: 'below' };
    const seen = new Set<object>();
    let on = false;
    for (let i = 0; i < 50; i++) { on = !on; seen.add(pickSheetMaterial(on, above, below)); }
    expect([...seen]).toEqual(expect.arrayContaining([above, below]));
    expect(seen.size).toBe(2);
    expect(pickSheetMaterial(false, above, below)).toBe(above);
    expect(pickSheetMaterial(true, above, below)).toBe(below);
  });
});
```

Run: `npx vitest run src/ocean/OceanSurface.test.ts`. Expected: FAIL (`pickSheetMaterial` not exported).

- [ ] **Step 3: Build the second material in `OceanSurface`.**
  - Move the vertex setup (`baseXZ`, `radial`, the three varyings, `displacement`, `curvatureDrop`, the `positionNode` expression, `vBaseXZ`) into a private helper that takes a material and assigns its `positionNode`, so both materials share it. Build the varyings once and reuse them, as the fragment reads them.
  - The above material is today's, unchanged (`FrontSide`, `shadeWater`, footprint mask).
  - The below material: `side = THREE.BackSide`, no `maskNode` (ruling above), and a `colorNode` built from the same `fft`, `normal` and `distance` expressions:

```ts
    below.colorNode = shadeWaterFromBelow(
      { normal, viewDir, distance, foam: max(fft.foam, setFoamLook.x), surfaceY: positionWorld.y, tide: model.seabed.tide },
      sky, optics,
    );
```

  - Add:

```ts
/** The sheet's material for the eye's side of the surface (two built once; crossing the surface only swaps them). */
export function pickSheetMaterial<M>(underwater: boolean, above: M, below: M): M {
  return underwater ? below : above;
}
```

  and on the class:

```ts
  setUnderwater(on: boolean): void {
    this.mesh.material = pickSheetMaterial(on, this.aboveMaterial, this.belowMaterial);
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc --noEmit -p .` and `npx vitest run`. Expected: all pass, including the swap test. Run the GPU self-tests. Expected: 32/32.

- [ ] **Step 5: Commit**

```bash
git add src/ocean/waterShading.ts src/ocean/OceanSurface.ts src/ocean/OceanSurface.test.ts
git commit -m "feat(underwater): the surface from below (Snell's window, total internal reflection, foam), a second sheet material"
```

---

### Task 6: Wiring, captures and docs

**Files:**
- Modify: `src/app/App.ts`
- Modify: `docs/superpowers/specs/2026-09-27-underwater-view-design.md` (status, the two rulings, exposure outcome)
- Modify: `docs/superpowers/gallery/phase-2/README.md` (entries 18–21)
- Create: `docs/superpowers/gallery/phase-2/18-underwater-window.png`, `19-underwater-reef.png`, `20-underwater-down.png`, `21-underwater-drain.png`

**Interfaces:**
- Consumes: `nextUnderwater` (Task 1), `WaterVolume` (Task 4), `OceanSurface.setUnderwater` (Task 5), `this.probe.heightAt(0)`, `this.sky.dome`, `this.ribbon.mesh`.

- [ ] **Step 1: Wire App.**
  - Add `readonly waterVolume = new WaterVolume(this.seabed, this.sky, this.waterOptics);` beside the other scene objects, and `this.scene.add(this.waterVolume.mesh);` after `this.scene.add(this.sky.dome);`.
  - Add `private underwater = false;`.
  - In the frame loop, after `this.sky.followCamera(this.camera.position);`:

```ts
    this.waterVolume.followCamera(this.camera.position);
    const water = this.probe.heightAt(0);
    const under = water === null ? this.underwater : nextUnderwater(this.underwater, this.camera.position.y, water);
    if (under !== this.underwater) {
      this.underwater = under;
      this.oceanSurface.setUnderwater(under);
      this.sky.dome.visible = !under;
      this.waterVolume.mesh.visible = under;
    }
    // The ribbon is single-sided and the sheet under it is cut away above water only (plan ruling): hidden underwater.
    this.ribbon.mesh.visible = this.ribbon.mesh.visible && !under;
```

  Check how `updateRibbon` sets `ribbon.mesh.visible`. If it sets visibility itself each frame, apply the `&& !this.underwater` there instead, so the two don't fight. Read `BreakingRibbon`'s visibility handling (`grep -n "visible" src/breaker/BreakingRibbon.ts src/app/App.ts`) and put the underwater condition where visibility is decided.

- [ ] **Step 2: Verify in the browser.** Load each capture moment in the browser pane at 1600×1000 (reload per frame, then `ld.applyMoment(...)` paused, wait for the field, then `ld.captureFrame()` → POST to the shot server). Save the frames under the gallery names:
  - `18`: eye 3 m under the peak (`[0, -3, -10]`), looking straight up (pitch 89). Expect a bright circle of sky with a darker, reflective ring beyond.
  - `19`: eye 3 m deep over the north ledge (`[10, -3, -30]`), looking along the reef (pitch −5).
  - `20`: eye 4 m deep (`[0, -4, 0]`), looking down (pitch −60) at the reef.
  - `21`: `the-drain` moment's camera moved 2 m under the surface.

  Read each frame. Expected: no black anywhere, the window visible in 18, the reef visible in 19 and 20. Read the console for errors. Then capture `the-drain` and `barrel-peeling` above water and compare them with captures from before Task 1 at the same viewport. Expected: identical.

- [ ] **Step 3: Exposure.** If the frames read too dark to see the reef (the water colour itself is very dark next to the sky), add an underwater exposure factor to `PicturePipeline`, applied while underwater. Measure the factor that makes frame 19's reef read like the reef seen from above in `the-drain`. Record the value and the reason in spec §3.6. If the frames read well, record "no change needed" in §3.6.

- [ ] **Step 4: GPU time.** With the dev UI on, read the perf overlay's GPU ms underwater at frame 19's camera and above water at `the-drain`, and note both in the gallery README.

- [ ] **Step 5: Docs.**
  - Spec: set the status line to `implemented 2026-09-27 (plan: docs/superpowers/plans/2026-09-27-underwater-view.md)`, add the two plan rulings under §3.5, and record the exposure outcome in §3.6.
  - Gallery README: a section "Underwater (Andrew)" with one line per frame 18–21 saying what it shows, plus the GPU times.

- [ ] **Step 6: Final checks and commit**

Run: `npx tsc --noEmit -p .`, `npx vitest run` (all pass), and the GPU self-tests (32/32).

```bash
git add src/app/App.ts docs/superpowers/specs/2026-09-27-underwater-view-design.md docs/superpowers/gallery/phase-2/README.md docs/superpowers/gallery/phase-2/18-underwater-window.png docs/superpowers/gallery/phase-2/19-underwater-reef.png docs/superpowers/gallery/phase-2/20-underwater-down.png docs/superpowers/gallery/phase-2/21-underwater-drain.png
git commit -m "feat(underwater): the view switches below the surface (water volume, the sheet from below, the ribbon hidden); gallery 18-21"
git push origin phase-2-the-break
```
