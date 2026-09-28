import { describe, expect, it } from 'vitest';
import { HEIGHT_STEP_M, type LandFile, decodeLandFile, encodeLandFile } from './landData';

const grid = (x0: number, nx: number, nz: number, cellM = 4) => ({ x0, z0: -8, cellM, nx, nz });

function sample(): LandFile {
  const fine = grid(-8, 5, 3), ring = grid(-64, 3, 4, 32), sky = grid(-8, 2, 2, 16);
  return {
    fine, ring, sky,
    fineHeights: Float32Array.from({ length: 15 }, (_, i) => i * 7.31 - 3),
    ringHeights: Float32Array.from({ length: 12 }, (_, i) => i * 50.02),
    skyView: Float32Array.from([1, 0.5, 0.25, 0.9]),
    fineWaterline: Float32Array.from([190, NaN, 176.5]),
    ringWaterline: Float32Array.from([100, 120, NaN, 140]),
  };
}

describe('the land file', () => {
  it('round-trips: heights to 0.05 m (negative stored as 0), sky view to 1/255, waterlines exactly (NaN kept)', () => {
    const f = sample();
    const g = decodeLandFile(encodeLandFile(f));
    expect([g.fine, g.ring, g.sky]).toEqual([f.fine, f.ring, f.sky]);
    f.fineHeights.forEach((h, i) => expect(Math.abs(g.fineHeights[i] - Math.max(0, h))).toBeLessThanOrEqual(HEIGHT_STEP_M / 2 + 1e-6));
    f.ringHeights.forEach((h, i) => expect(Math.abs(g.ringHeights[i] - h)).toBeLessThanOrEqual(HEIGHT_STEP_M / 2 + 1e-6));
    f.skyView.forEach((v, i) => expect(Math.abs(g.skyView[i] - v)).toBeLessThanOrEqual(1 / 510 + 1e-6));
    expect(Array.from(g.fineWaterline)).toEqual([190, NaN, 176.5]);
    expect(Array.from(g.ringWaterline)).toEqual([100, 120, NaN, 140]);
  });
  it('is deterministic', () => {
    expect(Array.from(encodeLandFile(sample()))).toEqual(Array.from(encodeLandFile(sample())));
  });
  it('rejects a wrong magic, a wrong version and a truncated file', () => {
    const bytes = encodeLandFile(sample());
    const badMagic = bytes.slice(); badMagic[0] ^= 0xff;
    expect(() => decodeLandFile(badMagic)).toThrow(/magic/);
    const badVersion = bytes.slice(); badVersion[4] = 99;
    expect(() => decodeLandFile(badVersion)).toThrow(/version/);
    expect(() => decodeLandFile(bytes.slice(0, bytes.length - 3))).toThrow(/size/);
  });
});
