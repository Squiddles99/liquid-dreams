import { travelDirectionXZ, type Vec2XZ } from '../conditions/directions';
import { createRng, deriveSeed, type Rng } from '../conditions/rng';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';

export const GRAVITY = 9.81;
export const FFT_SIZE = 256;
/** Patch sizes (m): long swell / mid waves / fine chop. */
export const CASCADE_SIZES_M = [3000, 250, 35] as const;

export interface CascadeBand {
  sizeM: number;
  kMin: number;
  kMax: number;
}

/** Contiguous wavenumber bands: cascade i owns [kMin, kMax). Boundaries sit 4 fundamentals into the next cascade. */
export function cascadeBands(sizes: readonly number[] = CASCADE_SIZES_M, n = FFT_SIZE): CascadeBand[] {
  return sizes.map((sizeM, i) => ({
    sizeM,
    kMin: i === 0 ? 0 : (8 * Math.PI) / sizeM,
    kMax: i === sizes.length - 1 ? (Math.PI * n) / sizeM : (8 * Math.PI) / sizes[i + 1],
  }));
}

export const omegaForK = (k: number): number => Math.sqrt(GRAVITY * k);

/** JONSWAP frequency spectrum with alpha = 1 (scale with alphaForHs). */
export function jonswapShape(omega: number, omegaP: number, gamma: number): number {
  if (omega <= 0 || omegaP <= 0) return 0;
  const sigma = omega <= omegaP ? 0.07 : 0.09;
  const r = Math.exp(-((omega - omegaP) ** 2) / (2 * sigma * sigma * omegaP * omegaP));
  return ((GRAVITY * GRAVITY) / omega ** 5) * Math.exp(-1.25 * (omegaP / omega) ** 4) * gamma ** r;
}

export function alphaForHs(hs: number, omegaP: number, gamma: number): number {
  if (hs <= 0) return 0;
  const lo = 0.3 * omegaP, hi = 8 * omegaP, steps = 4000, dw = (hi - lo) / steps;
  let m0 = 0;
  for (let i = 0; i < steps; i++) m0 += jonswapShape(lo + (i + 0.5) * dw, omegaP, gamma) * dw;
  return (hs / 4) ** 2 / m0;
}

const spreadingNormCache = new Map<number, number>();
/** 1 / ∫ cos^{2s}(θ/2) dθ over [-π, π]. */
export function spreadingNormalisation(s: number): number {
  const cached = spreadingNormCache.get(s);
  if (cached !== undefined) return cached;
  const steps = 2048;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const theta = -Math.PI + ((i + 0.5) * 2 * Math.PI) / steps;
    sum += Math.cos(theta / 2) ** (2 * s) * ((2 * Math.PI) / steps);
  }
  const norm = 1 / sum;
  spreadingNormCache.set(s, norm);
  return norm;
}

/** cos-2s directional spreading, expressed via cosΔ: cos^{2s}(Δ/2) = ((1+cosΔ)/2)^s. */
export function spreading(cosDelta: number, s: number): number {
  const c = Math.max(0, (1 + cosDelta) / 2);
  return spreadingNormalisation(s) * c ** s;
}

export interface OceanSpectrumParams {
  windFetchM: number;
  windSpread: number;
  swellSpread: number;
  windGamma: number;
  swellGamma: number;
}

export const DEFAULT_SPECTRUM_PARAMS: OceanSpectrumParams = {
  windFetchM: 5000,
  windSpread: 6,
  swellSpread: 40,
  windGamma: 3.3,
  swellGamma: 7,
};

export interface SpectrumComponent {
  hs: number;
  omegaP: number;
  gamma: number;
  alpha: number;
  travel: Vec2XZ;
  spread: number;
}

/** Fetch-limited JONSWAP wind sea, capped at a fully developed sea. */
export function windSeaComponent(speedMs: number, fromDeg: number, p: OceanSpectrumParams): SpectrumComponent {
  const travel = travelDirectionXZ(fromDeg);
  if (speedMs < 0.05) return { hs: 0, omegaP: 1, gamma: p.windGamma, alpha: 0, travel, spread: p.windSpread };
  const u = speedMs, f = p.windFetchM;
  const hs = Math.min(0.0016 * Math.sqrt((GRAVITY * f) / (u * u)) * ((u * u) / GRAVITY), (0.21 * u * u) / GRAVITY);
  const omegaP = Math.max(22 * Math.cbrt((GRAVITY * GRAVITY) / (u * f)), (0.855 * GRAVITY) / u);
  return { hs, omegaP, gamma: p.windGamma, alpha: alphaForHs(hs, omegaP, p.windGamma), travel, spread: p.windSpread };
}

export function swellComponent(sizeFt: number, periodS: number, fromDeg: number, p: OceanSpectrumParams): SpectrumComponent {
  const hs = surferFeetToHs(sizeFt);
  const omegaP = (2 * Math.PI) / periodS;
  return { hs, omegaP, gamma: p.swellGamma, alpha: alphaForHs(hs, omegaP, p.swellGamma), travel: travelDirectionXZ(fromDeg), spread: p.swellSpread };
}

export function buildSpectrumComponents(c: Conditions, p: OceanSpectrumParams): SpectrumComponent[] {
  return [windSeaComponent(c.wind.speedMs, c.wind.directionDeg, p), swellComponent(c.swell.sizeFt, c.swell.periodS, c.swell.directionDeg, p)];
}

/** Wavenumber-space energy density E(kx, kz) in m⁴, so that ∫∫E dkx dkz = m0. */
export function directionalSpectrumK(kx: number, kz: number, comps: readonly SpectrumComponent[]): number {
  const k = Math.hypot(kx, kz);
  if (k < 1e-6) return 0;
  const omega = omegaForK(k);
  const dOmegaDk = GRAVITY / (2 * omega);
  let e = 0;
  for (const c of comps) {
    if (c.alpha === 0) continue;
    const cosDelta = (kx * c.travel.x + kz * c.travel.z) / k;
    e += c.alpha * jonswapShape(omega, c.omegaP, c.gamma) * spreading(cosDelta, c.spread);
  }
  return (e * dOmegaDk) / k;
}

function forEachBandCell(band: CascadeBand, n: number, fn: (kx: number, kz: number, k: number, dk: number) => void): void {
  const dk = (2 * Math.PI) / band.sizeM;
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const kx = (x - n / 2) * dk, kz = (m - n / 2) * dk, k = Math.hypot(kx, kz);
      if (k === 0 || k < band.kMin || k >= band.kMax) continue;
      fn(kx, kz, k, dk);
    }
  }
}

/** Expected surface-height variance contributed by this cascade (Σ E Δk²). */
export function expectedCascadeVariance(band: CascadeBand, comps: readonly SpectrumComponent[], n = FFT_SIZE): number {
  let v = 0;
  forEachBandCell(band, n, (kx, kz, _k, dk) => { v += directionalSpectrumK(kx, kz, comps) * dk * dk; });
  return v;
}

/** Expected slope variance (Σ k² E Δk²): feeds sun-glitter roughness when a cascade is faded out. */
export function cascadeSlopeVariance(band: CascadeBand, comps: readonly SpectrumComponent[], n = FFT_SIZE): number {
  let v = 0;
  forEachBandCell(band, n, (kx, kz, k, dk) => { v += k * k * directionalSpectrumK(kx, kz, comps) * dk * dk; });
  return v;
}

/**
 * Random initial spectrum h0 for one cascade. h0 = (g1 + i g2)·sqrt(E Δk²)/2 so that the
 * evolved field h = h0 e^{iωt} + conj(h0(-k)) e^{-iωt} has variance Σ E Δk².
 * Gaussians are drawn for every cell so the stream does not depend on the band limits.
 */
export function buildInitialSpectrum(band: CascadeBand, comps: readonly SpectrumComponent[], rng: Rng, n = FFT_SIZE): Float32Array {
  const re = new Float32Array(n * n), im = new Float32Array(n * n);
  const dk = (2 * Math.PI) / band.sizeM;
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const g1 = rng.gaussian(), g2 = rng.gaussian();
      const kx = (x - n / 2) * dk, kz = (m - n / 2) * dk, k = Math.hypot(kx, kz);
      if (k === 0 || k < band.kMin || k >= band.kMax) continue;
      const amp = Math.sqrt(directionalSpectrumK(kx, kz, comps) * dk * dk) / 2;
      re[m * n + x] = g1 * amp;
      im[m * n + x] = g2 * amp;
    }
  }
  const out = new Float32Array(n * n * 4);
  for (let m = 0; m < n; m++) {
    for (let x = 0; x < n; x++) {
      const i = m * n + x, j = ((n - m) % n) * n + ((n - x) % n);
      out[i * 4] = re[i];
      out[i * 4 + 1] = im[i];
      out[i * 4 + 2] = re[j];
      out[i * 4 + 3] = -im[j];
    }
  }
  return out;
}

export interface OceanSpectra {
  h0: Float32Array[];
  slopeVariance: number[];
  hsTotal: number;
  components: SpectrumComponent[];
}

export function buildOceanSpectra(
  c: Conditions,
  p: OceanSpectrumParams = DEFAULT_SPECTRUM_PARAMS,
  bands: CascadeBand[] = cascadeBands(),
  n = FFT_SIZE,
): OceanSpectra {
  const normalised = buildSpectrumComponents(c, p).map((comp) => {
    if (comp.alpha === 0) return comp;
    const discrete = bands.reduce((s, b) => s + expectedCascadeVariance(b, [comp], n), 0);
    return discrete > 0 ? { ...comp, alpha: (comp.alpha * (comp.hs / 4) ** 2) / discrete } : { ...comp, alpha: 0 };
  });
  const h0 = bands.map((b, i) => buildInitialSpectrum(b, normalised, createRng(deriveSeed(c.seed, i)), n));
  const slopeVariance = bands.map((b) => cascadeSlopeVariance(b, normalised, n));
  const variance = bands.reduce((s, b) => s + expectedCascadeVariance(b, normalised, n), 0);
  return { h0, slopeVariance, hsTotal: 4 * Math.sqrt(variance), components: normalised };
}
