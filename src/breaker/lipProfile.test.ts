import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio } from './breaking';
import {
  GRAVITY_MS2, type LipParams, barrelMetrics, MIN_LIP_THICKNESS_M, PROFILE_SAMPLES, PROFILE_SEGMENTS, type ProfileInput, type Vec2, buildProfile, crossings,
  landingTime, profileFrame, sampleHome, sampleSegment, settleSpan,
} from './lipProfile';
import { ANCHORS } from './breakIntensity';
import { computeReefField, sampleField } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, type WaveContext, localHeight, sumWaves } from './setWaveModel';

// The app's field (1 m cells, default swell and tide) and the Task 2 sheet: Phase 1 + front sharpening + drain + bore.
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
// The sheet at the normal anchor, as LIP (the defaults) is: these tests measure one fixed shape (Task 6 calibrates the anchors).
const SHEET: BreakOptions = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { intensity: 1, shape: ANCHORS[1] } };
const LIP: LipParams = DEFAULT_BREAK_PARAMS;
const HS = surferFeetToHs(DEFAULT_CONDITIONS.swell.sizeFt);
const REF_BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const testWave = (heightM: number): ActiveWave => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });

/** The sheet's cross-section through the crest station at (x0, z0) when w's crest is there, along the field's ray. */
function stationAt(x0: number, z0: number, w: ActiveWave, tb: number | null, faceWidth = LIP.faceWidth) {
  const sheet: BreakOptions = { ...SHEET, params: { ...SHEET.params, faceWidth } };
  const f0 = sampleField(field, x0, z0);
  const t = f0.tau + w.arrivalS;
  const base = (u: number): Vec2 => {
    const x = x0 + f0.dirX * u, z = z0 + f0.dirZ * u;
    const s = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, sheet);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  const flat: BreakOptions = { ...sheet, pile: false };
  const frameBase = (u: number): Vec2 => {
    const x = x0 + f0.dirX * u, z = z0 + f0.dirZ * u;
    const s = sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, flat);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  const input: ProfileInput = { H: localHeight(w, f0), c: ctx.omega / f0.k, r: breakingRatio(w.heightM * f0.amp, f0.hmin, DEFAULT_BREAK_PARAMS), tb };
  return { base, frameBase, input };
}
const near = (a: Vec2, b: Vec2, tol = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

describe('lipProfile', () => {
  const big = testWave(REF_BIGGEST.heightM);
  it('as the whitewater rises under the curl the lip keeps falling: it never pulls back or flips up level', () => {
    const probe = stationAt(0, 0, big, 0);
    const tau = profileFrame(probe.base, probe.input, LIP).tauLand;
    const tipAt = (tb: number) => {
      const { base, frameBase, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, input, LIP, frameBase);
      return { reach: p.frame.reach, y: p.frame.K[1] - 0.5 * GRAVITY_MS2 * (p.frame.reach / p.frame.vj) ** 2 };
    };
    const landed = tipAt(tau);
    for (const extra of [0.2, 0.5, 0.8, 1.2]) {
      const now = tipAt(tau + extra);
      expect(now.reach, `${extra} s after landing: the lip's reach`).toBeGreaterThanOrEqual(0.95 * landed.reach);
      expect(now.y, `${extra} s after landing: the lip tip's height`).toBeLessThanOrEqual(landed.y + 0.1 * big.heightM);
    }
  });
  it('has PROFILE_SAMPLES samples whose homes run monotonically from the front edge to the back edge', () => {
    const { base, input } = stationAt(0, 0, big, 0.3);
    const f = profileFrame(base, input, LIP);
    expect(PROFILE_SAMPLES).toBe(160);
    const homes = Array.from({ length: PROFILE_SAMPLES }, (_, j) => sampleHome(j, f));
    for (let j = 1; j < homes.length; j++) expect(homes[j]).toBeLessThan(homes[j - 1]);
    expect(homes[0]).toBeCloseTo(f.uFront, 9);
    expect(homes.at(-1)).toBeCloseTo(f.uBack, 9);
  });

  it('the biggest default wave at the peak lands its lip 0.6–1.5 s after onset, ahead of the face', () => {
    const { base, input } = stationAt(0, 0, big, 0);
    const f = profileFrame(base, input, LIP);
    expect(f.tauLand).toBeGreaterThan(0.6);
    expect(f.tauLand).toBeLessThan(1.5);
    expect(f.K[0] + f.vj * f.tauLand).toBeGreaterThanOrEqual(f.F[0] + 0.3 - 1e-9);
    console.log(`peak: H ${input.H.toFixed(2)} τ_land ${f.tauLand.toFixed(3)} s, vj ${f.vj.toFixed(2)} m/s (c ${input.c.toFixed(2)}), reach ${(f.vj * f.tauLand).toFixed(2)} m, foot ${f.uFoot.toFixed(2)} m, drop ${(f.K[1] - f.F[1]).toFixed(2)} m`);
  });

  it("the barrel matches Andrew's photo when the lip lands (spec §3.1: thick lip, thrown far, round tube, face below sea level)", () => {
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

  it('the tip follows the ballistic arc from the crest', () => {
    for (const tb of [0.1, 0.3, 0.6]) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, input, LIP);
      const f = p.frame;
      const tip = p.points[PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under + PROFILE_SEGMENTS.cap];
      expect(near(tip, [f.K[0] + f.vj * tb, f.K[1] - 0.5 * GRAVITY_MS2 * tb * tb], 1e-9)).toBe(true);
    }
  });

  it('never crosses itself before the lip lands (peak, ledge points, bigger waves, slider ends)', () => {
    const cases: { x: number; z: number; h: number; p: LipParams }[] = [];
    // Only where the crest has broken (r ≥ 1): a time since onset means the section broke.
    for (const [x, z] of [[0, 0], [20, -40], [35, -90], [15, 16], [50, 36]] as const) for (const h of [REF_BIGGEST.heightM, 1.8 * HS, 3 * HS]) {
      const f = sampleField(field, x, z);
      if (breakingRatio(h * f.amp, f.hmin, DEFAULT_BREAK_PARAMS) >= 1) cases.push({ x, z, h, p: LIP });
    }
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const p of [{ ...LIP, throwStrength: 0.1 }, { ...LIP, throwStrength: 1 }, { ...LIP, lipThickness: 0.03 }, { ...LIP, lipThickness: 0.3 }, { ...LIP, faceWidth: 0.1 }, { ...LIP, faceWidth: 3 }]) {
      cases.push({ x: 0, z: 0, h: REF_BIGGEST.heightM, p });
    }
    let worst = 0;
    for (const c of cases) {
      const w = testWave(c.h);
      const probe = stationAt(c.x, c.z, w, 0, c.p.faceWidth);
      const tau = profileFrame(probe.base, probe.input, c.p).tauLand;
      for (const frac of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 0.999]) {
        const { base, input } = stationAt(c.x, c.z, w, frac * tau, c.p.faceWidth);
        const n = crossings(buildProfile(base, input, c.p).points);
        worst = Math.max(worst, n);
        if (n) console.log(`crossing at (${c.x},${c.z}) h ${c.h.toFixed(2)} frac ${frac} ${JSON.stringify(c.p)}`);
      }
      for (const r of [0.55, 0.7, 0.85, 0.99]) {
        const { base, input } = stationAt(c.x, c.z, w, null, c.p.faceWidth);
        expect(crossings(buildProfile(base, { ...input, r }, c.p).points)).toBe(0);
      }
    }
    expect(worst).toBe(0);
  });

  it('is exactly the sheet before it steepens and after it collapses', () => {
    for (const [r, tb] of [[0.6, null], [0.69, null], [2, Infinity], [2, 10]] as const) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, { ...input, r }, LIP);
      p.points.forEach((pt, j) => expect(near(pt, base(p.homes[j]), 1e-9)).toBe(true));
    }
  });

  it('its edges are the sheet at every stage', () => {
    for (const tb of [null, 0, 0.4, 0.9, 1.4, 3]) {
      const { base, input } = stationAt(0, 0, big, tb);
      const p = buildProfile(base, { ...input, r: tb === null ? 0.9 : input.r }, LIP);
      expect(near(p.points[0], base(p.frame.uFront))).toBe(true);
      expect(near(p.points.at(-1) as Vec2, base(p.frame.uBack))).toBe(true);
      for (let j = 0; j < PROFILE_SEGMENTS.front; j++) expect(near(p.points[j], base(p.homes[j]))).toBe(true);
    }
  });

  it('the lip is never thinner than 2 cm once it has grown', () => {
    const thin = { ...LIP, lipThickness: 0.03 };
    const probe = stationAt(0, 0, big, 0);
    const tau = profileFrame(probe.base, probe.input, thin).tauLand;
    for (const frac of [0.35, 0.6, 0.95]) {
      const { base, input } = stationAt(0, 0, big, frac * tau);
      const p = buildProfile(base, input, thin);
      p.lipness.forEach((l, j) => { if (l > 0.99) expect(p.thickness[j]).toBeGreaterThanOrEqual(MIN_LIP_THICKNESS_M - 1e-12); });
    }
  });

  it("the foam zones (Andrew's photo): the lip whitens as it throws, most at its tip, the tube is clean, and foam fills it once the lip lands", () => {
    const probe = stationAt(0, 0, big, 0);
    const f0 = profileFrame(probe.base, probe.input, LIP);
    const at = (tb: number) => { const { base, input } = stationAt(0, 0, big, tb); return buildProfile(base, input, LIP); };
    const segOf = (j: number) => sampleSegment(j).seg;
    const inside = (j: number) => ['face', 'wall', 'under'].includes(segOf(j));
    const outerFrom = PROFILE_SEGMENTS.front + PROFILE_SEGMENTS.face + PROFILE_SEGMENTS.wall + PROFILE_SEGMENTS.under + PROFILE_SEGMENTS.cap;
    // In the air: the tube's inside hides the sheet's foam (< 0), the outside carries its own, more at the tip than the root.
    const air = at(0.8 * f0.tauLand);
    expect(air.frame.weight).toBeGreaterThan(0.5);
    air.curlFoam.forEach((c, j) => {
      if (inside(j)) expect(c, `j ${j} (${segOf(j)}) in the air`).toBeLessThan(0);
      if (segOf(j) === 'outer' || segOf(j) === 'cap') expect(c, `j ${j} (${segOf(j)}) in the air`).toBeGreaterThanOrEqual(0);
    });
    const tip = air.curlFoam[outerFrom], root = air.curlFoam[outerFrom + PROFILE_SEGMENTS.outer - 1];
    expect(tip, 'the tip whitens').toBeGreaterThan(0.3);
    expect(tip, 'more at the tip than the root').toBeGreaterThan(root + 0.2);
    // Landed: the curl implodes into foam, inside and out.
    const landed = at(f0.tauLand + 0.5 * settleSpan(probe.input.H, LIP));
    const wallFoam = landed.curlFoam.filter((_, j) => segOf(j) === 'wall' || segOf(j) === 'under');
    expect(Math.min(...wallFoam), 'the tube foams once the lip has landed').toBeGreaterThan(0.3);
    expect(Math.max(...at(1.5).curlFoam)).toBeGreaterThan(0.5);
  });

  it('stays finite at the extremes (12 ft, 0.5 ft, huge and tiny times)', () => {
    for (const h of [0.05, surferFeetToHs(12) * 1.8]) for (const tb of [null, 0, 0.5, 5, 1e6, Infinity]) {
      const { base, input } = stationAt(0, 0, testWave(h), tb);
      const p = buildProfile(base, { ...input, r: tb === null ? 0.95 : input.r }, LIP);
      for (const pt of p.points) { expect(Number.isFinite(pt[0])).toBe(true); expect(Number.isFinite(pt[1])).toBe(true); }
    }
    expect(landingTime(-3)).toBeGreaterThan(0);
  });
});
