import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, breakingRatio, onsetPsi, onsetTime } from './breaking';
import { waveNumber } from './dispersion';
import type { FieldSample } from './fieldSample';
import {
  type ActiveWave, BREAKING_RATIO, type BreakOptions, ENVELOPE_CUTOFF, ENVELOPE_WIDTH, type WaveContext, beyondEnvelope,
  breakOptions, crestAt, localHeight, phaseXi, rayCrestPoint, sumWaves, toActiveWave, waveAt,
} from './setWaveModel';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { PSI_NORMAL, drainFactor, sheetShape } from './overturn';
import { computeReefField, sampleField, sampleOnset } from './reefField';

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
  it('each swell line is one wave (Andrew, 2026-10-01): a period behind any set wave, it stands under 1% of its crest', () => {
    // A "long tail" wave (one in twelve) used to leave a 21% crest a period behind it: in front of the next wave, a first
    // swell that filled its drain before it broke.
    const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
    const f = field1D(30, 15)(0);
    let checked = 0;
    for (let slot = 0; slot < 300; slot++) for (const e of wavesOfSet(slot, c, DEFAULT_SET_PARAMS)) {
      const w = toActiveWave(e), T = (2 * Math.PI) / w.omega, ctx: WaveContext = { omega: w.omega, travelX: w.travelX, travelZ: w.travelZ };
      const crest = waveAt(0, 0, w.arrivalS, f, w, ctx).eta;
      expect(Math.abs(waveAt(0, 0, w.arrivalS + T, f, w, ctx).eta)).toBeLessThan(0.01 * crest);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
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
    const w = toActiveWave({ id: 1, slot: 0, indexInSet: 0, waveCount: 5, arrivalS: 42, heightM: 2.5, periodS: 14, fromDeg: 225, crestLengthM: 350, crestOffsetM: 10, gapS: Infinity, throwDraw: 0 });
    expect(w.omega).toBeCloseTo((2 * Math.PI) / 14, 12);
    expect(w.travelX).toBeCloseTo(Math.SQRT1_2, 9);
    expect(w.travelZ).toBeCloseTo(-Math.SQRT1_2, 9);
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

describe('ψ at the crest (barrel from the maths)', () => {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 12;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w = toActiveWave(big), t = w.arrivalS + sampleField(field, 0, 0).tau + 0.5;
  const crest = (wave = w, p = DEFAULT_BREAK_PARAMS) => crestAt(0, 0, t, sampleField(field, 0, 0), wave, ctx, breakOptions(field, p))!;
  it('past its envelope cutoff a wave is nothing, stage included (the GPU skips it there): 12 ft at the grid edge', () => {
    // The GPU's repro (breaker self-test "eases the crest", 12 ft, dt +20 s): the set's biggest wave passed (140, 297.25)
    // 19 s ago (envelope 1e-15), yet its crest lookup lands squarely on its crest 60 m on, where it has broken.
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
    // On the reef build's reef the repro's state (past the cutoff, the lookup on a broken crest) holds 24–26 s after the crest
    // passed there (plan 2026-10-02 Task 4; ~20 s on the softened ramp).
    const x = 140, z = field.grid.z0 + (field.grid.nz - 1) * field.grid.cellM - 2, f = sampleField(field, x, z), tt = w.arrivalS + f.tau + 25;
    expect(beyondEnvelope(phaseXi(x, z, tt, f, w, ctx), w)).toBe(true);
    const found = crestAt(x, z, tt, f, w, ctx, o)!;
    expect(found.s * found.confidence).toBeGreaterThan(0.9);
    expect(waveAt(x, z, tt, f, w, ctx, o)).toEqual({ eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, stage: 0, pile: 0 });
    // The cutoff's edges, either side of the crest.
    const T = (2 * Math.PI) / w.omega, tight = ENVELOPE_CUTOFF * ENVELOPE_WIDTH * T;
    expect(beyondEnvelope(0.99 * tight, w)).toBe(false);
    expect(beyondEnvelope(1.01 * tight, w)).toBe(true);
    expect(beyondEnvelope(-0.99 * tight, w)).toBe(false);
    expect(beyondEnvelope(-1.01 * tight, w)).toBe(true);
  });
  it("the crest carries ψ₀ × the game rules, and its own sheet params (the trough drain and surge at its ψ)", () => {
    const cr = crest();
    const on = rayCrestPoint(0, 0, t, sampleField(field, 0, 0), w, ctx); // crestAt reads the record on the point's own ray
    const rec = sampleOnset(field, on.x, on.z)!, psi0 = onsetPsi(rec, 0, w.heightM, DEFAULT_BREAK_PARAMS);
    expect(cr.psi).toBeCloseTo(psi0 * (w.drainFactor ?? 1), 9);
    expect(cr.params.troughDrain).toBe(sheetShape(cr.psi).troughDrain);
    expect(cr.params.pileSurge).toBe(sheetShape(cr.psi).pileSurge);
    expect(cr.params.gamma).toBe(DEFAULT_BREAK_PARAMS.gamma);
  });
  it('stacking close behind lowers ψ, a lull raises it', () => {
    const stack = crest({ ...w, drainFactor: drainFactor(0.3 * 15, 15) }).psi, lull = crest({ ...w, drainFactor: drainFactor(Infinity, 15) }).psi;
    expect(stack).toBeLessThan(lull);
  });
  it('the dial at 0 ignores the draw; at 0.15 a draw of 1 is ×1.15', () => {
    const a = crest({ ...w, throwDraw: 1 }).psi, b = crest({ ...w, throwDraw: 0 }).psi;
    expect(a).toBe(b);
    const on = crest({ ...w, throwDraw: 1 }, { ...DEFAULT_BREAK_PARAMS, randomDial: 0.15 }).psi;
    expect(on).toBeCloseTo(1.15 * b, 9);
  });
  it('a heavier ψ drains the water in front deeper', () => {
    // Where the 12 ft set breaks (on the softened ramp, ~130 m seaward of the peak, along its traced ray), half a second on.
    let bx = 0, bz = 0;
    for (let d = 0; d < 300; d++) {
      const f = sampleField(field, bx, bz), nx = bx - f.dirX, nz = bz - f.dirZ, r = sampleOnset(field, nx, nz);
      if (!r || onsetTime(r, 0, w.heightM, DEFAULT_BREAK_PARAMS) === null) break;
      bx = nx; bz = nz;
    }
    const fb = sampleField(field, bx, bz), tb = w.arrivalS + fb.tau + 0.5;
    const lowest = (o: BreakOptions) => {
      let m = Infinity;
      for (let u = 0; u <= 40; u += 0.5) { const x = bx + fb.dirX * u, z = bz + fb.dirZ * u; m = Math.min(m, sumWaves(x, z, tb, sampleField(field, x, z), [w], ctx, o).eta); }
      return m;
    };
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
    expect(lowest({ ...o, force: { psi: 0.09 } })).toBeLessThan(lowest({ ...o, force: { psi: 0.035 } }) - 0.3);
  });
  it('off the reef grid the crest reads ψ = PSI_NORMAL exactly', () => {
    const x = field.grid.x0 - 50, z = 0, f = sampleField(field, x, z);
    const far = crestAt(x, z, f.tau + w.arrivalS, f, w, ctx, breakOptions(field, DEFAULT_BREAK_PARAMS, 8));
    if (far) expect(far.psi).toBe(PSI_NORMAL);
  });
  it('force pins every crest to one ψ (tests and the drawings)', () => {
    expect(crestAt(0, 0, t, sampleField(field, 0, 0), w, ctx, { ...breakOptions(field, DEFAULT_BREAK_PARAMS), force: { psi: 0.04 } })!.psi).toBe(0.04);
  });
});

