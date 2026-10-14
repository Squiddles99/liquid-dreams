import { describe, expect, it } from 'vitest';
import { TRIM_DOWN_DEG, energyGrid, trimAccel } from './energyMap';
import { type WaterFn, flatWater } from './water';

/** A face running +x (the wave's travel), sloping down toward +x at s: the line runs along z. */
const face = (s: number): WaterFn => () => ({ y: 0, slopeX: -s, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });

describe('energy on the face (ride-speed spec §6)', () => {
  it('flat water pays nothing', () => {
    expect(trimAccel(flatWater()(0, 0), 1)).toBeCloseTo(0, 6);
  });
  it('a steeper face pays more, along the trim heading', () => {
    const a = trimAccel(face(0.3)(0, 0), 1), b = trimAccel(face(0.8)(0, 0), 1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    // 20° down the face: g·sin(20°)·s/(1+s²) on the 0.3 face
    expect(a).toBeCloseTo((9.81 * Math.sin((TRIM_DOWN_DEG * Math.PI) / 180) * 0.3) / 1.09, 3);
  });
  it('the grid is square around the rider and finite', () => {
    const g = energyGrid(face(0.5), 0, 0, 1, 5, 1);
    expect(g.size).toBe(11);
    expect(g.values.length).toBe(121);
    expect(Array.from(g.values).every(Number.isFinite)).toBe(true);
  });
});
