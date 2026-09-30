import { describe, expect, it } from 'vitest';
import { meshVolume, openEdges } from './boardGeometry';
import { buildSwimFin } from './swimFinGeometry';

describe('swim fin', () => {
  const f = buildSwimFin();
  it('is closed, flat (thickness along y) and about 48 cm long, heel to tip', () => {
    expect(openEdges(f.indices)).toBe(0);
    expect(meshVolume(f.positions, f.indices)).toBeGreaterThan(0);
    const ys: number[] = [], zs: number[] = [];
    for (let i = 0; i < f.positions.length; i += 3) { ys.push(f.positions[i + 1]); zs.push(f.positions[i + 2]); }
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.024, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.48, 6);
  });
});
