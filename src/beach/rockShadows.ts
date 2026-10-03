import { smoothstep } from '../math/smoothstep';

/** The grounding shadows on the fine patch (spec §3.4): 256 × 256 at 0.25 m; per texel (sun shadow, contact ring). */
export const SHADOW_N = 256;
export const SHADOW_CELL_M = 0.25;
const MAX_LEN_M = 12;
const MIN_SUN_SIN = Math.sin((1 * Math.PI) / 180);

/**
 * What casts on the fine patch: a rock (4c-1, strength 1) or a plant (4c-2, strength 0.6; the low plants only darken
 * their contact ring). A rock is one as it is.
 */
export interface ShadowCaster {
  x: number;
  z: number;
  radius: number;
  height: number;
  strength?: number;
  ringOnly?: boolean;
  /** The sun shadow's longest reach (default 12 m, the rocks'). */
  maxLenM?: number;
  /**
   * A kit plant's canopy from above (dune-up-close §4.5): an n² alpha over its footprint (radius), turned by yaw. The sun
   * shadow is the crown's silhouette cast from 60% of its height, so its gaps let the sun through (dappled shade), and
   * the floor under it darkens by it (the heath floor's mask, sharpened).
   */
  silhouette?: { alpha: Uint8Array; n: number; yaw: number };
}

/** A silhouette's alpha (0–1) at (u, v) in [−1, 1]² of its footprint (nearest texel; 0 outside). */
function silhouetteAt(s: { alpha: Uint8Array; n: number }, u: number, v: number): number {
  if (u <= -1 || u >= 1 || v <= -1 || v >= 1) return 0;
  const i = Math.min(s.n - 1, Math.floor(((u + 1) / 2) * s.n)), j = Math.min(s.n - 1, Math.floor(((v + 1) / 2) * s.n));
  return s.alpha[j * s.n + i] / 255;
}

export function buildGroundShadows(
  rocks: readonly ShadowCaster[], cornerX: number, cornerZ: number, sun: readonly [number, number, number], opts: { bruteForce?: boolean } = {},
): Float32Array {
  const out = new Float32Array(SHADOW_N * SHADOW_N * 2);
  const horiz = Math.hypot(sun[0], sun[2]);
  const castSun = sun[1] > MIN_SUN_SIN && horiz > 1e-4;
  const dx = castSun ? -sun[0] / horiz : 0, dz = castSun ? -sun[2] / horiz : 0;
  const tanEl = castSun ? sun[1] / horiz : 1;
  for (const r of rocks) {
    const s0 = r.strength ?? 1;
    const len = castSun && !r.ringOnly ? Math.min(r.maxLenM ?? MAX_LEN_M, r.height / tanEl) : 0;
    if (r.silhouette) {
      castSilhouette(out, r, r.silhouette, cornerX, cornerZ, castSun ? Math.min(r.maxLenM ?? MAX_LEN_M, (0.6 * r.height) / tanEl) : 0, dx, dz, s0);
      continue;
    }
    const ex = r.x + dx * len, ez = r.z + dz * len;
    const pad = r.radius * 1.4;
    const i0 = Math.max(0, Math.floor((Math.min(r.x, ex) - pad - cornerX) / SHADOW_CELL_M));
    const i1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.x, ex) + pad - cornerX) / SHADOW_CELL_M));
    const j0 = Math.max(0, Math.floor((Math.min(r.z, ez) - pad - cornerZ) / SHADOW_CELL_M));
    const j1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.z, ez) + pad - cornerZ) / SHADOW_CELL_M));
    // Everything a rock draws lies within 1.3 × its radius of its shadow's axis (the ring's reach; the shadow is at most
    // 1.1 × wide): each row visits only the columns that capsule spans (bruteForce: the whole box, for the tests).
    const rho = r.radius * 1.3;
    for (let j = j0; j <= j1; j++) {
      let ia = i0, ib = i1;
      if (!opts.bruteForce) {
        const pz = cornerZ + (j + 0.5) * SHADOW_CELL_M - r.z;
        let ta = 0, tb = len;
        if (Math.abs(dz) > 1e-6) {
          const u = (pz - rho) / dz, v = (pz + rho) / dz;
          ta = Math.max(0, Math.min(u, v));
          tb = Math.min(len, Math.max(u, v));
        } else if (Math.abs(pz) > rho) continue;
        if (ta > tb) continue;
        const xa = r.x + dx * ta, xb = r.x + dx * tb;
        ia = Math.max(i0, Math.floor((Math.min(xa, xb) - rho - cornerX) / SHADOW_CELL_M) - 1);
        ib = Math.min(i1, Math.ceil((Math.max(xa, xb) + rho - cornerX) / SHADOW_CELL_M) + 1);
      }
      for (let i = ia; i <= ib; i++) {
        const px = cornerX + (i + 0.5) * SHADOW_CELL_M - r.x, pz = cornerZ + (j + 0.5) * SHADOW_CELL_M - r.z;
        const k = (j * SHADOW_N + i) * 2;
        const dist = Math.sqrt(px * px + pz * pz);
        out[k + 1] = Math.max(out[k + 1], 0.8 * s0 * (1 - smoothstep(r.radius * 0.8, r.radius * 1.3, dist)));
        if (len > 0) {
          const t = Math.min(len, Math.max(0, px * dx + pz * dz));
          const qx = px - dx * t, qz = pz - dz * t;
          const w = r.radius * (1 - (0.5 * t) / len);
          const s = (1 - smoothstep(w * 0.7, w * 1.1, Math.sqrt(qx * qx + qz * qz))) * (1 - smoothstep(0.7 * len, len, t));
          // Only behind the rock's sunward face: the part of the capsule on the sun side of the centre is the rock itself.
          if (px * dx + pz * dz > -r.radius * 0.2) out[k] = Math.max(out[k], s * s0);
        }
      }
    }
  }
  return out;
}

/**
 * A canopy silhouette's shadow: each texel within its reach looks back along the sun to the crown's plane (`lenM`
 * behind it) and takes the silhouette's alpha there; and under the plant, the floor darkens by the silhouette itself.
 */
function castSilhouette(out: Float32Array, r: ShadowCaster, s: { alpha: Uint8Array; n: number; yaw: number }, cornerX: number, cornerZ: number, lenM: number, dx: number, dz: number, s0: number): void {
  // Into the plant's own frame (the inverse of its instance's yaw: local x = cos·dx − sin·dz, local z = sin·dx + cos·dz).
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), rad = r.radius;
  const ex = r.x + dx * lenM, ez = r.z + dz * lenM;
  const i0 = Math.max(0, Math.floor((Math.min(r.x, ex) - rad - cornerX) / SHADOW_CELL_M));
  const i1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.x, ex) + rad - cornerX) / SHADOW_CELL_M));
  const j0 = Math.max(0, Math.floor((Math.min(r.z, ez) - rad - cornerZ) / SHADOW_CELL_M));
  const j1 = Math.min(SHADOW_N - 1, Math.ceil((Math.max(r.z, ez) + rad - cornerZ) / SHADOW_CELL_M));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = cornerX + (i + 0.5) * SHADOW_CELL_M, pz = cornerZ + (j + 0.5) * SHADOW_CELL_M, k = (j * SHADOW_N + i) * 2;
      // Under it: the floor, darker by the canopy over it.
      const ux = (px - r.x) / rad, uz = (pz - r.z) / rad;
      const under = silhouetteAt(s, ux * c - uz * sn, ux * sn + uz * c);
      if (under > 0) out[k + 1] = Math.max(out[k + 1], 0.5 * under * s0);
      if (lenM <= 0) continue;
      // The sun's shadow: the crown's point the sun passes through on its way here.
      const qx = (px - dx * lenM - r.x) / rad, qz = (pz - dz * lenM - r.z) / rad;
      const a = silhouetteAt(s, qx * c - qz * sn, qx * sn + qz * c);
      if (a > 0) out[k] = Math.max(out[k], a * s0);
    }
  }
}
