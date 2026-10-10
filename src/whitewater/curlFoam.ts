import { float, max, smoothstep } from 'three/tsl';
import { LIP_PHASES } from '../breaker/wombSection';
import { smoothstep as smoothstepCpu } from '../math/smoothstep';

type N = any;

/**
 * The curl's own foam with photo 5's timing (whitewater spec §3.4): the lip clean and translucent to its tip while it is
 * thrown, only the tip's edge a thin white fringe that tracks down the curtain; the lip's face and the tube's inside clean
 * until the tube caves in, then foam climbing from the tip. CPU reference; curlFoamNode mirrors it (same constants).
 */
export const FRINGE_WIDTH = 0.12;      // of the lip's reach (tip → crest), the white edge
export const FACE_FOAM_PHASE: readonly [number, number] = [1.2, 1.5];  // foam climbs the lip's face as the tube caves in
export const CLEAN_TUBE = 0.8;         // how much of the sheet's foam the open tube's inside hides (negative zone)

/** The lip thrown (in over LIP_PHASES 0–1, out over 2–3): the ribbon's lipness window. */
const thrownCpu = (phase: number): number => smoothstepCpu(LIP_PHASES[0], LIP_PHASES[1], phase) * (1 - smoothstepCpu(LIP_PHASES[2], LIP_PHASES[3], phase));

/** Signed foam at a ribbon sample: + its own foam (tip fringe, then the caving lip), − the clean tube's share.
 *  offOverReach = |j − tip| / reach; inside = 1 on the tube's inside samples (j past the tip toward the floor), else 0. */
export function curlFoamAt(phase: number, offOverReach: number, inside: number, curl: number): number {
  const fringe = (1 - smoothstepCpu(0, FRINGE_WIDTH, offOverReach)) * thrownCpu(phase);
  const caving = smoothstepCpu(FACE_FOAM_PHASE[0], FACE_FOAM_PHASE[1], phase);
  const face = caving * (1 - smoothstepCpu(0, 1, offOverReach)) * (1 - inside);
  const clean = -CLEAN_TUBE * inside * (1 - caving);
  return (Math.max(fringe, face) + clean) * curl;
}

export function curlFoamNode(phase: N, offOverReach: N, inside: N, curl: N): N {
  const thrown = smoothstep(LIP_PHASES[0], LIP_PHASES[1], phase).mul(float(1.0).sub(smoothstep(LIP_PHASES[2], LIP_PHASES[3], phase)));
  const fringe = float(1.0).sub(smoothstep(0.0, FRINGE_WIDTH, offOverReach)).mul(thrown);
  const caving = smoothstep(FACE_FOAM_PHASE[0], FACE_FOAM_PHASE[1], phase);
  const face = caving.mul(float(1.0).sub(smoothstep(0.0, 1.0, offOverReach))).mul(float(1.0).sub(inside));
  const clean = inside.mul(float(1.0).sub(caving)).mul(-CLEAN_TUBE);
  return max(fringe, face).add(clean).mul(curl);
}
