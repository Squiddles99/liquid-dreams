import * as THREE from 'three/webgpu';
import { Fn, If, float, length, max, mix, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import { KELP_GAP_SHADE, REEF_ALBEDO, WEED_ALBEDO } from './bedLook';
import { KELP_FLATTEN, KELP_HEIGHT_M, KELP_NOISE_CELLS } from './kelp';
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
export function kelpWeedAlbedoNode(hitPos: N, rayDir: N, kelp: KelpMap, weed: N | number = 1): N {
  // Drawn only on weed inside the lean window, the 128 m around the camera (final review I3: over every bed pixel to
  // the horizon it cost ~3 ms a frame, and through 60+ m of water it can't be read); elsewhere build A's weed, the same
  // mean tone.
  return Fn(() => {
    const out = vec3(...WEED_ALBEDO).toVar();
    If(kelp.show.greaterThan(0.5).and(float(weed).greaterThan(0.01)).and(kelp.insideNode(hitPos.xz)), () => {
      out.assign(kelpCanopyAlbedoNode(hitPos, rayDir, kelp.leanNode(hitPos.xz), kelp.time, kelp.show, kelp.noise));
    });
    return out;
  })();
}

/** kelpWeedAlbedoNode with its lean (vec2), sim time and `show` given: the canopy's look alone (the self-tests drive it). */
export function kelpCanopyAlbedoNode(hitPos: N, rayDir: N, lean: N, time: N, show: N, noise: THREE.Texture): N {
  // The baked noise (KelpMap.noise): channel c at world xz, `perM` features a metre.
  const nz = (xz: N, perM: number): N => texture(noise, xz.mul(perM / KELP_NOISE_CELLS)).level(float(0)); // three typings gap: level() wants a node
  const l = length(lean);
  const height = float(KELP_HEIGHT_M).mul(float(1.0).sub(l.mul(KELP_FLATTEN)));
  const top = hitPos.xz.add(kelpParallaxNode(rayDir, height));
  // Plants in clumps about 2 m across, with lit rock between (seen through 6–10 m of water only metre-scale contrast reads:
  // the first in-game look at the frond-scale pattern alone showed no difference from build A).
  const clump = smoothstep(0.4, 0.6, nz(top, 0.45).x);
  const density = mix(float(0.25), float(1.0), clump);
  // The fronds, in world space (final review C1: a frame turned and stretched about the world origin, and a flutter rate
  // that scaled absolute sim time by the lean, made the pattern fizz and pop as the lean changed). Each spot's tips reach
  // downstream by the lean (about a metre flat, by a fixed 0.5–1 per spot), so the clumps sway; lying over, the fronds
  // smear along the flow; their flutter runs at a fixed rate, blended in as they lie over. All continuous in lean and time.
  const tip = nz(top, 1.3).y.mul(0.5).add(0.5);
  const p = top.sub(lean.mul(tip.mul(KELP_HEIGHT_M * 1.2)));
  const smear = p.sub(lean.mul(0.6));
  // The fronds' still pattern, and their flutter drifting through it at a fixed rate.
  const drift = vec2(time.mul(0.25), time.mul(0.15));
  const still = nz(p, 1.6).z.add(nz(smear, 1.6).z).mul(0.5);
  const moving = nz(p.add(drift), 1.6).w.add(nz(smear.add(drift), 1.6).w).mul(0.5);
  const n = mix(still, moving, l.mul(l).mul(0.5));
  const cover = smoothstep(0.25, 0.45, n.add(density.sub(0.6).mul(0.9)));
  // Upright the crowns are dark; lying flat in the draw their fronds' glossy faces turn up to the light.
  const fronds = vec3(...WEED_ALBEDO).mul(l.mul(0.9).add(0.6));
  const gaps = vec3(...REEF_ALBEDO).mul(KELP_GAP_SHADE);
  return mix(vec3(...WEED_ALBEDO), mix(gaps, fronds, cover), show);
}
