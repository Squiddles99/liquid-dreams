import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { GRAVITY } from '../ocean/spectrum';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { flowAt, flowCap, flowFromEta, flowGain } from './flow';
import { computeReefField, sampleField } from './reefField';
import { breakOptions, toActiveWave } from './setWaveModel';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
const BED_Y = 0.5; // the kelp reads the flow 0.5 m above the bed

/** The near-bed flow along the local ray (+ shoreward) at the peak, every 0.1 s around the biggest wave of set 1. */
function peakSeries(ft: number): { along: number; dt: number }[] {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell = { sizeFt: ft, periodS: 15, directionDeg: 225 };
  c.tideM = 0;
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const f = sampleField(field, 0, 0);
  const out: { along: number; dt: number }[] = [];
  for (let dt = -20; dt <= 20; dt += 0.1) {
    const t = big.arrivalS + dt;
    const u = flowAt(0, 0, -f.depth + BED_Y, t, f, wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave), ctx, o);
    out.push({ along: u.ux * f.dirX + u.uz * f.dirZ, dt });
  }
  return out;
}

describe('the flow under the waves (spec §4.1)', () => {
  it('still water: exactly zero', () => {
    const f = sampleField(field, 0, 0);
    expect(flowAt(0, 0, -3, 100, f, [], ctx, o)).toEqual({ ux: 0, uz: 0, eta: 0 });
    expect(flowFromEta(0, f, field.omega, -3)).toEqual({ ux: 0, uz: 0 });
  });
  it('runs along the local ray: shoreward under a crest (η > 0), seaward under a trough (η < 0)', () => {
    const f = sampleField(field, 0, 0);
    const up = flowFromEta(1, f, field.omega, -f.depth), down = flowFromEta(-1, f, field.omega, -f.depth);
    expect(up.ux * f.dirX + up.uz * f.dirZ).toBeGreaterThan(0);
    expect(down.ux * f.dirX + down.uz * f.dirZ).toBeLessThan(0);
    expect(Math.abs(up.ux * f.dirZ - up.uz * f.dirX)).toBeLessThan(1e-9); // no cross-ray part
  });
  it('slower at the bed than at the surface; the shallow-water limit is c·η/h', () => {
    const w = field.omega;
    expect(flowGain(w, 0.05, 10, -10)).toBeLessThan(flowGain(w, 0.05, 10, 0));
    const h = 2, k = 0.01; // kh = 0.02: shallow
    expect(flowGain(w, k, h, -h)).toBeCloseTo(w / (k * h), 2);
  });
  it('capped at √(g·(h + η)), and finite at zero depth or wavenumber (Review Focus 2)', () => {
    expect(flowCap(6, 1)).toBeCloseTo(Math.sqrt(GRAVITY * 7), 9);
    const f = { k: 0.056, dirX: 1, dirZ: 0, depth: 6 };
    expect(flowFromEta(50, f, 0.42, -6).ux).toBeCloseTo(Math.sqrt(GRAVITY * 56), 6);
    for (const g of [{ k: 0, dirX: 1, dirZ: 0, depth: 6 }, { k: 0.05, dirX: 1, dirZ: 0, depth: 0 }, { k: 0, dirX: 1, dirZ: 0, depth: 0 }]) {
      const u = flowFromEta(-0.3, g, 0.42, -1);
      expect(Number.isFinite(u.ux) && Number.isFinite(u.uz)).toBe(true);
    }
  });
  it('the background swell adds its own flow (deep water, where the FFT long swell runs)', () => {
    const f = sampleField(field, -300, 0);
    const u = flowAt(-300, 0, -f.depth + BED_Y, 100, f, [], ctx, o, 0.8);
    expect(u.eta).toBeCloseTo(0.8, 9);
    expect(u.ux * f.dirX + u.uz * f.dirZ).toBeGreaterThan(0);
  });
  it('12 ft at the peak: the draw runs 3–8 m/s seaward before the crest, then shoreward under it', () => {
    const s = peakSeries(12);
    const draw = s.reduce((a, b) => (b.along < a.along ? b : a));
    const shove = s.reduce((a, b) => (b.along > a.along ? b : a));
    expect(-draw.along).toBeGreaterThanOrEqual(3);
    expect(-draw.along).toBeLessThanOrEqual(8);
    expect(shove.along).toBeGreaterThan(-draw.along * 0.8);
  });
  it('4 ft at the peak: the draw runs 1–2.5 m/s seaward', () => {
    const s = peakSeries(4);
    const draw = Math.min(...s.map((p) => p.along));
    expect(-draw).toBeGreaterThanOrEqual(1);
    expect(-draw).toBeLessThanOrEqual(2.5);
  });
});
