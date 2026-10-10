import { describe, expect, it } from 'vitest';
import type { FoamGrid } from './foamStep';
import {
  MIST_DECAY_S, MIST_GRAZE, MIST_IMPACT_SHARE, MIST_LAND_WINDOW_S, MIST_PATH_MAX_M, MIST_PLUME_SHARE, MIST_SIGMA, MIST_SLAB_A, MIST_WIND_SHARE,
  decayMist, landingMist, mistSource, mistTransmittance, slabDepth, stepMist,
} from './mistSlab';
import { SURGE_RISE } from './sprayEmitters';

describe('the mist slab (whitewater §6.1)', () => {
  it('the slab constants', () => {
    expect([MIST_DECAY_S, MIST_SLAB_A, MIST_SIGMA, MIST_WIND_SHARE]).toEqual([3, 1.5, 0.35, 0.3]);
    expect(MIST_LAND_WINDOW_S).toEqual([0.2, 1.2]);
  });

  it('transmittance is exactly 1 with no mist, whatever the path', () => {
    for (const h of [0, 1, 5]) for (const s of [-1, -0.2, 0, 0.3]) expect(mistTransmittance(0, h, s, 100)).toBe(1);
  });

  it('falls monotonically with the density and with the path', () => {
    let last = 1;
    for (const d of [0.1, 0.3, 0.6, 1]) { const t = mistTransmittance(d, 3, -0.2, 100); expect(t).toBeLessThan(last); last = t; }
    last = 1;
    for (const h of [0.5, 1, 2, 4]) { const t = mistTransmittance(0.5, h, -0.2, 100); expect(t).toBeLessThan(last); last = t; }
    expect(mistTransmittance(0.5, 3, -0.2, 100)).toBeCloseTo(Math.exp(-MIST_SIGMA * 0.5 * (3 / 0.2)), 12);
  });

  it('the grazing cap holds: a level ray goes at most min(h / MIST_GRAZE, MIST_PATH_MAX_M, the eye\'s distance)', () => {
    expect(mistTransmittance(1, 2, 0, 1000)).toBeCloseTo(Math.exp(-MIST_SIGMA * (2 / MIST_GRAZE)), 12);
    expect(mistTransmittance(1, 10, 0, 1000)).toBeCloseTo(Math.exp(-MIST_SIGMA * MIST_PATH_MAX_M), 12);
    expect(mistTransmittance(1, 10, 0, 7)).toBeCloseTo(Math.exp(-MIST_SIGMA * 7), 12);
  });

  it('slabDepth: the slab\'s height above a point (MIST_SLAB_A × A over the sea, less the point\'s height in it, ≥ 0)', () => {
    expect(slabDepth(0, 0, 2)).toBeCloseTo(MIST_SLAB_A * 2, 12);
    expect(slabDepth(1, 0, 2)).toBeCloseTo(MIST_SLAB_A * 2 - 1, 12);
    expect(slabDepth(10, 0, 2)).toBe(0);
    expect(slabDepth(-1, 0, 2)).toBeCloseTo(MIST_SLAB_A * 2, 12);
  });
});

describe('the mist channel (whitewater §6.1): its source, decay and drift', () => {
  it('a landing makes mist only from τ_land + 0.2 to + 1.2 s, (1 + SURGE_RISE × hollow) × as much where the lip pitched', () => {
    const fly = 1.1;
    expect(landingMist(fly + 0.1, fly, 1)).toBe(0);
    expect(landingMist(fly + 0.25, fly, 1)).toBe(1 + SURGE_RISE);
    expect(landingMist(fly + 1.1, fly, 0)).toBe(1);
    expect(landingMist(fly + 1.25, fly, 1)).toBe(0);
    expect(landingMist(-1, fly, 1)).toBe(0);
  });

  it('the source: the impact share of the landing, plus the plume share × smoothstep(3, 9, w_off) × the lip; ≤ 1', () => {
    const dir: [number, number] = [1, 0];
    expect(mistSource(0.5, 0, dir, [0, 0])).toBeCloseTo(MIST_IMPACT_SHARE * 0.5, 12);
    // Offshore 9 m/s against travel +x: the wind blows toward −x.
    expect(mistSource(0, 0.4, dir, [-9, 0])).toBeCloseTo(MIST_PLUME_SHARE * 0.4, 12);
    expect(mistSource(0, 1, dir, [-2.9, 0])).toBe(0);
    expect(mistSource(0, 1, dir, [9, 0])).toBe(0); // onshore: no plume
    expect(mistSource(2, 1, dir, [-9, 0])).toBe(1);
  });

  it('Glassy: the slab is 0 away from the landing (no plume share; the impact share only in its window)', () => {
    const dir: [number, number] = [0.6, 0.8], glassy: [number, number] = [0.3, -0.4];
    for (const lip of [0, 0.5, 1]) expect(mistSource(0, lip, dir, glassy)).toBe(0);
  });

  it('decays to < 5 % in 3 × MIST_DECAY_S, exactly over any dt (a coarse step = its fine steps)', () => {
    expect(decayMist(1, 0, 3 * MIST_DECAY_S)).toBeLessThan(0.05);
    let m = 0.8;
    for (let k = 0; k < 10; k++) m = decayMist(m, 0, 0.05);
    expect(m).toBeCloseTo(decayMist(0.8, 0, 0.5), 12);
    expect(decayMist(0.1, 0.6, 0.05)).toBe(0.6);
  });

  it('stepMist: a puff drifts with MIST_WIND_SHARE of the wind and decays; no source, no wind: in place', () => {
    const g: FoamGrid = { x0: 0, z0: 0, cellM: 1, nx: 40, nz: 4 };
    let m = new Float32Array(g.nx * g.nz);
    const src = { mist: (x: number, _z: number, t: number): [number, number] => [t < 0.06 && x > 10 && x < 12 ? 1 : 0, 0], dir: (): [number, number] => [1, 0], wind: [10, 0] as const };
    const centroid = (a: Float32Array): number => { let s = 0, w = 0; for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) { s += a[r * g.nx + c] * c; w += a[r * g.nx + c]; } return s / w; };
    m = stepMist(m, g, 0.05, 0.05, src);
    const c0 = centroid(m);
    for (let k = 2; k <= 40; k++) m = stepMist(m, g, k * 0.05, 0.05, src);
    // 1.95 s at 3 m/s.
    expect(centroid(m) - c0).toBeCloseTo(MIST_WIND_SHARE * 10 * 1.95, 0);
    const still = stepMist(Float32Array.from({ length: g.nx * g.nz }, (_, i) => (i % 7) / 7), g, 1, 0.05, { mist: () => [0, 0], dir: () => [1, 0] });
    still.forEach((v, i) => expect(v).toBeCloseTo(decayMist((i % 7) / 7, 0, 0.05), 6));
  });
});
