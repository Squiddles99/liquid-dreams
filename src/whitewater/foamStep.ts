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
  /** Dense foam falls exponentially from 1 to LACE_LEVEL over this long once its source stops (s). */
  clearTimeS: number;
  /** Net shoreward drift along the local wave direction (m/s). */
  driftMps: number;
  /** The lace (below LACE_LEVEL) then falls linearly to 0 over this long (s; whitewater §5.1). */
  laceLifeS: number;
  /** The dense foam volume's exposure (whitewater 7b S3 ruling 3: a camera exposes for the whitewater; 0.55 shows the
   * billows' form, ~0.7 is whiter). The materials read it (FoamField.volumeExposure); the step does not. */
  volumeExposure: number;
}

export const DEFAULT_FOAM_PARAMS: Readonly<FoamParams> = { clearTimeS: 10, driftMps: 0.4, laceLifeS: 75, volumeExposure: 0.55 };
export const FOAM_PARAM_RANGES = { clearTimeS: { min: 2, max: 30 }, driftMps: { min: 0, max: 2 }, laceLifeS: { min: 30, max: 120 }, volumeExposure: { min: 0.4, max: 1 } } as const;

/** Dense foam is lace below this density; it reaches it exactly clearTimeS after its source stops. */
export const LACE_LEVEL = 0.25;
/** Surface foam drifts at this × the wind vector (streaks line up with the wind: photo 5). */
export const WIND_DRIFT_SHARE = 0.02;
/** Fresh foam (density 0.5 → 0.9) is carried at this × the crest's speed: lace streams out behind the broken section. */
export const BORE_PUSH = 0.5;
/** A replay steps its oldest part this many ticks at a time (2 Hz)… */
export const COARSE_TICKS = 10;
/** …and its last this many seconds at 20 Hz. */
export const FINE_REPLAY_S = 10;
/** A source this strong (or more) makes the foam fresh: its age restarts at 0. */
export const FRESH_SOURCE = 0.75;
/** A coarse step samples its source this many times across the step (every 0.1 s), each decayed to the step's end: a bore
 * moving 6 m/s leaves no gap between 1 m texels (sampled once, the 2 Hz replay drew it as stripes 3 m apart). */
export const COARSE_SOURCE_SAMPLES = 5;

/** decayFoam's density alone, with no source: exactly over any dt. */
export function decayDensity(density: number, dtS: number, p: FoamParams): number {
  return decayFoam(density, 0, 0, dtS, p)[0];
}

/**
 * One texel's next (density, age) over dt with source S (whitewater §5.1): density decays exponentially above LACE_LEVEL
 * (from 1 to LACE_LEVEL in clearTimeS) and linearly below it (LACE_LEVEL / laceLifeS per s), exactly over any dt, so a
 * coarse step equals the fine steps it stands for; then max-injects S. Age restarts at 0 under S >= FRESH_SOURCE, else + dt.
 */
export function decayFoam(density: number, age: number, source: number, dtS: number, p: FoamParams): [number, number] {
  const k = Math.log(1 / LACE_LEVEL) / p.clearTimeS, slope = LACE_LEVEL / p.laceLifeS;
  let d = density, t = dtS;
  if (d > LACE_LEVEL) {
    const toLace = Math.log(d / LACE_LEVEL) / k;
    if (t <= toLace) { d *= Math.exp(-k * t); t = 0; } else { d = LACE_LEVEL; t -= toLace; }
  }
  if (t > 0) d = Math.max(0, d - slope * t);
  return [Math.min(1, Math.max(d, source)), source >= FRESH_SOURCE ? 0 : age + dtS];
}

/** The foam's drift (m/s): the shoreward drift along `dir`, plus the bore's push (dir × c × BORE_PUSH) where the foam is
 * fresh (smoothstep(0.5, 0.9, density)), plus WIND_DRIFT_SHARE of the wind vector. */
export function driftVector(dir: readonly [number, number], driftMps: number, c: number, density: number, wind: readonly [number, number]): [number, number] {
  const t = Math.min(1, Math.max(0, (density - 0.5) / 0.4)), fresh = t * t * (3 - 2 * t);
  const along = driftMps + c * BORE_PUSH * fresh;
  return [dir[0] * along + wind[0] * WIND_DRIFT_SHARE, dir[1] * along + wind[1] * WIND_DRIFT_SHARE];
}

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

/** The wind's share of the lace pattern's axis fades in over this wind speed (m/s): a calm leaves the axis the swell's. */
export const PATTERN_WIND_MS: readonly [number, number] = [1, 3];
/** The lace pattern's long axis (whitewater §5.3): the drift direction, normalise(travel × driftMps + the wind's share),
 * the wind's share faded in over PATTERN_WIND_MS; exactly `travel` in a calm. */
export function foamPatternAxis(travel: readonly [number, number], driftMps: number, wind: readonly [number, number]): [number, number] {
  const w = Math.hypot(wind[0], wind[1]), t = Math.min(1, Math.max(0, (w - PATTERN_WIND_MS[0]) / (PATTERN_WIND_MS[1] - PATTERN_WIND_MS[0])));
  const gate = t * t * (3 - 2 * t);
  if (gate === 0) return [travel[0], travel[1]];
  const vx = travel[0] * driftMps + wind[0] * WIND_DRIFT_SHARE * gate, vz = travel[1] * driftMps + wind[1] * WIND_DRIFT_SHARE * gate;
  const l = Math.hypot(vx, vz);
  return l > 1e-9 ? [vx / l, vz / l] : [travel[0], travel[1]];
}

/** A frame's work: clear the map first (a replay), then the coarse ticks (each a step of COARSE_TICKS × FOAM_TICK_S ending
 * at that tick), then these tick indices in order. */
export interface FoamPlan {
  clear: boolean;
  coarse: number[];
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

  /** `historyS`: how long foam lives (the foam map: clearTimeS + laceLifeS). A replay covers it + REPLAY_MARGIN_S: the
   * oldest part in coarse steps, the last FINE_REPLAY_S tick by tick (whitewater §5.4). */
  plan(simTime: number, historyS: number): FoamPlan {
    const plan = this.planTicks(simTime, replayTickCount(historyS));
    const fine = FINE_REPLAY_S * FOAM_TICKS_PER_S;
    if (!plan.clear || plan.ticks.length <= fine) return plan;
    const k = plan.ticks[plan.ticks.length - 1], n = Math.ceil((plan.ticks.length - fine) / COARSE_TICKS);
    return { clear: true, coarse: Array.from({ length: n }, (_, i) => k - fine - (n - 1 - i) * COARSE_TICKS), ticks: ticksFrom(k - fine + 1, k) };
  }

  /** As plan(), with the replay's length given in ticks, all of them fine (the spray's window is its longest life). */
  planTicks(simTime: number, replayTicks: number): FoamPlan {
    const k = tickIndex(simTime);
    const last = this.last;
    this.last = k;
    if (last === null || k < last || k - last > FOAM_JUMP_S * FOAM_TICKS_PER_S) {
      return { clear: true, coarse: [], ticks: ticksFrom(k - replayTicks + 1, k) };
    }
    return { clear: false, coarse: [], ticks: ticksFrom(last + 1, k) };
  }
}

/** The breaking foam weight S(x, z, t) ∈ [0, 1] and the unit wave direction at (x, z) (zero where unknown); the crest's
 * speed where the foam is fresh (m/s, SetWaves.pushNode; absent 0) and the wind vector (m/s; absent calm). */
export interface FoamSourceCpu {
  foam(x: number, z: number, t: number): number;
  dir(x: number, z: number): [number, number];
  push?(x: number, z: number, t: number): number;
  wind?: readonly [number, number];
}

/** a·(1 − t) + b·t, WGSL mix()'s form: exactly a at t = 0 and exactly b at t = 1, whatever the other value is. */
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/**
 * Bilinear between texel centres, clamped to the edge texels (the GPU step's manual bilinear, ruling R4). Written as
 * WGSL's mix() so that with no drift a texel reads exactly itself, which the exact replay/live test relies on.
 */
export function bilinearFoam(map: Float32Array, g: FoamGrid, x: number, z: number, stride = 1, channel = 0): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cellM - 0.5));
  const fz = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cellM - 0.5));
  const c = Math.min(g.nx - 2, Math.floor(fx)), r = Math.min(g.nz - 2, Math.floor(fz));
  const tx = fx - c, tz = fz - r, i = r * g.nx + c;
  const at = (j: number): number => map[j * stride + channel];
  return lerp(lerp(at(i), at(i + 1), tx), lerp(at(i + g.nx), at(i + g.nx + 1), tx), tz);
}

/**
 * One step of dt ending at sim time t (spec §3.1, whitewater §5): drift (the texel's own driftVector, sampled upstream),
 * decay (decayFoam: the two lives), inject, age. `prev` and the result are (density, age) pairs per texel.
 */
export function stepFoam(prev: Float32Array, g: FoamGrid, t: number, dtS: number, p: FoamParams, src: FoamSourceCpu): Float32Array<ArrayBuffer> {
  const out = new Float32Array(prev.length);
  const wind = src.wind ?? [0, 0];
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
    const x = g.x0 + (c + 0.5) * g.cellM, z = g.z0 + (r + 0.5) * g.cellM, i = r * g.nx + c;
    // Midpoint backtrace: the drift at the texel, then re-read halfway upstream (its density there decides the bore's push),
    // so a coarse replay step follows a fresh band's speed as ten fine ones do.
    const c0 = src.push ? src.push(x, z, t) : 0, dir = src.dir(x, z);
    const [v0x, v0z] = driftVector(dir, p.driftMps, c0, prev[2 * i], wind);
    const mx = x - v0x * dtS * 0.5, mz = z - v0z * dtS * 0.5;
    const [vx, vz] = driftVector(dir, p.driftMps, c0, bilinearFoam(prev, g, mx, mz, 2, 0), wind);
    const ux = x - vx * dtS, uz = z - vz * dtS;
    let [d, a] = decayFoam(bilinearFoam(prev, g, ux, uz, 2, 0), bilinearFoam(prev, g, ux, uz, 2, 1), src.foam(x, z, t), dtS, p);
    // A coarse step: the source across the step too (COARSE_SOURCE_SAMPLES), each sample decayed to the step's end.
    if (dtS > FOAM_TICK_S * 1.5) for (let j = 1; j < COARSE_SOURCE_SAMPLES; j++) {
      const back = (j * dtS) / COARSE_SOURCE_SAMPLES, S = src.foam(x, z, t - back);
      d = Math.max(d, decayDensity(S, back, p));
      if (S >= FRESH_SOURCE) a = Math.min(a, back);
    }
    out[2 * i] = d;
    out[2 * i + 1] = a;
  }
  return out;
}

/** How much the map (vs the placeholder) decides the foam at (x, z): 0 outside the box, 1 from FOAM_EDGE_BAND_M in. */
export function boxWeight(g: FoamGrid, x: number, z: number): number {
  const inX = Math.min(x - g.x0, g.x0 + g.nx * g.cellM - x);
  const inZ = Math.min(z - g.z0, g.z0 + g.nz * g.cellM - z);
  return Math.min(1, Math.max(0, Math.min(inX, inZ) / FOAM_EDGE_BAND_M));
}
