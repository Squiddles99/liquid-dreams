import { describe, expect, it } from 'vitest';
import { LatestOnly } from './LatestOnly';

describe('LatestOnly', () => {
  it('LatestOnly ignores stale replies', () => {
    const l = new LatestOnly();
    const a = l.next(), b = l.next(), c = l.next();
    expect(l.accept(a)).toBe(false);
    expect(l.accept(b)).toBe(false);
    expect(l.accept(c)).toBe(true);
    expect(l.accept(c)).toBe(true);
  });
});
