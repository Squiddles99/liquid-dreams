import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { minRibbonHeight } from '../breaker/crestTrace';
import { computeReefField } from '../breaker/reefField';
import { fieldBreakingHeight } from '../breaker/setWaveModel';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { IMPACT_KIND } from './particleKinds';
import { SprayPool, birthInto, stepPool } from './sprayStep';
import {
  DEFAULT_SPRAY_PARAMS, type EmitterInput, IMPACT_MAX_LIFE_S, SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, breakEmitters, impactBirths, sprayCanEmit, SPRAY_RATE, SPRAY_SPACING_M, normalizeSprayParams, offshoreFactor, rand01, sprayBirths,
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
  it('while a wave throws, emitters sit on its lip: mid-throw stations only, one per spacing, between the trough and the crest', () => {
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
    const one = [{ x: 0, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 1, lip: 1, waveId: 1, arc: 0 }];
    let widest = 0;
    for (let k = 0; k < 200; k++) for (const b of sprayBirths(one, k, DEFAULT_SPRAY_PARAMS)) widest = Math.max(widest, Math.abs(b.z));
    expect(widest).toBeGreaterThan(0.8 * SPRAY_SPACING_M / 2);
    expect(widest).toBeLessThanOrEqual(SPRAY_SPACING_M / 2 + 1e-9);
  });
  it('the wind and the amount set how many puffs are born, not how opaque each is (strength applied once; final review I1)', () => {
    const at = (strength: number, lip: number) => [{ x: 0, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength, lip, waveId: 1, arc: 0 }];
    let weak = 0, strong = 0;
    for (let k = 0; k < 400; k++) {
      const w = sprayBirths(at(0.3, 1), k, DEFAULT_SPRAY_PARAMS), s = sprayBirths(at(1, 1), k, DEFAULT_SPRAY_PARAMS);
      weak += w.length; strong += s.length;
      for (const b of [...w, ...s]) expect(b.strength).toBe(1); // opacity follows the lip only
    }
    expect(weak / strong).toBeGreaterThan(0.25);
    expect(weak / strong).toBeLessThan(0.35);
    for (let k = 0; k < 50; k++) for (const b of sprayBirths(at(2, 0.4), k, DEFAULT_SPRAY_PARAMS)) expect(b.strength).toBeCloseTo(0.4, 12);
  });
  it('births never exceed the per-tick cap (amount 3 on a long section)', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 3, lip: 1, waveId: 1, arc: i }));
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
    expect(sprayReplayTicks(4)).toBe(SPRAY_HISTORY_TICKS); // capped at the pool's history (final review I2)
  });
});

describe('the impact explosion', () => {
  const imp = (t: number, over: Partial<EmitterInput> = {}) => breakEmitters(input(t, { impactAmount: 1, ...over })).impact.filter((e) => e.waveId === BIGGEST.id);
  it('impact emitters only in the landing window: none before the lip lands, none long after', () => {
    const counts = [-1, 0, 0.3, 0.6, 0.9, 1.2, 1.6, 2, 3, 5].map((dt) => imp(BIGGEST.arrivalS + dt).length);
    expect(Math.max(...counts)).toBeGreaterThan(3);
    expect(counts[0]).toBe(0);
    expect(imp(BIGGEST.arrivalS + 12).length).toBe(0);
  });
  it('impact happens with no wind (a glassy day still explodes) while the spray does not', () => {
    let any = 0;
    for (const dt of [0.3, 0.6, 0.9, 1.2, 1.6, 2, 3]) {
      const r = breakEmitters(input(BIGGEST.arrivalS + dt, { impactAmount: 1, wind: { speedMs: 0, fromDeg: 57 } }));
      expect(r.spray).toEqual([]);
      any += r.impact.length;
    }
    expect(any).toBeGreaterThan(0);
  });
  it('an explosion throws higher for a bigger wave', () => {
    const one = (H: number) => ({ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H, strength: 1, lip: 1, waveId: 1, arc: 0 });
    const meanVy = (H: number) => { let s = 0, n = 0; for (let k = 0; k < 200; k++) for (const b of impactBirths([one(H)], k)) { s += b.vy; n++; } return s / n; };
    expect(meanVy(3)).toBeGreaterThan(meanVy(1) * 1.4);
  });
  it('impact births are capped, deterministic and salted apart from the spray', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ x: i, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, strength: 3, lip: 1, waveId: 1, arc: i }));
    const a = impactBirths(many, 9);
    expect(a.length).toBe(SPRAY_BIRTH_CAP);
    expect(impactBirths(many, 9)).toEqual(a);
    const s = sprayBirths(many, 9, DEFAULT_SPRAY_PARAMS);
    expect(a[0].z).not.toBeCloseTo(s[0].z, 9); // the scatter runs along (−nz, nx) = z here
    for (const b of a) { expect(b.life).toBeGreaterThanOrEqual(1.3); expect(b.life).toBeLessThanOrEqual(IMPACT_MAX_LIFE_S); }
  });
  it('the spray is what it was when impact is off (sprayEmitters unchanged)', () => {
    expect(breakEmitters(input(BIGGEST.arrivalS + 0.6)).spray).toEqual(sprayEmitters(input(BIGGEST.arrivalS + 0.6)));
    expect(breakEmitters(input(BIGGEST.arrivalS + 0.6)).impact).toEqual([]);
  });
});

describe('the impact explosion falls back (final review I1)', () => {
  it('most puffs are back below their launch height before they die, not fading out at the top of the throw', () => {
    const e = [{ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, strength: 1, lip: 1, waveId: 1, arc: 0 }];
    let below = 0, n = 0;
    for (let k = 0; k < 400; k++) for (const b of impactBirths(e, k)) {
      const pool = new SprayPool(SPRAY_BIRTH_CAP);
      birthInto(pool, 0, [b]);
      while (pool.posAge[3] < pool.velLife[3]) stepPool(pool, 0, 0, IMPACT_KIND);
      n++;
      if (pool.posAge[1] < b.y) below++;
      expect(b.life).toBeLessThanOrEqual(IMPACT_MAX_LIFE_S);
    }
    expect(n).toBeGreaterThan(200);
    expect(below / n).toBeGreaterThan(0.85);
  });
});

describe('the spray can emit (final review: calm-day replays)', () => {
  it('only with a spray amount and more than a calm wind', () => {
    expect(sprayCanEmit(1, 6)).toBe(true);
    expect(sprayCanEmit(0, 6)).toBe(false);
    expect(sprayCanEmit(1, 0.5)).toBe(false);
    expect(sprayCanEmit(1, 1)).toBe(false);
  });
});
