import { describe, expect, it } from 'vitest';
import { awstToUtc } from './time';

describe('awstToUtc', () => {
  it('08:15 AWST is 00:15 UTC the same day', () => {
    expect(awstToUtc('2026-07-15', 8.25).toISOString()).toBe('2026-07-15T00:15:00.000Z');
  });
  it('06:00 AWST is 22:00 UTC the previous day', () => {
    expect(awstToUtc('2026-07-15', 6).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });
  it('09:30 AWST in April', () => {
    expect(awstToUtc('2026-04-20', 9.5).toISOString()).toBe('2026-04-20T01:30:00.000Z');
  });
});
