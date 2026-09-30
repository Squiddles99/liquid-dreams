import { abs, dot, float, floor, length, max, min, mix, saturate, uint, uvec3, vec3 } from 'three/tsl';

type N = any;

/**
 * Tileable 3D noise for the clouds (spec 2026-09-30 §4.2), evaluated once at start into textures. Every lattice and
 * cell index wraps modulo the noise's period, so a texture filled over one period repeats without a seam.
 */

/** pcg3d (Jarzynski & Olano 2020): three well-mixed uints from three, mapped to [0, 1). */
export function hash3(c: N): N {
  const k = c.mul(uint(1664525)).add(uint(1013904223)).toVar();
  const x = k.x.toVar(), y = k.y.toVar(), z = k.z.toVar();
  x.addAssign(y.mul(z)); y.addAssign(z.mul(x)); z.addAssign(x.mul(y));
  x.assign(x.bitXor(x.shiftRight(uint(16)))); y.assign(y.bitXor(y.shiftRight(uint(16)))); z.assign(z.bitXor(z.shiftRight(uint(16))));
  x.addAssign(y.mul(z)); y.addAssign(z.mul(x)); z.addAssign(x.mul(y));
  return vec3(float(x), float(y), float(z)).mul(1.0 / 4294967296.0);
}

/** A lattice point's index, wrapped into [0, period) and salted with the seed. */
function latticeKey(cell: N, period: number, seed: N): N {
  const w: N = cell.mod(float(period)).add(float(period)).mod(float(period));
  return uvec3(w).add(uvec3(seed, seed.mul(uint(3)), seed.mul(uint(7))));
}

/**
 * Worley F1, inverted (1 at a feature point, falling to ~0 a cell away): billowy, cauliflower cells. `q` in [0, 1)
 * over one tile, `cells` feature cells per tile.
 */
export function worley(q: N, cells: number, seed: N): N {
  const p = q.mul(cells);
  const cell = floor(p);
  const f = p.sub(cell);
  let d: N = float(9.0);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const off = vec3(dx, dy, dz);
    const feature = hash3(latticeKey(cell.add(off), cells, seed));
    d = min(d, length(off.add(feature).sub(f)));
  }
  return saturate(float(1.0).sub(d));
}

const fade = (t: N): N => t.mul(t).mul(t).mul(t.mul(t.mul(6.0).sub(15.0)).add(10.0));

/** Gradient (Perlin) noise with `period` lattice cells per tile, mapped to [0, 1]. */
export function perlin(q: N, period: number, seed: N): N {
  const p = q.mul(period);
  const cell = floor(p);
  const f = p.sub(cell);
  const u = fade(f);
  const corner = (dx: number, dy: number, dz: number): N => {
    const off = vec3(dx, dy, dz);
    const g = hash3(latticeKey(cell.add(off), period, seed)).mul(2.0).sub(1.0);
    return dot(g, f.sub(off));
  };
  const x00 = mix(corner(0, 0, 0), corner(1, 0, 0), u.x), x10 = mix(corner(0, 1, 0), corner(1, 1, 0), u.x);
  const x01 = mix(corner(0, 0, 1), corner(1, 0, 1), u.x), x11 = mix(corner(0, 1, 1), corner(1, 1, 1), u.x);
  const n = mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
  return saturate(n.mul(0.9).add(0.5));
}

/** Octaves at periods base, 2·base, 4·base…, weights halving, normalised to [0, 1]. */
export function fbm(q: N, basePeriod: number, octaves: number, seed: N, noise: (q: N, period: number, seed: N) => N): N {
  let sum: N = float(0.0);
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const w = 0.5 ** o;
    sum = sum.add(noise(q, basePeriod * 2 ** o, seed).mul(w));
    total += w;
  }
  return sum.div(total);
}

/** Remap v from [lo, hi] to [0, 1], clamped (Nubis's remap with a 0..1 target). */
export const remap01 = (v: N, lo: N, hi: N): N => saturate(v.sub(lo).div(max(hi.sub(lo), 1e-4)));

/**
 * The shape texture's value at q (Schneider 2015): Perlin fBm made billowy by Worley fBm (Perlin–Worley), then cut
 * back by a finer Worley fBm, so the cloud reads as rounded heaps with crisp, bubbly edges.
 */
export function cloudShape(q: N, seed: N): { shape: N; perlinWorley: N; lowWorley: N } {
  const pf = fbm(q, 4, 3, seed, perlin);
  const wf = fbm(q, 4, 3, seed, worley);
  const perlinWorley = remap01(pf, wf.sub(1.0), float(1.0));
  const lowWorley = fbm(q, 8, 3, seed, worley);
  // The two remaps leave it bunched high (measured: mean 0.78, std 0.06, 0.48–0.95): stretched over mean ± 2.5 std
  // so the density function sees heaps and gaps, not a uniform lump.
  const raw = remap01(perlinWorley, lowWorley.sub(1.0), float(1.0));
  return { shape: remap01(raw, float(0.63), float(0.93)), perlinWorley, lowWorley };
}

/** The detail texture's value: Worley fBm, eroding the cloud's fringes into wisps. */
export function cloudDetail(q: N, seed: N): N {
  return fbm(q, 2, 3, seed, worley);
}

/** Absolute-value ridges, for streaky cirrus (used by the high layer). */
export function ridged(q: N, period: number, seed: N): N {
  return float(1.0).sub(abs(perlin(q, period, seed).mul(2.0).sub(1.0)));
}
