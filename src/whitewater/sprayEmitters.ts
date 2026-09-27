import type { BreakParams } from '../breaker/breaking';
import { traceStations } from '../breaker/crestTrace';
import { GRAVITY_MS2, type Vec2, profileFrame } from '../breaker/lipProfile';
import { type ReefField, sampleField } from '../breaker/reefField';
import { type BreakOptions, type WaveContext, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { smoothstep } from '../math/smoothstep';
import type { WaveEvent } from '../swell/sets';
import { FOAM_TICK_S } from './foamStep';

/**
 * Offshore spray's emitters and births (spec 2026-09-27-offshore-spray-design.md §3.1), on the CPU: each 20 Hz tick, the
 * lip tips of the stations mid-throw (a camera-independent crest trace, plan S1) and the particles they launch, with
 * every random value from a hash of the tick (plan S4), so a replay reproduces live play exactly.
 */

/** Emitters are the trace's stations at this fixed spacing (m of crest arc). */
export const SPRAY_SPACING_M = 1.5;
/** Particles per metre of throwing lip per second, at strength 1 (plan S3). */
export const SPRAY_RATE = 20;
/** Births per tick, and the pool slots each tick owns (plan S2)… */
export const SPRAY_BIRTH_CAP = 320;
/** …for this many ticks of history (5 s, longer than the longest life, 4 s × 1.2), so the pool is… */
export const SPRAY_HISTORY_TICKS = 100;
/** …32,000 particles. */
export const SPRAY_POOL = SPRAY_BIRTH_CAP * SPRAY_HISTORY_TICKS;
/** A station emits only where its constructed lip is actually drawn: weight · ρ above this. */
export const MIN_EMIT_WEIGHT = 0.1;
/** A puff's opacity at strength 1, before its shape and fades (plan S3). */
export const SPRAY_OPACITY = 0.08;
/** The offshore wind speed (m/s) below which there is no spray, and from which it is full. */
export const WIND_CALM_MS = 1;
export const WIND_FULL_MS = 6;

export interface SprayParams {
  /** Scales how much spray comes off (× the emission rate). */
  amount: number;
  /** A puff's mean life (s); each lives this × U(0.6, 1.2). */
  lifeS: number;
}

export const DEFAULT_SPRAY_PARAMS: Readonly<SprayParams> = { amount: 1, lifeS: 2 };
export const SPRAY_PARAM_RANGES = { amount: { min: 0, max: 3 }, lifeS: { min: 0.8, max: 4 } } as const;

export function normalizeSprayParams(p: SprayParams): void {
  for (const k of Object.keys(SPRAY_PARAM_RANGES) as (keyof SprayParams)[]) {
    const r = SPRAY_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_SPRAY_PARAMS[k];
  }
}

/** Ticks a replay covers: the longest life (1.2 × lifeS) plus 0.5 s. */
export function sprayReplayTicks(lifeS: number): number {
  return Math.ceil((1.2 * lifeS + 0.5) / FOAM_TICK_S - 1e-9);
}

export interface Wind {
  speedMs: number;
  /** Where the wind comes from, degrees true (meteorological). */
  fromDeg: number;
}

/** The unit xz vector the wind blows toward (+X east, +Z south; bearing b is (sin b, −cos b)). */
export function windToVector(fromDeg: number): [number, number] {
  const b = ((fromDeg + 180) * Math.PI) / 180;
  return [Math.sin(b), -Math.cos(b)];
}

/** How strongly a lip travelling along (nx, nz) throws spray in this wind: its offshore component, 0 → 1 over 1–6 m/s. */
export function offshoreFactor(wind: Wind, nx: number, nz: number): number {
  const [wx, wz] = windToVector(wind.fromDeg);
  return smoothstep(WIND_CALM_MS, WIND_FULL_MS, wind.speedMs * Math.max(0, -(wx * nx + wz * nz)));
}

export interface SprayEmitter {
  /** The lip tip (world m; y includes the tide). */
  x: number;
  y: number;
  z: number;
  /** The lip's throw velocity (m/s, horizontal, along the crest normal). */
  vx: number;
  vz: number;
  /** The crest normal (the wave's travel). */
  nx: number;
  nz: number;
  /** weight · ρ · wind factor · amount (may exceed 1 above amount 1). */
  strength: number;
  /** The wave's event id and the station's arc index (arc / spacing): the hash keys of its births. */
  waveId: number;
  arc: number;
}

export interface EmitterInput {
  field: ReefField | null;
  ctx: WaveContext | null;
  events: readonly WaveEvent[];
  t: number;
  params: BreakParams;
  /** Waves no taller than this never reach the ribbon's onset (App's ribbonMinHeightM). */
  minHeightM: number;
  wind: Wind;
  tideM: number;
  amount: number;
}

/** The emitters at sim time t: the lip tip of every station mid-throw (spec §3.1). */
export function sprayEmitters(i: EmitterInput): SprayEmitter[] {
  const { field, ctx, params } = i;
  if (!field || !ctx || !params.enabled || !(i.amount > 0) || i.events.length === 0) return [];
  const waves = i.events.map(toActiveWave);
  const stations = traceStations(field, waves, i.t, ctx, { cameraX: 0, cameraZ: 0, params, minHeightM: i.minHeightM, spacingM: SPRAY_SPACING_M });
  const opts: BreakOptions = { sample: (x, z) => sampleField(field, x, z), params };
  const out: SprayEmitter[] = [];
  for (const s of stations) {
    if (s.gap || s.tb === null || !Number.isFinite(s.tb)) continue;
    const wind = offshoreFactor(i.wind, s.nx, s.nz);
    if (!(wind > 0)) continue;
    const base = (u: number): Vec2 => {
      const x = s.x + s.nx * u, z = s.z + s.nz * u;
      const r = sumWaves(x, z, i.t, sampleField(field, x, z), waves, ctx, opts);
      return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
    };
    const f = profileFrame(base, { H: s.H, c: s.c, r: s.r, tb: s.tb }, params);
    if (!(f.prog > 0 && f.prog < 1) || !(f.weight * f.rho > MIN_EMIT_WEIGHT)) continue;
    const tp = f.reach / f.vj;
    const u = f.K[0] + f.reach, y = f.K[1] - 0.5 * GRAVITY_MS2 * tp * tp;
    out.push({
      x: s.x + s.nx * u, y: y + i.tideM, z: s.z + s.nz * u, vx: s.nx * f.vj, vz: s.nz * f.vj, nx: s.nx, nz: s.nz,
      strength: f.weight * f.rho * wind * i.amount, waveId: i.events[s.wave].id, arc: Math.round(s.arc / SPRAY_SPACING_M),
    });
  }
  return out;
}

/** PCG hash (O'Neill), uint32 → uint32. */
function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** A uniform number in [0, 1) from four integers (the births' random draws, plan S4). */
export function rand01(a: number, b: number, c: number, d: number): number {
  return pcg((pcg((pcg((pcg(a | 0) ^ (b | 0)) >>> 0) ^ (c | 0)) >>> 0) ^ (d | 0)) >>> 0) / 4294967296;
}

export interface SprayBirth {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** min(1, the emitter's strength): scales the puff's opacity. */
  strength: number;
}

/**
 * Tick k's births (spec §3.1–3.2): floor(strength × rate × spacing × Δ + a hashed fraction) per emitter, in emitter order,
 * at most SPRAY_BIRTH_CAP (plan S2; the rest are dropped). Each is scattered ±0.4 m along the crest and 0–0.3 m up,
 * launched with half the lip's throw, a 2–4 m/s upward kick and ±1 m/s per axis, for lifeS × U(0.6, 1.2).
 */
export function sprayBirths(emitters: readonly SprayEmitter[], tick: number, p: SprayParams): SprayBirth[] {
  const out: SprayBirth[] = [];
  for (const e of emitters) {
    const n = Math.floor(e.strength * SPRAY_RATE * SPRAY_SPACING_M * FOAM_TICK_S + rand01(tick, e.waveId, e.arc, 0x9e3779b9));
    for (let j = 0; j < n; j++) {
      if (out.length >= SPRAY_BIRTH_CAP) return out;
      const r = (q: number): number => rand01(tick, e.waveId, e.arc, j * 8 + q + 1);
      const along = (r(0) * 2 - 1) * 0.4;
      out.push({
        x: e.x - e.nz * along, y: e.y + r(1) * 0.3, z: e.z + e.nx * along,
        vx: 0.5 * e.vx + (r(2) * 2 - 1), vy: 2 + 2 * r(3) + (r(4) * 2 - 1), vz: 0.5 * e.vz + (r(5) * 2 - 1),
        life: p.lifeS * (0.6 + 0.6 * r(6)), strength: Math.min(1, e.strength),
      });
    }
  }
  return out;
}
