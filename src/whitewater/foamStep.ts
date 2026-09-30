/**
 * The foam field's CPU reference (spec 2026-09-27-foam-field-design.md §3.1): the box, the params, the 20 Hz tick
 * schedule and one step on a grid. FoamField.ts mirrors it on the GPU. The map is indexed by the sheet's undisplaced
 * (base) xz, so foam rides the swell and chop with the water; only the net shoreward drift is simulated here.
 */

/** A world-space grid: texel (0, 0)'s corner at (x0, z0); texel (c, r)'s centre at (x0 + (c + 0.5)·cellM, z0 + (r + 0.5)·cellM). Row = z. */
export interface FoamGrid {
  x0: number;
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

/**
 * The foam box (plan ruling R1): x −320…210, z −450…300 at 1 m. It covers every breaking cell in the water for the
 * slider extreme with 20 m of seaward margin (foamStep.test.ts; the softened ledge of the barrel-from-maths plan moved
 * the biggest breaks ~75 m seaward, from −245); north and south it ends with the reef grid, beyond which the field is
 * the straight coast and the placeholder foam stands.
 */
export const FOAM_GRID: Readonly<FoamGrid> = { x0: -320, z0: -450, cellM: 1, nx: 530, nz: 750 };

export interface FoamParams {
  /** Foam falls linearly from 1 to 0 over this long once its source stops (s). */
  clearTimeS: number;
  /** Net shoreward drift along the local wave direction (m/s). */
  driftMps: number;
}

export const DEFAULT_FOAM_PARAMS: Readonly<FoamParams> = { clearTimeS: 10, driftMps: 0.4 };
export const FOAM_PARAM_RANGES = { clearTimeS: { min: 2, max: 30 }, driftMps: { min: 0, max: 2 } } as const;

export function normalizeFoamParams(p: FoamParams): void {
  for (const k of Object.keys(FOAM_PARAM_RANGES) as (keyof FoamParams)[]) {
    const r = FOAM_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_FOAM_PARAMS[k];
  }
}

/** Steps run at tₖ = k / FOAM_TICKS_PER_S in sim time, never per frame, so the map depends on sim time only. */
export const FOAM_TICKS_PER_S = 20;
export const FOAM_TICK_S = 1 / FOAM_TICKS_PER_S;
/** A replay covers clearTime plus this (s): the float margin that lets foam older than clearTime reach exactly 0. */
export const REPLAY_MARGIN_S = 2;
/** Sim time moving forward by more than this (s) between frames is treated as a jump (the safety net). */
export const FOAM_JUMP_S = 1;
/** Inside the box's edge the map blends to the placeholder foam over this band (m), so there is no seam. */
export const FOAM_EDGE_BAND_M = 10;

/** The last tick at or before sim time t. The epsilon keeps t = k·Δ (with its float error) on tick k. */
export function tickIndex(t: number): number {
  return Math.floor(t * FOAM_TICKS_PER_S + 1e-6);
}

export function tickTime(k: number): number {
  return k / FOAM_TICKS_PER_S;
}

export function replayTickCount(clearTimeS: number): number {
  return Math.ceil((clearTimeS + REPLAY_MARGIN_S) * FOAM_TICKS_PER_S);
}

/** A frame's work: clear the map first (a replay), then run these tick indices in order. */
export interface FoamPlan {
  clear: boolean;
  ticks: number[];
}

const ticksFrom = (a: number, b: number): number[] => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));

/** Which ticks each frame runs (spec §3.1, §3.3). */
export class FoamSchedule {
  private last: number | null = null;

  /** The next plan replays (a moment, a set call, new conditions, a new field, a slider). */
  invalidate(): void {
    this.last = null;
  }

  plan(simTime: number, clearTimeS: number): FoamPlan {
    return this.planTicks(simTime, replayTickCount(clearTimeS));
  }

  /** As plan(), with the replay's length given in ticks (the spray's window is its longest life, not a clear time). */
  planTicks(simTime: number, replayTicks: number): FoamPlan {
    const k = tickIndex(simTime);
    const last = this.last;
    this.last = k;
    if (last === null || k < last || k - last > FOAM_JUMP_S * FOAM_TICKS_PER_S) {
      return { clear: true, ticks: ticksFrom(k - replayTicks + 1, k) };
    }
    return { clear: false, ticks: ticksFrom(last + 1, k) };
  }
}

/** The breaking foam weight S(x, z, t) ∈ [0, 1] and the unit wave direction at (x, z) (zero where unknown). */
export interface FoamSourceCpu {
  foam(x: number, z: number, t: number): number;
  dir(x: number, z: number): [number, number];
}

/** a·(1 − t) + b·t, WGSL mix()'s form: exactly a at t = 0 and exactly b at t = 1, whatever the other value is. */
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/**
 * Bilinear between texel centres, clamped to the edge texels (the GPU step's manual bilinear, ruling R4). Written as
 * WGSL's mix() so that with no drift a texel reads exactly itself, which the exact replay/live test relies on.
 */
export function bilinearFoam(map: Float32Array, g: FoamGrid, x: number, z: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM - 0.5));
  const fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM - 0.5));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  return lerp(lerp(map[i], map[i + 1], tx), lerp(map[i + g.nx], map[i + g.nx + 1], tx), tz);
}

/** One step at sim time t (spec §3.1): drift (sampled upstream), clear, inject, clamp. Returns a new map. */
export function stepFoam(prev: Float32Array, g: FoamGrid, t: number, p: FoamParams, src: FoamSourceCpu): Float32Array<ArrayBuffer> {
  const out = new Float32Array(prev.length);
  const reach = p.driftMps * FOAM_TICK_S, decay = FOAM_TICK_S / p.clearTimeS;
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
    const x = g.x0 + (c + 0.5) * g.cellM, z = g.z0 + (r + 0.5) * g.cellM;
    const [dx, dz] = src.dir(x, z);
    const adv = bilinearFoam(prev, g, x - dx * reach, z - dz * reach);
    out[r * g.nx + c] = Math.min(1, Math.max(0, Math.max(adv - decay, src.foam(x, z, t))));
  }
  return out;
}

/** How much the map (vs the placeholder) decides the foam at (x, z): 0 outside the box, 1 from FOAM_EDGE_BAND_M in. */
export function boxWeight(g: FoamGrid, x: number, z: number): number {
  const inX = Math.min(x - g.x0, g.x0 + g.nx * g.cellM - x);
  const inZ = Math.min(z - g.z0, g.z0 + g.nz * g.cellM - z);
  return Math.min(1, Math.max(0, Math.min(inX, inZ) / FOAM_EDGE_BAND_M));
}
