import { describe, expect, it } from 'vitest';
import { COAST_X_M, SEA_RAIN, coastFactor, rainExtinctionPerM, rainMask, rainRate, strikesBetween, thunderDelayS } from './rainModel';
import { WEATHER_PRESETS } from './weather';

describe('coastFactor (Andrew: the rain mostly falls once the clouds cross the coast)', () => {
  it('is low out at sea, full over the land, and rises steadily across the coast', () => {
    expect(coastFactor(COAST_X_M - 5000)).toBeCloseTo(SEA_RAIN, 12);
    expect(coastFactor(COAST_X_M + 3000)).toBe(1);
    let prev = 0;
    for (let x = COAST_X_M - 4000; x <= COAST_X_M + 3000; x += 100) {
      const f = coastFactor(x);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('rainMask', () => {
  it('needs cloud overhead', () => {
    expect(rainMask(0.95, 0, 0.8)).toBe(0);
  });

  it('is cells for towering cloud and broad patches for a flat deck', () => {
    const area = (conv: number): number => Array.from({ length: 101 }, (_, i) => rainMask(i / 100, 1, conv)).filter((m) => m > 0.5).length;
    expect(area(0.9)).toBeLessThan(area(0.1) * 0.6);
  });
});

describe('rainRate', () => {
  it('is zero without rain, and rains harder over the land than the sea under the same cloud', () => {
    expect(rainRate(WEATHER_PRESETS.grey, COAST_X_M + 2000, 0.9, 1)).toBe(0);
    const w = WEATHER_PRESETS.rain;
    const land = rainRate(w, COAST_X_M + 2000, 0.9, 1), sea = rainRate(w, COAST_X_M - 5000, 0.9, 1);
    expect(land).toBeGreaterThan(0);
    expect(land / sea).toBeGreaterThanOrEqual(1 / SEA_RAIN - 1e-9);
  });
});

describe('rainExtinctionPerM', () => {
  it('adds nothing when dry and leaves about 2 km of visibility in a downpour', () => {
    expect(rainExtinctionPerM(0)).toBe(0);
    expect(3.912 / rainExtinctionPerM(1)).toBeGreaterThan(1500);
    expect(3.912 / rainExtinctionPerM(1)).toBeLessThan(2500);
    expect(3.912 / rainExtinctionPerM(0.2)).toBeGreaterThan(3.912 / rainExtinctionPerM(1));
  });
});

describe('strikesBetween', () => {
  it('is deterministic for a seed, and none at storm 0', () => {
    expect(strikesBetween(7, 1, 0, 600)).toEqual(strikesBetween(7, 1, 0, 600));
    expect(strikesBetween(7, 0, 0, 600)).toEqual([]);
    expect(strikesBetween(7, 1, 0, 600)).not.toEqual(strikesBetween(8, 1, 0, 600));
  });

  it('grows with the storm and the time, a few a minute in a full storm', () => {
    const full = strikesBetween(3, 1, 0, 3600).length, half = strikesBetween(3, 0.5, 0, 3600).length;
    expect(full / 60).toBeGreaterThan(2);
    expect(full / 60).toBeLessThan(8);
    expect(half).toBeLessThan(full * 0.7);
  });

  it('splits exactly at any moment (a paused or scrubbed clock never doubles or drops a strike)', () => {
    const all = strikesBetween(11, 1, 100, 400);
    for (const tm of [100, 137.25, 250, 399.9]) {
      expect([...strikesBetween(11, 1, 100, tm), ...strikesBetween(11, 1, tm, 400)]).toEqual(all);
    }
  });

  it('puts strikes a few km to tens of km away, some cloud-to-ground', () => {
    const s = strikesBetween(5, 1, 0, 3600);
    expect(s.every((k) => k.distanceM >= 1500 && k.distanceM <= 30000)).toBe(true);
    expect(s.some((k) => k.cloudToGround) && s.some((k) => !k.cloudToGround)).toBe(true);
  });
});

describe('thunderDelayS', () => {
  it('is the distance over the speed of sound', () => {
    expect(thunderDelayS(3430)).toBeCloseTo(10, 12);
  });
});
