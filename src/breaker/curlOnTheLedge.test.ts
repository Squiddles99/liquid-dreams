import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS, ONSET_LEVELS } from './breaking';
import { type OnsetDebug, REFRACT_FLOOR_M, computeReefField } from './reefField';
import { reefBeds } from './testField';

/**
 * The curl along the ridden left on Andrew's moment (womb-realism Task 2b, STOP 1c ruling ask 3): 7 ft, 14 s from 270°,
 * tide 0.5. The biggest wave (H 4.49 m) breaks at level 5. Task M1 measured one front, a natural peel of ~17 m/s, and the
 * curl pass holding the first 90 m of the ledge and then releasing at the 40 m/s ceiling (a front at ~39 m/s). With the
 * ceiling at 12 m/s and the hold cap covering the ledge, the front runs 8–14 m/s and never jumps.
 */
const LEVEL = 5;
/** The north ledge from just past the tip (M1's along 4 m) down the line, for 172 m (M1's along 4–176). */
const START = { x: -129, z: -5 }, END = { x: -5, z: -124 };
const STEP_M = 4, ACROSS_M = 40;

/** Per STEP_M of the ledge, the curl time of its first onset node at LEVEL (the earliest T within ±STEP_M/2 along and
 * ACROSS_M across). */
function ledgeCurl(debug: OnsetDebug, grid: { x0: number; z0: number; cellM: number; nx: number; nz: number }): { s: number; t: number; tc: number }[] {
  const len = Math.hypot(END.x - START.x, END.z - START.z), ux = (END.x - START.x) / len, uz = (END.z - START.z) / len;
  const out: { s: number; t: number; tc: number }[] = [];
  for (let s = 0; s <= len; s += STEP_M) {
    let t = Number.POSITIVE_INFINITY, tc = Number.NaN;
    for (let i = 0; i < grid.nx * grid.nz; i++) {
      const ti = debug.onsetT![i * ONSET_LEVELS + LEVEL];
      if (!Number.isFinite(ti) || ti >= t) continue;
      const col = i % grid.nx, row = (i - col) / grid.nx;
      const dx = grid.x0 + col * grid.cellM - START.x, dz = grid.z0 + row * grid.cellM - START.z;
      if (Math.abs(dx * ux + dz * uz - s) > STEP_M / 2 || Math.abs(-dx * uz + dz * ux) > ACROSS_M) continue;
      t = ti; tc = debug.curlT![i * ONSET_LEVELS + LEVEL];
    }
    if (Number.isFinite(tc)) out.push({ s, t, tc });
  }
  return out;
}

describe('the curl on the ridden left (womb-realism Task 2b)', () => {
  it('one front at 8–14 m/s over the first 10 s, never faster than 14 m/s over 20 m', () => {
    const { bed, coast } = reefBeds(2);
    const debug: OnsetDebug = {};
    const field = computeReefField({ bed, coast, periodS: 14, fromDeg: 270, tideM: 0.5, smooth: true, refractFloorM: REFRACT_FLOOR_M, peel: DEFAULT_BREAK_PARAMS.peel, onsetDebug: debug });
    const st = ledgeCurl(debug, field.grid);
    expect(st.length).toBeGreaterThan(30);
    const rows = st.map((p) => `${p.s}:${p.t.toFixed(2)}/${p.tc.toFixed(2)}`).join(' ');
    // One front: the curl time never falls down the line.
    for (let j = 1; j < st.length; j++) expect(st[j].tc, rows).toBeGreaterThanOrEqual(st[j - 1].tc - 0.05);
    // Its speed over the first 10 s (end to end) and over every 20 m.
    const t0 = st[0].tc, inTen = st.filter((p) => p.tc - t0 <= 10), last = inTen[inTen.length - 1];
    const speed = (last.s - st[0].s) / (last.tc - t0);
    expect(speed, rows).toBeGreaterThanOrEqual(8);
    expect(speed, rows).toBeLessThanOrEqual(14);
    for (let j = 0; j < st.length; j++) {
      const k = st.findIndex((p) => p.s >= st[j].s + 20);
      if (k < 0) break;
      const v = (st[k].s - st[j].s) / Math.max(1e-3, st[k].tc - st[j].tc);
      expect(v, `${st[j].s} m: ${rows}`).toBeLessThanOrEqual(14);
    }
  }, 180_000);
});
