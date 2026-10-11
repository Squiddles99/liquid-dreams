import type * as THREE from 'three/webgpu';
import { float, vec2 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { FoamField } from './FoamField';
import { COARSE_SOURCE_SAMPLES, COARSE_TICKS, DEFAULT_FOAM_PARAMS, FoamSchedule, replayTickCount } from './foamStep';

describe('the foam field on the GPU', () => {
  it('submits each tick as one renderer.compute call (a replay cost was the number of submissions, not the work)', () => {
    const field = new FoamField({ foamNode: () => float(0.0), dirNode: () => vec2(1.0, 0.0) }, { x0: 0, z0: 0, cellM: 1, nx: 8, nz: 8 });
    const calls: unknown[] = [];
    const renderer = { compute: (n: unknown) => { calls.push(n); } } as unknown as THREE.WebGPURenderer;
    const prepared: number[] = [];
    const steps = field.advance(renderer, 30, (t) => prepared.push(t), true);
    // The default history (clearTime 10 + laceLife 75 s): its oldest part in coarse steps, the last FINE_REPLAY_S fine.
    const plan = new FoamSchedule().plan(30, DEFAULT_FOAM_PARAMS.clearTimeS + DEFAULT_FOAM_PARAMS.laceLifeS);
    expect(steps).toBe(plan.coarse.length + plan.ticks.length);
    expect(plan.coarse.length * COARSE_TICKS + plan.ticks.length).toBeGreaterThanOrEqual(replayTickCount(85) - COARSE_TICKS);
    // One clear, then one submission per tick, each carrying the tick's passes together.
    expect(calls.length).toBe(1 + steps);
    expect(calls.slice(1).every((c) => Array.isArray(c) && c.length === 2)).toBe(true);
    expect(prepared.length).toBe(steps);
  });
  it("a covered replay samples each coarse step's source COARSE_SOURCE_SAMPLES times, an uncovered one once (Fable's Task 4 ruling)", () => {
    const field = new FoamField({ foamNode: () => float(0.0), dirNode: () => vec2(1.0, 0.0) }, { x0: 0, z0: 0, cellM: 1, nx: 8, nz: 8 });
    const renderer = { compute: () => {} } as unknown as THREE.WebGPURenderer;
    field.advance(renderer, 300, () => {}, true);
    expect(field.lastCoarseSamples).toBe(COARSE_SOURCE_SAMPLES);
    field.invalidate();
    field.advance(renderer, 400, () => {}, false);
    expect(field.lastCoarseSamples).toBe(1);
  });
});
