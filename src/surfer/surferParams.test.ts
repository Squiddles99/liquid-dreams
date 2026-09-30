import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFER_PARAMS, SURFER_PARAM_RANGES, normalizeSurferParams, sanitizeSurferParams } from './surferParams';

describe('surfer params', () => {
  it('start off, on the female surfer sitting on the thruster in the lineup', () => {
    expect(DEFAULT_SURFER_PARAMS).toMatchObject({ enabled: false, preset: 'female', board: 'thruster', pose: 'sit', outfit: 'season', x: -25, z: 45 });
  });
  it('repair a pose that doesn’t exist on the board, and an outfit from the other preset (Review Focus 3)', () => {
    const p = { ...DEFAULT_SURFER_PARAMS, board: 'thruster' as const, pose: 'dropKnee' as const, preset: 'male' as const, outfit: 'bikini' as const };
    normalizeSurferParams(p);
    expect(p.pose).toBe('sit');
    expect(p.outfit).toBe('season');
  });
  it('clamp numbers, wrap the heading, and replace junk (Review Focus 3)', () => {
    const p = sanitizeSurferParams({ enabled: 'yes', preset: 'ghost', compression: 9, lean: Number.NaN, headingDeg: -90, x: 'far', balance: 0, extra: 1 });
    expect(p.enabled).toBe(false);
    expect(p.preset).toBe('female');
    expect(p.compression).toBe(SURFER_PARAM_RANGES.compression.max);
    expect(p.lean).toBe(0);
    expect(p.headingDeg).toBe(270);
    expect(p.x).toBe(DEFAULT_SURFER_PARAMS.x);
    expect(p.balance).toBe(true);
    expect('extra' in p).toBe(false);
  });
  it('turn anything that isn’t an object into the defaults', () => {
    expect(sanitizeSurferParams(null)).toEqual(DEFAULT_SURFER_PARAMS);
    expect(sanitizeSurferParams([1, 2])).toEqual(DEFAULT_SURFER_PARAMS);
  });
});
