import { describe, expect, it } from 'vitest';
import { pickSheetMaterial } from './OceanSurface';

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
