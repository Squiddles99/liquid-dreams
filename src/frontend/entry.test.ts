// src/frontend/entry.test.ts
import { describe, expect, it } from 'vitest';
import { frontEndWanted } from './entry';

describe('when the front end opens (spec §3)', () => {
  it('opens on a normal start', () => expect(frontEndWanted('', '')).toBe(true));
  it('skips for a moment link, a reference link, a self-test, the species sheet, or ?frontend=off', () => {
    expect(frontEndWanted('', '#m=abc')).toBe(false);
    expect(frontEndWanted('', '#moment=abc')).toBe(false);
    expect(frontEndWanted('', '#ref=womb')).toBe(false);
    expect(frontEndWanted('?selftest', '')).toBe(false);
    expect(frontEndWanted('?selftest=frontend', '')).toBe(false);
    expect(frontEndWanted('?sheet=species', '')).toBe(false);
    expect(frontEndWanted('?frontend=off', '')).toBe(false);
  });
  it('still opens with unrelated query parameters', () => expect(frontEndWanted('?gpu=high', '#')).toBe(true));
});
