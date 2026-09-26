import { describe, expect, it } from 'vitest';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ActiveWave, BREAKING_RATIO, type WaveContext, localHeight, sumWaves, toActiveWave, waveAt } from './setWaveModel';

const omega = (T: number) => (2 * Math.PI) / T;

function field1D(depth: number, T: number, amp = 1, hmin = depth): (x: number) => FieldSample {
  const k = waveNumber(omega(T), depth), c = omega(T) / k;
  return (x) => ({ tau: x / c, amp, hmin, k, dirX: 1, dirZ: 0, depth });
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
    const f: FieldSample = { tau: 0, amp: 3, hmin: 2, k: 0.2, dirX: 1, dirZ: 0, depth: 5 };
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
    const at = (x: number, z: number) => ({ tau: x * (k / omega(T)), amp: 1, hmin: 30, k, dirX: 1, dirZ: 0, depth: 30 });
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
    expect(waveAt(0, 0, 100, f, wave(15, 0), ctxFor(15))).toEqual({ eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, lip: 0, stage: 0 });
  });
  it('converts set events into active waves', () => {
    const w = toActiveWave({ id: 1, slot: 0, indexInSet: 0, waveCount: 5, arrivalS: 42, heightM: 2.5, periodS: 14, fromDeg: 225, crestLengthM: 350, crestOffsetM: 10 });
    expect(w.omega).toBeCloseTo((2 * Math.PI) / 14, 12);
    expect(w.travelX).toBeCloseTo(Math.SQRT1_2, 9);
    expect(w.travelZ).toBeCloseTo(-Math.SQRT1_2, 9);
  });
});
