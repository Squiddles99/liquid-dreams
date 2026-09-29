import type { BreakParams } from '../breaker/breaking';
import { BOMBIE_X, BOMBIE_Z, ROLL_DIR } from '../bombie/bombieModel';
import { type Station, type StationEntry, traceStations } from '../breaker/crestTrace';
import { GRAVITY_MS2, type ProfileFrame, type Vec2, profileFrame } from '../breaker/lipProfile';
import { type ReefField, sampleField } from '../breaker/reefField';
import { type BreakOptions, type WaveContext, breakOptions, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { smoothstep } from '../math/smoothstep';
import type { WaveEvent } from '../swell/sets';
import { FOAM_TICK_S } from './foamStep';
import { SPRAY_KIND } from './particleKinds';

/**
 * Offshore spray's emitters and births (spec 2026-09-27-offshore-spray-design.md §3.1), on the CPU: each 20 Hz tick, the
 * lip tips of the stations mid-throw (a camera-independent crest trace, plan S1) and the particles they launch, with
 * every random value from a hash of the tick (plan S4), so a replay reproduces live play exactly.
 */

/**
 * Emitters are the trace's stations at this fixed spacing (m of crest arc). 3 m, not the spec's 1.5 m: the spec's cost
 * lever 1, applied after measuring 2.96 ms of CPU per tick at 1.5 m (target 1.5 ms); births scatter half a spacing either
 * side, so the veil stays continuous.
 */
export const SPRAY_SPACING_M = 3;
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
export const SPRAY_OPACITY = SPRAY_KIND.opacity;
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

/**
 * Ticks a replay covers: the longest life (1.2 × lifeS) plus 0.5 s, at most the pool's history (final review I2: beyond it
 * the replay only rewrote slots of puffs long dead).
 */
export function sprayReplayTicks(lifeS: number): number {
  return replayTicksForMaxLife(1.2 * lifeS);
}

/** Ticks a replay covers for particles living at most maxLifeS: that plus 0.5 s, at most the pool's history. */
export function replayTicksForMaxLife(maxLifeS: number): number {
  return Math.min(SPRAY_HISTORY_TICKS, Math.ceil((maxLifeS + 0.5) / FOAM_TICK_S - 1e-9));
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
  /** weight · ρ · wind factor · amount (may exceed 1 above amount 1): how many puffs are born. */
  strength: number;
  /** weight · ρ (≤ 1): how strongly the lip is drawn there, which sets each puff's opacity (final review I1). */
  lip: number;
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
  /** The impact explosion's amount (0, the default, emits no explosion). */
  impactAmount?: number;
}

/** A lip landing emits the impact explosion for this long after τ_land (s) (spec 2026-09-28-impact-explosion §3.2). */
export const IMPACT_WINDOW_S = 0.35;
/** Impact particles per metre of landing lip per second at strength 1 (Ruling I3: denser than the mist). */
export const IMPACT_RATE = 40;
/** The explosion's kick is sized against this gravity (m/s², IMPACT_KIND's): it rises about 0.25–1 H. */
export const IMPACT_G = 7;
/** The full kick throws a puff this many wave heights above the landing (before drag). */
export const IMPACT_RISE_H = 1.5;
/** An impact puff lives U(1.3, 2.4) s: long enough to fall back below its launch after the tuned throw (final review I1). */
export const IMPACT_MAX_LIFE_S = 2.4;

/** Whether the spray can emit at all: a spray amount and more than a calm wind (a replay skips its ticks otherwise). */
export function sprayCanEmit(amount: number, windSpeedMs: number): boolean {
  return amount > 0 && windSpeedMs > WIND_CALM_MS;
}

export interface ImpactParams {
  /** Scales how much the explosion throws (× the emission rate). */
  amount: number;
}

export const DEFAULT_IMPACT_PARAMS: Readonly<ImpactParams> = { amount: 1 };
export const IMPACT_PARAM_RANGES = { amount: { min: 0, max: 3 } } as const;

export function normalizeImpactParams(p: ImpactParams): void {
  const r = IMPACT_PARAM_RANGES.amount;
  p.amount = Number.isFinite(p.amount) ? Math.min(r.max, Math.max(r.min, p.amount)) : DEFAULT_IMPACT_PARAMS.amount;
}

export interface ImpactEmitter {
  /** Where the lip lands (world m; y includes the tide). */
  x: number;
  y: number;
  z: number;
  /** The lip's throw velocity (m/s, horizontal, along the crest normal). */
  vx: number;
  vz: number;
  nx: number;
  nz: number;
  /** The station's wave height (m): bigger waves explode higher. */
  H: number;
  /** min(1, H / 2 m) · ρ · impact amount: how many puffs are born. */
  strength: number;
  /** min(1, ρ): each puff's opacity. */
  lip: number;
  waveId: number;
  arc: number;
}

/**
 * The barrel's spit (Andrew: "foam, spit and spray"): as the tube collapses behind its mouth, the air in it is squeezed out
 * of the open end in a horizontal jet of spray along the line. A station spits while its own lip is still in the air and a
 * section within SPIT_REACH_STATIONS behind it along the crest (the one further through its break) has landed, most in
 * the SPIT_PULSE_S after that landing. With the explosion (its amount), with or without wind.
 */
export interface SpitEmitter {
  /** The tube's middle at the mouth (world m; y includes the tide). */
  x: number;
  y: number;
  z: number;
  /** Along the crest, out of the open end (unit, horizontal). */
  dx: number;
  dz: number;
  /** The jet's speed (m/s). */
  speed: number;
  /** The crest normal (the wave's travel). */
  nx: number;
  nz: number;
  /** The tube's radius (m): births scatter over its mouth. */
  radius: number;
  /** pulse · weight · ρ · min(1, H / 2 m) · impact amount: how many puffs are born. */
  strength: number;
  /** weight · ρ (≤ 1): each puff's opacity. */
  lip: number;
  waveId: number;
  arc: number;
}
/** A collapse this many stations (× SPRAY_SPACING_M) behind a lip still in the air blows out of its mouth… */
export const SPIT_REACH_STATIONS = 3;
/** …fully up to SPIT_PULSE_S[0] after that section landed, gone by [1] (s). */
export const SPIT_PULSE_S: readonly [number, number] = [0.3, 1.0];
/** The jet's speed: this × √(g·H), at most SPIT_MAX_SPEED_MS (a heavy 3 m barrel spits at ~14 m/s). */
export const SPIT_SPEED = 2.5;
export const SPIT_MAX_SPEED_MS = 25;
/** Spit puffs per second per mouth at strength 1… */
export const SPIT_RATE = 120;
/** …each this faint (× the explosion's opacity): a mist blown out of the tube. At the explosion's own opacity the
 * overlapping puffs at the mouth read as a round cotton ball. */
export const SPIT_OPACITY = 0.3;

/**
 * The emitters at sim time t (spec §3.1; 3c §3.2): one camera-independent crest trace and one profile frame per breaking
 * station feed the spray (the lip tip mid-throw, off an offshore wind), the impact explosion (the landing point, for
 * IMPACT_WINDOW_S after the lip lands, with or without wind) and the barrel's spit (SpitEmitter).
 */
export function breakEmitters(i: EmitterInput): { spray: SprayEmitter[]; impact: ImpactEmitter[]; spit: SpitEmitter[] } {
  const { field, ctx, params } = i;
  const spray: SprayEmitter[] = [], impact: ImpactEmitter[] = [], spit: SpitEmitter[] = [];
  if (!field || !ctx || !params.enabled || i.events.length === 0) return { spray, impact, spit };
  // A calm wind makes no spray anywhere (final review I2); the explosion doesn't care about the wind.
  const wantSpray = sprayCanEmit(i.amount, i.wind.speedMs);
  const impactAmount = i.impactAmount ?? 0;
  const wantImpact = impactAmount > 0;
  if (!wantSpray && !wantImpact) return { spray, impact, spit };
  const waves = i.events.map(toActiveWave);
  const stations = traceStations(field, waves, i.t, ctx, { cameraX: 0, cameraZ: 0, params, minHeightM: i.minHeightM, spacingM: SPRAY_SPACING_M });
  // The lip is thrown from the wave as it stood: the frame reads the sheet without the whitewater pile (as the ribbon's).
  const opts: BreakOptions = { ...breakOptions(field, params), pile: false };
  const frames: (ProfileFrame | null)[] = stations.map(() => null);
  for (const [si, s] of stations.entries()) {
    if (s.gap || s.tb === null || !Number.isFinite(s.tb)) continue;
    const wind = wantSpray ? offshoreFactor(i.wind, s.nx, s.nz) : 0;
    if (!(wind > 0) && !wantImpact) continue;
    // The station's own wave only: a set wave's envelope is tight (exp(−(ξ/0.7T)⁶)), so the others add nothing at its
    // crest, and summing all of them was most of the lip maths' cost (measured, final cost pass).
    const own = [waves[s.wave]];
    const base = (u: number): Vec2 => {
      const x = s.x + s.nx * u, z = s.z + s.nz * u;
      const r = sumWaves(x, z, i.t, sampleField(field, x, z), own, ctx, opts);
      return [u + r.dx * s.nx + r.dz * s.nz, r.eta];
    };
    const f = profileFrame(base, { H: s.H, c: s.c, r: s.r, tb: s.tb }, params);
    if (wantImpact) frames[si] = f;
    const waveId = i.events[s.wave].id, arc = Math.round(s.arc / SPRAY_SPACING_M);
    if (wind > 0 && f.prog > 0 && f.prog < 1 && f.weight * f.rho > MIN_EMIT_WEIGHT) {
      const tp = f.reach / f.vj;
      const u = f.K[0] + f.reach, y = f.K[1] - 0.5 * GRAVITY_MS2 * tp * tp;
      spray.push({
        x: s.x + s.nx * u, y: y + i.tideM, z: s.z + s.nz * u, vx: s.nx * f.vj, vz: s.nz * f.vj, nx: s.nx, nz: s.nz,
        strength: f.weight * f.rho * wind * i.amount, lip: Math.min(1, f.weight * f.rho), waveId, arc,
      });
    }
    if (wantImpact && f.tauLand <= s.tb && s.tb < f.tauLand + IMPACT_WINDOW_S && f.rho > MIN_EMIT_WEIGHT) {
      // Where the lip lands: its tip at τ_land (the landing criterion defines τ_land by the tip reaching the water).
      const u = f.K[0] + f.vj * f.tauLand, y = f.K[1] - 0.5 * GRAVITY_MS2 * f.tauLand * f.tauLand;
      impact.push({
        x: s.x + s.nx * u, y: y + i.tideM, z: s.z + s.nz * u, vx: s.nx * f.vj, vz: s.nz * f.vj, nx: s.nx, nz: s.nz, H: s.H,
        strength: Math.min(1, s.H / 2) * f.rho * impactAmount, lip: Math.min(1, f.rho), waveId, arc,
      });
    }
  }
  if (wantImpact) spitEmitters(stations, frames, i, impactAmount, spit);
  return { spray, impact, spit };
}

/** The stations' spit (SpitEmitter), from their frames (null: no frame), into `out`. */
function spitEmitters(stations: readonly StationEntry[], frames: readonly (ProfileFrame | null)[], i: EmitterInput, amount: number, out: SpitEmitter[]): void {
  // The station k steps from j along its run (same wave, no gap between), or -1.
  const at = (j: number): Station | null => {
    const e = j >= 0 && j < stations.length ? stations[j] : null;
    return e && !e.gap ? e : null;
  };
  const step = (j: number, k: number): number => {
    let q = j;
    for (let m = 0; m < Math.abs(k); m++) {
      q += Math.sign(k);
      if (at(q)?.wave !== at(j)?.wave) return -1;
    }
    return q;
  };
  const tbOf = (j: number): number => (frames[j] ? (at(j)?.tb ?? -Infinity) : -Infinity);
  for (let j = 0; j < stations.length; j++) {
    const s = at(j), f = frames[j];
    if (!s || !f || s.tb === null || !(s.tb < f.tauLand) || !(f.prog > 0.4) || !(f.weight * f.rho > MIN_EMIT_WEIGHT)) continue;
    // Behind the mouth: the side further through its break.
    const back = tbOf(step(j, -1)) > tbOf(step(j, 1)) ? -1 : 1;
    if (!(tbOf(step(j, back)) > s.tb)) continue;
    let age = -1, from = -1;
    for (let k = 1; k <= SPIT_REACH_STATIONS; k++) {
      const q = step(j, back * k), fq = q >= 0 ? frames[q] : null, tq = q >= 0 ? at(q)?.tb : null;
      if (fq && tq !== null && tq !== undefined && tq >= fq.tauLand) { age = tq - fq.tauLand; from = q; break; }
    }
    if (from < 0) continue;
    const pulse = 1 - smoothstep(SPIT_PULSE_S[0], SPIT_PULSE_S[1], age);
    if (!(pulse > 0)) continue;
    const b = at(from) as Station;
    const ddx = s.x - b.x, ddz = s.z - b.z, dl = Math.hypot(ddx, ddz);
    if (!(dl > 1e-6)) continue;
    // The tube's middle: under the lip, between the face's foot and the crest.
    const tubeH = Math.max(f.K[1] - f.F[1], 0.1);
    const u = f.K[0] + 0.4 * f.reach, y = f.F[1] + 0.45 * tubeH;
    out.push({
      x: s.x + s.nx * u, y: y + i.tideM, z: s.z + s.nz * u, dx: ddx / dl, dz: ddz / dl,
      speed: Math.min(SPIT_MAX_SPEED_MS, SPIT_SPEED * Math.sqrt(GRAVITY_MS2 * s.H)), nx: s.nx, nz: s.nz, radius: 0.3 * tubeH,
      strength: pulse * f.weight * f.rho * Math.min(1, s.H / 2) * amount, lip: Math.min(1, f.weight * f.rho),
      waveId: i.events[s.wave].id, arc: Math.round(s.arc / SPRAY_SPACING_M),
    });
  }
}

/** The spray's emitters at sim time t (breakEmitters' spray). */
export function sprayEmitters(i: EmitterInput): SprayEmitter[] {
  return breakEmitters(i).spray;
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
  /** The emitter's lip weight (≤ 1): scales the puff's opacity. The wind and the amount set only how many are born. */
  strength: number;
}

/**
 * Tick k's births (spec §3.1–3.2): floor(strength × rate × spacing × Δ + a hashed fraction) per emitter, in emitter order,
 * at most SPRAY_BIRTH_CAP (plan S2; the rest are dropped). Each is scattered half a spacing along the crest and 0–0.3 m up,
 * launched with half the lip's throw, a 2–4 m/s upward kick and ±1 m/s per axis, for lifeS × U(0.6, 1.2).
 */
export function sprayBirths(emitters: readonly SprayEmitter[], tick: number, p: SprayParams): SprayBirth[] {
  const out: SprayBirth[] = [];
  for (const e of emitters) {
    const n = Math.floor(e.strength * SPRAY_RATE * SPRAY_SPACING_M * FOAM_TICK_S + rand01(tick, e.waveId, e.arc, 0x9e3779b9));
    for (let j = 0; j < n; j++) {
      if (out.length >= SPRAY_BIRTH_CAP) return out;
      const r = (q: number): number => rand01(tick, e.waveId, e.arc, j * 8 + q + 1);
      const along = (r(0) * 2 - 1) * (SPRAY_SPACING_M / 2);
      out.push({
        x: e.x - e.nz * along, y: e.y + r(1) * 0.3, z: e.z + e.nx * along,
        vx: 0.5 * e.vx + (r(2) * 2 - 1), vy: 2 + 2 * r(3) + (r(4) * 2 - 1), vz: 0.5 * e.vz + (r(5) * 2 - 1),
        life: p.lifeS * (0.6 + 0.6 * r(6)), strength: Math.min(1, e.lip),
      });
    }
  }
  return out;
}

/**
 * Tick k's impact births (3c spec §3.2): floor(strength × IMPACT_RATE × spacing × Δ + a hashed fraction) per emitter, at
 * most SPRAY_BIRTH_CAP, hashed apart from the spray's draws. Each is scattered half a spacing along the crest and 0–0.4 m
 * up, thrown with 0.6 × the lip's throw, an upward kick of U(0.6, 1.2)·√(2·IMPACT_G·IMPACT_RISE_H·max(H, 0.5)) and ±1.5 m/s per axis, for
 * U(1.3, IMPACT_MAX_LIFE_S) s (long enough to fall back, final review I1); its opacity follows the lip.
 */
export function impactBirths(emitters: readonly ImpactEmitter[], tick: number): SprayBirth[] {
  const out: SprayBirth[] = [];
  for (const e of emitters) {
    const n = Math.floor(e.strength * IMPACT_RATE * SPRAY_SPACING_M * FOAM_TICK_S + rand01(tick, e.waveId, e.arc, 0x7f4a7c15));
    // Sized to rise 1.5 × H above the landing at full kick (tuned overnight: at 1 × H the burst stayed below the lip and
    // hid against the wave's white face).
    const kick = Math.sqrt(2 * IMPACT_G * IMPACT_RISE_H * Math.max(e.H, 0.5));
    for (let j = 0; j < n; j++) {
      if (out.length >= SPRAY_BIRTH_CAP) return out;
      const r = (q: number): number => rand01(tick, e.waveId, e.arc, 0x40000000 + j * 8 + q);
      const along = (r(0) * 2 - 1) * (SPRAY_SPACING_M / 2);
      out.push({
        x: e.x - e.nz * along, y: e.y + r(1) * 0.4, z: e.z + e.nx * along,
        vx: 0.6 * e.vx + (r(2) * 2 - 1) * 1.5, vy: (0.6 + 0.6 * r(3)) * kick + (r(4) * 2 - 1) * 1.5, vz: 0.6 * e.vz + (r(5) * 2 - 1) * 1.5,
        life: 1.3 + (IMPACT_MAX_LIFE_S - 1.3) * r(6), strength: Math.min(1, e.lip),
      });
    }
  }
  return out;
}

/**
 * Tick k's spit births: floor(strength × SPIT_RATE × Δ + a hashed fraction) per mouth, at most SPRAY_BIRTH_CAP, hashed
 * apart from the spray's and the explosion's draws. Each is scattered over the tube's mouth (± 0.6 radius across it and up)
 * and blown out along it at U(0.7, 1.1) × its speed, ± 12% of that sideways, ± 1 m/s up, for U(0.8, 1.6) s.
 */
export function spitBirths(emitters: readonly SpitEmitter[], tick: number): SprayBirth[] {
  const out: SprayBirth[] = [];
  for (const e of emitters) {
    const n = Math.floor(e.strength * SPIT_RATE * FOAM_TICK_S + rand01(tick, e.waveId, e.arc, 0x5bd1e995));
    for (let j = 0; j < n; j++) {
      if (out.length >= SPRAY_BIRTH_CAP) return out;
      const r = (q: number): number => rand01(tick, e.waveId, e.arc, 0x20000000 + j * 8 + q);
      const across = (r(0) * 2 - 1) * 0.6 * e.radius, up = (r(1) * 2 - 1) * 0.6 * e.radius;
      const v = (0.7 + 0.4 * r(2)) * e.speed, side = (r(3) * 2 - 1) * 0.12 * e.speed;
      out.push({
        x: e.x + e.nx * across, y: e.y + up, z: e.z + e.nz * across,
        vx: e.dx * v + e.nx * side, vy: r(4) * 2 - 1, vz: e.dz * v + e.nz * side,
        life: 0.8 + 0.8 * r(5), strength: SPIT_OPACITY * Math.min(1, e.lip),
      });
    }
  }
  return out;
}

/** The Bombie's emitters' wave ids start here (above any Womb wave's), so listeners can tell its spray from a lip's. */
export const BOMBIE_WAVE_ID_BASE = 0x40000;
/** The Bombie's burst (4c-3 §3.4): impact spray along the burst line across the reef for its first 1.5 s. */
export const BOMBIE_SPRAY_S = 1.5;
export function bombieImpactEmitters(burst: { n: number; ageS: number; heightM: number } | null, widthM: number, tideM: number, size: number): ImpactEmitter[] {
  if (!burst || burst.ageS < 0 || burst.ageS >= BOMBIE_SPRAY_S) return [];
  const out: ImpactEmitter[] = [];
  const count = Math.floor(widthM / SPRAY_SPACING_M) + 1;
  // Plumes 5–15 m: impactBirths rises 1.5 × H above the landing.
  const H = Math.min(10, Math.max(3, 2 * burst.heightM)) * size;
  for (let i = 0; i < count; i++) {
    const v = -widthM / 2 + i * SPRAY_SPACING_M;
    out.push({
      x: BOMBIE_X - ROLL_DIR[1] * v, y: tideM + 0.5, z: BOMBIE_Z + ROLL_DIR[0] * v,
      vx: ROLL_DIR[0] * 4, vz: ROLL_DIR[1] * 4, nx: ROLL_DIR[0], nz: ROLL_DIR[1],
      H, strength: Math.min(2, size), lip: 1, waveId: BOMBIE_WAVE_ID_BASE + burst.n, arc: i,
    });
  }
  return out;
}
