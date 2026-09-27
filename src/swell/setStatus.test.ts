import { describe, expect, it } from 'vitest';
import type { WaveEvent } from './sets';
import { formatCountdown, formatNextSet, waveStatus } from './setStatus';

const ev = (arrivalS: number, indexInSet: number, waveCount: number): WaveEvent => ({
  id: 0, slot: 0, indexInSet, waveCount, arrivalS, heightM: 2, periodS: 15, fromDeg: 225, crestLengthM: 400, crestOffsetM: 0, longTail: false,
});

describe('set readout', () => {
  it('formats a countdown as m:ss', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-3)).toBe('now');
    expect(formatCountdown(59.2)).toBe('1:00');
    expect(formatCountdown(61)).toBe('1:01');
    expect(formatCountdown(754)).toBe('12:34');
  });
  it('names the wave nearest the peak, or the lull', () => {
    const events = [ev(100, 0, 6), ev(115, 1, 6), ev(300, -1, 0)];
    expect(waveStatus(101, events)).toBe('wave 1 of 6');
    expect(waveStatus(113, events)).toBe('wave 2 of 6');
    expect(waveStatus(302, events)).toBe('stray wave');
    expect(waveStatus(200, events)).toBe('lull');
  });
  it('shows "flat" with no next set, else the countdown to it', () => {
    expect(formatNextSet(null, 100)).toBe('flat');
    expect(formatNextSet(160, 100)).toBe('1:00');
  });
});
