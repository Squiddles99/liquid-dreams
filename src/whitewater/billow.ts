import * as THREE from 'three/webgpu';
import { abs, clamp, float, fract, smoothstep, sqrt, texture3D, vec3 } from 'three/tsl';

type N = any;

/**
 * The white water's billows (whitewater 7b S3; breaking-look item 1 + lever L1). Real white water (task8 reference-back,
 * reference-womb-1/2) shows billows at three scales: metres, ~0.5 m clumps and a grain. One isotropic, periodic 3-D field
 * (the TILE: cosines on the integer lattice, so it tiles a cube) is baked at boot into a 64³ texture (R = the field, GBA its
 * gradient) and read three times, once per octave, each at its own scale, rotation and offset: 2.5 m and 0.8 m give the
 * occlusion height (h) and the clumps (the 0.8 m octave alone, for the cover and brightness), and all three bump the
 * normal (the 0.25 m octave is the grain). It replaces 24 cos + 24 sin per fragment (L1).
 *
 * Coordinates are (the surface's detail x, the height above the tide, its detail z) (m). The field moves with the bore:
 * advected at `flow` (m/s, world xyz; the bore's speed along travel plus a slow rise), as a two-phase flow blend (two
 * reads half a period apart, cross-faded, renormalised so the contrast holds), so it travels without stretching.
 * CPU reference: billowAt (the exact cosine field); billowNode reads the texture (≡ within the bake's interpolation).
 */
export const BILLOW_TILE_N = 64;
/** The tile field's wavelength is the tile / BILLOW_TILE_CYCLES (~21 texels a cycle). */
export const BILLOW_TILE_CYCLES = 3;
export const BILLOW_DIRS = 12;
/** The octaves: wavelength (m), share of the occlusion height h (0 = normal only), the bump's slope share. */
export const BILLOW_OCTAVES: readonly { wavelengthM: number; heightWeight: number; slopeWeight: number }[] = [
  { wavelengthM: 2.5, heightWeight: 0.7, slopeWeight: 0.55 },
  { wavelengthM: 0.8, heightWeight: 0.3, slopeWeight: 0.3 },
  { wavelengthM: 0.25, heightWeight: 0, slopeWeight: 0.25 },
];
/** The flow blend's period (s): each read's offset resets every period, at zero weight. */
export const BILLOW_FLOW_PERIOD_S = 2;
/** The billows' slow rise (m/s) on top of the bore's push: white water boils up as it rolls in. */
export const BILLOW_RISE_MS = 0.3;
/** The troughs' occlusion: the sky × ([0] + [1] × h), the sun × ([0] + [1] × h). */
export const BILLOW_SKY: readonly [number, number] = [0.4, 0.6], BILLOW_SUN: readonly [number, number] = [0.6, 0.4];

interface TileWave { m: [number, number, number]; phase: number }
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** The tile's waves: BILLOW_DIRS directions spread evenly over the upper hemisphere, snapped to the integer lattice at
 * radius BILLOW_TILE_CYCLES (so the field is periodic over the unit cube), duplicates dropped. */
export const TILE_WAVES: readonly TileWave[] = (() => {
  const seen = new Set<string>(), out: TileWave[] = [];
  for (let i = 0; out.length < BILLOW_DIRS && i < 200; i++) {
    const y = 1 - (i % BILLOW_DIRS + 0.5) / BILLOW_DIRS, r = Math.sqrt(1 - y * y), az = i * GOLDEN + Math.floor(i / BILLOW_DIRS) * 0.37;
    const m: [number, number, number] = [Math.round(BILLOW_TILE_CYCLES * r * Math.cos(az)), Math.round(BILLOW_TILE_CYCLES * y), Math.round(BILLOW_TILE_CYCLES * r * Math.sin(az))];
    const key = m.join(','), neg = m.map((v) => -v).join(',');
    if (seen.has(key) || seen.has(neg) || (m[0] === 0 && m[1] === 0 && m[2] === 0)) continue;
    seen.add(key);
    const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    out.push({ m, phase: (h - Math.floor(h)) * 2 * Math.PI });
  }
  return out;
})();
/** Each cosine's amplitude: the tile field has unit variance. */
const TILE_AMP = Math.sqrt(2 / TILE_WAVES.length);
/** The tile field's gradient (per tile unit) spread per axis: Σ amp² (2π|m|)² / 2 / 3. */
const TILE_SIGMA_G = Math.sqrt(TILE_WAVES.reduce((s, w) => s + (TILE_AMP ** 2 * (2 * Math.PI) ** 2 * (w.m[0] ** 2 + w.m[1] ** 2 + w.m[2] ** 2)) / 6, 0));

/** The tile field at (u, v, w) tile units: unit variance, periodic over 1; its gradient per tile unit. */
export function tileField(u: number, v: number, w: number): [number, number, number, number] {
  let f = 0, gu = 0, gv = 0, gw = 0;
  for (const t of TILE_WAVES) {
    const a = 2 * Math.PI * (t.m[0] * u + t.m[1] * v + t.m[2] * w) + t.phase;
    f += TILE_AMP * Math.cos(a);
    const s = -TILE_AMP * 2 * Math.PI * Math.sin(a);
    gu += s * t.m[0]; gv += s * t.m[1]; gw += s * t.m[2];
  }
  return [f, gu, gv, gw];
}

/** Each octave's frame: a fixed rotation (rows) and offset (tile units), so the octaves' lattices never line up. */
const rot = (a: number, b: number, c: number): number[][] => {
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  // Rz(c) · Ry(b) · Rx(a)
  return [
    [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa],
    [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa],
    [-sb, cb * sa, cb * ca],
  ];
};
const OCTAVE_ROT = [rot(0.3, 0.7, 0.2), rot(1.1, -0.4, 2.3), rot(-0.8, 1.3, 0.9)];
const OCTAVE_OFF = [[0.13, 0.57, 0.31], [0.71, 0.29, 0.83], [0.47, 0.91, 0.05]];
/** The second flow read's extra offset (tile units): the two reads are different billows. */
const PHASE_OFF = [0.5, 0.25, 0.75];
const SCALE = BILLOW_OCTAVES.map((o) => 1 / (o.wavelengthM * BILLOW_TILE_CYCLES));
/** h = 0.5 + Σ heightWeight f / norm × BILLOW_GAIN: ±2σ spans [0, 1]. */
const H_NORM = Math.hypot(...BILLOW_OCTAVES.map((o) => o.heightWeight));
const BILLOW_GAIN = 0.25;
/** The bump: Σ slopeWeight × f × λ/(2π·cycles)… scaled so the 99th percentile of its slope along a surface is ~1 (45°). */
const SLOPE_NORM = Math.hypot(...BILLOW_OCTAVES.map((o) => o.slopeWeight));
const BUMP_AMP = BILLOW_OCTAVES.map((o, i) => (o.slopeWeight / SLOPE_NORM) / (3.03 * TILE_SIGMA_G * SCALE[i]));

/** The two flow reads' weights and ages (s) at time t: triangles, each 0 at its reset; weights normalised in contrast. */
export function flowPhases(t: number): { age: [number, number]; w: [number, number] } {
  const f0 = ((t / BILLOW_FLOW_PERIOD_S) % 1 + 1) % 1, f1 = (f0 + 0.5) % 1;
  const w0 = 1 - Math.abs(2 * f0 - 1), w1 = 1 - Math.abs(2 * f1 - 1), n = Math.hypot(w0, w1);
  return { age: [f0 * BILLOW_FLOW_PERIOD_S, f1 * BILLOW_FLOW_PERIOD_S], w: [w0 / n, w1 / n] };
}

export interface Billow { h: number; clump: number; bump: number; gx: number; gy: number; gz: number }

/**
 * The field at (x, y, z) m and time t s, flowing at `flow` (m/s; absent: still, + the rise): h ∈ [0, 1] (the occlusion),
 * the clumps ∈ [0, 1] (the 0.8 m octave), the bump (m) and its 3-D gradient. `lod` (m per pixel, absent 0): an octave
 * whose wavelength is under ~4 pixels fades out (its read returns the field's mean, 0).
 */
export function billowAt(x: number, y: number, z: number, t: number, flow: [number, number, number] = [0, 0, 0], lod = 0): Billow {
  const { age, w } = flowPhases(t);
  const vel = [flow[0], flow[1] + BILLOW_RISE_MS, flow[2]];
  let hs = 0, clump = 0, bump = 0, gx = 0, gy = 0, gz = 0;
  BILLOW_OCTAVES.forEach((o, i) => {
    const fade = 1 - smoothstepCpu(0.15, 0.3, lod * SCALE[i] * BILLOW_TILE_CYCLES);
    let f = 0, g = [0, 0, 0];
    for (let k = 0; k < 2; k++) {
      const p = [x - vel[0] * age[k], y - vel[1] * age[k], z - vel[2] * age[k]];
      const R = OCTAVE_ROT[i], s = SCALE[i];
      const q = [0, 1, 2].map((r) => (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) * s + OCTAVE_OFF[i][r] + k * PHASE_OFF[r]);
      const [tf, tu, tv, tw] = tileField(q[0], q[1], q[2]);
      f += w[k] * tf;
      // d/dp = s Rᵀ ∇tile
      for (let c = 0; c < 3; c++) g[c] += w[k] * s * (R[0][c] * tu + R[1][c] * tv + R[2][c] * tw);
    }
    f *= fade; g = g.map((v) => v * fade);
    hs += (o.heightWeight / H_NORM) * f;
    if (i === 1) clump = f;
    bump += BUMP_AMP[i] * f;
    gx += BUMP_AMP[i] * g[0]; gy += BUMP_AMP[i] * g[1]; gz += BUMP_AMP[i] * g[2];
  });
  return { h: Math.min(1, Math.max(0, 0.5 + hs * BILLOW_GAIN)), clump: Math.min(1, Math.max(0, 0.5 + clump * 0.5)), bump, gx, gy, gz };
}

function smoothstepCpu(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The baked tile: RGBA half floats, texel (i, j, k) the field at ((i + ½)/N, (j + ½)/N, (k + ½)/N), its gradient /
 * BILLOW_GRAD_SCALE (so the half floats keep their precision near 1). */
export const BILLOW_GRAD_SCALE = 2 * Math.PI * BILLOW_TILE_CYCLES;
export function bakeBillowTile(n = BILLOW_TILE_N): Float32Array {
  const out = new Float32Array(n * n * n * 4);
  // Separable: each wave's cos/sin is a product of per-axis rotations (angle sums), done per axis once.
  const W = TILE_WAVES.length;
  const axis = (c: number) => TILE_WAVES.map((t) => Array.from({ length: n }, (_, i) => 2 * Math.PI * t.m[c] * ((i + 0.5) / n)));
  const ax = axis(0), ay = axis(1), az = axis(2);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let f = 0, gu = 0, gv = 0, gw = 0;
    for (let q = 0; q < W; q++) {
      const t = TILE_WAVES[q], a = ax[q][i] + ay[q][j] + az[q][k] + t.phase;
      const c = Math.cos(a), s = -Math.sin(a) * 2 * Math.PI;
      f += c; gu += s * t.m[0]; gv += s * t.m[1]; gw += s * t.m[2];
    }
    const o = ((k * n + j) * n + i) * 4;
    out[o] = f * TILE_AMP; out[o + 1] = (gu * TILE_AMP) / BILLOW_GRAD_SCALE; out[o + 2] = (gv * TILE_AMP) / BILLOW_GRAD_SCALE; out[o + 3] = (gw * TILE_AMP) / BILLOW_GRAD_SCALE;
  }
  return out;
}

let tileTexture: THREE.Data3DTexture | null = null;
/** The baked tile on the GPU (built once, on first use). */
export function billowTexture(): THREE.Data3DTexture {
  if (tileTexture) return tileTexture;
  const n = BILLOW_TILE_N, f = bakeBillowTile(n), half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(f[i]);
  const t = new THREE.Data3DTexture(half, n, n, n);
  t.format = THREE.RGBAFormat;
  t.type = THREE.HalfFloatType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  tileTexture = t;
  return t;
}

/** billowAt in TSL: { h, clump, grad: vec3 } at `p` (vec3, m), time `time`, flowing at `flow` (vec3 m/s, absent still),
 * octaves faded by `lod` (m per pixel; absent 0). Six texture reads (two flow reads × three octaves). */
export function billowNode(p: N, time: N, flow: N = vec3(0.0), lod: N = float(0.0)): { h: N; clump: N; grad: N } {
  const tex = billowTexture();
  const ph = fract(float(time).div(BILLOW_FLOW_PERIOD_S));
  const f0 = ph, f1 = fract(ph.add(0.5));
  const w0r = float(1.0).sub(abs(f0.mul(2.0).sub(1.0))), w1r = float(1.0).sub(abs(f1.mul(2.0).sub(1.0)));
  const wn = sqrt(w0r.mul(w0r).add(w1r.mul(w1r)));
  const w = [w0r.div(wn), w1r.div(wn)], age = [f0.mul(BILLOW_FLOW_PERIOD_S), f1.mul(BILLOW_FLOW_PERIOD_S)];
  const vel = vec3(flow).add(vec3(0.0, BILLOW_RISE_MS, 0.0));
  let hs: N = float(0.0), clump: N = float(0.0), g: N = vec3(0.0);
  BILLOW_OCTAVES.forEach((o, i) => {
    const R = OCTAVE_ROT[i], s = SCALE[i];
    const fade = float(1.0).sub(smoothstep(0.15, 0.3, float(lod).mul(s * BILLOW_TILE_CYCLES)));
    let f: N = float(0.0), gt: N = vec3(0.0);
    for (let k = 0; k < 2; k++) {
      const q0 = vec3(p).sub(vel.mul(age[k]));
      const q = vec3(
        q0.x.mul(R[0][0]).add(q0.y.mul(R[0][1])).add(q0.z.mul(R[0][2])).mul(s).add(OCTAVE_OFF[i][0] + k * PHASE_OFF[0]),
        q0.x.mul(R[1][0]).add(q0.y.mul(R[1][1])).add(q0.z.mul(R[1][2])).mul(s).add(OCTAVE_OFF[i][1] + k * PHASE_OFF[1]),
        q0.x.mul(R[2][0]).add(q0.y.mul(R[2][1])).add(q0.z.mul(R[2][2])).mul(s).add(OCTAVE_OFF[i][2] + k * PHASE_OFF[2]),
      );
      const t = texture3D(tex, q).level(float(0));
      f = f.add(t.x.mul(w[k]));
      gt = gt.add(t.yzw.mul(w[k]));
    }
    // d/dp = s Rᵀ ∇tile (the texture holds ∇tile / BILLOW_GRAD_SCALE)
    const gs = gt.mul(s * BILLOW_GRAD_SCALE);
    const gw = vec3(
      gs.x.mul(R[0][0]).add(gs.y.mul(R[1][0])).add(gs.z.mul(R[2][0])),
      gs.x.mul(R[0][1]).add(gs.y.mul(R[1][1])).add(gs.z.mul(R[2][1])),
      gs.x.mul(R[0][2]).add(gs.y.mul(R[1][2])).add(gs.z.mul(R[2][2])),
    );
    const ff = f.mul(fade);
    if (o.heightWeight > 0) hs = hs.add(ff.mul(o.heightWeight / H_NORM));
    if (i === 1) clump = ff;
    g = g.add(gw.mul(fade).mul(BUMP_AMP[i]));
  });
  return { h: clamp(hs.mul(BILLOW_GAIN).add(0.5), 0.0, 1.0), clump: clamp(clump.mul(0.5).add(0.5), 0.0, 1.0), grad: g };
}

/** The troughs' shares of the sky and the sun at billow height h. */
export function billowShares(h: number): { sky: number; sun: number } {
  return { sky: BILLOW_SKY[0] + BILLOW_SKY[1] * h, sun: BILLOW_SUN[0] + BILLOW_SUN[1] * h };
}
export function billowSharesNode(h: N): { sky: N; sun: N } {
  return { sky: float(h).mul(BILLOW_SKY[1]).add(BILLOW_SKY[0]), sun: float(h).mul(BILLOW_SUN[1]).add(BILLOW_SUN[0]) };
}


/** The silhouette's lift (item 1): the wall's outline is the billows', not the mesh's smooth line. The 2.5 m octave alone
 * (the field ∈ ~[−2, 2]) × BILLOW_LIFT_SHARE × the wave's height × the solid share, along the surface normal. */
export const BILLOW_LIFT_SHARE = 0.15;
export function billowLiftAt(x: number, y: number, z: number, t: number, flow: [number, number, number], A: number, solid: number): number {
  const { age, w } = flowPhases(t);
  const vel = [flow[0], flow[1] + BILLOW_RISE_MS, flow[2]], R = OCTAVE_ROT[0], s = SCALE[0];
  let f = 0;
  for (let k = 0; k < 2; k++) {
    const p = [x - vel[0] * age[k], y - vel[1] * age[k], z - vel[2] * age[k]];
    const q = [0, 1, 2].map((r) => (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) * s + OCTAVE_OFF[0][r] + k * PHASE_OFF[r]);
    f += w[k] * tileField(q[0], q[1], q[2])[0];
  }
  return f * BILLOW_LIFT_SHARE * A * solid;
}
export function billowLiftNode(p: N, time: N, flow: N, A: N, solid: N): N {
  const tex = billowTexture();
  const ph = fract(float(time).div(BILLOW_FLOW_PERIOD_S)), f1p = fract(ph.add(0.5));
  const w0r = float(1.0).sub(abs(ph.mul(2.0).sub(1.0))), w1r = float(1.0).sub(abs(f1p.mul(2.0).sub(1.0)));
  const wn = sqrt(w0r.mul(w0r).add(w1r.mul(w1r)));
  const vel = vec3(flow).add(vec3(0.0, BILLOW_RISE_MS, 0.0)), R = OCTAVE_ROT[0], s = SCALE[0];
  let f: N = float(0.0);
  [[ph, w0r], [f1p, w1r]].forEach(([fr, wr], k) => {
    const q0 = vec3(p).sub(vel.mul(fr.mul(BILLOW_FLOW_PERIOD_S)));
    const q = vec3(
      q0.x.mul(R[0][0]).add(q0.y.mul(R[0][1])).add(q0.z.mul(R[0][2])).mul(s).add(OCTAVE_OFF[0][0] + k * PHASE_OFF[0]),
      q0.x.mul(R[1][0]).add(q0.y.mul(R[1][1])).add(q0.z.mul(R[1][2])).mul(s).add(OCTAVE_OFF[0][1] + k * PHASE_OFF[1]),
      q0.x.mul(R[2][0]).add(q0.y.mul(R[2][1])).add(q0.z.mul(R[2][2])).mul(s).add(OCTAVE_OFF[0][2] + k * PHASE_OFF[2]),
    );
    f = f.add(texture3D(tex, q).level(float(0)).x.mul(wr.div(wn)));
  });
  return f.mul(BILLOW_LIFT_SHARE).mul(A).mul(solid);
}
