import * as THREE from 'three/webgpu';
import { Fn, Loop, float, instanceIndex, storage, texture, vec3, vec4 } from 'three/tsl';
import type { OceanSimulation } from './OceanSimulation';

type N = any;

export const MAX_PROBES = 16;
const FIXED_POINT_ITERATIONS = 4;

/** Samples the ocean's height at up to 16 world XZ points on the GPU and reads them back asynchronously. */
export class HeightProbe {
  readonly outputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly inputAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_PROBES * 4), 4);
  private readonly pass: THREE.ComputeNode;
  private latest: Float32Array | null = null;
  private pending = false;

  constructor(sim: OceanSimulation) {
    const input = storage(this.inputAttr, 'vec4', MAX_PROBES).toReadOnly();
    const output = storage(this.outputAttr, 'vec4', MAX_PROBES);
    // Same sampling as OceanSurface (uv = worldXZ / size, repeat wrap). Near the camera every cascade's
    // geometry fade weight is 1, so the unweighted sum matches the rendered surface there.
    const displacementAt = (xz: N): N =>
      sim.sizes.reduce(
        (acc: N, size, c) => acc.add(texture(sim.displacement[c], xz.div(size)).level(float(0)).xyz), // three typings gap: level() wants a node
        vec3(0.0),
      );
    this.pass = Fn(() => {
      const target = input.element(instanceIndex).xy;
      const origin = target.toVar();
      // The displacement is Lagrangian (texel x0 lands at x0 + D(x0)): solve x0 = p - D_xz(x0) by fixed-point iteration.
      // three typings gap: LoopNode reads `name` at runtime, but @types/three omits it.
      Loop({ start: 0, end: FIXED_POINT_ITERATIONS, name: 'it' } as N, () => {
        origin.assign(target.sub(displacementAt(origin).xz));
      });
      output.element(instanceIndex).assign(vec4(displacementAt(origin).y, 0.0, 0.0, 1.0));
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
    renderer
      .getArrayBufferAsync(this.outputAttr)
      .then((buffer) => { this.latest = new Float32Array(buffer); })
      .catch((e) => console.warn('HeightProbe readback failed; holding last value', e))
      .finally(() => { this.pending = false; });
  }

  heightAt(index: number): number | null {
    return this.latest ? this.latest[index * 4] : null;
  }

  /** Synchronous-style read for self-tests. */
  async readNow(renderer: THREE.WebGPURenderer): Promise<Float32Array> {
    renderer.compute(this.pass);
    return new Float32Array(await renderer.getArrayBufferAsync(this.outputAttr));
  }
}
