import { it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { traceStations } from './crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from './reefField';
import { type WaveContext, breakOptions, sumWaves, toActiveWave } from './setWaveModel';

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
