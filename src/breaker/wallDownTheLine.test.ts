import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS, ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, ONSET_UNTIL_OFFSET, UNTIL_NEVER, onsetGain, onsetUntil } from './breaking';
import { type Station, traceStations } from './crestTrace';
import { REFRACT_FLOOR_M, computeOnsetRecord, computeReefField, sampleField } from './reefField';
import { type WaveContext, breakOptions, sumWaves, toActiveWave } from './setWaveModel';
import { STOOD_PHASE, WALL_LEAD_S, wallWeight } from './wombSection';

/**
 * The wall down the line (plan 2026-10-06-wave-root-cause; Andrew, 2026-10-06: "the breaking part of the wave bowling into
 * almost a right-angle, instead of seeing the extended wall of the yet to break wave, to plan how I ride the wave"). The
 * reef record carries how long until each point breaks (breaking.onsetUntil), and the drawn section, the stations and the
 * sheet's front all stand up on it over the last WALL_LEAD_S, not on the breaking ratio, which on the Womb's deep basin only
 * rises in the last 10 m before a point breaks.
 */

/** The peel stretch test's synthetic shelf: the swell runs +x at C m/s; every level breaks along x = line(z) + 15·ln(q/0.3). */
const NX = 140, NZ = 60, C = 8;
function shelf(line: (z: number) => number) {
  const n = NX * NZ, grid = { x0: 0, z0: 0, cellM: 1, nx: NX, nz: NZ };
  const tau = new Float32Array(n), amp = new Float32Array(n), hmin = new Float32Array(n), hminBreak = new Float32Array(n);
  const k = new Float32Array(n), dirX = new Float32Array(n), dirZ = new Float32Array(n), fixed = new Uint8Array(n);
  const psiHere = new Float32Array(n * ONSET_LEVELS).fill(0.05);
  const omega = (2 * Math.PI) / 14;
  for (let row = 0; row < NZ; row++) for (let col = 0; col < NX; col++) {
    const i = row * NX + col;
    tau[i] = col / C; amp[i] = 1; hmin[i] = 6; k[i] = omega / C; dirX[i] = 1; dirZ[i] = 0;
    hminBreak[i] = 1 / (0.3 * Math.exp((col - line(row)) / 15));
  }
  const order = Uint32Array.from(Array.from({ length: n }, (_, i) => i).sort((a, b) => tau[a] - tau[b] || a - b));
  // The stretch (and the wall) alone: the curl at no top speed leaves these monotone shelves as they were (one-curl).
  const rec = computeOnsetRecord({ grid, tau, amp, hmin, hminBreak, k, dirX, dirZ, fixed, order, omega, psiHere, curlMaxMs: Infinity, peel: 1 });
  const at = (col: number, row: number, j: number): number => rec[(row * NX + col) * ONSET_RECORD_LENGTH + j];
  return { rec, at };
}

describe('the time until onset in the reef record (breaking.onsetUntil)', () => {
  it('falls along the ray at its speed to 0 at the breaking line, and is 0 beyond it', () => {
    const { at } = shelf(() => 60);
    const lvl = 3, breakCol = 60 + 15 * Math.log(ONSET_LEVEL_Q[lvl] / 0.3);
    for (const col of [10, 20, 30, 40]) {
      const until = at(col, 30, ONSET_UNTIL_OFFSET + lvl);
      expect(until, `col ${col}`).toBeCloseTo((breakCol - col) / C, 0);
    }
    expect(at(Math.ceil(breakCol) + 3, 30, ONSET_UNTIL_OFFSET + lvl)).toBe(0);
    expect(at(130, 30, ONSET_UNTIL_OFFSET + lvl)).toBe(0);
    // Column to column it falls by one cell's travel time, never rising.
    for (let col = 5; col < breakCol - 2; col++) {
      const d = at(col, 30, ONSET_UNTIL_OFFSET + lvl) - at(col + 1, 30, ONSET_UNTIL_OFFSET + lvl);
      expect(d, `col ${col}`).toBeGreaterThan(0);
      expect(d, `col ${col}`).toBeLessThan(2 / C);
    }
  });

  it('is UNTIL_NEVER where the ray leaves the grid unbroken, and onsetUntil reads Infinity there', () => {
    // The line so far east that the lower levels never break on the grid.
    const { rec, at } = shelf(() => 200);
    expect(at(10, 30, ONSET_UNTIL_OFFSET)).toBe(UNTIL_NEVER);
    const sample = rec.subarray((30 * NX + 10) * ONSET_RECORD_LENGTH, (30 * NX + 11) * ONSET_RECORD_LENGTH);
    // A wave that breaks at level 0 (the tallest): 1 / (h·gain) = q_0.
    const h = 1 / (ONSET_LEVEL_Q[0] * onsetGain(DEFAULT_BREAK_PARAMS));
    expect(onsetUntil(sample, 0, h, DEFAULT_BREAK_PARAMS)).toBe(Infinity);
  });

  it('onsetUntil reads a wave between two levels between their times, and 0 once broken', () => {
    const { rec } = shelf(() => 60);
    const sample = (col: number): Float32Array => rec.subarray((30 * NX + col) * ONSET_RECORD_LENGTH, (30 * NX + col + 1) * ONSET_RECORD_LENGTH);
    const hOf = (q: number): number => 1 / (q * onsetGain(DEFAULT_BREAK_PARAMS));
    const q3 = ONSET_LEVEL_Q[3], q4 = ONSET_LEVEL_Q[4], qMid = Math.sqrt(q3 * q4);
    const u3 = onsetUntil(sample(10), 0, hOf(q3), DEFAULT_BREAK_PARAMS), u4 = onsetUntil(sample(10), 0, hOf(q4), DEFAULT_BREAK_PARAMS), um = onsetUntil(sample(10), 0, hOf(qMid), DEFAULT_BREAK_PARAMS);
    expect(u3).toBeLessThan(u4);
    expect(um).toBeGreaterThan(u3);
    expect(um).toBeLessThan(u4);
    expect(onsetUntil(sample(120), 0, hOf(q3), DEFAULT_BREAK_PARAMS)).toBe(0);
  });
});

describe('wallWeight', () => {
  it('is 0 WALL_LEAD_S or more away and where the section never breaks, 1 at the break, and stands up ever faster', () => {
    expect(wallWeight(Infinity)).toBe(0);
    expect(wallWeight(null)).toBe(0);
    expect(wallWeight(WALL_LEAD_S)).toBe(0);
    expect(wallWeight(2 * WALL_LEAD_S)).toBe(0);
    expect(wallWeight(0)).toBe(1);
    expect(wallWeight(1)).toBeGreaterThan(0.6);
    expect(wallWeight(1)).toBeLessThan(0.8);
    let prev = wallWeight(0), prevStep = Infinity;
    for (let u = 0.5; u <= WALL_LEAD_S; u += 0.5) {
      const w = wallWeight(u), step = prev - w;
      expect(w).toBeLessThan(prev);
      expect(step).toBeLessThanOrEqual(prevStep + 1e-12);
      prev = w; prevStep = step;
    }
  });
});

describe('the wall down the line on the Womb (6 ft set, mid tide)', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = 6;
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const big = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const waves = [toActiveWave(big)];
  const P = DEFAULT_BREAK_PARAMS, o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const };
  /** The traced line at t, as stations in arc order, with the sheet 6 m in front of each station's crest. */
  const lineAt = (t: number): (Station & { ahead6: number })[] => {
    const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: 0, spacingM: 1 }).filter((e): e is Station => !e.gap);
    return st.map((s) => {
      const ax = s.x + s.nx * 6, az = s.z + s.nz * 6;
      return Object.assign(s, { ahead6: sumWaves(ax, az, t, sampleField(field, ax, az), waves, ctx, o).eta });
    });
  };

  it('stands as a wall for 20 m or more past the curl, then eases to the swell over 30 m or more, with no step along the line', { timeout: 120_000 }, () => {
    for (const dt of [0, 3]) {
      const line = lineAt(big.arrivalS + dt);
      // The curl: the last broken station toward the north (negative arc, down the line).
      const broken = line.filter((s) => s.tb !== null);
      expect(broken.length).toBeGreaterThan(5);
      const curlArc = Math.min(...broken.map((s) => s.arc));
      const beyond = line.filter((s) => s.tb === null && s.arc < curlArc).sort((a, b) => b.arc - a.arc);
      expect(beyond.length, `t + ${dt}: stations down the line`).toBeGreaterThan(40);
      // Phase 0.15 is about a 30° face (the standing key's is 40° at 0.25, the swell's 15° at 0).
      const wall = beyond.filter((s) => s.section.phase >= 0.15);
      expect(curlArc - Math.min(...wall.map((s) => s.arc)), `t + ${dt}: the wall past the curl (m)`).toBeGreaterThan(25);
      const easing = beyond.filter((s) => s.section.phase > 0.02 && s.section.phase < 0.15);
      expect(Math.max(...easing.map((s) => s.arc)) - Math.min(...easing.map((s) => s.arc)), `t + ${dt}: the easing (m)`).toBeGreaterThan(20);
      // Down the line the phase never rises again, and neither it nor the water 6 m in front steps between neighbours.
      for (let i = 1; i < beyond.length; i++) {
        const a = beyond[i - 1], b = beyond[i], ds = Math.max(1e-6, a.arc - b.arc);
        expect(b.section.phase, `t + ${dt}, arc ${b.arc.toFixed(1)}: phase`).toBeLessThanOrEqual(a.section.phase + 1e-3);
        // Under 0.45 m per m of crest: the bowl was 0.7 (2 m over 3 m of crest, where the drawn wall ended); now the
        // steepest grade is where the face's foot crosses the 6 m mark as the front shortens toward the curl (0.38 at 6 ft).
        expect(Math.abs(a.ahead6 - b.ahead6) / ds, `t + ${dt}, arc ${b.arc.toFixed(1)}: the sea 6 m ahead (m per m of crest)`).toBeLessThan(0.45);
      }
      // The whole wall is drawn at STOOD_PHASE at most before it breaks (past the few metres the stations' numbers are
      // smoothed over with their broken neighbours': crestTrace.SECTION_SMOOTHING_M).
      for (const s of beyond) if (curlArc - s.arc > 10) expect(s.section.phase, `arc ${s.arc.toFixed(1)}`).toBeLessThanOrEqual(STOOD_PHASE * 1.1);
    }
  });
});
