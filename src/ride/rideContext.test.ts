import { describe, expect, it } from 'vitest';
import type { Station, StationEntry } from '../breaker/crestTrace';
import { CLOSEOUT_PEEL_MS, rideContext } from './rideContext';
import { OPEN_FACE } from './riderBody';
import { roomAt } from './tubeCover';

/** As tubeCover.test.ts: a straight crest along z at x = 0, the wave running +x, every metre; tb(z) the onset clock. */
const crest = (phase: (z: number) => number, H = 3, hollow = 1, tb: (z: number) => number | null = () => 1): StationEntry[] => {
  const out: Station[] = [];
  for (let z = -30; z <= 30; z += 1) {
    out.push({ gap: false, wave: 0, x: 0, z, arc: z, nx: 1, nz: 0, H, c: 9, r: 1.2, tb: tb(z), psi: 0.09, lipH: H, Hb: null, until: null, section: { A: H / 1.3, phase: phase(z), hollow, rho: 1 } });
  }
  return out;
};
const BARREL = 1, STANDING = 0.3;

describe('reading the wave for the stall (ride-speed spec §4.3)', () => {
  it('nothing around: the open face, never NaN', () => {
    expect(rideContext([], 0, 0)).toEqual(OPEN_FACE);
    expect(rideContext([{ gap: true }], 0, 0)).toEqual(OPEN_FACE);
    const one = rideContext(crest(() => STANDING).slice(0, 1), 2, 0);
    expect(Object.values(one).every((v) => typeof v === 'boolean' || !Number.isNaN(v))).toBe(true);
    const unbroken = rideContext(crest(() => STANDING, 3, 1, () => null), 2, 0);
    expect(unbroken.curlSpeed).toBe(0);
    expect(unbroken.closeout).toBe(false);
  });
  it('under a thrown lip: cover and room; a standing face: none', () => {
    expect(roomAt(crest(() => BARREL), 2, 0)).toBeGreaterThan(1);
    expect(roomAt(crest(() => STANDING), 2, 0)).toBe(0);
    const c = rideContext(crest(() => BARREL), 2, 0);
    expect(c.cover).toBeGreaterThan(0.9);
    expect(c.roomM).toBeGreaterThan(1);
  });
  it('the curl’s speed from the onset times along the crest; all at once is a closeout', () => {
    const peel = rideContext(crest(() => BARREL, 3, 1, (z) => 2 - z / 8), 2, 0); // breaks 8 m/s along the line
    expect(peel.curlSpeed).toBeCloseTo(8, 0);
    expect(peel.closeout).toBe(false);
    const shut = rideContext(crest(() => BARREL, 3, 1, () => 1), 2, 0);
    expect(shut.curlSpeed).toBeGreaterThan(CLOSEOUT_PEEL_MS);
    expect(shut.closeout).toBe(true);
  });
  it('up the face near the crest: faceHigh high, the crest close behind', () => {
    const c = rideContext(crest(() => STANDING), 0.5, 0);
    expect(c.faceHigh).toBeGreaterThan(0.6);
    expect(c.crestBehindM).toBeCloseTo(0.5, 6);
    expect(c.faceHM).toBe(3);
  });
});
