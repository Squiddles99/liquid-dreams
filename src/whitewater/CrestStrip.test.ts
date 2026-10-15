import { describe, expect, it } from 'vitest';
import { STRIP_FULL_WIND_MS, STRIP_HEIGHT_A, stripColumns, stripHeight } from './CrestStrip';
import { featherStrength, type FeatherEmitter } from './sprayEmitters';

const em = (arc: number, over: Partial<FeatherEmitter> = {}): FeatherEmitter => ({
  x: arc * 3, y: 2, z: 0, nx: 0, nz: 1, strength: 1, waveId: 1, arc, wOff: STRIP_FULL_WIND_MS, A: 3, fromFrame: true, ...over,
});

describe('the crest strip (breaking-look item 5a): feathering as one draw, by the wind table', () => {
  it('20 kn offshore, full strength: the strip stands STRIP_HEIGHT_A (1.5) × A', () => {
    expect(STRIP_HEIGHT_A).toBe(1.5);
    expect(stripHeight(featherStrength(1, STRIP_FULL_WIND_MS, 1), 3, STRIP_FULL_WIND_MS)).toBeCloseTo(4.5, 9);
  });

  it('7 km/h: a thin fringe (under 0.1 A); Glassy (no wind): none', () => {
    const w7 = 7 / 3.6, h7 = stripHeight(featherStrength(1, w7, 1), 3, w7);
    expect(h7).toBeGreaterThan(0);
    expect(h7 / 3).toBeLessThan(0.1);
    expect(stripHeight(featherStrength(1, 0, 1), 3, 0)).toBe(0);
  });

  it('leans downwind (back over the wave, −n) and rises from the crest knot', () => {
    const c = stripColumns([em(0), em(1)], [], 0, 3);
    expect(c[0].y).toBe(2);
    expect(c[0].ty).toBeCloseTo(2 + 4.5, 9);
    expect(c[0].tz).toBeLessThan(c[0].z);
  });

  it('joins consecutive arcs of one wave; breaks between waves and across gaps; a lone emitter draws nothing', () => {
    const c = stripColumns([em(0), em(1), em(2), em(9), em(3, { waveId: 2 }), em(4, { waveId: 2 })], [], 0, 3);
    expect(c.map((x) => x.s)).toEqual([0, 1, 1, 0, 0, 1]);
    expect(c[3].ty).toBe(c[3].y);
  });

  it('eases between ticks by wave and arc', () => {
    const c = stripColumns([em(0), em(1)], [em(0, { x: 10 }), em(1, { x: 13 })], 0.5, 3);
    expect(c[0].x).toBeCloseTo(5, 9);
    expect(c[1].x).toBeCloseTo(8, 9);
  });
});
