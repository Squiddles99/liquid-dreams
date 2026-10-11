import { FOAM_TICK_S } from './foamStep';
import { PARTICLE_KINDS, type ParticleKind } from './particleKinds';
import { SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, SPRAY_POOL, type SprayBirth, rand01 } from './sprayEmitters';

/**
 * The spray particles' CPU reference (spec 2026-09-27-offshore-spray-design.md §3.2): the pool, births into each tick's
 * own slots (plan S2) and the per-tick step. SprayParticles.ts mirrors it on the GPU (in f32; this rounds to f32 too).
 */

/** The wind takes a puff over with this time constant (s)… */
export const SPRAY_DRAG_TAU_S = PARTICLE_KINDS[0].dragTauS;
/** …and it settles at this rate (m/s², mist barely falls). */
export const SPRAY_SETTLE_MS2 = PARTICLE_KINDS[0].gravityMs2;

/** The first slot tick k's births take: (k mod SPRAY_HISTORY_TICKS) × SPRAY_BIRTH_CAP (negative ticks wrap). */
export function slotBase(tick: number): number {
  const h = SPRAY_HISTORY_TICKS;
  return (((tick % h) + h) % h) * SPRAY_BIRTH_CAP;
}

/** A birth with no water under it (SprayBirth.yWater absent): meta.z, far enough down that the soft fade is 1. */
export const NO_WATER = -1e4;
/** Soft particles (whitewater §6.2): a puff fades in over this height (m) above the water it was born over. */
export const SOFT_FADE_M = 0.5;

/** Per slot: posAge = (x, y, z, age), velLife = (vx, vy, vz, life), meta = (strength, kind, yWater, seed). Zeroed slots
 * are dead. `kind` (particleKinds.KIND_INDEX) is a birth's own or the pool's `defaultKind`. */
export class SprayPool {
  readonly posAge: Float32Array;
  readonly velLife: Float32Array;
  readonly meta: Float32Array;
  constructor(readonly size = SPRAY_POOL, readonly defaultKind = 0) {
    this.posAge = new Float32Array(size * 4);
    this.velLife = new Float32Array(size * 4);
    this.meta = new Float32Array(size * 4);
  }
}

export function birthInto(pool: SprayPool, tick: number, births: readonly SprayBirth[]): void {
  const base = slotBase(tick);
  births.forEach((b, i) => {
    const j = (base + i) * 4;
    if (j + 3 >= pool.posAge.length) return;
    pool.posAge.set([b.x, b.y, b.z, 0], j);
    pool.velLife.set([b.vx, b.vy, b.vz, b.life], j);
    pool.meta.set([b.strength, b.kind ?? pool.defaultKind, b.yWater ?? NO_WATER, birthSeed(tick, i)], j);
  });
}

/** A birth's seed [0, 1): the erosion's noise offset (the GPU's meta.w), a hash of its tick and index. */
export const birthSeed = (tick: number, i: number): number => Math.fround(rand01(tick, i, 0x2545f491, 0x9e3779b9));

/** One tick (Δ = FOAM_TICK_S) for every live slot: drag toward the wind, settle (or fall), move, age; each with its own
 * kind (meta.y), or `kind` for all of them when given. */
export function stepPool(pool: SprayPool, windX: number, windZ: number, kind?: ParticleKind): void {
  const f = Math.fround;
  const dt = f(FOAM_TICK_S);
  for (let j = 0; j < pool.size * 4; j += 4) {
    const age = pool.posAge[j + 3], life = pool.velLife[j + 3];
    if (!(age < life)) continue;
    const kd = kind ?? PARTICLE_KINDS[pool.meta[j + 1]] ?? PARTICLE_KINDS[0];
    const k = f(Math.min(1, FOAM_TICK_S / kd.dragTauS)), settle = f(kd.gravityMs2 * FOAM_TICK_S);
    const vx = f(pool.velLife[j] + f(f(windX - pool.velLife[j]) * k));
    const vy = f(f(pool.velLife[j + 1] + f(f(0 - pool.velLife[j + 1]) * k)) - settle);
    const vz = f(pool.velLife[j + 2] + f(f(windZ - pool.velLife[j + 2]) * k));
    pool.velLife[j] = vx; pool.velLife[j + 1] = vy; pool.velLife[j + 2] = vz;
    pool.posAge[j] = f(pool.posAge[j] + f(vx * dt));
    pool.posAge[j + 1] = f(pool.posAge[j + 1] + f(vy * dt));
    pool.posAge[j + 2] = f(pool.posAge[j + 2] + f(vz * dt));
    pool.posAge[j + 3] = f(age + dt);
  }
}

/** The live slots (age < life), ascending. */
export function liveSlots(pool: SprayPool): number[] {
  const out: number[] = [];
  for (let s = 0; s < pool.size; s++) if (pool.posAge[s * 4 + 3] < pool.velLife[s * 4 + 3]) out.push(s);
  return out;
}
