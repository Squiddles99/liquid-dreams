import { describe, expect, it } from 'vitest';
import { depthBg } from '../seabed/coastProfile';
import { groupSpeed, waveNumber } from './dispersion';
import { AMP_CAP, FAR_X0, computeFarField, farSample } from './coastFarField';

const w15 = (2 * Math.PI) / 15;

describe('far field over the reef-free coast', () => {
  it('shoals a wave arriving square to the coast exactly as linear theory says', () => {
    const f = computeFarField(15, 270, 0);
    expect(f.p).toBeCloseTo(0, 12);
    for (const x of [-400, -200, 0, 100, 160]) {
      const h = depthBg(x), k = waveNumber(w15, h), kRef = waveNumber(w15, depthBg(FAR_X0));
      const s = farSample(f, x, 0);
      expect(s.amp).toBeCloseTo(Math.sqrt(groupSpeed(w15, kRef, depthBg(FAR_X0)) / groupSpeed(w15, k, h)), 5);
      expect(s.k).toBeCloseTo(k, 6);
      expect(s.dirX).toBeCloseTo(1, 9);
    }
  });
  it("keeps Snell's invariant along the coast for an oblique SW swell", () => {
    const f = computeFarField(15, 225, 0);
    for (const x of [-400, -150, 0, 120]) {
      const s = farSample(f, x, 50);
      expect((s.dirZ * s.k) / w15).toBeCloseTo(f.p, 6);
      expect(s.dirX).toBeGreaterThan(0);
    }
  });
  it('is 1 at the reference depth, capped everywhere, and records the depth as hmin for shoreward waves', () => {
    const f = computeFarField(15, 225, 0);
    expect(farSample(f, -400, 0).amp).toBeCloseTo(1, 9);
    for (let x = -1000; x <= 400; x += 7) {
      const s = farSample(f, x, 0);
      expect(s.amp).toBeLessThanOrEqual(AMP_CAP);
      expect(s.hmin).toBeCloseTo(s.depth, 6);
    }
  });
  it('extends linearly west of the map', () => {
    const f = computeFarField(15, 225, 0);
    const edge = farSample(f, -400, 30), far = farSample(f, -1000, 30);
    expect(far.tau).toBeCloseTo(edge.tau - 600 * f.dTauDx[0], 6);
    expect(far.amp).toBeCloseTo(1, 9);
  });
  it('stays finite for swell from the land or along the coast', () => {
    for (const from of [0, 45, 90, 135, 180]) {
      const f = computeFarField(15, from, 0);
      for (let x = -600; x <= 400; x += 13) {
        const s = farSample(f, x, -20);
        for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});
