import { describe, expect, it } from 'vitest';
import { SunlightMap } from './SunlightMap';

describe('the sunlight map ahead of the land', () => {
  it('hands over its clear and march passes to prewarm (the march otherwise first builds on the frame the land arrives)', () => {
    const passes = new SunlightMap().computePasses;
    expect(passes.length).toBe(2);
    expect(passes.every((n) => n.isComputeNode)).toBe(true);
  });
});
