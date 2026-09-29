import { describe, expect, it } from 'vitest';
import { SKY_MAP, SLICES, skyMapDir, skyMapUv, sliceTexel } from './skyMapLayout';

describe('sky map layout', () => {
  it('puts the horizon at v = 0 and the zenith at v = 1, with u the world azimuth', () => {
    expect(skyMapUv(0, 0)).toEqual({ u: 0, v: 0 });
    expect(skyMapUv(Math.PI / 2, 1).v).toBeCloseTo(1, 12);
    expect(skyMapUv(0.1, Math.PI).u).toBeCloseTo(0.5, 12);
    expect(skyMapUv(0.1, -Math.PI / 2).u).toBeCloseTo(0.75, 12);
  });

  it('round-trips directions (azimuth = atan2(z, x), as Sky.radiance measures it)', () => {
    for (const el of [0.001, 0.05, 0.4, 1.2, 1.5]) for (const az of [0, 1, 2.5, 4, 6]) {
      const { u, v } = skyMapUv(el, az);
      const [x, y, z] = skyMapDir(u, v);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
      expect(Math.asin(y)).toBeCloseTo(el, 9);
      const a = Math.atan2(z, x);
      expect(Math.cos(a - az)).toBeCloseTo(1, 9);
    }
  });

  it('gives the horizon more texels than the zenith', () => {
    const dv = (el: number) => skyMapUv(el + 0.01, 0).v - skyMapUv(el, 0).v;
    expect(dv(0.02)).toBeGreaterThan(3 * dv(1.4));
  });

  it('marches every texel exactly once in SLICES frames', () => {
    const w = 64, h = 24; // same ordering as the full map, smaller to test exhaustively
    const seen = new Uint8Array(w * h);
    for (let k = 0; k < SLICES; k++) {
      for (let i = 0; i < (w * h) / SLICES; i++) {
        const [x, y] = sliceTexel(k, i, w);
        seen[y * w + x]++;
      }
    }
    expect(seen.every((n) => n === 1)).toBe(true);
    expect(SKY_MAP.width % 4).toBe(0);
    expect(SKY_MAP.height % 4).toBe(0);
  });
});
