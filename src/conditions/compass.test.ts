import { describe, expect, it } from 'vitest';
import { compassPoint } from './compass';

describe('compassPoint', () => {
  it('names the 16 points, each centred on its bearing', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(11.24)).toBe('N');
    expect(compassPoint(11.25)).toBe('NNE');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(80)).toBe('E');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(247.5)).toBe('WSW');
  });

  it('wraps back to N approaching 360', () => {
    expect(compassPoint(348.74)).toBe('NNW');
    expect(compassPoint(348.75)).toBe('N');
    expect(compassPoint(359.9)).toBe('N');
    expect(compassPoint(360)).toBe('N');
  });

  it('normalises negative input', () => {
    expect(compassPoint(-10)).toBe('N');
  });
});
