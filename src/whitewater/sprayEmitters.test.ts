import { describe, expect, it } from 'vitest';
import { smoothstep } from '../math/smoothstep';
import { DEFAULT_BREAK_PARAMS } from '../breaker/breaking';
import { minRibbonHeight, timeSinceOnset, traceStations } from '../breaker/crestTrace';
import { computeReefField, sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { STOOD_PHASE, sectionFrame, shoulderRegion, wallWeight } from '../breaker/wombSection';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../swell/sets';
import { IMPACT_KIND } from './particleKinds';
import { FOAM_TICK_S } from './foamStep';
import { SprayPool, birthInto, stepPool } from './sprayStep';
import {
  DEFAULT_SPRAY_PARAMS, type EmitterInput, IMPACT_MAX_LIFE_S, SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, breakEmitters, impactBirths, impactKick, inImpactWindow, IMPACT_DELAY_S, IMPACT_WINDOW_S, sprayCanEmit, SPRAY_RATE, SPRAY_SPACING_M, normalizeSprayParams, offshoreFactor, rand01, sprayBirths,
  spitBirths, sprayEmitters, sprayReplayTicks, windToVector, plumeBirths, PLUME_WIND_MS, PLUME_LIFE_S, offshoreSpeedOn, sprayAndPlumeBirths, SPIT_WIND_SHARE, FEATHER_FLOOR, FEATHER_WIND_MS, FEATHER_LIFE_S, FEATHER_RATE, featherBirths, standingCrestY,
  featherStrength, FEATHER_FRAME_REACH_M, FEATHER_LIFT_A, spitMouths, SPIT_PULSE_S, SPIT_MAX_SPEED_MS, spitEvents, type MouthSummary, SPIT_BURST_TICKS, SPIT_TRAPPED_CAP_M3,
} from './sprayEmitters';
import { ERODING_KINDS, FEATHER_KIND, KIND_INDEX, PARTICLE_KINDS, PLUME_KIND, SPIT_KIND } from './particleKinds';

const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const BIGGEST = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
/** The time the checks count from: the wave's first break anywhere on the reef (a section's crest arrival less its time
 * since onset, the earliest over the whole reef grid) plus the 0.9 s the peak broke before reaching (0, 0) on the old
 * ledge, where it broke first. On the softened ramp (barrel-from-maths plan, Task 5) the biggest default wave breaks ~45 m
 * seaward, seconds before it reaches the peak, and sections west and north of the peak's ray break up to 2 s before it. */
const BREAKS = ((): { first: number; last: number } => {
  const w = toActiveWave(BIGGEST);
  let first = Infinity, last = -Infinity;
  const g = field.grid;
  for (let x = g.x0; x <= g.x0 + (g.nx - 1) * g.cellM; x += 5) for (let z = g.z0; z <= g.z0 + (g.nz - 1) * g.cellM; z += 5) {
    const tb = timeSinceOnset(field, w, x, z, ctx, DEFAULT_BREAK_PARAMS);
    if (tb !== null) { const t = w.arrivalS + sampleField(field, x, z).tau - tb; first = Math.min(first, t); last = Math.max(last, t); }
  }
  return { first, last };
})();
const BREAK_CLOCK = BREAKS.first + 0.9;
/** Long after: 5 s past the last section's break (on the old ledge the check stood 12 s after the peak's arrival, ~5 s
 * past the north ledge's last break; on the ramp the wave breaks along its crest for ~18 s). */
const LONG_AFTER = BREAKS.last + 5;
const OFFSHORE = { speedMs: 22 / 3.6, fromDeg: 57 };
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, DEFAULT_BREAK_PARAMS), DEFAULT_BREAK_PARAMS);
const input = (t: number, over: Partial<EmitterInput> = {}): EmitterInput => ({
  field, ctx, events: wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS), t, params: DEFAULT_BREAK_PARAMS,
  minHeightM: MIN_H, wind: OFFSHORE, tideM: 0, amount: 1, ...over,
});
/** A time in the barrel: the biggest wave of set 1, 3 s after it reaches the tip, its lip throwing on the left's first
 * 20 m (8 emitters). Was +0.6 s, the old peak's throw; on the real shelf (shelf-polish Task 4 (c)) the right closes out north
 * to the tip before the arrival and the left throws from +2 s: at +0.6 s the line is between the two (2 emitters;
 * tools/_sprayThrow.ts). */
const T_THROW = BIGGEST.arrivalS + 3.0;

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
  // Onshore now makes a veil blown forward over the face (whitewater §4's table): 'onshore: a veil blown forward' below.
  it('no emitters on a glassy day', () => {
    expect(sprayEmitters(input(T_THROW, { wind: { speedMs: 0, fromDeg: 57 } }))).toEqual([]);
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
    const one = [{ x: 0, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 1, lip: 1, waveId: 1, arc: 0, wOff: 6, yWater: 0, A: 10 }];
    let widest = 0;
    for (let k = 0; k < 200; k++) for (const b of sprayBirths(one, k, DEFAULT_SPRAY_PARAMS)) widest = Math.max(widest, Math.abs(b.z));
    expect(widest).toBeGreaterThan(0.8 * SPRAY_SPACING_M / 2);
    expect(widest).toBeLessThanOrEqual(SPRAY_SPACING_M / 2 + 1e-9);
  });
  it('the wind and the amount set how many puffs are born, not how opaque each is (strength applied once; final review I1)', () => {
    const at = (strength: number, lip: number) => [{ x: 0, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength, lip, waveId: 1, arc: 0, wOff: 6, yWater: 0, A: 10 }];
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
    const many = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 1, z: 0, vx: 5, vz: 0, nx: 1, nz: 0, strength: 3, lip: 1, waveId: 1, arc: i, wOff: 6, yWater: 0, A: 10 }));
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
    const p = { amount: 9, lifeS: 0.1, plume: 7 };
    normalizeSprayParams(p);
    expect(p).toEqual({ amount: 3, lifeS: 0.8, plume: 3 });
    expect(sprayReplayTicks(2)).toBe(58);
    expect(sprayReplayTicks(4)).toBe(SPRAY_HISTORY_TICKS); // capped at the pool's history (final review I2)
  });
});

describe('the impact explosion', () => {
  const imp = (t: number, over: Partial<EmitterInput> = {}) => breakEmitters(input(t, { impactAmount: 1, ...over })).impact.filter((e) => e.waveId === BIGGEST.id);
  it('impact emitters only in the landing window: none before the lip lands, none long after', () => {
    const counts = [-1, 0, 0.3, 0.6, 0.9, 1.2, 1.6, 2, 3, 5].map((dt) => imp(BREAK_CLOCK + dt).length);
    // The peak's landing on the reef build's face throws 2 emitters at its busiest with the dial set by the face (the default
    // 4 ft lip is shorter; 3 before it, 4 on the softened ramp; plan 2026-10-02).
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(2);
    expect(counts[0]).toBe(0);
    expect(imp(LONG_AFTER).length).toBe(0);
  });
  it('the burst waits IMPACT_DELAY_S after the lip lands (photo 5: the curtain lands, then the explosion)', () => {
    expect(IMPACT_DELAY_S).toBe(0.2);
    expect(inImpactWindow(10.1, 10)).toBe(false);
    expect(inImpactWindow(10.3, 10)).toBe(true);
    expect(inImpactWindow(10 + IMPACT_DELAY_S + IMPACT_WINDOW_S + 0.01, 10)).toBe(false);
    expect(inImpactWindow(9.9, 10)).toBe(false);
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
  it('a pitching lip bursts twice as high as a crumbling one (the surge, whitewater §3.1): kick × √2', () => {
    expect(impactKick(2, 1) / impactKick(2, 0)).toBeCloseTo(Math.SQRT2, 12);
    const one = (hollow: number) => ({ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, hollow, strength: 1, lip: 1, waveId: 1, arc: 0 });
    const a = impactBirths([one(0)], 5), b = impactBirths([one(1)], 5);
    expect(b.length).toBe(a.length);
    expect(a.length).toBeGreaterThan(0);
    for (let j = 0; j < a.length; j++) expect(b[j].vy).toBeGreaterThan(a[j].vy);
  });
  it('an explosion throws higher for a bigger wave', () => {
    const one = (H: number) => ({ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H, hollow: 0, strength: 1, lip: 1, waveId: 1, arc: 0 });
    const meanVy = (H: number) => { let s = 0, n = 0; for (let k = 0; k < 200; k++) for (const b of impactBirths([one(H)], k)) { s += b.vy; n++; } return s / n; };
    expect(meanVy(3)).toBeGreaterThan(meanVy(1) * 1.4);
  });
  it('impact births are capped, deterministic and salted apart from the spray', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ x: i, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, hollow: 0, strength: 3, lip: 1, waveId: 1, arc: i }));
    const a = impactBirths(many, 9);
    expect(a.length).toBe(SPRAY_BIRTH_CAP);
    expect(impactBirths(many, 9)).toEqual(a);
    const s = sprayBirths(many.map((e) => ({ ...e, wOff: 6, yWater: 0, A: 10 })), 9, DEFAULT_SPRAY_PARAMS);
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
    const e = [{ x: 0, y: 0, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, H: 2, hollow: 0, strength: 1, lip: 1, waveId: 1, arc: 0 }];
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

import { BOMBIE_X, BOMBIE_Z } from '../bombie/bombieModel';
import { SPIT_THROW_SHARE, bombieImpactEmitters } from './sprayEmitters';
describe('the Bombie’s spray (4c-3)', () => {
  it('fires along the burst line for its first 1.5 s, sized by the wave and the size slider, and never after', () => {
    const b = { n: 40, ageS: 0.5, heightM: 3 };
    const e = bombieImpactEmitters(b, 30, 0, 1);
    expect(e.length).toBe(11); // a station every 3 m across 30 m
    for (const s of e) {
      expect(Math.hypot(s.x - BOMBIE_X, s.z - BOMBIE_Z)).toBeLessThanOrEqual(15.01);
      expect(s.H).toBeGreaterThanOrEqual(3);
      expect(s.H).toBeLessThanOrEqual(10);
    }
    expect(impactBirths(e, 1234).length).toBeGreaterThan(0);
    expect(bombieImpactEmitters({ ...b, ageS: 1.6 }, 30, 0, 1)).toEqual([]);
    expect(bombieImpactEmitters(null, 30, 0, 1)).toEqual([]);
    expect(bombieImpactEmitters(b, 30, 0, 2)[0].H).toBeGreaterThan(e[0].H);
  });
});

describe("the barrel's spit is an event (Andrew's amendment 2026-10-15, breaking-look item 5)", () => {
  const mouth = (waveId: number, openM: number): MouthSummary => ({ waveId, openM, x: 1, y: 2, z: 3, dx: 0, dz: 1, nx: 1, nz: 0, A: 3, radius: 0.72, speed: 12 });
  const series = (opens: number[]) => (j: number): MouthSummary[] => (j >= 0 && j < opens.length && opens[j] >= 0 ? [mouth(7, opens[j])] : []);
  it('a running barrel spits nothing: a steady (or growing) open tube gives no events', () => {
    const at = series(Array.from({ length: 80 }, (_, j) => 12 + j * 0.3));
    for (let k = 0; k < 80; k++) expect(spitEvents(k, at, 1)).toEqual([]);
  });
  it('one closure, one burst: SPIT_BURST_TICKS (0.6 s) from the tick the open width fell >= 50 %, strength from the trapped volume', () => {
    const opens = [...Array(30).fill(24), ...Array(30).fill(0)];
    const at = series(opens), fired: number[] = [];
    for (let k = 0; k < 60; k++) if (spitEvents(k, at, 1).length) fired.push(k);
    expect(fired[0]).toBe(30);
    expect(fired.length).toBe(SPIT_BURST_TICKS);
    expect(SPIT_BURST_TICKS * FOAM_TICK_S).toBeLessThanOrEqual(0.6 + 1e-9);
    const e = spitEvents(31, at, 1)[0];
    expect(e.strength).toBeCloseTo(Math.min(1, (0.72 * 0.72 * 24) / SPIT_TRAPPED_CAP_M3), 9);
    expect(spitEvents(31, at, 0)).toEqual([]);
  });
  it('a fast narrowing (>= 50 % within 0.5 s) is a closure too; a slow one is not', () => {
    const fast = series([...Array(20).fill(30), 22, 14, 8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
    expect(Array.from({ length: 40 }, (_, k) => spitEvents(k, fast, 1).length).some((n) => n > 0)).toBe(true);
    const slow = series(Array.from({ length: 80 }, (_, j) => 30 - j * 0.2));
    for (let k = 0; k < 80; k++) expect(spitEvents(k, slow, 1)).toEqual([]);
  });
  it('the bar: 7 ft 270/14 tide 0.5 (the test bathymetry), over the biggest wave run the spit fires in <= 2 bursts, none while the open width is steady', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 7; c.swell.periodS = 14; c.swell.directionDeg = 270; c.tideM = 0.5;
    const f7 = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 14, fromDeg: 270, tideM: 0.5 });
    const ctx7 = { omega: f7.omega, travelX: f7.far.dirX, travelZ: f7.far.dirZ };
    const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((p, q) => (q.heightM > p.heightM ? q : p)), w = toActiveWave(big);
    let first = Infinity;
    for (let x = f7.grid.x0; x <= f7.grid.x0 + (f7.grid.nx - 1) * f7.grid.cellM; x += 5) for (let z = f7.grid.z0; z <= f7.grid.z0 + (f7.grid.nz - 1) * f7.grid.cellM; z += 5) {
      const tb = timeSinceOnset(f7, w, x, z, ctx7, DEFAULT_BREAK_PARAMS);
      if (tb !== null) first = Math.min(first, w.arrivalS + sampleField(f7, x, z).tau - tb);
    }
    const minH = minRibbonHeight(fieldBreakingHeight(f7, DEFAULT_BREAK_PARAMS), DEFAULT_BREAK_PARAMS);
    const k0 = Math.floor((first - 1) / FOAM_TICK_S), k1 = Math.ceil((first + 20) / FOAM_TICK_S);
    const cache = new Map<number, MouthSummary[]>();
    for (let k = k0; k <= k1; k++) {
      const t = k * FOAM_TICK_S;
      cache.set(k, breakEmitters({ field: f7, ctx: ctx7, events: wavesNear(t, c, DEFAULT_SET_PARAMS), t, params: DEFAULT_BREAK_PARAMS, minHeightM: minH, wind: { speedMs: 0, fromDeg: 57 }, tideM: 0.5, amount: 1, impactAmount: 1 }).mouths.filter((m) => m.waveId === big.id));
    }
    const at = (j: number) => cache.get(j) ?? [];
    let bursts = 0, prev = false;
    for (let k = k0; k <= k1; k++) {
      const firing = spitEvents(k, at, 1).length > 0;
      if (firing && !prev) bursts++;
      prev = firing;
    }
    expect(bursts).toBeGreaterThan(0);
    expect(bursts).toBeLessThanOrEqual(2);
  }, 120_000);
  it('spit births jet out along their direction, capped and deterministic', () => {
    const one = { x: 0, y: 1, z: 0, dx: 0, dz: 1, speed: 15, nx: 1, nz: 0, radius: 1.5, strength: 1, lip: 1, waveId: 1, arc: 0, A: 10 };
    let along = 0, up = 0, n = 0;
    for (let k = 0; k < 100; k++) for (const b of spitBirths([one], k)) { along += b.vz; up += Math.abs(b.vy); n++; }
    expect(n).toBeGreaterThan(50);
    expect(along / n).toBeGreaterThan(10);
    expect(up / n).toBeLessThan(0.3 * (along / n));
    expect(spitBirths([one], 7)).toEqual(spitBirths([one], 7));
    expect(spitBirths(Array.from({ length: 400 }, (_, i) => ({ ...one, arc: i, strength: 3 })), 3).length).toBeLessThanOrEqual(SPRAY_BIRTH_CAP);
  });
});

describe('the plume, the veil and the spit under wind (whitewater §4.1, §4.3)', () => {
  const tip = (wOff: number, strength = 1) => ({ x: 0, y: 2, z: 0, vx: 6, vz: 0, nx: 1, nz: 0, strength, lip: 1, waveId: 7, arc: 3, wOff, yWater: 0.4, A: 10 });
  const plumeStrength = (wOff: number): number => {
    let n = 0;
    for (let k = 0; k < 400; k++) n += plumeBirths([tip(wOff)], k, DEFAULT_SPRAY_PARAMS).length;
    return n;
  };
  it('no plume under 3 m/s offshore; full at 9 (smoothstep over PLUME_WIND_MS)', () => {
    expect(PLUME_WIND_MS).toEqual([3, 9]);
    expect(plumeStrength(2.9)).toBe(0);
    expect(plumeStrength(9)).toBeGreaterThan(0);
    expect(plumeStrength(12)).toBe(plumeStrength(9));
    expect(plumeStrength(6)).toBeLessThan(plumeStrength(9));
    expect(plumeStrength(-6)).toBe(0); // onshore: none
  });
  it('a plume puff is the plume kind, born at the tip, lifted by the updraft and blown back over the crest; it knows its water', () => {
    const b = Array.from({ length: 40 }, (_, k) => plumeBirths([tip(9)], k, DEFAULT_SPRAY_PARAMS)).flat();
    expect(b.length).toBeGreaterThan(0);
    for (const p of b) {
      expect(p.kind).toBe(KIND_INDEX.plume);
      expect(p.yWater).toBe(0.4);
      expect(p.vy).toBeGreaterThan(0);
      // Back over the crest: against the crest normal (+x) once the throw's 0.6 × 6 m/s is outweighed by 0.4 × 9.
      expect(p.vx).toBeLessThan(0.6 * 6 + 1.5);
      expect(p.life).toBeGreaterThanOrEqual(PLUME_LIFE_S[0]);
      expect(p.life).toBeLessThanOrEqual(PLUME_LIFE_S[1]);
    }
  });
  it('the plume kind: dense, long-lived, slow to settle, glowing backlit; spit denser (KIND_LOOK since womb-realism Task 5)', () => {
    expect(PLUME_KIND).toMatchObject({ dragTauS: 1 / 0.8, gravityMs2: 0.3, sizeM: [1, 2.5], opacity: 0.8, isotropic: 0.7, backDriftShare: 0.7 });
    expect(SPIT_KIND).toMatchObject({ gravityMs2: 0, sizeM: [0.4, 1], opacity: 0.7, backDriftShare: 0 });
    expect(KIND_INDEX).toEqual({ spray: 0, plume: 1, impact: 2, spit: 3, feather: 4, spitCloud: 5 }); // + the spit's cloud (breaking-look item 5)
    expect(PARTICLE_KINDS[KIND_INDEX.feather]).toBe(FEATHER_KIND);
    expect(PARTICLE_KINDS[KIND_INDEX.plume]).toBe(PLUME_KIND);
    expect(PARTICLE_KINDS[KIND_INDEX.spit]).toBe(SPIT_KIND);
  });
  it('a glassy day makes no veil and no plume, anywhere along the breaking set', () => {
    const glassy = { speedMs: 1 * 0.5144, fromDeg: 57 };
    for (const dt of [1, 2, 3, 4, 5]) {
      const e = breakEmitters(input(BIGGEST.arrivalS + dt, { wind: glassy, impactAmount: 1 }));
      expect(e.spray).toEqual([]);
      expect(plumeBirths(e.spray, 5, DEFAULT_SPRAY_PARAMS)).toEqual([]);
    }
  });
  it('onshore: a veil blown forward over the face (v·n > 0), and no plume', () => {
    const onshore = { speedMs: 18 * 0.5144, fromDeg: 237 };
    const e = breakEmitters(input(T_THROW, { wind: onshore })).spray;
    expect(e.length).toBeGreaterThan(0);
    for (const em of e) expect(em.wOff).toBeLessThan(0);
    const births = sprayBirths(e, 9, DEFAULT_SPRAY_PARAMS);
    expect(births.length).toBeGreaterThan(0);
    const forward = births.reduce((s, b) => s + b.vx * e[0].nx + b.vz * e[0].nz, 0) / births.length;
    expect(forward).toBeGreaterThan(0);
    expect(plumeBirths(e, 9, DEFAULT_SPRAY_PARAMS)).toEqual([]);
  });
  it('the wind helpers stay finite in a calm and at every bearing', () => {
    expect(Number.isFinite(offshoreFactor({ speedMs: 0, fromDeg: 123 }, 1, 0))).toBe(true);
    expect(offshoreFactor({ speedMs: 0, fromDeg: 123 }, 1, 0)).toBe(0);
    for (let b = -720; b <= 720; b += 7.5) expect(windToVector(b).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(offshoreSpeedOn({ speedMs: 0, fromDeg: 0 }, 0, 0))).toBe(true);
  });
  it('a tick takes at most SPRAY_BIRTH_CAP births, the veil first, then the plume', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ ...tip(9, 3), arc: i }));
    const all = sprayAndPlumeBirths(many, 4, DEFAULT_SPRAY_PARAMS);
    expect(all.length).toBeLessThanOrEqual(SPRAY_BIRTH_CAP);
    const firstPlume = all.findIndex((b) => b.kind === KIND_INDEX.plume);
    if (firstPlume >= 0) expect(all.slice(firstPlume).every((b) => b.kind === KIND_INDEX.plume)).toBe(true);
    expect(all.slice(0, sprayBirths(many, 4, DEFAULT_SPRAY_PARAMS).length).every((b) => (b.kind ?? 0) === KIND_INDEX.spray)).toBe(true);
  });
  it('spit is the spit kind, held back or blown on by the wind (+ wind × SPIT_WIND_SHARE)', () => {
    const e = { x: 0, y: 1, z: 0, dx: 1, dz: 0, nx: 0, nz: 1, speed: 8, radius: 1, strength: 1, lip: 1, waveId: 2, arc: 1, A: 10 };
    const calm = spitBirths([e], 4), blown = spitBirths([e], 4, [-6, 0]);
    expect(calm.length).toBeGreaterThan(0);
    for (const b of calm) expect(b.kind).toBe(KIND_INDEX.spit);
    calm.forEach((b, i) => expect(blown[i].vx).toBeCloseTo(b.vx - 6 * SPIT_WIND_SHARE, 9));
  });
});

describe('the crest line feathers in a strong offshore (whitewater §4.2)', () => {
  const strong = { speedMs: 18 * 0.5144, fromDeg: 57 };
  // The stood stations as the spray traces them (stood: true; 2026-10-15, womb-story Task 10: under the one-surface law a
  // section waiting its turn draws nothing, so the drawn stations alone end at the curl).
  const standing = (t: number) => {
    const waves = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave);
    return traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: MIN_H, spacingM: SPRAY_SPACING_M, stood: true })
      .filter((s): s is Exclude<typeof s, { gap: true }> => !s.gap && s.tb === null && s.until !== null && s.until !== undefined && Number.isFinite(s.until));
  };
  it('feathers along the standing wall at 10 m/s offshore; none under 1 m/s, none on a glassy day, none onshore', () => {
    const t = BIGGEST.arrivalS - 2;
    expect(standing(t).length).toBeGreaterThan(0);
    expect(breakEmitters(input(t, { wind: strong })).feather.length).toBeGreaterThan(0);
    expect(breakEmitters(input(t, { wind: { speedMs: 0.9, fromDeg: 57 } })).feather).toEqual([]);
    expect(breakEmitters(input(t, { wind: { speedMs: 1 * 0.5144, fromDeg: 57 } })).feather).toEqual([]);
    expect(breakEmitters(input(t, { wind: { speedMs: 18 * 0.5144, fromDeg: 237 } })).feather).toEqual([]);
  });
  // 2026-10-14 (womb-story Task 3d): wallWeight at the station's shoulderRegion, as the emitter reads it.
  it('every stood station feathers (7b S2 ruling), strength (FEATHER_FLOOR + (1 − FEATHER_FLOOR) × wallWeight) × wind × amount; never a broken one', () => {
    // 2026-10-14 (womb-story Task 5, spec 3.5): the stood crests' feathers (a throwing lip's carry `lip`).
    const t = BIGGEST.arrivalS - 2, f = breakEmitters(input(t, { wind: strong })).feather.filter((e) => !e.lip);
    expect(FEATHER_FLOOR).toBe(0.25);
    const st = standing(t), byArc = new Map(st.map((s) => [Math.round(s.arc / SPRAY_SPACING_M) * 1000 + s.wave, s]));
    expect(f.length).toBe(st.length);
    const wind = smoothstep(FEATHER_WIND_MS[0], FEATHER_WIND_MS[1], offshoreSpeedOn(strong, st[0].nx, st[0].nz));
    for (const e of f) {
      const s = [...byArc.values()].find((q) => Math.round(q.arc / SPRAY_SPACING_M) === e.arc && Math.abs(q.x + q.nx * (e.u ?? 0) - e.x) < 1e-9)!;
      expect(s).toBeDefined();
      expect(e.strength).toBeCloseTo((FEATHER_FLOOR + (1 - FEATHER_FLOOR) * wallWeight(s.until, field.periodS)) * smoothstep(FEATHER_WIND_MS[0], FEATHER_WIND_MS[1], offshoreSpeedOn(strong, s.nx, s.nz)), 9);
    }
    expect(wind).toBeGreaterThan(0);
  });
  it('the cheap crest height (no sheet read) is the drawn crest within 0.1 m', () => {
    const t = BIGGEST.arrivalS - 2, waves = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave);
    const o = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), pile: false, shape: 'lean' as const };
    let worst = 0, n = 0;
    // The fitted range (the wall near its break, where the strong puffs are); the stood swell's floor puffs are faint. (0.85
    // on the one-period lead ≈ 3.4 s out; 0.6 on the old 8 s squared ramp was 1.8 s.)
    for (const s of standing(t).filter((q) => wallWeight(q.until, field.periodS) > 0.85)) {
      const own = [waves[s.wave]];
      const base = (u: number): [number, number] => {
        const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), own, ctx, o);
        return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
      };
      const f = sectionFrame(s.section, s.H, s.c, base);
      worst = Math.max(worst, Math.abs(standingCrestY(s.section, s.H, 0) - f.crest[1]));
      n++;
    }
    expect(n).toBeGreaterThan(5);
    expect(worst).toBeLessThan(0.1);
  });
  it('the wind window is 1-5 m/s (STOP 3 ruling 1: a glassy 7 km/h morning shows a light fringe): none at 0.9, some at 1.1, the wall factor at 5', () => {
    expect(FEATHER_WIND_MS).toEqual([1, 5]);
    for (const wall of [0, 0.4, 1]) {
      expect(featherStrength(wall, 0.9, 1)).toBe(0);
      expect(featherStrength(wall, 1.1, 1)).toBeGreaterThan(0);
      expect(featherStrength(wall, 5, 1)).toBeCloseTo(FEATHER_FLOOR + (1 - FEATHER_FLOOR) * wall, 12);
    }
    // Andrew's 7 km/h (1.94 m/s): a thin fringe, ~0.15 of full.
    expect(featherStrength(1, 7 / 3.6, 1)).toBeGreaterThan(0.1);
    expect(featherStrength(1, 7 / 3.6, 1)).toBeLessThan(0.25);
  });
  it('within 60 m of the curl front a stood station feathers from the drawn crest (the frame), beyond from standingCrestY', () => {
    const wind = { speedMs: 9, fromDeg: 57 }, o = { ...breakOptions(field, DEFAULT_BREAK_PARAMS), pile: false, shape: 'lean' as const };
    let near = 0, far = 0;
    // Before the break (every stood station far from a curl) and mid-throw (the wall next to the curl).
    for (const t of [BIGGEST.arrivalS - 2, T_THROW]) {
    // 2026-10-14 (womb-story Task 5, spec 3.5): the stood crests' (a throwing lip's carry `lip`); a pitching one's from its crest knot, u along its normal.
    const f = breakEmitters(input(t, { wind })).feather.filter((e) => !e.lip);
    const waves = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave);
    const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: DEFAULT_BREAK_PARAMS, minHeightM: MIN_H, spacingM: SPRAY_SPACING_M, stood: true })
      .filter((s): s is Exclude<typeof s, { gap: true }> => !s.gap);
    for (const e of f) {
      const s = st.find((q) => q.tb === null && Math.round(q.arc / SPRAY_SPACING_M) === e.arc && Math.abs(q.x + q.nx * (e.u ?? 0) - e.x) < 1e-9)!;
      expect(s).toBeDefined();
      const fronts = st.filter((q) => q.wave === s.wave && q.tb !== null), d = Math.min(...fronts.map((q) => Math.abs(q.arc - s.arc)));
      expect(e.fromFrame, `arc ${s.arc.toFixed(0)} ${d.toFixed(1)} m from the curl`).toBe(d <= FEATHER_FRAME_REACH_M);
      if (!e.fromFrame) { far++; continue; }
      const own = [waves[s.wave]];
      const base = (u: number): [number, number] => {
        const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), own, ctx, o);
        return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
      };
      const fr = sectionFrame(s.section, s.H, s.c, base), want = fr.crest[1];
      expect(Math.abs(e.y - want), `arc ${s.arc.toFixed(0)}`).toBeLessThanOrEqual(0.1 * s.section.A);
      expect(e.A).toBe(s.section.A);
      near++;
    }
    }
    expect(FEATHER_FRAME_REACH_M).toBe(60);
    expect(near).toBeGreaterThan(3);
    expect(far).toBeGreaterThan(1);
  });
  it('a feather puff rises at most FEATHER_LIFT_A × A above its birth over 1.2 s in a 10 m/s offshore', () => {
    expect(FEATHER_LIFT_A).toBe(0.2); // 2026-10-14 (womb-story Task 5, spec 3.5) (was 0.5)
    for (const A of [1.5, 3, 5]) {
      const e = { x: 0, y: 3, z: 0, nx: 1, nz: 0, strength: 1, waveId: 4, arc: 2, wOff: 10, A, fromFrame: true };
      const b = Array.from({ length: 30 }, (_, k) => featherBirths([e], k)).flat();
      expect(b.length).toBeGreaterThan(10);
      const pool = new SprayPool(b.length);
      // Each puff in its own slot, living past the 1.2 s (the pool steps every live slot by its own kind: the feather's).
      b.forEach((q, i) => { pool.posAge.set([q.x, q.y, q.z, 0], i * 4); pool.velLife.set([q.vx, q.vy, q.vz, 2], i * 4); pool.meta.set([1, KIND_INDEX.feather, 0, 0], i * 4); });
      let worst = 0;
      for (let k = 0; k < Math.round(1.2 / FOAM_TICK_S); k++) {
        stepPool(pool, -10, 0);
        b.forEach((q, i) => { worst = Math.max(worst, pool.posAge[i * 4 + 1] - q.y); });
      }
      expect(worst, `A ${A}`).toBeLessThanOrEqual(FEATHER_LIFT_A * A + 1e-4);
    }
  });
  it('the feather kind (KIND_LOOK since womb-realism Task 5): thin, small, short-lived, blown straight back; the 7b rate', () => {
    // 2026-10-14 (womb-story Task 5, spec 3.5): size [0.15, 0.4], opacity 0.25 (was [0.3, 0.8], 0.35).
    expect(FEATHER_KIND).toMatchObject({ dragTauS: 0.5, gravityMs2: 0.5, sizeM: [0.15, 0.4], opacity: 0.25, isotropic: 0.6, backDriftShare: 1 });
    expect(FEATHER_RATE).toBe(3.6); // breaking-look L4 (2026-10-15): cut to 30 %; the crest strip carries the look
    expect(ERODING_KINDS).not.toContain(KIND_INDEX.feather);
  });
  it('a feather puff is the feather kind, blown back off the crest, short-lived', () => {
    const e = { x: 0, y: 3, z: 0, nx: 1, nz: 0, strength: 1, waveId: 4, arc: 2, wOff: 9, A: 3, fromFrame: false };
    const b = Array.from({ length: 40 }, (_, k) => featherBirths([e], k)).flat();
    expect(b.length).toBeGreaterThan(0);
    for (const p of b) {
      expect(p.kind).toBe(KIND_INDEX.feather);
      expect(p.vx).toBeLessThan(0);
      expect(p.vy).toBeGreaterThan(0);
      expect(p.life).toBeGreaterThanOrEqual(FEATHER_LIFE_S[0]);
      expect(p.life).toBeLessThanOrEqual(FEATHER_LIFE_S[1]);
    }
  });
});

// womb-story Task 5 (spec 3.5): feathering is a mist on the lip. Born at the section's crest knot (the lip's top; the chord
// crest -> tip's end), for a stood crest and for a throwing lip alike (STOP 2 ruling: the chord's middle lies inside the
// convex lip or the tube until the throwing key is redrawn, Task 4), never below it; the kind's look.
describe('the feather is a mist on the lip (womb-story Task 5)', () => {
  it('the look: size 0.15-0.4 m, alpha 0.25, life 0.4-0.9 s, lift at most 0.2 A', async () => {
    const { KIND_LOOK } = await import('./particleKinds');
    expect(KIND_LOOK.feather.sizeM).toEqual([0.15, 0.4]);
    expect(KIND_LOOK.feather.alpha).toBe(0.25);
    expect(KIND_LOOK.feather.lifeS).toEqual([0.4, 0.9]);
    expect(FEATHER_LIFT_A).toBeLessThanOrEqual(0.2);
  });
  it('a throwing lip feathers from its crest knot: on the lip, never below it, at most 0.02 A over it', () => {
    const strongOff = { speedMs: 20 * 0.514, fromDeg: OFFSHORE.fromDeg };
    const f = breakEmitters(input(T_THROW, { wind: strongOff })).feather;
    const lips = f.filter((e) => e.lip);
    expect(lips.length, 'feathers on throwing lips').toBeGreaterThan(3);
    for (const e of lips) {
      expect(e.u).toBeCloseTo(e.lip!.crest[0], 9);
      expect(e.y).toBeCloseTo(e.lip!.crest[1], 9);
      for (const b of featherBirths([e], 7)) {
        expect(b.y, 'never below the lip').toBeGreaterThanOrEqual(e.y - 1e-9);
        expect(b.y - e.y, 'at most 0.02 A over it').toBeLessThanOrEqual(0.02 * e.A + 1e-9);
      }
    }
  });
});

// womb-story Task 6 (spec 3.6): spit from the tube's end: the station caving in (phase 1.25-1.5) whose neighbour toward the
// front still has its tube (< 1.25) spits, along the line toward the front; none at the front, none before a tube closes.
describe('spit from the tube’s end (womb-story Task 6)', () => {
  it('on a line 0.9, 1.1, 1.3, 1.6 (front first): one mouth, at the 1.3 station, blowing toward the front', () => {
    expect(spitMouths([0.9, 1.1, 1.3, 1.6])).toEqual([{ at: 2, toward: 1 }]);
    expect(spitMouths([1.6, 1.3, 1.1, 0.9])).toEqual([{ at: 1, toward: 2 }]);
  });
  it('none while every section still holds its tube, none past the cave-in, none at the curl front', () => {
    expect(spitMouths([0.6, 0.9, 1.1, 1.2])).toEqual([]);
    expect(spitMouths([1.6, 1.8, 2])).toEqual([]);
    expect(spitMouths([1.3])).toEqual([]);
  });
  it('the pulse: full to 0.4 s after the section starts caving in, gone by 1.2 s; the jet at most 25 m/s', () => {
    expect(SPIT_PULSE_S).toEqual([0.4, 1.2]);
    expect(SPIT_MAX_SPEED_MS).toBe(25);
  });
});
