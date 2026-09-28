import { describe, expect, it } from 'vitest';
import type { Rock } from './rocks';
import { SHADOW_CELL_M, SHADOW_N, buildGroundShadows } from './rockShadows';

const rock: Rock = { x: 32, z: 32, y: 0, kind: 'toe', shape: 0, radius: 1.5, height: 1.2, yaw: 0, tiltX: 0, tiltZ: 0, tint: [0.3, 0.2, 0.13], topTint: [0.3, 0.2, 0.13] };
const at = (m: Float32Array, x: number, z: number, ch: 0 | 1) => {
  const i = Math.floor(x / SHADOW_CELL_M), j = Math.floor(z / SHADOW_CELL_M);
  return m[(j * SHADOW_N + i) * 2 + ch];
};
// The sun low in the east (+x), 10° up: shadows fall west (−x).
const e = (10 * Math.PI) / 180;
const sunEast: [number, number, number] = [Math.cos(e), Math.sin(e), 0];

describe('grounding shadows', () => {
  const m = buildGroundShadows([rock], 0, 0, sunEast);
  it('shade the ground behind a rock, away from the sun, not in front', () => {
    expect(at(m, 32 - 3, 32, 0)).toBeGreaterThan(0.5);
    expect(at(m, 32 + 3, 32, 0)).toBe(0);
  });
  it('are capped at 12 m long', () => {
    const e3 = (3 * Math.PI) / 180; // 1.2 m / tan 3° = 22.9 m uncapped
    const low = buildGroundShadows([rock], 0, 0, [Math.cos(e3), Math.sin(e3), 0]);
    expect(at(low, 32 - 7, 32, 0)).toBeGreaterThan(0.5);
    expect(at(low, 32 - 13.5, 32, 0)).toBe(0);
  });
  it('darken a contact ring, strongest at the base', () => {
    expect(at(m, 32 + rock.radius * 0.9, 32, 1)).toBeGreaterThan(at(m, 32 + rock.radius * 1.25, 32, 1));
    expect(at(m, 32 + rock.radius * 2, 32, 1)).toBe(0);
  });
  it('diagonal shadows match a brute-force pass over every texel (the per-row span skips only empty texels)', () => {
    const rocks: Rock[] = [rock, { ...rock, x: 20, z: 45, radius: 1, height: 2 }, { ...rock, x: 50, z: 10, radius: 0.4, height: 0.5 }];
    const a = (20 * Math.PI) / 180, e5 = (5 * Math.PI) / 180;
    const sun: [number, number, number] = [Math.cos(e5) * Math.cos(a), Math.sin(e5), Math.cos(e5) * Math.sin(a)];
    const fast = buildGroundShadows(rocks, 0, 0, sun);
    const slow = buildGroundShadows(rocks, 0, 0, sun, { bruteForce: true });
    let worst = 0;
    for (let k = 0; k < fast.length; k++) worst = Math.max(worst, Math.abs(fast[k] - slow[k]));
    expect(worst).toBe(0);
    let peak = 0;
    for (const v of fast) peak = Math.max(peak, v);
    expect(peak).toBeGreaterThan(0.5);
  });
  it('none with the sun below 1°', () => {
    const night = buildGroundShadows([rock], 0, 0, [1, -0.1, 0]);
    expect(Math.max(...Array.from(night).filter((_, i) => i % 2 === 0))).toBe(0);
  });
});

describe('shadow casters (4c-2)', () => {
  const plant = { x: 32, z: 32, radius: 1, height: 1 };
  it('a caster of strength 0.6 casts 0.6 of a full caster\'s shadow and ring', () => {
    const full = buildGroundShadows([plant], 0, 0, sunEast);
    const soft = buildGroundShadows([{ ...plant, strength: 0.6 }], 0, 0, sunEast);
    expect(at(soft, 30, 32, 0)).toBeCloseTo(0.6 * at(full, 30, 32, 0), 5);
    expect(at(soft, 32.8, 32, 1)).toBeCloseTo(0.6 * at(full, 32.8, 32, 1), 5);
  });
  it('a ring-only caster (pigface, rice-flower) casts no sun shadow', () => {
    const low = buildGroundShadows([{ ...plant, ringOnly: true }], 0, 0, sunEast);
    expect(at(low, 30, 32, 0)).toBe(0);
    expect(at(low, 32.8, 32, 1)).toBeGreaterThan(0);
  });
  it('rocks are unchanged (strength 1 by default)', () => {
    expect(buildGroundShadows([rock], 0, 0, sunEast)).toEqual(buildGroundShadows([{ ...rock, strength: 1 }], 0, 0, sunEast));
  });
});

describe('shadow length caps (final review I1)', () => {
  it('a caster with maxLenM casts no further than that', () => {
    const e3 = (3 * Math.PI) / 180;
    const low: [number, number, number] = [Math.cos(e3), Math.sin(e3), 0];
    const capped = buildGroundShadows([{ ...rock, maxLenM: 4 }], 0, 0, low);
    expect(at(capped, 32 - 2.5, 32, 0)).toBeGreaterThan(0.5);
    expect(at(capped, 32 - 5, 32, 0)).toBe(0);
  });
});

