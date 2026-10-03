// src/surfer/expressions.test.ts
import { describe, expect, it } from 'vitest';
import { SELECT_EXPRESSIONS, restingFace, withExpression } from './faceControl';
import { DEFAULT_SURFER_PARAMS, sanitizeSurferParams } from './surferParams';

const NAMES = ['female', 'male', 'grommet'] as const;

describe('the select expressions (dune select spec §13.1: authored, symmetric, never raw dial mixes)', () => {
  it('has grin, stoked and easy for every rider, inside 0–1, stoked the biggest smile and easy the smallest', () => {
    for (const n of NAMES) {
      const e = SELECT_EXPRESSIONS[n];
      for (const k of ['grin', 'stoked', 'easy'] as const) for (const v of Object.values(e[k])) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(e.stoked.smile!).toBeGreaterThan(e.grin.smile!);
      expect(e.grin.smile!).toBeGreaterThan(e.easy.smile!);
      expect(e.grin.squint!).toBeGreaterThan(0); // the eyes engaged
    }
  });
  it('keeps the face symmetric: an expression never sets one eye apart from the other', () => {
    for (const n of NAMES) for (const k of ['grin', 'stoked', 'easy'] as const) {
      const f = withExpression({ ...restingFace(), blinkL: 0.3, blinkR: 0.3 }, n, k);
      expect(f.blinkL).toBe(f.blinkR);
      expect('blinkL' in SELECT_EXPRESSIONS[n][k] || 'blinkR' in SELECT_EXPRESSIONS[n][k]).toBe(false);
    }
  });
  it('leaves the face alone on none, and keeps idle life\'s breathing and gaze under an expression', () => {
    const idle = { ...restingFace(), breathe: 0.4, gazeYawDeg: 3 };
    expect(withExpression(idle, 'female', 'none')).toEqual(idle);
    const g = withExpression(idle, 'female', 'grin');
    expect(g.breathe).toBe(0.4);
    expect(g.gazeYawDeg).toBe(3);
  });
  it('is a surfer param, sanitised', () => {
    expect(DEFAULT_SURFER_PARAMS.expression).toBe('none');
    expect(sanitizeSurferParams({ ...DEFAULT_SURFER_PARAMS, expression: 'grin' }).expression).toBe('grin');
    expect(sanitizeSurferParams({ ...DEFAULT_SURFER_PARAMS, expression: 'smirk' }).expression).toBe('none');
  });
});
