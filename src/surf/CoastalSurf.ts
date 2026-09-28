import { clamp, exp, float, floor, fract, fwidth, int, max, min, mix, select, smoothstep, uniform, uniformArray } from 'three/tsl';
import { type ReefField, sampleField } from '../breaker/reefField';
import type { Conditions } from '../conditions/types';
import { surferFeetToHs } from '../conditions/units';
import { SHORE_X } from '../seabed/coastProfile';
import { type Seabed, shoreReefWidthNode } from '../seabed/Seabed';
import type { WaveEvent } from '../swell/sets';
import {
  BORE_DECAY, BORE_SPEED_MS, BURST_S, DUTY, FRONT_GAIN, FRONT_M, GRAZING_K, GRAZING_MAX, GRAZING_MIN_Y, H_REF_M, LACE_WEIGHT, LIFT_REACH_M, RUNUP_BASE_M, RUNUP_PER_H, SURF_AHEAD_M, SURF_BEHIND_M,
  SURF_DZ, SURF_NZ, SURF_TABLE, SURF_Z0, SWASH_FRACTION, SWASH_RISE, type SurfParams, type SurfState, TRAIL_M, TRAIL_WEIGHT, WET_ARRIVALS, WET_DRY_S,
  buildHeights, buildTauTable, heightRange,
} from './surfModel';

type N = any;

/**
 * The coastal surf on the GPU (spec 2026-09-28-the-waterline-design.md; CPU reference surfModel.ts): two uniform tables,
 * τ along the coast and each wave's breaking height, and the nodes the ocean surface and the land read. No textures.
 */
export class CoastalSurf {
  readonly state: SurfState = { tau: new Float32Array(SURF_NZ), table: { base: 0, heights: new Float32Array(SURF_TABLE), meanHeight: 0 }, periodS: 15, enabled: true };
  readonly time = uniform(0);
  private readonly tauU: N = uniformArray(new Array<number>(SURF_NZ).fill(0), 'float');
  private readonly hU: N = uniformArray(new Array<number>(SURF_TABLE).fill(0), 'float');
  private readonly base = uniform(0);
  private readonly period = uniform(15);
  private readonly meanH = uniform(0);
  private readonly on = uniform(1);
  private field: ReefField | null | undefined = undefined;
  private tauMin = 0;
  private tauMax = 0;
  private builtRange = '';
  private dirty = true;

  /** Conditions, sets or surf params changed: the next update rebuilds the height table. */
  invalidate(): void {
    this.dirty = true;
  }

  update(simTime: number, c: Conditions, eventsBetween: (t0: number, t1: number) => WaveEvent[], field: ReefField | null, p: SurfParams): void {
    if (field !== this.field) {
      this.field = field;
      const tau = field ? buildTauTable((x, z) => sampleField(field, x, z).tau) : new Float32Array(SURF_NZ);
      this.state.tau = tau;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < SURF_NZ; i++) {
        (this.tauU.array as number[])[i] = tau[i];
        lo = Math.min(lo, tau[i]); hi = Math.max(hi, tau[i]);
      }
      this.tauMin = lo; this.tauMax = hi;
      this.dirty = true;
    }
    const T = c.swell.periodS;
    const r = heightRange(simTime, T, this.tauMin, this.tauMax);
    const key = `${r.lo}:${r.hi}:${T}`;
    if (this.dirty || key !== this.builtRange) {
      const events = eventsBetween((r.lo - 1) * T, (r.hi + 1) * T);
      const table = buildHeights(r, T, surferFeetToHs(c.swell.sizeFt), events, p.amount);
      this.state.table = table;
      for (let i = 0; i < SURF_TABLE; i++) (this.hU.array as number[])[i] = table.heights[i];
      this.base.value = table.base;
      this.meanH.value = table.meanHeight;
      this.builtRange = key;
      this.dirty = false;
    }
    this.state.periodS = T;
    this.state.enabled = p.enabled;
    this.period.value = T;
    this.on.value = p.enabled ? 1 : 0;
    this.time.value = simTime;
  }

  private tauNode(z: N): N {
    const f = clamp(z.sub(SURF_Z0).div(SURF_DZ), 0.0, SURF_NZ - 1.001);
    const i = int(floor(f));
    return mix(this.tauU.element(i), this.tauU.element(i.add(1)), fract(f));
  }

  private heightNode(n: N): N {
    return this.hU.element(int(clamp(n.sub(this.base), 0.0, SURF_TABLE - 1)));
  }

  private runupNode(H: N): N {
    return select(H.greaterThan(0.01), H.mul(RUNUP_PER_H).add(RUNUP_BASE_M), float(0.0));
  }

  private zoneNode(d: N, W: N): N {
    return smoothstep(-SURF_BEHIND_M, 0.0, d).mul(float(1.0).sub(smoothstep(W, W.add(10.0), d)));
  }

  dSeaNode(xz: N, seabed: Seabed): N {
    return float(SHORE_X).add(seabed.waterlineShiftNode(xz.y)).sub(xz.x);
  }

  /** surfModel.surfFoam: the three latest bores and the lace (compute-safe). `t` defaults to the sim time uniform. */
  foamNearNode(xz: N, seabed: Seabed, t: N = this.time): N {
    const d = this.dSeaNode(xz, seabed), W = shoreReefWidthNode(xz.y), tau = this.tauNode(xz.y), T = this.period;
    const nL = floor(t.sub(tau).div(T));
    let foam: N = float(0.0), recent: N = float(0.0);
    for (let k = 0; k < 3; k++) {
      const n = nL.sub(k), H = this.heightNode(n), age = t.sub(n.mul(T).add(tau)), df = W.sub(age.mul(BORE_SPEED_MS));
      if (k < 2) recent = recent.add(H.mul(0.5 / H_REF_M));
      const str = H.div(H_REF_M).mul(float(1.0).sub(float(1.0).sub(df.div(W)).mul(BORE_DECAY)));
      const u = d.sub(df).div(FRONT_M);
      const front = exp(u.mul(u).negate());
      const trail = select(d.greaterThan(df), exp(d.sub(df).div(TRAIL_M).negate()).mul(TRAIL_WEIGHT), float(0.0));
      const b = d.sub(W).div(6.0);
      const burst = select(age.lessThan(BURST_S), float(1.0).sub(age.div(BURST_S)).mul(exp(b.mul(b).negate())), float(0.0));
      foam = max(foam, select(df.greaterThanEqual(0.0), str.mul(front.mul(FRONT_GAIN).add(trail).add(burst)), float(0.0)));
    }
    const inZone = d.greaterThanEqual(-SURF_BEHIND_M).and(d.lessThanEqual(W.add(SURF_AHEAD_M)));
    const v = min(float(1.0), max(foam, recent.mul(LACE_WEIGHT).mul(this.zoneNode(d, W))));
    return select(inZone, v, float(0.0)).mul(this.on);
  }

  /**
   * The render's foam: near, the bores; once a pixel spans metres of d, the steady time-average, boosted at grazing views
   * (surfModel.grazingBoost; `viewY` is the view ray's y). Fragment only.
   */
  foamNode(xz: N, seabed: Seabed, viewY: N = float(1.0)): N {
    const d = this.dSeaNode(xz, seabed), W = shoreReefWidthNode(xz.y);
    const boost = clamp(float(GRAZING_K).div(max(viewY.abs(), GRAZING_MIN_Y)), 1.0, GRAZING_MAX);
    const far = min(float(1.0), this.meanH.mul(DUTY / H_REF_M).mul(this.zoneNode(d, W)).mul(boost)).mul(this.on);
    return mix(this.foamNearNode(xz, seabed), far, smoothstep(1.5, 4.0, fwidth(d)));
  }

  private arrivalOffsetNode(z: N): N {
    return this.tauNode(z).add(shoreReefWidthNode(z).div(BORE_SPEED_MS));
  }

  private swashShapeNode(u: N): N {
    const rise = smoothstep(0.0, SWASH_RISE, u), fall = float(1.0).sub(smoothstep(SWASH_RISE, 1.0, u));
    return select(u.lessThanEqual(0.0).or(u.greaterThanEqual(1.0)), float(0.0), select(u.lessThan(SWASH_RISE), rise, fall));
  }

  swashLevelNode(z: N, t: N = this.time): N {
    const off = this.arrivalOffsetNode(z), T = this.period, Ts = T.mul(SWASH_FRACTION);
    const nL = floor(t.sub(off).div(T));
    let r: N = float(0.0);
    for (let k = 0; k < 2; k++) {
      const n = nL.sub(k);
      r = max(r, this.runupNode(this.heightNode(n)).mul(this.swashShapeNode(t.sub(n.mul(T).add(off)).div(Ts))));
    }
    return r.mul(this.on);
  }

  /** The water surface's lift near the shore (vertex stage): the swash level, all of it on the beach, fading 40 m out. */
  liftNode(xz: N, seabed: Seabed): N {
    return this.swashLevelNode(xz.y).mul(float(1.0).sub(smoothstep(0.0, LIFT_REACH_M, this.dSeaNode(xz, seabed))));
  }

  wetLevelNode(z: N, t: N = this.time): N {
    const off = this.arrivalOffsetNode(z), T = this.period;
    const nL = floor(t.sub(off).div(T));
    let w: N = float(0.0);
    for (let k = 0; k < WET_ARRIVALS; k++) {
      const n = nL.sub(k), age = t.sub(n.mul(T).add(off));
      w = max(w, select(age.greaterThanEqual(0.0), this.runupNode(this.heightNode(n)).mul(exp(age.div(WET_DRY_S).negate())), float(0.0)));
    }
    return w.mul(this.on);
  }
}
