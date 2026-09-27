import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { minRibbonHeight } from '../breaker/crestTrace';
import { computeReefField } from '../breaker/reefField';
import { fieldBreakingHeight } from '../breaker/setWaveModel';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import {
  DEFAULT_SPRAY_PARAMS, type EmitterInput, SPRAY_BIRTH_CAP, SPRAY_RATE, SPRAY_SPACING_M, normalizeSprayParams, offshoreFactor, rand01, sprayBirths,
  sprayEmitters, sprayReplayTicks, windToVector,
} from './sprayEmitters';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const OFFSHORE = { speedMs: 22 / 3.6, fromDeg: 57 };
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, DEFAULT_BREAK_PARAMS), DEFAULT_BREAK_PARAMS);
const input = (t: number, over: Partial<EmitterInput> = {}): EmitterInput => ({
  field, ctx, events: wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), t, params: DEFAULT_BREAK_PARAMS,
  minHeightM: MIN_H, wind: OFFSHORE, tideM: 0, amount: 1, ...over,
});
/** A time in the barrel: the biggest wave of set 1, 0.6 s after it reaches the peak (its lip is throwing). */
const T_THROW = BIGGEST.arrivalS + 0.6;

describe('the offshore wind factor', () => {
  it('bearings: wind from the north blows toward +z (south); from the east, toward −x (west)', () => {
    const [nx, nz] = windToVector(0);
    expect(nx).toBeCloseTo(0, 9);
    expect(nz).toBeCloseTo(1, 9);
    const [ex, ez] = windToVector(90);
    expect(ex).toBeCloseTo(-1, 9);
    expect(ez).toBeCloseTo(0, 9);
  });
  it('the wind factor follows the offshore component (none when calm, onshore or cross-shore; full from 6 m/s offshore)', () => {
    const nx = Math.SQRT1_2, nz = -Math.SQRT1_2; // travelling north-east
    expect(offshoreFactor({ speedMs: 10, fromDeg: 45 }, nx, nz)).toBeCloseTo(1, 9); // from the NE, against the waves
    expect(offshoreFactor({ speedMs: 0.5, fromDeg: 45 }, nx, nz)).toBe(0); // calm
    expect(offshoreFactor({ speedMs: 10, fromDeg: 225 }, nx, nz)).toBe(0); // onshore
    expect(offshoreFactor({ speedMs: 10, fromDeg: 135 }, nx, nz)).toBeLessThan(1e-6); // cross-shore
    expect(offshoreFactor({ speedMs: 22 / 3.6, fromDeg: 57 }, nx, nz)).toBeGreaterThan(0.9); // the reference offshore
    expect(offshoreFactor({ speedMs: 3.5, fromDeg: 45 }, nx, nz)).toBeCloseTo(0.5, 9); // halfway up the ramp
  });
});

describe('the emitters', () => {
  it('while a wave throws, emitters sit on its lip: mid-throw stations only, 1.5 m apart, between the trough and the crest', () => {
    const e = sprayEmitters(input(T_THROW));
    expect(e.length).toBeGreaterThan(3);
    for (const x of e) {
      expect(x.strength).toBeGreaterThan(0);
      expect(x.strength).toBeLessThanOrEqual(1);
      // Near landing the tip falls to the trough (it can be at the water): a sane band, not 'above the surface'.
      expect(x.y).toBeGreaterThan(-2);
      expect(x.y).toBeLessThan(6);
    }
    const byWave = new Map<number, number[]>();
    for (const x of e) byWave.set(x.waveId, [...(byWave.get(x.waveId) ?? []), x.arc]);
    for (const arcs of byWave.values()) {
      arcs.sort((a, b) => a - b);
      for (let i = 1; i < arcs.length; i++) expect(arcs[i] - arcs[i - 1]).toBeGreaterThanOrEqual(1);
    }
  });
  it('none before the break, none long after it', () => {
    // Earlier waves of the same set break then: only the biggest wave's own emitters are counted.
    expect(sprayEmitters(input(BIGGEST.arrivalS - 20)).filter((x) => x.waveId === BIGGEST.id)).toEqual([]);
    // The left peels on down the ledge and the section throws again over the shallows until about +9 s (measured).
    expect(sprayEmitters(input(BIGGEST.arrivalS + 12)).filter((x) => x.waveId === BIGGEST.id)).toEqual([]);
  });
  it('no emitters without a field, waves, breaking or amount', () => {
    expect(sprayEmitters(input(T_THROW, { field: null }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { ctx: null }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { events: [] }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { amount: 0 }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { params: { ...DEFAULT_BREAK_PARAMS, enabled: false } }))).toEqual([]);
  });
  it('no emitters on a glassy day or in an onshore wind', () => {
    expect(sprayEmitters(input(T_THROW, { wind: { speedMs: 0, fromDeg: 57 } }))).toEqual([]);
    expect(sprayEmitters(input(T_THROW, { wind: { speedMs: 8, fromDeg: 237 } }))).toEqual([]);
  });
  it('emitters do not depend on the call (deterministic)', () => {
    expect(sprayEmitters(input(T_THROW))).toEqual(sprayEmitters(input(T_THROW)));
  });
});

describe('the births', () => {
  const e = () => sprayEmitters(input(T_THROW));
  it('about SPRAY_RATE × spacing × Δ × strength per emitter per tick, deterministic per tick', () => {
    const k = Math.round(T_THROW * 20);
    const em = e();
    const a = sprayBirths(em, k, DEFAULT_SPRAY_PARAMS), b = sprayBirths(em, k, DEFAULT_SPRAY_PARAMS);
    expect(a).toEqual(b);
    const expected = em.reduce((s, x) => s + x.strength * SPRAY_RATE * SPRAY_SPACING_M * 0.05, 0);
    let total = 0;
    for (let kk = k; kk < k + 40; kk++) total += sprayBirths(em, kk, DEFAULT_SPRAY_PARAMS).length;
    expect(total / 40).toBeGreaterThan(expected * 0.7);
    expect(total / 40).toBeLessThan(expected * 1.3 + 1);
  });
  it('births start at their emitter, rise, and live sprayLife × 0.6–1.2', () => {
    const k = Math.round(T_THROW * 20);
    const em = e();
    for (const b of sprayBirths(em, k, DEFAULT_SPRAY_PARAMS)) {
      expect(em.some((x) => Math.hypot(b.x - x.x, b.z - x.z) <= SPRAY_SPACING_M / 2 + 1e-6 && b.y >= x.y - 1e-9 && b.y <= x.y + 0.3 + 1e-9)).toBe(true);
      expect(b.vy).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(b.vy).toBeLessThanOrEqual(5 + 1e-9);
      expect(b.life).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(b.life).toBeLessThanOrEqual(2.4 + 1e-9);
      expect(b.strength).toBeLessThanOrEqual(1);
    }
  });
  it('emitters are 3 m apart (the cost lever) and births scatter half a spacing either side, so the veil stays continuous', () => {
    expect(SPRAY_SPACING_M).toBe(3);
    const one = [{ x: 0, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 1, waveId: 1, arc: 0 }];
    let widest = 0;
    for (let k = 0; k < 200; k++) for (const b of sprayBirths(one, k, DEFAULT_SPRAY_PARAMS)) widest = Math.max(widest, Math.abs(b.z));
    expect(widest).toBeGreaterThan(0.8 * SPRAY_SPACING_M / 2);
    expect(widest).toBeLessThanOrEqual(SPRAY_SPACING_M / 2 + 1e-9);
  });
  it('births never exceed the per-tick cap (amount 3 on a long section)', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 3, waveId: 1, arc: i }));
    const b = sprayBirths(many, 7, DEFAULT_SPRAY_PARAMS);
    expect(b.length).toBe(SPRAY_BIRTH_CAP);
    expect(sprayBirths(many, 7, DEFAULT_SPRAY_PARAMS)).toEqual(b);
  });
  it('rand01 is in [0, 1) and differs per argument', () => {
    const v = [rand01(1, 2, 3, 4), rand01(1, 2, 3, 5), rand01(-7, 2, 3, 4), rand01(1, 9, 3, 4)];
    for (const x of v) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    expect(new Set(v).size).toBe(4);
  });
  it('params clamp into the slider ranges, and a replay covers the longest life plus 0.5 s', () => {
    const p = { amount: 9, lifeS: 0.1 };
    normalizeSprayParams(p);
    expect(p).toEqual({ amount: 3, lifeS: 0.8 });
    expect(sprayReplayTicks(2)).toBe(58);
    expect(sprayReplayTicks(4)).toBe(106);
  });
});
