import { float, length, max, mix, mx_noise_float, smoothstep, vec3 } from 'three/tsl';
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
  return kelpCanopyAlbedoNode(hitPos, rayDir, kelp.leanNode(hitPos.xz), kelp.time, kelp.show);
}

/** kelpWeedAlbedoNode with its lean (vec2), sim time and `show` given: the canopy's look alone (the self-tests drive it). */
export function kelpCanopyAlbedoNode(hitPos: N, rayDir: N, lean: N, time: N, show: N): N {
  const l = length(lean);
  const height = float(KELP_HEIGHT_M).mul(float(1.0).sub(l.mul(KELP_FLATTEN)));
  const top = hitPos.xz.add(kelpParallaxNode(rayDir, height));
  // Plants in clumps about 2 m across, with lit rock between (seen through 6–10 m of water only metre-scale contrast reads:
  // the first in-game look at the frond-scale pattern alone showed no difference from build A).
  const clump = smoothstep(0.4, 0.6, mx_noise_float(vec3(top.x.mul(0.45), top.y.mul(0.45), 3.7)).mul(0.5).add(0.5));
  const density = mix(float(0.25), float(1.0), clump);
  // The fronds, in world space (final review C1: a frame turned and stretched about the world origin, and a flutter rate
  // that scaled absolute sim time by the lean, made the pattern fizz and pop as the lean changed). Each spot's tips reach
  // downstream by the lean (about a metre flat, by a fixed 0.5–1 per spot), so the clumps sway; lying over, the fronds
  // smear along the flow; their flutter runs at a fixed rate, blended in as they lie over. All continuous in lean and time.
  const tip = mx_noise_float(vec3(top.x.mul(1.3), top.y.mul(1.3), 7.1)).mul(0.25).add(0.75);
  const p = top.sub(lean.mul(tip.mul(KELP_HEIGHT_M * 1.2)));
  const smear = p.sub(lean.mul(0.6));
  const frond = (q: N, z: N): N => mx_noise_float(vec3(q.x.mul(1.6), q.y.mul(1.6), z)).mul(0.5).add(0.5);
  const z1 = time.mul(0.8).add(11.3);
  const still = frond(p, float(3.1)).add(frond(smear, float(3.1))).mul(0.5);
  const moving = frond(p, z1).add(frond(smear, z1)).mul(0.5);
  const n = mix(still, moving, l.mul(l).mul(0.5));
  const cover = smoothstep(0.25, 0.45, n.add(density.sub(0.6).mul(0.9)));
  // Upright the crowns are dark; lying flat in the draw their fronds' glossy faces turn up to the light.
  const fronds = vec3(...WEED_ALBEDO).mul(l.mul(0.9).add(0.6));
  const gaps = vec3(...REEF_ALBEDO).mul(KELP_GAP_SHADE);
  return mix(vec3(...WEED_ALBEDO), mix(gaps, fronds, cover), show);
}
