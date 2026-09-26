import { describe, expect, it } from 'vitest';
import { CASCADE_SIZES_M } from './spectrum';
import { CASCADE_FADES, fadeWeight } from './cascadeFades';

describe('fadeWeight', () => {
  it('is 1 before the range, 0 after, 0.5 in the middle', () => {
    expect(fadeWeight(10, [20, 60])).toBe(1);
    expect(fadeWeight(60, [20, 60])).toBe(0);
    expect(fadeWeight(100, [20, 60])).toBe(0);
    expect(fadeWeight(40, [20, 60])).toBeCloseTo(0.5);
  });
  it('never increases with distance', () => {
    let prev = 1;
    for (let d = 0; d < 100; d += 0.5) { const w = fadeWeight(d, [20, 60]); expect(w).toBeLessThanOrEqual(prev); prev = w; }
  });
});

describe('CASCADE_FADES', () => {
  it('has one entry per cascade', () => expect(CASCADE_FADES.length).toBe(CASCADE_SIZES_M.length));
  it('finer cascades fade sooner, and normals outlast geometry', () => {
    for (let c = 1; c < CASCADE_FADES.length; c++) expect(CASCADE_FADES[c].geometry[1]).toBeLessThan(CASCADE_FADES[c - 1].geometry[1]);
    for (const f of CASCADE_FADES) expect(f.normals[1]).toBeGreaterThanOrEqual(f.geometry[1]);
  });
});
