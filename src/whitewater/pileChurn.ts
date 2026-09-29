import { Fn, If, clamp, float, mx_noise_float, vec2, vec3 } from 'three/tsl';

type N = any;

/**
 * The whitewater pile's churn (spec 2026-09-29 §3.3): lumps on the pile's top, rolling with the wave (read in its crest
 * frame, SetWaves' foamFrame: m behind the crest, m along it) and changing over time, up to ± half of churnSize × the
 * pile's height. Render detail like the FFT chop: the height probe reads the smooth pile; the sheet and the ribbon add
 * this in their vertex stages and its slope to their shading normals.
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

/** The churn's height (m) for a pile `pile` m high: 0 off the pile. */
export function churnHeightNode(pile: N, frame: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const h = float(0.0).toVar();
    If(pile.greaterThan(1e-3), () => { h.assign(churnNoise(frame, time, u.churnSpeed).mul(pile).mul(u.churnSize).mul(0.5)); });
    return h;
  })();
}

/**
 * The churn's world slope (∂h/∂x, ∂h/∂z), the pile's height held constant (its own slope is in SetWaves' analytic
 * slope): central differences in the crest frame, turned to world axes by the wave's travel `travel` (the frame's x runs
 * back against it, its y across it: SetWaves' foamFrame).
 */
export function churnSlopeNode(pile: N, frame: N, travel: N, time: N, u: { churnSize: N; churnSpeed: N }): N {
  return Fn(() => {
    const s = vec2(0.0).toVar();
    If(pile.greaterThan(1e-3), () => {
      const e = SLOPE_STEP_M;
      const gx = churnNoise(frame.add(vec2(e, 0.0)), time, u.churnSpeed).sub(churnNoise(frame.sub(vec2(e, 0.0)), time, u.churnSpeed)).div(2 * e);
      const gy = churnNoise(frame.add(vec2(0.0, e)), time, u.churnSpeed).sub(churnNoise(frame.sub(vec2(0.0, e)), time, u.churnSpeed)).div(2 * e);
      const across = vec2(travel.y.negate(), travel.x);
      s.assign(travel.mul(gx.negate()).add(across.mul(gy)).mul(pile.mul(u.churnSize).mul(0.5)));
    });
    return s;
  })();
}
