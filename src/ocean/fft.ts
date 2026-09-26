import type * as THREE from 'three/webgpu';
import { Fn, Loop, PI, cos, float, localId, sin, uint, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId } from 'three/tsl';
import { FFT_SIZE } from './spectrum';

type N = any;

const cmul = (a: N, b: N): N => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));
/** Multiply both complex numbers packed in a vec4 (xy, zw) by w. */
const cmul2 = (v: N, w: N): N => vec4(cmul(v.xy, w), cmul(v.zw, w));

export type FftDirection = 'rows' | 'columns';

/**
 * In-place inverse FFT (no 1/n) along every row or column of `cascades` stacked n×n grids,
 * for two vec4 buffers at once (each vec4 = two complex values). One workgroup per line.
 */
export function createInverseFftPass(bufferA: N, bufferB: N, cascades: number, direction: FftDirection, n = FFT_SIZE): THREE.ComputeNode {
  const half = n / 2;
  const stages = Math.log2(n);
  return Fn(() => {
    // three typings gap: WorkgroupInfoNode.element() exists at runtime but @types/three omits it.
    const sharedA: N = workgroupArray('vec4', n);
    const sharedB: N = workgroupArray('vec4', n);
    const line = workgroupId.x;
    const base = line.div(uint(n)).mul(uint(n * n));
    const lineInCascade = line.mod(uint(n));
    const t = localId.x;
    const indexOf = (i: N): N =>
      direction === 'rows' ? base.add(lineInCascade.mul(uint(n))).add(i) : base.add(i.mul(uint(n))).add(lineInCascade);
    const tHalf = t.add(uint(half));
    const i0 = indexOf(t);
    const i1 = indexOf(tHalf);

    sharedA.element(t).assign(bufferA.element(i0));
    sharedA.element(tHalf).assign(bufferA.element(i1));
    sharedB.element(t).assign(bufferB.element(i0));
    sharedB.element(tHalf).assign(bufferB.element(i1));
    workgroupBarrier();

    // three typings gap: LoopNode reads `name` at runtime, but @types/three omits it.
    Loop({ start: 0, end: stages, name: 'stage' } as N, ({ stage }: N) => {
      const ns = uint(1).shiftLeft(uint(stage));
      const k = t.mod(ns);
      const angle = float(k).mul(PI).div(float(ns)); // +2πk/(2·ns): inverse transform
      const twiddle = vec2(cos(angle), sin(angle));
      const a0 = sharedA.element(t).toVar();
      const a1 = cmul2(sharedA.element(tHalf), twiddle).toVar();
      const b0 = sharedB.element(t).toVar();
      const b1 = cmul2(sharedB.element(tHalf), twiddle).toVar();
      workgroupBarrier();
      const dst = t.div(ns).mul(ns.mul(uint(2))).add(k);
      sharedA.element(dst).assign(a0.add(a1));
      sharedA.element(dst.add(ns)).assign(a0.sub(a1));
      sharedB.element(dst).assign(b0.add(b1));
      sharedB.element(dst.add(ns)).assign(b0.sub(b1));
      workgroupBarrier();
    });

    bufferA.element(i0).assign(sharedA.element(t));
    bufferA.element(i1).assign(sharedA.element(tHalf));
    bufferB.element(i0).assign(sharedB.element(t));
    bufferB.element(i1).assign(sharedB.element(tHalf));
  })().compute(cascades * n * half, [half]) as THREE.ComputeNode;
}
