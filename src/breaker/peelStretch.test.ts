import { describe, expect, it } from 'vitest';
import { ONSET_DELAY_OFFSET, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH } from './breaking';
import { PEEL_MAX_HOLD_S, computeOnsetRecord, peelLines } from './reefField';

/**
 * A synthetic reef: the swell runs +x at C m/s over a 1 m grid; amp/hminBreak rises shoreward as
 * 0.3·exp((x − line(z))/15), so every level breaks along a line x = line(z) + 15·ln(q/0.3): the shelf's breaking line.
 */
const NX = 140, NZ = 220, C = 8;
function shelf(line: (z: number) => number, peel: number, gain = 0.3, rayDeg = 0) {
  const n = NX * NZ, grid = { x0: 0, z0: 0, cellM: 1, nx: NX, nz: NZ };
  const tau = new Float32Array(n), amp = new Float32Array(n), hmin = new Float32Array(n), hminBreak = new Float32Array(n);
  const k = new Float32Array(n), dirX = new Float32Array(n), dirZ = new Float32Array(n), fixed = new Uint8Array(n);
  const psiHere = new Float32Array(n * ONSET_LEVELS).fill(0.05);
  const omega = (2 * Math.PI) / 14, ca = Math.cos((rayDeg * Math.PI) / 180), sa = Math.sin((rayDeg * Math.PI) / 180);
  for (let row = 0; row < NZ; row++) for (let col = 0; col < NX; col++) {
    const i = row * NX + col;
    tau[i] = (col * ca + row * sa) / C; amp[i] = 1; hmin[i] = 6; k[i] = omega / C; dirX[i] = ca; dirZ[i] = sa;
    hminBreak[i] = 1 / (gain * Math.exp((col - line(row)) / 15));
  }
  const order = Uint32Array.from(Array.from({ length: n }, (_, i) => i).sort((a, b) => tau[a] - tau[b] || a - b));
  const rec = computeOnsetRecord({ grid, tau, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, peel });
  const at = (col: number, row: number, j: number): number => rec[(row * NX + col) * ONSET_RECORD_LENGTH + j];
  // Level k's onset time on the ray at `row`, read where the section has long broken (col), and its delay there.
  const onsetT = (row: number, lvl: number, col = 130): number => (col * ca + row * sa) / C - at(col, row, 1 + 2 * lvl);
  const delay = (row: number, lvl: number, col = 130): number => at(col, row, ONSET_DELAY_OFFSET + lvl);
  return { rec, at, onsetT, delay };
}
// Level 3 (q ≈ 0.075) breaks 21 m seaward of line(z): every shelf below keeps its breaking line inside the grid (x 6–65),
// off the boundary nodes that break at themselves.
const LVL = 3;

describe('the peel stretch in the onset record (spec 2026-10-04 §1)', () => {
  it('the record has a delay block per level after the ψ₀ block', () => {
    expect(ONSET_RECORD_LENGTH).toBe(1 + 4 * ONSET_LEVELS);
    expect(ONSET_DELAY_OFFSET).toBe(1 + 3 * ONSET_LEVELS);
  });

  it('peel 1 is today: no delay anywhere, every time since onset ≥ 0', () => {
    const { rec } = shelf((z) => 30 + 0.25 * z, 1);
    let delayed = 0, negative = 0;
    for (let i = 0; i < NX * NZ; i++) for (let lvl = 0; lvl < ONSET_LEVELS; lvl++) {
      if (rec[i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET + lvl] !== 0) delayed++;
      if (rec[i * ONSET_RECORD_LENGTH + 1 + 2 * lvl] < 0) negative++;
    }
    expect({ delayed, negative }).toEqual({ delayed: 0, negative: 0 });
  });

  it('an oblique shelf peels 1/peel as fast along the line', () => {
    const line = (z: number): number => 30 + 0.25 * z;
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    const rate = (s: typeof phys): number => (s.onsetT(160, LVL) - s.onsetT(60, LVL)) / 100;
    expect(rate(slow) / rate(phys)).toBeGreaterThan(1.7 * 0.9);
    expect(rate(slow) / rate(phys)).toBeLessThan(1.7 * 1.1);
  });

  it('the rays at an angle to the grid (as on the real reef): still 1/peel as fast, the delay not watered down by unbroken neighbours', () => {
    const line = (z: number): number => 30 + 0.25 * z;
    // A gentle dial so the delays stay under PEEL_MAX_HOLD_S on this long line (~14 s).
    const phys = shelf(line, 1, 0.3, 20), slow = shelf(line, 1.3, 0.3, 20);
    // Along a breaking line read at col 130: onset time differences between two rays' crossings.
    const rate = (s: typeof phys): number => (s.onsetT(160, LVL) - s.onsetT(60, LVL)) / 100;
    expect(rate(slow) / rate(phys)).toBeGreaterThan(1.3 * 0.95);
    expect(rate(slow) / rate(phys)).toBeLessThan(1.3 * 1.05);
  });

  it("a section starting on its own keeps its first break; the delay is constant along a ray past onset", () => {
    // A V: the shelf comes closest at z = 110, so the peak breaks first and peels both ways.
    const line = (z: number): number => 40 + 0.25 * Math.abs(z - 110);
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    expect(slow.onsetT(110, LVL)).toBeCloseTo(phys.onsetT(110, LVL), 1);
    expect(slow.delay(110, LVL)).toBeLessThan(0.05);
    expect(slow.delay(40, LVL, 125)).toBeCloseTo(slow.delay(40, LVL, 135), 4);
    expect(slow.delay(40, LVL)).toBeGreaterThan(0.5);
  });

  it('a reef bump that breaks a moment early inside the line is stretched with it, not left to break seconds ahead', () => {
    // The oblique line with a 0.4 s early bump at z = 120.
    const line = (z: number): number => 30 + 0.25 * z - 3.2 * Math.exp(-(((z - 120) / 4) ** 2));
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    const gap = (s: typeof phys): number => s.onsetT(126, LVL) - s.onsetT(120, LVL);
    // The bump's lead over its neighbour stretches by the dial, as everything else along the line does.
    expect(gap(slow)).toBeCloseTo(1.7 * gap(phys), 1);
    expect(slow.delay(120, LVL)).toBeGreaterThan(1);
  });

  it('where two sections meet, the delay stays bounded by (peel − 1) × the time since the nearer start', () => {
    // An inverted V: both ends break first and peel toward z = 110.
    const line = (z: number): number => 55 - 0.25 * Math.abs(z - 110);
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    const nearerStart = Math.min(phys.onsetT(2, LVL), phys.onsetT(NZ - 3, LVL));
    expect(slow.delay(110, LVL)).toBeLessThanOrEqual(0.7 * (phys.onsetT(110, LVL) - nearerStart) + 0.05);
  });

  it(`a held section's turn comes at most ${PEEL_MAX_HOLD_S} s after the reef broke it (never an unbroken wall into the shallows)`, () => {
    // A long, fast line at peel 3: the delay would grow to (3 − 1) × ~13 s without the cap.
    const slow = shelf((z) => 30 + 0.13 * z, 3);
    let most = 0;
    for (let row = 0; row < NZ; row++) most = Math.max(most, slow.delay(row, LVL));
    expect(most).toBeLessThanOrEqual(PEEL_MAX_HOLD_S + 1e-6);
    expect(most).toBeGreaterThan(PEEL_MAX_HOLD_S - 0.1);
  });

  it('a swell too small to break: no delay, all finite', () => {
    const { rec } = shelf((z) => 30 + 0.25 * z, 1.7, 1e-6);
    expect(rec.every(Number.isFinite)).toBe(true);
    let delayed = 0;
    for (let i = 0; i < NX * NZ; i++) if (rec[i * ONSET_RECORD_LENGTH + ONSET_DELAY_OFFSET + LVL] !== 0) delayed++;
    expect(delayed).toBe(0);
  });
});

describe('the breaking sections (peelLines)', () => {
  it('a young section merges into the section the joining node belongs to, not the earliest one (final review)', () => {
    // On a 10 × 10 grid at one level: A (2, 2) breaks at 0, C (8, 8) at 5, a bump B (2, 8) at 9.5, and X (5, 5), next to
    // all three, at 10. X belongs with C (its nearest start still apart); B, 0.5 s ahead of X, is stretched with C.
    const nx = 10, nz = 10, onsetT = new Float32Array(nx * nz * ONSET_LEVELS).fill(Number.NaN);
    const put = (col: number, row: number, T: number): void => { onsetT[(row * nx + col) * ONSET_LEVELS] = T; };
    put(2, 2, 0); put(8, 8, 5); put(8, 2, 9.5); put(5, 5, 10);
    const start = peelLines(onsetT, nx, nz), at = (col: number, row: number): number => start[(row * nx + col) * ONSET_LEVELS];
    expect(at(5, 5)).toBe(5);
    expect(at(8, 2)).toBe(5);
    expect(at(2, 2)).toBe(0);
  });
});
