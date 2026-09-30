import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { CloudMeter, easeStops, meterLuminance } from './cloudMeter';
import { exposureCloudStops } from './fog';

describe('easeStops', () => {
  it('moves toward the target at the rate, like an eye adapting, and never overshoots', () => {
    expect(easeStops(0, 2, 0.5, 1)).toBeCloseTo(0.5, 12);
    expect(easeStops(0, 2, 5, 1)).toBe(2);
    expect(easeStops(2, 0, 0.25, 1)).toBeCloseTo(1.75, 12);
    expect(easeStops(1, 1, 1, 1)).toBe(1);
  });
});

describe('meterLuminance', () => {
  it('reads the light on a level surface: the sun (through the cloud) at its elevation plus the sky', () => {
    const sun: [number, number, number] = [10, 10, 10], sky: [number, number, number] = [1, 1, 1];
    expect(meterLuminance(sun, 0.5, 1, sky)).toBeCloseTo(6, 9);
    expect(meterLuminance(sun, 0.5, 0, sky)).toBeCloseTo(1, 9);
    expect(meterLuminance(sun, -0.2, 1, sky)).toBeCloseTo(1, 9);
  });
});

describe('CloudMeter', () => {
  // A stand-in for the GPU readback: the sky light (cloudy, sun, clear) and the sun's transmittance through the cloud.
  const skyLight = { name: 'skyLight' }, cloudSun = { name: 'cloudSun' };
  const buffers = new Map<object, Float32Array>([
    [skyLight, new Float32Array([0.5, 0.5, 0.5, 1, 10, 10, 10, 1, 1, 1, 1, 1])],
    [cloudSun, new Float32Array([0, 0, 0, 1])],
  ]);
  const renderer = { getArrayBufferAsync: async (a: object) => buffers.get(a)!.buffer } as unknown as THREE.WebGPURenderer;
  const make = () => new CloudMeter(skyLight as unknown as THREE.StorageBufferAttribute, cloudSun as unknown as THREE.StorageBufferAttribute);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const target = exposureCloudStops(meterLuminance([10, 10, 10], 0.15, 1, [1, 1, 1]), meterLuminance([10, 10, 10], 0.15, 0, [0.5, 0.5, 0.5]));

  it('eases toward the metered stops like an eye', async () => {
    const m = make();
    m.update(renderer, 0.016, 0.15, true);
    await flush();
    m.update(renderer, 0.016, 0.15, true);
    expect(m.stops).toBeGreaterThan(0);
    expect(m.stops).toBeLessThan(target);
  });

  it('snaps to the new sky after a moment is applied (final review I4: captures must not depend on what came before)', async () => {
    const m = make();
    m.update(renderer, 0.016, 0.15, true);
    m.snapNext();
    m.update(renderer, 0.016, 0.15, true);
    await flush();
    m.update(renderer, 0.016, 0.15, true);
    expect(m.stops).toBeCloseTo(target, 9);
  });
});
