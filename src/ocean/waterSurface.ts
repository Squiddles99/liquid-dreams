import { float, max, smoothstep, texture, uniform, vec3 } from 'three/tsl';
import type { SetWaves } from '../breaker/SetWaves';
import { SEABED_CLEARANCE_M } from '../breaker/setWaveModel';
import type { Seabed } from '../seabed/Seabed';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';

type N = any;

export interface ShallowSwellParams {
  /** The FFT's long-swell cascade is gone in water shallower than this… */
  fadeFromM: number;
  /** …and at full strength deeper than this. */
  fadeToM: number;
}

export const DEFAULT_SHALLOW_SWELL: ShallowSwellParams = { fadeFromM: 6, fadeToM: 14 };

/** The index of the FFT cascade that carries the long swell (3000 m patch). */
const LONG_SWELL_CASCADE = 0;

/**
 * The water surface, defined once: FFT background (long swell faded over shallow water) + reef-shaped set waves,
 * on the tide. The rendered mesh and the height probe both use it.
 */
export class WaterSurfaceModel {
  private readonly fadeFrom = uniform(DEFAULT_SHALLOW_SWELL.fadeFromM);
  private readonly fadeTo = uniform(DEFAULT_SHALLOW_SWELL.fadeToM);

  constructor(readonly sim: OceanSimulation, readonly seabed: Seabed, readonly sets: SetWaves) {}

  setParams(p: ShallowSwellParams): void {
    this.fadeFrom.value = Math.min(p.fadeFromM, p.fadeToM - 0.1);
    this.fadeTo.value = p.fadeToM;
  }

  /** Weight of the FFT long swell: over the reef the set waves carry the swell instead. */
  swellWeight(xz: N): N {
    return smoothstep(this.fadeFrom, this.fadeTo, this.seabed.swellDepthNode(xz));
  }

  private cascadeWeight(xz: N, c: number): N {
    return c === LONG_SWELL_CASCADE ? this.swellWeight(xz) : float(1.0);
  }

  /**
   * vec3 displacement at undisplaced world xz, relative to the tide level. `lod` adds the render's distance fades. The
   * set waves here are the one sheet (Phase 1, the front sharpening, the drain and the bore): the render draws it and
   * the height probe reads it. The total height is clamped above the seabed (clampToSeabed). `pile` false: without the
   * whitewater pile (the breaking ribbon's frame reads the wave as it stood).
   */
  displacement(xz: N, lod: (cascade: number) => N = () => float(1.0), pile = true): N {
    return this.clampToSeabed(xz, this.fftDisplacement(xz, lod).add(this.sets.displacementNode(xz, pile)));
  }

  /**
   * Render path only, vertex stage: the same surface as displacement(), plus the set waves' analytic slope, foam weight
   * and foam wave frame assigned to `out`'s varyings (vec2, float, vec2 varyingProperty nodes). The probe uses
   * displacement(). Never call this from a compute shader.
   */
  displacementWithSetFoam(xz: N, lod: (cascade: number) => N, out: { slope: N; foam: N; foamFrame: N; pile?: N }): N {
    return this.clampToSeabed(xz, this.fftDisplacement(xz, lod).add(this.sets.displacementWithSetFoamNode(xz, out)));
  }

  /**
   * The total surface (FFT chop + set waves) never goes below SEABED_CLEARANCE_M over the bed: η ≥ 0.05 − still-water
   * depth at the undisplaced xz, on the probe and the render alike. SetWaves already clamps the set-wave sum (the CPU
   * model's clamp); this second clamp stops the FFT chop, which only loses its long-swell cascade over the reef, from
   * poking the mesh through a reef flat where the set-wave clamp engages. There is no CPU mirror: the CPU model has no
   * FFT. Compute-safe (the seabed samples at an explicit LOD).
   */
  private clampToSeabed(xz: N, d: N): N {
    return vec3(d.x, max(d.y, float(SEABED_CLEARANCE_M).sub(this.seabed.swellDepthNode(xz))), d.z);
  }

  /**
   * One FFT cascade's vec3 displacement at undisplaced world xz, with its weight (the long swell faded over shallow
   * water) and the caller's `lod` fade applied. Compute-safe (explicit LOD).
   */
  fftCascadeDisplacement(xz: N, cascade: number, lod: N): N {
    const size = this.sim.sizes[cascade];
    const s = texture(this.sim.displacement[cascade], xz.div(size)).level(float(0)).xyz; // three typings gap: level() wants a node
    return s.mul(this.cascadeWeight(xz, cascade)).mul(lod);
  }

  private fftDisplacement(xz: N, lod: (cascade: number) => N): N {
    let d: N = vec3(0.0);
    this.sim.sizes.forEach((_, c) => {
      d = d.add(this.fftCascadeDisplacement(xz, c, lod(c)));
    });
    return d;
  }

  /**
   * FFT slopes/Jacobian terms and foam at xz, with the render's normal fades by distance; set waves added separately.
   * `scale` (optional) weights a cascade further, like the long swell's fade: the breaking ribbon removes the chop over
   * its lip, and a cascade scaled out is gone, not unresolved roughness.
   */
  fftSlopes(xz: N, distance: N, slopeVariance: readonly N[], scale?: (cascade: number) => N): { sx: N; sz: N; jxx: N; jzz: N; foam: N; lostSlopeVariance: N } {
    let sx: N = float(0.0), sz: N = float(0.0), jxx: N = float(0.0), jzz: N = float(0.0);
    let foam: N = float(0.0), lostSlopeVariance: N = float(0.0);
    this.sim.sizes.forEach((size, c) => {
      const distanceFade = fadeWeightNode(distance, CASCADE_FADES[c].normals);
      const cascadeWeight = scale ? this.cascadeWeight(xz, c).mul(scale(c)) : this.cascadeWeight(xz, c);
      const w = distanceFade.mul(cascadeWeight);
      const d = texture(this.sim.derivatives[c], xz.div(size));
      sx = sx.add(d.x.mul(w));
      sz = sz.add(d.y.mul(w));
      jxx = jxx.add(d.z.mul(w));
      jzz = jzz.add(d.w.mul(w));
      foam = max(foam, texture(this.sim.displacement[c], xz.div(size)).w.mul(w));
      // Only detail faded out by distance is unresolved roughness; swell removed over shallow water is gone, not rough.
      lostSlopeVariance = lostSlopeVariance.add(float(1.0).sub(distanceFade).mul(cascadeWeight).mul(slopeVariance[c]));
    });
    return { sx, sz, jxx, jzz, foam, lostSlopeVariance };
  }
}
