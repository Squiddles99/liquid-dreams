import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { createRng } from '../conditions/rng';
import {
  CASCADE_SIZES_M, DEFAULT_SPECTRUM_PARAMS, FFT_SIZE, GRAVITY,
  alphaForHs, buildInitialSpectrum, buildOceanSpectra, buildSpectrumComponents, cascadeBands,
  jonswapShape, omegaForK, spreading, windSeaComponent,
} from './spectrum';

describe('dispersion and JONSWAP', () => {
  it('deep-water dispersion ω = sqrt(g k)', () => {
    expect(omegaForK((2 * Math.PI) / 100)).toBeCloseTo(Math.sqrt(GRAVITY * 0.0628319), 5);
  });
  it('JONSWAP peaks at ωp', () => {
    const wp = (2 * Math.PI) / 15;
    let best = 0, bestW = 0;
    for (let w = 0.2; w < 2; w += 0.0005) { const s = jonswapShape(w, wp, 3.3); if (s > best) { best = s; bestW = w; } }
    expect(Math.abs(bestW - wp) / wp).toBeLessThan(0.02);
  });
  it('alphaForHs reproduces Hs through m0', () => {
    const wp = (2 * Math.PI) / 12, hs = 1.3, a = alphaForHs(hs, wp, 3.3);
    let m0 = 0;
    const dw = 0.0005;
    for (let w = 0.05; w < 12; w += dw) m0 += a * jonswapShape(w, wp, 3.3) * dw;
    expect(4 * Math.sqrt(m0)).toBeCloseTo(hs, 2);
  });
  it('alphaForHs(0) is 0', () => expect(alphaForHs(0, 1, 3.3)).toBe(0));
});

describe('directional spreading', () => {
  it.each([6, 40])('integrates to 1 over the circle (s=%i)', (s) => {
    let sum = 0;
    const n = 4096;
    for (let i = 0; i < n; i++) sum += spreading(Math.cos(-Math.PI + ((i + 0.5) * 2 * Math.PI) / n), s) * ((2 * Math.PI) / n);
    expect(sum).toBeCloseTo(1, 3);
  });
  it('is zero straight against the travel direction', () => expect(spreading(-1, 6)).toBe(0));
});

describe('components', () => {
  it('zero wind gives a silent, finite wind sea', () => {
    const w = windSeaComponent(0, 80, DEFAULT_SPECTRUM_PARAMS);
    expect(w.alpha).toBe(0);
    expect(w.hs).toBe(0);
    expect(Number.isFinite(w.omegaP)).toBe(true);
  });
  it('3 m/s over 5 km of fetch gives roughly 10 cm of chop', () => {
    const w = windSeaComponent(3, 80, DEFAULT_SPECTRUM_PARAMS);
    expect(w.hs).toBeGreaterThan(0.08);
    expect(w.hs).toBeLessThan(0.14);
  });
});

describe('cascade bands', () => {
  const bands = cascadeBands();
  it('are contiguous and start at 0', () => {
    expect(bands[0].kMin).toBe(0);
    for (let i = 1; i < bands.length; i++) expect(bands[i].kMin).toBeCloseTo(bands[i - 1].kMax, 10);
  });
  it('never exceed their own grid Nyquist', () => {
    for (const b of bands) expect(b.kMax).toBeLessThanOrEqual((Math.PI * FFT_SIZE) / b.sizeM + 1e-9);
  });
  it('use the planned sizes', () => expect(bands.map((b) => b.sizeM)).toEqual([...CASCADE_SIZES_M]));
});

describe('buildOceanSpectra', () => {
  it('reproduces the combined Hs of swell and wind sea', () => {
    const s = buildOceanSpectra(DEFAULT_CONDITIONS);
    const comps = buildSpectrumComponents(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
    const target = Math.sqrt(comps.reduce((a, c) => a + c.hs * c.hs, 0));
    expect(s.hsTotal).toBeCloseTo(target, 2);
    expect(target).toBeGreaterThan(1.6);
  });
  it('autumn glass-off (zero wind) is finite and swell-only', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0;
    const s = buildOceanSpectra(c);
    expect(s.hsTotal).toBeCloseTo(1.6, 2);
    for (const a of s.h0) for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });
  it('flat calm gives all-zero spectra', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0;
    c.swell.sizeFt = 0;
    const s = buildOceanSpectra(c);
    expect(s.hsTotal).toBe(0);
    for (const a of s.h0) expect(a.every((v) => v === 0)).toBe(true);
  });
  it('extreme conditions stay finite', () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell = { sizeFt: 12, periodS: 25, directionDeg: 200 };
    c.wind = { speedMs: 30, directionDeg: 225 };
    const s = buildOceanSpectra(c);
    expect(Number.isFinite(s.hsTotal)).toBe(true);
    for (const a of s.h0) for (const v of a) expect(Number.isFinite(v)).toBe(true);
    for (const v of s.slopeVariance) expect(Number.isFinite(v)).toBe(true);
  });
  it('is deterministic per seed', () => {
    const a = buildOceanSpectra(DEFAULT_CONDITIONS);
    const b = buildOceanSpectra(DEFAULT_CONDITIONS);
    expect(a.h0[1]).toEqual(b.h0[1]);
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.seed = 7;
    expect(buildOceanSpectra(c).h0[1]).not.toEqual(a.h0[1]);
  });
  it('swell energy travels toward the NE (+X, -Z) in cascade 0', () => {
    const s = buildOceanSpectra(DEFAULT_CONDITIONS);
    const a = s.h0[0], n = FFT_SIZE;
    let best = -1, bestIdx = 0;
    for (let i = 0; i < n * n; i++) { const e = a[i * 4] ** 2 + a[i * 4 + 1] ** 2; if (e > best) { best = e; bestIdx = i; } }
    const x = (bestIdx % n) - n / 2, m = Math.floor(bestIdx / n) - n / 2;
    expect(x).toBeGreaterThan(0);
    expect(m).toBeLessThan(0);
  });
  it('slope variance is positive for a live sea and zero for calm', () => {
    expect(buildOceanSpectra(DEFAULT_CONDITIONS).slopeVariance.every((v) => v > 0)).toBe(true);
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind.speedMs = 0; c.swell.sizeFt = 0;
    expect(buildOceanSpectra(c).slopeVariance.every((v) => v === 0)).toBe(true);
  });
});

describe('buildInitialSpectrum', () => {
  it('stores conj(h0(-k)) alongside h0(k) (Hermitian pairing)', () => {
    const bands = cascadeBands();
    const comps = buildSpectrumComponents(DEFAULT_CONDITIONS, DEFAULT_SPECTRUM_PARAMS);
    const n = FFT_SIZE, a = buildInitialSpectrum(bands[1], comps, createRng(3), n);
    for (const [x, m] of [[140, 100], [10, 250], [129, 128]]) {
      const i = m * n + x, j = ((n - m) % n) * n + ((n - x) % n);
      expect(a[i * 4 + 2]).toBe(a[j * 4]);
      expect(a[i * 4 + 3]).toBe(-a[j * 4 + 1]);
    }
  });
});
