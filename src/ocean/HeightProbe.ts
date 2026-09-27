import * as THREE from 'three/webgpu';
import { Fn, Loop, instanceIndex, storage, vec4 } from 'three/tsl';
import type { WaterSurfaceModel } from './waterSurface';

type N = any;

export const MAX_PROBES = 16;
const FIXED_POINT_ITERATIONS = 4;

/**
 * Merge a readback into the held values: a probe that read back NaN or Infinity keeps its last good height, so a
 * bad frame can never reach (and permanently poison) the camera spring. With no last good value it stays non-finite.
 */
export function holdFiniteHeights(held: Float32Array | null, readback: Float32Array): Float32Array {
  const next = readback.slice();
  for (let i = 0; i < next.length; i += 4) {
    if (!Number.isFinite(next[i])) next[i] = held ? held[i] : Number.NaN;
  }
  return next;
}

/**
 * A readback dispatched in generation `dispatched`, arriving in generation `current`: dropped (the held values kept) when
 * the probes were invalidated in between (a moment jump: it measured the old spot), else merged by holdFiniteHeights.
 */
export function acceptReadback(held: Float32Array | null, readback: Float32Array, dispatched: number, current: number): Float32Array | null {
  return dispatched === current ? holdFiniteHeights(held, readback) : held;
}

/** Samples the ocean's height at up to 16 world XZ points on the GPU and reads them back asynchronously. */
export class HeightProbe {
  readonly outputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly inputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly pass: THREE.ComputeNode;
  private latest: Float32Array | null = null;
  /** Bumped by invalidate(): a readback dispatched before it is dropped (acceptReadback). */
  private generation = 0;
  private pending = false;

  constructor(model: WaterSurfaceModel) {
    const input = storage(this.inputAttr, 'vec4', MAX_PROBES).toReadOnly();
    const output = storage(this.outputAttr, 'vec4', MAX_PROBES);
    // The same surface the mesh renders (WaterSurfaceModel), without the render's distance fades: every probe is
    // near the camera, where those fades are 1.
    const displacementAt = (xz: N): N => model.displacement(xz);
    this.pass = Fn(() => {
      const target = input.element(instanceIndex).xy;
      const origin = target.toVar();
      // The displacement is Lagrangian (texel x0 lands at x0 + D(x0)): solve x0 = p - D_xz(x0) by fixed-point iteration.
      // three typings gap: LoopNode reads `name` at runtime, but @types/three omits it.
      Loop({ start: 0, end: FIXED_POINT_ITERATIONS, name: 'it' } as N, () => {
        origin.assign(target.sub(displacementAt(origin).xz));
      });
      output.element(instanceIndex).assign(vec4(model.seabed.tide.add(displacementAt(origin).y), 0.0, 0.0, 1.0));
    })().compute(MAX_PROBES) as THREE.ComputeNode;
  }

  setProbe(index: number, x: number, z: number): void {
    const a = this.inputAttr.array as Float32Array;
    a[index * 4] = x;
    a[index * 4 + 1] = z;
    this.inputAttr.needsUpdate = true;
  }

  /** Dispatch the probe pass and start a readback if none is in flight. Call after the ocean update. */
  update(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.pass);
    if (this.pending) return;
    this.pending = true;
    const dispatched = this.generation;
    renderer
      .getArrayBufferAsync(this.outputAttr)
      .then((buffer) => { this.latest = acceptReadback(this.latest, new Float32Array(buffer), dispatched, this.generation); })
      .catch((e) => console.warn('HeightProbe readback failed; holding last value', e))
      .finally(() => { this.pending = false; });
  }

  /**
   * Forget the held heights (the probes moved somewhere new, as on a moment jump): heightAt is null until a readback
   * dispatched after this arrives, so nothing reads the old spot's water as the new one's.
   */
  invalidate(): void {
    this.generation++;
    this.latest = null;
  }

  /** Null until the probe has read back a finite height. */
  heightAt(index: number): number | null {
    const h = this.latest ? this.latest[index * 4] : Number.NaN;
    return Number.isFinite(h) ? h : null;
  }

  /** Synchronous-style read for self-tests. */
  async readNow(renderer: THREE.WebGPURenderer): Promise<Float32Array> {
    renderer.compute(this.pass);
    return new Float32Array(await renderer.getArrayBufferAsync(this.outputAttr));
  }
}
