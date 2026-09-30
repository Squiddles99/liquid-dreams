import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { CloudMeter, adaptationGains, easeStops, meterLuminance } from './cloudMeter';
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
    [skyLight, new Float32Array([0.6, 0.5, 0.45, 1, 10, 10, 10, 1, 1, 1, 1, 1])],
    [cloudSun, new Float32Array([0, 0, 0, 1])],
  ]);
  const renderer = { getArrayBufferAsync: async (a: object) => buffers.get(a)!.buffer } as unknown as THREE.WebGPURenderer;
  const make = () => new CloudMeter(skyLight as unknown as THREE.StorageBufferAttribute, cloudSun as unknown as THREE.StorageBufferAttribute);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const target = exposureCloudStops(meterLuminance([10, 10, 10], 0.15, 1, [1, 1, 1]), meterLuminance([10, 10, 10], 0.15, 0, [0.6, 0.5, 0.45]));

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
    expect(m.stops).toBeCloseTo(target, 6); // the readback is float32
  });

  it('adapts the colour to the light under the cloud, and snaps it with the exposure', async () => {
    const m = make();
    m.snapNext();
    m.update(renderer, 0.016, 0.15, true);
    await flush();
    m.update(renderer, 0.016, 0.15, true);
    // The light on the sea: the sun through the cloud (none here) plus the cloudy sky light.
    const expected = adaptationGains([0.6, 0.5, 0.45], 0, 0.15);
    expect(expected[2]).toBeGreaterThan(1.05); // a real correction, not white light
    m.gains.forEach((g, i) => expect(g).toBeCloseTo(expected[i], 6));
  });

  it('eases the rain at the camera in (a shower sweeps in, it never pops), and snaps it on a moment', async () => {
    buffers.set(cloudSun, new Float32Array([0, 0.8, 0, 1]));
    const m = make();
    m.update(renderer, 0.016, 0.15, true);
    await flush();
    m.update(renderer, 0.5, 0.15, true);
    expect(m.rainHere).toBeCloseTo(0.2, 9); // 0.4 a second, for half a second
    const n = make();
    n.snapNext();
    n.update(renderer, 0.016, 0.15, true);
    await flush();
    n.update(renderer, 0.016, 0.15, true);
    expect(n.rainHere).toBeCloseTo(0.8, 6);
    buffers.set(cloudSun, new Float32Array([0, 0, 0, 1]));
  });

  it('keeps white light as it is under a clear sky', () => {
    const m = make();
    m.update(renderer, 0.016, 0.15, false);
    expect(m.gains).toEqual([1, 1, 1]);
  });
});

describe('adaptationGains (the eye adapting to the light under cloud)', () => {
  const warm: [number, number, number] = [1.3, 1, 0.85];
  const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('leaves a clear sky exactly alone (the golden morning keeps its gold)', () => {
    expect(adaptationGains(warm, 1, 0.15)).toEqual([1, 1, 1]);
  });

  it('under a deck that hides the sun, turns its light most of the way to grey, keeping its brightness', () => {
    const g = adaptationGains(warm, 0, 0.15);
    const seen = warm.map((c, i) => c * g[i]);
    const spread = (c: readonly number[]): number => (Math.max(...c) - Math.min(...c)) / lum(c);
    expect(spread(seen)).toBeLessThan(0.2 * spread(warm));
    expect(lum(seen)).toBeCloseTo(lum(warm), 9);
  });

  it('adapts in proportion to how much of the sun the cloud hides', () => {
    const half = adaptationGains(warm, 0.5, 0.15), full = adaptationGains(warm, 0, 0.15);
    expect(Math.abs(half[0] - 1)).toBeCloseTo(Math.abs(full[0] - 1) / 2, 9);
  });

  it('keeps the twilight colours once the sun is down', () => {
    expect(adaptationGains(warm, 0, -0.1)).toEqual([1, 1, 1]);
  });
});
