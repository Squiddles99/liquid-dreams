import { BOMBIE_X, BOMBIE_Z, type Burst } from '../bombie/bombieModel';
import { smoothstep } from '../math/smoothstep';
import { BOMBIE_WAVE_ID_BASE, type ImpactEmitter } from '../whitewater/sprayEmitters';

/**
 * The hits (Phase 5 spec §3.2, sound 1): each lip landing at the Womb and each Bombie burst is one thump-and-crack, placed
 * where it happens and heard distance / 343 s later.
 */

/** Sound in air (m/s): a lip landing 150 m away is heard about 0.44 s after it's seen. */
export const SPEED_OF_SOUND_MS = 343;
/** Stations landing in one tick within this distance of each other are one hit. */
export const HIT_MERGE_M = 8;
/** One wave's hits come at most this often (a peeling lip lands a little further along every tick). */
export const HIT_MIN_GAP_S = 0.3;
/** A station seen again within this many ticks is the same landing (its impact window is 7 ticks). */
export const STATION_FORGET_TICKS = 20;
/** Ticks listened to per frame at most: a seek or a stall skips the rest rather than playing them all at once. */
export const HIT_LOOKBACK_TICKS = 10;
/** How long a hit sounds (s). */
export const HIT_DURATION_S = 1.2;
/** Voices at once (spec §3.2); the continuous voices take CONTINUOUS_VOICES and the hits get the rest. */
export const VOICE_CAP = 24;
export const CONTINUOUS_VOICES = 8;
export const HIT_CAP = VOICE_CAP - CONTINUOUS_VOICES;
/** The Bombie's hit is bigger and lower than a lip's. */
export const BOMBIE_HIT_GAIN = 1.3;
export const BOMBIE_THUMP_FACTOR = 0.6;
/** A burst first seen older than this is past its hit (the Bombie was just switched on, or a moment jumped into it). */
export const BOMBIE_HIT_MAX_AGE_S = 2;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface HitEvent extends Point3 {
  gain: number;
  /** The thump's starting pitch (it sweeps down an octave). */
  thumpHz: number;
  /** The air's low-pass for this distance. */
  cutoffHz: number;
  /** From now until it's heard (s). */
  delayS: number;
  bombie: boolean;
}

/** One 20 Hz spray tick's impact emitters (App's emittersAt(k).impact) and its time. */
export interface HitTick {
  k: number;
  t: number;
  impact: readonly ImpactEmitter[];
}

export interface HitInput {
  ticks: readonly HitTick[];
  bursts: readonly Burst[];
  bombieSize: number;
  camera: Point3;
  simTime: number;
  /** A real clock (s): hits in flight end on it. */
  realTime: number;
  tideM: number;
}

/** The air's low-pass at a distance: distant sound is duller. */
export function airCutoffHz(distanceM: number): number {
  return Math.max(800, 18000 * Math.exp(-distanceM / 300));
}

export function hitGain(H: number): number {
  return Math.min(1.5, 0.2 + H / 3);
}

/** 90 Hz for a small wave down to 40 Hz for a big one. */
export function thumpHz(H: number): number {
  return 90 - 50 * smoothstep(0.5, 4, H);
}

/** The ticks to listen to this frame: those after `last` up to `now`, the latest HIT_LOOKBACK_TICKS at most. */
export function ticksToHear(last: number | null, now: number): number[] {
  if (last === null || now < last) return [now];
  const out: number[] = [];
  for (let k = Math.max(last + 1, now - HIT_LOOKBACK_TICKS + 1); k <= now; k++) out.push(k);
  return out;
}

interface Cluster extends Point3 {
  n: number;
  H: number;
  lip: number;
}

function clusters(list: readonly ImpactEmitter[]): Cluster[] {
  const out: Cluster[] = [];
  for (const e of list) {
    const c = out.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < HIT_MERGE_M);
    if (!c) {
      out.push({ x: e.x, y: e.y, z: e.z, n: 1, H: e.H, lip: e.lip });
      continue;
    }
    c.x = (c.x * c.n + e.x) / (c.n + 1);
    c.y = (c.y * c.n + e.y) / (c.n + 1);
    c.z = (c.z * c.n + e.z) / (c.n + 1);
    c.n++;
    c.H = Math.max(c.H, e.H);
    c.lip = Math.max(c.lip, e.lip);
  }
  return out;
}

export class HitTracker {
  /** Station (wave:arc) → the tick it was last seen landing. */
  private seen = new Map<string, number>();
  /** Wave id → the time of its last hit. */
  private lastHitS = new Map<number, number>();
  private bursts: number[] = [];
  /** When each hit in flight ends (realTime s). */
  private inFlight: number[] = [];
  private lastSimTime: number | null = null;

  hear(i: HitInput): HitEvent[] {
    if (this.lastSimTime !== null && i.simTime < this.lastSimTime) this.forget();
    this.lastSimTime = i.simTime;
    const cands: HitEvent[] = [];
    const add = (p: Point3, eventS: number, gain: number, hz: number, bombie: boolean): void => {
      const d = Math.hypot(p.x - i.camera.x, p.y - i.camera.y, p.z - i.camera.z);
      const delayS = Math.max(0, d / SPEED_OF_SOUND_MS - (i.simTime - eventS));
      cands.push({ x: p.x, y: p.y, z: p.z, gain, thumpHz: hz, cutoffHz: airCutoffHz(d), delayS, bombie });
    };
    for (const tick of i.ticks) {
      const fresh = new Map<number, ImpactEmitter[]>();
      for (const e of tick.impact) {
        if (e.waveId >= BOMBIE_WAVE_ID_BASE) continue;
        const key = `${e.waveId}:${e.arc}`, was = this.seen.get(key);
        this.seen.set(key, tick.k);
        if (was !== undefined && tick.k - was <= STATION_FORGET_TICKS) continue;
        const list = fresh.get(e.waveId);
        if (list) list.push(e);
        else fresh.set(e.waveId, [e]);
      }
      for (const [waveId, list] of fresh) {
        const last = this.lastHitS.get(waveId);
        if (last !== undefined && tick.t - last < HIT_MIN_GAP_S - 1e-9) continue;
        for (const c of clusters(list)) {
          const gain = hitGain(c.H) * c.lip;
          if (gain >= 0.05) add(c, tick.t, gain, thumpHz(c.H), false);
        }
        this.lastHitS.set(waveId, tick.t);
      }
      for (const [key, was] of this.seen) if (tick.k - was > 2 * STATION_FORGET_TICKS) this.seen.delete(key);
    }
    for (const b of i.bursts) {
      if (this.bursts.includes(b.n)) continue;
      this.bursts.push(b.n);
      if (this.bursts.length > 16) this.bursts.shift();
      if (b.ageS < 0 || b.ageS > BOMBIE_HIT_MAX_AGE_S) continue;
      const H = 2 * b.heightM;
      add({ x: BOMBIE_X, y: i.tideM + 1, z: BOMBIE_Z }, i.simTime - b.ageS, Math.min(2, hitGain(H) * BOMBIE_HIT_GAIN * i.bombieSize), thumpHz(H) * BOMBIE_THUMP_FACTOR, true);
    }
    for (const [w, s] of this.lastHitS) if (i.simTime - s > 10) this.lastHitS.delete(w);
    this.inFlight = this.inFlight.filter((end) => end > i.realTime);
    const kept = cands.sort((a, b) => b.gain - a.gain).slice(0, Math.max(0, HIT_CAP - this.inFlight.length));
    for (const h of kept) this.inFlight.push(i.realTime + h.delayS + HIT_DURATION_S);
    return kept;
  }

  /** Time jumped back: what was heard is in the future now (Review Focus 2). */
  private forget(): void {
    this.seen = new Map();
    this.lastHitS = new Map();
    this.bursts = [];
  }
}
