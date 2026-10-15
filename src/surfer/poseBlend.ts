import { Quaternion, Vector3 } from 'three/webgpu';
import type { RiderDrive } from '../ride/riderBody';
import { type ClipSample, sampleClip } from './clipPlayer';
import { type BakedClip, clipFor, clipDuration } from './clips';
import { type ClipPoseContext, type ClipSolved, clipPose } from './clipPose';
import { contactFor, type PoseLib } from './poseLib';
import type { SkeletonRest } from './rig';
import type { BoardFrame } from './solvePose';
import type { Stance } from './presets';

/** Which rail the carve has the board on (ridePose.rideBoardFrame rolls the deck toward the rider's right of the nose,
 * the toes' side for a regular rider, as the carve goes positive): the pump clip's toe or heel half. */
export const toeRailDown = (carve: number, stance: Stance): boolean => (stance === 'regular' ? carve >= 0 : carve < 0);

/** The pump layer fades out this long after the last pump (spec §3: ~0.5 s). */
export const PUMP_EASE_S = 0.5;
/** …and eases in over this long once the rider starts pumping (final review: no snap to the deepest crouch). */
export const PUMP_IN_S = 0.15;
export interface BlendWeights { pump: number; tuck: number; stallTall: number; stallHand: number; stallLowBarrel: number; stallStandBarrel: number; driveOut: number }
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (t: number): number => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** The dials as layer weights over the base trim: each its own dial, then scaled so the sum stays within 1. */
export function blendWeights(d: RiderDrive & { pumpIdleT: number }): BlendWeights {
  const w: BlendWeights = {
    pump: smooth(d.pumpOnT / PUMP_IN_S) * smooth(1 - d.pumpIdleT / PUMP_EASE_S),
    tuck: clamp01(d.tuck),
    stallTall: clamp01(d.stall * d.stallW.tall), stallHand: clamp01(d.stall * d.stallW.hand),
    stallLowBarrel: clamp01(d.stall * d.stallW.lowBarrel), stallStandBarrel: clamp01(d.stall * d.stallW.standBarrel),
    driveOut: clamp01(d.driveOut),
  };
  const s = Object.values(w).reduce((a, b) => a + b, 0);
  if (s > 1) for (const k of Object.keys(w) as (keyof BlendWeights)[]) w[k] /= s;
  return w;
}

/** Seconds into pumpCycle: two pumps of eight keys (pmp1 trim … pmp8); a half runs top → bottom → top over phase 0 → 1
 * (compress 0–0.5, extend 0.5–1): the toe half from pmp2 (frame T/8), the heel half from pmp6 (5T/8). */
export function pumpTime(phase: number, toeDown: boolean, lib: PoseLib): number {
  const T = clipDuration(lib, lib.clips.pumpCycle);
  return ((toeDown ? 1 : 5) / 8) * T + phase * (T / 2);
}

/** What the body shows when it follows the dials at a body's pace (poseFollow), in place of the raw dials: the layer
 * weights, the pump's rail (1 the toe half, 0 the heel, between a cross-fade) and phase, and a pose being faded from
 * (`k` its share, 1 at the switch). */
export interface BlendOpts {
  w?: BlendWeights;
  toe?: number;
  phase?: number;
  from?: { sample: ClipSample; k: number };
}

/** A looping clip keyed every `every` frames and run in straight lines between its keys (the approved pump clip: a
 * jolt at each key, a piston's turn at the bottom and the top), replayed as a smooth curve through the same keys (a
 * periodic cubic spline: no jump in speed or acceleration anywhere): every key lands where it was, the speed runs on
 * through each key, and a turn (the bottom, the top) slows into it as a body does. Rotations sign-aligned to their
 * neighbours and renormalised. */
export function smoothLoop(c: BakedClip, every = 10): BakedClip {
  if (c.frames % every !== 0) throw new Error(`smoothLoop: ${c.frames} frames aren't whole keys of ${every}`);
  const n = c.frames, K = Math.round(n / every), wrap = (k: number) => ((k % K) + K) % K;
  // The spline's second derivatives at the keys: M[k−1] + 4 M[k] + M[k+1] = 6 (p[k+1] − 2 p[k] + p[k−1]), cyclic.
  const A = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 4 : wrap(i - j) === 1 || wrap(j - i) === 1 ? 1 : 0)));
  const solve = (rhs: number[]): number[] => {
    const m = A.map((r, i) => [...r, rhs[i]]);
    for (let i = 0; i < K; i++) {
      for (let r = i + 1; r < K; r++) {
        const f = m[r][i] / m[i][i];
        for (let j = i; j <= K; j++) m[r][j] -= f * m[i][j];
      }
    }
    const x = new Array<number>(K).fill(0);
    for (let i = K - 1; i >= 0; i--) {
      let v = m[i][K];
      for (let j = i + 1; j < K; j++) v -= m[i][j] * x[j];
      x[i] = v / m[i][i];
    }
    return x;
  };
  const spline = (p: number[]): ((i: number) => number) => {
    const M = solve(p.map((_, k) => 6 * (p[wrap(k + 1)] - 2 * p[k] + p[wrap(k - 1)])));
    return (i) => {
      const k = Math.floor(i / every), u = (i - k * every) / every, a = wrap(k), b = wrap(k + 1);
      return (1 - u) * p[a] + u * p[b] + (((1 - u) ** 3 - (1 - u)) * M[a] + (u ** 3 - u) * M[b]) / 6;
    };
  };
  const pelvis = new Array<number>(c.pelvis.length).fill(0), rot: Record<string, number[]> = {};
  for (let a = 0; a < 3; a++) {
    const f = spline(Array.from({ length: K }, (_, k) => c.pelvis[3 * k * every + a]));
    for (let i = 0; i < n; i++) pelvis[3 * i + a] = f(i);
  }
  for (const [b, q] of Object.entries(c.rot)) {
    // Each key on the same side of the sphere as the one before it.
    const keys = Array.from({ length: K }, (_, k) => [0, 1, 2, 3].map((a) => q[4 * k * every + a]));
    for (let k = 1; k < K; k++) if (keys[k].reduce((s, v, a) => s + v * keys[k - 1][a], 0) < 0) keys[k] = keys[k].map((v) => -v);
    const flip = keys[0].reduce((s, v, a) => s + v * keys[K - 1][a], 0) < 0;
    const out = new Array<number>(q.length).fill(0);
    if (flip) {
      // Keys that end on the far side of where they began: the cycle doesn't close smoothly on the sphere; keep the clip.
      rot[b] = q.slice();
      continue;
    }
    const fs = [0, 1, 2, 3].map((a) => spline(keys.map((k) => k[a])));
    for (let i = 0; i < n; i++) {
      const v = fs.map((f) => f(i)), len = Math.hypot(...v) || 1;
      for (let a = 0; a < 4; a++) out[4 * i + a] = v[a] / len;
    }
    rot[b] = out;
  }
  return { ...c, pelvis, rot };
}
/** Whether a bone's keys, each sign-aligned to the one before, come back round to the first on the same side of the
 * sphere (smoothLoop splines it; otherwise that bone keeps the clip's own curve). */
export function loopCloses(q: number[], frames: number, every: number): boolean {
  const K = Math.round(frames / every), key = (k: number) => [0, 1, 2, 3].map((a) => q[4 * k * every + a]);
  let prev = key(0);
  const first = prev;
  for (let k = 1; k < K; k++) {
    let cur = key(k);
    if (cur.reduce((s, v, a) => s + v * prev[a], 0) < 0) cur = cur.map((v) => -v);
    prev = cur;
  }
  return prev.reduce((s, v, a) => s + v * first[a], 0) >= 0;
}
const smoothed = new WeakMap<BakedClip, BakedClip>();
/** The pump clip as played (smoothLoop), worked out once per clip. */
function pumpClip(lib: PoseLib, stance: Stance): BakedClip {
  const c = clipFor(lib, 'pumpCycle', stance)!;
  let s = smoothed.get(c);
  if (!s) smoothed.set(c, (s = smoothLoop(c)));
  return s;
}

/** One blended sample: the base trim, then each layer slerped over it by its weight (spec §3, layers in order). */
export function blendSample(lib: PoseLib, stance: Stance, simTime: number, d: RiderDrive & { pumpIdleT: number }, toeDown: boolean, opts: BlendOpts = {}): { sample: ClipSample; w: BlendWeights; own: number } {
  const w = opts.w ?? blendWeights(d);
  const at = (name: string, t: number): ClipSample => sampleClip(clipFor(lib, name, stance)!, lib.fps, t);
  const out = at('trim', simTime);
  const layer = (s: ClipSample, k: number): void => {
    if (k <= 0) return;
    for (const [b, q] of Object.entries(s.rot)) out.rot[b] = (out.rot[b] ?? new Quaternion()).clone().slerp(q!, k);
    out.pelvis.lerp(s.pelvis, k);
  };
  // A running weighted average: the base carries 1 − Σw; each layer is slerped in by its share of the weight so far
  // (k / (acc + k)), so the result is the weighted mix whatever the order (Σw ≤ 1 by blendWeights).
  let acc = 1 - Object.values(w).reduce((a, b) => a + b, 0);
  const add = (s: ClipSample, k: number): void => { if (k > 0) { layer(s, k / (acc + k)); acc += k; } };
  if (w.pump > 0) {
    // The pump on its rail's half; between rails (a carve flipped mid-pump) the two halves cross-fade.
    const phase = opts.phase ?? d.pumpPhase, toe = opts.toe ?? (toeDown ? 1 : 0);
    const pc = pumpClip(lib, stance), atPump = (t: number): ClipSample => sampleClip(pc, lib.fps, t);
    const pump = atPump(pumpTime(phase, toe >= 0.5, lib));
    const k = toe >= 0.5 ? 1 - toe : toe;
    if (k > 1e-4) {
      const other = atPump(pumpTime(phase, toe < 0.5, lib));
      for (const [b, q] of Object.entries(other.rot)) if (pump.rot[b]) pump.rot[b] = pump.rot[b]!.clone().slerp(q!, k);
      pump.pelvis.lerp(other.pelvis, k);
    }
    add(pump, w.pump);
  }
  add(at('tuck', 0), w.tuck);
  add(at('stallTall', 0), w.stallTall);
  add(at('stallHand', 0), w.stallHand);
  add(at('stallLowBarrel', 0), w.stallLowBarrel);
  add(at('stallStandBarrel', 0), w.stallStandBarrel);
  add(at('driveOut', 0), w.driveOut);
  // The pose shown before the blend took over, fading out (the drop's cut, the first ride's pop).
  if (opts.from && opts.from.k > 0) {
    const k = Math.min(1, opts.from.k);
    for (const [b, q] of Object.entries(opts.from.sample.rot)) out.rot[b] = (out.rot[b] ?? new Quaternion()).clone().slerp(q!, k);
    out.pelvis.lerp(opts.from.sample.pelvis, k);
  }
  return { sample: out, w, own: 1 };
}

/** The blend on the board (spec §3): the blended sample placed by the clip path as an authored pose, the compression
 * dial's share what the layers leave, the strongest contact pose's hand pulled to its spot by that pose's weight. */
export function blendOnBoard(lib: PoseLib, rest: SkeletonRest, ctx: Pick<ClipPoseContext, 'spec' | 'layout' | 'stance' | 'dials' | 'balance'>,
  d: RiderDrive & { pumpIdleT: number }, simTime: number, board: BoardFrame, lookAt: Vector3 | null, opts: BlendOpts = {}): ClipSolved & { w: BlendWeights } {
  const { sample, w } = blendSample(lib, ctx.stance, simTime, d, toeRailDown(d.carve, ctx.stance), opts);
  // Fading from another pose: that pose already carries its crouch, lean and twist, and its hands; the dials and the
  // contact pull come in with the blend's share.
  const own = 1 - Math.min(1, opts.from?.k ?? 0);
  const above = w.pump + w.tuck + w.stallTall + w.stallHand + w.stallLowBarrel + w.stallStandBarrel + w.driveOut;
  // The pull toward the contact poses' spots averaged by their weights (final review: picking the strongest one made the
  // hand jump ~0.35 m at a crossover, tuck to hand drag); all are the same (back) hand.
  let total = 0, side: 'l' | 'r' | null = null;
  const spot = new Vector3();
  for (const k of ['tuck', 'stallHand', 'stallStandBarrel'] as const) {
    const c = w[k] > 0 ? contactFor(lib, k, ctx.stance) : null;
    if (!c) continue;
    spot.addScaledVector(new Vector3(...c.wrist), w[k]);
    total += w[k];
    side = c.side;
  }
  // On the body's pace the hand lands ~0.8–0.9 s into a held contact pose; a tap shows a reach that doesn't quite touch,
  // as a real hand's wouldn't (landing it sooner took the hand past a real reach's speed).
  const pull = side && total > 0 && own > 0 ? { side, wrist: spot.multiplyScalar(1 / total), weight: Math.min(1, total) * own } : undefined;
  const dials = own < 1 ? { ...ctx.dials, compression: ctx.dials.compression * own, lean: ctx.dials.lean * own, twist: ctx.dials.twist * own } : ctx.dials;
  return { ...clipPose(rest, sample, { ...ctx, dials, authored: true, compressionScale: 1 - above, pull }, board, lookAt), w };
}
