import { describe, expect, it } from 'vitest';
import { sunForConditions } from '../astro/sunForConditions';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { MARCH_GRID, MARCH_STEPS, SUN_REBUILD_RAD, SUN_SOFT_RAD, buildMarchHeights, marchDistance, sampleMarch, sunMoved, sunVisibility } from './sunlight';

const sunAt = (elevDeg: number, towardX: number, towardZ: number): [number, number, number] => {
  const e = (elevDeg * Math.PI) / 180, h = Math.hypot(towardX, towardZ);
  return [(towardX / h) * Math.cos(e), Math.sin(e), (towardZ / h) * Math.cos(e)];
};

describe('sunVisibility on a synthetic wall', () => {
  // A 100 m wall from x = 500 eastwards. The march samples at discrete distances, so the horizon it sees is the highest
  // of its own samples (the first one past the wall is at ~551 m), not the wall's true edge.
  const h = buildMarchHeights((x) => (x >= 500 ? 100 : 0));
  let maxTan = -1e3;
  for (let i = 0; i < MARCH_STEPS; i++) maxTan = Math.max(maxTan, (sampleMarch(h, marchDistance(i), 0) - (sampleMarch(h, 0, 0) + 0.5)) / marchDistance(i));
  const wallDeg = (Math.atan(maxTan) * 180) / Math.PI;
  it('is 0 below the wall, 1 above it, one half exactly at it', () => {
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg - 1, 1, 0))).toBe(0);
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg + 1, 1, 0))).toBe(1);
    expect(sunVisibility(h, 0, 0, sunAt(wallDeg, 1, 0))).toBeCloseTo(0.5, 2);
    expect(SUN_SOFT_RAD).toBeGreaterThan(0.004);
  });
  it('is 1 with the sun behind the camera (the wall is the other way) and straight overhead, 0 below the horizon, never NaN', () => {
    expect(sunVisibility(h, 0, 0, sunAt(5, -1, 0))).toBe(1);
    expect(sunVisibility(h, 0, 0, [0, 1, 0])).toBe(1);
    expect(sunVisibility(h, 0, 0, sunAt(-3, 1, 0))).toBe(0);
  });
  it('samples the march grid bilinearly and clamps outside', () => {
    expect(sampleMarch(h, 600, 0)).toBe(100);
    expect(sampleMarch(h, MARCH_GRID.x0 - 1000, 0)).toBe(sampleMarch(h, MARCH_GRID.x0, 0));
  });
});

describe('sunMoved', () => {
  it('fires past the threshold only', () => {
    const a: [number, number, number] = [0.6, 0.1, 0.79];
    const b = sunAt(5.74, 0.6, 0.79);
    expect(sunMoved(a, a, SUN_REBUILD_RAD)).toBe(false);
    expect(sunMoved([0, -1, 0], a, SUN_REBUILD_RAD)).toBe(true);
    expect(typeof sunMoved(a, b, SUN_REBUILD_RAD)).toBe('boolean');
  });
});

describe('the ridge shades the lineup at sunrise (spec §3: sunbreak about 08:05 on 15 July)', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  const h = buildMarchHeights((x, z) => land.heightAt(x, z));
  const [lx, , lz] = DEFAULT_LINEUP_POSITION;
  const vis = (hours: number) => sunVisibility(h, lx, lz, sunForConditions({ date: '2026-07-15', timeOfDay: hours }).direction);
  it('is in shade at 07:45 and in sun at 08:15', () => {
    expect(vis(7.75)).toBe(0);
    expect(vis(8.25)).toBe(1);
  });
  it('the sunbreak falls between 08:00 and 08:10', () => {
    let lo = 7.75, hi = 8.25;
    for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (vis(mid) < 0.5) lo = mid; else hi = mid; }
    expect(lo).toBeGreaterThan(8.0);
    expect(lo).toBeLessThan(8 + 10 / 60);
  });
});
