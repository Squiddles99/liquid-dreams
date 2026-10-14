import { smoothstep } from '../math/smoothstep';

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
  /** The rider's power (rider power profiles): leg power (W/kg), paddling strength (× thrust), the legs' CoM travel (m). */
  legPowerWkg: number;
  paddleStrength: number;
  comTravelM: number;
  pumpAcc: number;
  extending: boolean;
  driveT: number;
  stallPeak: boolean;
  /** The extra load's recent peak (g), fading: the assist's timing. */
  loadPeak: number;
  /** Seconds held low (comH under TUCK_LOW): a tuck is held, a pump's dip is not. */
  lowT: number;
  /** Seconds since the legs last extended under extra load (a pump): the pose blend's pump layer (part C). */
  pumpIdleT: number;
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

/** comH toward the target at the legs' rate (COM_RATE); rising at most `upRate` (the legs' power against the load). */
export function stepCom(comH: number, target: number, dt: number, upRate = COM_RATE): number {
  return comH + clamp(target - comH, -COM_RATE * dt, Math.min(COM_RATE, upRate) * dt);
}

const G = 9.81;
export const PUMP_POWER_WKG = 15;
/** The height the tuning was built on (Shazza, the default rider): the legs' CoM travel scales from it. */
export const BASE_STAND_H = 1.65;

/** A rider's power, from their preset (rider power profiles). */
export interface RiderPower {
  legPowerWkg: number;
  paddleStrength: number;
}
export const DEFAULT_POWER: Readonly<RiderPower> = { legPowerWkg: PUMP_POWER_WKG, paddleStrength: 1 };
export const riderBodyOf = (p: RiderPower): RiderPower => ({ legPowerWkg: p.legPowerWkg, paddleStrength: p.paddleStrength });

/**
 * How fast the legs can straighten (comH per s) against a load (g): their power over the force times the travel
 * (P = load·G·travel·rate). Free at a light load (COM_RATE); under a carve's load the weaker legs rise slower, so each
 * pump gives less: the honest place a power gap shows (rider power profiles).
 */
export function legRiseRate(r: Pick<RiderState, 'legPowerWkg' | 'comTravelM'>, load: number): number {
  return Math.min(COM_RATE, r.legPowerWkg / (Math.max(load, 1e-3) * G * r.comTravelM));
}

export function newRiderState(standH: number, massKg: number, power: RiderPower = DEFAULT_POWER): RiderState {
  return {
    comH: COM_REST, foreAft: 0, hand: 0, tuck: 0, stall: 0, stallW: { tall: 1, hand: 0, lowBarrel: 0, standBarrel: 0 },
    load: 1, n0: 1, pumpGain: 0, pumpPhase: 0, driveOut: 0, standH, massKg, pumpAcc: 0, extending: false, driveT: 0, stallPeak: false, loadPeak: 0, lowT: 0, pumpIdleT: 9,
    legPowerWkg: power.legPowerWkg, paddleStrength: power.paddleStrength, comTravelM: COM_TRAVEL_M * standH / BASE_STAND_H,
  };
}

export const PUMP_EFF = 0.8;
export const LOAD_TAU_S = 0.05;

/**
 * The load of a straight run (g): gravity less its part along the path, `ty` the path's vertical slope (the unit velocity's
 * y). 1 on flat water and traversing a face (the rail holds the rider against the slope: the legs carry it), cos θ
 * running straight down the fall line (final review: the face's normal alone read 0.22 g of phantom load traversing).
 */
export function restLoad(ty: number): number {
  return Math.sqrt(Math.max(0, 1 - ty * ty));
}

/**
 * The pump's work this step (J/kg; plan clarification 1): the rider's legs push against the turn's extra load
 * (load − n0) as the centre of mass rises, and give it back as it falls. Over a cycle that nets a gain only if they rose
 * under the load and fell without it. A gain loses (1 − eff) and is capped at the legs' power.
 */
export function pumpEnergy(load: number, n0: number, dComH: number, dt: number, eff: number, travelM = COM_TRAVEL_M, powerWkg = PUMP_POWER_WKG): number {
  const e = (load - n0) * G * travelM * dComH;
  if (e === 0) return 0; // not −0: nothing moved
  return e > 0 ? Math.min(e * eff, powerWkg * dt) : e;
}

/**
 * The assist's share of the legs' work, set so it nets about 70 % of a perfect manual pump (spec §4.1) on the same weave
 * and timing: measured 0.71 (Task 5). Low, because most of a pump's speed comes through the rail's harder grip while
 * compressed (the rail keeps that slide as run), which the assist gets in full: only the legs' share is scaled.
 */
export const PUMP_ASSIST_EFF = 0.3 * PUMP_EFF;
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

const DEG = Math.PI / 180;
/** Held under this comH, the rider is tucking; the tuck builds over TUCK_HOLD_S of holding it (spec §4.2: LT held deep). */
export const TUCK_LOW = 0.25;
export const TUCK_HOLD_S: readonly [number, number] = [0.2, 0.4];
/** The tuck counts heading along the line within these angles (full inside the second, none past the first). */
export const TUCK_LINE_DEG: readonly [number, number] = [50, 25];

/** How much the heading runs along the line (across the wave's travel), 0 … 1. */
export function lineFactor(headingDeg: number, dirX: number, dirZ: number): number {
  const fx = Math.sin(headingDeg * DEG), fz = -Math.cos(headingDeg * DEG);
  return smoothstep(Math.cos(TUCK_LINE_DEG[0] * DEG), Math.cos(TUCK_LINE_DEG[1] * DEG), Math.abs(fx * -dirZ + fz * dirX));
}

/** The planing drag with the rider's body in it (spec §4.2, §4.3). */
export function rideDrag(d: { lin: number; quad: number; side: number }, r: RiderState): { lin: number; quad: number; side: number } {
  const tallW = r.stallW.tall + r.stallW.standBarrel;
  return {
    lin: d.lin * (1 - 0.15 * r.tuck) * (1 + 4 * r.stall),
    quad: d.quad * (1 - 0.3 * r.tuck) * (1 + 0.5 * r.stall * tallW),
    side: d.side * (1 + 0.2 * r.tuck),
  };
}

export const STALL_IN_S = 0.2;
export const STALL_OUT_S = 0.3;
export const HAND_CDA = 0.004;
export const RHO_WATER = 1025;
export const LIP_MARGIN_M = 0.3;
/** The head in a full tuck, as a share of the rider's standing height. */
export const HEAD_LOW = 0.6;
export const UNDER_LIP_COVER = 0.2;
export const HIGH_FACE = 0.6;
export const STEEP_SLOPE = 0.8;
export const CREST_CLOSE_M = 2;
export const WEIGHT_TAU_S = 0.15;
export const DRIVE_OUT_S = 0.6;
/** Each stall's centre of mass height (spec §4.3). */
export const STALL_COM: Readonly<StallWeights> = { tall: 0.85, hand: 0.35, lowBarrel: 0.3, standBarrel: 0.95 };

export function headHeight(comH: number, standH: number): number {
  return standH * (HEAD_LOW + (1 - HEAD_LOW) * comH);
}

/** The highest comH that keeps the head LIP_MARGIN_M under the lip (1 with nothing overhead). */
export function comCap(roomM: number, standH: number): number {
  if (!(roomM > 0)) return 1;
  return clamp01(((roomM - LIP_MARGIN_M) / standH - HEAD_LOW) / (1 - HEAD_LOW));
}

/** The trailing hand and forearm dragging in the face: ½ρ·CdA·v², on the rider's mass (m/s²). */
export function handDragAccel(speed: number, hand: number, massKg: number): number {
  return (0.5 * RHO_WATER * HAND_CDA * speed * speed * hand) / massKg;
}

/** Which stall the wave asks for (spec §4.3; Andrew 2026-10-14: never stand up into a lip that would knock the rider off). */
export function stallKind(ctx: RideContext, alongSpeed: number, standH: number, slope: number): StallKind {
  if (ctx.cover >= UNDER_LIP_COVER) {
    const room = ctx.roomM >= standH + LIP_MARGIN_M;
    const makes = ctx.closeout || alongSpeed >= ctx.curlSpeed;
    return room && makes ? 'standBarrel' : 'lowBarrel';
  }
  if ((ctx.faceHigh > HIGH_FACE && slope > STEEP_SLOPE) || ctx.crestBehindM < CREST_CLOSE_M) return 'hand';
  return 'tall';
}

/** The weights ease toward the chosen kind over WEIGHT_TAU_S: blended, never switched (part C blends the poses). */
export function easeWeights(w: StallWeights, kind: StallKind, dt: number): StallWeights {
  const k = 1 - Math.exp(-dt / WEIGHT_TAU_S);
  const out = { ...w };
  for (const key of Object.keys(out) as StallKind[]) out[key] += ((key === kind ? 1 : 0) - out[key]) * k;
  return out;
}

const stallComH = (w: StallWeights): number =>
  w.tall * STALL_COM.tall + w.hand * STALL_COM.hand + w.lowBarrel * STALL_COM.lowBarrel + w.standBarrel * STALL_COM.standBarrel;

/** What leaves the physics for the body (spec §5): the stand-ins read it now, part C's pose blend later. */
export interface RiderDrive {
  comH: number;
  foreAft: number;
  carve: number;
  hand: number;
  load: number;
  pumpPhase: number;
  pumpGain: number;
  tuck: number;
  stall: number;
  stallW: StallWeights;
  driveOut: number;
  pumpIdleT: number;
}

export function riderDrive(b: RiderState & { carve: number }): RiderDrive {
  return {
    comH: b.comH, foreAft: b.foreAft, carve: b.carve, hand: b.hand, load: b.load, pumpPhase: b.pumpPhase, pumpGain: b.pumpGain,
    tuck: b.tuck, stall: b.stall, stallW: { ...b.stallW }, driveOut: b.driveOut, pumpIdleT: b.pumpIdleT,
  };
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
  // The stall (LB): ramped in and out; its kind read from the wave, its weights eased.
  r.stall = i.stall ? Math.min(1, r.stall + dt / STALL_IN_S) : Math.max(0, r.stall - dt / STALL_OUT_S);
  r.stallW = easeWeights(r.stallW, stallKind(i.ctx, i.alongSpeed, r.standH, i.slope), dt);
  const handT = r.stall * (r.stallW.hand + r.stallW.lowBarrel + r.stallW.standBarrel);
  r.hand += (handT - r.hand) * (1 - Math.exp(-dt / WEIGHT_TAU_S));
  let target = comTarget(i.crouch);
  // The assist (RB): full travel, extending into the load's peak.
  const excess = r.load - r.n0;
  r.loadPeak = Math.max(excess, r.loadPeak * Math.exp(-dt / LOAD_PEAK_TAU_S));
  if (i.assist) target = excess > Math.max(PUMP_EXTEND_MIN, PUMP_EXTEND_SHARE * r.loadPeak) ? 1 : 0;
  if (r.stall > 0) target += (stallComH(r.stallW) - target) * r.stall;
  // Under a lip, what the game drives stays clear of it; RT forcing the rider up is the player's (spec §4.4).
  const forcing = i.crouch < -0.1;
  if (!forcing && i.ctx.cover >= UNDER_LIP_COVER) target = Math.min(target, comCap(i.ctx.roomM, r.standH));
  const prev = r.comH;
  r.comH = stepCom(r.comH, target, dt, legRiseRate(r, r.load));
  const dH = r.comH - prev;
  // A pump is the legs rising under the turn's extra load (part C's pump layer keys off it; a plain carve isn't one).
  r.pumpIdleT = dH > 1e-6 && r.load - r.n0 > PUMP_EXTEND_MIN ? 0 : r.pumpIdleT + dt;
  const e = pumpEnergy(r.load, r.n0, dH, dt, i.assist ? PUMP_ASSIST_EFF : PUMP_EFF, r.comTravelM, r.legPowerWkg);
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
  // Drive out (spec §4.5): a stall let go while under the curl projects the rider forward for DRIVE_OUT_S.
  if (r.stall > 0.5) r.stallPeak = true;
  if (r.stallPeak && r.stall < 0.1) {
    r.stallPeak = false;
    if (i.ctx.cover > 0) r.driveT = DRIVE_OUT_S;
  }
  r.driveT = Math.max(0, r.driveT - dt);
  r.driveOut += ((r.driveT > 0 ? 1 : 0) - r.driveOut) * (1 - Math.exp(-dt / 0.15));
  // Tuck and drive (spec §4.2): held low, running the line.
  r.lowT = r.comH < TUCK_LOW ? r.lowT + dt : 0;
  const tuckT = smoothstep(TUCK_LOW, 0.05, r.comH) * smoothstep(TUCK_HOLD_S[0], TUCK_HOLD_S[1], r.lowT) * lineFactor(i.headingDeg, i.dirX, i.dirZ) * (1 - r.stall);
  r.tuck += (tuckT - r.tuck) * (1 - Math.exp(-dt / 0.2));
  const faT = clamp(0.4 * r.tuck - 0.7 * r.stall + 0.4 * r.driveOut + (dH > 1e-6 ? 0.3 : 0), -1, 1);
  r.foreAft += (faT - r.foreAft) * (1 - Math.exp(-dt / 0.1));
  return e;
}
