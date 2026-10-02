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
  // Beds about 5 m across.
  const clump = smoothstep(0.35, 0.65, mx_noise_float(vec3(top.x.mul(0.18), top.y.mul(0.18), 3.7)).mul(0.5).add(0.5));
  const density = mix(float(0.55), float(1.0), clump);
  // The fronds' frame: along the lean (x when upright), stretched with it; the tips move downstream.
  const dir = select(l.greaterThan(1e-4), lean.div(max(l, 1e-4)), vec2(1.0, 0.0));
  const p = top.sub(lean.mul(KELP_HEIGHT_M * 0.6));
  const along = dot(p, dir).div(l.mul(2.0).add(1.0));
  const across = dot(p, vec2(dir.y.negate(), dir.x));
  const flutter = kelp.time.mul(l.mul(l).mul(1.5).add(0.2));
  const n = mx_noise_float(vec3(along.mul(2.2), across.mul(4.5), flutter)).mul(0.5).add(0.5);
  const cover = smoothstep(0.3, 0.45, n.add(density.sub(0.75).mul(0.5)));
  const fronds = vec3(...WEED_ALBEDO).mul(l.mul(0.3).add(0.85));
  const gaps = vec3(...REEF_ALBEDO).mul(KELP_GAP_SHADE);
  return mix(vec3(...WEED_ALBEDO), mix(gaps, fronds, cover), kelp.show);
}
