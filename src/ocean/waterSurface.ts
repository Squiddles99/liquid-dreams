import { float, max, smoothstep, texture, uniform, vec3 } from 'three/tsl';
import type { SetWaves } from '../breaker/SetWaves';
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
    return smoothstep(this.fadeFrom, this.fadeTo, this.seabed.waterDepthNode(xz));
  }

  private cascadeWeight(xz: N, c: number): N {
    return c === LONG_SWELL_CASCADE ? this.swellWeight(xz) : float(1.0);
  }

  /** vec3 displacement at undisplaced world xz, relative to the tide level. `lod` adds the render's distance fades. */
  displacement(xz: N, lod: (cascade: number) => N = () => float(1.0)): N {
    return this.fftDisplacement(xz, lod).add(this.sets.displacementNode(xz));
  }

  /**
   * Render path only, vertex stage: the same displacement as displacement(), plus the set waves' slope from the same
   * set-wave sum, assigned to `setSlopeOut` (a vec2 varyingProperty). The probe's compute shader uses displacement().
   */
  displacementWithSetSlope(xz: N, lod: (cascade: number) => N, setSlopeOut: N): N {
    return this.fftDisplacement(xz, lod).add(this.sets.displacementWithSlopeNode(xz, setSlopeOut));
  }

  private fftDisplacement(xz: N, lod: (cascade: number) => N): N {
    let d: N = vec3(0.0);
    this.sim.sizes.forEach((size, c) => {
      const s = texture(this.sim.displacement[c], xz.div(size)).level(float(0)).xyz; // three typings gap: level() wants a node
      d = d.add(s.mul(this.cascadeWeight(xz, c)).mul(lod(c)));
    });
    return d;
  }

  /** FFT slopes/Jacobian terms and foam at xz, with the render's normal fades by distance; set waves added separately. */
  fftSlopes(xz: N, distance: N, slopeVariance: readonly N[]): { sx: N; sz: N; jxx: N; jzz: N; foam: N; lostSlopeVariance: N } {
    let sx: N = float(0.0), sz: N = float(0.0), jxx: N = float(0.0), jzz: N = float(0.0);
    let foam: N = float(0.0), lostSlopeVariance: N = float(0.0);
    this.sim.sizes.forEach((size, c) => {
      const distanceFade = fadeWeightNode(distance, CASCADE_FADES[c].normals);
      const cascadeWeight = this.cascadeWeight(xz, c);
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
