import { clamp, cos, float, sin, vec3 } from 'three/tsl';

type N = any;

/**
 * The solid boil's billows (whitewater 7b S3, Fable's ruling; photo 1: bright white whitewater in big soft billows whose
 * far sides and troughs fall into shadow). An isotropic 3-D field over (the ribbon's detail x, the height above the tide,
 * its detail z) (m): on the mound's near-vertical face the detail coordinate barely moves (it collapses to the home's xz
 * where the frame's weight is low), so a 2-D field there streaks down the face; the height carries it. Two octaves, each a
 * sum of BILLOW_DIRS cosines along directions spread evenly over the sphere (a Fibonacci spiral; cos is even, so a
 * hemisphere) with fixed phases, drifting slowly. It gives the foam volume a bump normal (its gradient's part along the
 * surface; the steepest ~45°) and its troughs' occlusion (its height). CPU reference; billowNode mirrors.
 */
export const BILLOW_OCTAVES: readonly { wavelengthM: number; weight: number }[] = [{ wavelengthM: 2.5, weight: 0.7 }, { wavelengthM: 0.8, weight: 0.3 }];
export const BILLOW_DIRS = 12;
/** Each cosine's phase runs at this (rad/s): the billows roll slowly, as the churn does. */
export const BILLOW_DRIFT_RAD_S = 0.5;
/** The troughs' occlusion: the sky × ([0] + [1] × h), the sun × ([0] + [1] × h). */
export const BILLOW_SKY: readonly [number, number] = [0.4, 0.6], BILLOW_SUN: readonly [number, number] = [0.6, 0.4];

interface Wave { k: [number, number, number]; phase: number; amp: number }
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const WAVES: Wave[] = BILLOW_OCTAVES.flatMap((o, oi) => Array.from({ length: BILLOW_DIRS }, (_, i) => {
  // The upper hemisphere, evenly by area; each octave turned by a different azimuth.
  const y = 1 - (i + 0.5) / BILLOW_DIRS, r = Math.sqrt(1 - y * y), az = i * GOLDEN + oi * 1.1, k = (2 * Math.PI) / o.wavelengthM;
  const h = Math.sin(i * 12.9898 + oi * 78.233) * 43758.5453;
  return { k: [k * r * Math.cos(az), k * y, k * r * Math.sin(az)], phase: (h - Math.floor(h)) * 2 * Math.PI, amp: o.weight / BILLOW_DIRS };
}));
// f's spread (each cosine's variance amp² / 2) and its gradient's per-axis spread (amp² |k|² / 6: a direction's square
// averages 1/3 per axis).
const SIGMA_F = Math.sqrt(WAVES.reduce((s, w) => s + (w.amp * w.amp) / 2, 0));
const SIGMA_G = Math.sqrt(WAVES.reduce((s, w) => s + (w.amp * w.amp * (w.k[0] ** 2 + w.k[1] ** 2 + w.k[2] ** 2)) / 6, 0));
/** h = 0.5 + f × BILLOW_GAIN, clamped: ±2σ of the field spans [0, 1]. */
const BILLOW_GAIN = 1 / (4 * SIGMA_F);
/** The bump's height per unit f: the 99th percentile of its slope along a surface (a 2-D Rayleigh's 3.03σ) is 1. */
const BILLOW_SLOPE = 1 / (3.03 * SIGMA_G);

/** The field at (x, y, z) m and time t s: h ∈ [0, 1] (the occlusion), the bump (m) and its 3-D gradient. */
export function billowAt(x: number, y: number, z: number, t: number): { h: number; bump: number; gx: number; gy: number; gz: number } {
  let f = 0, fx = 0, fy = 0, fz = 0;
  for (const w of WAVES) {
    const a = w.k[0] * x + w.k[1] * y + w.k[2] * z + w.phase + BILLOW_DRIFT_RAD_S * t;
    f += w.amp * Math.cos(a);
    const s = -w.amp * Math.sin(a);
    fx += s * w.k[0]; fy += s * w.k[1]; fz += s * w.k[2];
  }
  return { h: Math.min(1, Math.max(0, 0.5 + f * BILLOW_GAIN)), bump: f * BILLOW_SLOPE, gx: fx * BILLOW_SLOPE, gy: fy * BILLOW_SLOPE, gz: fz * BILLOW_SLOPE };
}

/** billowAt in TSL: { h, grad: vec3 } at `p` (vec3, m) and time `time`. */
export function billowNode(p: N, time: N): { h: N; grad: N } {
  let f: N = float(0.0), g: N = vec3(0.0);
  for (const w of WAVES) {
    const a = p.x.mul(w.k[0]).add(p.y.mul(w.k[1])).add(p.z.mul(w.k[2])).add(time.mul(BILLOW_DRIFT_RAD_S)).add(w.phase);
    f = f.add(cos(a).mul(w.amp));
    g = g.add(vec3(w.k[0], w.k[1], w.k[2]).mul(sin(a).mul(-w.amp)));
  }
  return { h: clamp(f.mul(BILLOW_GAIN).add(0.5), 0.0, 1.0), grad: g.mul(BILLOW_SLOPE) };
}

/** The troughs' shares of the sky and the sun at billow height h. */
export function billowShares(h: number): { sky: number; sun: number } {
  return { sky: BILLOW_SKY[0] + BILLOW_SKY[1] * h, sun: BILLOW_SUN[0] + BILLOW_SUN[1] * h };
}
export function billowSharesNode(h: N): { sky: N; sun: N } {
  return { sky: float(h).mul(BILLOW_SKY[1]).add(BILLOW_SKY[0]), sun: float(h).mul(BILLOW_SUN[1]).add(BILLOW_SUN[0]) };
}
