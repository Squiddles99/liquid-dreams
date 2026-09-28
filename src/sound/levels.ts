import { BOMBIE_X, BOMBIE_Z, BURST_GROW_S, BURST_LIFE_S, type Burst, ROLL_DIR, ROLL_SPEED_MS } from '../bombie/bombieModel';
import type { CameraMode } from '../dev/momentLink';
import { smoothstep } from '../math/smoothstep';
import { shoreReefWidth } from '../seabed/shoreReef';
import { H_REF_M, type SurfState, hash01, heightOf, runupOf, swashLevel, tableAt, waterEdgeOffset } from '../surf/surfModel';
import { BOMBIE_WAVE_ID_BASE, type ImpactEmitter, SPRAY_SPACING_M } from '../whitewater/sprayEmitters';
import type { Point3 } from './hits';

/** The continuous voices' levels (Phase 5 spec §3.2, sounds 2–4), from the game's CPU state. Levels are ~0..1.5. */

/** A level that rises and falls toward its target with separate time constants (s). */
export class Follower {
  value = 0;
  step(target: number, dtS: number, attackS: number, releaseS: number): number {
    if (dtS > 0) this.value += (target - this.value) * (1 - Math.exp(-dtS / (target > this.value ? attackS : releaseS)));
    return this.value;
  }
}

// ----- 2. White water -----

/** Σ lip · H · spacing (m²) of landing lip for a full roar: a peeling 8 ft wave lands one or two stations at a time. */
export const ROAR_FULL_M2 = 15;
export const ROAR_ATTACK_S = 0.3;
/** The roar's tail hisses away over about three of these (≈ 6 s, spec §3.2). */
export const ROAR_RELEASE_S = 2;

/** The white water's loudness target and where it is: the landing lip's weighted centre; null when nothing lands. */
export function roarSource(impact: readonly ImpactEmitter[]): { level: number; at: Point3 } | null {
  let s = 0, x = 0, y = 0, z = 0;
  for (const e of impact) {
    if (e.waveId >= BOMBIE_WAVE_ID_BASE) continue;
    const w = e.lip * e.H * SPRAY_SPACING_M;
    s += w;
    x += w * e.x;
    y += w * e.y;
    z += w * e.z;
  }
  if (s <= 0) return null;
  return { level: Math.min(1.5, Math.sqrt(s / ROAR_FULL_M2)), at: { x: x / s, y: y / s, z: z / s } };
}

export const WASH_RISE_S = 0.6;
export const WASH_DECAY_S = 4;
/** The steady wash between waves, × the surf's mean height. */
export const WASH_FLOOR = 0.25;

/** The shore break's loudness at coast z: a swell as each of the last waves bursts on the platform edge, over a steady floor. */
export function washLevel(z: number, t: number, s: SurfState): number {
  if (!s.enabled) return 0;
  const tau = tableAt(s.tau, z), T = s.periodS, nL = Math.floor((t - tau) / T);
  let lvl = 0;
  for (let k = 0; k < 3; k++) {
    const n = nL - k, age = t - (n * T + tau);
    lvl = Math.max(lvl, (heightOf(s.table, n) / H_REF_M) * smoothstep(0, WASH_RISE_S, age) * Math.exp(-age / WASH_DECAY_S));
  }
  return Math.min(1.5, Math.max(lvl, (WASH_FLOOR * s.table.meanHeight) / H_REF_M));
}

/** The wash's place: the middle of the shore platform, abreast of the camera. */
export function washPosition(z: number, waterlineX: number, tideM: number): Point3 {
  return { x: waterlineX - shoreReefWidth(z) / 2, y: tideM + 0.5, z };
}

/** The Bombie's rumble: the loudest current burst, rolling shoreward with its white water. */
export function bombieRumble(bursts: readonly Burst[], size: number): { level: number; at: Point3 } {
  let level = 0, front = 0;
  for (const b of bursts) {
    const l = Math.min(1.5, b.heightM / 2) * size * smoothstep(0, 1, b.ageS) * (1 - smoothstep(5, BURST_LIFE_S, b.ageS));
    if (l > level) {
      level = l;
      front = Math.max(0, b.ageS - BURST_GROW_S) * ROLL_SPEED_MS;
    }
  }
  return { level, at: { x: BOMBIE_X + ROLL_DIR[0] * front, y: 1, z: BOMBIE_Z + ROLL_DIR[1] * front } };
}

// ----- 3. Wind and scrub -----

/** The wind speed (m/s) at which the wind bed is full. */
export const WIND_FULL_MS = 15;

/** Smooth value noise in [0, 1] (the gusts). */
export function valueNoise1(x: number): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash01(i) * (1 - u) + hash01(i + 1) * u;
}

export function windSound(speedMs: number, realTime: number): { level: number; brightness: number } {
  const base = smoothstep(0, WIND_FULL_MS, speedMs);
  return { level: base * (0.6 + 0.4 * valueNoise1(realTime / 4)), brightness: 0.3 + 0.7 * smoothstep(0, 20, speedMs) };
}

export const SCRUB_RADIUS_M = 15;
/** One shrub per this many m² (4c-2's heath) is full density. */
export const SHRUB_AREA_M2 = 3;
export const PEBBLE_RADIUS_M = 20;
/** The nearby counts are redone after the camera moves this far. */
export const NEARBY_MOVE_M = 2;

export function plantDensityNear(plants: readonly { x: number; z: number }[], x: number, z: number): number {
  let n = 0;
  for (const p of plants) if ((p.x - x) ** 2 + (p.z - z) ** 2 <= SCRUB_RADIUS_M * SCRUB_RADIUS_M) n++;
  return Math.min(1, n / ((Math.PI * SCRUB_RADIUS_M * SCRUB_RADIUS_M) / SHRUB_AREA_M2));
}

/** Rocks within PEBBLE_RADIUS_M (the shore platform's and the toe's: the swash rattles through both). */
export function rocksNear(rocks: readonly { x: number; z: number }[], x: number, z: number): boolean {
  return rocks.some((r) => (r.x - x) ** 2 + (r.z - z) ** 2 <= PEBBLE_RADIUS_M * PEBBLE_RADIUS_M);
}

export function scrubLevel(mode: CameraMode, windLevel: number, density: number): number {
  return mode === 'walk' ? windLevel * density : 0;
}

/** The plant density and the rocks near the camera, redone only after NEARBY_MOVE_M or new lists (App relays them). */
export class NearbyCache {
  private at: [number, number] | null = null;
  private plants: readonly unknown[] | null = null;
  private rocks: readonly unknown[] | null = null;
  private value = { plantDensity: 0, nearRocks: false };

  get(plants: readonly { x: number; z: number }[], rocks: readonly { x: number; z: number }[], x: number, z: number): { plantDensity: number; nearRocks: boolean } {
    if (this.at && plants === this.plants && rocks === this.rocks && Math.hypot(x - this.at[0], z - this.at[1]) < NEARBY_MOVE_M) return this.value;
    this.at = [x, z];
    this.plants = plants;
    this.rocks = rocks;
    this.value = { plantDensity: plantDensityNear(plants, x, z), nearRocks: rocksNear(rocks, x, z) };
    return this.value;
  }
}

// ----- 4. Water close by -----

/** Lapping is heard within this height of the surface. */
export const LAP_NEAR_M = 3;

/** Lapping in the water (not on foot, not under): its level and its plips per second follow the water's vertical rate. */
export function lapping(mode: CameraMode, underwater: boolean, camY: number, waterY: number | null, rateMs: number): { level: number; rate: number } {
  if (mode === 'walk' || underwater || waterY === null) return { level: 0, rate: 0 };
  const near = 1 - smoothstep(0, LAP_NEAR_M, Math.abs(camY - waterY));
  const motion = smoothstep(0.05, 1.0, Math.abs(rateMs));
  return { level: near * (0.25 + 0.75 * motion), rate: 2 + 10 * motion };
}

/** The swash is heard up to this far up the beach from its tip. */
export const SWASH_REACH_M = 25;

export interface SwashInput {
  mode: CameraMode;
  camX: number;
  camZ: number;
  waterlineX: number | null;
  tideM: number;
  surf: SurfState | null;
  t: number;
  nearRocks: boolean;
  /** Last frame's raw swash level (null on the first): falling means the draw-back. */
  prevRaw: number | null;
}

/** The swash on foot: 4b's swash level at the camera's z, fading with the distance up the beach from its tip. */
export function swashSound(i: SwashInput): { level: number; drawBack: number; pebbles: number; raw: number } {
  const raw = i.surf ? swashLevel(i.camZ, i.t, i.surf) : 0;
  if (i.mode !== 'walk' || !i.surf || i.waterlineX === null) return { level: 0, drawBack: 0, pebbles: 0, raw };
  const tip = waterEdgeOffset(i.tideM + raw); // the swash's tip, m seaward of the waterline
  const gap = Math.max(0, tip - (i.waterlineX - i.camX)); // how far up the beach from it the camera stands
  const level = (1 - smoothstep(3, SWASH_REACH_M, gap)) * Math.min(1.5, raw / runupOf(H_REF_M));
  const falling = i.prevRaw !== null && raw < i.prevRaw - 1e-4;
  return { level, drawBack: falling ? level : 0, pebbles: falling && i.nearRocks ? level : 0, raw };
}
