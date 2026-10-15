import { describe, expect, it } from 'vitest';
import { BILLOW_OCTAVES, BILLOW_SKY, BILLOW_SUN, billowAt, billowShares } from './billow';

/** The distance (m) at which the field's autocorrelation along (dx, dy) first falls below 1/e, averaged over many lines. */
function corrLength(dx: number, dy: number, dz = 0): number {
  const step = 0.05, lags = 120, lines = 60, n = 400;
  const acc = new Float64Array(lags);
  for (let l = 0; l < lines; l++) {
    const ox = 37.1 * l + 3.3, oy = -21.7 * l + 11.9;
    const v = Array.from({ length: n + lags }, (_, i) => billowAt(ox + dx * i * step, oy + dy * i * step, 5.3 * l + dz * i * step, 0).h);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const c = v.map((x) => x - mean), var0 = c.reduce((a, b) => a + b * b, 0) / c.length;
    for (let k = 0; k < lags; k++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += c[i] * c[i + k];
      acc[k] += s / n / var0;
    }
  }
  for (let k = 0; k < lags; k++) if (acc[k] / lines < 1 / Math.E) return k * step;
  return lags * step;
}

describe('the billow field (7b S3 ruling): soft 1–3 m billows on the solid boil', () => {
  it('two octaves, ~2.5 m and ~0.8 m', () => {
    expect(BILLOW_OCTAVES.map((o) => o.wavelengthM)).toEqual([2.5, 0.8]);
  });

  it('is isotropic in 3-D: the autocorrelation lengths along x, y (up), z and two diagonals agree within 20 % (no streaks down the face)', () => {
    const lx = corrLength(1, 0), ly = corrLength(0, 1), lz = corrLength(0, 0, 1), ld = corrLength(Math.SQRT1_2, Math.SQRT1_2), le = corrLength(0, Math.SQRT1_2, Math.SQRT1_2);
    expect(lx).toBeGreaterThan(0.2);
    for (const l of [ly, lz, ld, le]) expect(Math.abs(l - lx) / lx).toBeLessThan(0.2);
  });

  it('its height is in [0, 1], centred, and spans most of it', () => {
    const hs: number[] = [];
    for (let i = 0; i < 4000; i++) hs.push(billowAt((i * 0.731) % 97, (i * 0.377) % 89, (i * 0.519) % 79, 0).h);
    hs.sort((a, b) => a - b);
    expect(hs[0]).toBeGreaterThanOrEqual(0);
    expect(hs[hs.length - 1]).toBeLessThanOrEqual(1);
    expect(Math.abs(hs[hs.length >> 1] - 0.5)).toBeLessThan(0.05);
    expect(hs[Math.floor(hs.length * 0.95)] - hs[Math.floor(hs.length * 0.05)]).toBeGreaterThan(0.6);
  });

  it('its steepest slopes are ~45° (the 99th percentile of |gradient| about 1)', () => {
    const s: number[] = [];
    // Along a surface the slope is the gradient's tangential part; over random surface orientations ~ the 2-D share.
    for (let i = 0; i < 6000; i++) { const b = billowAt((i * 0.613) % 101, (i * 0.287) % 83, (i * 0.443) % 71, 0); s.push(Math.hypot(b.gx, b.gz)); }
    s.sort((a, b) => a - b);
    const p99 = s[Math.floor(s.length * 0.99)];
    expect(p99).toBeGreaterThan(0.85);
    expect(p99).toBeLessThan(1.15);
  });

  it('the gradient is the slope of the bump (a finite difference of h × the bump height)', () => {
    const e = 1e-4, b = billowAt(3.1, -7.4, 1.3, 2), bx = billowAt(3.1 + e, -7.4, 1.3, 2), by = billowAt(3.1, -7.4 + e, 1.3, 2), bz = billowAt(3.1, -7.4, 1.3 + e, 2);
    expect(b.gx).toBeCloseTo(((bx.bump - b.bump) / e), 3);
    expect(b.gy).toBeCloseTo(((by.bump - b.bump) / e), 3);
    expect(b.gz).toBeCloseTo(((bz.bump - b.bump) / e), 3);
  });

  it('drifts slowly with time (the field changes, but little in a tenth of a second)', () => {
    const a = billowAt(5, 5, 5, 0).h, b = billowAt(5, 5, 5, 0.1).h, c = billowAt(5, 5, 5, 6).h;
    expect(Math.abs(b - a)).toBeLessThan(0.05);
    expect(Math.abs(c - a)).toBeGreaterThan(0.01);
  });

  it('the troughs are occluded: sky × (0.4 + 0.6 h), sun × (0.6 + 0.4 h)', () => {
    expect(BILLOW_SKY).toEqual([0.4, 0.6]);
    expect(BILLOW_SUN).toEqual([0.6, 0.4]);
    expect(billowShares(0)).toEqual({ sky: 0.4, sun: 0.6 });
    expect(billowShares(1)).toEqual({ sky: 1, sun: 1 });
  });
});
