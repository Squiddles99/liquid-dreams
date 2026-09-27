import { describe, expect, it } from 'vitest';
import { pickSheetMaterial, waterFoamFrameCpu } from './OceanSurface';

describe('the sheet from below', () => {
  it('crossing the surface swaps between two fixed materials, never builds a new one', () => {
    const above = { name: 'above' }, below = { name: 'below' };
    const seen = new Set<object>();
    let on = false;
    for (let i = 0; i < 50; i++) { on = !on; seen.add(pickSheetMaterial(on, above, below)); }
    expect([...seen]).toEqual(expect.arrayContaining([above, below]));
    expect(seen.size).toBe(2);
    expect(pickSheetMaterial(false, above, below)).toBe(above);
    expect(pickSheetMaterial(true, above, below)).toBe(below);
  });
});

describe('the foam pattern rides the water, not the crest', () => {
  it('is base xz in the mean swell frame: (along travel, across it), so it stays put while crests pass', () => {
    expect(waterFoamFrameCpu(3, 4, 1, 0)).toEqual([3, 4]);
    const [a, b] = waterFoamFrameCpu(1, 0, Math.SQRT1_2, Math.SQRT1_2);
    expect(a).toBeCloseTo(Math.SQRT1_2, 12);
    expect(b).toBeCloseTo(-Math.SQRT1_2, 12);
  });
});
