import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { createRng } from '../conditions/rng';
import {
  CASCADE_SIZES_M, DEFAULT_SPECTRUM_PARAMS, FFT_SIZE, GRAVITY,
  alphaForHs, buildInitialSpectrum, buildOceanSpectra, buildSpectrumComponents, cascadeBands,
  jonswapShape, omegaForK, renormaliseComponent, spreading, windFetchM, windSeaComponent,
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
  it('3 m/s onshore over 5 km of fetch gives roughly 10 cm of chop', () => {
    const w = windSeaComponent(3, 270, DEFAULT_SPECTRUM_PARAMS);
    expect(w.hs).toBeGreaterThan(0.08);
    expect(w.hs).toBeLessThan(0.14);
  });
  it('the morning easterly offshore only raises short, low ripples (fetch from the cliffs)', () => {
    const w = windSeaComponent(3, 80, DEFAULT_SPECTRUM_PARAMS);
    const peakWavelengthM = (2 * Math.PI * GRAVITY) / (w.omegaP * w.omegaP);
    expect(w.hs).toBeLessThan(0.04);
    expect(peakWavelengthM).toBeLessThan(1);
  });
});

describe('wind fetch by direction (land to the east of The Womb)', () => {
  const p = DEFAULT_SPECTRUM_PARAMS;
  it('offshore wind (from the land) has the short fetch', () => {
    expect(windFetchM(90, p)).toBeCloseTo(p.offshoreFetchM, 6);
    expect(windFetchM(80, p)).toBeCloseTo(p.offshoreFetchM, 6);
  });
  it('onshore wind (from the sea, e.g. the Doctor) has the long fetch', () => {
    expect(windFetchM(270, p)).toBeCloseTo(p.onshoreFetchM, 6);
    expect(windFetchM(225, p)).toBeCloseTo(p.onshoreFetchM, 6);
  });
  it('alongshore wind sits between them (geometric mean)', () => {
    expect(windFetchM(0, p)).toBeCloseTo(Math.sqrt(p.offshoreFetchM * p.onshoreFetchM), 6);
    expect(windFetchM(180, p)).toBeCloseTo(Math.sqrt(p.offshoreFetchM * p.onshoreFetchM), 6);
  });
  it('grows monotonically as the wind swings from offshore to onshore', () => {
    let prev = 0;
    for (let d = 90; d <= 270; d += 5) {
      const f = windFetchM(d, p);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
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
    for (const a of s.h0) expect(a.every(Number.isFinite)).toBe(true);
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
    for (const a of s.h0) expect(a.every(Number.isFinite)).toBe(true);
    expect(s.slopeVariance.every(Number.isFinite)).toBe(true);
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

describe('renormalisation never emits non-finite spectra', () => {
  // A coarse grid keeps the sweep fast; the unresolved-wind-sea regime (peak far above the grid's kMax) still
  // appears, just at a slightly higher wind speed than on the full 256² grid.
  const n = 16, bands = cascadeBands(CASCADE_SIZES_M, n);
  const allFinite = (speedMs: number, directionDeg: number, cells = bands, size = n): boolean => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.wind = { speedMs, directionDeg };
    const s = buildOceanSpectra(c, DEFAULT_SPECTRUM_PARAMS, cells, size);
    return Number.isFinite(s.hsTotal) && s.slopeVariance.every(Number.isFinite) && s.h0.every((a) => a.every(Number.isFinite));
  };
  it('drops a component whose resolved variance is subnormal or zero, rescales a resolved one', () => {
    const comp = windSeaComponent(0.114, 80, DEFAULT_SPECTRUM_PARAMS);
    expect(renormaliseComponent(comp, 1e-322).alpha).toBe(0);
    expect(renormaliseComponent(comp, 0).alpha).toBe(0);
    const resolved = renormaliseComponent(comp, 0.5 * (comp.hs / 4) ** 2);
    expect(resolved.alpha).toBeCloseTo(2 * comp.alpha, 10);
  });
  for (const directionDeg of [80, 225]) {
    it(`light airs 0–1 m/s from ${directionDeg}° in 0.001 m/s steps`, () => {
      const bad: number[] = [];
      for (let i = 0; i <= 1000; i++) if (!allFinite(i / 1000, directionDeg)) bad.push(i / 1000);
      expect(bad).toEqual([]);
    });
    it(`0–30 m/s from ${directionDeg}° in 0.1 m/s steps`, () => {
      const bad: number[] = [];
      for (let i = 0; i <= 300; i++) if (!allFinite(i / 10, directionDeg)) bad.push(i / 10);
      expect(bad).toEqual([]);
    });
    it(`the full grid at 0.114 m/s from ${directionDeg}° (subnormal resolved variance)`, () => {
      expect(allFinite(0.114, directionDeg, cascadeBands(), FFT_SIZE)).toBe(true);
    });
  }
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
