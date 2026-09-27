import { smoothstep } from '../math/smoothstep';
import { travelDirectionXZ } from '../conditions/directions';
import type { WaveEvent } from '../swell/sets';
import { type BreakParams, breakPoint, breakingHeightThreshold, breakingRatio, breakingStage } from './breaking';
import { MIN_DEPTH_M } from './dispersion';
import type { FieldSample } from './fieldSample';
import type { ReefField } from './reefField';

/** A wave breaks when its height reaches about 0.78 × depth; Phase 1 caps it there (the "fade"). */
export const BREAKING_RATIO = 0.78;
/**
 * The set-wave surface stays this far above the seabed: η ≥ −(still-water depth − this). The drain and the sharpening are
 * sized from the crest's height, so on a reef flat beside a big crest they would otherwise draw the water below the bed.
 */
export const SEABED_CLEARANCE_M = 0.05;
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
  /** Phase 1's analytic slope of the unbroken surface (the breaking shape is not in it; the render uses finite differences). */
  slopeX: number;
  slopeZ: number;
  /** Whitewater placeholder weight [0, 1] (max over waves). */
  foam: number;
  /** Turquoise-lip mask [0, 1] (max over waves). */
  lip: number;
  /** Largest crest stage among the waves here [0, 1], each weighted by its crest lookup's confidence (a readout only:
   * a wave far past its crest reads 0 instead of whatever stage its unconverged lookup landed on). */
  stage: number;
}

/** Breaking switched on: how to read the field at the crest, the shape's parameters, and whether to curl. */
export interface BreakOptions {
  /** The field at any world point (sampleField on the CPU). The crest's stage is read where the crest is. */
  sample: (x: number, z: number) => FieldSample;
  params: BreakParams;
  /** true for the rendered surface; false for the height probe (drain and bore, no crest sharpening or curl). */
  includeCurl: boolean;
}

const ZERO: SetWaveResult = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, lip: 0, stage: 0 };

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

/** ξ: time since w's crest passed (x, z) (negative: still to come). */
export function phaseXi(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext): number {
  const cLocal = ctx.omega / f.k;
  const dTau = ((w.travelX - ctx.travelX) * x + (w.travelZ - ctx.travelZ) * z) / cLocal;
  return t - w.arrivalS - f.tau - dTau;
}

/** Steps taken to find a wave's crest from a point (each is one field sample). */
export const CREST_STEPS = 2;
/**
 * The crest lookup steps along the wave's own travel direction; where that line crosses the crest obliquely, ξ changes
 * more slowly along it and the step lengthens. This floors the crossing's obliqueness, so a line nearly parallel to the
 * crest takes at most twice the plain step (then the half-wavelength cap).
 */
export const CREST_MIN_CROSSING = 0.5;

/** A wave's crest nearest a point: the field where the crest is now, and its breaking stage there. */
export interface Crest {
  /** Where the crest is now (undisplaced world xz). */
  x: number;
  z: number;
  f: FieldSample;
  /** The crest's breaking stage: it shapes the wave. */
  s: number;
  /** How much to trust s as a readout, [0, 1]: 1 when the lookup landed on the crest, falling to 0 as the ξ left
   * after the steps grows from an eighth to a quarter period (a wave far past its crest). Only the reported stage uses it. */
  confidence: number;
}

/**
 * w's crest nearest (x, z): the field is read where the crest is now, found by Newton steps toward ξ = 0 along the line
 * through (x, z) in w's own travel direction (at most half a wavelength a step). That direction is the same at every
 * point, so the lookup is smooth across the crest as well as along the ray, and every point of one cross-section shares
 * its crest's stage and shape frame. Null when breaking is off.
 */
export function crestAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions | undefined): Crest | null {
  if (!o || !o.params.enabled || !(w.heightM > 0)) return null;
  // Along w's direction ξ falls at (k/ω)·(dir·w + (w − mean)·w) per metre: the field's τ gradient plus phaseXi's
  // direction term. The first step uses this point's field, the second the field where it landed.
  const wm = 1 - (ctx.travelX * w.travelX + ctx.travelZ * w.travelZ);
  let cx = x, cz = z, fc = f;
  for (let i = 0; i < CREST_STEPS; i++) {
    const reach = Math.PI / fc.k;
    const crossing = Math.max(CREST_MIN_CROSSING, fc.dirX * w.travelX + fc.dirZ * w.travelZ + wm);
    const d = Math.max(-reach, Math.min(reach, (phaseXi(cx, cz, t, fc, w, ctx) * (ctx.omega / fc.k)) / crossing));
    cx += w.travelX * d;
    cz += w.travelZ * d;
    fc = o.sample(cx, cz);
  }
  const quarterPeriod = Math.PI / (2 * w.omega);
  const confidence = 1 - smoothstep(quarterPeriod / 2, quarterPeriod, Math.abs(phaseXi(cx, cz, t, fc, w, ctx)));
  return { x: cx, z: cz, f: fc, s: breakingStage(breakingRatio(w.heightM * fc.amp, fc.hmin, o.params), o.params), confidence };
}

/**
 * The smallest wave height (m) that can break anywhere the field is sampled: min over the reef grid's cells (bilinear
 * between four nodes) and the far field's segments (linear between two) of breakingHeightThreshold at the cell's largest
 * amp and smallest hmin. Conservative: a wave no taller than this has stage 0 at every crest, so its surface is Phase 1
 * exactly. SetWaves uses it per wave to skip the GPU's crest search and breaking (a pure optimisation; the CPU model
 * does not need it and its results are the same either way).
 */
export function fieldBreakingHeight(f: ReefField, p: BreakParams): number {
  const { nx, nz } = f.grid;
  let best = Infinity;
  for (let r = 0; r + 1 < nz; r++) for (let c = 0; c + 1 < nx; c++) {
    const i = r * nx + c, j = i + nx;
    const amp = Math.max(f.amp[i], f.amp[i + 1], f.amp[j], f.amp[j + 1]);
    const hmin = Math.min(f.hmin[i], f.hmin[i + 1], f.hmin[j], f.hmin[j + 1]);
    best = Math.min(best, breakingHeightThreshold(amp, hmin, p));
  }
  for (let i = 0; i + 1 < f.far.count; i++) {
    best = Math.min(best, breakingHeightThreshold(Math.max(f.far.amp[i], f.far.amp[i + 1]), Math.min(f.far.hmin[i], f.far.hmin[i + 1]), p));
  }
  return best;
}

/** The breaking stage of w's crest nearest (x, z) (0 when breaking is off). */
export function crestStage(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions): number {
  return crestAt(x, z, t, f, w, ctx, o)?.s ?? 0;
}

/** One wave at one point, given its crest (null or stage 0: the Phase 1 wave exactly). */
export function waveAtCrest(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, crest: Crest | null, o?: BreakOptions): SetWaveResult {
  const H = localHeight(w, f);
  if (!(H > 0)) return { ...ZERO };
  const A = H / 2;
  const xi = phaseXi(x, z, t, f, w, ctx);
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
  const out: SetWaveResult = { eta, dx: f.dirX * dh, dz: f.dirZ * dh, slopeX: f.dirX * slopeAlong, slopeZ: f.dirZ * slopeAlong, foam: 0, lip: 0, stage: crest ? crest.s * crest.confidence : 0 };
  if (!o || !crest || !(crest.s > 0)) return out;
  // The crest's frame (height, Stokes ratio, wavenumber, lean, bore depth) sets the shape's scale and pivot for the whole
  // cross-section; this point's own unbroken position and height are what get steepened, drained, curled and settled.
  const fc = crest.f;
  const Hc = localHeight(w, fc);
  const ac = (Hc / 2) * lateral;
  const sigmaC = Math.max(Math.tanh(fc.k * fc.depth), 0.05);
  const Bc = Math.min(STOKES_CAP, (fc.k * (Hc / 2) * (3 - sigmaC * sigmaC)) / (4 * sigmaC * sigmaC * sigmaC));
  const nearBreakingC = smoothstep(0.3, BREAKING_RATIO, Hc / Math.max(fc.hmin, MIN_DEPTH_M));
  const pitchC = Math.min(PITCH_MAX * nearBreakingC, PITCH_KA_CAP / Math.max(fc.k * ac, 1e-4));
  const etaCrest = ac * (1 + Bc);
  // Measured, not inferred from ξ: the wave speed changes across the ledge, and every point of one cross-section must
  // agree on where its crest is.
  const v0 = (x - crest.x) * f.dirX + (z - crest.z) * f.dirZ;
  const b = breakPoint({
    theta, env: env * lateral, uUnbroken: v0 + dh, eta, uCrest: pitchC * etaCrest, etaCrest, H: Hc * lateral, k: fc.k, hmin: fc.hmin,
  }, crest.s, o.params, o.includeCurl);
  out.eta = b.eta;
  out.dx += f.dirX * b.du;
  out.dz += f.dirZ * b.du;
  out.foam = b.foam;
  out.lip = b.lip;
  return out;
}

/** One wave at one point. Without `o` (or with breaking disabled) this is the Phase 1 wave. */
export function waveAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o?: BreakOptions): SetWaveResult {
  return waveAtCrest(x, z, t, f, w, ctx, crestAt(x, z, t, f, w, ctx, o), o);
}

function accumulate(out: SetWaveResult, r: SetWaveResult): void {
  out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
  out.foam = Math.max(out.foam, r.foam); out.lip = Math.max(out.lip, r.lip); out.stage = Math.max(out.stage, r.stage);
}

/** The lowest the summed set-wave η may go at a point with this field sample: SEABED_CLEARANCE_M above the bed. */
export function seabedFloor(f: FieldSample): number {
  return SEABED_CLEARANCE_M - f.depth;
}

/** Σ of the waves at (x, z), with the summed η clamped to seabedFloor (the same clamp on every path, GPU included). */
export function sumWaves(x: number, z: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o?: BreakOptions): SetWaveResult {
  const out = { ...ZERO };
  for (const w of waves) accumulate(out, waveAt(x, z, t, f, w, ctx, o));
  out.eta = Math.max(out.eta, seabedFloor(f));
  return out;
}

/** The field at a point `dx, dz` away, to first order: only τ changes (the render's finite-difference neighbours). */
export function shiftField(f: FieldSample, dx: number, dz: number, ctx: WaveContext): FieldSample {
  return { ...f, tau: f.tau + (f.k / ctx.omega) * (f.dirX * dx + f.dirZ * dz) };
}

/**
 * sumWaves at (x, z) plus the displaced surface's unit normal from finite differences (spec §3.3): each wave is also
 * evaluated at (x + ε, z) and (x, z + ε) with the field shifted to first order and the same crest, and each sum's η is
 * clamped to this point's seabedFloor. This is the render's
 * normal, and the GPU mirrors it exactly. Handles overhangs (the normal faces down under the lip).
 */
export function sumWavesWithNormal(
  x: number, z: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o: BreakOptions | undefined, eps: number,
): SetWaveResult & { normal: [number, number, number] } {
  const c = { ...ZERO }, px = { ...ZERO }, pz = { ...ZERO };
  const fx = shiftField(f, eps, 0, ctx), fz = shiftField(f, 0, eps, ctx);
  for (const w of waves) {
    const crest = crestAt(x, z, t, f, w, ctx, o);
    accumulate(c, waveAtCrest(x, z, t, f, w, ctx, crest, o));
    accumulate(px, waveAtCrest(x + eps, z, t, fx, w, ctx, crest, o));
    accumulate(pz, waveAtCrest(x, z + eps, t, fz, w, ctx, crest, o));
  }
  // The seabed clamp, with this point's depth for the neighbours too (they share its field sample, P10).
  const floor = seabedFloor(f);
  for (const r of [c, px, pz]) r.eta = Math.max(r.eta, floor);
  const ax = eps + px.dx - c.dx, ay = px.eta - c.eta, az = px.dz - c.dz; // P(x + ε) − P
  const bx = pz.dx - c.dx, by = pz.eta - c.eta, bz = eps + pz.dz - c.dz; // P(z + ε) − P
  const nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax; // (P(z + ε) − P) × (P(x + ε) − P)
  const len = Math.hypot(nx, ny, nz) || 1;
  return { ...c, normal: [nx / len, ny / len, nz / len] };
}
