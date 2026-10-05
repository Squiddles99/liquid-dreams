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
  it('fades out past a headland tip instead of cutting off at a bearing boundary', () => {
    // Land north-east only (bearings 0–90): the tip is between bearing 90 (land) and 91 (open sea).
    const cape = skylineTable((x, z) => (x >= 500 && z <= 0 ? 100 : 0), eye);
    const at = (b: number): [number, number, number] => { const a = (b * Math.PI) / 180; return [Math.sin(a), 0.01, -Math.cos(a)]; };
    const c = (b: number) => reflectionCover(cape, eye, [0, 0, 0], at(b));
    expect(c(89.5)).toBeCloseTo(1, 5);
    expect(c(91.5)).toBe(0);
    // Across the half-degree boundary between the two bins the cover changes a little, not from all to nothing.
    expect(Math.abs(c(90.45) - c(90.55))).toBeLessThan(0.2);
    expect(c(90.5)).toBeGreaterThan(0.3); expect(c(90.5)).toBeLessThan(0.7);
  });
  it('a ray the waves send below the horizon sees land by how high it stands, not all land alike', () => {
    const down: [number, number, number] = [0.999, -0.03, 0];
    const at = (h: number) => reflectionCover(skylineTable((x) => (x >= 500 ? h : 0), eye), eye, [0, 0, 0], down);
    expect(at(2)).toBeLessThan(0.15); // a 2 m spit, 0.2° up
    expect(at(100)).toBe(1); // a ridge 11° up
    // Rising land fills it in gradually.
    expect(at(6)).toBeGreaterThan(at(4)); expect(at(8)).toBeGreaterThan(at(6)); expect(at(8)).toBeLessThan(1);
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
  // Due east 7.5–9.5°: the reef moved in toward the beach (2026-10-05) and the land with it, the ridge 96 m nearer the
  // lineup (it read 7–8.5° from 190 m off the beach).
  it('is 7.5–9.5° due east and 0.5–2.5° along the coast', () => {
    const e = (b: number) => deg(skylineElevationFrom(t, b, 0, y));
    expect(e(90)).toBeGreaterThan(7.5); expect(e(90)).toBeLessThan(9.5);
    expect(e(0)).toBeGreaterThan(0.5); expect(e(0)).toBeLessThan(2.5);
    expect(e(165)).toBeGreaterThan(0.5); expect(e(165)).toBeLessThan(2.5);
  });
});
