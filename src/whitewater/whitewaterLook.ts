import * as THREE from 'three/webgpu';
import { float, max, mix, smoothstep, uniform } from 'three/tsl';
import { smoothstep as smoothstepCpu } from '../math/smoothstep';
import { BORE_PUSH } from './foamStep';

type N = any;

/**
 * The white-water wall's look (breaking-look spec item 1), one shared rule for whichever surface draws it (the ribbon's
 * overhang, the sheet's bore): references task8/reference-back, reference-womb-1/2 — the top the brightest thing in frame,
 * lit by the sun on its billows' sides even at a low sun (multiple scattering); the base shadowed blue-grey, turquoise where
 * it thins; clumps (~0.5 m) varying the cover and the brightness.
 *
 * heightFrac = (y − tide) / the bore's height (boreLook.height: the tallest boiling station's A). The base is the low,
 * steep part of the wall (heightFrac under WW_BASE_FRAC and a normal far from up): flat bore foam seen from above is lit
 * from above and stays bright. CPU references; the nodes mirror them.
 */
export const WW_BASE_FRAC: readonly [number, number] = [0.2, 0.35];
/** The base's steepness gate: 1 − n.y from [0] (none) to [1] (all). */
export const WW_BASE_STEEP: readonly [number, number] = [0.3, 0.7];
/** At the base: the sky's and the sun's shares and the cover (so the water column's turquoise shows through). */
export const WW_BASE_SKY = 0.6, WW_BASE_SUN = 0.5, WW_BASE_COVER = 0.7;
/** The volume's isotropic share (mistLight): the base's single scattering → the top's multiple scattering. */
export const WW_ISOTROPIC: readonly [number, number] = [0.6, 0.8];
/** The clumps (billow.clump, the 0.8 m octave) vary the cover and the brightness over these ranges. */
export const WW_CLUMP_COVER: readonly [number, number] = [0.85, 1], WW_CLUMP_BRIGHT: readonly [number, number] = [0.85, 1.1];
/** The bore's height never reads under this (m): a tiny boil would make every point a "top". */
export const WW_MIN_BORE_M = 0.3;

export function heightFrac(y: number, tide: number, boreH: number): number {
  return (y - tide) / Math.max(boreH, WW_MIN_BORE_M);
}
export function heightFracNode(y: N, tide: N, boreH: N): N {
  return float(y).sub(tide).div(max(boreH, WW_MIN_BORE_M));
}

export interface WallShade { base: number; skyMul: number; sunMul: number; coverMul: number; isotropic: number; bright: number }

/** The wall's shade at heightFrac `hf`, the surface normal's up component `ny` and the clumps `clump` ∈ [0, 1]. */
export function wallShade(hf: number, ny: number, clump: number): WallShade {
  const base = (1 - smoothstepCpu(WW_BASE_FRAC[0], WW_BASE_FRAC[1], hf)) * smoothstepCpu(WW_BASE_STEEP[0], WW_BASE_STEEP[1], 1 - ny);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return {
    base,
    skyMul: lerp(1, WW_BASE_SKY, base),
    sunMul: lerp(1, WW_BASE_SUN, base),
    coverMul: lerp(1, WW_BASE_COVER, base) * lerp(WW_CLUMP_COVER[0], WW_CLUMP_COVER[1], clump),
    isotropic: lerp(WW_ISOTROPIC[1], WW_ISOTROPIC[0], base),
    bright: lerp(WW_CLUMP_BRIGHT[0], WW_CLUMP_BRIGHT[1], clump),
  };
}

export function wallShadeNode(hf: N, ny: N, clump: N): { base: N; skyMul: N; sunMul: N; coverMul: N; isotropic: N; bright: N } {
  const base = float(1.0).sub(smoothstep(WW_BASE_FRAC[0], WW_BASE_FRAC[1], hf)).mul(smoothstep(WW_BASE_STEEP[0], WW_BASE_STEEP[1], float(1.0).sub(ny)));
  return {
    base,
    skyMul: mix(float(1.0), float(WW_BASE_SKY), base),
    sunMul: mix(float(1.0), float(WW_BASE_SUN), base),
    coverMul: mix(float(1.0), float(WW_BASE_COVER), base).mul(mix(float(WW_CLUMP_COVER[0]), float(WW_CLUMP_COVER[1]), clump)),
    isotropic: mix(float(WW_ISOTROPIC[1]), float(WW_ISOTROPIC[0]), base),
    bright: mix(float(WW_CLUMP_BRIGHT[0]), float(WW_CLUMP_BRIGHT[1]), clump),
  };
}

/** What the look needs of a station (BreakingRibbon's Station). */
export interface BoreStation { nx: number; nz: number; c: number; A: number; boil: number }

/**
 * The bore this frame, from the ribbon's stations: its height (the tallest boiling station's A; else the tallest) and its
 * flow (m/s, world xyz): the boiling stations' mean travel × their mean c × BORE_PUSH (the foam map's bore push), so the
 * billows move as the map's foam does.
 */
export function boreFromStations(st: readonly BoreStation[]): { height: number; flow: [number, number, number] } {
  const boiling = st.filter((s) => s.boil > 1e-3);
  const use = boiling.length ? boiling : st;
  if (!use.length) return { height: 1, flow: [0, 0, 0] };
  let nx = 0, nz = 0, c = 0, h = 0;
  for (const s of use) { nx += s.nx; nz += s.nz; c += s.c; h = Math.max(h, s.A); }
  const len = Math.hypot(nx, nz) || 1, speed = (c / use.length) * BORE_PUSH * (boiling.length ? 1 : 0);
  return { height: h, flow: [(nx / len) * speed, 0, (nz / len) * speed] };
}

/** The shared uniforms (one bore per frame; the ribbon writes them in setStations, both surfaces read them). */
export const boreLook = {
  height: uniform(1),
  flow: uniform(new THREE.Vector3()),
};
