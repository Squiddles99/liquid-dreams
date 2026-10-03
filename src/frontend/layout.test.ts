// src/frontend/layout.test.ts
import { describe, expect, it } from 'vitest';
import { DESIGN_H, DESIGN_W, insideSafe, layoutFor } from './ui/layout';

describe('the canvas scaler (spec §5.1; Review Focus 1: window shapes)', () => {
  it('is the design itself at 1920×1080, with the PC safe area 58 × 32', () => {
    const l = layoutFor(1920, 1080, 0.03);
    expect(l).toMatchObject({ scale: 1, designW: DESIGN_W, designH: DESIGN_H });
    expect(l.safeX).toBeCloseTo(57.6, 6);
    expect(l.safeY).toBeCloseTo(32.4, 6);
  });
  it('scales by height on a wider window, the extra width becoming margin the layout anchors past', () => {
    const l = layoutFor(2560, 1080, 0.03);
    expect(l.scale).toBe(1);
    expect(l.designW).toBe(2560);
    expect(l.designH).toBe(1080);
    expect(l.safeX).toBeCloseTo(76.8, 6);
  });
  it('fits the whole design on a narrow 4:3 window (the plan\'s ruling), taller instead of cropped', () => {
    const l = layoutFor(1024, 768, 0.03);
    expect(l.scale).toBeCloseTo(1024 / 1920, 9);
    expect(l.designW).toBeCloseTo(1920, 6);
    expect(l.designH).toBeCloseTo(768 / (1024 / 1920), 6);
  });
  it('keeps 1280×720 and 1280×800 at the design width', () => {
    expect(layoutFor(1280, 720, 0.05).designW).toBeCloseTo(1920, 6);
    expect(layoutFor(1280, 800, 0.05).designH).toBeCloseTo(1200, 6);
  });
  it('says whether a box is inside the safe area', () => {
    const l = layoutFor(1920, 1080, 0.05);
    expect(insideSafe({ x: 96, y: 54, w: 100, h: 100 }, l)).toBe(true);
    expect(insideSafe({ x: 90, y: 54, w: 100, h: 100 }, l)).toBe(false);
    expect(insideSafe({ x: 1700, y: 900, w: 124, h: 126 }, l)).toBe(true);
    expect(insideSafe({ x: 1700, y: 900, w: 125, h: 126 }, l)).toBe(false);
  });
});
