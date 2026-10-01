import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetTime } from './breaking';
import {
  GRAVITY_MS2, type LipParams, PROFILE_SAMPLES, PROFILE_SEGMENTS, type ProfileInput, type Vec2, buildProfile, crossings, foldDepth,
  IMPACT_BISECT, IMPACT_SCAN, impactHeight, landingTime, profileFrame, sampleHome, sampleSegment, settleSpan,
} from './lipProfile';
import { PSI_NORMAL } from './overturn';
import { peakLanding, peakStation } from './peakStation.fixture';
import { computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, type WaveContext, localHeight, sumWaves } from './setWaveModel';

// The app's field (1 m cells, default swell and tide) and the Task 2 sheet: Phase 1 + front sharpening + drain + bore.
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
// Every crest at the normal ψ (state 5): these tests measure one fixed shape.
const SHEET: BreakOptions = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { psi: PSI_NORMAL } };
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
      return { reach: p.frame.reach, y: p.frame.tip[1] };
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

  it('the biggest default wave at the peak lands its lip 0.4–1.5 s after onset (a free fall from the crest)', () => {
    const { base, input } = stationAt(0, 0, big, 0);
    // Read at the landing: the frame's P is the curl's point as it stands, the landing point once it has landed.
    const f = profileFrame(base, { ...input, psi: PSI_NORMAL, tb: profileFrame(base, { ...input, psi: PSI_NORMAL }, LIP).tauLand }, LIP);
    expect(f.tauLand).toBeGreaterThan(0.4);
    expect(f.tauLand).toBeLessThan(1.5);
    expect(Math.abs(f.tauLand - Math.sqrt((2 * (f.K[1] - f.P[1])) / GRAVITY_MS2))).toBeLessThan(1e-9);
    console.log(`peak: H ${input.H.toFixed(2)} τ_land ${f.tauLand.toFixed(3)} s, vj ${f.vj.toFixed(2)} m/s (c ${input.c.toFixed(2)}), lands ${(f.P[0] - f.K[0]).toFixed(2)} m ahead, ${(f.K[1] - f.P[1]).toFixed(2)} m down`);
  });


  it('never crosses itself before the lip lands (peak, ledge points, bigger waves, ψ and face-width ends)', () => {
    const cases: { x: number; z: number; h: number; p: LipParams; psi?: number }[] = [];
    // Only where the crest has broken (r ≥ 1): a time since onset means the section broke.
    for (const [x, z] of [[0, 0], [20, -40], [35, -90], [15, 16], [50, 36]] as const) for (const h of [REF_BIGGEST.heightM, 1.8 * HS, 3 * HS]) {
      const f = sampleField(field, x, z);
      if (breakingRatio(h * f.amp, f.hmin, DEFAULT_BREAK_PARAMS) >= 1) cases.push({ x, z, h, p: LIP });
    }
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const psi of [0.015, 0.3]) cases.push({ x: 0, z: 0, h: REF_BIGGEST.heightM, p: LIP, psi });
    for (const p of [{ ...LIP, faceWidth: 0.1 }, { ...LIP, faceWidth: 3 }]) cases.push({ x: 0, z: 0, h: REF_BIGGEST.heightM, p });
    let worst = 0;
    for (const c of cases) {
      const w = testWave(c.h);
      const probe = stationAt(c.x, c.z, w, 0, c.p.faceWidth);
      const withPsi = (i: ProfileInput): ProfileInput => ({ ...i, psi: c.psi ?? PSI_NORMAL });
      const tau = profileFrame(probe.frameBase, withPsi(probe.input), c.p).tauLand;
      for (const frac of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 0.999]) {
        const { base, frameBase, input } = stationAt(c.x, c.z, w, frac * tau, c.p.faceWidth);
        const pts = buildProfile(base, withPsi(input), c.p, frameBase).points;
        // At contact the round tip meets the water by a few cm.
        const n = frac < 0.99 ? crossings(pts) : foldDepth(pts) > 0.05 ? 1 : 0;
        worst = Math.max(worst, n);
        if (n) console.log(`crossing at (${c.x},${c.z}) h ${c.h.toFixed(2)} ψ ${c.psi ?? PSI_NORMAL} frac ${frac} faceWidth ${c.p.faceWidth}`);
      }
      for (const r of [0.55, 0.7, 0.85, 0.99]) {
        const { base, frameBase, input } = stationAt(c.x, c.z, w, null, c.p.faceWidth);
        const pre = crossings(buildProfile(base, { ...withPsi(input), r }, c.p, frameBase).points);
        if (pre) console.log(`pre-break crossing at (${c.x},${c.z}) h ${c.h.toFixed(2)} ψ ${c.psi ?? PSI_NORMAL} r ${r} faceWidth ${c.p.faceWidth}`);
        expect(pre).toBe(0);
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

  it('solves H_I with a warm-started sheet read: the first read cold (5 reads), the rest from the last u (3 reads each)', () => {
    let bisected = 0;
    for (const psi of [0.03, 0.045, 0.06, 0.08, 0.1]) {
      const st = peakStation(psi, peakLanding(psi));
      let reads = 0;
      const counted = (u: number): Vec2 => { reads++; return st.frameBase(u); };
      const HI = impactHeight(counted, st.frameBase(0), st.input.H, psi, 0);
      if (HI > st.input.H) bisected++;
      expect(reads, `ψ ${psi}`).toBeLessThanOrEqual(5 + (IMPACT_SCAN.length + IMPACT_BISECT - 1) * 3);
    }
    expect(bisected).toBeGreaterThan(0);
  });
  it('its edges are the sheet with a pile standing above the crest at both edges', () => {
    // A synthetic cross-section steep enough to throw, and whitewater standing 0.8 m over it at both
    // edges (the pile's knots include uBack and uFront).
    const frameBase = (u: number): Vec2 => [u + 0.3 * Math.sin(u * 0.2), 2.6 * Math.exp(-((u / 2.5) ** 2)) - 1.6];
    const tau = profileFrame(frameBase, { H: 4, c: 8, r: 1.4, tb: 0, psi: PSI_NORMAL }, LIP).tauLand;
    for (const tb of [0.5 * tau, tau + 0.2, tau + 0.8]) {
      const input = { H: 4, c: 8, r: 1.4, tb, psi: PSI_NORMAL };
      const f = profileFrame(frameBase, input, LIP);
      const bump = (u: number, at: number): number => 0.8 * Math.exp(-(((u - at) / 3) ** 2));
      const piled = (u: number): Vec2 => { const b = frameBase(u); return [b[0], b[1] + bump(u, f.uBack) + bump(u, f.uFront)]; };
      const p = buildProfile(piled, input, LIP, frameBase);
      expect(p.frame.weight).toBeGreaterThan(0.5);
      expect(near(p.points[0], piled(p.frame.uFront))).toBe(true);
      expect(near(p.points.at(-1) as Vec2, piled(p.frame.uBack))).toBe(true);
    }
  });


  it("the foam zones (Andrew's photo): the lip whitens as it throws, most at its tip, the tube is clean, and foam fills it once the lip lands", () => {
    // Where the peak's section breaks (on the softened ramp ~45 m seaward of (0, 0), where the wave has long since
    // collapsed into a bore by the time it arrives).
    let bx = 0, bz = 0;
    for (let d = 0; d < 300; d++) {
      const s = sampleField(field, bx, bz), nx = bx - s.dirX, nz = bz - s.dirZ, r = sampleOnset(field, nx, nz);
      if (!r || onsetTime(r, 0, big.heightM, DEFAULT_BREAK_PARAMS) === null) break;
      bx = nx; bz = nz;
    }
    const probe = stationAt(bx, bz, big, 0);
    const f0 = profileFrame(probe.base, probe.input, LIP);
    const at = (tb: number) => { const { base, input } = stationAt(bx, bz, big, tb); return buildProfile(base, input, LIP); };
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
