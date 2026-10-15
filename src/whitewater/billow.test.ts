import { describe, expect, it } from 'vitest';
import { BILLOW_GRAD_SCALE, BILLOW_OCTAVES, BILLOW_SKY, BILLOW_SUN, BILLOW_TILE_N, bakeBillowTile, billowAt, billowShares, flowPhases, tileField } from './billow';

/** The distance (m) at which the field's autocorrelation along (dx, dy) first falls below 1/e, averaged over many lines. */
function corrLength(dx: number, dy: number, dz = 0): number {
  const step = 0.05, lags = 120, lines = 60, n = 400;
  const acc = new Float64Array(lags);
  for (let l = 0; l < lines; l++) {
    const ox = 37.1 * l + 3.3, oy = -21.7 * l + 11.9;
    const v = Array.from({ length: n + lags }, (_, i) => billowAt(ox + dx * i * step, oy + dy * i * step, 5.3 * l + dz * i * step, 0.5).h);
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

/** The baked tile read as the GPU's linear filter with repeat wrapping reads it (texel centres at (i + ½)/N). */
function sampleBake(bake: Float32Array, n: number, u: number, v: number, w: number): number[] {
  const g = [u, v, w].map((c) => c * n - 0.5), i0 = g.map(Math.floor), t = g.map((c, k) => c - i0[k]);
  const out = [0, 0, 0, 0];
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const wt = (dx ? t[0] : 1 - t[0]) * (dy ? t[1] : 1 - t[1]) * (dz ? t[2] : 1 - t[2]);
    const ix = (((i0[0] + dx) % n) + n) % n, iy = (((i0[1] + dy) % n) + n) % n, iz = (((i0[2] + dz) % n) + n) % n;
    const o = ((iz * n + iy) * n + ix) * 4;
    for (let c = 0; c < 4; c++) out[c] += wt * bake[o + c];
  }
  return out;
}

describe('the billow field (7b S3; breaking-look item 1 + L1): billows at three scales from one baked tile', () => {
  it('three octaves: 2.5 m and 0.8 m in the height, 0.25 m the grain (normal only)', () => {
    expect(BILLOW_OCTAVES.map((o) => o.wavelengthM)).toEqual([2.5, 0.8, 0.25]);
    expect(BILLOW_OCTAVES[2].heightWeight).toBe(0);
  });

  it('the tile field is periodic over the unit cube (it tiles) with unit variance', () => {
    for (const [u, v, w] of [[0.1, 0.2, 0.3], [0.77, 0.05, 0.6]]) {
      const a = tileField(u, v, w);
      for (const b of [tileField(u + 1, v, w), tileField(u, v + 1, w), tileField(u, v, w - 1)]) for (let c = 0; c < 4; c++) expect(b[c]).toBeCloseTo(a[c], 6);
    }
    let s = 0, s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const f = tileField((i * 0.6180339) % 1, (i * 0.4142135) % 1, (i * 0.7320508) % 1)[0]; s += f; s2 += f * f; }
    expect(Math.abs(s / n)).toBeLessThan(0.05);
    expect(Math.sqrt(s2 / n - (s / n) ** 2)).toBeGreaterThan(0.9);
    expect(Math.sqrt(s2 / n - (s / n) ** 2)).toBeLessThan(1.1);
  });

  it('L1 bar: the baked 64³ tile read through a linear filter ≡ the cosine field within 1 % at 1000 points (field: 1 % of its ±2σ span; gradient: 1 % of its own ±2σ span)', () => {
    const bake = bakeBillowTile(BILLOW_TILE_N);
    let worstF = 0, worstG = 0, s2g = 0;
    for (let i = 0; i < 1000; i++) {
      const u = (i * 0.6180339 + 0.013) % 1, v = (i * 0.4142135 + 0.029) % 1, w = (i * 0.7320508 + 0.071) % 1;
      const a = tileField(u, v, w), b = sampleBake(bake, BILLOW_TILE_N, u, v, w);
      worstF = Math.max(worstF, Math.abs(a[0] - b[0]));
      for (let c = 1; c < 4; c++) { worstG = Math.max(worstG, Math.abs(a[c] / BILLOW_GRAD_SCALE - b[c])); s2g += (a[c] / BILLOW_GRAD_SCALE) ** 2; }
    }
    const sigmaG = Math.sqrt(s2g / 3000);
    expect(worstF).toBeLessThan(0.01 * 4);
    expect(worstG).toBeLessThan(0.01 * 4 * sigmaG);
  });

  it('is isotropic in 3-D: the autocorrelation lengths along x, y (up), z and two diagonals agree within 20 % (no streaks down the face)', () => {
    const lx = corrLength(1, 0), ly = corrLength(0, 1), lz = corrLength(0, 0, 1), ld = corrLength(Math.SQRT1_2, Math.SQRT1_2), le = corrLength(0, Math.SQRT1_2, Math.SQRT1_2);
    expect(lx).toBeGreaterThan(0.15);
    for (const l of [ly, lz, ld, le]) expect(Math.abs(l - lx) / lx).toBeLessThan(0.2);
  });

  it('its height is in [0, 1], centred, and spans most of it; the clumps likewise', () => {
    const hs: number[] = [], cs: number[] = [];
    for (let i = 0; i < 4000; i++) { const b = billowAt((i * 0.731) % 97, (i * 0.377) % 89, (i * 0.519) % 79, 0.5); hs.push(b.h); cs.push(b.clump); }
    for (const v of [hs, cs]) {
      v.sort((a, b) => a - b);
      expect(v[0]).toBeGreaterThanOrEqual(0);
      expect(v[v.length - 1]).toBeLessThanOrEqual(1);
      expect(Math.abs(v[v.length >> 1] - 0.5)).toBeLessThan(0.05);
      expect(v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)]).toBeGreaterThan(0.6);
    }
  });

  it('its steepest slopes are ~45° (the 99th percentile of |gradient| along a surface about 1)', () => {
    const s: number[] = [];
    for (let i = 0; i < 6000; i++) { const b = billowAt((i * 0.613) % 101, (i * 0.287) % 83, (i * 0.443) % 71, 0.5); s.push(Math.hypot(b.gx, b.gz)); }
    s.sort((a, b) => a - b);
    const p99 = s[Math.floor(s.length * 0.99)];
    expect(p99).toBeGreaterThan(0.85);
    expect(p99).toBeLessThan(1.15);
  });

  it('the gradient is the slope of the bump (a finite difference)', () => {
    const e = 1e-4, f: [number, number, number] = [3, 0, -1], b = billowAt(3.1, -7.4, 1.3, 2.3, f);
    expect(b.gx).toBeCloseTo((billowAt(3.1 + e, -7.4, 1.3, 2.3, f).bump - b.bump) / e, 2);
    expect(b.gy).toBeCloseTo((billowAt(3.1, -7.4 + e, 1.3, 2.3, f).bump - b.bump) / e, 2);
    expect(b.gz).toBeCloseTo((billowAt(3.1, -7.4, 1.3 + e, 2.3, f).bump - b.bump) / e, 2);
  });

  it('the flow blend: two reads half a period apart, each at zero weight at its reset, contrast renormalised', () => {
    for (const t of [0, 0.3, 1, 1.7, 5.2]) {
      const p = flowPhases(t);
      expect(Math.hypot(...p.w)).toBeCloseTo(1, 9);
      for (let k = 0; k < 2; k++) if (p.age[k] < 1e-6) expect(p.w[k]).toBeCloseTo(0, 6);
    }
    // The h spread is the same at a single read (t = 0: one weight 0) and mid-blend (equal weights).
    const spread = (t: number) => { const v = Array.from({ length: 3000 }, (_, i) => billowAt((i * 0.731) % 97, (i * 0.377) % 89, (i * 0.519) % 79, t).h); const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    expect(Math.abs(spread(0.5) - spread(0)) / spread(0)).toBeLessThan(0.15);
  });

  it('item 1 bar: the billows drift with the bore at its speed ± 10 % (best-match shift of the field along travel)', () => {
    const v = 4.5, dt = 0.25, flow: [number, number, number] = [v, 0, 0];
    let best = 0, bestShift = 0;
    for (let s = 0; s <= 2.0; s += 0.01) {
      let c = 0;
      for (let i = 0; i < 400; i++) { const x = (i * 0.37) % 40, z = (i * 0.91) % 30, y = (i * 0.13) % 3; c += (billowAt(x, y, z, 0.9, flow).h - 0.5) * (billowAt(x + s, y + BILLOW_RISE_DT(dt), z, 0.9 + dt, flow).h - 0.5); }
      if (c > best) { best = c; bestShift = s; }
    }
    expect(Math.abs(bestShift / dt - v) / v).toBeLessThan(0.1);
  });

  it('LOD: an octave under ~4 px a wavelength fades to the mean (no shimmer far off)', () => {
    const near = billowAt(1.3, 0.7, 2.1, 0.4, [0, 0, 0], 0), far = billowAt(1.3, 0.7, 2.1, 0.4, [0, 0, 0], 10);
    expect(far.h).toBeCloseTo(0.5, 6);
    expect(far.gx).toBeCloseTo(0, 6);
    expect(Math.abs(near.gx) + Math.abs(near.gz)).toBeGreaterThan(0);
  });

  it('the troughs are occluded: sky × (0.4 + 0.6 h), sun × (0.6 + 0.4 h)', () => {
    expect(BILLOW_SKY).toEqual([0.4, 0.6]);
    expect(BILLOW_SUN).toEqual([0.6, 0.4]);
    expect(billowShares(0)).toEqual({ sky: 0.4, sun: 0.6 });
    expect(billowShares(1)).toEqual({ sky: 1, sun: 1 });
  });
});

/** The billows' own rise over dt (BILLOW_RISE_MS): the drift test follows it so only the bore's push is measured. */
function BILLOW_RISE_DT(dt: number): number { return 0.3 * dt; }

describe('the wall silhouette (item 1): lifted by the 2.5 m octave × 0.15 A × solid', () => {
  it('is 0 off the solid boil, spans ±~0.3 A on it, and is the 2.5 m octave (correlation length ~ a metre)', async () => {
    const { billowLiftAt } = await import('./billow');
    expect(Math.abs(billowLiftAt(1, 2, 3, 0.4, [2, 0, 0], 3, 0))).toBe(0);
    const v = Array.from({ length: 2000 }, (_, i) => billowLiftAt((i * 0.731) % 97, (i * 0.377) % 9, (i * 0.519) % 79, 0.4, [2, 0, 0], 3, 1));
    const sd = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length);
    expect(sd / 3).toBeGreaterThan(0.1);
    expect(sd / 3).toBeLessThan(0.2);
  });
});
