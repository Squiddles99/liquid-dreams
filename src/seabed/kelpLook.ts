import { dot, float, length, max, mix, mx_noise_float, select, smoothstep, vec2, vec3 } from 'three/tsl';
import { KELP_GAP_SHADE, REEF_ALBEDO, WEED_ALBEDO } from './bedLook';
import { KELP_FLATTEN, KELP_HEIGHT_M } from './kelp';
import type { KelpMap } from './KelpMap';

type N = any;

/** A ray this close to level is treated as this steep for the canopy's parallax: the shift stays ≤ height / 0.3 (Review Focus 3). */
export const KELP_MIN_DOWN = 0.3;

/** Where the ray met the canopy's top before the bed: −dir.xz · height / max(−dir.y, KELP_MIN_DOWN). */
export function kelpParallaxNode(rayDir: N, height: N | number): N {
  return rayDir.xz.negate().mul(float(height).div(max(rayDir.y.negate(), KELP_MIN_DOWN)));
}

/**
 * The weedy bed's albedo with the kelp canopy on it (spec §4.2): fronds streaming along the lean, in clumped beds,
 * over the rock in their shade; lying lower, stretched and brighter as they lean; fluttering in strong flow. `show` 0
 * gives build A's WEED_ALBEDO exactly (Review Focus 4).
 */
export function kelpWeedAlbedoNode(hitPos: N, rayDir: N, kelp: KelpMap): N {
  const lean = kelp.leanNode(hitPos.xz);
  const l = length(lean);
  const height = float(KELP_HEIGHT_M).mul(float(1.0).sub(l.mul(KELP_FLATTEN)));
  const top = hitPos.xz.add(kelpParallaxNode(rayDir, height));
  // Plants in clumps about 2 m across, with lit rock between (seen through 6–10 m of water only metre-scale contrast reads:
  // the first in-game look at the frond-scale pattern alone showed no difference from build A).
  const clump = smoothstep(0.4, 0.6, mx_noise_float(vec3(top.x.mul(0.45), top.y.mul(0.45), 3.7)).mul(0.5).add(0.5));
  const density = mix(float(0.25), float(1.0), clump);
  // The fronds' frame: along the lean (x when upright), stretched with it; the whole canopy's pattern moves downstream
  // with the tips (about a metre flat), so the clumps visibly sway.
  const dir = select(l.greaterThan(1e-4), lean.div(max(l, 1e-4)), vec2(1.0, 0.0));
  const p = top.sub(lean.mul(KELP_HEIGHT_M * 1.2));
  const along = dot(p, dir).div(l.mul(2.0).add(1.0));
  const across = dot(p, vec2(dir.y.negate(), dir.x));
  const flutter = kelp.time.mul(l.mul(l).mul(1.5).add(0.2));
  const n = mx_noise_float(vec3(along.mul(1.0), across.mul(2.2), flutter)).mul(0.5).add(0.5);
  const cover = smoothstep(0.25, 0.45, n.add(density.sub(0.6).mul(0.9)));
  // Upright the crowns are dark; lying flat in the draw their fronds' glossy faces turn up to the light.
  const fronds = vec3(...WEED_ALBEDO).mul(l.mul(0.9).add(0.6));
  const gaps = vec3(...REEF_ALBEDO).mul(KELP_GAP_SHADE);
  return mix(vec3(...WEED_ALBEDO), mix(gaps, fronds, cover), kelp.show);
}
