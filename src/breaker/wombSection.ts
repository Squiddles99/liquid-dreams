import { smoothstep } from '../math/smoothstep';
import { hollowFromPsi } from './reefReport';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, type P2, STAGES, TIP_KNOT, profileCurve, profileKnots } from './wombProfile';

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
/**
 * A section held for its turn stands up over this long before it (s): well down the line it keeps the swell's gentle
 * shape, and only the last stretch before the curl reaches it stands vertical (Andrew, 2026-10-05, in the game: "it should
 * be vertical closest to where the lip is throwing … further down the line … a less vertical gradient, similar to how the
 * swell approaches before it breaks").
 */
export const STAND_LEAD_S = 2;
/** The lip's flight (onset to the round barrel) is the free fall from this many A, the crest to the landing below sea level. */
export const FLIGHT_DROP_A = 1.3;
/** After the white-water wall the section hands back to the sheet over this long (s); the foam carries on over it. */
export const SECTION_HAND_BACK_S = 0.5;
/** The ribbon's weight rises as the onset ratio goes from the ribbon's onset to this (it stands up out of the sheet). */
export const RHO_FULL_RATIO = 0.9;
/**
 * The profile's ends (units of A): the section is the sheet's from here out. Over its last stretch, EDGE_BLEND_UNITS, it
 * blends into the sheet (the mesh's edge meets the sheet's surface exactly).
 */
export const EDGE_OUTER_UNITS = 7;
export const EDGE_BLEND_UNITS: readonly [number, number] = [6, EDGE_OUTER_UNITS];
/**
 * The profile is drawn about still water, its back and its front running gently down to sea level at its ends; the sea
 * round a breaking wave is not still, so the profile is lifted (or lowered) to the sheet's level at each end, by a ramp
 * from none at LIFT_UNITS[0] from the crest to all of it at the end. Handed to the sheet nearer the curl instead, the
 * swell's broad hump stood behind and in front of the profile's narrow crest as a second wave (Andrew, 2026-10-05, in the
 * game: "the 2 waves are still very much there"; wanted: "a smooth gradient returning down to sea level").
 */
export const LIFT_UNITS: readonly [number, number] = [1, EDGE_OUTER_UNITS];

export interface SectionInput {
  /** The station's local wave height (m), crest to trough. */
  H: number;
  /** Breaking ratio (the onset ratio): 1 at onset. */
  r: number;
  /** Time since onset (s): null before breaking (or while the section waits its turn), Infinity long after. */
  tb: number | null;
  /** While the peel stretch holds the section: how long until its turn (s) (Station.wait); absent or null otherwise. */
  wait?: number | null;
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
 * Before onset it rises with the onset ratio to STOOD_PHASE, and a section held for its turn only over the last
 * STAND_LEAD_S before it; after, it runs on in time: the lip's flight to the
 * barrel, the tube's hold, the collapse.
 */
export function sectionPhase(s: SectionInput, p: SectionParams): number {
  if (s.tb === null) return STOOD_PHASE * smoothstep(p.ribbonOnset, 1, s.r) * standing(s);

  if (!Number.isFinite(s.tb)) return 2;
  const t = Math.max(0, s.tb), fly = flightTime(s.H), hold = tubeHold(s.H, s.periodS);
  if (t < fly) return STOOD_PHASE + (STAGES.barrel - STOOD_PHASE) * (t / fly);
  if (t < fly + hold) return STAGES.barrel;
  return Math.min(2, STAGES.barrel + (t - fly - hold) / collapseSpan(s.H, s.periodS));
}

/** When (s after onset) the section reaches the white-water wall, and hands back to the sheet. */
export const sectionEnd = (H: number, periodS: number): number => flightTime(H) + tubeHold(H, periodS) + collapseSpan(H, periodS);

/** A section held for its turn: 0 more than STAND_LEAD_S before it, 1 at it; 1 for a section not held. */
const standing = (s: SectionInput): number => (s.wait === undefined || s.wait === null ? 1 : 1 - smoothstep(0, STAND_LEAD_S, s.wait));

/**
 * The ribbon's weight ρ: in from the sheet as the wave stands up, out to it after the white-water wall. A section held for
 * its turn comes in over the same last STAND_LEAD_S as its phase: further down the line the swell is the sheet's own. The
 * profile's unbroken keys stand lower than the shoaled swell at the station's height (phase 0's crest is 0.55 A, the
 * sheet's about 0.9 A), so drawn there they pressed the wall down the line a metre under the swell: "the wall of the wave
 * in front of the surfer doesn't extend very far" (Andrew, 2026-10-05, in the game).
 */
export function sectionWeight(s: SectionInput, p: SectionParams): number {
  if (s.tb === null) return smoothstep(p.ribbonOnset, RHO_FULL_RATIO, s.r) * standing(s);
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
export const interiorWeight = (uUnits: number): number => 1 - smoothstep(EDGE_BLEND_UNITS[0], EDGE_BLEND_UNITS[1], Math.abs(uUnits));

/** How much of the sheet's level at the profile's end on u's side lifts the profile at u units of A from the crest. */
export const endLift = (uUnits: number): number => smoothstep(LIFT_UNITS[0], LIFT_UNITS[1], Math.abs(uUnits));

/** The sheet's levels (m) at the profile's two ends, the front (+EDGE_OUTER_UNITS) and the back (−). */
export const sheetEnds = (A: number, sheet: SheetAlong): { front: number; back: number } =>
  ({ front: sheet(A * EDGE_OUTER_UNITS)[1], back: sheet(-A * EDGE_OUTER_UNITS)[1] });

/** A profile point (units of A) placed on the station's plane (m): lifted to the sheet's level at its end, blended into the
 * sheet by ρ and toward the ends. */
function placer(numbers: SectionNumbers, sheet: SheetAlong): (q: P2) => P2 {
  const { A, rho } = numbers, ends = sheetEnds(A, sheet);
  return (q) => {
    const S = sheet(A * q[0]), w = rho * interiorWeight(q[0]);
    const y = A * q[1] + endLift(q[0]) * (q[0] < 0 ? ends.back : ends.front);
    return [S[0] + (A * q[0] - S[0]) * w, S[1] + (y - S[1]) * w];
  };
}

/** The station's section from its own numbers (no smoothing along the crest), blended into `sheet`. */
export function wombSection(s: SectionInput, sheet: SheetAlong, p: SectionParams): Section {
  return sectionOf(sectionNumbers(s, p), sheet);
}

/** The section for given numbers (a station's, smoothed along the crest: Station.section), blended into `sheet` by ρ and
 * toward its ends. */
export function sectionOf(numbers: SectionNumbers, sheet: SheetAlong): Section {
  const { phase, hollow } = numbers;
  const curve = profileCurve(phase, hollow, CURVE_SAMPLES);
  const place = placer(numbers, sheet);
  const points: P2[] = [];
  for (let j = curve.length - 1; j >= 0; j--) points.push(place(curve[j]));
  const k = profileKnots(phase, hollow);
  return { numbers, points, crest: place(k[CREST_KNOT]), tip: place(k[TIP_KNOT]) };
}

/** What the spray, the impact, the spit and the tube camera read of a station's section (in place of lipProfile's frame):
 * points on the station's (u, y) plane (m, y from still water), drawn as the ribbon draws them. */
export interface SectionFrame {
  /** How far the lip is through its throw [0, 1]: 0 as it pitches (STOOD_PHASE), 1 at the round barrel. */
  prog: number;
  /** How much lip there is [0, 1]: in as it pitches, out as the tube caves in. */
  weight: number;
  rho: number;
  /** The lip's tip, the crest's top, the tube's floor (the face's foot), drawn. */
  tip: P2;
  crest: P2;
  floor: P2;
  /** The tip's speed along the wave's travel (m/s, world: the crest's speed c plus its throw). */
  vj: number;
  /** When the lip lands (s after onset): its flight. */
  tauLand: number;
  /** How far ahead of the crest the tip is (m). */
  reach: number;
}

/** The lip is present over these phases: in as it pitches, out as the tube caves in. */
export const LIP_PHASES: readonly [number, number, number, number] = [0.4, 0.55, 1.2, 1.45];
export const lipWeight = (phase: number): number => smoothstep(LIP_PHASES[0], LIP_PHASES[1], phase) * (1 - smoothstep(LIP_PHASES[2], LIP_PHASES[3], phase));

/** The station's section frame: its numbers (smoothed, Station.section), its height H, crest speed c and the sheet. */
export function sectionFrame(numbers: SectionNumbers, H: number, c: number, sheet: SheetAlong): SectionFrame {
  const { A, phase, hollow, rho } = numbers;
  const place = placer(numbers, sheet);
  const k = profileKnots(phase, hollow), tip = place(k[TIP_KNOT]), crest = place(k[CREST_KNOT]), floor = place(k[FLOOR_KNOT]);
  // The tip's throw: its u's rate in phase, times the phase's rate in time over the lip's flight.
  const fly = flightTime(H), dPhase = 0.01, ahead = profileKnots(Math.min(2, phase + dPhase), hollow)[TIP_KNOT][0];
  const flying = phase > STOOD_PHASE && phase < STAGES.barrel ? (STAGES.barrel - STOOD_PHASE) / Math.max(fly, 1e-6) : 0;
  const vj = c + (A * (ahead - k[TIP_KNOT][0]) / dPhase) * flying;
  return {
    prog: Math.min(1, Math.max(0, (phase - STOOD_PHASE) / (STAGES.barrel - STOOD_PHASE))), weight: lipWeight(phase), rho,
    tip, crest, floor, vj, tauLand: fly, reach: tip[0] - crest[0],
  };
}
