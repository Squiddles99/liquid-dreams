import { describe, expect, it } from 'vitest';
import { WOMB_LOCATION } from '../conditions/defaults';
import { sunDirectionWorld, sunPosition } from './sunPosition';

const at = (iso: string) => sunPosition(WOMB_LOCATION.latDeg, WOMB_LOCATION.lonDeg, new Date(iso));
const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('sunPosition at The Womb', () => {
  it('default morning session: 2026-07-15 08:15 AWST', () => {
    const s = at('2026-07-15T00:15:00Z');
    expect(s.elevationDeg).toBeCloseTo(8.542, 1);
    expect(azDiff(s.azimuthDeg, 56.742)).toBeLessThan(0.1);
  });
  it('autumn glass-off: 2026-04-20 09:30 AWST', () => {
    const s = at('2026-04-20T01:30:00Z');
    expect(s.elevationDeg).toBeCloseTo(29.411, 1);
    expect(azDiff(s.azimuthDeg, 49.17)).toBeLessThan(0.1);
  });
  it('golden hour: 2026-07-15 16:50 AWST', () => {
    const s = at('2026-07-15T08:50:00Z');
    expect(s.elevationDeg).toBeCloseTo(6.316, 1);
    expect(azDiff(s.azimuthDeg, 301.23)).toBeLessThan(0.1);
  });
  it('winter solar noon is due north at 34.58°', () => {
    const s = at('2026-07-15T04:26:01Z');
    expect(s.elevationDeg).toBeCloseTo(34.581, 1);
    expect(azDiff(s.azimuthDeg, 0)).toBeLessThan(0.5);
  });
  it('summer solstice noon elevation 79.54°', () => {
    expect(at('2026-12-21T04:17:53Z').elevationDeg).toBeCloseTo(79.539, 1);
  });
  it('sunset and sunrise sit at -0.833° geometric elevation', () => {
    expect(at('2026-07-15T09:28:56.760Z').elevationDeg).toBeCloseTo(-0.833, 1);
    expect(at('2026-04-20T22:47:09.974Z').elevationDeg).toBeCloseTo(-0.833, 1);
  });
});

describe('sunDirectionWorld', () => {
  it('az 90, el 0 → +X (east)', () => {
    const [x, y, z] = sunDirectionWorld(90, 0);
    expect(x).toBeCloseTo(1); expect(y).toBeCloseTo(0); expect(z).toBeCloseTo(0);
  });
  it('az 0, el 45 → up and north (-Z)', () => {
    const [x, y, z] = sunDirectionWorld(0, 45);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(Math.SQRT1_2); expect(z).toBeCloseTo(-Math.SQRT1_2);
  });
  it('is unit length', () => {
    const [x, y, z] = sunDirectionWorld(123, 17);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });
});
