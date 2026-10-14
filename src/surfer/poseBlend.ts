import { Quaternion } from 'three/webgpu';
import type { RiderDrive } from '../ride/riderBody';
import { type ClipSample, sampleClip } from './clipPlayer';
import { clipFor, clipDuration } from './clips';
import type { PoseLib } from './poseLib';
import type { Stance } from './presets';

/** The pump layer fades out this long after the last pump (spec §3: ~0.5 s). */
export const PUMP_EASE_S = 0.5;
export interface BlendWeights { pump: number; tuck: number; stallTall: number; stallHand: number; stallLowBarrel: number; stallStandBarrel: number; driveOut: number }
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (t: number): number => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** The dials as layer weights over the base trim: each its own dial, then scaled so the sum stays within 1. */
export function blendWeights(d: RiderDrive & { pumpIdleT: number }): BlendWeights {
  const w: BlendWeights = {
    pump: smooth(1 - d.pumpIdleT / PUMP_EASE_S),
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

/** One blended sample: the base trim, then each layer slerped over it by its weight (spec §3, layers in order). */
export function blendSample(lib: PoseLib, stance: Stance, simTime: number, d: RiderDrive & { pumpIdleT: number }, toeDown: boolean): { sample: ClipSample; w: BlendWeights; own: number } {
  const w = blendWeights(d);
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
  add(at('pumpCycle', pumpTime(d.pumpPhase, toeDown, lib)), w.pump);
  add(at('tuck', 0), w.tuck);
  add(at('stallTall', 0), w.stallTall);
  add(at('stallHand', 0), w.stallHand);
  add(at('stallLowBarrel', 0), w.stallLowBarrel);
  add(at('stallStandBarrel', 0), w.stallStandBarrel);
  add(at('driveOut', 0), w.driveOut);
  return { sample: out, w, own: 1 };
}
