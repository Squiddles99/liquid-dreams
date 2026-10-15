import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from './breaking';
import { type Station, minRibbonHeight, traceLines } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from './setWaveModel';
import { reefBeds } from './testField';
import { offshoreSpeed } from './overturn';
import { SPILL_TO, TIP_REACH_MAX, TIP_RISE_MAX } from './wombProfile';
import { sectionFrameKnots, sectionOf, sectionTangents, shoulderAlong } from './wombSection';
import * as WS from './wombSection';

/**
 * womb-story Task 10 (Fable's ruling on the handover §7, 2026-10-14; measured 2026-10-15, task10/two-surfaces.md): one
 * surface by construction. The ribbon draws only the overhang (from the crest knot forward: the lip, the tube's roof, the
 * curtain); everywhere else (the back behind the crest, the face below the roof's root on it, the water in front, the
 * shoulder ahead of the curl) the drawn section is the sheet it is built on. Read on the CPU twins (the ribbon's section on
 * the station's own wave, the game's break options, no pile, the lean shape: crestLineProbe's base), every traced station of
 * the moment's wave on the left. The overhang is the section's samples from its crest knot to its tube's floor knot
 * (tools/_twoSurfaces.ts); outside it everything must be the sheet. Gaps are distances
 * from the sheet's curve (2026-10-15: the sheet's own face stands vertical, even leans over, so its height at one u is several).
 */
// LD_ONE_SURFACE=0 runs the same bars on the section of 2026-10-14 (the dial off: today's numbers, task10-stop.md).
if (process.env.LD_ONE_SURFACE !== undefined) WS.setOneSurface(Number(process.env.LD_ONE_SURFACE));
type Pt = [number, number];
interface Moment { name: string; ft: number; T: number; dir: number; tide: number; windMs: number; t: number; pick: { cam: Pt } | { arrivalNear: number } }
const MOMENTS: Moment[] = [
  // 7 ft 270/14 tide 0.5, the set's biggest wave round 400 s: its first broken station at t0 401.60 (2026-10-15, the tool).
  { name: '7 ft 270/14 tide 0.5 t0+3', ft: 7, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 404.6, pick: { arrivalNear: 400 } },
  { name: '7 ft 270/14 tide 0.5 t0+6', ft: 7, T: 14, dir: 270, tide: 0.5, windMs: 7 / 3.6, t: 407.6, pick: { arrivalNear: 400 } },
  // Andrew's moments (andrew-moment/moment.txt, andrew-moment-2/moment.txt): the wave broken nearest his camera.
  { name: "Andrew's 1791986608 (7 ft 225/15 tide -0.25)", ft: 7, T: 15, dir: 225, tide: -0.25, windMs: 9.259992, t: 7642.5046, pick: { cam: [-28.6, -89.3] } },
  { name: "Andrew's 1791992663 (5.5 ft 225/14 tide -0.25)", ft: 5.5, T: 14, dir: 225, tide: -0.25, windMs: 0.514444, t: 5877.2001, pick: { cam: [-10.1, -88.3] } },
];

interface Read {
  s: Station; along: number; d: number; A: number; phase: number; rho: number;
  pts: Pt[]; c: number; tip: number; r: number;
  sheetY: (u: number) => number; base: (u: number) => Pt;
  /** The signed distance (m) from the sheet's curve (+ above it): on its own near-vertical face the height at one u is several. */
  dist: (p: Pt) => number;
}
const fields = new Map<string, ReturnType<typeof computeReefField>>();
const cache = new Map<string, { reads: Read[]; frontAlong: number }>();

function readMoment(m: Moment): { reads: Read[]; frontAlong: number } {
  const hit = cache.get(m.name);
  if (hit) return hit;
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = m.ft; c.swell.periodS = m.T; c.swell.directionDeg = m.dir; c.tideM = m.tide; c.seed = 2002; c.wind = { speedMs: m.windMs, directionDeg: 90 };
  const key = `${m.T}|${m.dir}|${m.tide}`;
  if (!fields.has(key)) { const { bed, coast } = reefBeds(2); fields.set(key, computeReefField({ bed, coast, periodS: m.T, fromDeg: m.dir, tideM: m.tide, smooth: true, refractFloorM: REFRACT_FLOOR_M, peel: P.peel, curlMaxMs: P.curlMaxMs })); }
  const field = fields.get(key)!;
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const offshoreMs = offshoreSpeed(c.wind.speedMs, c.wind.directionDeg, field.far.dirX, field.far.dirZ);
  const o = { ...breakOptions(field, P, offshoreMs), pile: false, shape: 'lean' as const };
  const events = wavesNear(m.t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
  const lines = traceLines(field, waves, m.t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(field, P), P), spacingM: 2, offshoreMs, drawSurge: true });
  let wave: number;
  if ('cam' in m.pick) {
    const cam = m.pick.cam, broken = lines.flat().filter((s) => s.tb !== null && s.tb >= 0);
    wave = broken.reduce((a, b) => (Math.hypot(b.x - cam[0], b.z - cam[1]) < Math.hypot(a.x - cam[0], a.z - cam[1]) ? b : a)).wave;
  } else {
    const big = wavesNear(m.pick.arrivalNear, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
    wave = waves.findIndex((w) => Math.abs(w.arrivalS - big.arrivalS) < 1e-3);
  }
  const left = lines.flat().filter((s) => s.wave === wave && shoulderAlong(s.x, s.z) >= 0);
  const broken = left.filter((s) => s.tb !== null && s.tb >= 0);
  const frontAlong = Math.max(...broken.map((s) => shoulderAlong(s.x, s.z)));
  const reads: Read[] = [];
  for (const s of left) {
    const sec = s.section;
    if (!(sec.A > 0) || !(WS.curlWeight(sec) > 1e-3)) continue;
    const base = (u: number): Pt => { const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, m.t, sampleField(field, x, z), [waves[s.wave]], ctx, o); return [u + r.dx * s.nx + r.dz * s.nz, r.eta]; };
    const sheet: Pt[] = [];
    for (let u = -140; u <= 70; u += 0.25) sheet.push(base(u));
    const sheetY = (u: number): number => { for (let k = 0; k + 1 < sheet.length; k++) { const [ua, ya] = sheet[k], [ub, yb] = sheet[k + 1]; if ((u - ua) * (u - ub) <= 0 && ub !== ua) return ya + ((yb - ya) * (u - ua)) / (ub - ua); } return NaN; };
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
    const so = sectionOf(sec, base), pts = [...so.points].reverse() as Pt[];
    // The overhang: from the crest knot's sample to the tube's floor knot's (wombSection.SECTION_MARKED: the lip, the roof,
    // the curtain and the tube's back wall down to its floor); outside it everything must be the sheet. (tip: the lip's
    // furthest reach, for the roof test.)
    const { marks } = WS.sectionSamples(sec, base), c = marks.crest, r = marks.floor;
    let tip = -1; for (let j = c; j + 1 < pts.length; j++) if (pts[j + 1][0] < pts[j][0] - 1e-3) { tip = j; break; }
    const along = shoulderAlong(s.x, s.z);
    reads.push({ s, along, d: along - frontAlong, A: sec.A, phase: sec.phase, rho: sec.rho, pts, c, tip, r, sheetY, base, dist });
  }
  const out = { reads, frontAlong };
  cache.set(m.name, out);
  return out;
}

/** The section's top at u (its highest crossing), the sheet where the section is absent. */
const topAt = (q: Read, u: number): number => {
  let y = -Infinity;
  for (let j = 0; j + 1 < q.pts.length; j++) { const [ua, ya] = q.pts[j], [ub, yb] = q.pts[j + 1]; if ((u - ua) * (u - ub) <= 0 && ub !== ua) y = Math.max(y, ya + ((yb - ya) * (u - ua)) / (ub - ua)); }
  return Number.isFinite(y) ? y : q.sheetY(u);
};

describe('one surface by construction: the ribbon draws only the overhang (womb-story Task 10)', () => {
  it.each(MOMENTS.map((m) => [m.name, m] as const))('%s: outside the overhang the section is the sheet (its distance from the sheet <= 0.05 A at every station)', { timeout: 300_000 }, (_n, m) => {
    const worst: string[] = [];
    for (const q of readMoment(m).reads) {
      let g = 0, at = NaN;
      q.pts.forEach((p, j) => { if (j >= q.c && j <= q.r) return; const v = q.dist(p); if (Math.abs(v) > Math.abs(g)) { g = v; at = p[0] - q.pts[q.c][0]; } });
      if (Math.abs(g) > 0.05 * q.A) worst.push(`along ${q.along.toFixed(1)} ph ${q.phase.toFixed(2)}: ${g.toFixed(2)} m (${(g / q.A).toFixed(2)} A) at u ${at.toFixed(1)}`);
    }
    expect(worst).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))('%s: no ribbon ahead of the curl: the stations 5 m or more ahead draw nothing over the sheet', { timeout: 300_000 }, (_n, m) => {
    const { reads } = readMoment(m);
    expect(reads.filter((q) => q.d >= 5).map((q) => `along ${q.along.toFixed(1)} d ${q.d.toFixed(1)} rho ${q.rho.toFixed(2)} phase ${q.phase.toFixed(2)}`)).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))("%s: the lip's foot and its crest meet the sheet tangent (slope step <= 3 deg)", { timeout: 300_000 }, (_n, m) => {
    const bad: string[] = [];
    for (const q of readMoment(m).reads) {
      // The section's knots and tangents (sectionTangents): at the crest knot and the roof's root, the curve's direction
      // against the sheet's own at the knot's home (a 1 mm difference of the sheet there).
      const sec = q.s.section, { knots, beyond } = sectionFrameKnots(sec, q.base), { m: tg } = sectionTangents(knots, beyond);
      for (const [name, k] of [['crest', WS.SECTION_CREST], ['root', (WS as unknown as { SECTION_ROOT?: number }).SECTION_ROOT ?? -1]] as const) {
        if (k < 0) { bad.push('no SECTION_ROOT'); continue; }
        const h = knots[k][2] * sec.A, a = q.base(h - 1e-3), b = q.base(h + 1e-3);
        const sheetDir = Math.atan2(b[1] - a[1], b[0] - a[0]), curveDir = Math.atan2(tg[k][1], tg[k][0]);
        let step = Math.abs(sheetDir - curveDir) * (180 / Math.PI); if (step > 180) step = 360 - step;
        if (step > 3) bad.push(`along ${q.along.toFixed(1)} ph ${q.phase.toFixed(2)} ${name}: ${step.toFixed(1)} deg`);
      }
    }
    // Carried red, dated 2026-10-15 (Fable's STOP 4 ruling 5): under Task 11's drawn face, the crest join at 7 ft t0+3 along
    // 7.5, phase 0.59, 4.2 deg (the shoulder-to-root ease of faceTable.faceEnvelope as the lip pitches); every other join <= 3 deg.
    expect(bad).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))('%s: behind the crest the surface runs monotone down to the sheet for 20 m (rise <= 0.05 m: the law as written, the sheet included)', { timeout: 300_000 }, (_n, m) => {
    const own = false;
    const bad: string[] = [];
    for (const q of readMoment(m).reads) {
      if (q.along >= 130) continue; // A and B (8c item 3)
      // From the ray's crest: the section's highest point within 10 m of its crest knot (the knot sits on the sheet's crest edge,
      // its top can stand a little behind it).
      const near = q.pts.filter((p) => Math.abs(p[0] - q.pts[q.c][0]) <= 10), cu = near.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      let rise = 0, low = Infinity, sheetRise = 0, sheetLow = Infinity;
      for (let du = 0; du <= 20; du += 0.25) {
        const y = topAt(q, cu - du), sy = q.sheetY(cu - du);
        low = Math.min(low, y); rise = Math.max(rise, y - low);
        sheetLow = Math.min(sheetLow, sy); sheetRise = Math.max(sheetRise, sy - sheetLow);
      }
      if (rise > (own ? sheetRise + 0.02 : 0.05)) bad.push(`along ${q.along.toFixed(1)} ph ${q.phase.toFixed(2)}: rise ${rise.toFixed(2)} m (the sheet's own ${sheetRise.toFixed(2)})`);
    }
    // Carried red, dated 2026-10-15 (Fable's STOP 4 ruling 4): the sheet's own rise behind a broken crest, 7 ft t0+6 up to
    // 0.39 m and Andrew's 1791986608 up to 0.47 m: the bore's settling weight read on each point's own ray (points behind the
    // crest read an earlier time since onset; tools/_backDebug.ts), not CREST_HEIGHT_REACH. Its own task after the look.
    expect(bad).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))('%s: behind the crest the ribbon adds no rise of its own over 20 m (rise <= the sheet own + 0.02 m)', { timeout: 300_000 }, (_n, m) => {
    const own = true;
    const bad: string[] = [];
    for (const q of readMoment(m).reads) {
      if (q.along >= 130) continue; // A and B (8c item 3)
      // From the ray's crest: the section's highest point within 10 m of its crest knot (the knot sits on the sheet's crest edge,
      // its top can stand a little behind it).
      const near = q.pts.filter((p) => Math.abs(p[0] - q.pts[q.c][0]) <= 10), cu = near.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      let rise = 0, low = Infinity, sheetRise = 0, sheetLow = Infinity;
      for (let du = 0; du <= 20; du += 0.25) {
        const y = topAt(q, cu - du), sy = q.sheetY(cu - du);
        low = Math.min(low, y); rise = Math.max(rise, y - low);
        sheetLow = Math.min(sheetLow, sy); sheetRise = Math.max(sheetRise, sy - sheetLow);
      }
      if (rise > (own ? sheetRise + 0.02 : 0.05)) bad.push(`along ${q.along.toFixed(1)} ph ${q.phase.toFixed(2)}: rise ${rise.toFixed(2)} m (the sheet's own ${sheetRise.toFixed(2)})`);
    }
    expect(bad).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))('%s: one crest per ray (law d: crest-level maxima within +-60 m, y >= half the top, topographic prominence 0.05 A)', { timeout: 300_000 }, (_n, m) => {
    const bad: string[] = [];
    for (const q of readMoment(m).reads) {
      if (q.phase >= 1.5) continue; // the curl and the tube (the caved-in bore behind is the white water's)
      const cu = q.pts[q.c][0], ys: number[] = [];
      for (let u = -60; u <= 60; u += 0.5) ys.push(topAt(q, cu + u));
      const top = Math.max(...ys), at: string[] = [];
      for (let i = 1; i + 1 < ys.length; i++) if (ys[i] >= ys[i - 1] && ys[i] > ys[i + 1] && ys[i] >= 0.5 * top) {
        // Its prominence: the drop to the lowest point between it and the nearest higher water on each side (or the ray's end).
        let l = i - 1, lowL = ys[i]; while (l >= 0 && ys[l] <= ys[i]) { lowL = Math.min(lowL, ys[l]); l--; }
        let rr = i + 1, lowR = ys[i]; while (rr < ys.length && ys[rr] <= ys[i]) { lowR = Math.min(lowR, ys[rr]); rr++; }
        const lo = Math.max(lowL, lowR);
        if (ys[i] - lo > 0.05 * q.A) at.push(`${(-60 + i * 0.5).toFixed(1)}:${ys[i].toFixed(2)}`);
      }
      if (at.length > 1) bad.push(`along ${q.along.toFixed(1)} ph ${q.phase.toFixed(2)}: ${at.join(' ')}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(MOMENTS.slice(0, 2).map((m) => [m.name, m] as const))('%s: the height laws hold at the curl and 20 m behind (a: crest >= 0.6 face above still water; b: back >= 0.5 face)', { timeout: 300_000 }, (_n, m) => {
    const { reads } = readMoment(m), bad: string[] = [];
    for (const dd of [0, -20]) {
      const q = reads.reduce((a, b) => (Math.abs(b.d - dd) < Math.abs(a.d - dd) ? b : a));
      const cu = q.pts[q.c][0], crest = Math.max(...q.pts.filter((p) => Math.abs(p[0] - cu) <= 10).map((p) => p[1]));
      let front = Infinity, back = Infinity;
      for (let u = 0; u <= 30; u += 0.25) front = Math.min(front, topAt(q, cu + u));
      for (let u = 0; u <= 120; u += 0.25) back = Math.min(back, topAt(q, cu - u));
      const face = crest - front, b = crest - back;
      if (!(crest >= 0.6 * face)) bad.push(`d ${dd}: law a crest ${crest.toFixed(2)} < 0.6 x face ${face.toFixed(2)}`);
      if (!(b >= 0.5 * face)) bad.push(`d ${dd}: law b back ${b.toFixed(2)} < 0.5 x face ${face.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(MOMENTS.map((m) => [m.name, m] as const))("%s: the tube's approved section inside the overhang (womb-realism 3.2): tip <= 0.1 A over the crest, reach <= 1.0 A, a landed curtain on the sheet (<= 0.1 A), an open tube under the roof", { timeout: 300_000 }, (_n, m) => {
    const bad: string[] = [];
    for (const q of readMoment(m).reads) {
      const sec = q.s.section, so = sectionOf(sec, q.base);
      const rise = so.tip[1] - so.crest[1], reach = so.tip[0] - so.crest[0];
      if (rise > TIP_RISE_MAX * sec.A + 1e-6) bad.push(`along ${q.along.toFixed(1)} tip rise ${(rise / sec.A).toFixed(3)} A`);
      if (reach > TIP_REACH_MAX * sec.A * 1.03) bad.push(`along ${q.along.toFixed(1)} reach ${(reach / sec.A).toFixed(3)} A`);
      // A thrown lip's curtain (hollow >= SPILL_TO: below it the lip spills, it never lands).
      if (sec.phase >= 1 && sec.phase <= 1.25 && sec.rho > 0.5 && sec.hollow >= SPILL_TO) {
        const g = q.dist([so.tip[0], so.tip[1]]);
        if (Math.abs(g) > 0.1 * sec.A) bad.push(`along ${q.along.toFixed(1)} ph ${sec.phase.toFixed(2)} curtain foot ${(g / sec.A).toFixed(2)} A`);
      }
      // The tube is open: somewhere along the roof (the tip back to its root) it stands 0.1 A or more over the surface under it.
      if (sec.phase >= 0.75 && sec.phase <= 1.25 && sec.rho > 0.5 && sec.hollow >= SPILL_TO && q.tip >= 0 && q.r > q.tip) {
        let open = -Infinity;
        for (let j = q.tip; j <= q.r; j++) open = Math.max(open, q.dist(q.pts[j]));
        if (!(open >= 0.1 * sec.A)) bad.push(`along ${q.along.toFixed(1)} ph ${sec.phase.toFixed(2)} roof at most ${(open / sec.A).toFixed(2)} A over the sheet`);
      }
    }
    expect(bad).toEqual([]);
  });
});
