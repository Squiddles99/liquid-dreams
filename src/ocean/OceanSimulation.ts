import * as THREE from 'three/webgpu';
import {
  Fn, cos, exp, float, instanceIndex, int, max, saturate, select, sin, sqrt, storage, textureStore, uint, uniform,
  uniformArray, uvec2, vec2, vec4,
} from 'three/tsl';
import type { Conditions } from '../conditions/types';
import { createInverseFftPass } from './fft';
import { CASCADE_SIZES_M, DEFAULT_SPECTRUM_PARAMS, FFT_SIZE, GRAVITY, type OceanSpectrumParams, buildOceanSpectra } from './spectrum';

type N = any;

export interface OceanSimParams {
  /** λ: horizontal displacement strength (0 = rounded sine-like, 1 = sharp crests). */
  choppiness: number;
  /** Foam is injected where the Jacobian drops below this. */
  foamThreshold: number;
  foamGain: number;
  /** e-folding time for foam to dissolve. */
  foamDecayS: number;
}

export const DEFAULT_OCEAN_SIM: OceanSimParams = { choppiness: 1.0, foamThreshold: 0.35, foamGain: 1.5, foamDecayS: 3.0 };

function fieldTexture(n: number): THREE.StorageTexture {
  const t = new THREE.StorageTexture(n, n);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  return t;
}

export class OceanSimulation {
  readonly n = FFT_SIZE;
  readonly sizes: readonly number[] = CASCADE_SIZES_M;
  /** xyz = displacement (m, choppiness applied), w = foam [0, 1]. */
  readonly displacement: THREE.StorageTexture[];
  /** x = ∂η/∂x, y = ∂η/∂z, z = λ∂Dx/∂x, w = λ∂Dz/∂z. */
  readonly derivatives: THREE.StorageTexture[];
  readonly fftAAttr: THREE.StorageBufferAttribute;
  readonly fftBAttr: THREE.StorageBufferAttribute;
  slopeVariance: number[] = CASCADE_SIZES_M.map(() => 0);
  hsTotal = 0;
  readonly time = uniform(0);
  readonly dt = uniform(0);
  readonly choppiness = uniform(DEFAULT_OCEAN_SIM.choppiness);
  readonly foamThreshold = uniform(DEFAULT_OCEAN_SIM.foamThreshold);
  readonly foamGain = uniform(DEFAULT_OCEAN_SIM.foamGain);
  readonly foamDecay = uniform(DEFAULT_OCEAN_SIM.foamDecayS);
  private readonly h0Attr: THREE.StorageBufferAttribute;
  private readonly foamAttr: THREE.StorageBufferAttribute;
  private readonly passes: THREE.ComputeNode[];

  constructor(params: OceanSimParams = DEFAULT_OCEAN_SIM) {
    const n = this.n;
    const count = this.sizes.length * n * n;
    this.h0Attr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.fftAAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.fftBAttr = new THREE.StorageBufferAttribute(new Float32Array(count * 4), 4);
    this.foamAttr = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
    this.displacement = this.sizes.map(() => fieldTexture(n));
    this.derivatives = this.sizes.map(() => fieldTexture(n));

    const h0 = storage(this.h0Attr, 'vec4', count).toReadOnly();
    const a = storage(this.fftAAttr, 'vec4', count);
    const b = storage(this.fftBAttr, 'vec4', count);
    const foam = storage(this.foamAttr, 'float', count);
    this.passes = [
      this.buildEvolvePass(h0, a, b),
      createInverseFftPass(a, b, this.sizes.length, 'rows', n),
      createInverseFftPass(a, b, this.sizes.length, 'columns', n),
      ...this.sizes.map((_, c) => this.buildAssemblePass(c, a, b, foam)),
    ];
    this.setParams(params);
  }

  setParams(p: OceanSimParams): void {
    this.choppiness.value = p.choppiness;
    this.foamThreshold.value = p.foamThreshold;
    this.foamGain.value = p.foamGain;
    this.foamDecay.value = Math.max(0.05, p.foamDecayS);
  }

  /** Rebuild the initial spectrum on the CPU (~tens of ms); call when conditions or spectrum params change. */
  setConditions(c: Conditions, spectrum: OceanSpectrumParams = DEFAULT_SPECTRUM_PARAMS): void {
    const s = buildOceanSpectra(c, spectrum);
    const array = this.h0Attr.array as Float32Array;
    s.h0.forEach((h, i) => array.set(h, i * this.n * this.n * 4));
    this.h0Attr.needsUpdate = true;
    this.slopeVariance = s.slopeVariance;
    this.hsTotal = s.hsTotal;
  }

  update(renderer: THREE.WebGPURenderer, timeS: number, dtS: number): void {
    this.time.value = timeS;
    this.dt.value = dtS;
    renderer.compute(this.passes);
  }

  private buildEvolvePass(h0: N, a: N, b: N): THREE.ComputeNode {
    const n = this.n;
    // three typings gap: UniformArrayNode<'float'>.element() is typed as a generic string node, not a float.
    const sizes: N = uniformArray([...this.sizes], 'float');
    return Fn(() => {
      const idx = instanceIndex;
      const cascade = idx.div(uint(n * n));
      const local = idx.mod(uint(n * n));
      const dk = float(2 * Math.PI).div(sizes.element(cascade));
      const kx = float(int(local.mod(uint(n))).sub(n / 2)).mul(dk);
      const kz = float(int(local.div(uint(n))).sub(n / 2)).mul(dk);
      const k = sqrt(kx.mul(kx).add(kz.mul(kz)));
      const phase = sqrt(k.mul(GRAVITY)).mul(this.time);
      const c = cos(phase);
      const s = sin(phase);
      const s0 = h0.element(idx);
      // h = h0·e^{iωt} + conj(h0(-k))·e^{-iωt}
      const h = vec2(
        s0.x.mul(c).sub(s0.y.mul(s)).add(s0.z.mul(c)).add(s0.w.mul(s)),
        s0.x.mul(s).add(s0.y.mul(c)).sub(s0.z.mul(s)).add(s0.w.mul(c)),
      );
      const ih = vec2(h.y.negate(), h.x);
      const invK = float(1.0).div(max(k, 1e-6));
      const kxn = kx.mul(invK);
      const kzn = kz.mul(invK);
      const dx = ih.mul(kxn);
      const dz = ih.mul(kzn);
      const sx = ih.mul(kx);
      const sz = ih.mul(kz);
      const jxx = h.mul(kx.mul(kxn)).negate();
      const jzz = h.mul(kz.mul(kzn)).negate();
      const jxz = h.mul(kx.mul(kzn)).negate();
      const pack = (X: N, Y: N): N => vec2(X.x.sub(Y.y), X.y.add(Y.x)); // X + iY
      const live = k.greaterThan(1e-6);
      a.element(idx).assign(select(live, vec4(pack(dx, h), pack(dz, sx)), vec4(0.0)));
      b.element(idx).assign(select(live, vec4(pack(sz, jxx), pack(jzz, jxz)), vec4(0.0)));
    })().compute(this.sizes.length * n * n) as THREE.ComputeNode;
  }

  private buildAssemblePass(cascade: number, a: N, b: N, foam: N): THREE.ComputeNode {
    const n = this.n;
    return Fn(() => {
      const local = instanceIndex;
      const idx = local.add(uint(cascade * n * n));
      const x = local.mod(uint(n));
      const m = local.div(uint(n));
      const sign = select(x.add(m).mod(uint(2)).equal(uint(0)), float(1.0), float(-1.0));
      const fa = a.element(idx).mul(sign);
      const fb = b.element(idx).mul(sign);
      const lam = this.choppiness;
      const jxx = fb.y.mul(lam);
      const jzz = fb.z.mul(lam);
      const jxz = fb.w.mul(lam);
      const jacobian = float(1.0).add(jxx).mul(float(1.0).add(jzz)).sub(jxz.mul(jxz));
      const inject = saturate(this.foamThreshold.sub(jacobian).mul(this.foamGain));
      const next = max(foam.element(idx).mul(exp(this.dt.negate().div(this.foamDecay))), inject);
      foam.element(idx).assign(next);
      textureStore(this.displacement[cascade], uvec2(x, m), vec4(fa.x.mul(lam), fa.y, fa.z.mul(lam), next));
      textureStore(this.derivatives[cascade], uvec2(x, m), vec4(fa.w, fb.x, jxx, jzz));
    })().compute(n * n) as THREE.ComputeNode;
  }
}
