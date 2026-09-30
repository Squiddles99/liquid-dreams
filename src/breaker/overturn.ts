import { travelDirectionXZ } from '../conditions/directions';
import { smoothstep } from '../math/smoothstep';
import type { BreakParams } from './breaking';

/**
 * The barrel from the maths (spec 2026-09-30-barrel-from-maths §3): the overturning tube's size, shape and tilt from
 * ψ₀ = s / (H₀/h₀)^¼ (Pick & Feddersen 2026, eqs 3.5, 3.7–3.10), its outline Longuet-Higgins' (1982), the wind's
 * factors measured at field scale (Feddersen et al. 2023), and the few game rules the papers don't cover (labelled).
 * The source of truth: overturnNodes.ts mirrors it term by term on the GPU.
 */

/** No tube below PSI_NONE; the smallest tube from PSI_MIN (the fits are evaluated at ψ clamped to [PSI_MIN, PSI_FIT_MAX]). */
export const PSI_NONE = 0.01;
export const PSI_MIN = 0.02;
/** The fits cover 0 < ψ < 0.1 (slopes 1:100 to 1:10); past it the tube rounds toward Mead & Black by PSI_FOIL_FULL. */
export const PSI_FIT_MAX = 0.1;
export const PSI_FOIL_FULL = 0.15;
/** A crest off the reef's record reads this (state 5, a normal good day). */
export const PSI_NORMAL = 0.065;
/** Longuet-Higgins' outline: half width LH82_K · W · √ξ (1 − ξ); area LH82_AREA · W · L. */
export const LH82_K = (3 * Math.sqrt(3)) / 4;
export const LH82_AREA = (2 * Math.sqrt(3)) / 5;
/** Mead & Black's gradient X is read from ψ at this wave height ÷ depth (the mockup's). */
export const MB_H_OVER_H0 = 0.5;
/** Game rules (not from the papers): a lull ×(1 + LULL_GAIN), stacking ×(1 − STACK_LOSS); the dial and nudge. */
export const LULL_GAIN = 0.1;
export const STACK_LOSS = 0.2;
export const RANDOM_DIAL_MAX = 0.15;
export const PSI_NUDGE_RANGE: readonly [number, number] = [-0.5, 0.5];
/** Feddersen et al. 2023, relative to calm, (U/C, factor), held past the ends. */
export const WIND_AREA_POINTS: readonly (readonly [number, number])[] = [[-0.4, 1.2], [0, 1], [0.75, 0.6]];
export const WIND_ASPECT_POINTS: readonly (readonly [number, number])[] = [[-0.5, 1.2], [0, 1], [0.75, 0.62]];
/** The sheet's trough drain and surge at the state points (ψ, troughDrain, pileSurge): Andrew's photo-traced anchors,
 * re-keyed to ψ (no paper covers them; plan ruling 8). */
export const SHEET_POINTS: readonly (readonly [number, number, number])[] = [[0.035, 0.2194, 0], [0.065, 0.6352, 0.3], [0.09, 0.8178, 0.45]];
/** The BreakParams keys each crest sets from its ψ (withSheetShape). */
export const PER_CREST_BREAK_KEYS = ['troughDrain', 'pileSurge'] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

export const tubeAreaFit = (psi: number): number => 5.319 * psi - 0.043;
export const lipAreaFit = (psi: number): number => 37.072 * psi * psi - 0.587 * psi + 0.02;
export const aspectFit = (psi: number): number => 1.661 * psi + 0.298;
export const tiltFitDeg = (psi: number): number => -5746.4 * psi * psi + 225.2 * psi + 48.4;
/** Mead & Black 2001: tube length ÷ width = 0.065 X + 0.821 on a seabed gradient 1:X; returned as width ÷ length. */
export const meadBlackAspect = (X: number): number => 1 / (0.065 * X + 0.821);

/** The onshore wind over the crest speed (Feddersen's U/C: positive onshore), from the offshore speed (offshoreSpeed). */
export function windUC(offshoreMs: number, c: number): number {
  return finite(-offshoreMs / Math.max(c, 0.5), 0);
}
function piecewise(points: readonly (readonly [number, number])[], x: number): number {
  const v = finite(x, 0);
  if (v <= points[0][0]) return points[0][1];
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (v <= x1) return y0 + ((v - x0) * (y1 - y0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}
export const windAreaFactor = (uc: number): number => piecewise(WIND_AREA_POINTS, uc);
export const windAspectFactor = (uc: number): number => piecewise(WIND_ASPECT_POINTS, uc);

export interface Overturn {
  /** The ψ it was built for. */
  psi: number;
  /** 0 below PSI_NONE, 1 from PSI_MIN: the constructed curve's share (plan ruling 7). */
  presence: number;
  /** Tube and lip areas (m²), the tube's width and length (m), its tilt below the horizontal (rad). */
  AO: number;
  AJ: number;
  W: number;
  L: number;
  theta: number;
  /** 0 up to PSI_FIT_MAX, 1 from PSI_FOIL_FULL: how far the roundness has gone toward Mead & Black's. */
  foil: number;
}

/** The tube at the moment the lip lands, for ψ, a wave height H (m) and the wind's U/C. */
export function overturnShape(psi: number, H: number, uc: number): Overturn {
  const q = finite(psi, PSI_NORMAL), h = Math.max(finite(H, 0), 0);
  const p = clamp(q, PSI_MIN, PSI_FIT_MAX);
  const foil = smoothstep(PSI_FIT_MAX, PSI_FOIL_FULL, q);
  const fa = windAreaFactor(uc), fw = windAspectFactor(uc);
  const fit = aspectFit(p);
  const mb = meadBlackAspect(1 / (Math.max(q, 1e-6) * MB_H_OVER_H0 ** 0.25));
  const WL = (fit + (Math.max(mb, fit) - fit) * foil) * fw;
  const AO = tubeAreaFit(p) * h * h * fa, AJ = lipAreaFit(p) * h * h * fa;
  const L = Math.sqrt(AO / (LH82_AREA * WL));
  return { psi: q, presence: smoothstep(PSI_NONE, PSI_MIN, q), AO, AJ, W: WL * L, L, theta: (tiltFitDeg(p) * Math.PI) / 180, foil };
}

export type PsiState = 'none' | 'oval' | 'cylinder' | 'thrown' | 'slab';
/** Andrew's states by ψ: none (< PSI_MIN), 4 oval (< 0.05), 5 cylinder (< 0.08), 6 thrown (≤ 0.1), past it a slab. */
export function psiState(psi: number): PsiState {
  if (!(psi >= PSI_MIN)) return 'none';
  if (psi < 0.05) return 'oval';
  if (psi < 0.08) return 'cylinder';
  if (psi <= PSI_FIT_MAX) return 'thrown';
  return 'slab';
}
export function psiStateLabel(psi: number): string {
  return { none: 'no tube', oval: 'oval (4)', cylinder: 'cylinder (5)', thrown: 'thrown out (6)', slab: 'slab (past 6)' }[psiState(psi)];
}

/** The wind's speed against the waves' travel (m/s): positive offshore (blowing into the waves' faces), negative onshore. */
export function offshoreSpeed(windSpeedMs: number, windFromDeg: number, travelX: number, travelZ: number): number {
  const toward = travelDirectionXZ(windFromDeg);
  return -windSpeedMs * (toward.x * travelX + toward.z * travelZ);
}

/** Game rule: a wave `gapS` after the one before (Infinity: after a lull) finds the reef drained more or less. */
export function drainFactor(gapS: number, periodS: number): number {
  const g = Number.isNaN(gapS) ? Infinity : Math.max(gapS, 0);
  return 1 + LULL_GAIN * smoothstep(periodS, 2 * periodS, g) - STACK_LOSS * (1 - smoothstep(0.6 * periodS, periodS, g));
}

/** The crest's ψ: the reef's ψ₀ with the game rules (drain, the dial's draw, the nudge) as factors. */
export function effectivePsi(psi0: number, i: { drain: number; draw: number }, p: Pick<BreakParams, 'psiNudge' | 'randomDial'>): number {
  return psi0 * i.drain * (1 + p.randomDial * i.draw) * (1 + p.psiNudge);
}

export interface SheetShape {
  troughDrain: number;
  pileSurge: number;
}
/** The sheet's trough drain and surge at ψ: SHEET_POINTS, smoothstep-eased between neighbours, held past the ends. */
export function sheetShape(psi: number): SheetShape {
  const q = finite(psi, PSI_NORMAL), P = SHEET_POINTS;
  if (q <= P[0][0]) return { troughDrain: P[0][1], pileSurge: P[0][2] };
  if (q >= P[P.length - 1][0]) return { troughDrain: P[P.length - 1][1], pileSurge: P[P.length - 1][2] };
  const k = q < P[1][0] ? 0 : 1, a = P[k], b = P[k + 1];
  const t = smoothstep(a[0], b[0], q);
  return { troughDrain: a[1] * (1 - t) + b[1] * t, pileSurge: a[2] * (1 - t) + b[2] * t };
}
/** `p` with the per-crest keys at ψ (a copy). */
export function withSheetShape(p: BreakParams, psi: number): BreakParams {
  const s = sheetShape(psi);
  return { ...p, troughDrain: s.troughDrain, pileSurge: s.pileSurge };
}
