import { describe, expect, it } from 'vitest';
import { IMPACT_KIND, KIND_INDEX, KIND_LOOK, PARTICLE_KINDS, PLUME_KIND, SPRAY_KIND } from './particleKinds';
import { SPRAY_BIRTH_CAP, SPRAY_OPACITY, replayTicksForMaxLife, sprayReplayTicks } from './sprayEmitters';
import { SPRAY_PHASE_ISOTROPIC, sprayPhase } from './sprayLook';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, SprayPool, birthInto, stepPool } from './sprayStep';

describe('particle kinds', () => {
  it('the spray kind is exactly 3b (the refactor changes nothing)', () => {
    expect(SPRAY_KIND).toMatchObject({ dragTauS: SPRAY_DRAG_TAU_S, gravityMs2: SPRAY_SETTLE_MS2, sizeM: [0.3, 2], opacity: SPRAY_OPACITY, isotropic: SPRAY_PHASE_ISOTROPIC, backDriftShare: 1 });
    expect(SPRAY_KIND).toMatchObject({ dragTauS: 0.45, gravityMs2: 1.2, sizeM: [0.3, 2], opacity: 0.08, isotropic: 0.3 });
  });
  it('an impact puff rises and falls back under gravity well within its life', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP);
    birthInto(pool, 0, [{ x: 0, y: 1, z: 0, vx: 0, vy: 6, vz: 0, life: 1.6, strength: 1 }]);
    let peak = 1, t = 0;
    while (pool.posAge[3] < pool.velLife[3]) { stepPool(pool, 0, 0, IMPACT_KIND); peak = Math.max(peak, pool.posAge[1]); t += 0.05; }
    expect(peak).toBeGreaterThan(2.5);
    expect(pool.posAge[1]).toBeLessThan(peak - 1);
    expect(t).toBeLessThanOrEqual(1.65 + 1e-9);
  });
  it('the default kind of stepPool is the spray', () => {
    const a = new SprayPool(SPRAY_BIRTH_CAP), b = new SprayPool(SPRAY_BIRTH_CAP);
    const puff = { x: 0, y: 1, z: 0, vx: 1, vy: 3, vz: 0, life: 2, strength: 1 };
    birthInto(a, 0, [puff]); birthInto(b, 0, [puff]);
    stepPool(a, 4, 1); stepPool(b, 4, 1, SPRAY_KIND);
    expect(a.posAge).toEqual(b.posAge);
    expect(a.velLife).toEqual(b.velLife);
  });
  it('a denser, more isotropic phase is still energy conserving and whiter side-on', () => {
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const c = -1 + (2 * (i + 0.5)) / n; sum += sprayPhase(c, IMPACT_KIND.isotropic) * 2 * Math.PI * (2 / n); }
    expect(sum).toBeCloseTo(1, 3);
    expect(sprayPhase(0, IMPACT_KIND.isotropic)).toBeGreaterThan(sprayPhase(0));
  });
  it('the replay window follows the longest life, capped at the history', () => {
    expect(replayTicksForMaxLife(1.6)).toBe(42);
    expect(replayTicksForMaxLife(1.2 * 2)).toBe(sprayReplayTicks(2));
    expect(replayTicksForMaxLife(10)).toBe(100);
  });
});

describe('one pool, every kind (whitewater §4.1)', () => {
  const puff = { x: 0, y: 1, z: 0, vx: 1, vy: 3, vz: 0, life: 4, strength: 1 };
  it('a birth carries its kind and its water height into the slot (meta: strength, kind, yWater, seed)', () => {
    const pool = new SprayPool(SPRAY_BIRTH_CAP, KIND_INDEX.spray);
    birthInto(pool, 0, [{ ...puff, kind: KIND_INDEX.plume, yWater: 0.7 }, puff]);
    expect(pool.meta[1]).toBe(KIND_INDEX.plume);
    expect(pool.meta[2]).toBeCloseTo(0.7, 6);
    expect(pool.meta[5]).toBe(KIND_INDEX.spray); // the pool's own kind by default
    expect(pool.meta[3]).not.toBe(pool.meta[7]); // a per-birth seed
  });
  it('each slot steps with its own kind: a mixed pool equals one pool per kind', () => {
    const mixed = new SprayPool(SPRAY_BIRTH_CAP, KIND_INDEX.spray), a = new SprayPool(SPRAY_BIRTH_CAP), b = new SprayPool(SPRAY_BIRTH_CAP);
    birthInto(mixed, 0, [puff, { ...puff, kind: KIND_INDEX.plume }]);
    birthInto(a, 0, [puff]);
    birthInto(b, 0, [puff]);
    for (let i = 0; i < 20; i++) { stepPool(mixed, 4, 1); stepPool(a, 4, 1, SPRAY_KIND); stepPool(b, 4, 1, PLUME_KIND); }
    expect(Array.from(mixed.posAge.slice(0, 4))).toEqual(Array.from(a.posAge.slice(0, 4)));
    expect(Array.from(mixed.posAge.slice(4, 8))).toEqual(Array.from(b.posAge.slice(0, 4)));
    expect(mixed.posAge[5]).toBeGreaterThan(mixed.posAge[1]); // the plume barely settles: higher after 1 s
  });
});

describe('four airborne looks (womb-realism Task 5, spec 3.3)', () => {
  it('every kind has a KIND_LOOK entry, and the kinds the GPU reads are made from it (τ = 1 / drag)', () => {
    for (const name of Object.keys(KIND_INDEX) as (keyof typeof KIND_INDEX)[]) {
      const look = KIND_LOOK[name], kind = PARTICLE_KINDS[KIND_INDEX[name]];
      expect(look, name).toBeDefined();
      expect(kind.sizeM, name).toEqual(look.sizeM);
      expect(kind.opacity, name).toBe(look.alpha);
      expect(kind.dragTauS, name).toBeCloseTo(1 / look.drag, 12);
      expect(kind.backDriftShare, name).toBe(look.backDriftShare);
    }
  });
  it('the plan’s numbers: feather thin and short, plume dense and long, spit low and fast, impact unchanged', () => {
    // 2026-10-14 (womb-story Task 5, spec 3.5): the feather a mist on the lip (was [0.3, 0.8] m, 0.35, [0.6, 1.2] s).
    expect(KIND_LOOK.feather).toEqual({ sizeM: [0.15, 0.4], alpha: 0.25, lifeS: [0.4, 0.9], drag: 2.0, liftA: 1.0, backDriftShare: 1.0 });
    expect(KIND_LOOK.plume).toEqual({ sizeM: [1.0, 2.5], alpha: 0.8, lifeS: [3, 5], drag: 0.8, liftA: 2.0, backDriftShare: 0.7 });
    expect(KIND_LOOK.spit).toEqual({ sizeM: [0.4, 1.0], alpha: 0.7, lifeS: [0.5, 0.9], drag: 1.5, liftA: 0.2, backDriftShare: 0.0 });
    expect(KIND_LOOK.impact.liftA).toBe(1.5);
    expect(IMPACT_KIND.sizeM).toEqual([0.8, 3.5]);
  });
});
