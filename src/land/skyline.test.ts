import { describe, expect, it } from 'vitest';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import { readBakedLand } from './bakedLand.testutil';
import { decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { bearingIndex, reflectionCover, skylineElevationFrom, skylineTable } from './skyline';

const deg = (r: number) => (r * 180) / Math.PI;

describe('skylineTable on a synthetic ridge', () => {
  const ridge = (x: number) => (x >= 500 ? 100 : 0);
  const eye = { x: 0, y: 1.5, z: 0 };
  const t = skylineTable(ridge, eye);
  it('finds the ridge to the east and nothing to the west', () => {
    expect(bearingIndex(1, 0)).toBe(90);
    expect(deg(skylineElevationFrom(t, 90, 0, eye.y))).toBeCloseTo(deg(Math.atan((100 - 1.5) / 500)), 0);
    expect(skylineElevationFrom(t, 270, 0, eye.y)).toBe(-Math.PI / 2);
  });
  it('sees the ridge higher from a point closer to it (plan ruling P8)', () => {
    expect(skylineElevationFrom(t, 90, 200, 0)).toBeGreaterThan(skylineElevationFrom(t, 90, 0, 0));
  });
  it('covers reflections below the skyline and not above it', () => {
    const down = (e: number): [number, number, number] => [Math.cos(e), Math.sin(e), 0];
    const sk = Math.atan((100 - 0) / 500);
    expect(reflectionCover(t, eye, [0, 0, 0], down(sk - 0.02))).toBe(1);
    expect(reflectionCover(t, eye, [0, 0, 0], down(sk + 0.02))).toBe(0);
    expect(reflectionCover(t, eye, [0, 0, 0], [-1, 0.01, 0])).toBe(0);
  });
  it('water beyond the skyline point along the bearing reflects no land (final review I2)', () => {
    // From 40 m up, water 1 km out past the ridge's skyline point (500 m): the land is behind the reflected ray.
    const high = skylineTable(ridge, { x: 0, y: 40, z: 0 });
    expect(reflectionCover(high, { x: 0, y: 40, z: 0 }, [1000, 0, 0], [0.99, 0.02, 0])).toBe(0);
    // Just short of it the land is still ahead.
    expect(reflectionCover(high, { x: 0, y: 40, z: 0 }, [400, 0, 0], [0.99, 0.02, 0])).toBe(1);
  });
  it('from high above the ridge the skyline is below the horizon, and the reflection sees no land', () => {
    const high = skylineTable(ridge, { x: 0, y: 300, z: 0 });
    expect(skylineElevationFrom(high, 90, 0, 300)).toBeLessThan(0);
    expect(reflectionCover(high, { x: 0, y: 300, z: 0 }, [0, 0, 0], [0.99, 0.1, 0])).toBe(0);
  });
});

describe('the skyline from the lineup (spec §3)', () => {
  const land = new LandHeight(decodeLandFile(readBakedLand()));
  const [x, y, z] = DEFAULT_LINEUP_POSITION;
  const t = skylineTable((a, b) => land.heightAt(a, b), { x, y, z });
  it('is 7–8.5° due east and 0.5–2.5° along the coast', () => {
    const e = (b: number) => deg(skylineElevationFrom(t, b, 0, y));
    expect(e(90)).toBeGreaterThan(7); expect(e(90)).toBeLessThan(8.5);
    expect(e(0)).toBeGreaterThan(0.5); expect(e(0)).toBeLessThan(2.5);
    expect(e(165)).toBeGreaterThan(0.5); expect(e(165)).toBeLessThan(2.5);
  });
});
