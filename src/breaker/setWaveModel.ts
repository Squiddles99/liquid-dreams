import { smoothstep } from '../math/smoothstep';
import { travelDirectionXZ } from '../conditions/directions';
import type { WaveEvent } from '../swell/sets';
import { type BreakParams, breakPoint, breakingDepth, breakingHeightThreshold, breakingRatio, breakingStage, steepening, steepeningStart } from './breaking';
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
  /** The surface's analytic slope ∂η/∂x, ∂η/∂z (Eulerian, per metre of the displaced surface): Phase 1's plus what
   * breaking adds along each wave's travel. 0 where the seabed clamp holds the surface. */
  slopeX: number;
  slopeZ: number;
  /** Whitewater placeholder weight [0, 1] (max over waves). */
  foam: number;
  /** Largest crest stage among the waves here [0, 1], each weighted by its crest lookup's confidence (a readout only:
   * a wave far past its crest reads 0 instead of whatever stage its unconverged lookup landed on). */
  stage: number;
}

/** Breaking switched on: how to read the field at the crest, and the shape's parameters. */
export interface BreakOptions {
  /** The field at any world point (sampleField on the CPU). The crest's ratio and stage are read where the crest is. */
  sample: (x: number, z: number) => FieldSample;
  params: BreakParams;
}

const ZERO: SetWaveResult = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, stage: 0 };

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

/** A wave's crest nearest a point: the field where the crest is now, and its breaking ratio and stage there. */
export interface Crest {
  /** Where the crest is now (undisplaced world xz). */
  x: number;
  z: number;
  f: FieldSample;
  /** The crest's breaking ratio: the sheet's front sharpening steepens with it, before the wave breaks. */
  r: number;
  /** The crest's breaking stage: it drains and collapses the wave. */
  s: number;
  /** How much to trust s as a readout, [0, 1]: 1 when the lookup landed on the crest, falling to 0 as the ξ left
   * after the steps grows from an eighth to a quarter period (a wave far past its crest). Only the reported stage uses it. */
  confidence: number;
}

/**
 * w's crest nearest (x, z): the field is read where the crest is now, found by Newton steps toward ξ = 0 along the line
 * through (x, z) in w's own travel direction (at most half a wavelength a step). That direction is the same at every
 * point, so the lookup is smooth across the crest as well as along the ray, and every point of one cross-section shares
 * its crest's ratio, stage and shape frame. Found whatever the ratio (the sheet steepens before the wave breaks, so a
 * crest with s = 0 still shapes it). Null when breaking is off.
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
  const r = breakingRatio(w.heightM * fc.amp, fc.hminBreak, o.params);
  return { x: cx, z: cz, f: fc, r, s: breakingStage(r, o.params), confidence };
}

/**
 * The smallest wave height (m) that can break anywhere the field is sampled: min over the reef grid's cells (bilinear
 * between four nodes) and the far field's segments (linear between two) of breakingHeightThreshold at the cell's largest
 * amp and smallest breaking depth. Conservative: a wave no taller than this has stage 0 at every crest, so its surface is Phase 1
 * exactly. SetWaves uses it per wave to skip the GPU's crest search and breaking (a pure optimisation; the CPU model
 * does not need it and its results are the same either way).
 */
export function fieldBreakingHeight(f: ReefField, p: BreakParams): number {
  const { nx, nz } = f.grid;
  // Between nodes the sample's amp/depth is a ratio of two interpolations of positive amp_i and amp_i/q_i, a weighted mean
  // of the q_i = amp_i/depth_i: at most their largest. (Pairing the largest amp with the smallest depth, which grows with
  // amp, left the bound three to four times too low.) The floor's term needs the largest amp itself.
  const bound = (maxQ: number, maxAmp: number): number =>
    maxQ > 0 && maxAmp > 0 ? p.gamma * Math.max(1 / ((1 + p.gamma * p.delta) * maxQ), p.hFloorM / maxAmp) : Infinity;
  let best = Infinity;
  for (let r = 0; r + 1 < nz; r++) for (let c = 0; c + 1 < nx; c++) {
    const i = r * nx + c, j = i + nx;
    const q = (k: number): number => f.amp[k] / f.hminBreak[k];
    best = Math.min(best, bound(Math.max(q(i), q(i + 1), q(j), q(j + 1)), Math.max(f.amp[i], f.amp[i + 1], f.amp[j], f.amp[j + 1])));
  }
  for (let i = 0; i + 1 < f.far.count; i++) {
    const q = (k: number): number => f.far.amp[k] / breakingDepth(f.far.hmin[k]);
    best = Math.min(best, bound(Math.max(q(i), q(i + 1)), Math.max(f.far.amp[i], f.far.amp[i + 1])));
  }
  return best;
}

/**
 * The smallest wave height (m) that can shape the sheet anywhere the field is sampled: steepeningStart(p) (ribbonOnset +
 * RIBBON_FULL_OFFSET) × fieldBreakingHeight. The front sharpening acts from that breaking ratio on, before the wave
 * breaks. ρ is proportional to the height (ρ(λH) = λ·ρ(H)), so a wave no taller than λ × fieldBreakingHeight (so no
 * taller than λ × every point's own breaking height, where ρ = 1) has ρ ≤ λ at every crest: with λ =
 * steepeningStart it has no sharpening and no stage anywhere, so its surface is Phase 1 exactly. SetWaves flags waves
 * against it (see fieldBreakingHeight).
 */
export function fieldSteepeningHeight(f: ReefField, p: BreakParams): number {
  return steepeningStart(p) * fieldBreakingHeight(f, p);
}

/** The breaking stage of w's crest nearest (x, z) (0 when breaking is off). */
export function crestStage(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions): number {
  return crestAt(x, z, t, f, w, ctx, o)?.s ?? 0;
}

/** One wave at one point, given its crest (null, or neither steepening nor breaking: the Phase 1 wave exactly). */
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
  const out: SetWaveResult = { eta, dx: f.dirX * dh, dz: f.dirZ * dh, slopeX: f.dirX * slopeAlong, slopeZ: f.dirZ * slopeAlong, foam: 0, stage: crest ? crest.s * crest.confidence : 0 };
  if (!o || !crest || !(crest.s > 0 || steepening(crest.r, o.params) > 0)) return out;
  // The crest's frame (height, Stokes ratio, wavenumber, lean, bore depth) sets the shape's scale for the whole
  // cross-section; this point's own unbroken position and height are what get steepened, drained and settled.
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
  // Per metre of the displaced surface along travel (ahead): Phase 1's derivatives along s, over its Jacobian.
  const perAhead = dXiDs / jacobian;
  const b = breakPoint({
    theta, env: env * lateral, uUnbroken: v0 + dh, eta, uCrest: pitchC * etaCrest, etaCrest, H: Hc * lateral, k: fc.k, hmin: fc.hminBreak,
    slope: slopeAlong, dThetaDAhead: w.omega * perAhead, dEnvDAhead: dEnv * lateral * perAhead, crestConfidence: crest.confidence,
  }, crest.s, crest.r, o.params);
  out.eta = b.eta;
  out.slopeX += f.dirX * b.dEtaDAhead;
  out.slopeZ += f.dirZ * b.dEtaDAhead;
  out.foam = b.foam;
  return out;
}

/** One wave at one point. Without `o` (or with breaking disabled) this is the Phase 1 wave. */
export function waveAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o?: BreakOptions): SetWaveResult {
  return waveAtCrest(x, z, t, f, w, ctx, crestAt(x, z, t, f, w, ctx, o), o);
}

function accumulate(out: SetWaveResult, r: SetWaveResult): void {
  out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
  out.foam = Math.max(out.foam, r.foam); out.stage = Math.max(out.stage, r.stage);
}

/** The lowest the summed set-wave η may go at a point with this field sample: SEABED_CLEARANCE_M above the bed. */
export function seabedFloor(f: FieldSample): number {
  return SEABED_CLEARANCE_M - f.depth;
}

/**
 * Σ of the waves at (x, z): the one set-wave surface, which the render draws and the height probe reads. The summed η
 * is clamped to seabedFloor, and where the clamp holds it the surface is the (flat) floor, so its slope is 0 there (the
 * same clamp on every path, GPU included).
 */
export function sumWaves(x: number, z: number, t: number, f: FieldSample, waves: readonly ActiveWave[], ctx: WaveContext, o?: BreakOptions): SetWaveResult {
  const out = { ...ZERO };
  for (const w of waves) accumulate(out, waveAt(x, z, t, f, w, ctx, o));
  const floor = seabedFloor(f);
  if (out.eta < floor) {
    out.eta = floor;
    out.slopeX = 0;
    out.slopeZ = 0;
  }
  return out;
}
