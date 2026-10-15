import { describe, expect, it } from 'vitest';
import { BORE_PUSH } from './foamStep';
import { WW_BASE_COVER, WW_BASE_SKY, WW_BASE_SUN, WW_ISOTROPIC, boreFromStations, heightFrac, wallShade } from './whitewaterLook';

describe('the white-water wall (breaking-look item 1): top bright, base shadowed, clumps', () => {
  it('heightFrac is the height above the tide over the bore height (floored at 0.3 m)', () => {
    expect(heightFrac(2.5, 0.5, 4)).toBeCloseTo(0.5, 9);
    expect(heightFrac(0.6, 0.5, 0.1)).toBeCloseTo(0.1 / 0.3, 9);
  });

  it('the base (low and steep): sky × 0.6, sun × 0.5, cover × 0.7 (the column shows), single scattering', () => {
    const b = wallShade(0.05, 0, 1);
    expect(b.base).toBeCloseTo(1, 6);
    expect(b.skyMul).toBeCloseTo(WW_BASE_SKY, 6);
    expect(b.sunMul).toBeCloseTo(WW_BASE_SUN, 6);
    expect(b.coverMul).toBeCloseTo(WW_BASE_COVER, 6);
    expect(b.isotropic).toBeCloseTo(WW_ISOTROPIC[0], 6);
  });

  it('the top: fully lit, multiple scattering (isotropic 0.8)', () => {
    const t = wallShade(0.8, 0.2, 1);
    expect(t.base).toBe(0);
    expect(t.skyMul).toBe(1);
    expect(t.sunMul).toBe(1);
    expect(t.isotropic).toBeCloseTo(WW_ISOTROPIC[1], 9);
  });

  it('flat bore foam seen from above is not base, however low (normal up)', () => {
    expect(wallShade(0.0, 1, 0.5).base).toBe(0);
  });

  it('the clumps vary the cover 0.85–1 and the brightness 0.85–1.1', () => {
    expect(wallShade(1, 1, 0).coverMul).toBeCloseTo(0.85, 9);
    expect(wallShade(1, 1, 1).coverMul).toBeCloseTo(1, 9);
    expect(wallShade(1, 1, 0).bright).toBeCloseTo(0.85, 9);
    expect(wallShade(1, 1, 1).bright).toBeCloseTo(1.1, 9);
  });

  it('the bore: the tallest boiling station, flowing along the boiling stations\' travel at their c × BORE_PUSH', () => {
    const b = boreFromStations([
      { nx: 1, nz: 0, c: 6, A: 2, boil: 0.5 }, { nx: 1, nz: 0, c: 8, A: 3, boil: 0.2 }, { nx: 0, nz: 1, c: 20, A: 9, boil: 0 },
    ]);
    expect(b.height).toBe(3);
    expect(b.flow[0]).toBeCloseTo(7 * BORE_PUSH, 9);
    expect(b.flow[2]).toBeCloseTo(0, 9);
    expect(boreFromStations([{ nx: 0, nz: 1, c: 5, A: 2, boil: 0 }])).toEqual({ height: 2, flow: [0, 0, 0] });
  });
});
