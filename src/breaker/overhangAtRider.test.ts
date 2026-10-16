import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { minRibbonHeight, traceLines } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';
import { reefBeds } from './testField';
import { offshoreSpeed } from './overturn';
import * as WS from './wombSection';

/**
 * Overnight fix 2026-10-16 T6 (evidence/overnight-2026-10-16/t6-measured.md): at Andrew's camera the ribbon drew a sliver.
 * Under one surface (Task 10) the ribbon draws only the overhang, from the crest knot forward, seated on the sheet; on the
 * left's B/C segments (the rider's sections, 110-135 m down the line) the reef's target hollow (wallHollow 0.1, Task 3b)
 * made the drawing a crumbling lip (tip 0.25 A ahead of the crest, 0.07 A down), drawn 0.05-0.35 m off the sheet. The
 * bar: a section past its break (phase 1.25) throws a lip at least OVERHANG_MIN_A ahead of its crest knot, and the ribbon
 * draws it (rho >= 0.5, the lip at least 0.1 A clear of the sheet).
 */
type Pt = [number, number];
const OVERHANG_MIN_A = 0.3, THROWN_REACH_A = 0.5, CURTAIN_DROP_A = 0.5, LIP_CLEAR_A = 0.25;
const M = { ft: 7, T: 15, dir: 225, tide: -0.25, windMs: 9.259992, t: 7642.504595688361, cam: [-28.65, -89.35] as Pt };

describe("the thrown lip at Andrew's camera (overnight T6)", () => {
  it("Andrew's 1791986608 (7 ft 225/15 tide -0.25): the station nearest phase 1.25 within 30 m of his camera throws its lip >= 0.3 A ahead of the crest knot, drawn clear of the sheet", { timeout: 300_000 }, () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = M.ft; c.swell.periodS = M.T; c.swell.directionDeg = M.dir; c.tideM = M.tide; c.seed = 2002; c.wind = { speedMs: M.windMs, directionDeg: 90 };
    const { bed, coast } = reefBeds(2);
    const field = computeReefField({ bed, coast, periodS: M.T, fromDeg: M.dir, tideM: M.tide, smooth: true, refractFloorM: REFRACT_FLOOR_M, peel: P.peel, curlMaxMs: P.curlMaxMs });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const offshoreMs = offshoreSpeed(c.wind.speedMs, c.wind.directionDeg, field.far.dirX, field.far.dirZ);
    const o = { ...breakOptions(field, P, offshoreMs), pile: false, shape: 'lean' as const };
    const waves = wavesNear(M.t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    const lines = traceLines(field, waves, M.t, ctx, { cameraX: M.cam[0], cameraZ: M.cam[1], params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(field, P), P), spacingM: 2, offshoreMs, drawSurge: true });
    const near = lines.flat().filter((s) => s.tb !== null && s.tb >= 0 && s.section.A > 0 && Math.hypot(s.x - M.cam[0], s.z - M.cam[1]) < 30);
    expect(near.length).toBeGreaterThan(5);
    const lip = (s: (typeof near)[number]) => {
      const sec = s.section, A = sec.A;
      const base = (u: number): Pt => { const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, M.t, sampleField(field, x, z), [waves[s.wave]], ctx, o); return [u + r.dx * s.nx + r.dz * s.nz, r.eta]; };
      const sheet: Pt[] = [];
      for (let u = -3 * A - 10; u <= 3 * A + 10; u += 0.1) sheet.push(base(u));
      const dist = (q: Pt): number => {
        let best = Infinity, sign = 1;
        for (let k = 0; k + 1 < sheet.length; k++) {
          const [ax, ay] = sheet[k], [bx, by] = sheet[k + 1], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
          const f = L2 > 0 ? Math.min(1, Math.max(0, ((q[0] - ax) * ex + (q[1] - ay) * ey) / L2)) : 0;
          const dx = q[0] - (ax + ex * f), dy = q[1] - (ay + ey * f), dd = Math.hypot(dx, dy);
          if (dd < best) { best = dd; sign = ex * dy - ey * dx >= 0 ? 1 : -1; }
        }
        return sign * best;
      };
      const pts = [...WS.sectionOf(sec, base).points].reverse() as Pt[], { marks } = WS.sectionSamples(sec, base);
      let clear = 0;
      for (let j = marks.crest; j <= marks.floor; j++) clear = Math.max(clear, dist(pts[j]));
      return { A, phase: sec.phase, hollow: sec.hollow, rho: sec.rho, reach: (pts[marks.tip][0] - pts[marks.crest][0]) / A, drop: (pts[marks.crest][1] - pts[marks.tip][1]) / A, clear: clear / A };
    };
    const fmt = (q: ReturnType<typeof lip>) => `phase ${q.phase.toFixed(2)} hollow ${q.hollow.toFixed(2)} A ${q.A.toFixed(2)} rho ${q.rho.toFixed(2)}: reach ${q.reach.toFixed(2)} A, drop ${q.drop.toFixed(2)} A, clear ${q.clear.toFixed(2)} A`;
    // Fable's bar: the station nearest phase 1.25 throws its lip >= OVERHANG_MIN_A ahead of its crest knot, drawn.
    const s125 = lip(near.reduce((a, b) => (Math.abs(b.section.phase - 1.25) < Math.abs(a.section.phase - 1.25) ? b : a)));
    console.log(`nearest 1.25: ${fmt(s125)}`);
    expect(Math.abs(s125.phase - 1.25)).toBeLessThan(0.1);
    expect(s125.rho).toBeGreaterThanOrEqual(0.5);
    expect(s125.reach).toBeGreaterThanOrEqual(OVERHANG_MIN_A);
    // Measured, that bar holds at wallHollow 0.1 (0.32 A at phase 1.28): the sliver is the lip's drop and its clearance. A thrown
    // lip from the barrel to the tube filling (phase 0.9 to STAGES.tubeFilling 1.25; at 1.28 the drawing's own tip has risen
    // to 0.64 A below its crest, x the seat's 0.6 = 0.39 A, measured after the fix: held by the reach bar above, not this one): reach >= THROWN_REACH_A, its tip >= CURTAIN_DROP_A below its
    // crest knot (the curtain), clear of the sheet by >= LIP_CLEAR_A.
    const bad: string[] = [];
    for (const s of near.filter((q) => q.section.phase >= 0.9 && q.section.phase < 1.25)) {
      const q = lip(s);
      if (!(q.reach >= THROWN_REACH_A && q.drop >= CURTAIN_DROP_A && q.clear >= LIP_CLEAR_A)) bad.push(fmt(q));
    }
    expect(bad).toEqual([]);
  });
});
