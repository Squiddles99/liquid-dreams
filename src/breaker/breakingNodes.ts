import { abs, cos, exp, float, max, min, select, sin, smoothstep, uniform } from 'three/tsl';
import {
  type BreakParams, FOAM_LIP_TOLERANCE, FOAM_ONSET_COLLAPSE, FOAM_SETTLE_COLLAPSE, MIN_STAGE_SPAN, normalizeBreakParams,
} from './breaking';

type N = any;

/**
 * The TSL mirror of breaking.ts: the stage and the shape of one breaking wave at one point, term by term. SetWaves
 * builds these per wave and point; breaking.ts stays the source of truth, and the GPU self-tests check the mirror.
 */

/** One uniform per BreakParams number (angles in radians, the stage span floored), mirroring breaking.ts. */
export function createBreakUniforms(p: BreakParams) {
  const u = {
    enabled: uniform(0), gamma: uniform(0), delta: uniform(0), hFloorM: uniform(0), stageSpan: uniform(1), thetaMax: uniform(0),
    pivotDrop: uniform(0), pivotAhead: uniform(0), lipZone: uniform(0), lipBackReach: uniform(0), troughDrain: uniform(0), beta: uniform(0),
    faceWidth: uniform(0), backWidth: uniform(0), drainEnd: uniform(0), steepEnd: uniform(0), curlStart: uniform(0),
    curlEnd: uniform(0), collapseStart: uniform(0),
  };
  updateBreakUniforms(u, p);
  return u;
}
export type BreakUniforms = ReturnType<typeof createBreakUniforms>;

/**
 * Uploads a normalized copy of `p` (the caller's object is left alone): every stage window non-empty and ordered, every
 * width and the drained-depth floor positive, so no smoothstep on the GPU ever gets equal edges (NaN).
 */
export function updateBreakUniforms(u: BreakUniforms, params: BreakParams): void {
  const p = { ...params };
  normalizeBreakParams(p);
  u.enabled.value = p.enabled ? 1 : 0;
  u.gamma.value = p.gamma; u.delta.value = p.delta; u.hFloorM.value = p.hFloorM;
  u.stageSpan.value = Math.max(p.stageSpan, MIN_STAGE_SPAN);
  u.thetaMax.value = (p.thetaMaxDeg * Math.PI) / 180;
  u.pivotDrop.value = p.pivotDrop; u.pivotAhead.value = p.pivotAhead; u.lipZone.value = p.lipZone; u.lipBackReach.value = p.lipBackReach;
  u.troughDrain.value = p.troughDrain; u.beta.value = p.beta; u.faceWidth.value = p.faceWidth; u.backWidth.value = p.backWidth;
  u.drainEnd.value = p.drainEnd; u.steepEnd.value = p.steepEnd; u.curlStart.value = p.curlStart; u.curlEnd.value = p.curlEnd;
  u.collapseStart.value = p.collapseStart;
}

/** smoothstep with its edges reversed (e0 > e1): WGSL's smoothstep wants low < high. */
const smoothstepDown = (e0: N, e1: N, x: N): N => float(1.0).sub(smoothstep(e1, e0, x));

/** breakingRatio + breakingStage: 0 until r = 1. The drained depth is floored at hFloorM exactly as on the CPU. */
export function breakingStageNode(H: N, hmin: N, u: BreakUniforms): N {
  const r = H.div(u.gamma.mul(max(hmin.sub(u.delta.mul(H)), u.hFloorM)));
  return select(r.greaterThan(1.0), smoothstep(1.0, u.stageSpan.add(1.0), r), float(0.0));
}

/** stageCurves: the four stage windows at crest stage s. */
export interface StageCurveNodes { steep: N; drain: N; curl: N; collapse: N }

export function stageCurvesNode(s: N, u: BreakUniforms): StageCurveNodes {
  return {
    steep: smoothstep(0.0, u.steepEnd, s),
    drain: smoothstep(0.0, u.drainEnd, s),
    curl: smoothstep(u.curlStart, u.curlEnd, s),
    collapse: smoothstep(u.collapseStart, 1.0, s),
  };
}

/** One wave at one point (see breaking.ts BreakPointInput). */
export interface BreakPointNodes { theta: N; env: N; uUnbroken: N; eta: N; uCrest: N; etaCrest: N; H: N; k: N; hmin: N }

/**
 * The TSL mirror of breakPoint. The caller must gate it on `s > 0 && H > MIN_BREAKING_HEIGHT_M` (an If, before any of
 * this is evaluated): at H = 0 the H-scaled smoothsteps have equal edges. `curves` may be passed in (as vars) when
 * several points share one crest stage.
 */
export function breakPointNode(
  i: BreakPointNodes, s: N, u: BreakUniforms, includeCurl: boolean, curves: StageCurveNodes = stageCurvesNode(s, u),
): { du: N; eta: N; foam: N; lip: N } {
  const { steep, drain, curl, collapse } = curves;
  const ahead = i.uUnbroken.sub(i.uCrest);
  let eta: N = i.eta;
  if (includeCurl) {
    // sharpenDrop
    const width = select(ahead.greaterThanEqual(0.0), u.faceWidth, u.backWidth).mul(i.H);
    const quarter = float(Math.PI / 2).div(i.k);
    const a = ahead.div(width);
    const sink = float(1.0).sub(exp(a.mul(a).negate()));
    const fade = smoothstepDown(quarter.mul(2.0), quarter, abs(ahead));
    eta = eta.sub(steep.mul(sink).mul(fade).mul(max(i.eta.sub(i.etaCrest.sub(i.H)), 0.0)));
  }
  // drainDepth × drainShape
  const drainShape = smoothstepDown(0.0, -Math.PI / 4, i.theta).mul(smoothstep(-Math.PI, -Math.PI / 2, i.theta));
  eta = eta.sub(u.troughDrain.mul(u.delta).mul(i.H).mul(drain).mul(drainShape).mul(i.env));
  // lipWeight (both paths: the foam reads it too)
  const fw = u.faceWidth.mul(i.H);
  const near = float(1.0).sub(smoothstep(fw, fw.mul(2.0), ahead)).mul(float(1.0).sub(smoothstep(0.0, i.H.mul(u.lipBackReach), ahead.negate())));
  const w = smoothstep(i.etaCrest.sub(u.lipZone.mul(i.H)), i.etaCrest, eta).mul(near);
  const unlanded = curl.mul(w).mul(float(1.0).sub(collapse)); // φ / Θmax
  let du: N = float(0.0), dy: N = float(0.0), lip: N = float(0.0);
  if (includeCurl) {
    // curlDisplacement
    const phi = u.thetaMax.mul(unlanded);
    const ru = i.uUnbroken.sub(i.uCrest.add(u.pivotAhead.mul(i.H)));
    const re = eta.sub(i.etaCrest.sub(u.pivotDrop.mul(i.H)));
    const cs = cos(phi), sn = sin(phi);
    du = cs.mul(ru).add(sn.mul(re)).sub(ru);
    dy = sn.negate().mul(ru).add(cs.mul(re)).sub(re);
    lip = max(sn, 0.0).mul(w);
  }
  // boreScale
  const scale = float(1.0).add(min(float(1.0), u.beta.mul(max(i.hmin, 0.0)).div(i.H)).sub(1.0).mul(collapse));
  // foamWeight: the H > MIN_BREAKING_HEIGHT_M gate keeps the front edge's smoothstep edges apart.
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1.0, collapse);
  const edge = fw.mul(0.5);
  const reach = fw.mul(smoothstep(FOAM_SETTLE_COLLAPSE, 1.0, collapse));
  const front = float(1.0).sub(smoothstep(reach.sub(edge), reach, ahead));
  const trail = float(1.0).sub(smoothstep(Math.PI / 2, Math.PI, i.theta));
  const notLip = float(1.0).sub(smoothstep(0.0, FOAM_LIP_TOLERANCE, unlanded));
  const foam = land.mul(i.env).mul(front).mul(trail).mul(notLip);
  return { du: du.mul(scale), eta: eta.add(dy).mul(scale), foam, lip };
}
