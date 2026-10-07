import { describe, expect, it } from 'vitest';
import type { FieldSample } from '../breaker/fieldSample';
import type { SetWaveResult } from '../breaker/setWaveModel';
import { INVERT_ITERATIONS, waterAt } from './water';

// A steep-ish travelling bump: the displacement depends on where it is read, so the inversion has work to do.
const field = (): FieldSample => ({ tau: 0, amp: 1, hmin: 5, hminBreak: 5, hminSlurp: 5, hminLean: 5, k: 0.1, dirX: 1, dirZ: 0, depth: 5 });
const ZERO = { foam: 0, stage: 0, pile: 0 };
const sum = (x: number, z: number): SetWaveResult => ({
  ...ZERO, eta: 1.2 * Math.exp(-((x - 3) ** 2) / 8), dx: 0.9 * Math.exp(-((x - 3) ** 2) / 6) + 0.1 * Math.sin(z), dz: 0.05 * Math.cos(x),
  slopeX: 0, slopeZ: 0,
});

describe('waterAt: the inversion’s start and passes (ride-framerate R8)', () => {
  it('without a start it is the cold inversion of INVERT_ITERATIONS passes, unchanged', () => {
    for (const x of [-2, 1, 2.5, 4, 7]) {
      expect(waterAt(x, 0.5, 0.3, 1, field, sum)).toEqual(waterAt(x, 0.5, 0.3, 1, field, sum, undefined, INVERT_ITERATIONS));
    }
  });

  it('started at the converged label, one pass stays on it', () => {
    for (const x of [-2, 1, 2.5, 4, 7]) {
      const converged = waterAt(x, 0.5, 0.3, 1, field, sum, undefined, 40);
      const warm = waterAt(x, 0.5, 0.3, 1, field, sum, { x: converged.lx!, z: converged.lz! }, 1);
      expect(Math.abs(warm.y - converged.y)).toBeLessThan(1e-9);
      expect(Math.abs(warm.lx! - converged.lx!)).toBeLessThan(1e-9);
    }
  });

  it('counts its passes: a warm read of 1 pass sums the waves twice (the pass and the final read)', () => {
    let n = 0;
    const counted = (x: number, z: number): SetWaveResult => { n++; return sum(x, z); };
    waterAt(1, 0, 0, 1, field, counted, { x: 0.5, z: 0 }, 1);
    expect(n).toBe(2);
    n = 0;
    waterAt(1, 0, 0, 1, field, counted);
    expect(n).toBe(INVERT_ITERATIONS + 1);
  });

  it('reports how far its last step would still move the label (the inversion’s residual)', () => {
    const converged = waterAt(2.5, 0.5, 0, 1, field, sum, undefined, 40);
    expect(converged.residual!).toBeLessThan(1e-9);
    const one = waterAt(2.5, 0.5, 0, 1, field, sum, undefined, 1);
    expect(one.residual!).toBeGreaterThan(1e-3);
  });
});

