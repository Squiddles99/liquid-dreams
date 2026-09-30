import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { SunlightMap } from './SunlightMap';

describe('the sunlight map ahead of the land', () => {
  it('compiles its clear and march passes (the march otherwise first builds on the frame the land arrives)', async () => {
    const map = new SunlightMap();
    const compiled: unknown[][] = [];
    const renderer = { compileComputeAsync: async (n: unknown[]) => { compiled.push(n); } } as unknown as THREE.WebGPURenderer;
    await map.compileAsync(renderer);
    expect(compiled.length).toBe(1);
    expect(compiled[0].length).toBe(2);
    expect(compiled[0].every((n) => (n as { isComputeNode?: boolean }).isComputeNode)).toBe(true);
  });
});
