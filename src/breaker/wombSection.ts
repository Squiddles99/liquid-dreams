import { smoothstep } from '../math/smoothstep';
import { hollowFromPsi } from './reefReport';
import { CREST_KNOT, CURVE_SAMPLES, type P2, STAGES, TIP_KNOT, profileCurve, profileKnots } from './wombProfile';

/**
 * A crest station's cross-section as the Womb's profile family (spec 2026-10-05-womb-profile-design §2, §4; plan
 * 2026-10-05-womb-profile-step3 3a–3b). The station gives its numbers: the scale A, the phase through the break, the
 * hollowness and the ribbon's weight; the section is wombProfile's curve at them, A to the metre, placed on the station's
 * (u, y) plane (u along the wave's travel from the crest, y up from still water) and blended into the sea's sheet at its
 * ends. Pure: the ribbon's GPU mirrors it, the ride and the spray read it on the CPU.
 */

const GRAVITY_MS2 = 9.81;
/** The profile at onset stands this many units crest to trough (wombProfile's pitching key: 1 above sea level, 0.3 below). */
export const ONSET_HEIGHT_UNITS = 1.3;
/**
 * The tube's hold at the round barrel and the collapse after it (s), grown with the wave's power, H × T (Andrew,
 * 2026-10-05: "a smaller wave will collapse into whitewater faster than a big, heavy, thick wave"): BASE + PER × H × T/15
 * (H in m, T in s). A 2 m, 15 s wave holds 0.9 s and collapses in 1.3 s; a 7 m one 2.15 s and 2.55 s.
 */
export const HOLD_BASE_S = 0.4;
export const HOLD_PER_M = 0.25;
export const COLLAPSE_BASE_S = 0.8;
export const COLLAPSE_PER_M = 0.25;
/**
 * Before its onset a section stands no further than this phase: a steep wall, its lip only starting to pitch. A section
 * the peel stretch holds waits here until its turn (spec 2026-10-04 §2: "ahead of the curl the wave stands as a steep
 * wall … until its turn"), then throws.
 */
export const STOOD_PHASE = 0.45;
/** The lip's flight (onset to the round barrel) is the free fall from this many A, the crest to the landing below sea level. */
export const FLIGHT_DROP_A = 1.3;
/** After the white-water wall the section hands back to the sheet over this long (s); the foam carries on over it. */
export const SECTION_HAND_BACK_S = 0.5;
/** The ribbon's weight rises as the onset ratio goes from the ribbon's onset to this (it stands up out of the sheet). */
export const RHO_FULL_RATIO = 0.9;
/** Over the profile's ends (|u| from INNER to 7 units of A) the section blends into the sheet. */
export const EDGE_INNER_UNITS = 4;
export const EDGE_OUTER_UNITS = 7;

export interface SectionInput {
  /** The station's local wave height (m), crest to trough. */
  H: number;
  /** Breaking ratio (the onset ratio): 1 at onset. */
  r: number;
  /** Time since onset (s): null before breaking (or while the section waits its turn), Infinity long after. */
  tb: number | null;
  /** The reef's ψ₀ where it broke (Station.psi). */
  psi: number;
  /** The swell's period (s). */
  periodS: number;
}

export interface SectionParams {
  /** The ribbon's onset ratio: below it there is no section (BreakParams.ribbonOnset). */
  ribbonOnset: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The scale A (m): the crest's height above still water when the lip pitches. */
export const sectionScale = (H: number): number => Math.max(0, H) / ONSET_HEIGHT_UNITS;
/** How long (s) the lip flies from onset to the round barrel. */
export const flightTime = (H: number): number => Math.sqrt((2 * FLIGHT_DROP_A * sectionScale(H)) / GRAVITY_MS2);
const power = (H: number, periodS: number): number => Math.max(0, H) * (periodS / 15);
export const tubeHold = (H: number, periodS: number): number => HOLD_BASE_S + HOLD_PER_M * power(H, periodS);
export const collapseSpan = (H: number, periodS: number): number => COLLAPSE_BASE_S + COLLAPSE_PER_M * power(H, periodS);

/**
 * The phase through the break (wombProfile: 0 swell … 0.5 the lip pitching … 1 the round barrel … 2 the white-water wall).
 * Before onset it rises with the onset ratio to STOOD_PHASE; after, it runs on in time: the lip's flight to the
 * barrel, the tube's hold, the collapse.
 */
export function sectionPhase(s: SectionInput, p: SectionParams): number {
  if (s.tb === null) return STOOD_PHASE * smoothstep(p.ribbonOnset, 1, s.r);
  if (!Number.isFinite(s.tb)) return 2;
  const t = Math.max(0, s.tb), fly = flightTime(s.H), hold = tubeHold(s.H, s.periodS);
  if (t < fly) return STOOD_PHASE + (STAGES.barrel - STOOD_PHASE) * (t / fly);
  if (t < fly + hold) return STAGES.barrel;
  return Math.min(2, STAGES.barrel + (t - fly - hold) / collapseSpan(s.H, s.periodS));
}

/** When (s after onset) the section reaches the white-water wall, and hands back to the sheet. */
export const sectionEnd = (H: number, periodS: number): number => flightTime(H) + tubeHold(H, periodS) + collapseSpan(H, periodS);

/** The ribbon's weight ρ: in from the sheet as the wave stands up, out to it after the white-water wall. */
export function sectionWeight(s: SectionInput, p: SectionParams): number {
  if (s.tb === null) return smoothstep(p.ribbonOnset, RHO_FULL_RATIO, s.r);
  if (!Number.isFinite(s.tb)) return 0;
  return 1 - smoothstep(0, SECTION_HAND_BACK_S, s.tb - sectionEnd(s.H, s.periodS));
}

export interface SectionNumbers { A: number; phase: number; hollow: number; rho: number }

export function sectionNumbers(s: SectionInput, p: SectionParams): SectionNumbers {
  return { A: sectionScale(s.H), phase: sectionPhase(s, p), hollow: hollowFromPsi(s.psi), rho: sectionWeight(s, p) };
}

/** The sheet along the station: at u m from the crest along the wave's travel, the displaced (u, y) of the sea there. */
export type SheetAlong = (u: number) => P2;

export interface Section {
  numbers: SectionNumbers;
  /** CURVE_SAMPLES points (u, y) in m, front edge (the beach side) to back edge: the ribbon mesh's order. */
  points: P2[];
  /** The crest's top, and the lip's tip, as drawn (u, y). */
  crest: P2;
  tip: P2;
}

/** How much of the profile is drawn at u units of A from the crest: all of it inside, none past its ends. */
export const interiorWeight = (uUnits: number): number => 1 - smoothstep(EDGE_INNER_UNITS, EDGE_OUTER_UNITS, Math.abs(uUnits));

/** The station's section from its own numbers (no smoothing along the crest), blended into `sheet`. */
export function wombSection(s: SectionInput, sheet: SheetAlong, p: SectionParams): Section {
  return sectionOf(sectionNumbers(s, p), sheet);
}

/** The section for given numbers (a station's, smoothed along the crest: Station.section), blended into `sheet` by ρ and
 * toward its ends. */
export function sectionOf(numbers: SectionNumbers, sheet: SheetAlong): Section {
  const { A, phase, hollow, rho } = numbers;
  const curve = profileCurve(phase, hollow, CURVE_SAMPLES);
  const place = (q: P2): P2 => {
    const S = sheet(A * q[0]), w = rho * interiorWeight(q[0]);
    return [S[0] + (A * q[0] - S[0]) * w, S[1] + (A * q[1] - S[1]) * w];
  };
  const points: P2[] = [];
  for (let j = curve.length - 1; j >= 0; j--) points.push(place(curve[j]));
  const k = profileKnots(phase, hollow);
  return { numbers, points, crest: place(k[CREST_KNOT]), tip: place(k[TIP_KNOT]) };
}
