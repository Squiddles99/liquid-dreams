import { describe, expect, it } from 'vitest';
import { meterFill, meterShown, tickText } from './LoadMeter';

describe('the keyboard load meter (Andrew 2026-10-14: the minimalist mock)', () => {
  it('auto: only without a pad; on and off as set', () => {
    expect(meterShown('auto', false)).toBe(true);
    expect(meterShown('auto', true)).toBe(false);
    expect(meterShown('on', true)).toBe(true);
    expect(meterShown('off', false)).toBe(false);
  });
  it('fills with the load from 0.5 to 2 g; the 1 g hairline sits a third of the way up', () => {
    expect(meterFill(0.2)).toBe(0);
    expect(meterFill(1)).toBeCloseTo(1 / 3, 9);
    expect(meterFill(2.5)).toBe(1);
  });
  it('the tick shows the pump as speed (ΔE/v), and stays quiet under 0.05 m/s', () => {
    expect(tickText(2.4, 8)).toBe('▲ +0.3');
    expect(tickText(-1.6, 8)).toBe('▼ −0.2');
    expect(tickText(0.14, 7)).toBeNull();
  });
});
