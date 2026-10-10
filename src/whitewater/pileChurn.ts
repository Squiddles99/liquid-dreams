import { Fn, If, clamp, float, max, mx_noise_float, smoothstep, vec2, vec3 } from 'three/tsl';
import { boreWeight, flightTime, sectionEnd } from '../breaker/wombSection';
import { smoothstep as smoothstepCpu } from '../math/smoothstep';

type N = any;

/**
 * The whitewater's churn (spec 2026-09-29 §3.3; re-gated by whitewater §3.2): lumps on the ribbon's broken section,
 * rolling with the wave (read in its crest frame, SetWaves' foamFrame: m behind the crest, m along it) and changing over
 * time, up to ± churnSize × the boil (boilWeight × A), half again ahead of the crest line. Render detail like the FFT chop:
 * the ride never reads it; the ribbon adds it in its vertex stage and its slope to its shading normal.
 */
/** The lumps: this many cycles per metre in the crest frame (about 2 m across)… */
export const CHURN_SCALE_PER_M = 0.5;
/** …churning at this many cycles per second × churnSpeed. */
export const CHURN_RATE_PER_S = 0.5;
/** The slope's finite-difference half step (m). */
const SLOPE_STEP_M = 0.2;

function churnNoise(p: N, time: N, speed: N): N {
  const t = time.mul(speed).mul(CHURN_RATE_PER_S);
  const n1 = mx_noise_float(vec3(p.x.mul(CHURN_SCALE_PER_M), p.y.mul(CHURN_SCALE_PER_M), t));
  const n2 = mx_noise_float(vec3(p.x.mul(CHURN_SCALE_PER_M * 2.3).add(7.1), p.y.mul(CHURN_SCALE_PER_M * 2.3), t.mul(1.7)));
  // The blend's typical swing is about ±0.3: × 1.7 spreads it over ±1 (clamped, so the lumps stay within their bound).
  return clamp(n1.mul(0.7).add(n2.mul(0.3)).mul(1.7), -1.0, 1.0);
}

/** The boil is a low simmer by ~50 m behind the landing (the bore's speed × this). */
export const CHURN_FADE_S = 6;

/** The ribbon's boil at a station [0, 1]: the section's bore weight × the fresh foam there, fading over CHURN_FADE_S after
 * the lip lands (τ_land = flightTime(H): the round barrel). The ribbon packs boilWeight(…, foam 1) per station on the CPU
 * (packStations) and multiplies it on the GPU by the fresh foam at the vertex and by A, for the churn's height. */
export function boilWeight(tb: number | null, H: number, periodS: number, foam: number): number {
  if (tb === null || !(foam > 0)) return 0;
  const age = tb - flightTime(H);
  if (!(age >= 0)) return 0;
  return boreWeight(tb, H, periodS) * Math.min(1, foam) * (1 - smoothstepCpu(0, CHURN_FADE_S, age));
}

/** Fresh boil is solid white (whitewater F3): the foam pattern's weight on a fresh boil is lifted to this (the lace's holes
 * close from ~0.75, setFoamPattern), × the boil's freshness (boilFreshness), so the lace returns as the boil ages. */
export const FRESH_BOIL_WEIGHT = 0.9;
/** The boil turns solid over this long after the landing (F6): a short gradient along the crest from the held tube, not a
 * cliff; the impact's particles cover it. */
export const FRESH_RISE_S = 0.5;
/** After the white-water wall (sectionEnd) the boil's freshness fades over this long: the lace is back on the sheet. */
export const FRESH_FADE_S = 2;
/** How fresh the boil is at a station [0, 1]: 0 before the lip lands (τ_land = flightTime(H)), up over FRESH_RISE_S, 1 through
 * the ribbon's broken life (to sectionEnd: a peeling section up the line is seconds older than the curl, and stays solid),
 * 0 FRESH_FADE_S after it (and long after: tb Infinity). Packed per station (packStations). */
export function boilFreshness(tb: number | null, H: number, periodS: number): number {
  if (tb === null || !Number.isFinite(tb)) return 0;
  const land = flightTime(H), end = sectionEnd(H, periodS);
  return smoothstepCpu(land, land + FRESH_RISE_S, tb) * (1 - smoothstepCpu(end, end + FRESH_FADE_S, tb));
}
/** The foam pattern's weight on the ribbon: the foam, lifted to FRESH_BOIL_WEIGHT × the freshness where there is foam
 * (from 0.1, full at 0.3): never paints foam where there is none, never lowers it. */
export function freshFoamWeight(foam: number, fresh: number): number {
  return Math.max(foam, FRESH_BOIL_WEIGHT * fresh * smoothstepCpu(0.1, 0.3, foam));
}
export function freshFoamWeightNode(foam: N, fresh: N): N {
  return max(foam, fresh.mul(FRESH_BOIL_WEIGHT).mul(smoothstep(0.1, 0.3, foam)));
}

/** How solid the boil is (7b S3): the freshness where there is foam (the same gate as freshFoamWeight). On the ribbon it
 * fills the lace's holes (they stood as dark vertical bars down the mound's face: the pattern's long axis runs down it) and
 * ends the clean tube's hiding of the sheet's foam (the tube has caved in). */
export function solidBoil(fresh: number, foam: number): number {
  return fresh * smoothstepCpu(0.1, 0.3, foam);
}
export function solidBoilNode(fresh: N, foam: N): N {
  return fresh.mul(smoothstep(0.1, 0.3, foam));
}
/** The foam volume's bubble mottle (7b S3): ~BUBBLE_MOTTLE_M blobs, ±BUBBLE_MOTTLE_AMP of its brightness, so the solid
 * boil is not plaster. */
export const BUBBLE_MOTTLE_M = 0.3, BUBBLE_MOTTLE_AMP = 0.15;
/** The mottle's brightness factor at developed coordinates `uv` (m): 1 ± BUBBLE_MOTTLE_AMP, drifting slowly. */
export function bubbleMottleNode(uv: N, time: N): N {
  return mx_noise_float(vec3(uv.div(BUBBLE_MOTTLE_M), time.mul(0.4))).mul(BUBBLE_MOTTLE_AMP).add(1.0);
}

/** The lumps within 2 m ahead of the crest line stand half again as tall: the front steeper than the back. */
const frontLean = (frame: N): N => smoothstep(0.0, 2.0, frame.x.negate()).mul(0.5).add(1.0);
const churnAt = (boil: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N => churnNoise(frame, time, u.churnSpeed).mul(boil).mul(u.churnSize).mul(frontLean(frame));

/** The churn's height (m) for a boil `boil` m (boilWeight × A): 0 off the boil. */
export function churnHeightNode(boil: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const h = float(0.0).toVar();
    If(boil.greaterThan(1e-3), () => { h.assign(churnAt(boil, frame, time, u)); });
    return h;
  })();
}

/**
 * The churn's world slope (∂h/∂x, ∂h/∂z), the boil held constant: central differences in the crest frame, turned to world
 * axes by the wave's travel `travel` (the frame's x runs back against it, its y across it: SetWaves' foamFrame).
 */
export function churnSlopeNode(boil: N, frame: N, travel: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const s = vec2(0.0).toVar();
    If(boil.greaterThan(1e-3), () => {
      const e = SLOPE_STEP_M;
      const gx = churnAt(boil, frame.add(vec2(e, 0.0)), time, u).sub(churnAt(boil, frame.sub(vec2(e, 0.0)), time, u)).div(2 * e);
      const gy = churnAt(boil, frame.add(vec2(0.0, e)), time, u).sub(churnAt(boil, frame.sub(vec2(0.0, e)), time, u)).div(2 * e);
      const across = vec2(travel.y.negate(), travel.x);
      s.assign(travel.mul(gx.negate()).add(across.mul(gy)));
    });
    return s;
  })();
}
