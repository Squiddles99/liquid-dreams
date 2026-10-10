import { describe, expect, it } from 'vitest';
import { boreWeight, flightTime } from '../breaker/wombSection';
import { CHURN_FADE_S, boilWeight } from './pileChurn';

describe('pileChurn: the boil on the ribbon\'s broken section (whitewater §3.2)', () => {
  const H = 2, T = 15, land = flightTime(H);
  it('is 0 before the break and before the landing', () => {
    expect(boilWeight(null, H, T, 1)).toBe(0);
    for (const tb of [0, land * 0.5, land - 0.01]) expect(boilWeight(tb, H, T, 1), `tb ${tb}`).toBe(0);
  });
  it('is 0 where there is no fresh foam', () => {
    for (let tb = 0; tb < 12; tb += 0.25) expect(boilWeight(tb, H, T, 0)).toBe(0);
  });
  it('rises with the bore weight, then simmers down by CHURN_FADE_S after the landing', () => {
    let peak = 0, peakAt = 0;
    for (let tb = 0; tb < 15; tb += 0.05) { const w = boilWeight(tb, H, T, 1); if (w > peak) { peak = w; peakAt = tb; } }
    expect(peak).toBeGreaterThan(0.3);
    for (let tb = land; tb < peakAt - 0.3; tb += 0.1) expect(boilWeight(tb + 0.1, H, T, 1) + 1e-12).toBeGreaterThanOrEqual(boilWeight(tb, H, T, 1) * (boreWeight(tb + 0.1, H, T) >= boreWeight(tb, H, T) ? 0.9 : 0));
    expect(boilWeight(land + CHURN_FADE_S + 2, H, T, 1)).toBeLessThan(0.2 * peak);
  });
});
