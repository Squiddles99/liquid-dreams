import { describe, expect, it } from 'vitest';
import type { Station, StationEntry } from '../breaker/crestTrace';
import { tubeCover } from './tubeCover';

/** A straight crest along z at x = 0, the wave running +x, every metre from z = −30 to 30, each at its section's phase. */
const crest = (phase: (z: number) => number, H = 3, hollow = 1): StationEntry[] => {
  const out: Station[] = [];
  for (let z = -30; z <= 30; z += 1) {
    out.push({ gap: false, wave: 0, x: 0, z, arc: z, nx: 1, nz: 0, H, c: 9, r: 1.2, tb: 1, wait: null, psi: 0.09, lipH: H, Hb: null, until: null, section: { A: H / 1.3, phase: phase(z), hollow, rho: 1 } });
  }
  return out;
};
const BARREL = 1, STANDING = 0.3;

describe('tube cover (Andrew 2026-10-04: the camera goes over the shoulder when she is about to be barrelled)', () => {
  it('a rider on the face under a thrown lip is covered', () => {
    expect(tubeCover(crest(() => BARREL), 2, 0)).toBeGreaterThan(0.9);
  });

  it('nothing before the section throws, behind the crest, or far down the line from the curl', () => {
    expect(tubeCover(crest(() => STANDING), 2, 0)).toBe(0);
    expect(tubeCover(crest(() => BARREL), -3, 0)).toBe(0);
    // Up at the crest line she is in the lip, not the tube.
    expect(tubeCover(crest(() => BARREL), 0.3, 0)).toBe(0);
    expect(tubeCover(crest((z) => (z < -15 ? BARREL : STANDING)), 2, 0)).toBe(0);
  });

  it('rises as the throwing section closes in along the line: before it is overhead', () => {
    const near = tubeCover(crest((z) => (z < -2 ? BARREL : STANDING)), 2, 0);
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeLessThan(tubeCover(crest(() => BARREL), 2, 0));
  });

  it('gone once the tube has caved in, and never for a lip too small to stand under', () => {
    expect(tubeCover(crest(() => 1.6), 2, 0)).toBe(0);
    expect(tubeCover(crest(() => BARREL, 1), 1, 0)).toBe(0);
  });

  it('a middling-hollow section that throws a drawn tube covers her in it (Andrew, 2026-10-05: the camera "isn\u2019t engaging despite me riding close to or being actually in the barrel")', () => {
    expect(tubeCover(crest(() => BARREL, 3, 0.3), 1.6, 0)).toBeGreaterThan(0.9);
    expect(tubeCover(crest(() => 0.8, 4, 0.3), 2, 0)).toBeGreaterThan(0.9);
  });

  it('skips gaps', () => {
    expect(tubeCover([{ gap: true }, ...crest(() => BARREL)], 2, 0)).toBeGreaterThan(0.9);
  });
});
