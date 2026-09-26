import { smoothstep } from '../math/smoothstep';
import { travelDirectionXZ } from '../conditions/directions';
import type { WaveEvent } from '../swell/sets';
import { MIN_DEPTH_M } from './dispersion';
import type { FieldSample } from './fieldSample';

/** A wave breaks when its height reaches about 0.78 × depth; Phase 1 caps it there (the "fade"). */
export const BREAKING_RATIO = 0.78;
/** Envelope width in periods: one crest with flanking troughs, not an endless train. */
export const ENVELOPE_WIDTH = 0.8;
/** Largest second-harmonic ratio (Stokes breaks down in very shallow water). */
export const STOKES_CAP = 0.35;
/** k × horizontal amplitude never exceeds this (keeps the along-ray Jacobian positive). */
export const FOLD_LIMIT = 0.6;
/** Forward lean as a wave nears the depth cap… */
export const PITCH_MAX = 0.3;
/** …bounded so that pitch × k × A ≤ this. */
export const PITCH_KA_CAP = 0.12;
/** Crest ends taper between these distances from the peak (the crest spans the whole reef near it). */
export const TAPER_NEAR_M = 250;
export const TAPER_FAR_M = 500;

export interface ActiveWave {
  arrivalS: number;
  heightM: number;
  omega: number;
  travelX: number;
  travelZ: number;
  crestLengthM: number;
  crestOffsetM: number;
}

/** The field's mean swell (the field was computed for this frequency and direction). */
export interface WaveContext {
  omega: number;
  travelX: number;
  travelZ: number;
}

export interface SetWaveResult {
  eta: number;
  dx: number;
  dz: number;
  slopeX: number;
  slopeZ: number;
}

const ZERO: SetWaveResult = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0 };

export function toActiveWave(e: WaveEvent): ActiveWave {
  const d = travelDirectionXZ(e.fromDeg);
  return {
    arrivalS: e.arrivalS, heightM: e.heightM, omega: (2 * Math.PI) / e.periodS,
    travelX: d.x, travelZ: d.z, crestLengthM: e.crestLengthM, crestOffsetM: e.crestOffsetM,
  };
}

export function localHeight(w: ActiveWave, f: FieldSample): number {
  return Math.min(w.heightM * f.amp, BREAKING_RATIO * f.hmin);
}

export function waveAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext): SetWaveResult {
  const H = localHeight(w, f);
  if (!(H > 0)) return { ...ZERO };
  const A = H / 2;
  const cLocal = ctx.omega / f.k;
  const dTau = ((w.travelX - ctx.travelX) * x + (w.travelZ - ctx.travelZ) * z) / cLocal;
  const xi = t - w.arrivalS - f.tau - dTau;
  const width = (ENVELOPE_WIDTH * 2 * Math.PI) / w.omega;
  const env = Math.exp(-((xi / width) ** 2));
  const dEnv = ((-2 * xi) / (width * width)) * env;
  const sigma = Math.max(Math.tanh(f.k * f.depth), 0.05);
  const B = Math.min(STOKES_CAP, (f.k * A * (3 - sigma * sigma)) / (4 * sigma * sigma * sigma));
  const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, Math.hypot(x, z));
  const q = (2 * (-x * w.travelZ + z * w.travelX - w.crestOffsetM)) / w.crestLengthM;
  const lateral = 1 + (Math.exp(-(q * q * q * q)) - 1) * wFar;
  const theta = w.omega * xi;
  const aE = A * env * lateral;
  const shape = Math.cos(theta) + B * Math.cos(2 * theta);
  const eta = aE * shape;
  const hAmp = Math.min(aE, FOLD_LIMIT / f.k);
  const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H / Math.max(f.hmin, MIN_DEPTH_M));
  const pitch = Math.min(PITCH_MAX * nearBreaking, PITCH_KA_CAP / Math.max(f.k * aE, 1e-4));
  const dh = hAmp * Math.sin(theta) + pitch * eta;
  const dEtaDXi = A * lateral * (dEnv * shape - env * w.omega * (Math.sin(theta) + 2 * B * Math.sin(2 * theta)));
  const dXiDs = -f.k / ctx.omega;
  const jacobian = Math.max(0.2, 1 + (hAmp * w.omega * Math.cos(theta) + pitch * dEtaDXi) * dXiDs);
  const slopeAlong = (dEtaDXi * dXiDs) / jacobian;
  return { eta, dx: f.dirX * dh, dz: f.dirZ * dh, slopeX: f.dirX * slopeAlong, slopeZ: f.dirZ * slopeAlong };
}

export function sumWaves(x: number, z: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext): SetWaveResult {
  const out = { ...ZERO };
  for (const w of waves) {
    const r = waveAt(x, z, t, f, w, ctx);
    out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
  }
  return out;
}
