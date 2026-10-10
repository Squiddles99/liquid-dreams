import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { SprayParticles } from './SprayParticles';
import { PLUME_LIFE_S, replayTicksForMaxLife, sprayReplayTicks } from './sprayEmitters';

describe('the spray particles on the GPU', () => {
  it('replays the longest life on its first advance, one submission per tick, asking for each tick in order', () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    const calls: unknown[] = [];
    const renderer = { compute: (n: unknown) => { calls.push(n); } } as unknown as THREE.WebGPURenderer;
    const asked: number[] = [];
    const steps = spray.advance(renderer, 10, (k) => { asked.push(k); return k % 2 ? [] : [{ x: 0, y: 1, z: 0, vx: 0, vy: 2, vz: 0, life: 2, strength: 1 }]; });
    // The spray's pool also carries the plume (whitewater §4.1): it replays the plume's longest life.
    expect(steps).toBe(replayTicksForMaxLife(Math.max(1.2 * 2, PLUME_LIFE_S[1])));
    expect(steps).toBeGreaterThan(sprayReplayTicks(2));
    expect(asked).toEqual(Array.from({ length: steps }, (_, i) => 200 - steps + 1 + i));
    expect(calls.length).toBe(1 + steps);
    expect(calls.slice(1).every((c) => Array.isArray(c))).toBe(true);
    expect(spray.mesh.count).toBeGreaterThan(30000);
  });
});

describe('the spray particles ahead of the first break', () => {
  it('hands over its birth, step and clear passes to prewarm (the birth pass otherwise first builds when a lip first throws)', () => {
    const passes = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE)).computePasses;
    expect(passes.length).toBe(3);
    expect(passes.every((n) => n.isComputeNode)).toBe(true);
  });
});
