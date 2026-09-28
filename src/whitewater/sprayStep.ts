import { FOAM_TICK_S } from './foamStep';
import { type ParticleKind, SPRAY_KIND } from './particleKinds';
import { SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, SPRAY_POOL, type SprayBirth } from './sprayEmitters';

/**
 * The spray particles' CPU reference (spec 2026-09-27-offshore-spray-design.md §3.2): the pool, births into each tick's
 * own slots (plan S2) and the per-tick step. SprayParticles.ts mirrors it on the GPU (in f32; this rounds to f32 too).
 */

/** The wind takes a puff over with this time constant (s)… */
export const SPRAY_DRAG_TAU_S = SPRAY_KIND.dragTauS;
/** …and it settles at this rate (m/s², mist barely falls). */
export const SPRAY_SETTLE_MS2 = SPRAY_KIND.gravityMs2;

/** The first slot tick k's births take: (k mod SPRAY_HISTORY_TICKS) × SPRAY_BIRTH_CAP (negative ticks wrap). */
export function slotBase(tick: number): number {
  const h = SPRAY_HISTORY_TICKS;
  return (((tick % h) + h) % h) * SPRAY_BIRTH_CAP;
}

/** Per slot: posAge = (x, y, z, age), velLife = (vx, vy, vz, life), meta = (strength, 0, 0, 0). Zeroed slots are dead. */
export class SprayPool {
  readonly posAge: Float32Array;
  readonly velLife: Float32Array;
  readonly meta: Float32Array;
  constructor(readonly size = SPRAY_POOL) {
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
    pool.meta.set([b.strength, 0, 0, 0], j);
  });
}

/** One tick (Δ = FOAM_TICK_S) for every live slot: drag toward the wind, settle (or fall), move, age. */
export function stepPool(pool: SprayPool, windX: number, windZ: number, kind: ParticleKind = SPRAY_KIND): void {
  const f = Math.fround;
  const k = f(Math.min(1, FOAM_TICK_S / kind.dragTauS)), dt = f(FOAM_TICK_S), settle = f(kind.gravityMs2 * FOAM_TICK_S);
  for (let j = 0; j < pool.size * 4; j += 4) {
    const age = pool.posAge[j + 3], life = pool.velLife[j + 3];
    if (!(age < life)) continue;
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
