import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetTime } from './breaking';
import { ANCHORS, type BarrelShape, PER_CREST_BREAK_KEYS, barrelShape, withShape } from './breakIntensity';
import { PROFILE_SEGMENTS, type ProfileInput, type Vec2, barrelMetrics, buildProfile, crossings, profileFrame } from './lipProfile';
import { computeReefField, sampleField, sampleOnset } from './reefField';
import { type ActiveWave, type BreakOptions, breakOptions, localHeight, sumWaves } from './setWaveModel';

// The spec's anchors (2026-09-30 §3.3): measured at the lip's landing on the peak for the biggest 12 ft set wave.
export const TARGETS = [
  { tubeRatio: 2.0, landAhead: 1.0, rootThickness: 0.1, troughBelow: 0.2, pileSurge: 0 },
  { tubeRatio: 1.3, landAhead: 1.7, rootThickness: 0.2, troughBelow: 0.55, pileSurge: 0.3 },
  { tubeRatio: 1.1, landAhead: 2.0, rootThickness: 0.3, troughBelow: 0.7, pileSurge: 0.45 },
] as const;

export const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
export const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const c12 = cloneConditions(DEFAULT_CONDITIONS); c12.swell.sizeFt = 12;
export const BIG12 = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
export const wave: ActiveWave = { arrivalS: 0, heightM: BIG12.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };

const P = DEFAULT_BREAK_PARAMS;
const f00 = sampleField(field, 0, 0);
/** The peak's ray: s metres along it from the peak. */
const onRay = (s: number) => ({ x: f00.dirX * s, z: f00.dirZ * s });
/** The time since onset the record gives at s on the peak's ray (null before the section breaks). */
const tbAlong = (s: number): number | null => { const p = onRay(s); const rec = sampleOnset(field, p.x, p.z); return rec ? onsetTime(rec, 0, wave.heightM, P) : null; };
/** Where on the peak's ray the section has been broken for tb seconds as the crest gets there (bisection: tb grows along the ray after onset). */
function sAtTb(tb: number): number {
  let lo = -60, hi = 60;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2, v = tbAlong(mid); if (v === null || v < tb) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * The cross-section at intensity I (forced on the sheet and the lip), on the peak's ray at the crest point whose section
 * has been broken for tb seconds, at the moment the crest is there: the sheet and the lip on one clock, as in the game
 * (the ribbon's stations sit on the crest and read tb there). tb null: 40 m up the ray, before it breaks.
 */
export function anchorStation(I: number, tb: number | null, shape: BarrelShape = barrelShape(I)) {
  const sheet: BreakOptions = { ...breakOptions(field, P), force: { intensity: I, shape } };
  const flat: BreakOptions = { ...sheet, pile: false };
  const s0 = tb === null ? -40 : sAtTb(tb), p0 = onRay(s0);
  const f0 = sampleField(field, p0.x, p0.z), t = f0.tau;
  const along = (o: BreakOptions) => (u: number): Vec2 => {
    const x = p0.x + f0.dirX * u, z = p0.z + f0.dirZ * u, s = sumWaves(x, z, t, sampleField(field, x, z), [wave], ctx, o);
    return [u + s.dx * f0.dirX + s.dz * f0.dirZ, s.eta];
  };
  const input: ProfileInput = { H: localHeight(wave, f0), c: ctx.omega / f0.k, r: breakingRatio(wave.heightM * f0.amp, f0.hminBreak, P), tb: tb === null ? null : tbAlong(s0) };
  return { base: along(sheet), frameBase: along(flat), input, lip: withShape(P, shape), s0 };
}

/** The lip's landing time at intensity I: the station where tb equals its own τ_land (three fixed-point steps from 1 s). */
export function anchorLanding(I: number, shape: BarrelShape = barrelShape(I)): number {
  let tb = 1;
  for (let i = 0; i < 3; i++) { const st = anchorStation(I, tb, shape); tb = profileFrame(st.frameBase, st.input, st.lip).tauLand; }
  return tb;
}

/** The barrel's metrics at the lip's landing for intensity I (or a trial shape). */
export function anchorMetrics(I: number, shape: BarrelShape = barrelShape(I)) {
  const s = anchorStation(I, anchorLanding(I, shape), shape);
  return { ...barrelMetrics(buildProfile(s.base, s.input, s.lip, s.frameBase), s.input.H), pileSurge: shape.pileSurge };
}

/**
 * How deep the polyline folds through itself (m): over every pair of non-adjacent segments that cross, the least distance
 * any of their four ends lies from the other's line, the largest such. A tip grazing the water it lies on as it collapses
 * folds by millimetres; the landed tip in the risen water folded by ~0.3 m and the crest step stood ~2.5 m (Andrew's
 * circles, 2026-09-30).
 */
export function foldDepth(pts: readonly Vec2[]): number {
  const off = (p: Vec2, a: Vec2, b: Vec2) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; };
  let worst = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let j = i + 2; j + 1 < pts.length; j++) {
      const [a, b, c, d] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
      if (crossings([a, b, c, d]) === 0) continue; // segments a→b and c→d (b→c is only a joiner here)
      worst = Math.max(worst, Math.min(off(c, a, b), off(d, a, b), off(a, c, d), off(b, c, d)));
    }
  }
  return worst;
}

describe('the anchors (spec 2026-09-30 §3.3)', () => {
  for (const k of [0, 1, 2] as const) {
    it(`anchor ${k} reproduces its row`, () => {
      const m = anchorMetrics(k), tgt = TARGETS[k];
      console.log(`anchor ${k}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([a, v]) => [a, +(+v).toFixed(3)])))}`);
      expect(Math.abs(m.tubeRatio - tgt.tubeRatio), 'tube width ÷ height').toBeLessThanOrEqual(0.15);
      for (const key of ['landAhead', 'rootThickness', 'troughBelow'] as const) expect(Math.abs(m[key] - tgt[key]), key).toBeLessThanOrEqual(0.1 * tgt[key]);
      expect(m.pileSurge).toBe(tgt.pileSurge);
      expect(m.tipRatio).toBeCloseTo(0.4, 2);
    });
  }
  it('the lip never crosses itself anywhere from gentle to heavy, before it lands', () => {
    for (const I of [0, 0.5, 1, 1.5, 2]) {
      const tau = anchorLanding(I);
      for (const frac of [0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
        const s = anchorStation(I, frac * tau);
        expect(crossings(buildProfile(s.base, s.input, s.lip, s.frameBase).points), `I ${I} frac ${frac}`).toBe(0);
      }
    }
  });
  it('after the lip lands the tube fills with whitewater: no folds, no step at either join, no horn, to the hand-back (Andrew, 2026-09-30)', () => {
    for (const I of [0, 1, 2]) {
      const tau = anchorLanding(I), K0 = anchorStation(I, tau);
      const standing = Math.max(...buildProfile(K0.base, K0.input, K0.lip, K0.frameBase).points.map((q) => q[1]));
      for (const dt of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5]) {
        const s = anchorStation(I, tau + dt), prof = buildProfile(s.base, s.input, s.lip, s.frameBase), pts = prof.points;
        // The tube pinches shut as the whitewater lifts its floor: the face touches the lip by up to ~7 cm mid-collapse.
        expect(foldDepth(pts), `I ${I} +${dt} s: fold depth (m)`).toBeLessThanOrEqual(0.1);
        // Each join (the back at the lip's root, the front at the face's foot) is no bigger a jump than its neighbours' (the
        // front's samples are ~1 m apart and climb the whitewater steeply; the crest's step was 1.35–2.45 m).
        const jump = (i: number) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const r = pts.length - PROFILE_SEGMENTS.back - 1, f = PROFILE_SEGMENTS.front - 1;
        expect(jump(r), `I ${I} +${dt} s: step at the crest`).toBeLessThanOrEqual(1.2 * Math.max(jump(r - 1), jump(r + 1)) + 0.1);
        expect(jump(f), `I ${I} +${dt} s: step at the foot`).toBeLessThanOrEqual(1.2 * Math.max(jump(f - 1), jump(f + 1)) + 0.1);
        // No horn: the curl never stands above both the lip as it landed and the whitewater under it.
        const mound = Math.max(...prof.homes.map((u) => s.base(u)[1]));
        expect(Math.max(...pts.map((q) => q[1])), `I ${I} +${dt} s: horn`).toBeLessThanOrEqual(Math.max(standing, mound) + 0.2);
      }
    }
  });
  it("the defaults' per-crest keys are the normal anchor", () => {
    for (const key of PER_CREST_BREAK_KEYS) expect(DEFAULT_BREAK_PARAMS[key]).toBe(ANCHORS[1][key]);
  });
});

/**
 * The calibration search (run once: CALIBRATE=1 npx vitest run src/breaker/barrelAnchors.test.ts). Each input steers
 * one metric (throw → landAhead, lipThickness → rootThickness, troughDrain → troughBelow, wallBack → tubeRatio); rounds
 * of bisection on each in turn, the others held, until all four sit within their tolerance. Prints the ANCHORS literal.
 */
describe.skipIf(!import.meta.env.CALIBRATE)('calibrate the anchors', () => {
  it('finds each anchor', { timeout: 3_600_000 }, () => {
    const knobs = [
      { key: 'throwStrength', metric: 'landAhead', lo: 0.1, hi: 1.5, up: true },
      { key: 'lipThickness', metric: 'rootThickness', lo: 0.03, hi: 0.4, up: true },
      { key: 'troughDrain', metric: 'troughBelow', lo: 0, hi: 1, up: true },
      { key: 'wallBack', metric: 'tubeRatio', lo: -0.3, hi: 1, up: true },
    ] as const;
    const found: BarrelShape[] = [];
    for (const k of [0, 1, 2] as const) {
      const s: BarrelShape = { ...ANCHORS[k], pileSurge: TARGETS[k].pileSurge };
      for (let round = 0; round < 6; round++) {
        for (const kn of knobs) {
          let lo: number = kn.lo, hi: number = kn.hi;
          for (let it = 0; it < 18; it++) {
            const mid = (lo + hi) / 2;
            const m = anchorMetrics(k, { ...s, [kn.key]: mid })[kn.metric];
            if ((m < TARGETS[k][kn.metric]) === kn.up) lo = mid; else hi = mid;
          }
          s[kn.key] = +((lo + hi) / 2).toFixed(4);
        }
      }
      console.log(`anchor ${k}: ${JSON.stringify(s)} → ${JSON.stringify(anchorMetrics(k, s))}`);
      found.push(s);
    }
    console.log(`export const ANCHORS: readonly [BarrelShape, BarrelShape, BarrelShape] = ${JSON.stringify(found)};`);
  });
});
