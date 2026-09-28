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

describe('coverAt after Andrew’s aerial (2026-09-28)', () => {
  const avg = (d: number, slope: number, pick: (c: ReturnType<typeof coverAt>) => number): number => {
    let s = 0, n = 0;
    for (let z = 0; z < 3000; z += 7) { s += pick(coverAt(d, slope, 13, z, 12, p)); n++; }
    return s / n;
  };
  it('the waterline edge is weedy rock along most of the coast, with sandy gaps', () => {
    let rocky = 0, sandy = 0, n = 0;
    for (let z = 0; z < 6000; z += 11) {
      const c = coverAt(2, 0.05, 0, z, 0.2, p); n++;
      if (c.rock > 0.5) { rocky++; expect(c.weed).toBeGreaterThan(0.9); }
      if (c.rock < 0.2) sandy++;
    }
    expect(rocky / n).toBeGreaterThan(0.55);
    expect(sandy).toBeGreaterThan(0);
  });
  it('the first dune rise is mostly sand with bush clumps and boulders; the heath starts above it', () => {
    expect(avg(72, 0.3, (c) => c.sand)).toBeGreaterThan(0.45);
    const heath = avg(72, 0.3, (c) => c.heath);
    expect(heath).toBeGreaterThan(0.15); expect(heath).toBeLessThan(0.5);
    expect(avg(72, 0.3, (c) => c.rock)).toBeGreaterThan(0.02);
    expect(avg(120, 0.05, (c) => c.heath)).toBeGreaterThan(0.9);
  });
  it('only the shore rock is weedy (the toe and the boulders are bare limestone)', () => {
    expect(avg(47, 0.1, (c) => c.weed)).toBe(0);
  });
});

describe('the per-pixel clump zones (the shader draws the clumps; the mesh carries where they may be)', () => {
  it('reports the toe and dune bands and the per-vertex clump parts it drew, so the shader can swap them', () => {
    for (let z = 0; z < 2000; z += 37) {
      const toe = coverAt(47, 0.1, 5, z, 4, p), dune = coverAt(72, 0.3, 5, z, 14, p), heath = coverAt(200, 0.05, 5, z, 60, p);
      expect(toe.toeBand).toBeGreaterThan(0.99); expect(toe.duneBand).toBe(0);
      expect(dune.duneBand).toBeGreaterThan(0.99); expect(dune.toeBand).toBe(0);
      expect(heath.toeBand + heath.duneBand).toBe(0);
      // The parts are what the vertex drew, never more than the class they belong to.
      expect(toe.clumpRock).toBeLessThanOrEqual(toe.rock + 1e-9);
      expect(dune.clumpRock).toBeLessThanOrEqual(dune.rock + 1e-9);
      expect(dune.bushes).toBeLessThanOrEqual(dune.heath + 1e-9);
    }
  });
});
