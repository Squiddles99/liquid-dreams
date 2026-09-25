import { describe, expect, it } from 'vitest';
import { DEFAULT_ATMOSPHERE } from './atmosphereParams';
import { skyViewAnglesToUv, skyViewUvToAngles, transmittanceRMuToUv, transmittanceUvToRMu } from './lutMapping';

const radii = { groundRadiusKm: DEFAULT_ATMOSPHERE.groundRadiusKm, topRadiusKm: DEFAULT_ATMOSPHERE.topRadiusKm };

describe('transmittance LUT mapping', () => {
  it('round-trips (r, mu) above the horizon', () => {
    for (const r of [6360.01, 6365, 6400, 6459]) {
      const horizonMu = -Math.sqrt(Math.max(0, 1 - (radii.groundRadiusKm / r) ** 2));
      for (let i = 1; i < 20; i++) {
        const mu = horizonMu + ((1 - horizonMu) * i) / 20;
        const { u, v } = transmittanceRMuToUv(r, mu, radii);
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(1 + 1e-9);
        const back = transmittanceUvToRMu(u, v, radii);
        expect(back.r).toBeCloseTo(r, 3);
        expect(back.mu).toBeCloseTo(mu, 3);
      }
    }
  });
  it('u = 0 looks straight up; v = 0 is the ground', () => {
    expect(transmittanceUvToRMu(0, 0.5, radii).mu).toBeCloseTo(1, 6);
    expect(transmittanceUvToRMu(0.5, 0, radii).r).toBeCloseTo(radii.groundRadiusKm, 6);
  });
});

describe('sky-view LUT mapping', () => {
  it('round-trips angles', () => {
    for (const el of [-1.2, -0.3, -0.01, 0, 0.01, 0.4, 1.5]) {
      for (const az of [0, 1, 3, 6]) {
        const { u, v } = skyViewAnglesToUv(el, az);
        const back = skyViewUvToAngles(u, v);
        expect(back.elevation).toBeCloseTo(el, 6);
        expect(back.azimuth).toBeCloseTo(az, 6);
      }
    }
  });
  it('puts the horizon at v = 0.5 and gives it extra resolution', () => {
    expect(skyViewAnglesToUv(0, 0).v).toBe(0.5);
    expect(skyViewAnglesToUv((1 * Math.PI) / 180, 0).v - 0.5).toBeGreaterThan(0.05);
  });
  it('wraps azimuth', () => {
    expect(skyViewAnglesToUv(0.2, -0.5).u).toBeCloseTo(1 - 0.5 / (2 * Math.PI), 6);
  });
});
