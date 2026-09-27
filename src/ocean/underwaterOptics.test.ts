import { describe, expect, it } from 'vitest';
import { WATER_IOR } from '../seabed/waterColumn';
import { CRITICAL_ANGLE_RAD, UNDERWATER_BAND_M, alongPath, fresnelFromInside, nextUnderwater, refractOut, waterColourAtDepth } from './underwaterOptics';

const deg = (d: number): number => (d * Math.PI) / 180;
const DOWN: [number, number, number] = [0, -1, 0];

describe('underwater optics', () => {
  it('the critical angle is asin(1 / 1.333) = 48.6°', () => {
    expect(CRITICAL_ANGLE_RAD).toBeCloseTo(Math.asin(1 / WATER_IOR), 12);
    expect((CRITICAL_ANGLE_RAD * 180) / Math.PI).toBeCloseTo(48.6, 1);
  });
  it('a ray 30° from straight up in the water leaves at 41.8° in the air (Snell), and none leaves beyond the critical angle', () => {
    // v points from the surface point down toward the camera: 30° off the downward normal.
    const v: [number, number, number] = [Math.sin(deg(30)), -Math.cos(deg(30)), 0];
    const t = refractOut(v, DOWN)!;
    expect(t).not.toBeNull();
    expect(Math.hypot(...t)).toBeCloseTo(1, 9);
    expect(t[1]).toBeGreaterThan(0);
    expect((Math.acos(t[1]) * 180) / Math.PI).toBeCloseTo((Math.asin(WATER_IOR * Math.sin(deg(30))) * 180) / Math.PI, 6);
    expect((Math.acos(t[1]) * 180) / Math.PI).toBeCloseTo(41.8, 1);
    // It bends away from the normal, to the side opposite the camera.
    expect(t[0]).toBeLessThan(0);
    const beyond: [number, number, number] = [Math.sin(deg(50)), -Math.cos(deg(50)), 0];
    expect(refractOut(beyond, DOWN)).toBeNull();
  });
  it('Fresnel from inside: 0.02 straight up, rising monotonically to exactly 1 at the critical angle, 1 beyond, never NaN', () => {
    expect(fresnelFromInside(1)).toBeCloseTo(((WATER_IOR - 1) / (WATER_IOR + 1)) ** 2, 9);
    expect(fresnelFromInside(1)).toBeCloseTo(0.0204, 3);
    let prev = 0;
    for (let a = 0; a < CRITICAL_ANGLE_RAD; a += deg(0.25)) {
      const r = fresnelFromInside(Math.cos(a));
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
    expect(fresnelFromInside(Math.cos(CRITICAL_ANGLE_RAD))).toBeCloseTo(1, 6);
    expect(fresnelFromInside(Math.cos(CRITICAL_ANGLE_RAD - 1e-9))).toBeCloseTo(1, 3);
    for (const a of [50, 60, 89.9]) expect(fresnelFromInside(Math.cos(deg(a)))).toBe(1);
  });
  it('the water dims with depth, and a path blends from what is at its end to the water colour', () => {
    const up: [number, number, number] = [0.001, 0.01, 0.02], ext: [number, number, number] = [0.45, 0.07, 0.02];
    expect(waterColourAtDepth(up, ext, 0)).toEqual(up);
    const at10 = waterColourAtDepth(up, ext, 10);
    for (let i = 0; i < 3; i++) expect(at10[i]).toBeCloseTo(up[i] * Math.exp(-ext[i] * 10), 12);
    const end: [number, number, number] = [1, 2, 3];
    expect(alongPath(end, up, ext, 0)).toEqual(end);
    const far = alongPath(end, up, ext, 5000);
    for (let i = 0; i < 3; i++) expect(far[i]).toBeCloseTo(up[i], 9);
  });
  it('the underwater switch has a ±5 cm band, so a camera riding the surface does not flicker', () => {
    expect(UNDERWATER_BAND_M).toBe(0.05);
    expect(nextUnderwater(false, 0.0, 0.0)).toBe(false);
    expect(nextUnderwater(false, -0.04, 0.0)).toBe(false);
    expect(nextUnderwater(false, -0.06, 0.0)).toBe(true);
    expect(nextUnderwater(true, 0.04, 0.0)).toBe(true);
    expect(nextUnderwater(true, 0.06, 0.0)).toBe(false);
    // Riding a 1 m chop at the waterline: the state changes only when the band is crossed.
    let s = false, flips = 0;
    for (let i = 0; i < 1000; i++) { const n = nextUnderwater(s, 0.03 * Math.sin(i * 0.37), 0); if (n !== s) flips++; s = n; }
    expect(flips).toBe(0);
  });
});
