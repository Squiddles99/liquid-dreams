/**
 * The rider's body on the board (ride-speed spec §2): the centre of mass height, the weight fore and aft, the hand in the
 * water, the tuck and the stall: what the pump, the tuck, the stall and (later) the balance system all write, and the
 * ride physics reads. Any rider: Shazza, T-Bone or Grommet.
 */
export type StallKind = 'tall' | 'hand' | 'lowBarrel' | 'standBarrel';
export type StallWeights = Record<StallKind, number>;

/** What the wave around the rider says (rideContext.ts): the stall chooser's reading. */
export interface RideContext {
  /** tubeCover: how far the rider is under a curl, 0 … 1. */
  cover: number;
  /** The lip's underside over the water where the rider is (m); 0 with nothing overhead. */
  roomM: number;
  /** How high up the face, 0 at the bottom … 1 at the crest. */
  faceHigh: number;
  /** How far the crest line is behind the rider (m); Infinity with none. */
  crestBehindM: number;
  /** The curl's own speed along the line here (m/s); 0 with nothing breaking near. */
  curlSpeed: number;
  /** The section is closing out: breaking faster along the line than anyone could make. */
  closeout: boolean;
  /** The face's height here (m): the pump assist's weave period. */
  faceHM: number;
}
export const OPEN_FACE: Readonly<RideContext> = { cover: 0, roomM: 0, faceHigh: 0.3, crestBehindM: Infinity, curlSpeed: 0, closeout: false, faceHM: 1.8 };

export interface RiderState {
  /** 0 full tuck … 1 standing tall (spec §2); COM_REST relaxed. */
  comH: number;
  /** −1 back foot … +1 front foot. */
  foreAft: number;
  /** Trailing hand in the water, 0 … 1. */
  hand: number;
  tuck: number;
  /** The stall's ramped amount (LB), 0 … 1. */
  stall: number;
  stallW: StallWeights;
  /** The load pressing the board into the rider's feet (g), and gravity's share of it normal to the face. */
  load: number;
  n0: number;
  /** The last pump cycle's energy (J/kg), signed; the pump's phase 0 … 1 (compress 0–0.5, extend 0.5–1). */
  pumpGain: number;
  pumpPhase: number;
  driveOut: number;
  /** The rider's standing height (m) and mass (kg), from the preset. */
  standH: number;
  massKg: number;
  pumpAcc: number;
  extending: boolean;
  driveT: number;
  stallPeak: boolean;
  /** The extra load's recent peak (g), fading: the assist's timing. */
  loadPeak: number;
}

export const COM_REST = 0.6;
export const COM_TRAVEL_M = 0.35;
export const COM_RATE = 3.0;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** LT (+) lowers the rider to 0, RT (−) raises them to 1, from COM_REST. */
export function comTarget(crouch: number): number {
  const c = clamp(crouch, -1, 1);
  return c >= 0 ? COM_REST * (1 - c) : COM_REST + (1 - COM_REST) * -c;
}

/** The old crouch dial, now derived: 0 at COM_REST, +1 full tuck, −1 standing tall. */
export function compressionOf(comH: number): number {
  return comH <= COM_REST ? (COM_REST - comH) / COM_REST : (COM_REST - comH) / (1 - COM_REST);
}

/** comH toward the target at the legs' rate (COM_RATE). */
export function stepCom(comH: number, target: number, dt: number): number {
  const m = COM_RATE * dt;
  return comH + clamp(target - comH, -m, m);
}

export function newRiderState(standH: number, massKg: number): RiderState {
  return {
    comH: COM_REST, foreAft: 0, hand: 0, tuck: 0, stall: 0, stallW: { tall: 1, hand: 0, lowBarrel: 0, standBarrel: 0 },
    load: 1, n0: 1, pumpGain: 0, pumpPhase: 0, driveOut: 0, standH, massKg, pumpAcc: 0, extending: false, driveT: 0, stallPeak: false, loadPeak: 0,
  };
}

const G = 9.81;
export const PUMP_POWER_WKG = 15;
export const PUMP_EFF = 0.8;
export const LOAD_TAU_S = 0.05;

/** Gravity's share of the rider's weight normal to a face of this slope (g): the load of a straight run. */
export function restLoad(slopeX: number, slopeZ: number): number {
  return 1 / Math.sqrt(1 + slopeX * slopeX + slopeZ * slopeZ);
}

/**
 * The pump's work this step (J/kg; plan clarification 1): the rider's legs push against the turn's extra load
 * (load − n0) as the centre of mass rises, and give it back as it falls. Over a cycle that nets a gain only if they rose
 * under the load and fell without it. A gain loses (1 − eff) and is capped at the legs' power.
 */
export function pumpEnergy(load: number, n0: number, dComH: number, dt: number, eff: number): number {
  const e = (load - n0) * G * COM_TRAVEL_M * dComH;
  if (e === 0) return 0; // not −0: nothing moved
  return e > 0 ? Math.min(e * eff, PUMP_POWER_WKG * dt) : e;
}

export const PUMP_ASSIST_EFF = 0.7 * PUMP_EFF;
export const PUMP_WEAVE = 0.45;
export const PUMP_PERIOD_K = 0.75;
/**
 * The assist extends once the turn's extra load passes this share of its recent peak (and at least PUMP_EXTEND_MIN g):
 * into the peak, whatever the carve's size, as a rider times it by feel (Task 3/4 rulings: a fixed trigger never fires
 * on a gentle weave, and extending early wastes the travel on the light part of the turn).
 */
export const PUMP_EXTEND_SHARE = 0.4;
export const PUMP_EXTEND_MIN = 0.08;
/** The recent peak of the extra load fades over this (s). */
export const LOAD_PEAK_TAU_S = 1;
/** The load the rider can feel is clamped to this (g): a reset or a teleport reads as a huge acceleration. */
export const LOAD_MAX = 5;

/** The assist's weave: a steering swing across the face, its period fitted to the face (≈ 1 s at 1.8 m). */
export function weaveSteer(t: number, faceHM: number): number {
  const period = clamp(PUMP_PERIOD_K * Math.sqrt(Math.max(0.5, faceHM)), 0.6, 1.4);
  return PUMP_WEAVE * Math.sin((2 * Math.PI * t) / period);
}

export interface BodyInput {
  crouch: number;
  stall: boolean;
  assist: boolean;
  headingDeg: number;
  /** The wave's travel (unit, world xz). */
  dirX: number;
  dirZ: number;
  /** |∇y| under the board. */
  slope: number;
  /** The rider's speed along the line (m/s), the way they ride it. */
  alongSpeed: number;
  ctx: RideContext;
}

/** One riding step of the rider's body (ride-speed spec §4). Returns the energy (J/kg) their legs put into the run. */
export function stepRiderBody(r: RiderState, i: BodyInput, dt: number): number {
  let target = comTarget(i.crouch);
  // The assist (RB): full travel, extending into the load's peak.
  const excess = r.load - r.n0;
  r.loadPeak = Math.max(excess, r.loadPeak * Math.exp(-dt / LOAD_PEAK_TAU_S));
  if (i.assist) target = excess > Math.max(PUMP_EXTEND_MIN, PUMP_EXTEND_SHARE * r.loadPeak) ? 1 : 0;
  const prev = r.comH;
  r.comH = stepCom(r.comH, target, dt);
  const dH = r.comH - prev;
  const e = pumpEnergy(r.load, r.n0, dH, dt, i.assist ? PUMP_ASSIST_EFF : PUMP_EFF);
  // The cycle's books: a cycle closes as the rider starts to compress after an extension.
  if (dH > 1e-6) r.extending = true;
  else if (dH < -1e-6 && r.extending) {
    r.pumpGain = r.pumpAcc;
    r.pumpAcc = 0;
    r.extending = false;
  }
  r.pumpAcc += e;
  if (dH < -1e-6) r.pumpPhase = 0.5 * clamp01((0.85 - r.comH) / 0.5);
  else if (dH > 1e-6) r.pumpPhase = 0.5 + 0.5 * clamp01((r.comH - 0.35) / 0.5);
  return e;
}
