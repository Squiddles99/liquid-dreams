import { abs, cameraPosition, dot, exp, float, length, max, min, mix, select, smoothstep, uniform } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { type FoamGrid, bilinearFoam } from './foamStep';
import { mistLightNode } from './mistLight';
import { PLUME_WIND_MS, SURGE_RISE } from './sprayEmitters';

type N = any;

/**
 * The mist slab (whitewater spec §6.1): the foam map's third channel is mist density, written where a lip lands (× the
 * surge) and where the plume is born (× the offshore wind), decaying in ~MIST_DECAY_S and riding the wind. Every material
 * near the water reads it once at its xz and fogs through a slab MIST_SLAB_A × A deep over the sea. CPU reference here;
 * FoamField steps the channel on the GPU, mistSlabNode fogs.
 */
export const MIST_DECAY_S = 3, MIST_SLAB_A = 1.5, MIST_SIGMA = 0.35;
/** The mist rides this × the wind vector (more than the foam's WIND_DRIFT_SHARE: it is in the air). */
export const MIST_WIND_SHARE = 0.3;
/** A landing makes mist from τ_land + [0] to τ_land + [1] s (after the curtain lands clean: IMPACT_DELAY_S). */
export const MIST_LAND_WINDOW_S: readonly [number, number] = [0.2, 1.2];
/** The source's shares: of the landing's foam (× (1 + SURGE_RISE × hollow), so a pitching lip fills it) and of the
 * throwing lip's foam (× smoothstep(PLUME_WIND_MS, w_off): the plume's mist). */
export const MIST_IMPACT_SHARE = 0.5, MIST_PLUME_SHARE = 1;
/** A level ray crosses the slab as if at this elevation (sin), and never more than MIST_PATH_MAX_M. */
export const MIST_GRAZE = 0.05, MIST_PATH_MAX_M = 60;

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The slab's depth above a point at height y (m) over a sea at seaY with the set's scale A: MIST_SLAB_A × A less the
 * point's own height in it, ≥ 0 (a point under the sea sees the whole slab). */
export function slabDepth(y: number, seaY: number, A: number): number {
  return Math.max(0, MIST_SLAB_A * A - Math.max(0, y - seaY));
}

/** Transmittance through the slab to a point: exp(−MIST_SIGMA × d × path), path = min(h / max(|sinE|, MIST_GRAZE),
 * MIST_PATH_MAX_M, the eye's distance). Exactly 1 at d 0. */
export function mistTransmittance(d: number, h: number, sinE: number, distM: number): number {
  return Math.exp(-MIST_SIGMA * d * Math.min(h / Math.max(Math.abs(sinE), MIST_GRAZE), MIST_PATH_MAX_M, distM));
}

/** The landing's mist weight at a point tb s after its onset, its lip landing at τ_land (flightTime): (1 + SURGE_RISE ×
 * hollow) inside MIST_LAND_WINDOW_S after the landing, else 0. SetWaves' sum mirrors it (its `land` output). */
export function landingMist(tb: number, tauLand: number, hollow: number): number {
  const t = tb - tauLand;
  return t >= MIST_LAND_WINDOW_S[0] && t < MIST_LAND_WINDOW_S[1] ? 1 + SURGE_RISE * hollow : 0;
}

/** A texel's mist source from the sum's landing foam (`land`: foam × landingMist) and the throwing lip's foam (`lip`), the
 * wave's unit travel `dir` and the wind vector (m/s, toward): ≤ 1; the plume share 0 under PLUME_WIND_MS[0] offshore. */
export function mistSource(land: number, lip: number, dir: readonly [number, number], wind: readonly [number, number]): number {
  const wOff = -(wind[0] * dir[0] + wind[1] * dir[1]);
  return Math.min(1, MIST_IMPACT_SHARE * land + MIST_PLUME_SHARE * sstep(PLUME_WIND_MS[0], PLUME_WIND_MS[1], wOff) * lip);
}

/** One texel's mist over dt: exp(−dt / MIST_DECAY_S) (exact over any dt), then max-inject the source. */
export function decayMist(m: number, source: number, dtS: number): number {
  return Math.max(m * Math.exp(-dtS / MIST_DECAY_S), source);
}

/** What the mist is made from: the sum's (land, lip) at (x, z, t), the wave's travel there and the wind (absent calm). */
export interface MistSourceCpu {
  mist(x: number, z: number, t: number): [number, number];
  dir(x: number, z: number): [number, number];
  wind?: readonly [number, number];
}

/** One step of the mist channel (one float per texel) ending at sim time t: carried by MIST_WIND_SHARE of the wind
 * (read upstream, bilinear), decayed, injected. FoamField's step pass mirrors it in the map's third channel. */
export function stepMist(prev: Float32Array, g: FoamGrid, t: number, dtS: number, src: MistSourceCpu): Float32Array<ArrayBuffer> {
  const out = new Float32Array(prev.length);
  const wind = src.wind ?? [0, 0];
  const ux = wind[0] * MIST_WIND_SHARE * dtS, uz = wind[1] * MIST_WIND_SHARE * dtS;
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
    const x = g.x0 + (c + 0.5) * g.cellM, z = g.z0 + (r + 0.5) * g.cellM;
    const [land, lip] = src.mist(x, z, t);
    out[r * g.nx + c] = decayMist(bilinearFoam(prev, g, x - ux, z - uz), mistSource(land, lip, src.dir(x, z), wind), dtS);
  }
  return out;
}

/** mistSource in TSL (FoamField's step). */
export function mistSourceNode(land: N, lip: N, dir: N, wind: N): N {
  const wOff = dot(wind, dir).negate();
  return min(float(land).mul(MIST_IMPACT_SHARE).add(smoothstep(PLUME_WIND_MS[0], PLUME_WIND_MS[1], wOff).mul(lip).mul(MIST_PLUME_SHARE)), 1.0);
}

/** landingMist in TSL (SetWaves' sum): tb s after onset, τ_land = flightTime. */
export function landingMistNode(tb: N, tauLand: N, hollow: N): N {
  const t = tb.sub(tauLand);
  return select(t.greaterThanEqual(MIST_LAND_WINDOW_S[0]).and(t.lessThan(MIST_LAND_WINDOW_S[1])), float(hollow).mul(SURGE_RISE).add(1.0), float(0.0));
}

/** Where the materials find the mist: the foam map's sample (density in `.mist`) and the sea's height. */
export interface MistMap {
  sampleNode(xz: N): { mist: N; inside: N };
}

/**
 * The slab every near-water material applies (whitewater §6.1) to its lit colour at worldPos, before the aerial
 * perspective (the mist sits at the point; the air lies between it and the eye): mix(mistLight, colour, T) with T =
 * mistTransmittance. The light is §6.3's one light, backlit glow and all. `A` is the set's mean scale (the App sets it per
 * frame; the slab's height is a look, not a measurement). Exactly the colour where the map holds no mist.
 */
export class MistSlab {
  /** The set's mean scale A (m). */
  readonly A = uniform(1);

  constructor(private readonly map: MistMap, private readonly seaY: N, private readonly sky: Sky) {}

  apply(colour: N, worldPos: N, sunVisibility: N = float(1.0)): N {
    const d = this.map.sampleNode(worldPos.xz);
    const toPoint = worldPos.sub(cameraPosition);
    const dist = length(toPoint);
    const ray = toPoint.div(max(dist, 1e-3));
    const h = max(this.A.mul(MIST_SLAB_A).sub(max(worldPos.y.sub(this.seaY), 0.0)), 0.0);
    const path = min(min(h.div(max(abs(ray.y), MIST_GRAZE)), MIST_PATH_MAX_M), dist);
    const T = exp(d.mist.mul(d.inside).mul(path).mul(-MIST_SIGMA));
    const light = mistLightNode({ cosView: dot(ray, this.sky.sunDirection), nDotL: float(1.0), sunVisibility, isotropic: float(0.5), groundColour: colour }, this.sky);
    return mix(light, colour, T);
  }
}
