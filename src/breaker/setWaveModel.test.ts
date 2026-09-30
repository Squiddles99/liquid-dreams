import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, breakingRatio } from './breaking';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ActiveWave, BREAKING_RATIO, type BreakOptions, type WaveContext, breakOptions, crestAt, localHeight, sumWaves, toActiveWave, waveAt } from './setWaveModel';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { barrelShape } from './breakIntensity';
import { computeReefField, sampleField } from './reefField';

const omega = (T: number) => (2 * Math.PI) / T;

function field1D(depth: number, T: number, amp = 1, hmin = depth): (x: number) => FieldSample {
  const k = waveNumber(omega(T), depth), c = omega(T) / k;
  return (x) => ({ tau: x / c, amp, hmin, hminBreak: hmin, hminSlurp: hmin, k, dirX: 1, dirZ: 0, depth });
}
const ctxFor = (T: number): WaveContext => ({ omega: omega(T), travelX: 1, travelZ: 0 });
const wave = (T: number, heightM: number, arrivalS = 100): ActiveWave => ({
  arrivalS, heightM, omega: omega(T), travelX: 1, travelZ: 0, crestLengthM: 400, crestOffsetM: 0,
});

describe('set-wave model', () => {
  it('puts the crest at the peak at the arrival time', () => {
    const f = field1D(30, 15)(0);
    const crest = waveAt(0, 0, 100, f, wave(15, 2), ctxFor(15)).eta;
    expect(crest).toBeGreaterThan(waveAt(0, 0, 98, f, wave(15, 2), ctxFor(15)).eta);
    expect(crest).toBeGreaterThan(waveAt(0, 0, 102, f, wave(15, 2), ctxFor(15)).eta);
    expect(crest).toBeGreaterThan(0.99);
  });
  it('caps the height at 0.78 × the shallowest depth crossed', () => {
    const f: FieldSample = { tau: 0, amp: 3, hmin: 2, hminBreak: 2, hminSlurp: 2, k: 0.2, dirX: 1, dirZ: 0, depth: 5 };
    expect(localHeight(wave(15, 5), f)).toBeCloseTo(BREAKING_RATIO * 2, 12);
    expect(localHeight(wave(15, 0.2), f)).toBeCloseTo(0.6, 12);
  });
  it('extreme waves in shallow water never fold and stay finite (12 ft, 25 s, 1.2 m of water; and a steep 4 s sea)', { timeout: 30_000 }, () => {
    const cases: [number, number, number, number][] = [[25, 1.2, 4, 8.6], [4, 30, 1, 3.4], [8, 2.5, 3, 6]]; // period, depth, amp, height
    for (const [T, depth, amp, height] of cases) {
      const f = field1D(depth, T, amp);
      const lambda = (2 * Math.PI) / f(0).k;
      for (const t of [100, 100.37 * (T / 4), 103.7, 110]) {
        let prevX = -Infinity;
        for (let x = -2 * lambda; x <= 2 * lambda; x += lambda / 2000) {
          const r = waveAt(x, 0, t, f(x), wave(T, height), ctxFor(T));
          for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
          const X = x + r.dx;
          expect(X).toBeGreaterThan(prevX);
          prevX = X;
        }
      }
    }
  });
  it('is a single crest: three periods away it has all but vanished', () => {
    const f = field1D(30, 15)(0);
    const crest = waveAt(0, 0, 100, f, wave(15, 2), ctxFor(15)).eta;
    expect(Math.abs(waveAt(0, 0, 145, f, wave(15, 2), ctxFor(15)).eta)).toBeLessThan(0.05 * crest);
  });
  it('tapers the crest ends far out, not near the reef', () => {
    const T = 15, k = waveNumber(omega(T), 30);
    const at = (x: number, z: number) => ({ tau: x * (k / omega(T)), amp: 1, hmin: 30, hminBreak: 30, hminSlurp: 30, k, dirX: 1, dirZ: 0, depth: 30 });
    const w = wave(T, 2, 0);
    const onAxisFar = waveAt(-800, 0, -800 * (k / omega(T)), at(-800, 0), w, ctxFor(T)).eta;
    const offAxisFar = waveAt(-800, 400, -800 * (k / omega(T)), at(-800, 400), w, ctxFor(T)).eta;
    const offAxisNear = waveAt(-100, 150, -100 * (k / omega(T)), at(-100, 150), w, ctxFor(T)).eta;
    expect(Math.abs(offAxisFar)).toBeLessThan(0.05 * onAxisFar);
    expect(offAxisNear).toBeGreaterThan(0.9 * onAxisFar);
  });
  it('slopes match the numerical derivative for small waves', () => {
    const T = 15, f = field1D(30, T);
    const w = wave(T, 0.1);
    for (const x of [-40, -10, 5, 30]) {
      const e = 0.01;
      const numeric = (waveAt(x + e, 0, 100, f(x + e), w, ctxFor(T)).eta - waveAt(x - e, 0, 100, f(x - e), w, ctxFor(T)).eta) / (2 * e);
      const analytic = waveAt(x, 0, 100, f(x), w, ctxFor(T)).slopeX;
      expect(Math.abs(analytic - numeric)).toBeLessThan(0.05 * Math.abs(numeric) + 1e-5);
    }
  });
  it('sums waves and treats zero height as nothing', () => {
    const f = field1D(30, 15)(0);
    const a = waveAt(0, 0, 100, f, wave(15, 1, 100), ctxFor(15));
    const b = waveAt(0, 0, 100, f, wave(15, 1, 115), ctxFor(15));
    expect(sumWaves(0, 0, 100, f, [wave(15, 1, 100), wave(15, 1, 115)], ctxFor(15)).eta).toBeCloseTo(a.eta + b.eta, 12);
    expect(waveAt(0, 0, 100, f, wave(15, 0), ctxFor(15))).toEqual({ eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, stage: 0, pile: 0 });
  });
  it('converts set events into active waves', () => {
    const w = toActiveWave({ id: 1, slot: 0, indexInSet: 0, waveCount: 5, arrivalS: 42, heightM: 2.5, periodS: 14, fromDeg: 225, crestLengthM: 350, crestOffsetM: 10, longTail: true, gapS: Infinity, throwDraw: 0 });
    expect(w.omega).toBeCloseTo((2 * Math.PI) / 14, 12);
    expect(w.travelX).toBeCloseTo(Math.SQRT1_2, 9);
    expect(w.travelZ).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(w.longTail).toBe(true);
  });
  it('the crest carries its breaking ratio, and is found before the wave breaks (the sheet steepens from r = ribbonOnset + 0.2)', () => {
    const f = field1D(8, 15, 1.2, 6);
    const w = wave(15, 2), o = { sample: (x: number) => f(x), params: DEFAULT_BREAK_PARAMS };
    const crest = crestAt(3, 0, 100, f(3), w, ctxFor(15), o)!;
    expect(crest).not.toBeNull();
    expect(crest.r).toBeCloseTo(breakingRatio(2 * 1.2, 6, DEFAULT_BREAK_PARAMS), 12);
    expect(crest.r).toBeLessThan(1);
    expect(crest.s).toBe(0);
    expect(crestAt(3, 0, 100, f(3), w, ctxFor(15), { ...o, params: { ...DEFAULT_BREAK_PARAMS, enabled: false } })).toBeNull();
  });
});

describe('break intensity at the crest (condition-driven barrel)', () => {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c12 = cloneConditions(DEFAULT_CONDITIONS); c12.swell.sizeFt = 12;
  const big = wavesOfSet(1, c12, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w: ActiveWave = { arrivalS: 0, heightM: big.heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
  const t = sampleField(field, 0, 0).tau + 0.5;
  const crestWith = (o: BreakOptions, wave = w) => crestAt(0, 0, t, sampleField(field, 0, 0), wave, ctx, o)!;
  const lowestAhead = (o: BreakOptions) => {
    const f0 = sampleField(field, 0, 0);
    let m = Infinity;
    // At t (the 12 ft wave broke ~2 s before the peak, so its lip is landing now; a second later the drain has refilled).
    for (let u = 0; u <= 40; u += 0.5) { const x = f0.dirX * u, z = f0.dirZ * u; m = Math.min(m, sumWaves(x, z, t, sampleField(field, x, z), [w], ctx, o).eta); }
    return m;
  };
  it('the crest carries its intensity and its own params (the shape at that intensity)', () => {
    const c = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS));
    expect(c.intensity).toBeGreaterThanOrEqual(0);
    expect(c.intensity).toBeLessThanOrEqual(2);
    expect(c.params.troughDrain).toBeCloseTo(barrelShape(c.intensity).troughDrain, 12);
    expect(c.params.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
  });
  it('offshore wind raises the intensity by 0.5 over the same onshore wind (unclamped here)', () => {
    const on = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS, -8)).intensity, off = crestWith(breakOptions(field, DEFAULT_BREAK_PARAMS, 8)).intensity;
    if (on > 0 && off < 2) expect(off - on).toBeCloseTo(0.5, 6);
    else expect(off).toBeGreaterThan(on);
  });
  it('a heavier intensity drains the water in front deeper', () => {
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
    expect(lowestAhead({ ...o, force: { intensity: 2 } })).toBeLessThan(lowestAhead({ ...o, force: { intensity: 0 } }) - 0.3);
  });
  it('the dial at 0 ignores the draw; at 0.3 a draw of 1 adds 0.3', () => {
    const o0 = breakOptions(field, DEFAULT_BREAK_PARAMS), o3 = breakOptions(field, { ...DEFAULT_BREAK_PARAMS, randomDial: 0.3 });
    expect(crestWith(o0, { ...w, throwDraw: 1 }).intensity).toBeCloseTo(crestWith(o0, { ...w, throwDraw: -1 }).intensity, 12);
    const a = crestWith(o3, { ...w, throwDraw: 0 }).intensity, b = crestWith(o3, { ...w, throwDraw: 1 }).intensity;
    if (a < 1.7) expect(b - a).toBeCloseTo(0.3, 6);
  });
  it('off the reef grid the crest reads the normal anchor exactly', () => {
    const x = field.grid.x0 - 50, z = 0, f = sampleField(field, x, z);
    const c = crestAt(x, z, f.tau, f, w, ctx, breakOptions(field, DEFAULT_BREAK_PARAMS, 8));
    if (c) expect(c.intensity).toBe(1);
  });
});
