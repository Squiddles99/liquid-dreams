import { describe, expect, it } from 'vitest';
import { boreWeight, flightTime, sectionEnd } from '../breaker/wombSection';
import { CHURN_FADE_S, FRESH_BOIL_WEIGHT, FRESH_FADE_S, FRESH_RISE_S, boilFreshness, boilWeight, freshFoamWeight } from './pileChurn';

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

describe('pileChurn: fresh boil is solid white, lace as it ages (whitewater F3)', () => {
  const H = 2, T = 15, land = flightTime(H);
  it('lifts the pattern weight to FRESH_BOIL_WEIGHT (0.9) on a fresh boil where there is foam', () => {
    expect(FRESH_BOIL_WEIGHT).toBe(0.9);
    let peak = 0;
    for (let tb = 0; tb < 15; tb += 0.05) peak = Math.max(peak, boilWeight(tb, H, T, 1));
    // At the boil's peak, foam 0.5 (the lace's holes) becomes ≥ 0.9 × the boil.
    expect(freshFoamWeight(0.5, 1)).toBeGreaterThanOrEqual(0.9);
    expect(freshFoamWeight(0.5, peak)).toBeGreaterThanOrEqual(0.9 * peak);
  });
  it('never paints foam where there is none, and never lowers it', () => {
    expect(freshFoamWeight(0, 1)).toBe(0);
    expect(freshFoamWeight(0.1, 1)).toBeCloseTo(0.1, 12);
    for (const f of [0, 0.3, 0.6, 0.95]) for (const b of [0, 0.5, 1]) expect(freshFoamWeight(f, b)).toBeGreaterThanOrEqual(f);
  });
  it('lets the lace back as the boil ages (CHURN_FADE_S after the landing: the plain weight)', () => {
    const old = boilWeight(land + CHURN_FADE_S + 1, H, T, 1);
    expect(freshFoamWeight(0.5, old)).toBeCloseTo(0.5, 6);
  });
});

describe('pileChurn: boilFreshness, the mound solid through its broken life (whitewater F3)', () => {
  const H = 3, T = 15, land = flightTime(H), end = sectionEnd(H, T);
  it('is 0 before the landing, 1 from FRESH_RISE_S after it to the white-water wall, 0 FRESH_FADE_S after that', () => {
    expect(boilFreshness(null, H, T)).toBe(0);
    expect(boilFreshness(land - 0.05, H, T)).toBe(0);
    for (let tb = land + FRESH_RISE_S; tb <= end; tb += 0.25) expect(boilFreshness(tb, H, T), `tb ${tb}`).toBe(1);
    expect(boilFreshness(end + FRESH_FADE_S, H, T)).toBe(0);
    expect(boilFreshness(Infinity, H, T)).toBe(0);
  });
  it('rises over FRESH_RISE_S (0.5 s) after the landing: a short gradient along the crest, not a cliff at the held tube (F6)', () => {
    expect(FRESH_RISE_S).toBe(0.5);
    expect(boilFreshness(land, H, T)).toBe(0);
    const mid = boilFreshness(land + FRESH_RISE_S / 2, H, T);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    for (let a = 0; a < FRESH_RISE_S; a += 0.05) expect(boilFreshness(land + a + 0.05, H, T)).toBeGreaterThanOrEqual(boilFreshness(land + a, H, T));
  });
  it('makes the mound solid (weight ≥ 0.9 where the lace holes were) and lets the lace back as it ages', () => {
    for (const f of [0.3, 0.5, 0.7]) expect(freshFoamWeight(f, boilFreshness(end - 0.5, H, T))).toBeGreaterThanOrEqual(FRESH_BOIL_WEIGHT);
    expect(freshFoamWeight(0.5, boilFreshness(end + FRESH_FADE_S + 1, H, T))).toBeCloseTo(0.5, 12);
  });
});
