import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesNear } from '../swell/sets';
import { waterAt } from '../ride/water';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { type Station, minRibbonHeight, traceLines } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { MAX_AHEAD_SLOPE, MAX_SECTION_FACE_SLOPE, breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';
import { reefBeds } from './testField';
import { offshoreSpeed } from './overturn';
import { shoulderAlong } from './wombSection';

/**
 * Overnight fix 2026-10-16 T2 (Andrew 2026-10-15/16: "the right-angle triangle of wave face" ahead of the breaking section, and
 * his seven saved moments: a mirror-flat vertical slab with a sawtooth top, a banded tunnel). Measured on the merged head
 * (overnight-2026-10-16/t2): the slab is the sheet (SetWaves; the ribbon off removes none of it), the GPU equals the CPU
 * there (|d eta| <= 0.07 m), and the sheet's stood face is the drawing's near-vertical face: at his moment 1792081641 the sheet
 * drops 1.9 m over 0.31 m of run (the tube's back wall, faceTable phase 1, L 0.79 A then level), which the render grid
 * (384 segments: 0.33 m cells at 20 m, 0.65 m at 40 m) draws as a cliff with a zig-zag top. The law: ahead of the curl
 * front the stood face never steeper than MAX_AHEAD_SLOPE, on the broken section never steeper than MAX_SECTION_FACE_SLOPE.
 */
const fields = new Map<string, ReturnType<typeof computeReefField>>();
function setup(m: { ft: number; T: number; dir: number; tide: number; windMs: number }) {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = m.ft; c.swell.periodS = m.T; c.swell.directionDeg = m.dir; c.tideM = m.tide; c.seed = 2002; c.wind = { speedMs: m.windMs, directionDeg: 90 };
  const fk = `${m.T}|${m.dir}|${m.tide}`;
  if (!fields.has(fk)) { const { bed, coast } = reefBeds(2); fields.set(fk, computeReefField({ bed, coast, periodS: m.T, fromDeg: m.dir, tideM: m.tide, smooth: true, refractFloorM: REFRACT_FLOOR_M, peel: P.peel, curlMaxMs: P.curlMaxMs })); }
  const field = fields.get(fk)!, ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const offshoreMs = offshoreSpeed(c.wind.speedMs, c.wind.directionDeg, field.far.dirX, field.far.dirZ);
  const o = { ...breakOptions(field, P, offshoreMs), pile: false, shape: 'lean' as const };
  const lines = (t: number) => traceLines(field, wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave), t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(field, P), P), spacingM: 2, offshoreMs });
  /** The whole sheet's height (all waves) at (x, z), above the tide. */
  const sheet = (t: number) => {
    const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    return (x: number, z: number): number => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o)).y - c.tideM;
  };
  return { c, field, lines, sheet };
}
/** The steepest the sheet stands along a station's normal over [u0, u1] (0.1 m steps, the run measured on the surface), and
 * the largest step between neighbouring 0.1 m slopes (deg). */
function steepest(y: (u: number) => number, u0: number, u1: number): { slope: number; at: number; stepDeg: number } {
  let slope = 0, at = NaN, stepDeg = 0, prev = NaN;
  for (let u = u0; u <= u1; u += 0.1) {
    const s = (y(u + 0.1) - y(u)) / 0.1, a = Math.atan(s) * (180 / Math.PI);
    if (Math.abs(s) > slope) { slope = Math.abs(s); at = u; }
    if (Number.isFinite(prev)) stepDeg = Math.max(stepDeg, Math.abs(a - prev));
    prev = a;
  }
  return { slope, at, stepDeg };
}
const along = (s: Station) => shoulderAlong(s.x, s.z);

describe('the sheet stands no wall ahead of the curl, and no cliff on the section (overnight fix T2)', () => {
  // The Pumping preset (7 ft 15 s 225, tide 0.5): the set's biggest wave round 400 s; t0 its first broken station on the left.
  it('7 ft 225/15 tide 0.5 t0+6: the stations 10-60 m ahead of the curl front stand no steeper than MAX_AHEAD_SLOPE; 20 m ahead no slope step over 3 deg', { timeout: 300_000 }, () => {
    const s = setup({ ft: 7, T: 15, dir: 225, tide: 0.5, windMs: 9.259992 });
    const big = wavesNear(400, s.c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    let t0 = NaN, wi = -1;
    for (let t = big.arrivalS - 4; t <= big.arrivalS + 20 && !Number.isFinite(t0); t += 0.5) {
      const waves = wavesNear(t, s.c, DEFAULT_SET_PARAMS);
      const i = waves.findIndex((w) => Math.abs(w.arrivalS - big.arrivalS) < 1e-3);
      if (s.lines(t).flat().some((q) => q.wave === i && q.tb !== null && q.tb >= 0 && along(q) > 0)) { t0 = t; wi = i; }
    }
    expect(Number.isFinite(t0)).toBe(true);
    const t = t0 + 6, st = s.lines(t).flat().filter((q) => q.wave === wi && along(q) > 0);
    const front = st.filter((q) => q.tb !== null && q.tb >= 0).reduce((a, b) => (along(b) > along(a) ? b : a));
    const y = s.sheet(t), bad: string[] = [];
    let seen = 0;
    for (const q of st) {
      const d = along(q) - along(front);
      if (d < 10 || d > 60 || !(q.section.A > 0)) continue;
      seen++;
      const A = q.section.A, r = steepest((u) => y(q.x + q.nx * u, q.z + q.nz * u), -3 * A, 3 * A);
      if (r.slope > MAX_AHEAD_SLOPE + 0.05) bad.push(`+${d.toFixed(1)} m: slope ${r.slope.toFixed(2)} at u ${r.at.toFixed(1)}`);
      if (Math.abs(d - 20) < 1.01 && r.stepDeg > 3) bad.push(`+${d.toFixed(1)} m: slope step ${r.stepDeg.toFixed(1)} deg`);
    }
    expect(seen).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });

  // Andrew's 1792081641 (6.87 ft 225/14 tide 0.5, 06:38, simTime 9573.88, his camera at -21.6, -81.96): the barrel he saw as a
  // jagged mirror wall. The broken stations within 30 m of his camera.
  it("Andrew's 1792081641: the broken section's stood face is no steeper than MAX_SECTION_FACE_SLOPE", { timeout: 300_000 }, () => {
    const s = setup({ ft: 6.869559909986412, T: 14, dir: 225, tide: 0.5, windMs: 0.514444 });
    const t = 9573.877030704043, cam = [-21.6, -81.96], y = s.sheet(t), bad: string[] = [];
    const st = s.lines(t).flat().filter((q) => q.tb !== null && q.tb >= 0 && q.section.A > 0 && Math.hypot(q.x - cam[0], q.z - cam[1]) < 30);
    expect(st.length).toBeGreaterThan(5);
    for (const q of st) {
      const A = q.section.A, r = steepest((u) => y(q.x + q.nx * u, q.z + q.nz * u), -2 * A, 3 * A);
      if (r.slope > MAX_SECTION_FACE_SLOPE + 0.1) bad.push(`along ${along(q).toFixed(1)} tb ${q.tb!.toFixed(2)}: slope ${r.slope.toFixed(2)} at u ${r.at.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });
});
