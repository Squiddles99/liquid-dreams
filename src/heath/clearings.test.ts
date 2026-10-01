import { describe, expect, it } from 'vitest';
import { clearOf } from './clearings';
import type { Plant } from './plants';

const plant = (x: number, z: number, width = 0.6): Plant => ({ x, z, width } as Plant);

describe('clearings in the heath (walking spec §6: riders on land trample a space)', () => {
  it('drops the plants whose canopy reaches into a clearing, and keeps the rest', () => {
    const plants = [plant(0, 0), plant(1.4, 0), plant(1.6, 0), plant(5, 5)];
    const kept = clearOf(plants, [{ x: 0, z: 0, r: 1.2 }]);
    expect(kept.map((p) => p.x)).toEqual([1.6, 5]);
  });
  it('keeps every plant with no clearings, without copying', () => {
    const plants = [plant(0, 0)];
    expect(clearOf(plants, [])).toBe(plants);
  });
});
