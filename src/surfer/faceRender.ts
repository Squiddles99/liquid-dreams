import * as THREE from 'three/webgpu';
import type { Surfer } from './Surfer';

/**
 * Self-test helpers (closeup spec §6): render a close-up of part of a surfer at rest into a small float target and read
 * it back. Only the surfer is in the scene, on a clear background (alpha 0 where nothing drew).
 */
export async function renderCloseUp(renderer: THREE.WebGPURenderer, s: Surfer, look: THREE.Vector3, from: THREE.Vector3, fovDeg: number, size = 96): Promise<Float32Array> {
  const scene = new THREE.Scene();
  const parent = s.group.parent;
  scene.add(s.group);
  s.group.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(fovDeg, 1, 0.01, 5);
  cam.position.copy(from);
  cam.lookAt(look);
  const target = new THREE.RenderTarget(size, size, { type: THREE.FloatType });
  const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clear);
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Float32Array;
  target.dispose();
  if (parent) parent.add(s.group);
  return px;
}

/** Pixels (of a size × size RGBA float image) that differ between two renders by more than `eps` in any channel. */
export function changedPixels(a: Float32Array, b: Float32Array, eps = 0.01): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > eps || Math.abs(a[i + 1] - b[i + 1]) > eps || Math.abs(a[i + 2] - b[i + 2]) > eps || Math.abs(a[i + 3] - b[i + 3]) > 0.5) n++;
  return n;
}

/**
 * How speckled the central `n` × `n` window is: each pixel's luminance against the mean of its four neighbours, over
 * the mean luminance, in %. Local, so smooth shading doesn't count; freckles and pores do. Also the covered pixels.
 */
export function speckle(px: Float32Array, size: number, n = 32): { cv: number; px: number } {
  const o = (size - n) >> 1;
  const L = (x: number, y: number): number => {
    const i = 4 * ((y + o) * size + x + o);
    return px[i + 3] > 0 ? 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] : Number.NaN;
  };
  let covered = 0, sum = 0, detail = 0, k = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = L(x, y);
    if (Number.isNaN(c)) continue;
    covered++;
    sum += c;
    if (x === 0 || y === 0 || x === n - 1 || y === n - 1) continue;
    const around = (L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1)) / 4;
    if (Number.isNaN(around)) continue;
    detail += Math.abs(c - around);
    k++;
  }
  const mean = sum / Math.max(1, covered);
  return { cv: mean > 0 && k > 0 ? (100 * detail) / k / mean : 0, px: covered };
}
