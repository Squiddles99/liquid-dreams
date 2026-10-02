import { describe, expect, it } from 'vitest';
import {
  KELP_CELL_M, KELP_FADE_M, KELP_GRID_N, type KelpState, kelpCanopyHeight, kelpCellOfSlot, kelpInWindow, kelpSlot, kelpSteadyLean,
  kelpStep, kelpWindowFade, kelpWindowMin, KELP_HEIGHT_M, KELP_NOISE_SIZE, kelpNoiseData,
} from './kelp';

const DT = 0.05; // the foam's 20 Hz tick
const rest: KelpState = { lx: 0, lz: 0, vx: 0, vz: 0 };

describe('the kelp\'s steady lean (spec §4.2)', () => {
  it('a quarter of flat or less at 1 m/s, over 0.9 at 3 m/s, never above 1, toward the flow', () => {
    expect(Math.hypot(...kelpSteadyLean(1, 0))).toBeLessThanOrEqual(0.25);
    expect(Math.hypot(...kelpSteadyLean(0, -3))).toBeGreaterThan(0.9);
    expect(Math.hypot(...kelpSteadyLean(40, 30))).toBeLessThanOrEqual(1);
    const [lx, lz] = kelpSteadyLean(-1.2, 1.6);
    expect(lx).toBeLessThan(0);
    expect(lz).toBeGreaterThan(0);
    expect(lx / lz).toBeCloseTo(-1.2 / 1.6, 6);
    expect(kelpSteadyLean(0, 0)).toEqual([0, 0]);
  });
});

describe('the kelp\'s spring', () => {
  const response = (u: number, seconds: number): number[] => {
    let s = rest;
    const out: number[] = [];
    for (let i = 0; i < seconds / DT; i++) { s = kelpStep(s, u, 0, DT); out.push(s.lx); }
    return out;
  };
  it('lags the flow, overshoots once by 15–25%, and settles within 2% by 6 s', () => {
    const target = kelpSteadyLean(1.6, 0)[0];
    const r = response(1.6, 10);
    expect(r[Math.round(0.2 / DT) - 1]).toBeLessThan(0.5 * target); // lag
    const peak = Math.max(...r);
    expect(peak / target - 1).toBeGreaterThanOrEqual(0.15);
    expect(peak / target - 1).toBeLessThanOrEqual(0.25);
    expect(Math.abs(r[Math.round(6 / DT) - 1] / target - 1)).toBeLessThan(0.02);
  });
  it('stays finite and within flat at extreme speeds and steps', () => {
    for (const dt of [DT, 0.2, 0.5]) {
      let s = rest;
      for (let i = 0; i < 200; i++) {
        s = kelpStep(s, 40 * Math.sin(i), -25, dt);
        expect(Number.isFinite(s.lx + s.lz + s.vx + s.vz)).toBe(true);
        expect(Math.hypot(s.lx, s.lz)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
  it('the canopy lies lower as it leans', () => {
    expect(kelpCanopyHeight(0)).toBeCloseTo(KELP_HEIGHT_M, 9);
    expect(kelpCanopyHeight(1)).toBeCloseTo(KELP_HEIGHT_M * 0.2, 9);
  });
});

describe('the lean grid around the camera (spec §4.3)', () => {
  it('is centred on the camera, anchored to world cells', () => {
    const [mx, mz] = kelpWindowMin(10.7, -3.2);
    expect(mx).toBe(Math.floor(10.7 / KELP_CELL_M) - KELP_GRID_N / 2);
    expect(mz).toBe(Math.floor(-3.2 / KELP_CELL_M) - KELP_GRID_N / 2);
  });
  it('a world cell keeps its slot as the window moves; each slot is one cell of the window', () => {
    const a = kelpWindowMin(0, 0), b = kelpWindowMin(37, -21);
    expect(kelpSlot(5, -9)).toBe(kelpSlot(5, -9));
    for (const slot of [0, 1, 127, 128, 16383, 9000]) {
      const [wx, wz] = kelpCellOfSlot(slot, b[0], b[1]);
      expect(kelpSlot(wx, wz)).toBe(slot);
      expect(kelpInWindow(wx, wz, b[0], b[1])).toBe(true);
    }
    // A cell in both windows is the same slot in both: its state carries over.
    const [wx, wz] = kelpCellOfSlot(4242, a[0], a[1]);
    if (kelpInWindow(wx, wz, b[0], b[1])) expect(kelpCellOfSlot(kelpSlot(wx, wz), b[0], b[1])).toEqual([wx, wz]);
  });
  it('a teleport makes every cell new (Review Focus 1)', () => {
    const a = kelpWindowMin(0, 0), b = kelpWindowMin(5000, -3000);
    for (const slot of [0, 77, 8191, 16383]) {
      const [wx, wz] = kelpCellOfSlot(slot, b[0], b[1]);
      expect(kelpInWindow(wx, wz, a[0], a[1])).toBe(false);
    }
  });
  it('the motion fades over the last 8 m and is zero outside', () => {
    const [mx, mz] = kelpWindowMin(0, 0);
    expect(kelpWindowFade(0, 0, mx, mz)).toBe(1);
    expect(kelpWindowFade(mx * KELP_CELL_M + KELP_FADE_M / 2, 0, mx, mz)).toBeCloseTo(0.5, 1);
    expect(kelpWindowFade(mx * KELP_CELL_M - 3, 0, mx, mz)).toBe(0);
  });
});

describe('the canopy\'s noise texture (final review I3: baked once, not computed per pixel)', () => {
  const N = KELP_NOISE_SIZE;
  const tex = kelpNoiseData();
  const at = (c: number, x: number, y: number): number => tex[4 * (((y + N) % N) * N + ((x + N) % N)) + c];
  it('four independent channels, spread around 0.5 within [0, 1]', () => {
    for (let c = 0; c < 4; c++) {
      let sum = 0, lo = 1, hi = 0;
      for (let i = 0; i < N * N; i++) { const v = tex[4 * i + c]; sum += v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      expect(sum / (N * N)).toBeGreaterThan(0.4);
      expect(sum / (N * N)).toBeLessThan(0.6);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(hi - lo).toBeGreaterThan(0.7);
    }
    expect(at(0, 10, 10)).not.toBeCloseTo(at(1, 10, 10), 3);
  });
  it('tiles seamlessly and is smooth (no step between neighbouring texels, across the wrap too)', () => {
    let worst = 0;
    for (let c = 0; c < 4; c++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      worst = Math.max(worst, Math.abs(at(c, x + 1, y) - at(c, x, y)), Math.abs(at(c, x, y + 1) - at(c, x, y)));
    }
    expect(worst).toBeLessThan(0.25);
  });
});
