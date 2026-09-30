import { describe, expect, it } from 'vitest';
import { MAX_STREAKS, streakCount } from './RainStreaks';

describe('streakCount', () => {
  it('draws nothing when dry, all of them in a downpour, and in proportion between', () => {
    expect(streakCount(0)).toBe(0);
    expect(streakCount(1)).toBe(MAX_STREAKS);
    expect(streakCount(0.25)).toBe(Math.round(MAX_STREAKS / 4));
    expect(streakCount(-1)).toBe(0);
    expect(streakCount(3)).toBe(MAX_STREAKS);
  });
});
