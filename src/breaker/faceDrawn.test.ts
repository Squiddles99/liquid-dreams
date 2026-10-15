import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { withSections } from '../ride/sectionWater';
import { waterAt } from '../ride/water';
import { TUNING, startBody, stepRide } from '../ride/ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from '../ride/takeoff';
import { LINE_OFF_DEG } from '../ride/rideLine';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { type Station, closeoutWeight, minRibbonHeight, traceLines, traceStations } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { type ActiveWave, breakOptions, crestAt, crestHeight, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';
import { coastReefField, reefBeds } from './testField';
import { offshoreSpeed } from './overturn';
import { sectionNumbers, shoulderAlong } from './wombSection';
import { compareFace } from './faceVsDrawing.testutil';

/**
 * womb-story Task 11 (Fable's STOP 3 ruling 1, 2026-10-15; measured task11/face-vs-drawing.md): the sheet's stood face is the
 * drawing's face. Under the one-surface law (Task 10) the face below the roof's root, and the whole face of a section still
 * waiting its turn, is the sheet's own; the wave-form law (2026-10-05: his drawing becomes the model) says that face is the
 * approved drawing's. Both hold when the sheet's stand-up below the root follows the drawing (wombProfile's keys at the
 * station's phase and hollow, u by A, y seated as the ribbon seats the overhang), joined tangent to the sheet's swell at the
 * foot. Bars: the slope under the board within 0.1 of the 2026-10-14 drawn wall's (task10/stood-face-slope.md, the ride the
 * rider wiped on); the stood face within 0.05 A of the seated drawing; the foot tangent; the back behind a broken crest
 * monotone for 20 m (rise <= 0.02 A; ruling 2: CREST_HEIGHT_REACH, the broken crest's reach behind).
 */

/** The ride bot of rideOnSections / tools/_standSlope.ts at 7 ft (Pumping) and 12 ft (Huge), 225 deg, tide 0, intermediate:
 * the slope of the water under the board along the swell, 0.5 / 1.0 / 1.25 s after its pop-up. */
function rideSlopes(label: string): { s: number; slope: number }[] {
  const band = SWELL_BANDS.find((x) => x.label === label)!, c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = band.ft; c.swell.periodS = band.periodS; c.swell.directionDeg = 225; c.tideM = 0;
  const field = coastReefField({ periodS: band.periodS, fromDeg: 225, tideM: 0, peel: true });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const big = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8).reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P), o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const };
  const water = (t: number, cx: number, cz: number) => {
    const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    const sheet = (x: number, z: number) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
    return withSections(sheet, traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM }), c.tideM);
  };
  const spot = takeoffSpot(field, big.heightM, P);
  let t = big.arrivalS - takeoffLeadS(field, spot);
  const arrive = t + TAKEOFF_ARRIVE_S, w0 = water(t, spot.x, spot.z), start = w0(spot.x, spot.z);
  const heading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180), b = startBody(spot.x, spot.z, heading, w0);
  const line = heading - LINE_OFF_DEG, dt = 1 / 60, out: { s: number; slope: number }[] = [];
  let popT = NaN;
  for (let k = 0; k < 60 * 12; k++) {
    t += dt;
    const w = water(t, b.x, b.z);
    if (b.phase === 'paddle' && !Number.isFinite(popT)) b.headingDeg = heading;
    const err = ((b.headingDeg - line + 540) % 360) - 180, under = w(b.x, b.z);
    const popup = b.phase === 'paddle' && b.caught && !Number.isFinite(popT) && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
    if (popup) popT = t;
    const e = stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - 2, steer: Number.isFinite(popT) ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, w, dt, TUNING.intermediate);
    if (Number.isFinite(popT)) for (const s of [0.5, 1, 1.25]) if (Math.abs(t - popT - s) < dt / 2) out.push({ s, slope: Math.hypot(under.slopeX, under.slopeZ) });
    if (e === 'wipeout' || t - popT > 1.3) break;
  }
  return out;
}

describe("the sheet's stood face is the drawing's face (womb-story Task 11)", () => {
  // task10/stood-face-slope.md, the 2026-10-14 drawn wall at the ride's board.
  it.each([['Pumping', [0.74, 0.81, 0.8]], ['Huge', [1.51, 1.61, 1.38]]] as [string, number[]][])('%s: the slope under the board 0.5 / 1.0 / 1.25 s after the pop-up is within 0.1 of the drawn wall of 2026-10-14 %j', { timeout: 300_000 }, (label, want) => {
    const got = rideSlopes(label);
    expect(got.map((g) => g.s)).toEqual([0.5, 1, 1.25]);
    const bad = got.filter((g, i) => Math.abs(g.slope - want[i]) > 0.1).map((g) => `+${g.s} s: ${g.slope.toFixed(2)}`);
    expect(bad).toEqual([]);
  });

  /** The stations of the set's biggest wave round 400 s on the left (A: along 0-50, B: 50-130) at t, each with the sheet along
   * its normal (its own wave only). */
  const LINE = new Map<string, { st: Station[]; sheetY: (s: Station) => (u: number) => number; w: ActiveWave; o: ReturnType<typeof breakOptions>; field: ReturnType<typeof computeReefField> }>();
  const fields = new Map<string, ReturnType<typeof computeReefField>>();
  function lineAt(m: { ft: number; T: number; dir: number; tide: number; windMs: number; t: number; cam?: [number, number] }) {
    const key = JSON.stringify(m);
    if (LINE.has(key)) return LINE.get(key)!;
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = m.ft; c.swell.periodS = m.T; c.swell.directionDeg = m.dir; c.tideM = m.tide; c.seed = 2002; c.wind = { speedMs: m.windMs, directionDeg: 90 };
    const fk = `${m.T}|${m.dir}|${m.tide}`;
    if (!fields.has(fk)) { const { bed, coast } = reefBeds(2); fields.set(fk, computeReefField({ bed, coast, periodS: m.T, fromDeg: m.dir, tideM: m.tide, smooth: true, refractFloorM: REFRACT_FLOOR_M, peel: P.peel, curlMaxMs: P.curlMaxMs })); }
    const field = fields.get(fk)!, ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const offshoreMs = offshoreSpeed(c.wind.speedMs, c.wind.directionDeg, field.far.dirX, field.far.dirZ);
    const o = { ...breakOptions(field, P, offshoreMs), pile: false, shape: 'lean' as const };
    const waves = wavesNear(m.t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
    const lines = traceLines(field, waves, m.t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(field, P), P), spacingM: 2, offshoreMs });
    let wi: number;
    if (m.cam) {
      const cam = m.cam, broken = lines.flat().filter((s) => s.tb !== null && s.tb >= 0);
      wi = broken.reduce((a, b) => (Math.hypot(b.x - cam[0], b.z - cam[1]) < Math.hypot(a.x - cam[0], a.z - cam[1]) ? b : a)).wave;
    } else {
      const big = wavesNear(400, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
      wi = waves.findIndex((w) => Math.abs(w.arrivalS - big.arrivalS) < 1e-3);
    }
    const st = lines.flat().filter((s) => s.wave === wi && shoulderAlong(s.x, s.z) >= 0 && shoulderAlong(s.x, s.z) < 130);
    const sheetY = (s: Station) => (u: number): number => waterAt(s.x + s.nx * u, s.z + s.nz * u, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, m.t, f, [waves[wi]], ctx, o)).y - c.tideM;
    const out = { st, sheetY, w: waves[wi], o, field };
    LINE.set(key, out);
    return out;
  }
  // 7 and 12 ft 270/14 tide 0.5, the set's biggest wave round 400 s: t0 (its first broken station) 401.60 / 398.60 (the tool).
  const LINE_MOMENTS = [
    { name: '7 ft 270/14 tide 0.5 t0+3', ft: 7, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 404.6 },
    { name: '7 ft 270/14 tide 0.5 t0+6', ft: 7, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 407.6 },
    { name: '12 ft 270/14 tide 0.5 t0+3', ft: 12, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 401.6 },
    { name: '12 ft 270/14 tide 0.5 t0+6', ft: 12, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 404.6 },
  ];
  /** A stood section: stood up to the lip's pitch (phase >= 0.4, its last half second before the break) through the tube's
   * collapse (phase <= 1.5; past it the white water's bore). Every 4th station (8 m apart). */
  const stood = (st: Station[]): Station[] => st.filter((s, i) => i % 4 === 0 && s.section.A > 0 && s.section.phase >= 0.4 && s.section.phase <= 1.5);

  it.each(LINE_MOMENTS.map((m) => [m.name, m] as const))('%s: on A and B the stood face below the root is within 0.05 A of the seated drawing', { timeout: 300_000 }, (_n, m) => {
    const { st, sheetY } = lineAt(m), bad: string[] = [];
    const sts = stood(st);
    expect(sts.length).toBeGreaterThan(0);
    for (const s of sts) {
      const f = compareFace(s.section, sheetY(s));
      // 2026-10-15 (step 3): the distance from the drawing's face to the sheet, not the height at one u (on the near-vertical
      // wall a few centimetres of shift read as metres).
      if (!(Math.abs(f.worstDist) <= 0.05 * s.section.A)) bad.push(`along ${shoulderAlong(s.x, s.z).toFixed(1)} ph ${s.section.phase.toFixed(2)}: ${f.worstDist.toFixed(2)} m (${(f.worstDist / s.section.A).toFixed(2)} A) at u ${f.worstDistAt.toFixed(1)}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(LINE_MOMENTS.map((m) => [m.name, m] as const))('%s: the stood face meets the swell at its foot tangent (no slope step over 3 deg from its low to 0.25 A past it)', { timeout: 300_000 }, (_n, m) => {
    const { st, sheetY } = lineAt(m), bad: string[] = [];
    for (const s of stood(st)) {
      const y = sheetY(s), A = s.section.A, f = compareFace(s.section, y);
      // The sheet's low in front of the crest, then its direction every 0.05 m over +-1 A about it.
      let lu = f.crestU, ly = Infinity;
      for (let u = f.crestU; u <= f.crestU + f.faceTo + A; u += 0.1) { const v = y(u); if (v < ly) { ly = v; lu = u; } }
      let prev = NaN, worst = 0, at = NaN;
      // 2026-10-15 (step 3): the join is at the face's low and past it (the window was +-1 A, and at phase 1 the drawn face is
      // 0.75 A long: it read the tube's wall, and the drawing's own floor corner 0.17 A before the low, as the foot; and 1 A past
      // it the water in front, where the bore's clock steps from ray to ray).
      for (let u = lu - 0.05 * A; u <= lu + 0.25 * A; u += 0.05) {
        const a = Math.atan2(y(u + 0.05) - y(u), 0.05) * (180 / Math.PI);
        if (Number.isFinite(prev) && Math.abs(a - prev) > worst) { worst = Math.abs(a - prev); at = u - lu; }
        prev = a;
      }
      if (worst > 3) bad.push(`along ${shoulderAlong(s.x, s.z).toFixed(1)} ph ${s.section.phase.toFixed(2)}: ${worst.toFixed(1)} deg at ${at.toFixed(2)} m from the low`);
    }
    expect(bad).toEqual([]);
  });

  // Ruling 2: Andrew's two moments and 7 / 12 ft 270/14 t0+6 (task10-stop.md 4.1: 7 ft t0+6 rose 0.39 m, 0.074 A).
  const BACK_MOMENTS = [
    LINE_MOMENTS[1], LINE_MOMENTS[3],
    { name: "Andrew's 1791986608 (7 ft 225/15 tide -0.25)", ft: 7, T: 15, dir: 225, tide: -0.25, windMs: 9.259992, t: 7642.5046, cam: [-28.6, -89.3] as [number, number] },
    { name: "Andrew's 1791992663 (5.5 ft 225/14 tide -0.25)", ft: 5.5, T: 14, dir: 225, tide: -0.25, windMs: 0.514444, t: 5877.2001, cam: [-10.1, -88.3] as [number, number] },
  ];
  it.each(BACK_MOMENTS.map((m) => [m.name, m] as const))('%s: behind a broken crest the sheet runs monotone down for 20 m (rise <= 0.02 A)', { timeout: 300_000 }, (_n, m) => {
    const { st, sheetY } = lineAt(m), bad: string[] = [];
    for (const s of st) {
      if (!(s.tb !== null && s.tb >= 0) || !(s.section.A > 0)) continue;
      const y = sheetY(s), A = s.section.A;
      let cu = 0, cy = -Infinity;
      for (let u = -A; u <= A; u += 0.05) { const v = y(u); if (v > cy) { cy = v; cu = u; } }
      let low = Infinity, rise = 0, at = NaN;
      for (let du = 0; du <= 20; du += 0.25) { const v = y(cu - du); low = Math.min(low, v); if (v - low > rise) { rise = v - low; at = du; } }
      if (rise > 0.02 * A) bad.push(`along ${shoulderAlong(s.x, s.z).toFixed(1)} ph ${s.section.phase.toFixed(2)}: ${rise.toFixed(2)} m (${(rise / A).toFixed(3)} A) ${at.toFixed(1)} m behind`);
    }
    expect(bad).toEqual([]);
  });

  it('the guard: a crest read on the sheet gives the section numbers the trace gives a station there (the sheet knows the phase)', { timeout: 300_000 }, () => {
    const m = LINE_MOMENTS[1], { st, w, o, field } = lineAt(m), ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const bad: string[] = [];
    for (const s of st.filter((_, i) => i % 6 === 0)) {
      const crest = crestAt(s.x, s.z, m.t, sampleField(field, s.x, s.z), w, ctx, o)!;
      const tb = crest.tb ?? null, brk = tb !== null && tb >= 0, held = tb !== null && tb < 0;
      const q = sectionNumbers({ H: crestHeight(w, crest), Hb: brk ? crest.size : null, r: crest.r, tb: brk ? tb : null, until: held ? -tb! : crest.until, psi: crest.psi, periodS: m.T, x: crest.x, z: crest.z }, { ribbonOnset: P.ribbonOnset });
      const hollow = q.hollow * (1 - closeoutWeight(crest.z));
      // The station's numbers are smoothed along the crest (SECTION_SMOOTHING_M 4 m): within 0.1 of its phase, 0.25 of its hollow
      // (the hollow jumps over reef heads: 0.82 smoothed beside 1.00 read, 2026-10-15).
      if (Math.abs(q.phase - s.section.phase) > 0.1 || Math.abs(hollow - s.section.hollow) > 0.25) bad.push(`along ${shoulderAlong(s.x, s.z).toFixed(1)}: phase ${q.phase.toFixed(2)} vs ${s.section.phase.toFixed(2)}, hollow ${hollow.toFixed(2)} vs ${s.section.hollow.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });
});
