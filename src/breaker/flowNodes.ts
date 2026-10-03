import { clamp, cosh, float, max, min, sinh, sqrt, vec2 } from 'three/tsl';
import { GRAVITY } from '../ocean/spectrum';
import { FLOW_MIN_DEPTH_M } from './flow';
import type { SetWaves } from './SetWaves';

type N = any;

/** TSL mirror of flow.flowFromEta: vec2 (m/s, world xz) for η over depth h at height y, along `dir`. */
export function flowFromEtaNode(eta: N, k: N, depth: N, dir: N, omega: N, y: N): N {
  const h = max(depth, FLOW_MIN_DEPTH_M);
  const kh = max(k.mul(h), 1e-3), kk = kh.div(h);
  const yc = clamp(y, h.negate(), 0.0);
  const gain = omega.mul(cosh(kk.mul(h.add(yc)))).div(sinh(kh));
  const cap = sqrt(max(depth.add(eta), FLOW_MIN_DEPTH_M).mul(GRAVITY));
  const u = clamp(eta.mul(gain), cap.negate(), cap);
  return vec2(dir.x.mul(u), dir.y.mul(u));
}

/**
 * The flow at world xz, `heightAboveBed` metres over the still-water bed (flow.flowAt on the GPU): the set waves' surface
 * (the probe's displacementNode, breaking included) plus the background swell's η where it runs. Compute-safe.
 */
export class ReefFlow {
  constructor(private readonly sets: SetWaves, private readonly background?: (xz: N) => N) {}

  flowNode(xz: N, heightAboveBed: number | N): N {
    const s = this.sets.sample(xz, true);
    const eta = this.sets.displacementNode(xz).y.add(this.background ? this.background(xz) : float(0.0));
    const y = s.depth.negate().add(heightAboveBed);
    return flowFromEtaNode(eta, s.k, s.depth, s.dir, this.sets.omega, min(y, 0.0));
  }
}
