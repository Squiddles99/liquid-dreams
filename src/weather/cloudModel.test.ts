import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, cloudDensity, coverageDensity, heightProfile, lowLayer, shellInterval } from './cloudModel';
import { WEATHER_PRESETS } from './weather';

describe('lowLayer', () => {
  it('sits on the weather base and grows taller with convection', () => {
    const flat = lowLayer({ ...WEATHER_PRESETS.overcast, convection: 0 });
    const cu = lowLayer({ ...WEATHER_PRESETS.overcast, convection: 0.4 });
    const cb = lowLayer({ ...WEATHER_PRESETS.overcast, convection: 1 });
    expect(flat.baseM).toBe(WEATHER_PRESETS.overcast.lowBaseM);
    expect(flat.topM - flat.baseM).toBeCloseTo(400, 0);
    expect(cu.topM - cu.baseM).toBeCloseTo(1500, 0);
    expect(cb.topM - cb.baseM).toBeCloseTo(9000, 0);
    for (let c = 0; c < 1; c += 0.05) {
      const a = lowLayer({ ...WEATHER_PRESETS.overcast, convection: c });
      const b = lowLayer({ ...WEATHER_PRESETS.overcast, convection: c + 0.05 });
      expect(b.topM).toBeGreaterThan(a.topM);
    }
  });
});

describe('heightProfile', () => {
  it('is zero outside the layer and peaks inside it', () => {
    for (const conv of [0, 0.4, 0.7, 1]) {
      expect(heightProfile(-0.01, conv)).toBe(0);
      expect(heightProfile(1.01, conv)).toBe(0);
      expect(heightProfile(0, conv)).toBe(0);
      const peak = Math.max(...Array.from({ length: 101 }, (_, i) => heightProfile(i / 100, conv)));
      expect(peak).toBeGreaterThan(0.9);
      expect(peak).toBeLessThanOrEqual(1);
    }
  });

  it('gives cumulus a sharp base (dense just above it) and a tapering top; stratocumulus a flat slab', () => {
    expect(heightProfile(0.1, 0.5)).toBeGreaterThan(0.95);
    expect(heightProfile(0.85, 0.5)).toBeLessThan(0.2);
    expect(heightProfile(0.5, 0)).toBeGreaterThan(0.95);
  });

  it('spreads a cumulonimbus out again near its top (the anvil)', () => {
    expect(heightProfile(0.85, 1)).toBeGreaterThan(heightProfile(0.85, 0.7) + 0.3);
  });
});

describe('coverageDensity', () => {
  it('is empty at cover 0, full at cover 1, and grows with cover', () => {
    for (const n of [0, 0.3, 0.7, 1]) {
      expect(coverageDensity(n, 0)).toBe(0);
      expect(coverageDensity(n, 1)).toBe(1);
      let prev = -1;
      for (let c = 0; c <= 1.0001; c += 0.1) {
        const v = coverageDensity(n, c);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('cloudDensity', () => {
  it('is zero without cover or outside the profile, and eroded by the detail noise', () => {
    expect(cloudDensity(1, 0.9, 0.9, 0, 0)).toBe(0);
    expect(cloudDensity(0, 0.9, 0.9, 0, 0.8)).toBe(0);
    const whole = cloudDensity(1, 0.9, 0.8, 0, 0.8);
    expect(whole).toBeGreaterThan(0);
    expect(cloudDensity(1, 0.9, 0.8, 1, 0.8)).toBeLessThan(whole);
    expect(cloudDensity(1, 0.9, 0.9, 0, 0.8)).toBeGreaterThan(cloudDensity(1, 0.9, 0.7, 0, 0.8));
  });

  it('stays inside [0, 1]', () => {
    for (const p of [0, 0.5, 1]) for (const n of [0, 0.5, 1]) for (const s of [0, 0.5, 1]) for (const d of [0, 1]) for (const c of [0, 0.5, 1]) {
      const v = cloudDensity(p, n, s, d, c);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('shellInterval', () => {
  it('straight up crosses the layer from its base to its top', () => {
    const r = shellInterval(2, 1, 1000, 2500, EARTH_RADIUS_M)!;
    expect(r[0]).toBeCloseTo(998, 3);
    expect(r[1]).toBeCloseTo(2498, 3);
  });

  it('meets a 1 km base about 113 km out at the horizon (the earth curving away)', () => {
    const r = shellInterval(0, 0, 1000, 2000, EARTH_RADIUS_M)!;
    const expected = Math.sqrt(2 * EARTH_RADIUS_M * 1000 + 1000 * 1000);
    expect(Math.abs(r[0] - expected) / expected).toBeLessThan(0.01);
    expect(r[1]).toBeGreaterThan(r[0]);
  });

  it('never reaches the cloud through the ground', () => {
    expect(shellInterval(2, -0.2, 1000, 2000, EARTH_RADIUS_M)).toBeNull();
  });
});
