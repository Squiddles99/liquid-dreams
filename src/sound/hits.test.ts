import { describe, expect, it } from 'vitest';
import { BOMBIE_X, BOMBIE_Z } from '../bombie/bombieModel';
import { BOMBIE_WAVE_ID_BASE, type ImpactEmitter } from '../whitewater/sprayEmitters';
import { HIT_CAP, HIT_LOOKBACK_TICKS, HIT_MIN_GAP_S, type HitInput, HitTracker, SPEED_OF_SOUND_MS, airCutoffHz, hitGain, thumpHz, ticksToHear } from './hits';

const imp = (waveId: number, arc: number, x: number, z: number, H = 2, lip = 1): ImpactEmitter => ({ x, y: 0, z, vx: 0, vz: 0, nx: 1, nz: 0, H, hollow: 0, strength: 1, lip, waveId, arc });
const T = (k: number): number => k / 20;
function input(ticks: { k: number; impact: ImpactEmitter[] }[], over: Partial<HitInput> = {}): HitInput {
  const last = ticks.length ? T(ticks[ticks.length - 1].k) : 0;
  return { ticks: ticks.map((q) => ({ ...q, t: T(q.k) })), bursts: [], bombieSize: 1, camera: { x: 0, y: 1, z: 0 }, simTime: last, realTime: last, tideM: 0, ...over };
}

describe('lip hits', () => {
  it('one landing lip is one hit, however many ticks its stations land for', () => {
    const h = new HitTracker();
    const lip = [0, 1, 2, 3, 4].map((a) => imp(7, a, 20 + 3 * a, 0));
    let hits = 0;
    for (let k = 0; k < 7; k++) hits += h.hear(input([{ k, impact: lip }])).length;
    expect(hits).toBe(1);
  });
  it('a peeling lip hits at most every HIT_MIN_GAP_S', () => {
    const h = new HitTracker();
    const times: number[] = [];
    for (let k = 0; k < 40; k++) if (h.hear(input([{ k, impact: [imp(3, k, 3 * k, 0)] }])).length) times.push(T(k));
    expect(times.length).toBeGreaterThanOrEqual(6);
    for (let j = 1; j < times.length; j++) expect(times[j] - times[j - 1]).toBeGreaterThanOrEqual(HIT_MIN_GAP_S - 1e-9);
  });
  it('is heard distance / 343 s after it happens', () => {
    const cam = { x: 0, y: 0, z: 0 };
    const [hit] = new HitTracker().hear(input([{ k: 100, impact: [imp(1, 0, 343, 0)] }], { camera: cam }));
    expect(hit.delayS).toBeCloseTo(343 / SPEED_OF_SOUND_MS, 3);
    const [late] = new HitTracker().hear(input([{ k: 100, impact: [imp(1, 0, 343, 0)] }], { camera: cam, simTime: T(100) + 0.2 }));
    expect(late.delayS).toBeCloseTo(0.8, 3);
  });
  it('bigger waves are louder and lower', () => {
    expect(hitGain(2.5)).toBeGreaterThan(hitGain(1));
    expect(thumpHz(2.5)).toBeLessThan(thumpHz(1));
    for (const H of [0, 1, 3, 10]) {
      expect(thumpHz(H)).toBeGreaterThanOrEqual(40);
      expect(thumpHz(H)).toBeLessThanOrEqual(90);
    }
  });
  it('the air dulls distant hits', () => {
    expect(airCutoffHz(0)).toBeGreaterThan(airCutoffHz(150));
    expect(airCutoffHz(150)).toBeGreaterThan(airCutoffHz(450));
    expect(airCutoffHz(5000)).toBe(800);
  });
});

describe('the Bombie hit', () => {
  it('one hit per new burst, at the reef, delayed by its distance; its spray is not a lip', () => {
    const h = new HitTracker();
    const cam = { x: 0, y: 1, z: 0 };
    const d = Math.hypot(BOMBIE_X, BOMBIE_Z);
    const spray = [imp(BOMBIE_WAVE_ID_BASE + 4, 0, BOMBIE_X, BOMBIE_Z)];
    const first = h.hear(input([{ k: 200, impact: spray }], { camera: cam, bursts: [{ n: 4, ageS: 0.25, heightM: 3 }] }));
    expect(first).toHaveLength(1);
    expect(first[0].bombie).toBe(true);
    expect([first[0].x, first[0].z]).toEqual([BOMBIE_X, BOMBIE_Z]);
    expect(first[0].delayS).toBeCloseTo(d / SPEED_OF_SOUND_MS - 0.25, 3);
    expect(h.hear(input([{ k: 201, impact: spray }], { camera: cam, bursts: [{ n: 4, ageS: 0.3, heightM: 3 }] }))).toHaveLength(0);
  });
  it('a burst first seen long after it broke makes no hit', () => {
    expect(new HitTracker().hear(input([], { bursts: [{ n: 9, ageS: 5, heightM: 3 }] }))).toHaveLength(0);
  });
});

describe('the voice cap', () => {
  it('at most HIT_CAP hits sound at once, the loudest kept; room comes back as they finish', () => {
    const h = new HitTracker();
    const many = Array.from({ length: 30 }, (_, w) => imp(100 + w, 0, 20 * w, 0, 0.5 + w * 0.1));
    const kept = h.hear(input([{ k: 1, impact: many }], { realTime: 0 }));
    expect(kept).toHaveLength(HIT_CAP);
    expect(kept.every((q) => q.gain >= hitGain(0.5 + (30 - HIT_CAP) * 0.1) - 1e-9)).toBe(true);
    expect(h.hear(input([{ k: 2, impact: [imp(999, 0, 5, 0)] }], { realTime: 0.1 }))).toHaveLength(0);
    expect(h.hear(input([{ k: 3, impact: [imp(998, 0, 5, 0)] }], { realTime: 20 }))).toHaveLength(1);
  });
});

describe('seeking', () => {
  it('listens to at most HIT_LOOKBACK_TICKS ticks a frame; a jump back listens to now only', () => {
    expect(ticksToHear(null, 50)).toEqual([50]);
    expect(ticksToHear(5, 8)).toEqual([6, 7, 8]);
    expect(ticksToHear(8, 8)).toEqual([]);
    expect(ticksToHear(0, 1000)).toEqual(Array.from({ length: HIT_LOOKBACK_TICKS }, (_, j) => 1001 - HIT_LOOKBACK_TICKS + j));
    expect(ticksToHear(900, 40)).toEqual([40]);
  });
  it('after a jump back, the same landing is heard again', () => {
    const h = new HitTracker();
    const lip = [imp(7, 0, 20, 0)];
    expect(h.hear(input([{ k: 100, impact: lip }]))).toHaveLength(1);
    expect(h.hear(input([{ k: 10, impact: lip }]))).toHaveLength(1);
  });
});
