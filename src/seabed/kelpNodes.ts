import { dot, float, length, max, min, select, tanh, vec2, vec4 } from 'three/tsl';
import { KELP_DAMPING, KELP_FLAT_MS, KELP_MAX_RATE, KELP_PERIOD_S } from './kelp';

type N = any;
const W0 = (2 * Math.PI) / KELP_PERIOD_S;

/** TSL mirror of kelp.kelpSteadyLean. */
export function kelpSteadyLeanNode(u: N): N {
  const s = length(u);
  const r = s.div(KELP_FLAT_MS);
  return select(s.greaterThan(1e-9), u.div(max(s, 1e-9)).mul(tanh(r.mul(r))), vec2(0.0));
}

/** TSL mirror of kelp.kelpStep: vec4(lean.xy, vel.xy) one step of dt toward the steady lean for flow u (vec2). */
export function kelpStepNode(state: N, u: N, dt: N): N {
  const target: N = kelpSteadyLeanNode(u);
  const v0: N = state.zw.add(target.sub(state.xy).mul(W0 * W0).sub(state.zw.mul(2 * KELP_DAMPING * W0)).mul(dt));
  const rate: N = length(v0);
  const v1: N = v0.mul(min(float(1.0), float(KELP_MAX_RATE).div(max(rate, 1e-9))));
  const l0: N = state.xy.add(v1.mul(dt));
  const ll: N = length(l0);
  const over: N = ll.greaterThan(1.0);
  const l1: N = select(over, l0.div(max(ll, 1e-9)), l0);
  const out: N = max(dot(v1, l1), 0.0);
  const v2: N = select(over, v1.sub(l1.mul(out)), v1);
  return vec4(l1, v2);
}
