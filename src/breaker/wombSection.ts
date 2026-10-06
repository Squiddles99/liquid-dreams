import { smoothstep } from '../math/smoothstep';
import { hollowFromPsi } from './reefReport';
import { CREST_KNOT, CURVE_SAMPLES, FLOOR_KNOT, FRONT_KNOT, type P2, STAGES, TIP_KNOT, TROUGH_KNOT, profileKnots, profileSamples } from './wombProfile';

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
/** The profile's ends (units of A): the ribbon's mesh spans them; the section is the sheet's well before them. */
export const EDGE_OUTER_UNITS = 7;
/**
 * Where the section is the profile and where it is the sheet. The profile draws the curl: the crest, the lip, the tube, the
 * face and the trough in front of it. Behind the crest the back is the sheet's own (the swell's), handed over between
 * BACK_BLEND_UNITS[0] and [1] units of A behind the crest knot; in front, past the trough, between FRONT_BLEND_UNITS[0]
 * and [1] units ahead of the crest line.
 *
 * The profile's gentle back stands lower than the shoaled swell's back (≈ 0.75 A against 0.9 A one unit behind the crest,
 * 0.2 A against 0.6 A four units behind): every hand-over further back left a dip behind the crest and a rise where the
 * swell took over, a second wave behind the first (Andrew, 2026-10-05, in the game: his red line "rises, dips, rises",
 * his green "a smooth gradient returning down to sea level", which is the swell's own back). Handed over just behind the
 * crest, where the two stand at nearly the same height, the back is the swell's from there on.
 */
export const BACK_BLEND_UNITS: readonly [number, number] = [0.25, 1.5];
export const FRONT_BLEND_UNITS: readonly [number, number] = [2.3, 4];

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
  return 1 - smoothstep(0, SECTION_HAND_BACK_S, s.tb - sectionEnd(brokeAt(s), s.periodS));
}

export interface SectionNumbers { A: number; phase: number; hollow: number; rho: number }

export function sectionNumbers(s: SectionInput, p: SectionParams): SectionNumbers {
  const phase = sectionPhase(s, p);
  return { A: sectionSize(s, phase), phase, hollow: hollowFromPsi(s.psi), rho: sectionWeight(s, p) };
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

/** How much of the profile is drawn at u units of A from the crest line, with the crest knot at crestU: all of it over the
 * curl, none behind the crest or ahead of the trough past the blends (BACK_BLEND_UNITS, FRONT_BLEND_UNITS). */
export const interiorWeight = (uUnits: number, crestU: number): number =>
  uUnits < crestU ? 1 - smoothstep(BACK_BLEND_UNITS[0], BACK_BLEND_UNITS[1], crestU - uUnits) : 1 - smoothstep(FRONT_BLEND_UNITS[0], FRONT_BLEND_UNITS[1], uUnits);

/**
 * Past the face's foot (the floor knot) the profile settles onto the sea in front over this many units of A: its height is
 * the sea's wherever that is lower, the profile's own only at the foot. The profile's front climbs back to still water
 * (its drawing's flat sea), but the sheet in front lies at the swell's trough, 2.5 m lower on a 12 ft set: handed over
 * 2.3–4 units out, the two drew a rim with a trench between it and the face (Andrew, 2026-10-05: "the water draws
 * smoothly up the face before the lip throws out onto the flats").
 */
export const FOOT_RUN_UNITS = 1.2;
/** The front's samples start this many before the floor's mark: the GPU's walk can mark the floor one sample from the
 * CPU's, and the sample at the mark lies just past the knot (up to 0.07 A), where the two would draw it 5–7 mm apart
 * (Andrew's GPU run, 2026-10-05). The one before lies at or behind the knot at every phase and hollow. */
export const FRONT_FROM_MARK = 1;
/** A front point's height (m): from the profile's at the foot (floorU, units of A) to the lower of it and the sheet's. */
export function frontHeight(profileY: number, sheetY: number, uUnits: number, floorU: number): number {
  const own = 1 - smoothstep(floorU, floorU + FOOT_RUN_UNITS, uUnits);
  return Math.min(sheetY, profileY) + (profileY - Math.min(sheetY, profileY)) * own;
}

/**
 * The profile's front is seated on the sea in front of it. Andrew's drawing has its own flat sea there, about sea level,
 * with the water at the foot of the face drawn down to its trough knot (−0.36 at the barrel) below it. The sea the ribbon
 * stands in is the sheet's, whose water in front of the face is the swell's trough, 0.4–0.5 A down: drawn as it was, the
 * foot stood on a bench 0.2 m over that water at 7 ft (Andrew, 2026-10-05: "still a slight step"). Seated, everything in
 * front of the crest is stretched down from the crest's height so that the trough knot lies SEAT_DIP_UNITS below the
 * sheet's water at the front knot (seatScale), blended in over SEAT_BLEND_UNITS from the crest (seatedY): the crest and
 * the back stay as they were, the water at the foot is the lowest, drawn gently below the flats, and the face and the
 * tube stand taller by the stretch (1.1–1.3). Seated by its front knot instead (the drawing's flats on the sheet's), the
 * drawing's draw-down became a bowl 1 m deep at 7 ft.
 */
export const SEAT_BLEND_UNITS = 0.3;
export const SEAT_DIP_UNITS = 0.12;
/** The stretch is at most this (a sheet far below the profile's front, as on a small wave's broad trough). */
export const SEAT_MAX = 2;
/** The stretch that lays the trough knot (`troughY`, units of A) SEAT_DIP_UNITS below the sea in front (`seaY`, units of
 * A), from the crest's height `crestY`: 1 where the sea is that high or higher. */
export function seatScale(crestY: number, troughY: number, seaY: number): number {
  const span = crestY - troughY;
  return span > 1e-3 ? Math.min(SEAT_MAX, Math.max(1, (crestY - Math.min(seaY - SEAT_DIP_UNITS, troughY)) / span)) : 1;
}
/** A profile point's height (units of A) seated (seatScale `k`): stretched down from the crest's height by k, in front of
 * the crest. */
export function seatedY(y: number, u: number, crestU: number, crestY: number, k: number): number {
  return y + (y - crestY) * (k - 1) * smoothstep(crestU, crestU + SEAT_BLEND_UNITS, u);
}
/** d(seatedY)/du given the profile's own dy/du there. */
export function seatedSlope(y: number, dydu: number, u: number, crestU: number, crestY: number, k: number): number {
  const t = Math.min(1, Math.max(0, (u - crestU) / SEAT_BLEND_UNITS));
  const w = t * t * (3 - 2 * t), dw = (6 * t * (1 - t)) / SEAT_BLEND_UNITS;
  return dydu * (1 + (k - 1) * w) + (y - crestY) * (k - 1) * dw;
}

/** A profile point (units of A) placed on the station's plane (m), seated on the sea in front (seatedY), blended into the
 * sheet by ρ and interiorWeight; past the face's foot (`front`, floorU its u) onto the sea in front (frontHeight). */
function placer(numbers: SectionNumbers, sheet: SheetAlong, floorU = Infinity): (q: P2, front?: boolean) => P2 {
  const { A, phase, hollow, rho } = numbers, k = profileKnots(phase, hollow);
  const [crestU, crestY] = k[CREST_KNOT], frontU = k[FRONT_KNOT][0];
  const seat = seatScale(crestY, k[TROUGH_KNOT][1], sheet(A * frontU)[1] / A);
  return (q, front = false) => {
    const S = sheet(A * q[0]), w = rho * interiorWeight(q[0], crestU), qy = A * seatedY(q[1], q[0], crestU, crestY, seat);
    const y = front ? frontHeight(qy, S[1], q[0], floorU) : qy;
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
  const { curve, marks } = profileSamples(phase, hollow, CURVE_SAMPLES);
  // From the floor knot itself, not its sample: the GPU's walk can mark the sample one along (wombSectionNodes). The front
  // starts FRONT_FROM_MARK samples before the mark, which lie at or behind the knot (the profile's own height there), so
  // a mark one off on either side changes no point.
  const place = placer(numbers, sheet, profileKnots(phase, hollow)[FLOOR_KNOT][0]);
  const points: P2[] = [];
  for (let j = curve.length - 1; j >= 0; j--) points.push(place(curve[j], j >= marks.floor - FRONT_FROM_MARK));
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
