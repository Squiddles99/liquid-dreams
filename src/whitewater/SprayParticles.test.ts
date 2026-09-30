import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { SprayParticles } from './SprayParticles';
import { sprayReplayTicks } from './sprayEmitters';

describe('the spray particles on the GPU', () => {
  it('replays the longest life on its first advance, one submission per tick, asking for each tick in order', () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    const calls: unknown[] = [];
    const renderer = { compute: (n: unknown) => { calls.push(n); } } as unknown as THREE.WebGPURenderer;
    const asked: number[] = [];
    const steps = spray.advance(renderer, 10, (k) => { asked.push(k); return k % 2 ? [] : [{ x: 0, y: 1, z: 0, vx: 0, vy: 2, vz: 0, life: 2, strength: 1 }]; });
    expect(steps).toBe(sprayReplayTicks(2));
    expect(asked).toEqual(Array.from({ length: steps }, (_, i) => 200 - steps + 1 + i));
    expect(calls.length).toBe(1 + steps);
    expect(calls.slice(1).every((c) => Array.isArray(c))).toBe(true);
    expect(spray.mesh.count).toBeGreaterThan(30000);
  });
});

describe('the spray particles ahead of the first break', () => {
  it('compiles its birth, step and clear passes (the birth pass otherwise first builds when a lip first throws)', async () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    const compiled: unknown[][] = [];
    const renderer = { compileComputeAsync: async (n: unknown[]) => { compiled.push(n); } } as unknown as THREE.WebGPURenderer;
    await spray.compileAsync(renderer);
    expect(compiled.length).toBe(1);
    expect(compiled[0].length).toBe(3);
    expect(compiled[0].every((n) => (n as { isComputeNode?: boolean }).isComputeNode)).toBe(true);
  });
});
