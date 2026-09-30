import type { PresetName } from './presets';

/** The face's morph channels, by the glb's morph names (closeup spec §4.1). */
export const FACE_CHANNELS = ['blinkL', 'blinkR', 'jawOpen', 'smile', 'browsUp', 'browsInner', 'squint', 'nostrils', 'breathe'] as const;
export type FaceChannel = (typeof FACE_CHANNELS)[number];

/** One frame of a face: the morph weights (0–1), where the eyes look (degrees from the head's look), and the head's
 * idle turn (degrees, added to the pose's look). */
export type FaceState = Record<FaceChannel, number> & { gazeYawDeg: number; gazePitchDeg: number; headYawDeg: number; headPitchDeg: number };

/** A rider's resting face (closeup spec §5.1; ruling 6). */
export interface Mood {
  /** The resting smile, 0–1. */
  smile: number;
  /** How far the smile drifts either way. */
  drift: number;
  /** How big the occasional smile is, over the resting one. */
  burst: number;
}

export const MOODS: Record<PresetName, Mood> = {
  female: { smile: 0.24, drift: 0.05, burst: 0.3 },
  male: { smile: 0.15, drift: 0.06, burst: 0.3 },
  grommet: { smile: 0.5, drift: 0.08, burst: 0.35 },
};

export interface IdleContext {
  /** A still pose (sitting) or on land: the head may look around. Paddling or riding: the pose owns the head. */
  still: boolean;
  /** 0 resting … 1 paddling hard: exertion eases toward it. */
  exertionTarget: number;
  onLand: boolean;
  /** 0 … 1: how squarely the sun shines into the eyes. */
  sunFacing: number;
}

const GAZE_YAW = 8, GAZE_PITCH = 5, HEAD_YAW = 20, HEAD_PITCH = 8;
/** One blink: closing, closed, opening (s). */
const CLOSE_S = 0.07, HOLD_S = 0.04, OPEN_S = 0.14;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const clamp01 = (x: number): number => clamp(x, 0, 1);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** mulberry32: small, fast, seeded. */
function prng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A rider's idle face over time (closeup spec §5.1): blinks, saccades, a head that looks around when still, breathing
 * that quickens with exertion, and a mood's smile that drifts. Pure and seeded; tick it with the sim's time step.
 */
export class IdleLife {
  private readonly rand: () => number;
  private t = 0;
  private blinkAt: number;
  private blinkStart = -1;
  private doubleQueued = false;
  private gazeTarget = { yaw: 0, pitch: 0 };
  private gaze = { yaw: 0, pitch: 0 };
  private nextSaccade: number;
  private headTarget = { yaw: 0, pitch: 0 };
  private head = { yaw: 0, pitch: 0 };
  private nextHead: number;
  /** 0 … 1, eased toward the context's target. */
  exertion = 0;
  private breathPhase = 0;
  private readonly driftPhase: [number, number];
  private burstAt: number;
  private burstStart = -1;
  private browAt: number;
  private browStart = -1;
  private squint = 0;

  constructor(seed: number, private readonly mood: Mood) {
    this.rand = prng(seed);
    this.blinkAt = this.span(0.5, 3);
    this.nextSaccade = this.span(0.3, 1.5);
    this.nextHead = this.span(1, 4);
    this.driftPhase = [this.rand() * Math.PI * 2, this.rand() * Math.PI * 2];
    this.burstAt = this.span(8, 25);
    this.browAt = this.span(6, 20);
    this.breathPhase = this.rand();
  }

  private span(a: number, b: number): number {
    return a + (b - a) * this.rand();
  }

  private blinkNow(): void {
    if (this.blinkStart < 0) this.blinkStart = this.t;
  }

  tick(dt: number, ctx: IdleContext): FaceState {
    this.t += dt;
    const t = this.t;

    // Head: when still, a new look every 4–9 s, reached slowly (~0.6 s); the eyes jump there first (below).
    let headJump = 0;
    if (!ctx.still) {
      this.head = { yaw: 0, pitch: 0 };
      this.headTarget = { yaw: 0, pitch: 0 };
    } else if (t >= this.nextHead) {
      const before = this.headTarget;
      this.headTarget = { yaw: (this.rand() * 2 - 1) * HEAD_YAW, pitch: (this.rand() * 2 - 1) * HEAD_PITCH * 0.75 };
      headJump = Math.hypot(this.headTarget.yaw - before.yaw, this.headTarget.pitch - before.pitch);
      this.nextHead = t + this.span(4, 9);
    }
    if (ctx.still) {
      const k = 1 - Math.exp(-dt / 0.25);
      this.head.yaw += (this.headTarget.yaw - this.head.yaw) * k;
      this.head.pitch += (this.headTarget.pitch - this.head.pitch) * k;
    }

    // Eyes: saccades to small offsets every 0.6–3 s, reached in a few frames; they lead the head toward its new look.
    if (t >= this.nextSaccade) {
      this.gazeTarget = { yaw: (this.rand() * 2 - 1) * GAZE_YAW * 0.6, pitch: (this.rand() * 2 - 1) * GAZE_PITCH * 0.6 };
      this.nextSaccade = t + this.span(0.6, 3);
    }
    const lead = { yaw: this.headTarget.yaw - this.head.yaw, pitch: this.headTarget.pitch - this.head.pitch };
    const want = { yaw: clamp(this.gazeTarget.yaw + lead.yaw, -GAZE_YAW, GAZE_YAW), pitch: clamp(this.gazeTarget.pitch + lead.pitch, -GAZE_PITCH, GAZE_PITCH) };
    const ks = 1 - Math.exp(-dt / 0.012);
    this.gaze.yaw += (want.yaw - this.gaze.yaw) * ks;
    this.gaze.pitch += (want.pitch - this.gaze.pitch) * ks;

    // Blinks: every 2–6 s, sometimes a double; a big head turn brings one.
    if (headJump > 12 && this.rand() < 0.6) this.blinkNow();
    if (t >= this.blinkAt) {
      this.blinkNow();
      this.doubleQueued = this.rand() < 1 / 6;
      this.blinkAt = t + this.span(2, 6);
    }
    let blink = 0;
    if (this.blinkStart >= 0) {
      const b = t - this.blinkStart;
      if (b < CLOSE_S) blink = smooth(b / CLOSE_S);
      else if (b < CLOSE_S + HOLD_S) blink = 1;
      else if (b < CLOSE_S + HOLD_S + OPEN_S) blink = 1 - smooth((b - CLOSE_S - HOLD_S) / OPEN_S);
      else {
        this.blinkStart = -1;
        if (this.doubleQueued) {
          this.doubleQueued = false;
          this.blinkAt = Math.min(this.blinkAt, t + 0.12);
        }
      }
    }

    // Breathing: exertion rises over ~4 s and eases over ~12 s; 14 → 30 breaths a minute; in for 40%, out for 60%.
    const tau = ctx.exertionTarget > this.exertion ? 4 : 12;
    this.exertion += (ctx.exertionTarget - this.exertion) * (1 - Math.exp(-dt / tau));
    const e = clamp01(this.exertion);
    this.breathPhase = (this.breathPhase + ((14 + 16 * e) / 60) * dt) % 1;
    const p = this.breathPhase;
    const wave = p < 0.4 ? smooth(p / 0.4) : 1 - smooth((p - 0.4) / 0.6);
    const breathe = wave * (0.45 + 0.55 * e);

    // Mood: the resting smile drifting slowly, an occasional bigger smile (and a brow lift with it, or on its own).
    if (t >= this.burstAt) {
      this.burstStart = t;
      this.burstAt = t + this.span(15, 40);
      if (this.rand() < 0.5) this.browStart = t;
    }
    if (t >= this.browAt) {
      this.browStart = t;
      this.browAt = t + this.span(10, 30);
    }
    const pulse = (start: number, rise: number, hold: number, fall: number): number => {
      if (start < 0) return 0;
      const s = t - start;
      return s < rise ? smooth(s / rise) : s < rise + hold ? 1 : smooth(1 - (s - rise - hold) / fall);
    };
    const drift = (Math.sin(t * 0.21 + this.driftPhase[0]) * 0.6 + Math.sin(t * 0.083 + this.driftPhase[1]) * 0.4) * this.mood.drift;
    const smile = clamp01(this.mood.smile + drift + pulse(this.burstStart, 0.6, 2, 1.2) * this.mood.burst);
    const browsUp = pulse(this.browStart, 0.25, 0.6, 0.5) * 0.45;

    // Squinting into the sun, eased over ~0.5 s.
    const squintWant = smooth((ctx.sunFacing - 0.3) / 0.6) * 0.4;
    this.squint += (squintWant - this.squint) * (1 - Math.exp(-dt / 0.5));

    return {
      blinkL: blink, blinkR: blink,
      jawOpen: clamp01(e * 0.3 * wave),
      smile,
      browsUp,
      browsInner: clamp01(e * 0.25),
      squint: clamp01(this.squint),
      nostrils: clamp01(wave * (0.15 + 0.6 * e)),
      breathe: clamp01(breathe),
      gazeYawDeg: this.gaze.yaw, gazePitchDeg: this.gaze.pitch,
      headYawDeg: ctx.still ? this.head.yaw : 0, headPitchDeg: ctx.still ? this.head.pitch : 0,
    };
  }
}
