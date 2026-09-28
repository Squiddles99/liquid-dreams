import { describe, expect, it } from 'vitest';
import { coverAt } from './landCover';
import { DEFAULT_BEACH } from './landHeight';

const p = DEFAULT_BEACH;
const sum = (c: ReturnType<typeof coverAt>) => c.wet + c.sand + c.rock + c.heath;

describe('coverAt', () => {
  it('wet sand at the waterline, dry sand on the beach, rock at the toe, heath inland', () => {
    const at = (d: number, slope = 0.05) => coverAt(d, slope, 0, 1234, 5, p);
    expect(at(5).wet + at(5).rock).toBeGreaterThan(0.9);
    expect(at(25).sand).toBeGreaterThan(0.9);
    // The toe is rock in clumps with sand between (Andrew's inside-shelf aerial): mostly rock along the coast, never heath.
    let rock = 0, heathAtToe = 0;
    for (let z = 0; z < 2000; z += 7) { const c = coverAt(47, 0.1, 0, z, 5, p); rock += c.rock; heathAtToe = Math.max(heathAtToe, c.heath); }
    expect(rock / Math.ceil(2000 / 7)).toBeGreaterThan(0.5);
    expect(rock / Math.ceil(2000 / 7)).toBeLessThan(0.9);
    expect(heathAtToe).toBeLessThan(0.3);
    expect(at(300, 0).heath).toBeGreaterThan(0.99); // flat heath: no blowouts or outcrops
  });
  it('always sums to 1', () => {
    for (let k = 0; k < 500; k++) {
      const c = coverAt((k * 7.3) % 400 - 20, (k * 0.137) % 1, k * 13.1, k * -7.7, (k * 3.1) % 150, p);
      expect(sum(c)).toBeCloseTo(1, 5);
    }
  });
  it('blowouts and outcrops only on slopes', () => {
    for (let x = 0; x < 2000; x += 9) expect(coverAt(300, 0.02, x, 50, 60, p).heath).toBeGreaterThan(0.99);
    let bare = 0;
    for (let x = 0; x < 2000; x += 9) { const c = coverAt(300, 0.6, x, 50, 60, p); if (c.heath < 0.5) bare++; }
    expect(bare).toBeGreaterThan(0);
  });
  it('rock is rust low down and grey higher up', () => {
    expect(coverAt(47, 0.1, 0, 0, 4, p).rockGrey).toBeLessThan(0.05);
    expect(coverAt(300, 0.6, 0, 0, 40, p).rockGrey).toBeGreaterThan(0.95);
  });
});
