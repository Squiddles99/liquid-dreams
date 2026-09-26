import { describe, expect, it } from 'vitest';
import type { Rgb } from '../sky/atmosphereParams';
import { extinction, marchSeabed, transmittance, waterColumnRadiance } from './waterColumn';

const c: Rgb = extinction([0.45, 0.07, 0.02], [0.0004, 0.001, 0.0024]);
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

describe('water column', () => {
  it('reduces exactly to the Phase 0 deep-water colour when no seabed is in reach', () => {
    const body: Rgb = [0.01, 0.03, 0.08];
    expect(waterColumnRadiance([0.5, 0.4, 0.3], body, transmittance(c, Infinity))).toEqual(body);
  });
  it('shows the seabed unattenuated at zero path, and absorbs red first', () => {
    expect(waterColumnRadiance([0.5, 0.4, 0.3], [0, 0, 0], transmittance(c, 0))).toEqual([0.5, 0.4, 0.3]);
    const t = transmittance(c, 6);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
  });
});

describe('seabed ray-march (CPU mirror of the shader)', () => {
  const flat = (y: number) => () => y;
  it('hits a flat bed straight down and at 45°', () => {
    expect(marchSeabed([0, 0, 0], [0, -1, 0], flat(-5)).distance).toBeCloseTo(5, 1);
    expect(marchSeabed([0, 0, 0], norm([1, -1, 0]), flat(-5)).distance).toBeCloseTo(5 * Math.SQRT2, 1);
  });
  it('finds a shelf beyond a step', () => {
    const step = (x: number) => (x < 3 ? -10 : -2);
    const d = norm([0.8, -0.2, 0]);
    const r = marchSeabed([0, 0, 0], d, step);
    expect(r.hit).toBe(true);
    expect(r.distance).toBeCloseTo(2 / -d[1], 0); // where the ray reaches y = −2 over the shelf
    expect(d[0] * r.distance).toBeCloseTo(8, 0);
  });
  it('gives up in deep water, looking up, and hits immediately where the reef is dry', () => {
    expect(marchSeabed([0, 0, 0], [0, -1, 0], flat(-30)).hit).toBe(false);
    expect(marchSeabed([0, 0, 0], norm([1, 0.2, 0]), flat(-5)).hit).toBe(false);
    expect(marchSeabed([0, -1, 0], [0, -1, 0], flat(0.5))).toEqual({ hit: true, distance: 0 });
  });
});
