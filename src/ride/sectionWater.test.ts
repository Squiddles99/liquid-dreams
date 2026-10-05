import { describe, expect, it } from 'vitest';
import type { Station } from '../breaker/crestTrace';
import { profileCurve, profileKnots } from '../breaker/wombProfile';
import { lowestWetCrossing, withSections } from './sectionWater';
import { flatWater } from './water';

/** A straight crest along z through x = 0, the wave travelling +x, stations 1 m apart, all at one section. */
function crest(section: Station['section']): Station[] {
  return Array.from({ length: 21 }, (_, i): Station => ({
    gap: false, wave: 0, x: 0, z: i - 10, arc: i - 10, nx: 1, nz: 0, H: 4, c: 9, r: 1.2, tb: 0.5, wait: null, psi: 0.09, lipH: null, section,
  }));
}

describe('sectionWater: the ride stands on the drawn sections', () => {
  it('is the section where the ribbon draws, the sheet elsewhere', () => {
    const sec = { A: 3, phase: 0.2, hollow: 1, rho: 1 };
    const water = withSections(flatWater(0.5), crest(sec), 0.5);
    const c = profileCurve(sec.phase, sec.hollow);
    for (const u of [-6, -2, 0, 1.5]) {
      const want = 0.5 + 3 * lowestWetCrossing(c, u / 3)!.y;
      expect(water(u, 0).y).toBeCloseTo(want, 6);
      expect(water(u, 3.5).y).toBeCloseTo(want, 6);
    }
    // Off the ribbon: past the profile's ends, and beyond the crest's last station.
    expect(water(-25, 0).y).toBe(0.5);
    expect(water(0, 30).y).toBe(0.5);
  });

  it('under a thrown lip, stands on the tube’s floor, not on the lip above it', () => {
    const sec = { A: 3, phase: 1, hollow: 1, rho: 1 };
    const water = withSections(flatWater(0), crest(sec), 0);
    const k = profileKnots(1, 1), floor = k[10], tip = k[6];
    // Between the tube's floor and the tip, in u: the lip overhangs there.
    const u = (floor[0] + tip[0]) / 2;
    const y = water(3 * u, 0).y;
    expect(y).toBeLessThan(3 * 0.3);
    expect(y).toBeLessThan(0.5 * 3 * k[3][1]);
  });

  it('weighs in by the station’s ρ: half way at ρ 0.5', () => {
    const sec = { A: 3, phase: 0.2, hollow: 1, rho: 0.5 };
    const water = withSections(flatWater(0), crest(sec), 0);
    const full = withSections(flatWater(0), crest({ ...sec, rho: 1 }), 0);
    expect(water(0, 0).y).toBeCloseTo(0.5 * full(0, 0).y, 6);
  });
});

describe('sectionWater and the ride', () => {
  it('never reads steeper than the ride wipes out at, on the steepest wall the family draws', async () => {
    const { WIPEOUT_SLOPE } = await import('./ridePhysics');
    for (const phase of [0.45, 0.6, 0.8, 1, 1.3]) {
      const water = withSections(flatWater(0), crest({ A: 3, phase, hollow: 1, rho: 1 }), 0);
      for (let u = -8; u <= 8; u += 0.05) {
        const w = water(u, 0);
        expect(Math.hypot(w.slopeX, w.slopeZ), `phase ${phase} u ${u.toFixed(2)}`).toBeLessThan(WIPEOUT_SLOPE);
      }
    }
  });
});
