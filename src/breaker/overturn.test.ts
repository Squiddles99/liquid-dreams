import { describe, expect, it } from 'vitest';
import {
  LH82_AREA, LH82_K, PSI_NORMAL, SHEET_POINTS, aspectFit, drainFactor, effectivePsi, lipAreaFit, meadBlackAspect, offshoreSpeed,
  overturnShape, psiState, sheetShape, tiltFitDeg, tubeAreaFit, windAreaFactor, windAspectFactor, windUC,
} from './overturn';

describe('the overturn equations (spec 2026-09-30-barrel-from-maths §3)', () => {
  it('are Pick & Feddersen eqs 3.7–3.10 exactly', () => {
    expect(tubeAreaFit(0.06)).toBeCloseTo(5.319 * 0.06 - 0.043, 12);
    expect(lipAreaFit(0.06)).toBeCloseTo(37.072 * 0.0036 - 0.587 * 0.06 + 0.02, 12);
    expect(aspectFit(0.06)).toBeCloseTo(1.661 * 0.06 + 0.298, 12);
    expect(tiltFitDeg(0.06)).toBeCloseTo(-5746.4 * 0.0036 + 225.2 * 0.06 + 48.4, 12);
    expect(meadBlackAspect(30)).toBeCloseTo(1 / (0.065 * 30 + 0.821), 12);
  });
  it('the Longuet-Higgins outline: half width (3√3/4)W√ξ(1−ξ), full width W at ξ = 1/3, area (2√3/5)WL', () => {
    expect(LH82_K).toBeCloseTo((3 * Math.sqrt(3)) / 4, 12);
    expect(2 * LH82_K * Math.sqrt(1 / 3) * (2 / 3)).toBeCloseTo(1, 9);
    let a = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; a += 2 * LH82_K * Math.sqrt(x) * (1 - x) / n; }
    expect(a).toBeCloseTo(LH82_AREA, 6);
  });
  it('overturnShape: size from the area, shape from the aspect, tilt in radians; the fits clamped to [0.02, 0.1]', () => {
    const H = 7, s = overturnShape(0.06, H, 0);
    expect(s.AO).toBeCloseTo(tubeAreaFit(0.06) * H * H, 9);
    expect(s.AJ).toBeCloseTo(lipAreaFit(0.06) * H * H, 9);
    expect(s.W / s.L).toBeCloseTo(aspectFit(0.06), 9);
    expect(LH82_AREA * s.W * s.L).toBeCloseTo(s.AO, 9);
    expect(s.theta).toBeCloseTo((tiltFitDeg(0.06) * Math.PI) / 180, 9);
    expect(overturnShape(0.001, H, 0).AO).toBeCloseTo(tubeAreaFit(0.02) * H * H, 9);
    expect(overturnShape(0.001, H, 0).presence).toBe(0);
    expect(overturnShape(0.02, H, 0).presence).toBe(1);
    expect(overturnShape(0.4, H, 0).AO).toBeCloseTo(tubeAreaFit(0.1) * H * H, 9);
  });
  it('past 0.1 the tube rounds toward Mead & Black (foil 0 → 1 over 0.1 → 0.15), never less round than the fit', () => {
    const at = (psi: number) => overturnShape(psi, 7, 0);
    expect(at(0.1).foil).toBe(0);
    expect(at(0.15).foil).toBe(1);
    expect(at(0.15).W / at(0.15).L).toBeCloseTo(Math.max(aspectFit(0.1), meadBlackAspect(1 / (0.15 * 0.5 ** 0.25))), 9);
    for (let p = 0.1; p <= 0.3; p += 0.01) expect(at(p).W / at(p).L).toBeGreaterThanOrEqual(aspectFit(0.1) - 1e-12);
  });
  it('wind (Feddersen et al. 2023): onshore halves the area and narrows the tube, offshore grows it to a cap', () => {
    expect(windAreaFactor(0)).toBe(1);
    expect(windAreaFactor(-0.4)).toBeCloseTo(1.2, 12);
    expect(windAreaFactor(-3)).toBeCloseTo(1.2, 12);
    expect(windAreaFactor(0.75)).toBeCloseTo(0.6, 12);
    expect(windAreaFactor(3)).toBeCloseTo(0.6, 12);
    expect(windAspectFactor(-0.5)).toBeCloseTo(1.2, 12);
    expect(windAspectFactor(0.75)).toBeCloseTo(0.62, 12);
    expect(windUC(4, 8)).toBeCloseTo(-0.5, 12); // 4 m/s offshore against an 8 m/s crest
    const on = overturnShape(0.06, 7, 0.75), calm = overturnShape(0.06, 7, 0), off = overturnShape(0.06, 7, -2);
    expect(on.AO).toBeLessThan(calm.AO);
    expect(off.AO).toBeGreaterThan(calm.AO);
    expect(off.AO).toBeCloseTo(1.2 * calm.AO, 9);
  });
  it('stays finite at the extremes (ψ 0, NaN, huge; H 0; wind NaN)', () => {
    for (const psi of [0, 1e-6, 0.2, 5, Number.NaN]) for (const H of [0, 0.3, 9]) for (const uc of [0, Number.NaN, 10]) {
      const s = overturnShape(psi, H, uc);
      for (const v of [s.AO, s.AJ, s.W, s.L, s.theta, s.presence, s.foil]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('the states by ψ', () => {
    expect(psiState(0.005)).toBe('none');
    expect(psiState(0.035)).toBe('oval');
    expect(psiState(0.065)).toBe('cylinder');
    expect(psiState(0.09)).toBe('thrown');
    expect(psiState(0.2)).toBe('slab');
  });
  it('offshore wind is positive, onshore negative, cross-shore about zero', () => {
    // Waves travel toward +x. Wind from +x (east) blows toward −x, into their faces: offshore.
    expect(offshoreSpeed(8, 90, 1, 0)).toBeCloseTo(8, 6);
    expect(offshoreSpeed(8, 270, 1, 0)).toBeCloseTo(-8, 6);
    expect(Math.abs(offshoreSpeed(8, 0, 1, 0))).toBeLessThan(1e-6);
  });
  it('game rules: a lull ×1.1, stacking ×0.8, normal spacing ×1; the dial and nudge multiply', () => {
    expect(drainFactor(Infinity, 15)).toBeCloseTo(1.1, 12);
    expect(drainFactor(0.3 * 15, 15)).toBeCloseTo(0.8, 12);
    expect(Math.abs(drainFactor(15, 15) - 1)).toBeLessThan(0.02);
    expect(effectivePsi(0.06, { drain: 1, draw: 1 }, { psiNudge: 0, randomDial: 0 })).toBe(0.06);
    expect(effectivePsi(0.06, { drain: 1.1, draw: -1 }, { psiNudge: 0.5, randomDial: 0.15 })).toBeCloseTo(0.06 * 1.1 * 0.85 * 1.5, 12);
  });
  it("the sheet's trough drain and surge: the photo-traced values at the state points, eased between, held past the ends", () => {
    for (const [psi, td, ps] of SHEET_POINTS) { expect(sheetShape(psi).troughDrain).toBe(td); expect(sheetShape(psi).pileSurge).toBe(ps); }
    expect(sheetShape(0).troughDrain).toBe(SHEET_POINTS[0][1]);
    expect(sheetShape(1).pileSurge).toBe(SHEET_POINTS[2][2]);
    expect(sheetShape(PSI_NORMAL).troughDrain).toBe(SHEET_POINTS[1][1]);
    let prev = sheetShape(0.03).troughDrain;
    for (let p = 0.031; p <= 0.1; p += 0.001) { const v = sheetShape(p).troughDrain; expect(Math.abs(v - prev)).toBeLessThan(0.03); prev = v; }
  });
});
