import { abs, clamp, exp, exp2, float, floor, log, max, min, mix, select, sign, smoothstep, uniform } from 'three/tsl';
import {
  type BreakParams, LEAN_BLEND_H, COLLAPSE_END, GRAVITY_MS2, ONSET_LEVELS, ONSET_LEVEL_Q0, ONSET_LEVEL_RATIO, SHARPEN_DEPTH, FOAM_DENSE_BEHIND_H, drainFullRatio, FOAM_ONSET_COLLAPSE, FOAM_SETTLE_COLLAPSE, FOAM_TRAIL_H,
  HOLLOW_REACH_Q, MIN_BREAKING_HEIGHT_M, MIN_STAGE_SPAN, PILE_BACK_H, PILE_BLEND_H, PILE_FOAM_EDGE, PILE_FOAM_THIN, PILE_FRONT_H,
  PILE_LAND_H, PILE_MIN_LIFT, PILE_REACH, PILE_RISE_S, PILE_SPEED_MS, PLUNGE_FULL_RATIO, SLURP_FULL_RATIO, SURGE_FALL_S, SURGE_FULL_RATIO, SURGE_RISE_S,
  normalizeBreakParams, onsetGain, steepeningStart,
} from './breaking';

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
    collapseTime: uniform(1), drainGrowth: uniform(1), onsetGain: uniform(1),
    pileHalfM: uniform(50), pileSurge: uniform(0), churnSize: uniform(0), churnSpeed: uniform(1), psiNudge: uniform(0), randomDial: uniform(0),
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
  u.collapseTime.value = p.collapseTime; u.drainGrowth.value = 1 + p.troughDrain * p.delta; u.onsetGain.value = onsetGain(p);
  u.pileHalfM.value = Math.max(p.pileHalfM, 1e-3); u.pileSurge.value = p.pileSurge;
  u.psiNudge.value = p.psiNudge; u.randomDial.value = p.randomDial;
  u.churnSize.value = p.churnSize; u.churnSpeed.value = p.churnSpeed;
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

/**
 * Where a wave of deep-water height `heightM` reads the onset record (breaking.onsetLevel): lq, its breaking level's
 * position in level steps, log(q* ÷ ONSET_LEVEL_Q0) ÷ log(ONSET_LEVEL_RATIO), and the level below it, k ∈ [0, ONSET_LEVELS −
 * 2] (a float). The same for every point of a wave: SetWaves loads just levels k and k + 1.
 */
/** breaking.onsetPsi from the record's pair at level k (texel k holds (ψ_k, ψ_{k+1})): w = clamp(lq − k, 0, 1). */
export function onsetPsiNode(lo: N, hi: N, level: { lq: N; k: N }): N {
  return mix(lo, hi, clamp(level.lq.sub(level.k), 0.0, 1.0));
}

export function onsetLevelNode(heightM: N, u: BreakUniforms): { lq: N; k: N } {
  const g = float(heightM).mul(u.onsetGain);
  const lq = log(float(1.0).div(max(g, 1e-6).mul(ONSET_LEVEL_Q0))).div(Math.log(ONSET_LEVEL_RATIO));
  return { lq, k: clamp(floor(lq), 0.0, ONSET_LEVELS - 2) };
}

/**
 * breaking.onsetTime, onsetHeight and onsetRatio from the record's running maximum and levels k (lo) and k + 1 (hi) at a
 * point: { broken, tb, rMax, lipH }. From level k toward level k + 1 log-linearly, or toward the running maximum (time 0)
 * where level k + 1 is above it. tb and lipH are meaningless when not broken.
 */
export function onsetTimeNode(rec: { run: N; tbLo: N; ampLo: N; tbHi: N; ampHi: N }, level: { lq: N; k: N }, heightM: N, u: BreakUniforms): { broken: N; tb: N; rMax: N; lipH: N } {
  const g: N = float(heightM).mul(u.onsetGain);
  const logR = Math.log(ONSET_LEVEL_RATIO);
  const qHi = exp(level.k.add(1.0).mul(logR)).mul(ONSET_LEVEL_Q0);
  const toRun = rec.run.lessThan(qHi);
  const hi = select(toRun, log(max(rec.run, 1e-9).div(ONSET_LEVEL_Q0)).div(logR), level.k.add(1.0));
  const w = clamp(level.lq.sub(level.k).div(max(hi.sub(level.k), 1e-9)), 0.0, 1.0);
  return {
    broken: g.mul(rec.run).greaterThanEqual(1.0),
    tb: mix(rec.tbLo, select(toRun, float(0.0), rec.tbHi), w),
    rMax: g.mul(rec.run),
    lipH: float(heightM).mul(mix(rec.ampLo, rec.ampHi, w)),
  };
}

/** breaking.slurp: the slurp's pull on a shoulder, from its slurp ratio (its sharpening's start to SLURP_FULL_RATIO). */
export function slurpNode(rSlurp: N, u: BreakUniforms): N {
  return smoothstep(u.steepFrom, SLURP_FULL_RATIO, rSlurp);
}

/** breaking.lifecycle's result as nodes (the pile's terms as breaking.Lifecycle's). */
export interface LifecycleNodes { steep: N; stage: N; drain: N; collapse: N; pile: N; pileReach: N; surge: N; decay: N }

/**
 * breaking.lifecycle: `hasRecord` false is its tb undefined (the ratio alone); else `broken` (the record's, or r ≥ 1)
 * with time since onset `tb` (0 where only r ≥ 1 says so) and the section's largest ratio `rMax`. H is the crest's
 * local height; rSlurp its slurp ratio (the sharpening and the drain take the slurp's pull, as breaking.lifecycle).
 */
/** The per-crest shape (overturn.withSheetShape and the tube's presence, from the crest's ψ): absent, the uniforms and no plunge. */
export interface CrestShapeNodes { drainGrowth: N; pileSurge: N; plunge: N }

export function lifecycleNode(r: N, hasRecord: N, broken: N, tb: N, rMax: N, H: N, rSlurp: N, u: BreakUniforms, sh?: CrestShapeNodes): LifecycleNodes {
  const drainGrowth = sh?.drainGrowth ?? u.drainGrowth, pileSurge = sh?.pileSurge ?? u.pileSurge, plunge = sh?.plunge ?? float(0.0);
  const pulled = slurpNode(rSlurp, u);
  const steepR = max(steepeningNode(r, u), pulled), stageR = breakingStageNode(r, u), own = stageCurvesNode(r, u);
  const c = { drain: max(own.drain, pulled), collapse: own.collapse };
  const isBroken = hasRecord.and(broken.or(r.greaterThanEqual(1.0)));
  const t = select(broken, tb, float(0.0));
  // landingEstimate: landingTime(H·(1 + troughDrain·δ)), the fall floored at 0.05 m; settleSpan is collapseTime × it.
  const land = max(H.mul(drainGrowth), 0.05).mul(2 / GRAVITY_MS2).sqrt();
  // breaking.lifecycle's plunge: a section the maths throws a tube for breaks whole (and surges) once past PLUNGE_FULL_RATIO.
  const plunged = plunge.mul(smoothstep(1.0, PLUNGE_FULL_RATIO, max(r, rMax)));
  const extent = max(breakingStageNode(max(r, rMax), u), plunged);
  const thrown = smoothstep(0.0, land, t).mul(extent);
  const reach = smoothstep(land, land.mul(u.collapseTime.add(1.0)), t);
  const settled = reach.mul(extent);
  // The whitewater pile (breaking.lifecycle): none unless broken on a record.
  const rolled = max(t.sub(land).sub(PILE_RISE_S), 0.0).mul(PILE_SPEED_MS);
  const surgeWeight = pileSurge.mul(max(smoothstep(1.0, SURGE_FULL_RATIO, max(r, rMax)), plunged));
  const surge = float(1.0).add(surgeWeight.mul(smoothstep(land, land.add(SURGE_RISE_S), t))
    .mul(float(1.0).sub(smoothstep(land.add(SURGE_RISE_S), land.add(SURGE_RISE_S + SURGE_FALL_S), t))));
  return {
    steep: select(isBroken, max(steepR, thrown), steepR),
    stage: select(isBroken, max(stageR, thrown), stageR),
    drain: select(isBroken, max(c.drain, thrown), c.drain),
    collapse: select(hasRecord, select(isBroken, settled, float(0.0)), c.collapse),
    pile: select(isBroken, smoothstep(land, land.add(PILE_RISE_S), t).mul(extent), float(0.0)),
    pileReach: select(isBroken, reach, float(0.0)),
    surge: select(isBroken, surge, float(1.0)),
    decay: select(isBroken, exp2(rolled.div(u.pileHalfM).negate()), float(1.0)),
  };
}

/** One wave at one point (see breaking.ts BreakPointInput): the derivatives are per metre ahead. */
export interface BreakPointNodes {
  theta: N; env: N; uUnbroken: N; eta: N; uCrest: N; etaCrest: N; H: N; k: N; hmin: N; boreH: N; slope: N; dThetaDAhead: N; dEnvDAhead: N;
  /** The crest lookup's confidence (breaking.BreakPointInput.crestConfidence): the front sharpening scales with it. */
  crestConfidence: N;
  /** The pile's lip above still water, the lateral taper and the lip's wave height (breaking.BreakPointInput). Absent: no
   * pile (the ribbon frame's sheet). */
  lipTop?: N;
  lateral?: N;
  lipHeight?: N;
  /** breaking.BreakPointInput.lean: the leaned Phase 1 height and slope, used where `on` (eta and slope are then the
   * unleaned wave's). Absent: no lean. */
  lean?: { eta: N; slope: N; on: N };
}

/** The whitewater pile's curves (breaking.Lifecycle's pile terms). */
export interface PileCurveNodes { pile: N; pileReach: N; surge: N; decay: N }

/**
 * The TSL mirror of breakPoint, for the crest's steepening weight `steep` and stage curves. The caller must gate it on
 * `(steep > 0 || s > 0) && H > MIN_BREAKING_HEIGHT_M` (an If, before any of this is evaluated): at H = 0 the H-scaled
 * smoothsteps have equal edges.
 */
export function breakPointNode(i: BreakPointNodes, steep: N, u: BreakUniforms, curves: StageCurveNodes, pc?: PileCurveNodes, sh?: { troughDrain: N }): { eta: N; foam: N; dEtaDAhead: N; pile: N } {
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
  const sharpen = steep.mul(i.crestConfidence);
  const floorH = i.etaCrest.sub(i.H.mul(SHARPEN_DEPTH));
  /** sharpenDrop and its slope for a height `eta` with slope `slope` along ahead. */
  const dropOf = (eta: N, slope: N): { drop: N; dDrop: N } => {
    const above = eta.sub(floorH);
    const m = max(above, 0.0);
    const dM = select(above.greaterThan(0.0), slope, float(0.0));
    return { drop: sharpen.mul(sink).mul(fade).mul(m), dDrop: sharpen.mul(dSink.mul(fade).mul(m).add(sink.mul(dFade).mul(m)).add(sink.mul(fade).mul(dM))) };
  };
  const { drop, dDrop } = dropOf(i.eta, i.slope);
  // drainDepth × drainShape × env, and its slope (drainShapeSlope): the hollow at the foot. It reuses the sharpening's
  // sink (the same face width); behind the crest a = 0, where the sink and its slope vanish, so both are exactly 0.
  const depth = (sh?.troughDrain ?? u.troughDrain).mul(u.delta).mul(i.H).mul(drain);
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
  const scale = float(1.0).add(min(float(1.0), u.beta.mul(max(i.hmin, 0.0)).div(i.boreH)).sub(1.0).mul(collapse));
  // foamWeight: the H > MIN_BREAKING_HEIGHT_M gate keeps the front edge's smoothstep edges apart.
  const fw = u.faceWidth.mul(i.H);
  const land = smoothstep(FOAM_ONSET_COLLAPSE, 1.0, collapse);
  const edge = fw.mul(0.5);
  const reach = fw.mul(smoothstep(FOAM_SETTLE_COLLAPSE, 1.0, collapse));
  const front = float(1.0).sub(smoothstep(reach.sub(edge), reach, ahead));
  const trail = float(1.0).sub(smoothstep(Math.PI / 2, Math.PI, i.theta))
    .mul(float(1.0).sub(smoothstep(i.H.mul(FOAM_DENSE_BEHIND_H), i.H.mul(FOAM_TRAIL_H), ahead.negate())));
  const foam = land.mul(i.env).mul(front).mul(trail);
  // The unleaned wave sharpened and drained, and its whole slope along ahead.
  const baseU = i.eta.sub(drop).sub(drained).mul(scale);
  const slopeU = i.slope.sub(dDrop).sub(dDrained).mul(scale);
  let base: N = baseU, slopeBase: N = slopeU, phase1Slope: N = i.slope;
  if (i.lean) {
    // breaking.breakPoint: where the front leans, down toward the leaned wave sharpened, undrained, where it lies lower
    // (breaking.leanRamp, k = LEAN_BLEND_H·H).
    const l = dropOf(i.lean.eta, i.lean.slope);
    const leaned = i.lean.eta.sub(l.drop).mul(scale);
    const slopeL = i.lean.slope.sub(l.dDrop).mul(scale);
    const kL = i.H.mul(LEAN_BLEND_H);
    const dL = baseU.sub(leaned);
    const dPos = max(dL, 0.0);
    const ramp = select(dL.lessThan(kL), dPos.mul(dPos).div(kL.mul(2.0)), dL.sub(kL.mul(0.5)));
    const rampD = clamp(dL.div(kL), 0.0, 1.0);
    base = select(i.lean.on, baseU.sub(ramp), baseU).toVar();
    slopeBase = select(i.lean.on, slopeU.sub(rampD.mul(slopeU.sub(slopeL))), slopeU).toVar();
    phase1Slope = select(i.lean.on, i.lean.slope, i.slope);
  }
  const dBase = slopeBase.sub(phase1Slope);
  if (!pc || i.lipTop === undefined || i.lateral === undefined || i.lipHeight === undefined) return { eta: base, foam, dEtaDAhead: dBase, pile: float(0.0) };
  // The whitewater pile (breaking.breakPoint, term by term): the sheet lifted toward the pile's top T by a smooth
  // maximum, weighted by its shape g around its top (PILE_LAND_H·size·pileReach ahead) and by nearness to its crest.
  // Where the weight is 0 every term below is finite and adds exactly 0.
  const floorTop = i.etaCrest.div(max(i.H, MIN_BREAKING_HEIGHT_M)).mul(u.beta.mul(max(i.hmin, 0.0))).mul(i.lateral);
  const phase = abs(i.theta).div(2 * Math.PI);
  const nearC = float(1.0).sub(smoothstep(PILE_REACH[0], PILE_REACH[1], phase));
  const dNear = smoothstepSlope(PILE_REACH[0], PILE_REACH[1], phase).negate().mul(sign(i.theta)).mul(i.dThetaDAhead).div(2 * Math.PI);
  const crestWeight = pc.pile.mul(i.crestConfidence).mul(smoothstep(PILE_MIN_LIFT[0], PILE_MIN_LIFT[1], i.lipTop.div(max(floorTop, 1e-6))));
  const weight = crestWeight.mul(nearC);
  const T = max(floorTop, i.lipTop.mul(pc.surge).mul(pc.decay));
  const size = max(i.lipHeight, MIN_BREAKING_HEIGHT_M);
  // pileShape: a Gaussian, steep in front (PILE_FRONT_H) and long behind (PILE_BACK_H).
  const v = ahead.sub(size.mul(PILE_LAND_H).mul(pc.pileReach));
  const pw = select(v.greaterThanEqual(0.0), float(PILE_FRONT_H), float(PILE_BACK_H)).mul(size);
  const px = v.div(pw);
  const pg = exp(px.mul(px).negate());
  const dg = px.mul(-2.0).div(pw).mul(pg);
  // smoothMax(base, T, k).
  const k = size.mul(PILE_BLEND_H);
  const h = max(k.sub(abs(base.sub(T))), 0.0).div(k);
  const mValue = max(base, T).add(h.mul(h).mul(k).div(4.0));
  const mDA = clamp(base.sub(T).div(k.mul(2.0)).add(0.5), 0.0, 1.0);
  const lift = mValue.sub(base), w = weight.mul(pg);
  const pileFoam = weight.mul(smoothstep(PILE_FOAM_EDGE[0], PILE_FOAM_EDGE[1], pg)).mul(float(1.0).sub(mDA))
    .mul(pc.decay.mul(1 - PILE_FOAM_THIN).add(PILE_FOAM_THIN));
  return {
    eta: base.add(w.mul(lift)),
    foam: max(foam, pileFoam),
    dEtaDAhead: dBase.add(crestWeight.mul(dNear.mul(pg).add(nearC.mul(dg))).mul(lift)).add(w.mul(mDA.sub(1.0)).mul(slopeBase)),
    pile: w.mul(float(1.0).sub(mDA)).mul(T),
  };
}
