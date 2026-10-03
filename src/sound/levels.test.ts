import { describe, expect, it } from 'vitest';
import { BOMBIE_X, BOMBIE_Z } from '../bombie/bombieModel';
import { SURF_NZ, type SurfState, buildHeights, waterEdgeOffset } from '../surf/surfModel';
import { BOMBIE_WAVE_ID_BASE, type ImpactEmitter } from '../whitewater/sprayEmitters';
import {
  Follower, NearbyCache, SWASH_REACH_M, bombieRumble, lapping, plantDensityNear, roarSource, rocksNear, scrubLevel, swashSound,
  valueNoise1, washLevel, windSound,
} from './levels';

const imp = (waveId: number, x: number, z: number, H = 2, lip = 1): ImpactEmitter => ({ x, y: 0, z, vx: 0, vz: 0, nx: 1, nz: 0, H, strength: 1, lip, waveId, arc: 0 });
function surf(periodS = 10): SurfState {
  return { tau: new Float32Array(SURF_NZ), table: buildHeights({ lo: 0, hi: 200 }, periodS, 1.5, [], 1), periodS, enabled: true, edgeM: waterEdgeOffset(0) };
}

describe('the roar', () => {
  it('follows the landing lip, weighted by lip · H, and ignores the Bombie', () => {
    expect(roarSource([])).toBeNull();
    expect(roarSource([imp(BOMBIE_WAVE_ID_BASE, 0, 0)])).toBeNull();
    const r = roarSource([imp(1, 0, 0, 3), imp(1, 10, 0, 1)])!;
    expect(r.at.x).toBeCloseTo(2.5, 6);
    expect(r.level).toBeGreaterThan(0);
    expect(roarSource(Array.from({ length: 100 }, (_, j) => imp(1, j, 0, 5)))!.level).toBe(1.5);
  });
  it('Follower: quick up, slow down', () => {
    const f = new Follower();
    f.step(1, 0.3, 0.3, 2);
    expect(f.value).toBeGreaterThan(0.6);
    f.step(0, 2, 0.3, 2);
    expect(f.value).toBeGreaterThan(0.2);
    expect(f.value).toBeLessThan(0.3);
    const v = f.value;
    f.step(0, 0, 0.3, 2);
    expect(f.value).toBe(v);
  });
});

describe('the shore wash', () => {
  it('swells as each wave reaches the platform edge and dies back between', () => {
    const s = surf();
    expect(washLevel(0, 50.6, s)).toBeGreaterThan(washLevel(0, 59.5, s));
    for (let t = 0; t < 100; t += 0.37) expect(washLevel(0, t, s)).toBeLessThanOrEqual(1.5);
  });
  it('is silent with the surf off', () => {
    expect(washLevel(0, 50.6, { ...surf(), enabled: false })).toBe(0);
  });
});

describe('the Bombie rumble', () => {
  it('rises with the burst, rolls shoreward and is gone by the end of its life', () => {
    expect(bombieRumble([], 1).level).toBe(0);
    const early = bombieRumble([{ n: 1, ageS: 1.5, heightM: 3 }], 1);
    expect(early.level).toBeGreaterThan(0.5);
    expect([early.at.x, early.at.z]).toEqual([BOMBIE_X, BOMBIE_Z]);
    const later = bombieRumble([{ n: 1, ageS: 15, heightM: 3 }], 1);
    expect(later.at.x).toBeGreaterThan(BOMBIE_X);
    expect(bombieRumble([{ n: 1, ageS: 40, heightM: 3 }], 1).level).toBe(0);
  });
});

describe('wind and scrub', () => {
  it('wind: silent when calm, louder and brighter with speed, gusting', () => {
    expect(windSound(0, 5).level).toBe(0);
    expect(windSound(12, 5).level).toBeGreaterThan(windSound(4, 5).level);
    expect(windSound(12, 5).brightness).toBeGreaterThan(windSound(4, 5).brightness);
    for (let t = 0; t < 60; t += 0.7) {
      const n = valueNoise1(t);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(Math.abs(valueNoise1(t + 0.01) - n)).toBeLessThan(0.05);
    }
  });
  it('plant density counts plants within 15 m, full at one per 1.6 m² (the near-closed heath)', () => {
    expect(plantDensityNear([], 0, 0)).toBe(0);
    const dense: { x: number; z: number }[] = [];
    for (let x = -20; x <= 20; x += 1.2) for (let z = -20; z <= 20; z += 1.2) dense.push({ x, z });
    const sparse: { x: number; z: number }[] = [];
    for (let x = -20; x <= 20; x += 1.5) for (let z = -20; z <= 20; z += 1.5) sparse.push({ x, z });
    expect(plantDensityNear(sparse, 0, 0)).toBeLessThan(0.8);
    expect(plantDensityNear(dense, 0, 0)).toBe(1);
    expect(plantDensityNear([{ x: 16, z: 0 }], 0, 0)).toBe(0);
  });
  it('scrub only on foot', () => {
    expect(scrubLevel('walk', 0.8, 1)).toBeCloseTo(0.8, 6);
    expect(scrubLevel('lineup', 0.8, 1)).toBe(0);
    expect(scrubLevel('free', 0.8, 1)).toBe(0);
  });
  it('rocks near: within 20 m', () => {
    expect(rocksNear([{ x: 19, z: 0 }], 0, 0)).toBe(true);
    expect(rocksNear([{ x: 21, z: 0 }], 0, 0)).toBe(false);
  });
  it('NearbyCache recomputes after 2 m of movement or new lists, not every frame', () => {
    const c = new NearbyCache();
    const plants = [{ x: 15.5, z: 0 }], rocks: { x: number; z: number }[] = [];
    expect(c.get(plants, rocks, 0, 0).plantDensity).toBe(0);
    expect(c.get(plants, rocks, 1, 0).plantDensity).toBe(0);
    expect(c.get(plants, rocks, 2.5, 0).plantDensity).toBeGreaterThan(0);
    expect(c.get([], rocks, 2.5, 0).plantDensity).toBe(0);
  });
});

describe('water close by', () => {
  it('lapping: in the water, near the surface, livelier as it rises and falls', () => {
    expect(lapping('lineup', false, 0.8, 0, 0).level).toBeGreaterThan(0.2);
    expect(lapping('lineup', false, 0.8, 0, 0.8).level).toBeGreaterThan(lapping('lineup', false, 0.8, 0, 0).level);
    expect(lapping('lineup', false, 0.8, 0, 0.8).rate).toBeGreaterThan(lapping('lineup', false, 0.8, 0, 0).rate);
    expect(lapping('free', false, 30, 0, 0.8).level).toBe(0);
    expect(lapping('walk', false, 2, 0, 0.8).level).toBe(0);
    expect(lapping('lineup', true, -1, 0, 0.8).level).toBe(0);
    expect(lapping('lineup', false, 0.8, null, 0.8).level).toBe(0);
  });
  it('swash: on foot near the water, gone 25 m up the beach; the draw-back and pebbles only as it falls', () => {
    const s = surf();
    let tPeak = 0, best = -1;
    for (let t = 40; t < 50; t += 0.05) {
      const r = swashSound({ mode: 'walk', camX: 190, camZ: 0, waterlineX: 190, tideM: 0, surf: s, t, nearRocks: false, prevRaw: null }).raw;
      if (r > best) { best = r; tPeak = t; }
    }
    const at = (camX: number, t: number, prevRaw: number | null, nearRocks = false, mode: 'walk' | 'lineup' = 'walk') =>
      swashSound({ mode, camX, camZ: 0, waterlineX: 190, tideM: 0, surf: s, t, nearRocks, prevRaw });
    expect(at(192, tPeak, null).level).toBeGreaterThan(at(205, tPeak, null).level);
    expect(at(190 + SWASH_REACH_M + 40, tPeak, null).level).toBe(0);
    expect(at(192, tPeak, null, false, 'lineup').level).toBe(0);
    const falling = at(192, tPeak + 1, best, true);
    expect(falling.drawBack).toBeGreaterThan(0);
    expect(falling.pebbles).toBeGreaterThan(0);
    expect(at(192, tPeak + 1, best, false).pebbles).toBe(0);
    const rising = at(192, tPeak - 0.3, 0, true);
    expect(rising.drawBack).toBe(0);
  });
});
