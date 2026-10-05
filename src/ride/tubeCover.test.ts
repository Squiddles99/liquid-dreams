import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, landingEstimate } from '../breaker/breaking';
import type { Station, StationEntry } from '../breaker/crestTrace';
import { tubeCover } from './tubeCover';

/** A straight crest along z at x = 0, the wave running +x, every metre from z = −30 to 30, all with this onset time. */
const crest = (tb: (z: number) => number | null, H = 3, psi = 0.08): StationEntry[] => {
  const out: Station[] = [];
  for (let z = -30; z <= 30; z += 1) out.push({ gap: false, wave: 0, x: 0, z, arc: z, nx: 1, nz: 0, H, c: 9, r: 1.2, tb: tb(z), psi, lipH: H, section: { A: H / 1.3, phase: 1, hollow: 1, rho: 1 } });
  return out;
};
const p = DEFAULT_BREAK_PARAMS;
const land = landingEstimate(3, p);

describe('tube cover (Andrew 2026-10-04: the camera goes over the shoulder when she is about to be barrelled)', () => {
  it('a rider on the face under a thrown lip is covered', () => {
    expect(tubeCover(crest(() => land), 2, 0, p)).toBeGreaterThan(0.9);
  });

  it('nothing before the section breaks, behind the crest, or far down the line from the curl', () => {
    expect(tubeCover(crest(() => null), 2, 0, p)).toBe(0);
    expect(tubeCover(crest(() => land), -3, 0, p)).toBe(0);
    // Up at the crest line she is in the lip, not the tube.
    expect(tubeCover(crest(() => land), 0.3, 0, p)).toBe(0);
    expect(tubeCover(crest((z) => (z < -15 ? land : null)), 2, 0, p)).toBe(0);
  });

  it('rises as the throwing section closes in along the line: before it is overhead', () => {
    const near = tubeCover(crest((z) => (z < -2 ? land : null)), 2, 0, p);
    expect(near).toBeGreaterThan(0.3);
    expect(near).toBeLessThan(tubeCover(crest(() => land), 2, 0, p));
  });

  it('gone once the tube has collapsed, and never for a lip too small or too gentle to stand under', () => {
    expect(tubeCover(crest(() => land + 5), 2, 0, p)).toBe(0);
    expect(tubeCover(crest(() => land, 1), 1, 0, p)).toBe(0);
    expect(tubeCover(crest(() => land, 3, 0.01), 2, 0, p)).toBe(0);
  });

  it('skips gaps', () => {
    expect(tubeCover([{ gap: true }, ...crest(() => land)], 2, 0, p)).toBeGreaterThan(0.9);
  });
});
