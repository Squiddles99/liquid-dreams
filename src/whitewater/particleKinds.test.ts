import { describe, expect, it } from 'vitest';
import { IMPACT_KIND, SPRAY_KIND } from './particleKinds';
import { SPRAY_BIRTH_CAP, SPRAY_OPACITY, replayTicksForMaxLife, sprayReplayTicks } from './sprayEmitters';
import { SPRAY_PHASE_ISOTROPIC, sprayPhase } from './sprayLook';
import { SPRAY_DRAG_TAU_S, SPRAY_SETTLE_MS2, SprayPool, birthInto, stepPool } from './sprayStep';

describe('particle kinds', () => {
  it('the spray kind is exactly 3b (the refactor changes nothing)', () => {
    expect(SPRAY_KIND).toEqual({ dragTauS: SPRAY_DRAG_TAU_S, gravityMs2: SPRAY_SETTLE_MS2, sizeM: [0.3, 2], opacity: SPRAY_OPACITY, isotropic: SPRAY_PHASE_ISOTROPIC });
    expect(SPRAY_KIND).toEqual({ dragTauS: 0.45, gravityMs2: 1.2, sizeM: [0.3, 2], opacity: 0.08, isotropic: 0.3 });
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
