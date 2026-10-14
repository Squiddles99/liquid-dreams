import { afterEach, describe, expect, it } from 'vitest';
import { smoothstep } from '../math/smoothstep';
import { TIP, LEFT_BEARING_DEG } from '../seabed/wombReef';
import { UNTIL_NEVER } from './breaking';
import { SHOULDER_TAPER_M, frontWeight, setShoulder, shoulderAlong, shoulderFactor, shoulderStand, wallWeight } from './wombSection';

// womb-story Task 3d (STOP 1b ruling 1, Andrew's rule: no wall ahead of the face): ahead of the curl the stand-up
// fraction falls from 1 to 0 over shoulderTaperM along the line (distance = the time until its break or its turn x the
// curl's top speed), and the shoulder's height tapers to shoulderFloor x its own there.
const CURL = 13;
const at = (along: number, cross: number): [number, number] => {
  const r = (LEFT_BEARING_DEG * Math.PI) / 180;
  // along = dx sin r - dz cos r, cross (inshore of the ledge) = dx cos r + dz sin r.
  return [TIP[0] + along * Math.sin(r) + cross * Math.cos(r), TIP[1] - along * Math.cos(r) + cross * Math.sin(r)];
};
afterEach(() => setShoulder(SHOULDER_TAPER_M, 1, CURL));

describe('the shoulder tapers ahead of the curl (Task 3d)', () => {
  it('stand-up fraction 1 at the curl, 0.5 at 15 m, 0 at 30 m ahead, monotone', () => {
    setShoulder(30, 1, CURL);
    expect(shoulderStand(0)).toBeCloseTo(1, 6);
    expect(Math.abs(shoulderStand(15 / CURL) - 0.5)).toBeLessThanOrEqual(0.05);
    expect(shoulderStand(30 / CURL)).toBeLessThanOrEqual(0.05);
    let last = 1;
    for (let d = 0; d <= 40; d += 0.5) { const s = shoulderStand(d / CURL); expect(s).toBeLessThanOrEqual(last + 1e-12); last = s; }
    expect(shoulderStand(Infinity)).toBe(0);
  });
  it('dial 0 is today, bit-equal (the wall and front weights, the factor)', () => {
    setShoulder(0, 0.5, CURL);
    for (const u of [0, 0.3, 1, 2.5, 5, 9, 14]) {
      expect(frontWeight(u)).toBe((1 - Math.min(1, u / 8)) ** 2);
      expect(wallWeight(u, 14)).toBe(1 - smoothstep(0, 0.75 * 14, u));
      const [x, z] = at(120, 30);
      expect(shoulderFactor(x, z, u)).toBe(1);
    }
  });
  it('the stand-up weights carry the fraction where the shoulder is, not at the take-off or on the right', () => {
    setShoulder(30, 1, CURL);
    for (const u of [0.5, 2.5, 4]) {
      expect(wallWeight(u, 14, 0)).toBe(1 - smoothstep(0, 0.75 * 14, u));
      expect(frontWeight(u, 0)).toBe((1 - Math.min(1, u / 8)) ** 2);
    }
    for (const u of [0.5, 1.5, 2.5, 4]) {
      expect(frontWeight(u)).toBeCloseTo((1 - Math.min(1, u / 8)) ** 2 * shoulderStand(u), 12);
      expect(wallWeight(u, 14)).toBeCloseTo((1 - smoothstep(0, 0.75 * 14, u)) * shoulderStand(u), 12);
    }
  });
  it('the floor: 1 at the curl, the floor 30 m ahead, on the left past the take-off only', () => {
    setShoulder(30, 0.6, CURL);
    const [x, z] = at(120, 30);
    expect(shoulderFactor(x, z, 0)).toBeCloseTo(1, 6);
    expect(shoulderFactor(x, z, 30 / CURL)).toBeCloseTo(0.6, 6);
    expect(shoulderFactor(x, z, 100)).toBeCloseTo(0.6, 6);
    // Broken (u null) or never breaking (UNTIL_NEVER): its own height.
    expect(shoulderFactor(x, z, null)).toBe(1);
    expect(shoulderFactor(x, z, UNTIL_NEVER)).toBe(1);
    // The take-off (the tip's first 10 m) and the right (along < 0) keep their height; far out to sea too.
    expect(shoulderFactor(...at(5, 0), 100)).toBe(1);
    expect(shoulderFactor(...at(-40, 20), 100)).toBe(1);
    expect(shoulderFactor(...at(120, -200), 100)).toBe(1);
  });
  it("by the curl front's distance: no cliff where the time until onset jumps (past the fizzle, to the shore's break)", () => {
    setShoulder(30, 0.6, CURL);
    // The front at 141 m; the stations ahead at 145-151 m are held 0.25-0.76 s, from 155 m the shore's break is 5-11 s away.
    const front = 141, fac = (a: number, u: number) => shoulderFactor(...at(a, 39), u, front);
    expect(shoulderAlong(...at(150, 39))).toBeCloseTo(150, 9);
    const ahead = [[145, 0.25], [148, 0.5], [151, 0.76], [155, 5.2], [158, 7.1], [162, 8.8], [171, 10.9], [180, 10.9]] as const;
    let prev = fac(ahead[0][0], ahead[0][1]);
    for (const [a, u] of ahead.slice(1)) {
      const f = fac(a, u);
      expect(f, `at ${a} m`).toBeLessThanOrEqual(prev + 1e-12);
      // At most the ramp's own steepest fall over the stations' spacing (smoothstep's 1.5 / 30 m x 0.4 per m).
      expect(prev - f, `step into ${a} m`).toBeLessThanOrEqual(0.02 * (a - 141 > 0 ? 4.5 : 0) + 1e-9);
      prev = f;
    }
    expect(fac(180, 10.9)).toBeCloseTo(0.6, 6);
    // Without the front (the time alone) the same line fell to the floor between 151 and 155 m.
    expect(shoulderFactor(...at(151, 39), 0.76) - shoulderFactor(...at(155, 39), 5.2)).toBeGreaterThan(0.1);
  });
});
