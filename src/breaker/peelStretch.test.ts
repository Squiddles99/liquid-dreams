import { describe, expect, it } from 'vitest';
import { ONSET_DELAY_OFFSET, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH } from './breaking';
import { PEEL_MAX_HOLD_S, computeOnsetRecord } from './reefField';

/**
 * A synthetic reef: the swell runs +x at C m/s over a 1 m grid; amp/hminBreak rises shoreward as
 * 0.3·exp((x − line(z))/15), so every level breaks along a line x = line(z) + 15·ln(q/0.3): the shelf's breaking line.
 */
const NX = 140, NZ = 220, C = 8;
function shelf(line: (z: number) => number, peel: number, gain = 0.3) {
  const n = NX * NZ, grid = { x0: 0, z0: 0, cellM: 1, nx: NX, nz: NZ };
  const tau = new Float32Array(n), amp = new Float32Array(n), hmin = new Float32Array(n), hminBreak = new Float32Array(n);
  const k = new Float32Array(n), dirX = new Float32Array(n), dirZ = new Float32Array(n), fixed = new Uint8Array(n);
  const psiHere = new Float32Array(n * ONSET_LEVELS).fill(0.05);
  const omega = (2 * Math.PI) / 14;
  for (let row = 0; row < NZ; row++) for (let col = 0; col < NX; col++) {
    const i = row * NX + col;
    tau[i] = col / C; amp[i] = 1; hmin[i] = 6; k[i] = omega / C; dirX[i] = 1; dirZ[i] = 0;
    hminBreak[i] = 1 / (gain * Math.exp((col - line(row)) / 15));
  }
  const order = Uint32Array.from(Array.from({ length: n }, (_, i) => i).sort((a, b) => tau[a] - tau[b] || a - b));
  const rec = computeOnsetRecord({ grid, tau, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, peel });
  const at = (col: number, row: number, j: number): number => rec[(row * NX + col) * ONSET_RECORD_LENGTH + j];
  // Level k's onset time on the ray at `row`, read where the section has long broken (col), and its delay there.
  const onsetT = (row: number, lvl: number, col = 130): number => col / C - at(col, row, 1 + 2 * lvl);
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

  it("a section starting on its own keeps its first break; the delay is constant along a ray past onset", () => {
    // A V: the shelf comes closest at z = 110, so the peak breaks first and peels both ways.
    const line = (z: number): number => 40 + 0.25 * Math.abs(z - 110);
    const phys = shelf(line, 1), slow = shelf(line, 1.7);
    expect(slow.onsetT(110, LVL)).toBeCloseTo(phys.onsetT(110, LVL), 1);
    expect(slow.delay(110, LVL)).toBeLessThan(0.05);
    expect(slow.delay(40, LVL, 125)).toBeCloseTo(slow.delay(40, LVL, 135), 4);
    expect(slow.delay(40, LVL)).toBeGreaterThan(0.5);
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
