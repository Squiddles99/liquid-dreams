import { smoothstep } from '../math/smoothstep';
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
 * The wall down the line: a section stands up over this long before it breaks (s), from the swell's own shape to a steep
 * wall (STOOD_PHASE) as the curl reaches it (plan 2026-10-06-wave-root-cause, Andrew's "extended wall of the yet to break
 * wave, to plan how I ride"; and 2026-10-05, in the game: "it should be vertical closest to where the lip is throwing …
 * further down the line … a less vertical gradient, similar to how the swell approaches before it breaks"). On the time
 * until it breaks (the reef record's, breaking.onsetUntil), not its breaking ratio: on the Womb's deep basin the ratio
 * only rises in the last 10 m before a point breaks, so the wall stood for 9 m beyond the curl and then turned square
 * across the line into the deep-water swell (Andrew's "right-angle bowl", 2026-10-06). Along the crest the time until a
 * point breaks grows at about 0.1 s per metre from the curl on the 6 ft set, so this lead is about 80 m of wall, the first
 * 30 m of it steeper than 30°; it scales itself as the peel slows. A section held for its turn (the peel stretch) stands up
 * over the same lead before its turn.
 */
export const WALL_LEAD_S = 8;
/** @deprecated The hold's lead is the wall's (WALL_LEAD_S). */
export const STAND_LEAD_S = WALL_LEAD_S;
/**
 * How far a section has stood up [0, 1] with `until` s to go before it breaks (or its turn): 0 WALL_LEAD_S or more away, 1
 * at it, 0 where it never breaks (Infinity). (1 − until/WALL_LEAD_S)²: the wall stands up ever faster as its break nears,
 * and is about 0.7 a second before it. A smoothstep (0.93 a second before) had the sea's front already as short as the
 * drawn face when the wave reached the take-off, and it passed under a paddling surfer in 0.3 s, before the catch could
 * bring him to speed (the ride test). The GPU mirrors it (SetWaves' standing).
 */
export const wallWeight = (until: number | null | undefined): number => {
  if (until === null || until === undefined || !Number.isFinite(until)) return 0;
  const left = 1 - Math.min(1, Math.max(0, until) / WALL_LEAD_S);
  return left * left;
};
/** The lip's flight (onset to the round barrel) is the free fall from this many A, the crest to the landing below sea level. */
export const FLIGHT_DROP_A = 1.3;
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
  /** While the peel stretch holds the section: how long until its turn (s) (Station.wait); absent or null otherwise. */
  wait?: number | null;
  /** Unbroken: how long until the section breaks (s; Station.until, breaking.onsetUntil), Infinity if it never will; absent
   * or null: unknown (the ratio alone stands it up). */
  until?: number | null;
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
  // Unbroken: the wall stands up over the last WALL_LEAD_S before its break (or its turn, held), or with its ratio from the
  // ribbon's onset where the record says nothing (off the grid, or a ray that never breaks), whichever is further.
  if (s.tb === null) return STOOD_PHASE * Math.max(smoothstep(p.ribbonOnset, 1, s.r) * standing(s), wallWeight(s.wait ?? s.until));

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

/** A section held for its turn: 0 more than WALL_LEAD_S before it, 1 at it; 1 for a section not held. */
const standing = (s: SectionInput): number => (s.wait === undefined || s.wait === null ? 1 : wallWeight(s.wait));

/**
 * The section's ρ: how much of the curl it draws over the sheet. 1 until the white-water wall, then handed back to the
 * sheet over SECTION_HAND_BACK_S (and, along the crest, faded to 0 at a traced line's cut end: crestTrace.fillSections).
 * Before the break the phase alone carries the wave: phase 0 is the sheet (sectionKnots).
 */
export function sectionWeight(s: SectionInput, _p?: SectionParams): number {
  if (s.tb === null) return 1;
  if (!Number.isFinite(s.tb)) return 0;
  return 1 - smoothstep(0, SECTION_HAND_BACK_S, s.tb - sectionEnd(brokeAt(s), s.periodS));
}

export interface SectionNumbers { A: number; phase: number; hollow: number; rho: number }

export function sectionNumbers(s: SectionInput, p: SectionParams): SectionNumbers {
  const phase = sectionPhase(s, p);
  return { A: sectionSize(s, phase), phase, hollow: hollowFromPsi(s.psi), rho: sectionWeight(s, p) };
}

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
/** The knots whose samples are marked. */
export const SECTION_MARKED = { crest: SECTION_CREST, tip: SECTION_TIP, floor: SECTION_FLOOR } as const;

/** The curl comes in over phases 0 to this: phase 0 is the sheet (Andrew's ruling: the phase alone carries the wave from
 * swell to barrel); by the time the lip pitches it is the drawing. */
export const CURL_PHASE = STAGES.pitching;
/** The drawing's "flat sea in front" is the sheet's water: the drawn curl is moved (not stretched) so its trough knot lies
 * SEAT_DIP_UNITS under the sheet at the drawing's front knot, by at most SEAT_SHIFT_MAX units of A either way. */
export const SEAT_DIP_UNITS = 0.12;
export const SEAT_SHIFT_MAX = 0.4;

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
  const { A, phase, hollow } = numbers, k = profileKnots(phase, hollow);
  const at = (h: number): SectionKnot => { const p = sheet(A * h); return [p[0] / A, p[1] / A, h, p[0] / A, p[1] / A]; };
  const back: SectionKnot[] = [], front: SectionKnot[] = [];
  const b0 = -EDGE_OUTER_UNITS, b1 = k[CREST_KNOT - 1][0], f0 = k[FRONT_KNOT][0], f1 = EDGE_OUTER_UNITS;
  for (let i = 0; i < SHEET_KNOTS; i++) {
    back.push(at(b0 + ((b1 - b0) * i) / (SHEET_KNOTS - 1)));
    front.push(at(f0 + ((f1 - f0) * i) / (SHEET_KNOTS - 1)));
  }
  const db = (b1 - b0) / (SHEET_KNOTS - 1), df = (f1 - f0) / (SHEET_KNOTS - 1);
  const beyond = [at(b0 - db), at(b1 - JOIN_SLOPE_UNITS), at(f0 + JOIN_SLOPE_UNITS), at(f1 + df)];
  const g = curlWeight(numbers), shift = seatShift(k[TROUGH_KNOT][1], front[0][1]);
  const oBack = back[SHEET_KNOTS - 1][0] - back[SHEET_KNOTS - 1][2], oFront = front[0][0] - front[0][2];
  const drawn = roundedCurl(k, tipLife(Math.min(2, Math.max(0, phase))));
  const curl = drawn.map((d, i): SectionKnot => {
    const s = at(SWELL_CURL_U[i]), f = (i + 1) / (CURL_KNOTS + 1);
    const dy = d[1] + shift, dh = d[0] - (oBack + (oFront - oBack) * f), h = s[2] + (dh - s[2]) * g;
    // Its offset is from the sheet at its own home (at phase 0, s itself: no offset).
    const under = g > 0 ? at(h) : s;
    return [s[0] + (d[0] - s[0]) * g, s[1] + (dy - s[1]) * g, h, under[0], under[1]];
  });
  return { knots: [...back, ...curl, ...front], beyond };
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
  const m = knots.map((p, i): SectionKnot => {
    if (i === SHEET_ENDS[1] || i === SHEET_ENDS[2]) {
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
export const knotWeight = (k: number, curl: number): number => (k < SHEET_KNOTS || k >= SHEET_KNOTS + CURL_KNOTS ? 1 : 1 - curl);
/** The sheet weight at dense point d (SPAN_SAMPLES per span): eased between its span's two knots' (the GPU mirrors it). */
export function sampleWeight(d: number, curl: number, knotCount = SECTION_KNOTS): number {
  const last = knotCount - 1;
  if (d >= last * SPAN_SAMPLES) return knotWeight(last, curl);
  const sp = Math.floor(d / SPAN_SAMPLES), s = (d - sp * SPAN_SAMPLES) / SPAN_SAMPLES;
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
