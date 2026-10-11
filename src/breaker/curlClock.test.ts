import { describe, expect, it } from 'vitest';
import { CURL_LINK_CELLS, breakingLines, curlTimes } from './curlClock';

// A 1 × 40 grid, 2 m cells, one line of all 40 nodes, first break at node 10 (one-curl plan Task 2).
const N = 40, CELL = 2, PEAK = 10, T0 = 5;
const oneLine = (): Int32Array => new Int32Array(N).fill(0);
const run = (T: number[], v: number, hold = 6, lineOf = oneLine()): Float32Array => curlTimes(Float32Array.from(T), lineOf, N, 1, CELL, v, hold);
const monotone = (): number[] => Array.from({ length: N }, (_, i) => T0 + 0.2 * Math.abs(i - PEAK));
/** Non-decreasing in distance from the peak on each side. */
const expectOneCurl = (t: Float32Array): void => {
  for (let i = PEAK + 1; i < N; i++) expect(t[i], `node ${i}`).toBeGreaterThanOrEqual(t[i - 1]);
  for (let i = PEAK - 1; i >= 0; i--) expect(t[i], `node ${i}`).toBeGreaterThanOrEqual(t[i + 1]);
};

describe('curlTimes: one curl per breaking line (one-curl spec §3a)', () => {
  it('leaves a monotone line alone at an unbounded speed: T′ = T exactly', () => {
    const T = monotone(), out = run(T, Infinity);
    for (let i = 0; i < N; i++) expect(out[i], `node ${i}`).toBe(Math.fround(T[i]));
  });
  it('a pocket down the line waits for the curl', () => {
    const T = monotone();
    for (const i of [25, 26, 27]) T[i] = T[24] - 1.5;
    for (const v of [Infinity, 20]) {
      const out = run(T, v);
      expectOneCurl(out);
      expect(out[25], `v ${v}`).toBe(out[24]);
    }
  });
  it('the speed floor: a closeout is reached at curlMaxMs from the peak', () => {
    // All at once but the peak a hair first (so it is the first break).
    const T = Array.from({ length: N }, (_, i) => (i === PEAK ? T0 : T0 + 1e-3));
    const out = run(T, 10);
    for (let i = 0; i < N; i++) expect(out[i], `node ${i}`).toBeCloseTo(T0 + (Math.abs(i - PEAK) * CELL) / 10, 4); // float32
  });
  it('the hold is capped: T′ − T ≤ maxHoldS everywhere', () => {
    // Steeper, so the pocket still breaks after the peak (else it would be the first break).
    const T = Array.from({ length: N }, (_, i) => T0 + 0.8 * Math.abs(i - PEAK));
    for (const i of [25, 26, 27]) T[i] = T[24] - 10;
    const out = run(T, 20, 6);
    for (let i = 0; i < N; i++) expect(out[i] - T[i], `node ${i}`).toBeLessThanOrEqual(6 + 1e-5);
    expect(out[25] - T[25]).toBeCloseTo(6, 5);
  });
  it('the first break keeps T₀, and a node off the line stays NaN', () => {
    const T = monotone(), lineOf = oneLine();
    T[3] = Number.NaN; lineOf[3] = -1;
    const out = run(T, 20, 6, lineOf);
    expect(out[PEAK]).toBe(T0);
    expect(out[3]).toBeNaN();
  });
  it('two lines each curl from their own first break', () => {
    const T = monotone(), lineOf = oneLine();
    for (let i = 30; i < N; i++) { lineOf[i] = 1; T[i] = 1 + 0.1 * (N - 1 - i); } // its own first break at node 39
    lineOf[29] = lineOf[28] = -1; T[29] = T[28] = Number.NaN;
    const out = run(T, Infinity, 6, lineOf);
    expect(out[N - 1]).toBeCloseTo(1, 6);
    for (let i = 30; i < N; i++) expect(out[i], `node ${i}`).toBeCloseTo(T[i], 5);
  });
});

describe('curlTimes on a ridden line (womb-realism Task 2b)', () => {
  // A closeout (all at once, the peak a hair first): the ridden line is nodes PEAK..29, measured from the peak.
  const T = Array.from({ length: N }, (_, i) => (i === PEAK ? T0 : T0 + 1e-3));
  const along = Float32Array.from({ length: N }, (_, i) => (i >= PEAK && i < 30 ? (i - PEAK) * CELL : Number.NaN));
  const out = curlTimes(Float32Array.from(T), oneLine(), N, 1, CELL, 4, 6, { along, sweepMs: 40, holdS: 30 });
  it('curlMaxMs binds down the ridden line, its hold under holdS', () => {
    for (let i = PEAK; i < 30; i++) expect(out[i], `node ${i}`).toBeCloseTo(T0 + ((i - PEAK) * CELL) / 4, 4);
    expect(out[29] - T[29]).toBeGreaterThan(6); // past the flat cap: the ridden line's own
  });
  it('the sweep speed off it: up the line from the peak and past its end', () => {
    // (Within CURL_LINK_CELLS of the peak the curl never retreats behind the ridden side's own times: compare the pace.)
    for (let i = 0; i < PEAK; i++) expect(out[i], `node ${i}`).toBeLessThan(T0 + ((PEAK - i) * CELL) / 4);
    for (let i = 30; i < N; i++) expect(out[i], `node ${i}`).toBeCloseTo(Math.min(out[29] + ((i - 29) * CELL) / 40, T[i] + 6), 4);
  });
});

describe("breakingLines: a level's onset nodes linked within CURL_LINK_CELLS", () => {
  it('nodes within reach share a line; a gap wider than the reach splits them', () => {
    const L = CURL_LINK_CELLS, nx = 4 * L, T = new Float32Array(nx).fill(Number.NaN);
    for (const i of [0, 1, 3, 3 + L]) T[i] = 1; // the reach apart: linked
    for (const i of [4 + 2 * L, 5 + 2 * L]) T[i] = 2; // reach + 1 from 3 + L: a line of its own
    const l = breakingLines(T, nx, 1);
    expect(l[0]).toBeGreaterThanOrEqual(0);
    expect(new Set([l[0], l[1], l[3], l[3 + L]]).size).toBe(1);
    expect(l[4 + 2 * L]).toBe(l[5 + 2 * L]);
    expect(l[4 + 2 * L]).not.toBe(l[0]);
    expect(l[2]).toBe(-1);
  });
});
