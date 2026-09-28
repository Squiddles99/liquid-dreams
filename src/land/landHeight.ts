import { smoothstep } from '../math/smoothstep';
import { SHORE_FLAT_DEPTH_M, SHORE_X, depthBg } from '../seabed/coastProfile';
import { valueNoise2 } from '../seabed/noise';
import type { GridSpec, LandFile } from './landData';

/** The hand-shaped beach (spec §4.3.3, Ruling L2): widths inland of the waterline and heights at their ends (m). */
export interface BeachProfile {
  wetWidthM: number;
  dryWidthM: number;
  toeWidthM: number;
  /** The real data takes over completely this far inland. */
  blendEndM: number;
  wetTopM: number;
  beachTopM: number;
  toeTopM: number;
}

export const DEFAULT_BEACH: Readonly<BeachProfile> = { wetWidthM: 12, dryWidthM: 28, toeWidthM: 15, blendEndM: 120, wetTopM: 0.8, beachTopM: 2.5, toeTopM: 6 };

/** The reef map's centre along the coast; the waterline is pinned at SHORE_X within PIN_HALF_M of it (spec L3). */
export const REEF_CENTRE_Z = -75;
export const PIN_HALF_M = 600;
export const PIN_BLEND_M = 400;
/** The waterline curves are sampled every COAST_DZ m of z from COAST_Z0 (both ends inclusive). */
export const COAST_Z0 = -15000;
export const COAST_DZ = 4;
export const COAST_NZ = (2 * -COAST_Z0) / COAST_DZ + 1;
const COAST_SMOOTH_M = 400;
/** The fine grid hands over to the ring over its last FINE_EDGE_M (all four edges); the ring tapers to 0 at its own. */
const FINE_EDGE_M = 200;
const RING_TAPER_Z_M = 1500;
const RING_TAPER_X_M = 800;
/** The fine waterline hands over to the ring's between |z| = 3800 and 4000. */
const WATERLINE_HANDOVER: [number, number] = [3800, 4000];

/** The beach's height (m above mean sea level) d m inland of the waterline; seaward (d < 0), the coast profile's seabed. */
export function beachHeight(d: number, p: BeachProfile = DEFAULT_BEACH): number {
  if (d < 0) return -depthBg(SHORE_X + d);
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM, low = -SHORE_FLAT_DEPTH_M;
  if (d < wetEnd) return low + (p.wetTopM - low) * (d / wetEnd);
  if (d < dryEnd) return p.wetTopM + (p.beachTopM - p.wetTopM) * ((d - wetEnd) / p.dryWidthM) ** 1.4;
  if (d < toeEnd) return p.beachTopM + (p.toeTopM - p.beachTopM) * smoothstep(dryEnd, toeEnd, d);
  return p.toeTopM + 0.25 * (d - toeEnd);
}

function bilinear(g: GridSpec, h: Float32Array, x: number, z: number): number {
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM;
  const i = Math.min(g.nx - 2, Math.max(0, Math.floor(fx))), j = Math.min(g.nz - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j)), k = j * g.nx + i;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz;
}

const edgeDistance = (g: GridSpec, x: number, z: number): number =>
  Math.min(x - g.x0, g.x0 + (g.nx - 1) * g.cellM - x, z - g.z0, g.z0 + (g.nz - 1) * g.cellM - z);

/** A per-row waterline array at z (linear between rows; NaN outside or where a row has none). */
function rowValue(g: GridSpec, w: Float32Array, z: number): number {
  const f = (z - g.z0) / g.cellM;
  if (f < 0 || f > g.nz - 1) return NaN;
  const j = Math.min(g.nz - 2, Math.floor(f)), t = f - j;
  return w[j] * (1 - t) + w[j + 1] * t;
}

/**
 * The land's height (spec §4.3): the waterline pinned at the reef, the hand-shaped beach, then the real data measured
 * from its own waterline, plus small detail. CPU only (plan ruling P4): the mesh carries the heights.
 */
export class LandHeight {
  readonly profile: BeachProfile;
  private readonly file: LandFile;
  private readonly xr = new Float32Array(COAST_NZ);
  private readonly xs = new Float32Array(COAST_NZ);

  constructor(file: LandFile, profile: BeachProfile = DEFAULT_BEACH) {
    this.file = file;
    this.profile = { ...profile };
    const raw = new Float32Array(COAST_NZ);
    for (let k = 0; k < COAST_NZ; k++) {
      const z = COAST_Z0 + k * COAST_DZ;
      const f = rowValue(file.fine, file.fineWaterline, z), r = rowValue(file.ring, file.ringWaterline, z);
      const w = smoothstep(WATERLINE_HANDOVER[0], WATERLINE_HANDOVER[1], Math.abs(z));
      raw[k] = !Number.isFinite(f) ? r : !Number.isFinite(r) ? f : f + (r - f) * w;
    }
    // Fill gaps (rows with no land) from the nearest valid row, then a 400 m moving average (prefix sums).
    let last = NaN;
    for (let k = 0; k < COAST_NZ; k++) { if (Number.isFinite(raw[k])) last = raw[k]; else raw[k] = last; }
    last = NaN;
    for (let k = COAST_NZ - 1; k >= 0; k--) { if (Number.isFinite(raw[k])) last = raw[k]; else raw[k] = Number.isFinite(last) ? last : SHORE_X; }
    const half = COAST_SMOOTH_M / COAST_DZ / 2, prefix = new Float64Array(COAST_NZ + 1);
    for (let k = 0; k < COAST_NZ; k++) prefix[k + 1] = prefix[k] + raw[k];
    for (let k = 0; k < COAST_NZ; k++) {
      const a = Math.max(0, k - half), b = Math.min(COAST_NZ - 1, k + half);
      this.xr[k] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
      const z = COAST_Z0 + k * COAST_DZ;
      const pin = smoothstep(PIN_HALF_M, PIN_HALF_M + PIN_BLEND_M, Math.abs(z - REEF_CENTRE_Z));
      this.xs[k] = pin === 0 ? SHORE_X : SHORE_X + (this.xr[k] - SHORE_X) * pin;
    }
  }

  private curve(a: Float32Array, z: number): number {
    const f = Math.min(COAST_NZ - 1, Math.max(0, (z - COAST_Z0) / COAST_DZ));
    const k = Math.min(COAST_NZ - 2, Math.floor(f)), t = f - k;
    return t === 0 ? a[k] : a[k] * (1 - t) + a[k + 1] * t;
  }

  /** x_r(z): the smoothed real waterline. */
  realWaterlineAt(z: number): number {
    return this.curve(this.xr, z);
  }

  /** x_s(z): the waterline the land and the seabed use (190 m around the reef). */
  waterlineAt(z: number): number {
    // Exact inside the pin: interpolating the 4 m samples would mix in one from just outside it at the pin's edge.
    if (Math.abs(z - REEF_CENTRE_Z) <= PIN_HALF_M) return SHORE_X;
    return this.curve(this.xs, z);
  }

  /** The data's height: the fine grid, handing over to the ring near its edges; the ring tapers to 0 at its own. */
  demAt(x: number, z: number): number {
    const { fine, ring } = this.file;
    const er = edgeDistance(ring, x, z);
    if (er < 0) return 0;
    const taper = smoothstep(0, RING_TAPER_Z_M, ring.z0 + (ring.nz - 1) * ring.cellM - Math.abs(z)) *
      smoothstep(0, RING_TAPER_X_M, ring.x0 + (ring.nx - 1) * ring.cellM - x);
    const r = bilinear(ring, this.file.ringHeights, x, z) * taper;
    const wf = smoothstep(0, FINE_EDGE_M, edgeDistance(fine, x, z));
    return wf <= 0 ? r : r + (bilinear(fine, this.file.fineHeights, x, z) - r) * wf;
  }

  /** The composed height at (x, z) (m above mean sea level). */
  heightAt(x: number, z: number): number {
    const p = this.profile, xs = this.waterlineAt(z), d = x - xs;
    const toeEnd = p.wetWidthM + p.dryWidthM + p.toeWidthM;
    let h = beachHeight(d, p);
    if (d > toeEnd) {
      // The data measured from its own waterline, so the dune stays attached to the beach where the waterline is pinned.
      const dem = this.demAt(x + (this.realWaterlineAt(z) - xs), z);
      h = Math.max(p.beachTopM, h + (dem - h) * smoothstep(toeEnd, p.blendEndM, d));
    }
    return h + this.detail(x, z, d);
  }

  /** Small relief: ±0.15 m on the sand, ±1.5 m on the rock band and the heath. */
  private detail(x: number, z: number, d: number): number {
    if (d <= 0) return 0;
    const n = 0.5 * (0.65 * valueNoise2(x / 7, z / 7, 411) + 0.35 * valueNoise2(x / 2.3, z / 2.3, 412));
    const dryEnd = this.profile.wetWidthM + this.profile.dryWidthM;
    const amp = d < dryEnd - 2 ? 0.3 * smoothstep(0, 6, d) : 0.3 + 2.7 * smoothstep(dryEnd - 2, dryEnd + 2, d);
    return n * amp;
  }

  /** The baked sky-view factor (1 outside its grid). */
  skyViewAt(x: number, z: number): number {
    const g = this.file.sky;
    return edgeDistance(g, x, z) < 0 ? 1 : bilinear(g, this.file.skyView, x, z);
  }

  /** x_s every stepM from COAST_Z0 to −COAST_Z0 inclusive (Seabed.setWaterline). */
  waterlineSamples(stepM: number): Float32Array {
    const n = Math.round((2 * -COAST_Z0) / stepM) + 1, out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.waterlineAt(COAST_Z0 + i * stepM);
    return out;
  }
}
