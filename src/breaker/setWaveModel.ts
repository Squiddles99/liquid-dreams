import { BORE_SHARE, boreWeight } from './wombSection';
import { smoothstep } from '../math/smoothstep';
import { travelDirectionXZ } from '../conditions/directions';
import type { WaveEvent } from '../swell/sets';
import { BREAKING_RATIO, type BreakParams, DEFAULT_BREAK_PARAMS, type Lifecycle, ONSET_RECORD_LENGTH, breakPoint, breakingDepth, breakingHeightThreshold, breakingRatio, lifecycle, onsetHeight, onsetRatio, onsetPsi, onsetDelay, onsetTime, pileTop, settledCrestTop, steepeningStart, TUBE_THROWN_PSI } from './breaking';
import { PSI_MIN, PSI_NONE, PSI_NORMAL, drainFactor, effectivePsi, withSheetShape } from './overturn';
import { MIN_DEPTH_M } from './dispersion';
import type { FieldSample } from './fieldSample';
import { type ReefField, psiEdgeFade, sampleField, sampleOnset } from './reefField';

export { BREAKING_RATIO };
/**
 * The set-wave surface stays this far above the seabed: η ≥ −(still-water depth − this). The drain and the sharpening are
 * sized from the crest's height, so on a reef flat beside a big crest they would otherwise draw the water below the bed.
 */
export const SEABED_CLEARANCE_M = 0.05;
/**
 * Envelope width in periods: env = exp(−(ξ / (ENVELOPE_WIDTH·T))⁶), one crest with its two troughs (88% deep) and
 * nothing a period away (1% at 0.9 T, the closest set spacing). The Gaussian it replaced, exp(−(ξ/0.8T)²), left a 21%
 * crest one period either side of every wave, and set waves come a period apart: each rode on the one before (crests up
 * to 1.77× their height, no drain between them; Andrew). Over 300 sets the tallest crest is now 1.035× its own height,
 * and the faces (crest to the trough ahead) average 1.30× the wave's height, as before (1.31×): the deeper troughs make
 * up for the crest the leftovers used to add, so waves look as big as they did. Every wave has it: each swell line is one
 * wave (Andrew, 2026-10-01). One in twelve used to keep the Gaussian behind its crest (a "long tail", for the odd
 * Shipsterns-style step); its leftover crest stood a period behind it, in front of the next wave, and filled that wave's
 * drain before it broke.
 */
export const ENVELOPE_WIDTH = 0.7;
/** Envelope widths |ξ|/width beyond which a wave is nothing at a point: exp(−1.52⁶) ≈ 5e-6. */
export const ENVELOPE_CUTOFF = 1.52;
/** Largest second-harmonic ratio (Stokes breaks down in very shallow water). */
export const STOKES_CAP = 0.35;
/** k × horizontal amplitude never exceeds this (keeps the along-ray Jacobian positive). */
export const FOLD_LIMIT = 0.6;
/** Forward lean as a wave nears the depth cap… */
export const PITCH_MAX = 0.3;
/** …bounded so that pitch × k × A ≤ this. */
export const PITCH_KA_CAP = 0.12;
/**
 * The front's lean (Andrew, 2026-10-01): as a wave shoals over the ledge its front shortens toward the crest, so its
 * trough moves in to the face's foot. From LEAN_RATIO[0] to LEAN_RATIO[1] of the crest's lean ratio (Crest.rLean: over
 * the reef its front feels ahead, ≥ its own and its slurp ratio; reefField.gainAhead), the Phase 1 front (−π < θ < 0) is squeezed into its last share φ of the half wavelength, φ from 1
 * to LEAN_FRONT_MIN, and ahead of that the water lies at the trough's level (leanPhase). Before it, the face sharpening
 * lowered only the top of the face (SHARPEN_DEPTH), and only in the last two seconds or so: the lower half of the long
 * Phase 1 front stood as a shelf between the drain's hollow at the foot and the trough half a wavelength ahead, so a
 * surfer in front was drawn down, lifted 2.5–3 m by it (Andrew's "first swell" filling the drain), then drawn into the
 * hollow before the face arrived. Now the water in front is drawn steadily down until the face reaches it, and its
 * lowest point is at the foot as the wave breaks. On the reef build's steep face (2026-10-02) the crest's own ratio rose
 * through the window only in its last second, and the unleaned front lifted the water in front 0.5–2.7 m first (Andrew's
 * "bump", on every size): the lean ratio reads the reef under the front instead, so it is full 3–4 s before the break.
 */
export const LEAN_RATIO: readonly [number, number] = [0.5, 1];
export const LEAN_FRONT_MIN = 0.3;
/**
 * With the ribbon drawing the breaking (BreakOptions.shape 'lean'), the front is squeezed until it is as long as the Womb
 * profile's face, crest to trough: this many units of A (= H / 1.3), so where the ribbon hands the front back to the sheet
 * (wombSection.FRONT_BLEND_UNITS) the sheet already lies at its trough. Squeezed only to LEAN_FRONT_MIN (13 m on the 6 ft
 * set) the sheet's front still stood 1–2 m high there, a second wave in front of the face (Andrew, 2026-10-05). Bounded
 * below by LEAN_FRONT_FLOOR.
 */
export const WOMB_FRONT_UNITS = 1.8;
export const LEAN_FRONT_FLOOR = 0.08;

/**
 * The lean's weight at a crest: by its slurp ratio, × the lookup's confidence, × (1 − its release, the collapse on the
 * landing's clock without the tube's hold): it is the shoaling
 * wave's, and once a section has settled to its bore (whitewater, the pile on it) the lean lets go. Kept on over the
 * inside reef, where the rays fan out, the squeeze (1/LEAN_FRONT_MIN) amplified the phase's ripples there into 0.5 m
 * spikes on the bore's face. 0 without a crest.
 */
/** The front's share of the half wavelength when it is as long as the Womb profile's face (WOMB_FRONT_UNITS of A). */
export const wombFrontMin = (H: number, k: number): number =>
  Math.min(LEAN_FRONT_MIN, Math.max(LEAN_FRONT_FLOOR, (WOMB_FRONT_UNITS * (H / 1.3) * k) / Math.PI));

/**
 * How far a crest's front has shortened to the Womb profile's face [0, 1]: 0 off the reef's record; until its section breaks
 * (or while the peel stretch holds it), rising with its breaking ratio `r` from the ribbon's onset to 1, as the drawn
 * section's phase does (wombSection.sectionPhase); 1 once broken. Down the line, and at the take-off before the wave stands
 * up, the front stays the swell's: squeezed to the face's length there, the face swept under a paddling surfer in 0.4 s at a
 * slope of 1.35 and the ride never caught it (plan 2026-10-06 step 3; it rose over 1.5 s at 0.1–0.4). No clock: the hold's
 * STAND_LEAD_S ramp along the crest is gone with the plateau it moved.
 */
export function frontStanding(tb: number | null | undefined, r = 0, ribbonOnset = DEFAULT_BREAK_PARAMS.ribbonOnset): number {
  if (tb === undefined) return 0;
  return tb === null || tb < 0 ? smoothstep(ribbonOnset, 1, r) : 1;
}

export function leanWeight(crest: Crest | null): number {
  return crest ? smoothstep(LEAN_RATIO[0], LEAN_RATIO[1], crest.rLean) * crest.confidence * (1 - crest.lc.release) : 0;
}

/**
 * The leaned phase th for Phase 1's shape cos(th) + B·cos(2th), and dth/dθ (plan 2026-10-06-wave-root-cause step 3: no
 * plateau in front). Over the wavelength in front of the crest (−2π < θ < 0), with φ = 1 − lean·(1 − frontMin): the face
 * (th 0 → −π) squeezed into its last share φ of the half wavelength (−φπ ≤ θ ≤ 0), and the water ahead of it (th −π → −2π)
 * stretched over the rest, rising from the face's foot back up as the swell's own quarter wave does. Each part is a cubic
 * Hermite with slope 1 at both its ends, so the map is monotone and its slope continuous everywhere, and it is θ itself
 * outside that wavelength and wherever lean is 0. (It used to hold th at −π from the face's foot out to the trough half a
 * wavelength ahead: a plateau of water exactly flat at the trough's level, 40–60 m long, with a sharp far edge.)
 */
export function leanPhase(theta: number, lean: number, frontMin = LEAN_FRONT_MIN): { th: number; dth: number } {
  if (!(lean > 0) || !(theta < 0) || !(theta > -2 * Math.PI)) return { th: theta, dth: 1 };
  const phi = 1 - lean * (1 - frontMin), foot = -phi * Math.PI;
  // The face from the foot (th −π) to the crest (0), or the water ahead from the crest ahead (−2π) to the foot (−π).
  const [t0, span, p0] = theta >= foot ? [foot, phi * Math.PI, -Math.PI] : [-2 * Math.PI, (2 - phi) * Math.PI, -2 * Math.PI];
  const t = (theta - t0) / span, t2 = t * t, t3 = t2 * t;
  // p0 → p0 + π with slope 1 (span per unit t) at both ends: h01·π + (h10 + h11)·span.
  const th = p0 + Math.PI * (3 * t2 - 2 * t3) + span * (2 * t3 - 3 * t2 + t);
  const d = Math.PI * (6 * t - 6 * t2) + span * (6 * t2 - 6 * t + 1);
  return { th, dth: d / span };
}

/**
 * The white water's bore keeps the swell's troughs: the wave settled into it (amplitude A, Stokes ratio B, from the
 * unsettled A0, B0) is stretched down from its crest, η = A·(stretch·shape + offset·(1 + B)), so its crest is A(1 + B) and
 * its troughs A0's, −A0(1 − B0). Scaled whole by BORE_SHARE, the trough in front of the broken section rose by half the
 * crest's drop while the one in front of the curl's wall stayed down: a crease ran out in front of the curl along the
 * rays, and the flats in front of the white water stood higher than in front of the barrel (Andrew, 2026-10-05: "the v
 * shaped wedge occurring as the wave breaks"). Unsettled (A = A0) it is the shape itself: stretch 1, offset 0.
 */
export function boreSettle(A: number, B: number, A0: number, B0: number): { stretch: number; offset: number } {
  if (!(A > 0) || A === A0) return { stretch: 1, offset: 0 };
  const stretch = (A * (1 + B) + A0 * (1 - B0)) / (2 * A);
  return { stretch, offset: 1 - stretch };
}

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
  /** The wave's drain factor on its ψ (overturn.drainFactor, a game rule); absent: 1. */
  drainFactor?: number;
  /** The wave's random draw for the dial, in [−1, 1]; absent: 0. */
  throwDraw?: number;
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
  /** The whitewater pile's height (m) where it is the surface (max over waves): the render's churn scale. 0 without
   * breaking. */
  pile: number;
  /** Largest crest stage among the waves here [0, 1], each weighted by its crest lookup's confidence (a readout only:
   * a wave far past its crest reads 0 instead of whatever stage its unconverged lookup landed on). */
  stage: number;
}

/** Breaking switched on: how to read the field at the crest, and the shape's parameters. */
export interface BreakOptions {
  /** The field at any world point (sampleField on the CPU). The crest's ratio and stage are read where the crest is. */
  sample: (x: number, z: number) => FieldSample;
  params: BreakParams;
  /** The onset record at any world point (reefField.sampleOnset), null where there is none. Absent: none anywhere, so
   * every crest breaks on its ratio alone (breaking.lifecycle with tb undefined). */
  onset?: (x: number, z: number) => ArrayLike<number> | null;
  /** The record ψ's weight at x, z (reefField.psiEdgeFade: 0 at the grid's edge); absent 1. */
  edgeFade?: (x: number, z: number) => number;
  /** false: the sheet without the whitewater pile, which is the ribbon frame's sheet (the lip is thrown from the wave as it
   * stood, not from the whitewater rising under it). Absent: with it. */
  pile?: boolean;
  /** The wind's offshore speed (m/s; overturn.offshoreSpeed, negative onshore). Absent: 0. */
  offshoreMs?: number;
  /**
   * false: the sheet is the swell's own shape where it breaks (no front lean, no steepening, drain, collapse or pile; the
   * foam and the stage are still reported), and the breaking ribbon draws all of the breaking (the game: plan
   * 2026-10-05-womb-profile-step3). With the sheet's own breaking under it, every hand-over between the two drew a
   * second wave: the sheet's breaking front, bore and the set's earlier waves stood beside the ribbon's ("waves going in
   * everywhere", Andrew, 2026-10-05). Absent: with it (the old breaking's own tests, until it is removed).
   */
  shape?: boolean | 'lean';
  /** Tests and the drawings: every crest takes this ψ. */
  force?: { psi: number };
}

/** Breaking on `field` with `params` and the wind's offshore speed: the field and its onset record, as the render reads them. */
export function breakOptions(field: ReefField, params: BreakParams, offshoreMs = 0): BreakOptions {
  const rec = new Float32Array(ONSET_RECORD_LENGTH);
  return { sample: (x, z) => sampleField(field, x, z), params, onset: (x, z) => sampleOnset(field, x, z, rec), edgeFade: (x, z) => psiEdgeFade(field.grid, x, z), offshoreMs };
}

const ZERO: SetWaveResult = { eta: 0, dx: 0, dz: 0, slopeX: 0, slopeZ: 0, foam: 0, stage: 0, pile: 0 };

export function toActiveWave(e: WaveEvent): ActiveWave {
  const d = travelDirectionXZ(e.fromDeg);
  return {
    arrivalS: e.arrivalS, heightM: e.heightM, omega: (2 * Math.PI) / e.periodS,
    travelX: d.x, travelZ: d.z, crestLengthM: e.crestLengthM, crestOffsetM: e.crestOffsetM,
    drainFactor: drainFactor(e.gapS, e.periodS), throwDraw: e.throwDraw,
  };
}

/** A wave's envelope at ξ (s since its crest passed) and d/dξ (ENVELOPE_WIDTH). */
export function waveEnvelope(xi: number, w: ActiveWave): { env: number; dEnv: number } {
  const T = (2 * Math.PI) / w.omega;
  const width = ENVELOPE_WIDTH * T, r = xi / width, env = Math.exp(-(r ** 6));
  return { env, dEnv: ((-6 * r ** 5) / width) * env };
}

/**
 * Whether ξ is past w's envelope cutoff (ENVELOPE_CUTOFF): there the wave is
 * nothing, stage included (waveAtCrest). Its height there is under 5e-6 of the wave's, but its crest lookup can still land
 * squarely on its crest a period or more on, broken: counted, a wave long gone reported its crest's stage (the GPU skips
 * such waves, so the two disagreed by up to 1 at the grid's edge).
 */
export function beyondEnvelope(xi: number, w: ActiveWave): boolean {
  const T = (2 * Math.PI) / w.omega;
  return !(Math.abs(xi / (ENVELOPE_WIDTH * T)) < ENVELOPE_CUTOFF);
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
  /** Its ratio over the slurp's breaking depth (≥ r): the face's sharpening and the drain follow it. */
  rSlurp: number;
  /** Its ratio over the lean's breaking depth (FieldSample.hminLean, ≥ rSlurp): the front's lean follows it (leanWeight). */
  rLean: number;
  /** The crest's breaking stage (lc.stage). */
  s: number;
  /** Time since the section at the crest broke (breaking.onsetTime): null before, undefined without a record there. */
  tb: number | null | undefined;
  /** The crest's breaking state: the sharpening, the drain and the collapse (breaking.lifecycle). */
  lc: Lifecycle;
  /** How much to trust the lookup, [0, 1]: 1 when it landed on the crest, falling to 0 as the ξ left after the steps
   * grows from an eighth to a quarter period (a wave far past its crest). The reported stage, the front sharpening and
   * the crest's height (waveHeightAt) are weighted by it. */
  confidence: number;
  /** The height the section stood at while it threw (breaking.onsetHeight): the pile's lip. null before it breaks or without
   * a record. */
  lipH: number | null;
  /** The crest's ψ (overturn.effectivePsi of the record's ψ₀; PSI_NORMAL off the record). */
  psi: number;
  /** The params its shape uses: o.params with the trough drain and surge at its ψ (overturn.withSheetShape). */
  params: BreakParams;
}

/**
 * w's crest nearest (x, z): the field is read where the crest is now, found by Newton steps toward ξ = 0 along the line
 * through (x, z) in w's own travel direction (at most half a wavelength a step). That direction is the same at every
 * point, so the lookup is smooth across the crest as well as along the ray, and every point of one cross-section shares
 * its crest's ratio, height and shape frame. (Along each point's own ray instead, the lookup follows the ray field's
 * kinks, where rays from either side of the wedge meet: seams.) Found whatever the ratio (the sheet steepens before the
 * wave breaks, so a crest with s = 0 still shapes it). Null when breaking is off.
 *
 * The time since onset is the one thing read on the point's own ray (rayCrestPoint): on the ledge the wave's
 * deep-water direction crosses the refracted rays at up to ~45°, so the lookup's crest lies metres along the crest from
 * the point's own, and along a peeling section that is most of a second of onset: the wave's back and front collapsed
 * out of step with its crest, and the highest water jumped ahead mid-collapse. The record is smooth (a running maximum),
 * so reading it one straight step along the ray adds no seams.
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
  const on = rayCrestPoint(x, z, t, f, w, ctx);
  const rec = o.onset?.(on.x, on.z);
  const tb = rec ? onsetTime(rec, 0, w.heightM, o.params) : undefined;
  const delay = rec ? onsetDelay(rec, 0, w.heightM, o.params) : 0;
  const rMax = rec ? onsetRatio(rec, 0, w.heightM, o.params) : r;
  // The lip too, on the point's own ray: carried along the rays, it is the same all along one (under 1% at most ledge
  // points). Read at the lookup's crest instead, it slid along the crest's lip gradient (the peak's lip falls 20% in 7 m).
  const lipH = rec ? onsetHeight(rec, 0, w.heightM, o.params) : null;
  // Its ψ (spec 2026-09-30-barrel-from-maths §3), read on the point's own ray as the time since onset is. Off the
  // record: PSI_NORMAL, with no game rules (plan ruling 9).
  // Near the grid's edge it eases to PSI_NORMAL (reefField.psiEdgeFade), so a crest crossing the edge keeps its shape.
  const psi = o.force?.psi ?? (rec
    ? PSI_NORMAL + (effectivePsi(onsetPsi(rec, 0, w.heightM, o.params), { drain: w.drainFactor ?? 1, draw: w.throwDraw ?? 0 }, o.params) - PSI_NORMAL) * (o.edgeFade?.(on.x, on.z) ?? 1)
    : PSI_NORMAL);
  const params = withSheetShape(o.params, psi);
  const rSlurp = breakingRatio(w.heightM * fc.amp, fc.hminSlurp, o.params);
  const lc = lifecycle(r, tb, localHeight(w, fc), params, rMax, rSlurp, smoothstep(PSI_NONE, PSI_MIN, psi), smoothstep(TUBE_THROWN_PSI[0], TUBE_THROWN_PSI[1], psi), delay);
  const rLean = breakingRatio(w.heightM * fc.amp, fc.hminLean, o.params);
  return { x: cx, z: cz, f: fc, r, rSlurp, rLean, s: lc.stage, tb, lc, confidence, lipH, psi, params };
}

/**
 * The smallest wave height (m) that can break anywhere the field is sampled: min over the reef grid's cells (bilinear
 * between four nodes) and the far field's segments (linear between two) of breakingHeightThreshold at the cell's largest
 * amp and smallest breaking depth. Conservative: a wave no taller than this has stage 0 at every crest, so its surface is Phase 1
 * exactly. SetWaves uses it per wave to skip the GPU's crest search and breaking (a pure optimisation; the CPU model
 * does not need it and its results are the same either way).
 */
export function fieldBreakingHeight(f: ReefField, p: BreakParams, depths: Float32Array = f.hminBreak): number {
  const { nx, nz } = f.grid;
  // Between nodes the sample's amp/depth is a ratio of two interpolations of positive amp_i and amp_i/q_i, a weighted mean
  // of the q_i = amp_i/depth_i: at most their largest. (Pairing the largest amp with the smallest depth, which grows with
  // amp, left the bound three to four times too low.) The floor's term needs the largest amp itself.
  const bound = (maxQ: number, maxAmp: number): number =>
    maxQ > 0 && maxAmp > 0 ? p.gamma * Math.max(1 / ((1 + p.gamma * p.delta) * maxQ), p.hFloorM / maxAmp) : Infinity;
  let best = Infinity;
  for (let r = 0; r + 1 < nz; r++) for (let c = 0; c + 1 < nx; c++) {
    const i = r * nx + c, j = i + nx;
    const q = (k: number): number => f.amp[k] / depths[k];
    best = Math.min(best, bound(Math.max(q(i), q(i + 1), q(j), q(j + 1)), Math.max(f.amp[i], f.amp[i + 1], f.amp[j], f.amp[j + 1])));
  }
  for (let i = 0; i + 1 < f.far.count; i++) {
    const q = (k: number): number => f.far.amp[k] / breakingDepth(f.far.hmin[k]);
    best = Math.min(best, bound(Math.max(q(i), q(i + 1)), Math.max(f.far.amp[i], f.far.amp[i + 1])));
  }
  return best;
}

/**
 * The smallest wave height (m) that can shape the sheet anywhere the field is sampled: λ × fieldBreakingHeight, λ the
 * smaller of the front's lean start (LEAN_RATIO[0]) and steepeningStart(p) (ribbonOnset + RIBBON_FULL_OFFSET), where the
 * front sharpening acts from, before the wave breaks. ρ is proportional to the height (ρ(λH) = λ·ρ(H)), so a wave no
 * taller than λ × fieldBreakingHeight (so no taller than λ × every point's own breaking height, where ρ = 1) has ρ ≤ λ
 * at every crest: no lean, no sharpening and no stage anywhere, so its surface is Phase 1 exactly. SetWaves flags waves
 * against it (see fieldBreakingHeight). Over the slurp's depths (FieldSample.hminSlurp ≤ hminBreak) for the sharpening
 * and the lean's (hminLean ≤ hminSlurp) for the lean: the slurp pulls a shoulder in, and the reef ahead leans its front,
 * from where those ratios reach them.
 */
export function fieldSteepeningHeight(f: ReefField, p: BreakParams): number {
  return Math.min(steepeningStart(p) * fieldBreakingHeight(f, p, f.hminSlurp), LEAN_RATIO[0] * fieldBreakingHeight(f, p, f.hminLean));
}

/** The breaking stage of w's crest nearest (x, z) (0 when breaking is off). */
export function crestStage(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions): number {
  return crestAt(x, z, t, f, w, ctx, o)?.s ?? 0;
}

/** One wave at one point, given its crest (null, or neither steepening nor breaking: the Phase 1 wave exactly). */
export function waveAtCrest(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, crest: Crest | null, o?: BreakOptions): SetWaveResult {
  const xi = phaseXi(x, z, t, f, w, ctx);
  if (beyondEnvelope(xi, w)) return { ...ZERO };
  // Under the ribbon (shape 'lean') the broken wave settles into the white water's bore behind the curl (wombSection.boreWeight).
  const bore = o?.shape === 'lean' && crest ? boreWeight(crest.tb, localHeight(w, crest.f), (2 * Math.PI) / w.omega) : 0;
  const H0 = waveHeightAt(w, f, crest, xi), H = H0 * (1 - (1 - BORE_SHARE) * bore);
  if (!(H > 0)) return { ...ZERO };
  const A = H / 2;
  const { env, dEnv } = waveEnvelope(xi, w);
  const sigma = Math.max(Math.tanh(f.k * f.depth), 0.05);
  const stokesPerA = (f.k * (3 - sigma * sigma)) / (4 * sigma * sigma * sigma);
  const B = Math.min(STOKES_CAP, stokesPerA * A);
  const settle = boreSettle(A, B, H0 / 2, Math.min(STOKES_CAP, (stokesPerA * H0) / 2));
  const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, Math.hypot(x, z));
  const q = (2 * (-x * w.travelZ + z * w.travelX - w.crestOffsetM)) / w.crestLengthM;
  const lateral = 1 + (Math.exp(-(q * q * q * q)) - 1) * wFar;
  const theta = w.omega * xi;
  const aE = A * env * lateral;
  // The front's lean (LEAN_RATIO): the trough moves in to the face's foot as the wave shoals.
  const { th, dth } = o?.shape === 'lean' && crest
    ? leanPhase(theta, smoothstep(LEAN_RATIO[0], LEAN_RATIO[1], crest.rLean) * crest.confidence,
      LEAN_FRONT_MIN + (wombFrontMin(localHeight(w, crest.f), crest.f.k) - LEAN_FRONT_MIN) * frontStanding(crest.tb, crest.r, crest.params.ribbonOnset))
    : leanPhase(theta, o?.shape === false ? 0 : leanWeight(crest));
  const leaning = th !== theta || dth !== 1;
  const shape = Math.cos(th) + B * Math.cos(2 * th);
  // Settled into the bore, the wave is stretched down from its crest so its troughs stay the swell's (boreSettle).
  const crestShape = settle.offset * (1 + B);
  const eta = aE * (settle.stretch * shape + crestShape);
  const hAmp = Math.min(aE, FOLD_LIMIT / f.k);
  const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H / Math.max(f.hmin, MIN_DEPTH_M));
  const pitch = Math.min(PITCH_MAX * nearBreaking, PITCH_KA_CAP / Math.max(f.k * aE, 1e-4));
  const dh = hAmp * Math.sin(theta) + pitch * eta;
  const dEtaDXi = A * lateral * (dEnv * (settle.stretch * shape + crestShape) - settle.stretch * env * w.omega * dth * (Math.sin(th) + 2 * B * Math.sin(2 * th)));
  const dXiDs = -f.k / ctx.omega;
  const jacobian = Math.max(0.2, 1 + (hAmp * w.omega * Math.cos(theta) + pitch * dEtaDXi) * dXiDs);
  const slopeAlong = (dEtaDXi * dXiDs) / jacobian;
  const out: SetWaveResult = { eta, dx: f.dirX * dh, dz: f.dirZ * dh, slopeX: f.dirX * slopeAlong, slopeZ: f.dirZ * slopeAlong, foam: 0, stage: crest ? crest.s * crest.confidence : 0, pile: 0 };
  if (!o || !crest || !(crest.lc.stage > 0 || crest.lc.steep > 0 || crest.lc.drain > 0)) return out;
  // The crest's frame (height, Stokes ratio, wavenumber, lean, bore depth) sets the shape's scale for the whole
  // cross-section; this point's own unbroken position and height are what get steepened, drained and settled.
  const cf = crestFrame(w, crest, lateral, o);
  // Measured, not inferred from ξ: the wave speed changes across the ledge, and every point of one cross-section must
  // agree on where its crest is. Along the bisector of the point's own ray and the crest's direction. Along the point's
  // own ray alone, where the rays fan out over the inside reef (45° within 8 m) a point 6 m ahead of its crest measured
  // 1 m, took the crest's height and foam among drained neighbours, and stood as a white-topped spike 0.68 m above
  // everything 4 m around it (Andrew's "rock"). Along the crest's direction alone, the peak's meeting line (where the two
  // ledges' rays meet and the direction swings 40° in 2 m) creased the settled water behind it (0.22 m in 0.5 m).
  const sx = f.dirX + crest.f.dirX, sz = f.dirZ + crest.f.dirZ, sl = Math.hypot(sx, sz);
  const bx = sl > 0 ? sx / sl : 1, bz = sl > 0 ? sz / sl : 0;
  const facing = f.dirX * bx + f.dirZ * bz;
  const v0 = (x - crest.x) * bx + (z - crest.z) * bz;
  // Per metre of the displaced surface along travel (ahead): Phase 1's derivatives along s, over its Jacobian.
  const perAhead = dXiDs / jacobian;
  // Where the front leans, breaking also needs the unleaned wave (breakPoint: the drained hollow is the unleaned one's).
  const shapeU = Math.cos(theta) + B * Math.cos(2 * theta);
  // (Unleaned and unsettled: without either it is the wave itself, bit for bit, as the GPU reads it.)
  const slopeU = (A * lateral * (dEnv * shapeU - env * w.omega * (Math.sin(theta) + 2 * B * Math.sin(2 * theta))) * dXiDs) / jacobian;
  const b = breakPoint({
    theta, env: env * lateral, uUnbroken: v0 + dh * facing, eta: aE * shapeU, uCrest: cf.pitchC * cf.etaCrest, etaCrest: cf.etaCrest, H: cf.Hc * lateral, k: crest.f.k,
    hmin: crest.f.hminBreak, boreH: cf.boreH, lipTop: cf.lipTop, lipHeight: cf.lipHeight, lateral,
    slope: slopeU, dThetaDAhead: w.omega * perAhead, dEnvDAhead: dEnv * lateral * perAhead, crestConfidence: crest.confidence,
    lean: leaning ? { eta, slope: slopeAlong } : undefined,
  }, crest.lc, crest.params);
  out.foam = b.foam;
  if (o.shape === false || o.shape === 'lean') return out;
  out.eta = b.eta;
  out.slopeX += f.dirX * b.dEtaDAhead;
  out.slopeZ += f.dirZ * b.dEtaDAhead;
  out.pile = b.pile;
  return out;
}

/** The crest's frame for one wave (waveAtCrest's second half): its height, lean and crest height, the bore it settles to,
 * and the pile's lip, with the lateral taper `lateral`. */
function crestFrame(w: ActiveWave, crest: Crest, lateral: number, o: BreakOptions) {
  const fc = crest.f;
  const Hc = localHeight(w, fc);
  const ac = (Hc / 2) * lateral;
  const sigmaC = Math.max(Math.tanh(fc.k * fc.depth), 0.05);
  const stokes = (height: number): number => Math.min(STOKES_CAP, (fc.k * (height / 2) * (3 - sigmaC * sigmaC)) / (4 * sigmaC * sigmaC * sigmaC));
  const nearBreakingC = smoothstep(0.3, BREAKING_RATIO, Hc / Math.max(fc.hmin, MIN_DEPTH_M));
  const pitchC = Math.min(PITCH_MAX * nearBreakingC, PITCH_KA_CAP / Math.max(fc.k * ac, 1e-4));
  const etaCrest = ac * (1 + stokes(Hc));
  const boreH = Math.min(w.heightM * fc.amp, BREAKING_RATIO * fc.hminBreak) * lateral;
  const lipH = o.pile !== false && crest.lipH ? crest.lipH : 0;
  return { Hc, pitchC, etaCrest, boreH, lipTop: (lipH / 2) * (1 + stokes(lipH)) * lateral, lipHeight: lipH * lateral };
}

/** The crest's height reaches this far from the crest in phase: fully within CREST_HEIGHT_REACH[0] periods, gone by [1]. */
export const CREST_HEIGHT_REACH: readonly [number, number] = [1 / 8, 1 / 4];

/**
 * The wave's height at a point `xi` seconds behind its crest: the point's own (localHeight) until the wave stands up,
 * then, near the crest, its crest's: by the crest's sharpening (1 from onset on) × the lookup's confidence × nearness
 * (1 within CREST_HEIGHT_REACH[0] periods of the crest, 0 from [1]). A wave is one shape: its crest is its highest
 * point. With each point's own height, capped at BREAKING_RATIO × the depth under it, a crest crossing from the ledge
 * onto the shallower reef top was capped lower than its own back, still over the ledge: the highest water stayed
 * behind as a hump that stopped advancing, and a new crest grew ahead of it where the reef deepened (Andrew's "passes
 * by, then a second wave"). Far from the crest the lookup lands unreliably (its confidence swings between neighbours),
 * and a deep-water back and a reef-top crest can differ threefold in height: weighted in there, the lookup's noise
 * drew metre-high steps along the crest. The nearness keeps the crest's height to the face and the back just behind it.
 */
export function waveHeightAt(w: ActiveWave, f: FieldSample, crest: Crest | null, xi: number): number {
  const own = localHeight(w, f);
  if (!crest) return own;
  const period = (2 * Math.PI) / w.omega;
  const near = 1 - smoothstep(CREST_HEIGHT_REACH[0] * period, CREST_HEIGHT_REACH[1] * period, Math.abs(xi));
  const weight = crest.lc.steep * crest.confidence * near;
  return weight > 0 ? own + (localHeight(w, crest.f) - own) * weight : own;
}

/**
 * Where the point's crest is along its own ray: one straight step of ξ·c (m) along the field direction at the point, at
 * most half a wavelength either way. Where the onset record is read (crestAt).
 */
export function rayCrestPoint(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext): { x: number; z: number } {
  const reach = Math.PI / f.k;
  const d = Math.max(-reach, Math.min(reach, (phaseXi(x, z, t, f, w, ctx) * ctx.omega) / f.k));
  return { x: x + f.dirX * d, z: z + f.dirZ * d };
}

/** One wave at one point. Without `o` (or with breaking disabled) this is the Phase 1 wave. */
export function waveAt(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o?: BreakOptions): SetWaveResult {
  return waveAtCrest(x, z, t, f, w, ctx, crestAt(x, z, t, f, w, ctx, o), o);
}

/**
 * The whitewater pile's top above still water at w's crest nearest (x, z), its own height (the lip, surged and decayed,
 * breaking.pileTop before its floor) and its floor (the settled bore's top): null where there is no pile (unbroken, off
 * the record, or the lip no higher than the floor). Tests and diagnostics: the sheet stands at `top` at the pile's top
 * once the curl has collapsed.
 */
export function crestPileTop(x: number, z: number, t: number, f: FieldSample, w: ActiveWave, ctx: WaveContext, o: BreakOptions): { top: number; own: number; floor: number } | null {
  const crest = crestAt(x, z, t, f, w, ctx, o);
  if (!crest || crest.lipH === null || !(crest.lc.pile > 0)) return null;
  const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, Math.hypot(x, z));
  const q = (2 * (-x * w.travelZ + z * w.travelX - w.crestOffsetM)) / w.crestLengthM;
  const lateral = 1 + (Math.exp(-(q * q * q * q)) - 1) * wFar;
  const cf = crestFrame(w, crest, lateral, o);
  const floor = settledCrestTop(cf.etaCrest, cf.Hc * lateral, crest.f.hminBreak, lateral, o.params);
  return cf.lipTop > floor ? { top: pileTop(cf.lipTop, floor, crest.lc), own: cf.lipTop * crest.lc.surge * crest.lc.decay, floor } : null;
}

function accumulate(out: SetWaveResult, r: SetWaveResult): void {
  out.eta += r.eta; out.dx += r.dx; out.dz += r.dz; out.slopeX += r.slopeX; out.slopeZ += r.slopeZ;
  out.foam = Math.max(out.foam, r.foam); out.stage = Math.max(out.stage, r.stage); out.pile = Math.max(out.pile, r.pile);
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
