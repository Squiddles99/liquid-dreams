import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, abs, clamp, cos, exp, float, floor, int, ivec2, length, max, min, mix, select, sin, smoothstep, storage, tanh,
  textureLoad, uniform, vec2, vec3,
} from 'three/tsl';
import { REEF_GRID } from '../seabed/wombReef';
import { MAX_ACTIVE_WAVES, type WaveEvent } from '../swell/sets';
import { FAR_DX, FAR_X0, FAR_X1 } from './coastFarField';
import { MIN_DEPTH_M } from './dispersion';
import type { ReefField } from './reefField';
import {
  BREAKING_RATIO, ENVELOPE_WIDTH, FOLD_LIMIT, PITCH_KA_CAP, PITCH_MAX, STOKES_CAP, TAPER_FAR_M, TAPER_NEAR_M, toActiveWave,
} from './setWaveModel';

type N = any;

const FIELD_NX = REEF_GRID.nx / 2;
const FIELD_NZ = REEF_GRID.nz / 2;
const FAR_COUNT = Math.round((FAR_X1 - FAR_X0) / FAR_DX) + 1;
/** Envelope widths |ξ|/width beyond which a wave contributes nothing visible (exp(−3.5²) ≈ 5e-6). */
const ENVELOPE_CUTOFF = 3.5;

function floatTexture(width: number, height: number): THREE.DataTexture {
  const data = new Float32Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 1;
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Manual bilinear over a float texture (float32 textures need not be filterable). g is in texel units. */
function bilinearLoad(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, vec2(0.0), maxIndex.sub(0.001));
  const base = floor(gc);
  const t = gc.sub(base);
  const i0 = ivec2(base);
  const load = (dx: number, dz: number): N => textureLoad(tex, i0.add(ivec2(dx, dz)), int(0));
  return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
}

/** Linear interpolation along row 0 of a width × 1 float texture. g is in texel units. */
function linearLoad1D(tex: THREE.Texture, g: N, maxIndex: N): N {
  const gc = clamp(g, 0.0, maxIndex.sub(0.001));
  const base = floor(gc);
  const i0 = int(base);
  return mix(textureLoad(tex, ivec2(i0, int(0)), int(0)), textureLoad(tex, ivec2(i0.add(1), int(0)), int(0)), gc.sub(base));
}

const safeNormalize = (v: N): N => v.div(max(length(v), 1e-6));

/** The set waves on the GPU: the reef field, the far field and the active waves; a TSL mirror of setWaveModel. */
export class SetWaves {
  hasField = false;
  private readonly fieldA = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly fieldB = floatTexture(FIELD_NX, FIELD_NZ);
  private readonly farA = floatTexture(FAR_COUNT, 1);
  private readonly farB = floatTexture(FAR_COUNT, 1);
  private readonly origin = uniform(new THREE.Vector2(REEF_GRID.x0 + REEF_GRID.cellM / 2, REEF_GRID.z0 + REEF_GRID.cellM / 2));
  private readonly cell = uniform(REEF_GRID.cellM * 2);
  private readonly fieldMax = uniform(new THREE.Vector2(FIELD_NX - 1, FIELD_NZ - 1));
  private readonly farMax = uniform(FAR_COUNT - 1);
  private readonly farP = uniform(0);
  private readonly meanOmega = uniform(1);
  private readonly meanTravel = uniform(new THREE.Vector2(1, 0));
  private readonly wavesAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_ACTIVE_WAVES * 8), 4);
  private readonly waves = storage(this.wavesAttr, 'vec4', MAX_ACTIVE_WAVES * 2).toReadOnly();
  /** How many wave slots are filled; 0 in a lull, when sum() skips the field fetches and the loop entirely. */
  readonly activeCount = uniform(0);

  constructor(private readonly time: N) {
    this.setEvents([]);
  }

  setField(f: ReefField): void {
    if (f.grid.nx !== FIELD_NX || f.grid.nz !== FIELD_NZ || f.far.count !== FAR_COUNT) throw new Error('Reef field grid does not match SetWaves');
    const a = this.fieldA.image.data as Float32Array, b = this.fieldB.image.data as Float32Array;
    for (let i = 0; i < f.tau.length; i++) {
      a[i * 4] = f.tau[i]; a[i * 4 + 1] = f.amp[i]; a[i * 4 + 2] = f.hmin[i]; a[i * 4 + 3] = f.k[i];
      b[i * 4] = f.dirX[i]; b[i * 4 + 1] = f.dirZ[i]; b[i * 4 + 2] = f.depth[i]; b[i * 4 + 3] = 0;
    }
    const fa = this.farA.image.data as Float32Array, fb = this.farB.image.data as Float32Array;
    for (let i = 0; i < f.far.count; i++) {
      fa[i * 4] = f.far.tau[i] - f.far.tauOffset; fa[i * 4 + 1] = f.far.amp[i]; fa[i * 4 + 2] = f.far.hmin[i]; fa[i * 4 + 3] = f.far.k[i];
      fb[i * 4] = f.far.dTauDx[i]; fb[i * 4 + 1] = f.far.depth[i]; fb[i * 4 + 2] = 0; fb[i * 4 + 3] = 0;
    }
    for (const t of [this.fieldA, this.fieldB, this.farA, this.farB]) t.needsUpdate = true;
    this.origin.value.set(f.grid.x0, f.grid.z0);
    this.cell.value = f.grid.cellM;
    this.farP.value = f.far.p;
    this.meanOmega.value = f.omega;
    this.meanTravel.value.set(f.far.dirX, f.far.dirZ);
    this.hasField = true;
  }

  setEvents(events: readonly WaveEvent[]): void {
    const d = this.wavesAttr.array as Float32Array;
    for (let i = 0; i < MAX_ACTIVE_WAVES; i++) {
      const e = events[i];
      const w = e ? toActiveWave(e) : null;
      d.set(w ? [w.arrivalS, w.heightM, w.omega, w.crestLengthM] : [0, 0, 1, 1], i * 8);
      d.set(w ? [w.travelX, w.travelZ, w.crestOffsetM, 0] : [1, 0, 0, 0], i * 8 + 4);
    }
    this.activeCount.value = Math.min(events.length, MAX_ACTIVE_WAVES);
    this.wavesAttr.needsUpdate = true;
  }

  /**
   * The field at world xz (TSL mirror of sampleField): bilinear inside the reef grid. Outside it, with c the point
   * clamped to the grid: on the inflow side the exact coast solution; on the outflow side the grid's edge sample at c,
   * with τ advanced along the edge's ray direction from c to xz, so the reef's delay and shadow continue past the map.
   */
  sample(xz: N): { tau: N; amp: N; hmin: N; k: N; dir: N; depth: N } {
    const g = xz.sub(this.origin).div(this.cell);
    const inside = g.x.greaterThanEqual(0.0).and(g.y.greaterThanEqual(0.0)).and(g.x.lessThanEqual(this.fieldMax.x)).and(g.y.lessThanEqual(this.fieldMax.y));
    // bilinearLoad clamps g, so outside the grid a and b are already the edge sample at the clamped point.
    const a = bilinearLoad(this.fieldA, g, this.fieldMax);
    const b = bilinearLoad(this.fieldB, g, this.fieldMax);
    const fg = clamp(xz.x.sub(FAR_X0).div(FAR_DX), 0.0, this.farMax.sub(0.001));
    const fa = linearLoad1D(this.farA, fg, this.farMax);
    const fb = linearLoad1D(this.farB, fg, this.farMax);
    const xc = fg.mul(FAR_DX).add(FAR_X0);
    const farTau = fa.x.add(xz.x.sub(xc).mul(fb.x)).add(this.farP.mul(xz.y));
    const farDir = safeNormalize(vec2(fb.x, this.farP));
    // From the point clamped to the grid to the query (zero inside). Outflow: the far wave travels away from the grid.
    const toQuery = xz.sub(this.origin.add(clamp(g, vec2(0.0), this.fieldMax).mul(this.cell)));
    const outflow = farDir.x.mul(toQuery.x).add(farDir.y.mul(toQuery.y)).greaterThan(0.0);
    const useGrid = inside.or(outflow);
    const edgeDir = safeNormalize(b.xy);
    const edgeK = max(a.w, 1e-4);
    const edgeTau = a.x.add(edgeK.div(this.meanOmega).mul(edgeDir.x.mul(toQuery.x).add(edgeDir.y.mul(toQuery.y))));
    return {
      tau: select(inside, a.x, select(outflow, edgeTau, farTau)),
      amp: select(useGrid, a.y, fa.y),
      hmin: select(useGrid, a.z, fa.z),
      k: max(select(useGrid, a.w, fa.w), 1e-4),
      dir: select(useGrid, edgeDir, farDir),
      depth: select(useGrid, b.z, fb.y),
    };
  }

  /**
   * Σ over the active waves of the setWaveModel formulas. Must be called inside an Fn. With no active wave the field
   * is not even sampled: zero waves sum to zero, as on the CPU.
   */
  private sum(xz: N): { eta: N; dh: N; slope: N } {
    const eta = float(0.0).toVar(), dh = vec2(0.0).toVar(), slope = vec2(0.0).toVar();
    If(this.activeCount.greaterThan(0.5), () => {
      // Everything that does not depend on the wave is made a var here, before the loop. Left as expressions, TSL
      // emits them where they are first used, inside the loop body, and the field would be fetched once per slot.
      const s = this.sample(xz);
      const f = { tau: s.tau.toVar(), amp: s.amp.toVar(), hmin: s.hmin.toVar(), k: s.k.toVar(), dir: s.dir.toVar(), depth: s.depth.toVar() };
      const wFar = smoothstep(TAPER_NEAR_M, TAPER_FAR_M, length(xz)).toVar();
      const sigma = max(tanh(f.k.mul(f.depth)), 0.05);
      const stokesPerA = f.k.mul(float(3.0).sub(sigma.mul(sigma))).div(sigma.mul(sigma).mul(sigma).mul(4.0)).toVar();
      const cLocal = this.meanOmega.div(f.k).toVar();
      const dXiDs = f.k.negate().div(this.meanOmega).toVar();
      Loop(MAX_ACTIVE_WAVES, ({ i }: N) => {
        const a = this.waves.element(i.mul(2));
        const b = this.waves.element(i.mul(2).add(1));
        const H = min(a.y.mul(f.amp), f.hmin.mul(BREAKING_RATIO));
        const A = H.mul(0.5);
        const dTau = b.x.sub(this.meanTravel.x).mul(xz.x).add(b.y.sub(this.meanTravel.y).mul(xz.y)).div(cLocal);
        const xi = this.time.sub(a.x).sub(f.tau).sub(dTau);
        const width = float(ENVELOPE_WIDTH * 2 * Math.PI).div(a.z);
        const r = xi.div(width);
        // Empty slots, and waves beyond ENVELOPE_CUTOFF widths (envelope < 5e-6), are skipped: most pixels are near one or two.
        If(a.y.greaterThan(0.0).and(abs(r).lessThan(ENVELOPE_CUTOFF)), () => {
          const env = exp(r.mul(r).negate());
          const dEnv = xi.mul(-2.0).div(width.mul(width)).mul(env);
          const B = min(float(STOKES_CAP), stokesPerA.mul(A));
          const q = xz.x.negate().mul(b.y).add(xz.y.mul(b.x)).sub(b.z).mul(2.0).div(a.w);
          const q2 = q.mul(q);
          const lateral = mix(float(1.0), exp(q2.mul(q2).negate()), wFar);
          const theta = a.z.mul(xi);
          const aE = A.mul(env).mul(lateral);
          const shape = cos(theta).add(B.mul(cos(theta.mul(2.0))));
          const e = aE.mul(shape);
          const hAmp = min(aE, float(FOLD_LIMIT).div(f.k));
          const nearBreaking = smoothstep(0.3, BREAKING_RATIO, H.div(max(f.hmin, MIN_DEPTH_M)));
          const pitch = min(nearBreaking.mul(PITCH_MAX), float(PITCH_KA_CAP).div(max(f.k.mul(aE), 1e-4)));
          const d = hAmp.mul(sin(theta)).add(pitch.mul(e));
          const dEtaDXi = A.mul(lateral).mul(dEnv.mul(shape).sub(env.mul(a.z).mul(sin(theta).add(B.mul(2.0).mul(sin(theta.mul(2.0)))))));
          const jacobian = max(float(1.0).add(hAmp.mul(a.z).mul(cos(theta)).add(pitch.mul(dEtaDXi)).mul(dXiDs)), 0.2);
          const along = dEtaDXi.mul(dXiDs).div(jacobian);
          eta.addAssign(e);
          dh.addAssign(f.dir.mul(d));
          slope.addAssign(f.dir.mul(along));
        });
      });
    });
    return { eta, dh, slope };
  }

  /** vec3(dx, η, dz): the set waves' displacement at undisplaced world xz. */
  displacementNode(xz: N): N {
    return Fn(() => {
      const s = this.sum(xz);
      return vec3(s.dh.x, s.eta, s.dh.y);
    })();
  }

  /**
   * Render path only, vertex stage: displacementNode's vec3 and slopeNode's slope from ONE sum(). The slope is
   * assigned to `slopeOut`, a varyingProperty the fragment stage reads interpolated (set waves are 100 m+ long, the
   * grid cells a few metres). Never use this in a compute shader: there is no varying to write. The probe and the
   * self-tests keep using displacementNode and slopeNode.
   */
  displacementWithSlopeNode(xz: N, slopeOut: N): N {
    return Fn(() => {
      const s = this.sum(xz);
      slopeOut.assign(s.slope);
      return vec3(s.dh.x, s.eta, s.dh.y);
    })();
  }

  /** vec2(∂η/∂x, ∂η/∂z) of the set waves (Eulerian, Jacobian-corrected). */
  slopeNode(xz: N): N {
    return Fn(() => this.sum(xz).slope)();
  }

  tauNode(xz: N): N {
    return this.sample(xz).tau;
  }
}
