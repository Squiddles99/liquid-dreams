import * as THREE from 'three/webgpu';

/**
 * The spray's noise atlas (breaking-look lever L3): one 2-D tiling texture generated at boot by our code, read once per
 * sprite pixel where two 3-D gradient noises (mx_noise_float: the puff's shape and its erosion, evaluated for every kind)
 * were. Channels (each ∈ [0, 1], mean ½): R the puff's shape breakup, G the erosion threshold, B fibres (the noise stretched
 * NOISE_STREAK : 1 along u: the plume's and the crest strip's fibrous streaks), A a second shape octave.
 *
 * Periodic gradient noise (Perlin) on a NOISE_CELLS lattice per tile, with a per-channel seed. CPU reference: atlasAt (the
 * texel grid, bilinear with wrap, as the GPU's linear filter reads it).
 */
export const NOISE_SIZE = 256;
export const NOISE_CELLS = 8;
export const NOISE_STREAK = 6;

const hash = (i: number, j: number, seed: number): number => {
  let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 65536) / 65536;
};
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Periodic Perlin noise at (u, v) ∈ [0, 1)², `cu` × `cv` cells per tile: ≈ [−0.7, 0.7], mean 0. */
export function periodicPerlin(u: number, v: number, cu: number, cv: number, seed: number): number {
  const x = u * cu, y = v * cv, i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0;
  const g = (i: number, j: number, dx: number, dy: number) => {
    const a = 2 * Math.PI * hash(((i % cu) + cu) % cu, ((j % cv) + cv) % cv, seed);
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const n00 = g(i0, j0, fx, fy), n10 = g(i0 + 1, j0, fx - 1, fy), n01 = g(i0, j0 + 1, fx, fy - 1), n11 = g(i0 + 1, j0 + 1, fx - 1, fy - 1);
  const ux = fade(fx), uy = fade(fy);
  return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
}

/** Two octaves, scaled to unit-ish spread around ½ and clamped to [0, 1]. */
const channel = (u: number, v: number, cu: number, cv: number, seed: number): number => {
  const n = periodicPerlin(u, v, cu, cv, seed) + 0.5 * periodicPerlin(u, v, 2 * cu, 2 * cv, seed + 101);
  return Math.min(1, Math.max(0, 0.5 + n * 0.75));
};

/** The atlas, RGBA, row-major (v rows), values in [0, 1]. */
export function bakeNoiseAtlas(n = NOISE_SIZE): Float32Array {
  const out = new Float32Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, v = (j + 0.5) / n, o = (j * n + i) * 4;
    out[o] = channel(u, v, NOISE_CELLS, NOISE_CELLS, 11);
    out[o + 1] = channel(u, v, NOISE_CELLS, NOISE_CELLS, 23);
    out[o + 2] = channel(u, v, NOISE_CELLS / 2, NOISE_CELLS * 3, 37);
    out[o + 3] = channel(u, v, NOISE_CELLS * 2, NOISE_CELLS * 2, 53);
  }
  return out;
}

/** The atlas read as the GPU reads it (linear filter, repeat wrap, texel centres at (i + ½)/N): channel c at (u, v). */
export function atlasAt(bake: Float32Array, n: number, u: number, v: number, c: number): number {
  const x = u * n - 0.5, y = v * n - 0.5, i0 = Math.floor(x), j0 = Math.floor(y), tx = x - i0, ty = y - j0;
  const at = (i: number, j: number) => bake[((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 4 + c];
  return (at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx) * (1 - ty) + (at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx) * ty;
}

let atlas: THREE.DataTexture | null = null;
/** The atlas on the GPU (RGBA8, linear, repeat), built once. */
export function noiseAtlasTexture(): THREE.DataTexture {
  if (atlas) return atlas;
  const f = bakeNoiseAtlas(NOISE_SIZE), b = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) b[i] = Math.round(f[i] * 255);
  const t = new THREE.DataTexture(b, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  atlas = t;
  return t;
}
