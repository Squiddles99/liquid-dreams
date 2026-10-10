import { describe, expect, it } from 'vitest';
import { FOAM_TICK_S, FoamSchedule } from './foamStep';
import { SPRAY_BIRTH_CAP, SPRAY_HISTORY_TICKS, SPRAY_POOL, type SprayBirth, sprayReplayTicks } from './sprayEmitters';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, NO_WATER, SprayPool, birthInto, liveSlots, slotBase, stepPool } from './sprayStep';

const puff = (over: Partial<SprayBirth> = {}): SprayBirth => ({ x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, life: 2, strength: 1, ...over });

describe('the spray pool (CPU reference)', () => {
  it('each tick owns SPRAY_BIRTH_CAP slots, cycling every SPRAY_HISTORY_TICKS ticks', () => {
    expect(SPRAY_POOL).toBe(SPRAY_BIRTH_CAP * SPRAY_HISTORY_TICKS);
    expect(slotBase(0)).toBe(0);
    expect(slotBase(1)).toBe(SPRAY_BIRTH_CAP);
    expect(slotBase(SPRAY_HISTORY_TICKS + 3)).toBe(3 * SPRAY_BIRTH_CAP);
  });
  it('slot bases wrap for negative ticks', () => {
    expect(slotBase(-1)).toBe((SPRAY_HISTORY_TICKS - 1) * SPRAY_BIRTH_CAP);
    expect(slotBase(-SPRAY_HISTORY_TICKS)).toBe(0);
  });
  it('a born puff is live, steps with the wind drag and the settling, and dies at its life', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP * 2);
    birthInto(pool, 0, [puff({ vx: 0, vy: 3, life: 0.2 })]);
    expect(liveSlots(pool)).toEqual([0]);
    stepPool(pool, 5, 0);
    const k = Math.min(1, FOAM_TICK_S / SPRAY_DRAG_TAU_S);
    const vx = 5 * k, vy = 3 * (1 - k) - SPRAY_SETTLE_MS2 * FOAM_TICK_S;
    expect(pool.velLife[0]).toBeCloseTo(vx, 5);
    expect(pool.velLife[1]).toBeCloseTo(vy, 5);
    expect(pool.posAge[0]).toBeCloseTo(vx * FOAM_TICK_S, 5);
    expect(pool.posAge[1]).toBeCloseTo(1 + vy * FOAM_TICK_S, 5);
    expect(pool.posAge[3]).toBeCloseTo(FOAM_TICK_S, 6);
    for (let i = 0; i < 3; i++) stepPool(pool, 5, 0);
    expect(liveSlots(pool)).toEqual([]);
    const frozen = pool.posAge.slice(0, 4);
    stepPool(pool, 5, 0);
    expect(pool.posAge.slice(0, 4)).toEqual(frozen);
  });
  it('left long enough, a puff drifts at the wind speed', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP);
    birthInto(pool, 0, [puff({ vx: -8, life: 10 })]);
    for (let i = 0; i < 120; i++) stepPool(pool, 4, -2); // 6 s: (1 − Δ/τ)^120 leaves ~1e-6 of the gap
    expect(pool.velLife[0]).toBeCloseTo(4, 3);
    expect(pool.velLife[2]).toBeCloseTo(-2, 3);
  });
  it("a tick's births land in its own slots, whatever came before", () => {
    const pool = new SprayPool();
    birthInto(pool, 5, [puff({ x: 1 }), puff({ x: 2 })]);
    const base = slotBase(5) * 4;
    expect(pool.posAge[base]).toBe(1);
    expect(pool.posAge[base + 4]).toBe(2);
    expect(pool.meta[base]).toBe(1);
  });
  it('a birth with no water under it is NO_WATER (no soft fade); with one, its yWater (whitewater §6.2)', () => {
    const pool = new SprayPool();
    birthInto(pool, 6, [puff({ x: 1 }), puff({ x: 2, yWater: -0.6 })]);
    const base = slotBase(6) * 4;
    expect(pool.meta[base + 2]).toBe(NO_WATER);
    expect(pool.meta[base + 6]).toBeCloseTo(-0.6, 6);
    expect(NO_WATER).toBeLessThan(-1000);
  });
  it('a replay equals live stepping exactly (fixed slots per tick)', () => {
    const births = (k: number): SprayBirth[] => Array.from({ length: (k * 7) % 5 }, (_, i) => puff({ x: k + i, vy: 1 + i, life: 1 + ((k + i) % 3) * 0.5 }));
    const run = (from: number, to: number): SprayPool => {
      const pool = new SprayPool();
      for (let k = from; k <= to; k++) { birthInto(pool, k, births(k)); stepPool(pool, 3, -1); }
      return pool;
    };
    const live = run(0, 200), replay = run(200 - 58 + 1, 200);
    const a = liveSlots(live), b = liveSlots(replay);
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
    for (const s of a) for (let c = 0; c < 4; c++) {
      expect(replay.posAge[s * 4 + c]).toBe(live.posAge[s * 4 + c]);
      expect(replay.velLife[s * 4 + c]).toBe(live.velLife[s * 4 + c]);
    }
  });
  it('at the longest life (spray life 4 → 4.8 s) a replay of the capped window still equals live play', () => {
    const births = (k: number): SprayBirth[] => Array.from({ length: 3 }, (_, i) => puff({ x: k + i, vy: 1 + i, life: 4.8 - i * 0.7 }));
    const run = (from: number, to: number): SprayPool => {
      const pool = new SprayPool();
      for (let k = from; k <= to; k++) { birthInto(pool, k, births(k)); stepPool(pool, 3, -1); }
      return pool;
    };
    const live = run(0, 400), replay = run(400 - sprayReplayTicks(4) + 1, 400);
    const a = liveSlots(live);
    expect(a.length).toBeGreaterThan(200);
    expect(liveSlots(replay)).toEqual(a);
    for (const s of a) for (let c = 0; c < 4; c++) expect(replay.posAge[s * 4 + c]).toBe(live.posAge[s * 4 + c]);
  });
  it('planTicks replays exactly the requested count', () => {
    const s = new FoamSchedule();
    const p = s.planTicks(10, 58);
    expect(p.clear).toBe(true);
    expect(p.ticks.length).toBe(58);
    expect(p.ticks[57]).toBe(200);
    expect(s.planTicks(10.05, 58)).toEqual({ clear: false, coarse: [], ticks: [201] });
  });
});
