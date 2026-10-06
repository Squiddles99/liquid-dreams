import { it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { traceStations } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { type WaveContext, breakOptions, sumWaves, toActiveWave } from './setWaveModel';
import { type Station } from './crestTrace';
import { waterAt } from '../ride/water';
import { withSections } from '../ride/sectionWater';

/**
 * A probe, not a test: the crest stations along the set's biggest wave as it breaks, printed as a table (arc along the crest,
 * depth, the station's numbers, the sheet's height at the crest and 6 m and 20 m in front of it), at two moments. Run it
 * with the size in feet: `PROBE_FT=6 npx vitest run src/breaker/crestProbe.test.ts --silent=false`. Skipped otherwise. It
 * is how the right-angle bowl was found (2026-10-06): the sea 6 m ahead of the crest jumped 2 m over 3 m of crest where the
 * drawn wall ended.
 */
const SIZE = Number(process.env.PROBE_FT ?? 0);

it.skipIf(!(SIZE > 0))('probe: the crest stations along the ride wave as it breaks', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = SIZE;
  const bed = downsample(buildBathymetry(), 2);
  const field = computeReefField({ bed, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
  const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const waves = [toActiveWave(big)];
  const p = DEFAULT_BREAK_PARAMS;
  const o = { ...breakOptions(field, p, 0), pile: false, shape: 'lean' as const };
  const lines: string[] = [`size ${SIZE} ft: biggest wave H0 ${big.heightM.toFixed(2)} m, T ${c.swell.periodS}, arrival ${big.arrivalS.toFixed(1)}`];
  for (const dt of [0, 3]) {
    const t = big.arrivalS + dt;
    const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: p, minHeightM: 0, spacingM: 1 });
    lines.push(`\n--- t = arrival + ${dt} s: ${st.length} entries`);
    lines.push('  arc     x      z   depth  hmin   H    Hb     r    tb   until  phase  rho    A   sheetEta  ahead6  ahead20');
    let lastArc = -1e9;
    for (const e of st) {
      if (e.gap) { lines.push('  (gap)'); lastArc = -1e9; continue; }
      if (e.arc - lastArc < 3) continue;
      lastArc = e.arc;
      const f = sampleField(field, e.x, e.z);
      const sheet = sumWaves(e.x, e.z, t, f, waves, ctx, o);
      const ah = (d: number) => { const ax = e.x + e.nx * d, az = e.z + e.nz * d; return sumWaves(ax, az, t, sampleField(field, ax, az), waves, ctx, o).eta; };
      const fmt = (v: number | null | undefined, w = 5, d = 2): string => (v === null || v === undefined ? 'null' : Number.isFinite(v) ? v.toFixed(d) : String(v)).padStart(w);
      lines.push(`${fmt(e.arc, 6, 1)} ${fmt(e.x, 6, 1)} ${fmt(e.z, 6, 1)} ${fmt(f.depth, 6, 1)} ${fmt(f.hmin, 5, 1)} ${fmt(e.H, 5)} ${fmt((e as any).Hb, 5)} ${fmt(e.r, 5)} ${fmt(e.tb, 6)} ${fmt((e as any).until, 5, 1)} ${fmt(e.section.phase, 5)} ${fmt(e.section.rho, 5)} ${fmt(e.section.A, 5)} ${fmt(sheet.eta, 8)} ${fmt(ah(6), 7)} ${fmt(ah(20), 8)}`);
    }
  }
  console.log(lines.join('\n'));
}, 60000);

/**
 * The cross-section in front of the curl: along the ray of the station `PROBE_PAST` m past the curl (0: the curl itself),
 * `PROBE_DT` s after the set's biggest wave reaches the peak, the sheet's height and the drawn surface's (the ride's water,
 * sectionWater.withSections: what the ribbon draws) every half metre from 4 m behind the crest to 26 m in front.
 * `PROBE_FT=8 PROBE_DT=5 PROBE_PAST=0 npx vitest run src/breaker/crestProbe.test.ts --silent=false`. It is how the fold in
 * front of the face was found (2026-10-06): the drawn floor 1.1 m under the trough knot, the water climbing 1.6 m to the flats.
 */
const DT = Number(process.env.PROBE_DT ?? NaN), PAST = Number(process.env.PROBE_PAST ?? 0);

it.skipIf(!(SIZE > 0 && Number.isFinite(DT)))('probe: the cross-section in front of the curl', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = SIZE;
  const bed = downsample(buildBathymetry(), 2);
  const field = computeReefField({ bed, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
  const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const t = big.arrivalS + DT, waves = events.map(toActiveWave), p = DEFAULT_BREAK_PARAMS;
  const o = { ...breakOptions(field, p, 0), pile: false, shape: 'lean' as const };
  const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: p, minHeightM: 0, spacingM: 1 });
  const wi = waves.findIndex((w) => Math.abs(w.arrivalS - big.arrivalS) < 1e-3);
  const line = st.filter((e): e is Station => !e.gap && e.wave === wi).sort((a, b) => a.arc - b.arc);
  const curlArc = Math.min(...line.filter((s) => s.tb !== null).map((s) => s.arc));
  const s = line.reduce((best, q) => (Math.abs(q.arc - (curlArc - PAST)) < Math.abs(best.arc - (curlArc - PAST)) ? q : best));
  const sheet = (x: number, z: number) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
  const ride = withSections(sheet, st, c.tideM);
  const lines = [`${SIZE} ft, t + ${DT} s, ${PAST} m past the curl: arc ${s.arc.toFixed(1)} at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}), depth ${sampleField(field, s.x, s.z).depth.toFixed(1)}, phase ${s.section.phase.toFixed(2)}, A ${s.section.A.toFixed(2)}, until ${s.until?.toFixed(2)}`, '  u(m)   sheet   drawn'];
  for (let u = -4; u <= 26; u += 0.5) {
    const x = s.x + s.nx * u, z = s.z + s.nz * u;
    lines.push(`  ${u.toFixed(1).padStart(5)}  ${(sheet(x, z).y - c.tideM).toFixed(2).padStart(6)}  ${(ride(x, z).y - c.tideM).toFixed(2).padStart(6)}`);
  }
  console.log(lines.join('\n'));
}, 120000);

/**
 * The sweep: every station along the ride wave at `PROBE_DT`, with the drawn surface's height less the sheet's (cm) at
 * fixed distances in front of the crest, so a fold that runs along the crest (one cut would miss it) shows as a column
 * that jumps or a row that differs from its neighbours. `PROBE_FT=8 PROBE_DT=3 PROBE_SWEEP=1 npx vitest run
 * src/breaker/crestProbe.test.ts --silent=false`. Under the thrown lip the drawn height is the floor's (the lower branch).
 */
it.skipIf(!(SIZE > 0 && Number.isFinite(DT) && process.env.PROBE_SWEEP))('probe: the sweep along the crest', () => {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = SIZE;
  const bed = downsample(buildBathymetry(), 2);
  const field = computeReefField({ bed, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const events = wavesOfSet(1, c, DEFAULT_SET_PARAMS);
  const big = events.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const t = big.arrivalS + DT, waves = events.map(toActiveWave), p = DEFAULT_BREAK_PARAMS;
  const o = { ...breakOptions(field, p, 0), pile: false, shape: 'lean' as const };
  const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: p, minHeightM: 0, spacingM: 1 });
  const wi = waves.findIndex((w) => Math.abs(w.arrivalS - big.arrivalS) < 1e-3);
  const line = st.filter((e): e is Station => !e.gap && e.wave === wi).sort((a, b) => a.arc - b.arc);
  const curlArc = Math.min(...line.filter((s) => s.tb !== null).map((s) => s.arc));
  const sheet = (x: number, z: number) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
  const ride = withSections(sheet, st, c.tideM);
  const US = [0, 1, 2, 3, 4, 6, 8, 12];
  const out = [`${SIZE} ft, t + ${DT} s: curl at arc ${curlArc.toFixed(1)}; drawn − sheet (cm) at u m in front of the crest`, '   arc   past   until phase     A   rho  sheet@0 ' + US.map((u) => `u${u}`.padStart(6)).join('')];
  for (const s of line) {
    const past = curlArc - s.arc;
    if (past < -40 || past > 60) continue;
    const row = US.map((u) => { const x = s.x + s.nx * u, z = s.z + s.nz * u; return ((ride(x, z).y - sheet(x, z).y) * 100).toFixed(0).padStart(6); }).join('');
    const until = s.until === null ? 'null' : s.until === Infinity ? 'inf' : s.until.toFixed(2);
    out.push(`${s.arc.toFixed(1).padStart(6)} ${past.toFixed(1).padStart(6)} ${until.padStart(7)} ${s.section.phase.toFixed(2).padStart(5)} ${s.section.A.toFixed(2).padStart(5)} ${s.section.rho.toFixed(2).padStart(5)} ${(sheet(s.x, s.z).y - c.tideM).toFixed(2).padStart(8)} ${row}`);
  }
  console.log(out.join('\n'));
}, 120000);
