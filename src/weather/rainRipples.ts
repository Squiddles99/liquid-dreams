import { float, floor, fract, ivec3, length, max, select, sin, smoothstep, uvec3, vec2 } from 'three/tsl';
import { hash3 } from './cloudNoiseNodes';

type N = any;

/**
 * Rain on the sea (spec 2026-09-30 §4.8, W2 Task 3): each raindrop sends out a ring that spreads to RING_MAX_RADIUS_M
 * and dies within RING_PERIOD_S. The water's shading normal takes the rings' slopes where the rain field says it rains.
 */
export const RING_MAX_RADIUS_M = 0.12;
export const RING_PERIOD_S = 0.8;
/** One drop at most per cell per period; three offset layers of cells. */
export const RING_CELL_M = 0.2;
const RING_WAVELENGTH_M = 0.02;
/** The slope at a young ring's crest. */
const RING_SLOPE = 0.35;

const smoothstepJs = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The slope (along the radius) of a ring `phase` (0..1) through its life, at r metres from where the drop landed. */
export function ringSlope(r: number, phase: number): number {
  const R = phase * RING_MAX_RADIUS_M;
  const w = 0.012 + 0.02 * phase;
  const amp = smoothstepJs(0, 0.08, phase) * (1 - phase) ** 2;
  return RING_SLOPE * amp * Math.exp(-(((r - R) / w) ** 2)) * Math.sin(((2 * Math.PI) / RING_WAVELENGTH_M) * (r - R));
}

function ringSlopeNode(r: N, phase: N): N {
  const R = phase.mul(RING_MAX_RADIUS_M);
  const w = phase.mul(0.02).add(0.012);
  const amp = smoothstep(0.0, 0.08, phase).mul(float(1.0).sub(phase).pow(2.0));
  const x = r.sub(R);
  return amp.mul(RING_SLOPE).mul(x.div(w).pow(2.0).negate().exp()).mul(sin(x.mul((2 * Math.PI) / RING_WAVELENGTH_M)));
}

/**
 * The rings' slope (vec2, world xz) at xz for a rain rate (0..1): the share of cells with a drop each period follows
 * the rate. Exactly 0 when it doesn't rain.
 */
export function rainRipplesNode(xz: N, timeS: N, rate: N): N {
  let slope: N = vec2(0.0);
  for (let layer = 0; layer < 3; layer++) {
    const p = xz.div(RING_CELL_M).add(vec2(layer * 0.37, layer * 0.61));
    const cell: N = floor(p);
    // Negative cells wrap to large uints: still a distinct key per cell.
    const h = hash3(uvec3((ivec3 as N)(cell.x, cell.y, layer)));
    const h2 = hash3(uvec3((ivec3 as N)(cell.x, cell.y, layer + 7)));
    const centre = h.xy.mul(0.6).add(0.2);
    const d = fract(p).sub(centre).mul(RING_CELL_M);
    const r = length(d);
    const phase = fract(timeS.div(RING_PERIOD_S).add(h.z));
    const active = h2.x.lessThan(rate);
    const s = ringSlopeNode(r, phase).mul(select(active, 1.0, 0.0));
    slope = slope.add(d.div(max(r, 1e-4)).mul(s));
  }
  return select(rate.greaterThan(0.0), slope, vec2(0.0));
}
