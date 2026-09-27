import { clamp, exp, float, max, min, select, smoothstep, uniform } from 'three/tsl';
import { type BreakParams, COLLAPSE_END, SHARPEN_DEPTH, FOAM_DENSE_BEHIND_H, drainFullRatio, FOAM_ONSET_COLLAPSE, FOAM_SETTLE_COLLAPSE, FOAM_TRAIL_H, HOLLOW_REACH_Q, MIN_STAGE_SPAN, normalizeBreakParams, steepeningStart } from './breaking';

type N = any;

/**
 * The TSL mirror of breaking.ts: the ratio, the stage and the sheet's shape of one breaking wave at one point, term by
 * term. SetWaves builds these per wave and point; breaking.ts stays the source of truth, and the GPU self-tests check
 * the mirror.
 */

/** One uniform per BreakParams number the sheet reads (the stage span floored, the steepening as the ratio it starts at, the
 * drain as the ratio it is full at). */
export function createBreakUniforms(p: BreakParams) {
  const u = {
    enabled: uniform(0), gamma: uniform(0), delta: uniform(0), hFloorM: uniform(0), stageSpan: uniform(1), troughDrain: uniform(0), beta: uniform(0),
    faceWidth: uniform(0), drainTo: uniform(1), collapseFrom: uniform(1), collapseTo: uniform(2), steepFrom: uniform(0),
  };
  updateBreakUniforms(u, p);
  return u;
}
export type BreakUniforms = ReturnType<typeof createBreakUniforms>;

/**
 * Uploads a normalized copy of `p` (the caller's object is left alone): every stage window non-empty, every width and
 * the drained-depth floor positive, and the steepening's start below ρ = 1, so no smoothstep on the GPU ever gets equal
 * or reversed edges.
 */
export function updateBreakUniforms(u: BreakUniforms, params: BreakParams): void {
  const p = { ...params };
  normalizeBreakParams(p);
  u.enabled.value = p.enabled ? 1 : 0;
  u.gamma.value = p.gamma; u.delta.value = p.delta; u.hFloorM.value = p.hFloorM;
  u.stageSpan.value = Math.max(p.stageSpan, MIN_STAGE_SPAN);
  u.troughDrain.value = p.troughDrain; u.beta.value = p.beta; u.faceWidth.value = p.faceWidth;
  u.drainTo.value = drainFullRatio(p);
  u.collapseFrom.value = 1 + p.collapseStart * u.stageSpan.value; u.collapseTo.value = 1 + COLLAPSE_END * u.stageSpan.value;
  u.steepFrom.value = steepeningStart(p);
}

/** smoothstep with its edges reversed (e0 > e1): WGSL's smoothstep wants low < high. */
const smoothstepDown = (e0: N, e1: N, x: N): N => float(1.0).sub(smoothstep(e1, e0, x));

/** d/dx smoothstep(e0, e1, x) for e0 < e1 (breaking.ts smoothstepSlope): 0 outside the ramp. */
const smoothstepSlope = (e0: N, e1: N, x: N): N => {
  const span = float(e1).sub(e0);
  const t = clamp(float(x).sub(e0).div(span), 0.0, 1.0);
  return t.mul(float(1.0).sub(t)).mul(6.0).div(span);
};

/** breakingRatio: ρ = H / breakingHeight(hmin), breakingHeight = γ·max(hmin / (1 + γδ), h_floor), exactly as on the CPU. */
export function breakingRatioNode(H: N, hmin: N, u: BreakUniforms): N {
  return H.div(u.gamma.mul(max(hmin.div(u.gamma.mul(u.delta).add(1.0)), u.hFloorM)));
}

/** breakingStage: 0 until ρ = 1. */
export function breakingStageNode(r: N, u: BreakUniforms): N {
  return select(r.greaterThan(1.0), smoothstep(1.0, u.stageSpan.add(1.0), r), float(0.0));
}

/** steepening: 0 below steepeningStart, 1 from ρ = 1. */
export function steepeningNode(r: N, u: BreakUniforms): N {
  return smoothstep(u.steepFrom, 1.0, r);
}

/** stageCurves: the drain and the collapse at crest ratio r. */
export interface StageCurveNodes { drain: N; collapse: N }

export function stageCurvesNode(r: N, u: BreakUniforms): StageCurveNodes {
  return {
    drain: smoothstep(u.steepFrom, u.drainTo, r),
    collapse: smoothstep(u.collapseFrom, u.collapseTo, r),
  };
}

/** One wave at one point (see breaking.ts BreakPointInput): the derivatives are per metre ahead. */
export interface BreakPointNodes {
  theta: N; env: N; uUnbroken: N; eta: N; uCrest: N; etaCrest: N; H: N; k: N; hmin: N; slope: N; dThetaDAhead: N; dEnvDAhead: N;
  /** The crest lookup's confidence (breaking.BreakPointInput.crestConfidence): the front sharpening scales with it. */
  crestConfidence: N;
}

/**
 * The TSL mirror of breakPoint, for the crest's steepening weight `steep` and stage curves. The caller must gate it on
 * `(steep > 0 || s > 0) && H > MIN_BREAKING_HEIGHT_M` (an If, before any of this is evaluated): at H = 0 the H-scaled
 * smoothsteps have equal edges.
 */
export function breakPointNode(i: BreakPointNodes, steep: N, u: BreakUniforms, curves: StageCurveNodes): { eta: N; foam: N; dEtaDAhead: N } {
  const { drain, collapse } = curves;
  const ahead = i.uUnbroken.sub(i.uCrest);
  // sharpenDrop and sharpenDropSlope, front only. Behind the crest `a` is 0, where sink and sink′ both vanish, so the
  // drop and its slope are exactly 0 there, as breaking.ts returns.
  const a = max(ahead, 0.0);
  const width = u.faceWidth.mul(i.H);
  const quarter = float(Math.PI / 2).div(i.k);
  const x = a.div(width);
  const g = exp(x.mul(x).negate());
  const sink = float(1.0).sub(g);
  const dSink = a.mul(g).mul(2.0).div(width.mul(width));
  const fade = smoothstepDown(quarter.mul(2.0), quarter, a);
  const dFade = smoothstepSlope(quarter, quarter.mul(2.0), a).negate();
  const above = i.eta.sub(i.etaCrest.sub(i.H.mul(SHARPEN_DEPTH)));
  const m = max(above, 0.0);
  const dM = select(above.greaterThan(0.0), i.slope, float(0.0));
  const sharpen = steep.mul(i.crestConfidence);
  const drop = sharpen.mul(sink).mul(fade).mul(m);
  const dDrop = sharpen.mul(dSink.mul(fade).mul(m).add(sink.mul(dFade).mul(m)).add(sink.mul(fade).mul(dM)));
  // drainDepth × drainShape × env, and its slope (drainShapeSlope): the hollow at the foot. It reuses the sharpening's
  // sink (the same face width); behind the crest a = 0, where the sink and its slope vanish, so both are exactly 0.
  const depth = u.troughDrain.mul(u.delta).mul(i.H).mul(drain);
  const hollowReach = quarter.mul(HOLLOW_REACH_Q);
  const xr = a.div(hollowReach);
  const decay = exp(xr.mul(xr).negate());
  const dDecay = a.mul(-2.0).div(hollowReach.mul(hollowReach)).mul(decay);
  const pastTrough = smoothstep(-Math.PI, -Math.PI / 2, i.theta);
  const dPast = smoothstepSlope(-Math.PI, -Math.PI / 2, i.theta).mul(i.dThetaDAhead);
  const shape = sink.mul(decay).mul(pastTrough);
  const dShape = dSink.mul(decay).add(sink.mul(dDecay)).mul(pastTrough).add(sink.mul(decay).mul(dPast));
  const drained = depth.mul(shape).mul(i.env);
  const dDrained = depth.mul(dShape.mul(i.env).add(shape.mul(i.dEnvDAhead)));
  // boreScale
  const scale = float(1.0).add(min(float(1.0), u.beta.mul(max(i.hmin, 0.0)).div(i.H)).sub(1.0).mul(collapse));
  // foamWeight: the H > MIN_BREAKING_HEIGHT_M gate keeps the front edge's smoothstep edges apart.
  const fw = u.faceWidth.mul(i.H);
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1.0, collapse);
  const edge = fw.mul(0.5);
  const reach = fw.mul(smoothstep(FOAM_SETTLE_COLLAPSE, 1.0, collapse));
  const front = float(1.0).sub(smoothstep(reach.sub(edge), reach, ahead));
  const trail = float(1.0).sub(smoothstep(Math.PI / 2, Math.PI, i.theta))
    .mul(float(1.0).sub(smoothstep(i.H.mul(FOAM_DENSE_BEHIND_H), i.H.mul(FOAM_TRAIL_H), ahead.negate())));
  const foam = land.mul(i.env).mul(front).mul(trail);
  return {
    eta: i.eta.sub(drop).sub(drained).mul(scale),
    foam,
    dEtaDAhead: i.slope.mul(scale.sub(1.0)).sub(dDrop.add(dDrained).mul(scale)),
  };
}
