import { smoothstep } from '../math/smoothstep';
import { LEFT_BEARING_DEG, TIP } from '../seabed/wombReef';
import { UNTIL_NEVER } from './breaking';
import { hollowFromPsi } from './reefReport';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, FRONT_KNOT, type P2, PROFILE_KEYS, SPAN_SAMPLES, STAGES, TIP_KNOT, TROUGH_KNOT, crStep, crTangent, curveSamples, hermitePoint, profileKnots, roundedTip, tipLife } from './wombProfile';

/**
 * A crest station's cross-section as the Womb's profile family (spec 2026-10-05-womb-profile-design §2, §4; plan
 * 2026-10-05-womb-profile-step3 3a–3b). The station gives its numbers: the scale A, the phase through the break, the
 * hollowness and the curl's weight; the section is one curve on the station's (u, y) plane (u along the wave's travel from
 * the crest, y up from still water): its ends are the sea's sheet, sampled, and its curl is wombProfile's drawing, A to the
 * metre (plan 2026-10-06-wave-root-cause step 3, Andrew's ruling: one surface, no blends). Pure: the ribbon's GPU mirrors
 * it, the ride and the spray read it on the CPU.
 */

export const GRAVITY_MS2 = 9.81;
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
 * The wall down the line: a section stands up over this many swell periods before it breaks (or its turn), from the swell's
 * own shape to a steep wall (STOOD_PHASE) as the curl reaches it (plan 2026-10-06-wave-root-cause, Andrew's "extended wall
 * of the yet to break wave, to plan how I ride"). On the time until it breaks (the reef record's, breaking.onsetUntil), not
 * its breaking ratio: on the Womb's deep basin the ratio only rises in the last 10 m before a point breaks. One period,
 * smoothstepped (womb-realism Task 2, spec 3.1): the 8 s squared ramp stood the wall up late and steeply, image 3's "no
 * gradient into the building wall". The dial wallLeadT (setWallLeadT); the GPU mirrors it (SetWaves' standing). 0.75 (STOP 2
 * ruling, until Andrew picks from task3/wallLead-ab.jpg): 1.0 stood the wall at curl height a period ahead (the closeout look),
 * 0.5 stood it up late.
 */
export const WALL_LEAD_T = 0.75;
const WALL = { leadT: WALL_LEAD_T };
/** The dial wallLeadT (BreakParams.wallLeadT): the wall's lead in swell periods. */
export const setWallLeadT = (t: number): void => { WALL.leadT = t; };
export const wallLeadT = (): number => WALL.leadT;
/** The wall's lead (s) for a swell of `periodS`. */
export const wallLeadS = (periodS: number): number => WALL.leadT * periodS;
/**
 * How far a section has stood up [0, 1] with `until` s to go before it breaks (or its turn): 0 a lead (wallLeadS) or more
 * away, 1 at it, 0 where it never breaks (Infinity), a smoothstep between.
 */
/**
 * How far a section has stood up, and the sea's front squeezed to the drawn face [0, 1], with `until` s to go
 * (sectionPhase, setWaveModel.frontStanding; the GPU's standing): (1 − until/FRONT_LEAD_S)², the old wall ramp, kept apart
 * from the wall's height lead (wallWeight; womb-realism Task 2 ruling): on the one-period smoothstep the wave stood a steep
 * wall and its front was as short as the face a second before the break, and it passed under a paddling surfer before the
 * catch could bring him to speed (rideOnSections: Solid and Huge not caught).
 */
export const FRONT_LEAD_S = 8;
/** `region` (shoulderRegion at the crest; absent 1): where the shoulder's taper holds. The take-off and the right keep the
 * wall's whole lead (the taper there cut the wave standing up into the peak to its last 2.3 s: its crest stood below the
 * water behind it). */
export const frontWeight = (until: number | null | undefined, region = 1, ahead = 0): number => {
  if (until === null || until === undefined || !Number.isFinite(until)) return 0;
  const left = 1 - Math.min(1, Math.max(0, until) / FRONT_LEAD_S);
  const byTime = SHOULDER.taperM > 0 ? left * left * (1 - region * (1 - shoulderStand(until))) : left * left;
  // `ahead` (standAhead): at least by the distance from the curl's front (0 with the dial off: today, bit-equal).
  return ahead > byTime ? ahead : byTime;
};
export const wallWeight = (until: number | null | undefined, periodS: number, region = 1): number => {
  if (until === null || until === undefined || !Number.isFinite(until)) return 0;
  const w = 1 - smoothstep(0, wallLeadS(periodS), Math.max(0, until));
  return SHOULDER.taperM > 0 ? w * (1 - region * (1 - shoulderStand(until))) : w;
};
/**
 * The shoulder tapers (womb-story Task 3d, STOP 1b ruling 1; Andrew 2026-10-14: "there should not be the wall in front of
 * the wave face"): ahead of the curl the stand-up fraction falls from 1 to 0 over shoulderTaperM along the line, the
 * distance ahead read as the time until the section breaks (or its turn) x the curl's top speed (BreakParams.curlMaxMs),
 * so it rides with the curl and a closeout still stands up as it comes. 0 = today (STOP 0 ruling 4's wall, retired).
 * The dial shoulderTaperM (BreakParams.shoulderTaperM); the GPU mirrors it (breakingNodes.shoulderStandNode).
 */
// 0 by default (womb-story Task 7 ruling, STOP 2): Fable's 30 (STOP 1b ruling 1) cut the ride bot's held line on the
// Womb from 9.3-9.7 s to 5.4-6.9 s (rideOnSections, 4 of 4; green at 0); until Andrew picks from task3d/shoulder-ab.jpg and
// Fable rules the ride, the dial is live and the default is today.
export const SHOULDER_TAPER_M = 0;
/**
 * …and the shoulder's height falls to this share of its own there (shoulderFactor): the unstood swell on the drop stood
 * 5.0-5.1 m at 7 ft, taller than the curl's own 4.8 m crest (the wall Andrew marked; the stand-up never held it up).
 * 1 = the swell's own height (the ruling's law as written). The dial shoulderFloor (BreakParams.shoulderFloor).
 */
export const SHOULDER_FLOOR = 1;
const SHOULDER = { taperM: SHOULDER_TAPER_M, floor: SHOULDER_FLOOR, curlMs: 13, aheadM: 0 }; // aheadM: STAND_AHEAD_M (retired to 0, Task 10)
/**
 * The stand-up eases off by distance from the curl's front (Andrew 2026-10-14, moment 1791986608: "the almost cube-like
 * lump of wave face in front of the breaking lip"): where the curl stalls (the left's end at 7 ft: the station 1.3 m ahead
 * waits 3.45 s) the stand-up read by the time alone fell from the curl's to the swell's in 5 m along the crest, the lump's
 * side. Down the left (shoulderRegion), a station waiting its turn stands at least 1 − smoothstep(0, standAheadM, d), d m
 * ahead of the front (curlFront.curlFrontAlong). 0 = off. The dial standAheadM (BreakParams.standAheadM). The drawn
 * section only (sectionPhase; the ribbon is built from the CPU trace): on the sheet's front lean too, the distance is not
 * carried along the rays as the time is, so points of one face read different stand-ups and the sheet folded at the face's
 * foot (a stepped fin ahead of the lip, andrew-moment/stand-ahead-ab.jpg); the sheet keeps the time's stand-up.
 */
// 20 m by Andrew's pick (2026-10-14, andrew-moment/one-surface-ab.jpg row 3, with faceOnSheet on).
// 0: retired by the one-surface law (Task 10; the A/B sheet's 'before' sets 20).
export const STAND_AHEAD_M = 0;
export const setStandAhead = (m: number): void => { SHOULDER.aheadM = m; };
export function standAhead(x: number, z: number, frontAlong: number | undefined): number {
  if (!(SHOULDER.aheadM > 0) || frontAlong === undefined || !Number.isFinite(frontAlong)) return 0;
  const d = shoulderAlong(x, z) - frontAlong;
  if (d < 0) return 0;
  return shoulderRegion(x, z) * (1 - smoothstep(0, SHOULDER.aheadM, d));
}
/** Sets the shoulder's taper (m), floor (share) and the curl's top speed (m/s) the distance is read with. */
export const setShoulder = (taperM: number, floor: number, curlMs: number): void => { SHOULDER.taperM = taperM; SHOULDER.floor = floor; SHOULDER.curlMs = curlMs; };
export const shoulderTaperM = (): number => SHOULDER.taperM;
/** The stand-up fraction `u` s before the section's break (or turn): 1 − smoothstep(0, shoulderTaperM, u × curl speed);
 * 1 with the dial at 0, 0 where it never breaks. */
export const shoulderStand = (u: number): number => {
  if (!(SHOULDER.taperM > 0)) return 1;
  if (!Number.isFinite(u)) return 0;
  return 1 - smoothstep(0, SHOULDER.taperM, Math.max(0, u) * SHOULDER.curlMs);
};
/** Where the floor holds: down the left past the take-off (along 10 -> 30 m from the tip), from 80 -> 40 m seaward of the
 * ledge to 150 -> 200 m inshore of it (the right, the take-off and the open sea keep their own height). */
export const SHOULDER_ALONG_M: readonly [number, number] = [10, 30];
export const SHOULDER_SEAWARD_M: readonly [number, number] = [-80, -40];
export const SHOULDER_INSHORE_M: readonly [number, number] = [150, 200];
const BEAR = (LEFT_BEARING_DEG * Math.PI) / 180, SIN_B = Math.sin(BEAR), COS_B = Math.cos(BEAR);
export function shoulderRegion(x: number, z: number): number {
  const dx = x - TIP[0], dz = z - TIP[1], along = dx * SIN_B - dz * COS_B, cross = dx * COS_B + dz * SIN_B;
  return smoothstep(SHOULDER_ALONG_M[0], SHOULDER_ALONG_M[1], along) * smoothstep(SHOULDER_SEAWARD_M[0], SHOULDER_SEAWARD_M[1], cross)
    * (1 - smoothstep(SHOULDER_INSHORE_M[0], SHOULDER_INSHORE_M[1], cross));
}
/** The time (s) a crest has before its break or its turn, for the shoulder (shoulderFactor): null once broken or without
 * a record (tb ≥ 0, or undefined), −tb while held for its turn, else until. */
export const shoulderU = (tb: number | null | undefined, until: number | null | undefined): number | null =>
  tb === undefined ? null : tb !== null ? (tb >= 0 ? null : -tb) : (until ?? null);
/** The stand-up fraction `d` m ahead of the curl's front along the line (curlFront.curlFrontAlong): 1 − smoothstep(0,
 * shoulderTaperM, d); 1 at or behind the front, and with the dial at 0. */
export const shoulderStandAt = (d: number): number => (SHOULDER.taperM > 0 ? 1 - smoothstep(0, SHOULDER.taperM, Math.max(0, d)) : 1);
/** wombReef.ledgeAlongM (m down the left from the tip), here so the GPU mirror reads the same frame. */
export const shoulderAlong = (x: number, z: number): number => (x - TIP[0]) * SIN_B - (z - TIP[1]) * COS_B;
/**
 * The shoulder's height share at a crest at (x, z) `u` s before its break or turn (null: broken, its own height), with the
 * curl's front `frontAlong` m down the left (curlFront; absent: the time alone): 1 − region × (1 − floor) × (1 − stand),
 * stand the larger of the time's (shoulderStand: a closeout stands up as it comes) and the distance's (shoulderStandAt: past
 * the fizzle the time jumps to the shore's break, 5-11 s, and the taper fell to the floor between two stations). 1 with
 * either dial off.
 */
export function shoulderFactor(x: number, z: number, u: number | null | undefined, frontAlong?: number): number {
  // A crest that never breaks keeps its own (a wave too small to break anywhere skips the GPU's breaking: Phase 1 both sides).
  if (u === null || u === undefined || !(u < UNTIL_NEVER) || !(SHOULDER.floor < 1) || !(SHOULDER.taperM > 0)) return 1;
  const g = shoulderRegion(x, z);
  if (!(g > 0)) return 1;
  const stand = frontAlong === undefined ? shoulderStand(u) : Math.max(shoulderStand(u), shoulderStandAt(shoulderAlong(x, z) - frontAlong));
  return 1 - g * (1 - SHOULDER.floor) * (1 - stand);
}
/**
 * The lip's flight (onset to the round barrel) is the free fall from this many A. 0.8, not 1.3 (womb-realism spec 3.2,
 * Task 3): the airborne lip spans flight x peel along the line, at most 2.5 A. The dial flightDropA (setFlightDropA); the
 * GPU mirrors it (wombSectionNodes.flightUniforms).
 */
export const FLIGHT_DROP_A = 0.8;
const FLIGHT = { dropA: FLIGHT_DROP_A };
export const setFlightDropA = (a: number): void => { FLIGHT.dropA = a; };
/**
 * The hand-down (womb-realism Task 8, STOP 3 ruling 6): from the break the crest hands down from the record's size to the
 * broken law over max(the lip's flight, HAND_DOWN_T × T), not the flight alone (the 12 ft face's shelf at the foot, +1 s).
 * The dial handDownT (setHandDownT, BreakParams.handDownT); the GPU mirrors it (breakingNodes.wallHeightNode). 0.3 (the
 * range's top; Opus's ruling pending Fable): 'no shelf at the foot' 12 ft +1 s reads 0.172 at 0.05 (the flight dominates),
 * 0.478 at 0.1, 0.335 at 0.2, under 0.1 at 0.3.
 */
export const HAND_DOWN_T = 0.3;
const HAND_DOWN = { t: HAND_DOWN_T };
export const setHandDownT = (t: number): void => { HAND_DOWN.t = t; };
/** The hand-down span (s) for a section that broke at size `sizeM` in a swell of `periodS`. */
export const handDownSpan = (sizeM: number, periodS: number): number => Math.max(flightTime(sizeM), HAND_DOWN.t * periodS);
export const flightDropA = (): number => FLIGHT.dropA;
/** After the white-water wall the section hands back to the sheet over this long (s); the foam carries on over it. */
export const SECTION_HAND_BACK_S = 0.5;
/** The section's ends (units of A from the crest line): the ribbon's mesh spans them; the curve is the sheet's there. */
export const EDGE_OUTER_UNITS = 7;

export interface SectionInput {
  /** The station's local wave height (m), crest to trough. */
  H: number;
  /** The height (m) the section broke at (Station.Hb): once broken, the tube's size and its clock. Absent or null: H. */
  Hb?: number | null;
  /** Breaking ratio (the onset ratio): 1 at onset. */
  r: number;
  /** Time since onset (s): null before breaking (or while the section waits its turn), Infinity long after. */
  tb: number | null;
  /** Unbroken: how long until the section breaks, or held, until its turn (s; Station.until), Infinity if it never will;
   * absent or null: unknown (the ratio alone stands it up). */
  until?: number | null;
  /** The reef's ψ₀ where it broke (Station.psi). */
  psi: number;
  /** The swell's period (s). */
  periodS: number;
  /** Where the station stands (world xz): the shoulder's taper holds down the left past the take-off (shoulderRegion).
   * Absent: everywhere. */
  x?: number;
  z?: number;
  /** The curl's front, m down the left (curlFront.curlFrontAlong): the stand-up eases off by distance from it (standAhead). */
  frontAlong?: number;
}

export interface SectionParams {
  /** The ribbon's onset ratio: below it there is no section (BreakParams.ribbonOnset). */
  ribbonOnset: number;
  /** The surge's dial [0, 1] (BreakParams.surge): its height (units of A) at a fully pitching lip. Absent: 0. */
  surge?: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The scale A (m): the crest's height above still water when the lip pitches. */
export const sectionScale = (H: number): number => Math.max(0, H) / ONSET_HEIGHT_UNITS;
/** How long (s) the lip flies from onset to the round barrel. */
export const flightTime = (H: number): number => Math.sqrt((2 * FLIGHT.dropA * sectionScale(H)) / GRAVITY_MS2);
const power = (H: number, periodS: number): number => Math.max(0, H) * (periodS / 15);
export const tubeHold = (H: number, periodS: number): number => HOLD_BASE_S + HOLD_PER_M * power(H, periodS);
export const collapseSpan = (H: number, periodS: number): number => COLLAPSE_BASE_S + COLLAPSE_PER_M * power(H, periodS);

/**
 * The phase through the break (wombProfile: 0 swell … 0.5 the lip pitching … 1 the round barrel … 2 the white-water wall).
 * Before onset it rises with the onset ratio to STOOD_PHASE, and a section held for its turn only over the last
 * wall lead before it; after, it runs on in time: the lip's flight to the
 * barrel, the tube's hold, the collapse.
 */
export function sectionPhase(s: SectionInput, p: SectionParams): number {
  // Unbroken: on the record (until finite) the clock alone, the wall standing up over the last wall lead (wombSection.wallLeadS) before its break
  // (or its turn, held); off it (off the grid, or a ray that never breaks) with its ratio from the ribbon's onset. (The ratio
  // beside the clock stood a section up at full height ahead of the curl: the pocket one curl holds. One-curl spec §3b.)
  if (s.tb === null) {
    const placed = s.x !== undefined && s.z !== undefined;
    return s.until !== undefined && s.until !== null && Number.isFinite(s.until) ? STOOD_PHASE * frontWeight(s.until, placed ? shoulderRegion(s.x!, s.z!) : 1, placed ? standAhead(s.x!, s.z!, s.frontAlong) : 0) : STOOD_PHASE * smoothstep(p.ribbonOnset, 1, s.r);
  }

  if (!Number.isFinite(s.tb)) return 2;
  const H = brokeAt(s), t = Math.max(0, s.tb), fly = flightTime(H), hold = tubeHold(H, s.periodS);
  if (t < fly) return STOOD_PHASE + (STAGES.barrel - STOOD_PHASE) * (t / fly);
  if (t < fly + hold) return STAGES.barrel;
  return Math.min(2, STAGES.barrel + (t - fly - hold) / collapseSpan(H, s.periodS));
}

/** The height a section's break runs on: the height it broke at once broken (Hb), the local height before. */
const brokeAt = (s: SectionInput): number => (s.tb !== null && s.Hb !== undefined && s.Hb !== null ? s.Hb : s.H);

/** From this phase to 2 the white-water wall's size sinks from the height the section broke at to the local height's. */
export const WALL_SINK_PHASE = 1.5;
/**
 * The scale A (m) through the break (plan 2026-10-06-wave-root-cause step 1): the local height's before onset; from onset
 * the height it broke at, held through the lip's flight, the tube's hold and the collapse; only the white-water wall
 * (WALL_SINK_PHASE to 2) sinks to the local height's (the bore over the shelf).
 */
export function sectionSize(s: SectionInput, phase: number): number {
  const held = sectionScale(brokeAt(s)), own = sectionScale(s.H);
  return held + (own - held) * smoothstep(WALL_SINK_PHASE, 2, phase);
}

/** When (s after onset) the section reaches the white-water wall, and hands back to the sheet. */
export const sectionEnd = (H: number, periodS: number): number => flightTime(H) + tubeHold(H, periodS) + collapseSpan(H, periodS);

/**
 * Once its tube has caved in the sea settles into the white water's bore, its height × BORE_SHARE: the profile's white-water
 * wall (phase 2, 0.47 A) against the swell the sheet stands (about 0.9 A). Behind the curl the broken wave had stood on as a
 * clean swell line over the reef (Andrew, 2026-10-05: "waves going in everywhere").
 */
export const BORE_SHARE = 0.52;
/** How far the sea has settled into the bore [0, 1], on the ribbon's clock: over the collapse, from the tube's end to the
 * white-water wall (sectionEnd), so the sheet the ribbon hands back to is already the bore. */
export function boreWeight(tb: number | null | undefined, H: number, periodS: number): number {
  if (tb === null || tb === undefined || tb < 0) return 0;
  if (!Number.isFinite(tb)) return 1;
  const t0 = flightTime(H) + tubeHold(H, periodS);
  return smoothstep(t0, t0 + collapseSpan(H, periodS), tb);
}

/**
 * The section's ρ: how much of the curl it draws over the sheet. 1 until the white-water wall, then handed back to the
 * sheet over SECTION_HAND_BACK_S (and, along the crest, faded to 0 at a traced line's cut end: crestTrace.fillSections).
 * Before the break the phase alone carries the wave: phase 0 is the sheet (sectionKnots).
 */
export function sectionWeight(s: SectionInput, _p?: SectionParams): number {
  // One surface (Task 10): ahead of the curl there is no ribbon; the sheet's stood crest is the wave.
  if (s.tb === null) return ONE.on > 0.5 ? 0 : 1;
  if (!Number.isFinite(s.tb)) return 0;
  return 1 - smoothstep(0, SECTION_HAND_BACK_S, s.tb - sectionEnd(brokeAt(s), s.periodS));
}

/** `surge`: the heave at the landing (units of A; surgeWeight × the dial), absent 0. */
export interface SectionNumbers { A: number; phase: number; hollow: number; rho: number; surge?: number }

export function sectionNumbers(s: SectionInput, p: SectionParams): SectionNumbers {
  const phase = sectionPhase(s, p), hollow = hollowFromPsi(s.psi);
  return { A: sectionSize(s, phase), phase, hollow, rho: sectionWeight(s, p), surge: surgeWeight(s, phase, hollow) * (p.surge ?? 0) };
}

/** The heave where a pitching lip landed: 0 until the tube starts to fill (phase 1.25), full by 1.5, gone over
 *  SURGE_FALL_BASE_S + SURGE_FALL_PER_M × power after that; × hollow (a crumbling lip heaves nothing). */
export const SURGE_FALL_BASE_S = 1.0, SURGE_FALL_PER_M = 0.25;
export function surgeWeight(s: SectionInput, phase: number, hollow: number): number {
  if (s.tb === null || !Number.isFinite(s.tb) || hollow <= 0) return 0;
  const H = brokeAt(s), t15 = flightTime(H) + tubeHold(H, s.periodS) + 0.5 * collapseSpan(H, s.periodS);
  const fall = SURGE_FALL_BASE_S + SURGE_FALL_PER_M * power(H, s.periodS);
  return smoothstep(1.25, 1.5, phase) * (1 - smoothstep(t15, t15 + fall, s.tb)) * clamp01(hollow);
}
/** Lift (units of A) per profile knot m at surge w and dial k: knots 5–10 (the pocket at the landing) translate up k·w,
 *  the trough (11) by half that, the rest 0: the crest, the back and the flat sea in front stay where the family has them. */
export const surgeLift = (m: number, w: number, k: number): number => (m >= 5 && m <= 10 ? k * w : m === TROUGH_KNOT ? 0.5 * k * w : 0);

/** The sheet along the station: at home u m from the crest along the wave's travel, the displaced (u, y) of the sea there. */
export type SheetAlong = (u: number) => P2;

/**
 * A section knot (units of A): (u, y) on the station's plane, its home u (where the sheet under it is read), and the sheet's
 * point at that home (su, sy). Every sample carries all five along the curve; the section is the sheet at the sample's home
 * plus (u − su, y − sy), the drawing's offset from the sheet there (sectionOf): 0 wherever the knots are the sheet's.
 */
export type SectionKnot = readonly [number, number, number, number, number];

/** Knots sampled from the sheet at each end: from the edge (EDGE_OUTER_UNITS) to the drawing's back shoulder (knot 2) and
 * from its front knot (12), evenly by home. Their offset from the sheet is 0, so beyond the shoulder and the front knot the
 * section is the sheet itself, sample by sample: these knots only spread its samples and carry their homes. */
export const SHEET_KNOTS = 5;
/** The joins' tangents are the sheet's own slope over this far (units of A) on its side of the join. */
export const JOIN_SLOPE_UNITS = 0.02;
/** The drawing's curl, crest … trough, with the lip's end rounded (wombProfile.roundedTip: the tip knot becomes three). */
export const CURL_KNOTS = TROUGH_KNOT - CREST_KNOT + 3;
export const SECTION_KNOTS = 2 * SHEET_KNOTS + CURL_KNOTS;
/** The drawing's knot m among the section's knots (the tip: its rounded point). */
export const sectionKnot = (m: number): number => SHEET_KNOTS + m - CREST_KNOT + (m > TIP_KNOT ? 2 : m === TIP_KNOT ? 1 : 0);
export const SECTION_CREST = sectionKnot(CREST_KNOT);
export const SECTION_TIP = sectionKnot(TIP_KNOT);
export const SECTION_FLOOR = sectionKnot(FLOOR_KNOT);
export const SECTION_TROUGH = sectionKnot(TROUGH_KNOT);
/** The floor and trough among the drawn curl's knots (roundedCurl's order). */
const FLOOR_DRAWN = SECTION_FLOOR - SHEET_KNOTS, TROUGH_DRAWN = SECTION_TROUGH - SHEET_KNOTS;
/** The root among the drawn curl's knots. */
const ROOT_DRAWN = TIP_KNOT + 2 - CREST_KNOT + 2;
/** The knots whose samples are marked. */
export const SECTION_MARKED = { crest: SECTION_CREST, tip: SECTION_TIP, floor: SECTION_FLOOR } as const;

/**
 * One surface by construction (womb-story Task 10, Fable's ruling on the handover §7, 2026-10-14): the ribbon draws only the
 * overhang. The crest knot sits on the sheet's own crest (its top among the swell homes, refined), the lip and the roof are
 * the drawing (seated so its crest is that point and its floor the sheet's low in front, moved along u with the crest), and
 * the roof's root (the drawing's tube top-back, ROOT_KNOT) sits on the sheet's face where the sheet falls to the root's
 * height (once the tube has closed, past the pocket's u). Everywhere else the knots are the sheet's own points with the
 * sheet's own tangents (the back behind the crest, the face below the root, the water in front), so the curve there is the
 * sheet sample by sample; the crest and the root join it along the sheet's slope (JOIN_SLOPE_UNITS). Ahead of the curl a
 * waiting section draws nothing (sectionWeight 0): the sheet's stood crest is the wave. And the sheet's waiting crest stands
 * at the size it will break at, not the depth now (setWaveModel.wallHeight; Fable's 8b(i)). The dial oneSurface (1 = the
 * law, 0 = the drawn section of 2026-10-14); the GPU mirrors it (wombSectionNodes, breakingNodes.wallHeightNode).
 */
export const ONE_SURFACE = 1;
const ONE = { on: ONE_SURFACE };
export const setOneSurface = (v: number): void => { ONE.on = v; };
export const oneSurfaceOn = (): number => ONE.on;
/** The drawing's tube top-back, where the roof meets the face: the root. */
export const ROOT_KNOT = TIP_KNOT + 2;
export const SECTION_ROOT = sectionKnot(ROOT_KNOT);
/** Once the tube has closed (STAGES.tubeFilling → cavingIn) the root is read by u (past the pocket) instead of by height. */
export const ROOT_BY_U_PHASES: readonly [number, number] = [STAGES.tubeFilling, STAGES.cavingIn];
/** The crest's and the root's joins read the sheet's slope over this far (units of A, on the sheet's side): on the sheet's
 * own near-vertical face JOIN_SLOPE_UNITS' secant turned 3-5 degrees off its tangent. */
export const ONE_JOIN_UNITS = 0.002;
/** The crest's join leaves the sheet at this share of the lip's span speed: the lip leaves along the sheet's slope and turns
 * at once to the drawing's (at full speed the curve dived down the sheet's slope and climbed back to the lip: a notch at
 * the lip's root, 0.05-0.06 A at 7 ft). The back's span keeps the sheet exactly at any speed (the same tangent on both). */
export const CREST_JOIN_SPEED = 0.3;
/** The root stays at least this far (units of A, by home) ahead of the crest knot. */
export const ROOT_MIN_AHEAD = 0.05;
/** Whether section knot k is one of the sheet's own (knotWeight 1): the ends, and under the law the crest and from the root on. */
export const isSheetKnot = (k: number): boolean => k < SHEET_KNOTS || k >= SHEET_KNOTS + CURL_KNOTS || (ONE.on > 0.5 && (k === SECTION_CREST || k >= SECTION_ROOT));

/** The swell homes' sheet reads deduplicated by home (the rounded tip's three homes nearly coincide), the shoulder first. */
function faceReads(shoulder: SectionKnot, swell: readonly SectionKnot[]): SectionKnot[] {
  const out: SectionKnot[] = [shoulder];
  for (const q of swell) if (q[2] > out[out.length - 1][2] + 1e-4) out.push(q);
  return out;
}
/** The crest's front edge: where the sheet has fallen this share of its face (its top to its low in front) below its top. */
export const CREST_EDGE_SHARE = 0.03;
/**
 * The crest knot's home among `reads` (back to front by home): the sheet's front edge of its crest, forward of its highest
 * read where it has fallen CREST_EDGE_SHARE of its face below it (`low`: the sheet's low in front; lerped between reads;
 * `u`, `y` the lerped point, which seats the drawing: the knot itself is the sheet's own point at `home`). The stood sheet's
 * crest is a plateau up to 3 m wide ending in its near-vertical face, and a broken one's top can stand behind the station on
 * a gentle slope: seated on the highest point the lip was thrown into the sheet's body. `index`: the last read at or behind
 * the edge.
 */
export function topHome(reads: readonly SectionKnot[], low: number, share = CREST_EDGE_SHARE): { home: number; index: number; u: number; y: number; edge: number; a: SectionKnot | null; b: SectionKnot | null } {
  // The highest read at or ahead of the station's own home (0: the crest the trace found); behind it the sheet can stand on a
  // gentle slope higher still (a broken crest's back), and the edge read from there fell on that slope.
  let i = reads.findIndex((q) => q[2] >= 0);
  if (i < 0) i = 0;
  for (let j = i + 1; j < reads.length; j++) if (reads[j][1] > reads[i][1]) i = j;
  const edge = reads[i][1] - share * Math.max(0, reads[i][1] - low);
  for (let j = i + 1; j < reads.length; j++) if (reads[j][1] < edge) {
    const a = reads[j - 1], b = reads[j], f = Math.min(1, Math.max(0, (edge - a[1]) / (b[1] - a[1])));
    return { home: a[2] + (b[2] - a[2]) * f, index: j - 1, u: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, edge, a, b };
  }
  return { home: reads[i][2], index: i, u: reads[i][0], y: reads[i][1], edge, a: null, b: null };
}
/** The root's criterion along the face: (1 − byU) × (the root's height − y) + byU × (u − the root's u); it grows going forward
 * down the face and is 0 at the root. */
export const rootCriterion = (y: number, u: number, byU: number) => (q: readonly number[]): number => (1 - byU) * (y - q[1]) + byU * (q[0] - u);
/** The root's first estimate: forward of read `from`, the bracket of reads where the criterion first reaches 0 and the home
 * lerped in it (the last read's home, no bracket, if never), at least ROOT_MIN_AHEAD past `crestHome`. */
export function rootBracket(reads: readonly SectionKnot[], from: number, phi: (q: readonly number[]) => number, crestHome: number): { h0: number; a: SectionKnot | null; b: SectionKnot | null } {
  for (let j = from + 1; j < reads.length; j++) {
    const vb = phi(reads[j]);
    if (vb >= 0) {
      const a = reads[j - 1], b = reads[j], va = phi(a), f = vb !== va ? Math.min(1, Math.max(0, -va / (vb - va))) : 1;
      return { h0: Math.max(a[2] + (b[2] - a[2]) * f, crestHome + ROOT_MIN_AHEAD), a, b };
    }
  }
  return { h0: Math.max(reads[reads.length - 1][2], crestHome + ROOT_MIN_AHEAD), a: null, b: null };
}
/** The root's home, refined once by the sheet's read at the first estimate (`probe`, at h0): the lerp in the half bracket
 * that holds the criterion's 0. */
export function rootRefine(br: { h0: number; a: SectionKnot | null; b: SectionKnot | null }, probe: SectionKnot, phi: (q: readonly number[]) => number, crestHome: number): number {
  if (!br.a || !br.b) return br.h0;
  const vp = phi(probe), [a, b] = vp >= 0 ? [br.a, probe] : [probe, br.b];
  const va = phi(a), vb = phi(b), f = vb !== va ? Math.min(1, Math.max(0, -va / (vb - va))) : 1;
  return Math.max(a[2] + (b[2] - a[2]) * f, crestHome + ROOT_MIN_AHEAD);
}

/** The curl comes in over phases 0 to this: phase 0 is the sheet (Andrew's ruling: the phase alone carries the wave from
 * swell to barrel); by the time the lip pitches it is the drawing. */
export const CURL_PHASE = STAGES.pitching;
/** The drawing's "flat sea in front" is the sheet's water: the drawn curl is moved (not stretched) so its trough knot lies
 * SEAT_DIP_UNITS under the sheet at the drawing's front knot, by at most SEAT_SHIFT_MAX units of A either way. */
// 0, not 0.12 A: the drawn trough is the sea in front of it; the dip was a 0.33 m rim climbing back over 3 m that caught
// the sun along the whole foot (Andrew's 'second wave', R1 §5).
export const SEAT_DIP_UNITS = 0;
export const SEAT_SHIFT_MAX = 0.4;

/**
 * The seat (womb-realism Task 2, STOP 1c ruling ask 1), in units of A from still water: from the lip pitching (STOOD_PHASE)
 * the drawing is scaled and moved vertically (y → s·y + b) so its crest knot stands CREST_SHARE above still water and its
 * floor knot TROUGH_SHARE below (a breaking wave of height A carries its crest ~0.75–0.85 A up and its trough ~0.25 A down;
 * Andrew's drawing has the barrel's floor under sea level). The trough on the sheet's front (seatShift) had the floor at or
 * above still water and the crest 1.1–1.3 A up. Past SEAT_HELD_PHASE the map is the one at it (the collapse keeps its scale).
 * Before STOOD_PHASE the seat comes in with the phase from the drawn crest on the sheet's own crest, never under it.
 * Dials crestShare / troughShare (setSeatShares); the GPU mirrors it (wombSectionNodes.seatNode).
 */
export const CREST_SHARE = 0.85;
export const TROUGH_SHARE = 0.25;
export const SEAT_HELD_PHASE = STAGES.tubeFilling;
/**
 * The curtain's foot (womb-realism Task 3; STOP 2 ruling 1, option a): once the lip throws, the floor and trough knots sit
 * on the sheet's lowest point in front of the section (the barrel's floor IS the water in front), never deeper than
 * FOOT_DEEPEST (units of A from still water), read from the sheet knots (no extra sheet reads). Where the sheet is flat (no
 * low in front: its highest back or front knot less than FOOT_FLAT_RELIEF over the front's lowest, a flat sea, the unit
 * tests) the floor falls back to −troughShare, blended by the relief so the foot stays continuous. In over FOOT_PHASES[0…1] (no pop as the lip
 * pitches); the floor knot hands back to the seat over FOOT_PHASES[2…3], as the collapse shrinks the cavity it belongs to.
 */
export const FOOT_DEEPEST = 0.4;
export const FOOT_PHASES: readonly [number, number, number, number] = [STOOD_PHASE, 0.6, STAGES.tubeFilling, STAGES.cavingIn];
export const FOOT_FLAT_RELIEF = 0.02;
/** The foot's y (units of A) over a front sheet whose lowest point is `sheetLow`, under a sheet whose highest knot is `sheetHigh`. */
export const footY = (sheetLow: number, sheetHigh: number): number => {
  const w = smoothstep(0, FOOT_FLAT_RELIEF, sheetHigh - sheetLow), onLow = Math.max(-FOOT_DEEPEST, sheetLow);
  return -SEAT.trough + (onLow + SEAT.trough) * w;
};
/** How far the trough knot (and the floor knot: × footFloorWeight) is on the foot [0, 1] at `phase`. */
export const footWeight = (phase: number): number => smoothstep(FOOT_PHASES[0], FOOT_PHASES[1], phase);
export const footFloorWeight = (phase: number): number => 1 - smoothstep(FOOT_PHASES[2], FOOT_PHASES[3], phase);
/** The seat never stretches a drawing whose crest stands less than this (units of A) over its floor by more than its span. */
const SEAT_SPAN_MIN = 0.2;
const SEAT = { crest: CREST_SHARE, trough: TROUGH_SHARE };
export const setSeatShares = (crest: number, trough: number): void => { SEAT.crest = crest; SEAT.trough = trough; };
export const seatShares = (): { crest: number; trough: number } => ({ ...SEAT });
/** The family's crest and floor y at SEAT_HELD_PHASE for the open (0) and hollow (1) drawings (profileKnots is linear in
 * hollow): [open crest, hollow crest, open floor, hollow floor]. */
export const SEAT_HELD_KNOTS: readonly [number, number, number, number] = (() => {
  const o = profileKnots(SEAT_HELD_PHASE, 0), h = profileKnots(SEAT_HELD_PHASE, 1);
  return [o[CREST_KNOT][1], h[CREST_KNOT][1], o[FLOOR_KNOT][1], h[FLOOR_KNOT][1]];
})();
/** The seat [s, b] (y → s·y + b) at `phase`, `hollow` for the family's knots `k` (unlifted) over a sheet whose crest stands
 * `sheetCrest` (units of A) over still water. */
export function seatOf(phase: number, hollow: number, k: readonly P2[], sheetCrest: number): [number, number] {
  const hv = Math.min(1, Math.max(0, hollow)), held = phase > SEAT_HELD_PHASE, H = SEAT_HELD_KNOTS;
  const c = held ? H[0] + (H[1] - H[0]) * hv : k[CREST_KNOT][1], f = held ? H[2] + (H[3] - H[2]) * hv : k[FLOOR_KNOT][1];
  const s1 = (SEAT.crest + SEAT.trough) / Math.max(c - f, SEAT_SPAN_MIN), b1 = SEAT.crest - s1 * c;
  if (phase >= STOOD_PHASE) return [s1, b1];
  const w = smoothstep(0, STOOD_PHASE, phase), b0 = sheetCrest - c, sc = 1 + (s1 - 1) * w;
  return [sc, Math.max(b0 + (b1 - b0) * w, sheetCrest - sc * c)];
}

/** How much of the drawn curl a section draws over the sheet [0, 1]: by its phase (in over 0 … CURL_PHASE) × its ρ. */
export const curlWeight = (numbers: Pick<SectionNumbers, 'phase' | 'rho'>): number => smoothstep(0, CURL_PHASE, numbers.phase) * numbers.rho;

/** The datum shift (units of A): the drawn trough knot (`troughY`) to SEAT_DIP_UNITS under the sea at the front knot (`seaY`). */
export const seatShift = (troughY: number, seaY: number): number => Math.max(-SEAT_SHIFT_MAX, Math.min(SEAT_SHIFT_MAX, seaY - SEAT_DIP_UNITS - troughY));

/** The drawing's curl knots (crest … trough) with the lip's end rounded at `life` (wombProfile.roundedTip). */
const roundedCurl = (k: readonly P2[], life: number): P2[] => roundedTip(k, life, TIP_KNOT).slice(CREST_KNOT, TROUGH_KNOT + 3);
/** Where the curl's knots sit on the sheet at phase 0: the swell drawing's (rounded the same way, life 0), which stand in
 * order along the sea. */
export const SWELL_CURL_U: readonly number[] = roundedCurl(PROFILE_KEYS[0].hollow, 0).map((p) => p[0]);

/**
 * The section's knots (units of A; back to front). The sheet at SHEET_KNOTS homes from the back edge to the drawing's
 * shoulder (knot 2); the curl (crest … trough, the lip's end rounded) from the sheet at the swell drawing's homes toward the
 * drawing at (phase, hollow), moved by seatShift, by curlWeight; the sheet at SHEET_KNOTS homes from the drawing's front
 * knot (12) to the front edge. Every knot carries its home: the sheet's own where it is sampled; on the drawing its u less
 * the sheet's horizontal displacement, eased from the shoulder's to the front's.
 */
export function sectionKnots(numbers: SectionNumbers, sheet: SheetAlong): SectionKnot[] {
  return sectionFrameKnots(numbers, sheet).knots;
}

/**
 * sectionKnots, with four more of the sheet's points (`beyond`): one knot spacing behind the back edge and ahead of the front
 * edge (the Catmull–Rom's outer neighbours there), and JOIN_SLOPE_UNITS on the sheet's side of the shoulder and the front
 * knot (their slope: sectionTangents).
 */
export function sectionFrameKnots(numbers: SectionNumbers, sheet: SheetAlong): { knots: SectionKnot[]; beyond: SectionKnot[] } {
  const { A, phase, hollow } = numbers, k = profileKnots(phase, hollow), surge = numbers.surge ?? 0;
  const at = (h: number): SectionKnot => { const p = sheet(A * h); return [p[0] / A, p[1] / A, h, p[0] / A, p[1] / A]; };
  const back: SectionKnot[] = [], front: SectionKnot[] = [];
  const b0 = -EDGE_OUTER_UNITS, b1 = k[CREST_KNOT - 1][0], f0 = k[FRONT_KNOT][0], f1 = EDGE_OUTER_UNITS;
  for (let i = 0; i < SHEET_KNOTS; i++) {
    back.push(at(b0 + ((b1 - b0) * i) / (SHEET_KNOTS - 1)));
    front.push(at(f0 + ((f1 - f0) * i) / (SHEET_KNOTS - 1)));
  }
  const db = (b1 - b0) / (SHEET_KNOTS - 1), df = (f1 - f0) / (SHEET_KNOTS - 1);
  const beyond = [at(b0 - db), at(b1 - JOIN_SLOPE_UNITS), at(f0 + JOIN_SLOPE_UNITS), at(f1 + df)];
  if (ONE.on > 0.5) return oneSurfaceKnots(numbers, k, back, front, beyond, at);
  const g = curlWeight(numbers), swell = g === 1 ? null : SWELL_CURL_U.map((u) => at(u));
  const sheetCrest = swell ? Math.max(...swell.map((q) => q[1])) : 0;
  const [scale, shift] = seatOf(phase, hollow, k, sheetCrest);
  const oBack = back[SHEET_KNOTS - 1][0] - back[SHEET_KNOTS - 1][2], oFront = front[0][0] - front[0][2];
  // The surge lifts the drawn pocket after the seat is set from the family's own trough (a lifted trough would seat the
  // whole curl lower and drop the crest with it).
  // The seat scales the family's own curl; the surge's lift (units of A) goes on after it.
  const life = tipLife(Math.min(2, Math.max(0, phase))), plain = roundedCurl(k, life);
  const lifted = surge > 0 ? roundedCurl(k.map((p, m): P2 => [p[0], p[1] + surgeLift(m, surge, 1)]), life) : plain;
  // The curtain's foot: the floor and trough knots onto the front sheet (footY), before the surge's lift.
  const fw = footWeight(phase), fy = front.map((q) => q[1]), foot = fw > 0 ? footY(Math.min(...fy), Math.max(...fy, ...back.map((q) => q[1]))) : 0;
  const footW = (i: number): number => (i === FLOOR_DRAWN ? fw * footFloorWeight(phase) : i === TROUGH_DRAWN ? fw : 0);
  const drawn = plain.map((p, i): P2 => {
    const seated = p[1] * scale + shift, y = seated + (foot - seated) * footW(i);
    return [lifted[i][0], lifted === plain ? y : y + (lifted[i][1] - p[1])];
  });
  const curl = drawn.map((d, i): SectionKnot => {
    const f = (i + 1) / (CURL_KNOTS + 1), dy = d[1], dh = d[0] - (oBack + (oFront - oBack) * f);
    // At g = 1 the sheet at the swell drawing's home is weighted 1 − g = 0: not read (ride-framerate R10a; equal to 1 ulp,
    // s + (d − s) × 1 is not always d bit for bit).
    if (g === 1) { const under = at(dh); return [d[0], dy, dh, under[0], under[1]]; }
    const s = swell![i], h = s[2] + (dh - s[2]) * g;
    // Its offset is from the sheet at its own home (at phase 0, s itself: no offset).
    const under = g > 0 ? at(h) : s;
    return [s[0] + (d[0] - s[0]) * g, s[1] + (dy - s[1]) * g, h, under[0], under[1]];
  });
  return { knots: [...back, ...curl, ...front], beyond };
}

/** The crest under the law (units of A): its home (the sheet's crest edge, topHome, from the first swell home by the curl's
 * weight) and the edge's estimate; with the reads they were found from (oneSurfaceKnots, sectionCrestY). */
function oneSurfaceCrestHome(numbers: SectionNumbers, shoulder: SectionKnot, swell: readonly SectionKnot[], front: readonly SectionKnot[], at: (h: number) => SectionKnot): { home: number; edgeHome: number; top: ReturnType<typeof topHome>; reads: SectionKnot[] } {
  // The low in front: the front's reads and the face's ahead of the station (the trough under a landing lip can lie nearer
  // than the front knot). Once the tube has closed the crest is the top itself (the white-water hump stands on it).
  const reads = faceReads(shoulder, swell), low = frontLow(swell, front), g = curlWeight(numbers);
  const top = topHome(reads, low, CREST_EDGE_SHARE * (1 - smoothstep(ROOT_BY_U_PHASES[0], ROOT_BY_U_PHASES[1], numbers.phase)));
  // The edge refined once by a read at its estimate (the second round; the crest knot is read in the third): on the sheet's
  // near-vertical face the lerp between reads 0.25 A apart missed the edge's height by up to 0.3 A, and the lip, seated at
  // the estimate, stood over a notch at the knot.
  const edgeHome = top.a && top.b ? rootRefine({ h0: top.home, a: top.a, b: top.b }, at(top.home), (q) => top.edge - q[1], -Infinity) : top.home;
  return { home: swell[0][2] + (edgeHome - swell[0][2]) * g, edgeHome, top, reads };
}

/** The sheet's lowest read in front of the crest (units of A): the swell homes' and the front's. */
const frontLow = (swell: readonly SectionKnot[], front: readonly SectionKnot[]): number => Math.min(...swell.map((q) => q[1]), ...front.map((q) => q[1]));

/**
 * sectionFrameKnots under the law (ONE): see ONE_SURFACE. In three rounds of sheet reads, as the GPU reads them
 * (wombSectionNodes.SHEET_READ): the first (the ends, the joins of old, the swell homes: the crest's edge and the seat are
 * found from them); the second (the crest knot, the lip's knots at their homes, the root's first estimate, the crest's join);
 * the third (the root refined, the face below it, the root's join).
 */
function oneSurfaceKnots(numbers: SectionNumbers, k: readonly P2[], back: SectionKnot[], front: SectionKnot[], beyond: SectionKnot[], at: (h: number) => SectionKnot): { knots: SectionKnot[]; beyond: SectionKnot[] } {
  const { phase, hollow } = numbers, surge = numbers.surge ?? 0, g = curlWeight(numbers);
  const swell = SWELL_CURL_U.map((u) => at(u));
  const { home: hC, edgeHome, top, reads } = oneSurfaceCrestHome(numbers, back[SHEET_KNOTS - 1], swell, front, at);
  // The seat: the family's crest on the sheet's crest edge, its floor on the sheet's low in front (footY), scaled between.
  const hv = clamp01(hollow), H = SEAT_HELD_KNOTS, held = phase > SEAT_HELD_PHASE;
  const c = held ? H[0] + (H[1] - H[0]) * hv : k[CREST_KNOT][1], f = held ? H[2] + (H[3] - H[2]) * hv : k[FLOOR_KNOT][1];
  const foot = footY(frontLow(swell, front), Math.max(...front.map((q) => q[1]), ...back.map((q) => q[1])));
  const scale = Math.max(0, top.y - foot) / Math.max(c - f, SEAT_SPAN_MIN);
  const life = tipLife(Math.min(2, Math.max(0, phase))), plain = roundedCurl(k, life);
  const lifted = surge > 0 ? roundedCurl(k.map((p, m): P2 => [p[0], p[1] + surgeLift(m, surge, 1)]), life) : plain;
  const shift = top.y - scale * plain[0][1], du = top.u - plain[0][0];
  // The surge's heave is the drawing's too: scaled with it (on a low bore the seat's scale is under 0.5).
  const drawn = plain.map((p, i): P2 => [lifted[i][0] + du, (p[1] + (lifted[i][1] - p[1])) * scale + shift]);
  const oBack = back[SHEET_KNOTS - 1][0] - back[SHEET_KNOTS - 1][2], oFront = front[0][0] - front[0][2];
  // The root: on the sheet's face where it falls to the drawn root's height (once the tube has closed, past its u), found
  // from the first round's reads and refined once by a read at that estimate.
  const byU = smoothstep(ROOT_BY_U_PHASES[0], ROOT_BY_U_PHASES[1], phase);
  const phi = rootCriterion(drawn[ROOT_DRAWN][1], drawn[ROOT_DRAWN][0], byU), br = rootBracket(reads, top.index, phi, top.home);
  const hR = rootRefine(br, at(br.h0), phi, edgeHome), f0 = front[0][2];
  const curl = drawn.map((d, i): SectionKnot => {
    const s = swell[i];
    if (i === 0) return at(hC);
    if (i >= ROOT_DRAWN) {
      // The root, then the face below it to the front knot: the sheet's own points, evenly by home.
      const to = i === ROOT_DRAWN ? hR : hR + ((f0 - hR) * (i - ROOT_DRAWN)) / (CURL_KNOTS - ROOT_DRAWN);
      return at(s[2] + (to - s[2]) * g);
    }
    const ff = (i + 1) / (CURL_KNOTS + 1), dh = d[0] - (oBack + (oFront - oBack) * ff);
    if (g === 1) { const under = at(dh); return [d[0], d[1], dh, under[0], under[1]]; }
    const h = s[2] + (dh - s[2]) * g, under = g > 0 ? at(h) : s;
    return [s[0] + (d[0] - s[0]) * g, s[1] + (d[1] - s[1]) * g, h, under[0], under[1]];
  });
  // The joins' slopes: the sheet JOIN_SLOPE_UNITS behind the crest and ahead of the root (sectionTangents).
  return { knots: [...back, ...curl, ...front], beyond: [...beyond, at(hC - ONE_JOIN_UNITS), at(curl[ROOT_DRAWN][2] + ONE_JOIN_UNITS)] };
}

/**
 * The section's crest knot's height (m; sectionFrame(…).crest[1] bit for bit) from the sheet at the swell drawing's homes
 * alone (SWELL_CURL_U: none at curlWeight 1), not the frame's back, front and second-round reads: the feathering's crest
 * near the curl (womb-realism Task 4; the whole frame there cost ~6 ms a spray tick).
 */
export function sectionCrestY(numbers: SectionNumbers, sheet: SheetAlong): number {
  const { A, phase, hollow } = numbers, k = profileKnots(phase, hollow), surge = numbers.surge ?? 0, g = curlWeight(numbers);
  if (ONE.on > 0.5) {
    // Under the law the crest knot is the sheet's point at the crest's home (oneSurfaceKnots).
    const at = (h: number): SectionKnot => { const p = sheet(A * h); return [p[0] / A, p[1] / A, h, p[0] / A, p[1] / A]; };
    const f0 = k[FRONT_KNOT][0], front = Array.from({ length: SHEET_KNOTS }, (_, i) => at(f0 + ((EDGE_OUTER_UNITS - f0) * i) / (SHEET_KNOTS - 1)));
    return A * at(oneSurfaceCrestHome(numbers, at(k[CREST_KNOT - 1][0]), SWELL_CURL_U.map((u) => at(u)), front, at).home)[1];
  }
  const swell = g === 1 ? null : SWELL_CURL_U.map((u) => sheet(A * u)[1] / A);
  const [scale, shift] = seatOf(phase, hollow, k, swell ? Math.max(...swell) : 0);
  const p = k[CREST_KNOT][1], seated = p * scale + shift;
  const dy = surge > 0 ? seated + ((p + surgeLift(CREST_KNOT, surge, 1)) - p) : seated;
  return A * (swell ? swell[0] + (dy - swell[0]) * g : dy);
}

/** The sheet's ends among the section's knots: the back edge, the shoulder, the front knot, the front edge. */
export const SHEET_ENDS: readonly number[] = [0, SHEET_KNOTS - 1, SHEET_KNOTS + CURL_KNOTS, 2 * SHEET_KNOTS + CURL_KNOTS - 1];

/**
 * The knots' parameters (centripetal: cumulative √ of the (u, y) distance) and tangents: the Catmull–Rom's from its
 * neighbours at every knot (`beyond` outside the edges); at the joins (the shoulder, the front knot) the sheet's own slope
 * there (from its point JOIN_SLOPE_UNITS on the sheet's side), at the speed of the curl's span beside it. The curve leaves
 * the sheet along the sheet, so the section, the sheet's itself beyond the joins (sectionOf), turns smoothly into the curl.
 */
export function sectionTangents(knots: readonly SectionKnot[], beyond: readonly SectionKnot[]): { t: number[]; m: SectionKnot[] } {
  const t = [0];
  for (let i = 1; i < knots.length; i++) t.push(t[i - 1] + crStep(knots[i - 1], knots[i]));
  const last = knots.length - 1;
  const one = ONE.on > 0.5 && beyond.length >= 6;
  const m = knots.map((p, i): SectionKnot => {
    // Under the law (ONE) the joins are the crest (the sheet behind it) and the root (the sheet ahead of it): beyond[4], [5].
    if (one && (i === SECTION_CREST || i === SECTION_ROOT)) {
      const behind = i === SECTION_CREST, near = beyond[behind ? 4 : 5], o = knots[behind ? i + 1 : i - 1];
      const dir = p.map((v, j) => (behind ? v - near[j] : near[j] - v));
      const len = Math.hypot(dir[0], dir[1]) || 1, speed = Math.hypot(o[0] - p[0], o[1] - p[1]) / Math.abs(t[behind ? i + 1 : i - 1] - t[i]);
      return dir.map((v) => (v / len) * speed * (behind ? CREST_JOIN_SPEED : 1)) as unknown as SectionKnot;
    }
    if (!one && (i === SHEET_ENDS[1] || i === SHEET_ENDS[2])) {
      const shoulder = i === SHEET_ENDS[1], near = beyond[shoulder ? 1 : 2], o = knots[shoulder ? i + 1 : i - 1];
      const dir = p.map((v, j) => (shoulder ? v - near[j] : near[j] - v));
      const len = Math.hypot(dir[0], dir[1]) || 1, speed = Math.hypot(o[0] - p[0], o[1] - p[1]) / Math.abs(t[shoulder ? i + 1 : i - 1] - t[i]);
      return dir.map((v) => (v / len) * speed) as unknown as SectionKnot;
    }
    const a = i === 0 ? beyond[0] : knots[i - 1], b = i === last ? beyond[3] : knots[i + 1];
    const ta = i === 0 ? t[i] - crStep(a, p) : t[i - 1], tb = i === last ? t[i] + crStep(p, b) : t[i + 1];
    return crTangent(a, ta, p, t[i], b, tb);
  });
  return { t, m };
}

export interface Section {
  numbers: SectionNumbers;
  /** CURVE_SAMPLES points (u, y) in m, front edge (the beach side) to back edge: the ribbon mesh's order. */
  points: P2[];
  /** Each point's home u (m), in the same order: where the sheet under it is read (its chop, its foam). */
  homes: number[];
  /** The crest's top, and the lip's tip, as drawn (u, y). */
  crest: P2;
  tip: P2;
}

/** The station's section from its own numbers (no smoothing along the crest), on `sheet`. */
export function wombSection(s: SectionInput, sheet: SheetAlong, p: SectionParams): Section {
  return sectionOf(sectionNumbers(s, p), sheet);
}

/**
 * A section sample (units of A): (u, y) on the station's plane as the curve through the knots interpolates them, its home
 * h, then what places it (sectionPoint): a = (u − w·su, y − w·sy) and the sheet weight w. The sample's point is w × the
 * sheet at its home + A × a: the sheet at the home plus the drawing's offset from it where w is 1 (the sheet's own
 * stretches, exact sample by sample), the interpolated (u, y) itself where w is 0 (the drawn curl at full weight).
 *
 * Between two curl knots the sheet's offset form is wrong: the samples' homes run across the sheet's own face there (the
 * floor knot's home is on it, the trough knot's past it), and "the sheet at the home plus an interpolated offset" follows
 * the sheet's 4 m drop before the offset catches up. At 8 ft the drawn floor overshot 1.15 m below the trough knot and the
 * water then climbed 1.6 m to the flats: a ridge with a dark drop under it across the sea in front of the face (Andrew's
 * capture, 2026-10-06; 0.2 m at 6 ft). So w is 1 at the sheet knots, 1 − curlWeight at the curl knots (the sheet's form
 * at phase 0, where the curl knots are sheet samples), and eased between over the two join spans (sampleWeight).
 */
export type SectionSample = readonly [number, number, number, number, number, number];

/** A knot's sheet weight: 1 for a sheet knot, 1 − the curl's weight for a curl knot. */
export const knotWeight = (k: number, curl: number): number => (isSheetKnot(k) ? 1 : 1 - curl);
/** The sheet weight at dense point d (SPAN_SAMPLES per span): eased between its span's two knots' (the GPU mirrors it). */
export function sampleWeight(d: number, curl: number, knotCount = SECTION_KNOTS): number {
  const last = knotCount - 1;
  if (d >= last * SPAN_SAMPLES) return knotWeight(last, curl);
  const sp = Math.floor(d / SPAN_SAMPLES), s = (d - sp * SPAN_SAMPLES) / SPAN_SAMPLES;
  // Under the law the spans from the crest into the lip and from the roof into its root take the curl's weight whole: the
  // crest and the root are the sheet's own points (their offset is 0 at any weight), and eased, the sheet at the homes the
  // roof's span sweeps (across the sheet's own near-vertical face) pulled the roof into a dip under its root.
  if (ONE.on > 0.5 && (sp === SECTION_CREST || sp + 1 === SECTION_ROOT)) return 1 - curl;
  const wa = knotWeight(sp, curl), wb = knotWeight(sp + 1, curl);
  return wa + (wb - wa) * s * s * (3 - 2 * s);
}

/** The section's knots, and its CURVE_SAMPLES samples back to front (units of A: SectionSample) and their marks. */
export function sectionSamples(numbers: SectionNumbers, sheet: SheetAlong): { knots: SectionKnot[]; curve: SectionSample[]; marks: { crest: number; tip: number; floor: number } } {
  const { knots, beyond } = sectionFrameKnots(numbers, sheet), { t, m } = sectionTangents(knots, beyond);
  const curl = curlWeight(numbers);
  const point = (d: number): SectionSample => {
    const p = hermitePoint(knots, t, m, d), w = sampleWeight(d, curl, knots.length);
    return [p[0], p[1], p[2], p[0] - w * p[3], p[1] - w * p[4], w];
  };
  const { curve, marks } = curveSamples(point, knots.length, SECTION_MARKED, CURVE_SAMPLES);
  return { knots, curve, marks };
}

/**
 * The drawn face of a section waiting its turn never stands below the sheet in front of its crest (Andrew 2026-10-14, moment
 * 1791986608: "there is seemingly still 2 waves going on! there should not be this crest between the lip and the drain"):
 * the stood face is drawn near vertical (2.2 m to -1.0 m in 1 m) and the sheet under it can lean its front over ~4 m, so
 * the sheet stood up to 3.3 m above the drawn face in front of the crest and showed through as a second crest (and, at the
 * curl's end, as the cube-like lump). On (1): each sample in front of the crest is lifted to the sheet at its home where it
 * is under it, by 1 at phase <= STOOD_PHASE fading to 0 by FACE_ON_SHEET_PHASE (the broken lip pitching keeps its own).
 * The dial faceOnSheet (BreakParams.faceOnSheet); the ribbon mirrors it (BreakingRibbon's vertex pass).
 */
export const FACE_ON_SHEET_PHASE = STOOD_PHASE + 0.15;
/** On by Andrew's pick (2026-10-14, one-surface-ab.jpg row 3, with standAheadM 20). */
// 0: retired by the one-surface law (Task 10; the A/B sheet's 'before' sets 1).
export const FACE_ON_SHEET = 0;
const FACE = { on: FACE_ON_SHEET };
export const setFaceOnSheet = (on: number): void => { FACE.on = on; };
export const faceOnSheetOn = (): number => FACE.on;
export const faceOnSheetWeight = (phase: number): number => FACE.on * (1 - smoothstep(STOOD_PHASE, FACE_ON_SHEET_PHASE, phase));

/** A sample's point (m): its sheet weight × the sheet at its home, plus A × its a (SectionSample). */
export const sectionPoint = (q: SectionSample, A: number, sheet: SheetAlong): P2 => {
  const S = sheet(A * q[2]), w = q[5];
  return [w * S[0] + A * q[3], w * S[1] + A * q[4]];
};

/** The section for given numbers (a station's, smoothed along the crest: Station.section) on `sheet`: one surface, the sheet
 * itself sample by sample on its own stretches (and at phase 0 and ρ 0), the drawn curl where it is drawn (SectionSample). */
export function sectionOf(numbers: SectionNumbers, sheet: SheetAlong): Section {
  const { A } = numbers, { knots, curve } = sectionSamples(numbers, sheet);
  const points: P2[] = [], homes: number[] = [];
  for (let j = curve.length - 1; j >= 0; j--) { points.push(sectionPoint(curve[j], A, sheet)); homes.push(A * curve[j][2]); }
  // faceOnSheet: in front of a waiting section's crest the drawn surface stands at least at the sheet at its home.
  const k = faceOnSheetWeight(numbers.phase);
  if (k > 0) {
    const crestU = A * knots[SECTION_CREST][0];
    for (let j = 0; j < points.length; j++) {
      if (!(points[j][0] > crestU)) continue;
      const under = sheet(homes[j])[1] - points[j][1];
      if (under > 0) points[j] = [points[j][0], points[j][1] + k * under];
    }
  }
  const place = (q: SectionKnot): P2 => [A * q[0], A * q[1]];
  return { numbers, points, homes, crest: place(knots[SECTION_CREST]), tip: place(knots[SECTION_TIP]) };
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

/** A section frame's timing and weights, which read no sheet: what the emitters test before they pay for the frame. */
export type SectionTiming = Pick<SectionFrame, 'prog' | 'weight' | 'rho' | 'tauLand'>;

/** The station's SectionTiming from its numbers and height alone (sectionFrame's same fields, bit for bit). */
export function sectionTiming(numbers: SectionNumbers, H: number): SectionTiming {
  const { phase, rho } = numbers;
  return { prog: Math.min(1, Math.max(0, (phase - STOOD_PHASE) / (STAGES.barrel - STOOD_PHASE))), weight: lipWeight(phase), rho, tauLand: flightTime(H) };
}

/** The station's section frame: its numbers (smoothed, Station.section), its height H, crest speed c and the sheet. */
export function sectionFrame(numbers: SectionNumbers, H: number, c: number, sheet: SheetAlong): SectionFrame {
  const { A, phase, hollow, rho } = numbers;
  const knots = sectionKnots(numbers, sheet), place = (q: SectionKnot): P2 => [A * q[0], A * q[1]];
  const tip = place(knots[SECTION_TIP]), crest = place(knots[SECTION_CREST]), floor = place(knots[SECTION_FLOOR]);
  // The tip's throw: its u's rate in phase, times the phase's rate in time over the lip's flight.
  const k = profileKnots(phase, hollow), fly = flightTime(H), dPhase = 0.01, ahead = profileKnots(Math.min(2, phase + dPhase), hollow)[TIP_KNOT][0];
  const flying = phase > STOOD_PHASE && phase < STAGES.barrel ? (STAGES.barrel - STOOD_PHASE) / Math.max(fly, 1e-6) : 0;
  const vj = c + (A * (ahead - k[TIP_KNOT][0]) / dPhase) * flying;
  return {
    prog: Math.min(1, Math.max(0, (phase - STOOD_PHASE) / (STAGES.barrel - STOOD_PHASE))), weight: lipWeight(phase), rho,
    tip, crest, floor, vj, tauLand: fly, reach: tip[0] - crest[0],
  };
}
