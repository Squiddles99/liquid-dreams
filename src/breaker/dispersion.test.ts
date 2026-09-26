import { describe, expect, it } from 'vitest';
import { GRAVITY } from '../ocean/spectrum';
import { MIN_DEPTH_M, groupSpeed, waveNumber } from './dispersion';

const omegaOf = (T: number) => (2 * Math.PI) / T;

describe('linear dispersion', () => {
  it('solves ω² = g k tanh(k h) to machine precision across periods and depths', () => {
    for (const T of [4, 8, 12, 15, 20, 25]) for (const h of [0.05, 0.5, 1.2, 3, 6, 13, 30, 200, 1000]) {
      const w = omegaOf(T), k = waveNumber(w, h);
      expect(Math.abs(GRAVITY * k * Math.tanh(k * h) - w * w) / (w * w)).toBeLessThan(1e-9);
    }
  });
  it('matches textbook wavelengths', () => {
    expect((2 * Math.PI) / waveNumber(omegaOf(10), 10)).toBeCloseTo(92.3, 0);
    expect((2 * Math.PI) / waveNumber(omegaOf(15), 1000)).toBeCloseTo((GRAVITY * 225) / (2 * Math.PI), 0);
  });
  it('tends to sqrt(g h) in very shallow water', () => {
    const w = omegaOf(20), h = 1;
    expect(w / waveNumber(w, h)).toBeCloseTo(Math.sqrt(GRAVITY * h), 1);
  });
  it('group speed is c/2 in deep water and ≈ c in shallow water', () => {
    const w = omegaOf(10);
    const kd = waveNumber(w, 1000);
    expect(groupSpeed(w, kd, 1000) / (w / kd)).toBeCloseTo(0.5, 3);
    const ks = waveNumber(w, 0.5);
    expect(groupSpeed(w, ks, 0.5) / (w / ks)).toBeGreaterThan(0.97);
  });
  it('dry cells stay finite (depth ≤ 0 is clamped)', () => {
    for (const h of [0, -1, -100]) {
      const k = waveNumber(omegaOf(15), h);
      expect(Number.isFinite(k)).toBe(true);
      expect(k).toBeCloseTo(waveNumber(omegaOf(15), MIN_DEPTH_M), 12);
      expect(Number.isFinite(groupSpeed(omegaOf(15), k, h))).toBe(true);
    }
  });
});
