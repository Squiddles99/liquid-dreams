import type * as THREE from 'three/webgpu';
import { float, vec2 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { FoamField } from './FoamField';
import { replayTickCount } from './foamStep';

describe('the foam field on the GPU', () => {
  it('submits each tick as one renderer.compute call (a replay cost was the number of submissions, not the work)', () => {
    const field = new FoamField({ foamNode: () => float(0.0), dirNode: () => vec2(1.0, 0.0) }, { x0: 0, z0: 0, cellM: 1, nx: 8, nz: 8 });
    const calls: unknown[] = [];
    const renderer = { compute: (n: unknown) => { calls.push(n); } } as unknown as THREE.WebGPURenderer;
    const prepared: number[] = [];
    const steps = field.advance(renderer, 30, (t) => prepared.push(t));
    expect(steps).toBe(replayTickCount(10));
    // One clear, then one submission per tick, each carrying the tick's passes together.
    expect(calls.length).toBe(1 + steps);
    expect(calls.slice(1).every((c) => Array.isArray(c) && c.length === 2)).toBe(true);
    expect(prepared.length).toBe(steps);
  });
});
