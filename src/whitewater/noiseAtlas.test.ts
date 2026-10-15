import { describe, expect, it } from 'vitest';
import { NOISE_SIZE, atlasAt, bakeNoiseAtlas, periodicPerlin } from './noiseAtlas';

const bake = bakeNoiseAtlas(NOISE_SIZE);
const stats = (c: number) => {
  let s = 0, s2 = 0, lo = 1, hi = 0;
  const n = NOISE_SIZE * NOISE_SIZE;
  for (let i = 0; i < n; i++) { const v = bake[i * 4 + c]; s += v; s2 += v * v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { mean: s / n, sd: Math.sqrt(s2 / n - (s / n) ** 2), lo, hi };
};
/** Correlation length (texels) of channel c along (du, dv): the lag where the autocorrelation first falls below 1/e. */
const corr = (c: number, du: number, dv: number) => {
  const { mean, sd } = stats(c);
  for (let lag = 1; lag < 64; lag++) {
    let s = 0, m = 0;
    for (let j = 0; j < NOISE_SIZE; j += 3) for (let i = 0; i < NOISE_SIZE; i += 3) {
      const a = bake[(j * NOISE_SIZE + i) * 4 + c] - mean;
      const ii = (i + du * lag) % NOISE_SIZE, jj = (j + dv * lag) % NOISE_SIZE;
      s += a * (bake[(jj * NOISE_SIZE + ii) * 4 + c] - mean); m++;
    }
    if (s / m / (sd * sd) < 1 / Math.E) return lag;
  }
  return 64;
};

describe('the spray noise atlas (breaking-look L3)', () => {
  it('each channel is centred on ½ with a usable spread (the puff breakup of mx_noise × ½ + ½)', () => {
    for (let c = 0; c < 4; c++) {
      const s = stats(c);
      expect(Math.abs(s.mean - 0.5)).toBeLessThan(0.04);
      expect(s.sd).toBeGreaterThan(0.1);
      expect(s.sd).toBeLessThan(0.3);
      expect(s.lo).toBeGreaterThanOrEqual(0);
      expect(s.hi).toBeLessThanOrEqual(1);
    }
  });

  it('tiles: the noise is periodic over the tile and the filtered read wraps without a seam', () => {
    for (const [u, v] of [[0.13, 0.71], [0.5, 0.02]]) expect(periodicPerlin(u + 1, v, 8, 8, 11)).toBeCloseTo(periodicPerlin(u, v, 8, 8, 11), 9);
    const edge = Math.abs(atlasAt(bake, NOISE_SIZE, 1 - 0.1 / NOISE_SIZE, 0.3, 0) - atlasAt(bake, NOISE_SIZE, 0.1 / NOISE_SIZE, 0.3, 0));
    expect(edge).toBeLessThan(0.05);
  });

  it('the fibre channel (B) streaks: its correlation runs >= 3x longer along u than along v', () => {
    expect(corr(2, 1, 0) / corr(2, 0, 1)).toBeGreaterThanOrEqual(3);
    // the shape channel is round
    const r = corr(0, 1, 0) / corr(0, 0, 1);
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThan(1.4);
  });
});
