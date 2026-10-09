// one-curl Task 4 step 3 (measurement only): the curl's profile along the crest at 6 ft, peak + 3 s, for the station
// smoothing σ 4 and 2 m and the record's onset smoothing σ 8 and 4 m. PROBE_CURL=1 npx vitest run src/breaker/curlProfile.probe.test.ts
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { type Station, timeSinceOnset, traceStations } from './crestTrace';
import { REFRACT_FLOOR_M, type ReefField, computeReefField, sampleField, smoothFieldAmplitude } from './reefField';
import { setWaveHeight } from './reefReport';
import { type ActiveWave, type WaveContext, fieldBreakingHeight } from './setWaveModel';
import { sectionNumbers } from './wombSection';
import { minRibbonHeight } from './crestTrace';

const P = DEFAULT_BREAK_PARAMS;

/** crestTrace.fillSections' phase only, with the smoothing σ as an argument. */
function phases(line: Station[], periodS: number, sigma: number): number[] {
  const raw = line.map((s) => sectionNumbers({ H: s.H, Hb: s.Hb, r: s.r, tb: s.tb, until: s.until, psi: s.psi, periodS }, { ribbonOnset: P.ribbonOnset }).phase);
  const inv = 1 / (2 * sigma * sigma);
  return line.map((s) => {
    let w = 0, ph = 0;
    for (let k = 0; k < line.length; k++) {
      const d = line[k].arc - s.arc;
      if (Math.abs(d) > 3 * sigma) continue;
      const g = Math.exp(-d * d * inv);
      w += g; ph += g * raw[k];
    }
    return ph / w;
  });
}

describe.runIf(process.env.PROBE_CURL)('the curl along the crest: what the smoothing costs (one-curl Task 4)', () => {
  it('prints the four tables', { timeout: 300_000 }, () => {
    const bed = downsample(buildBathymetry(), 2);
    const fieldWith = (onsetSigma: number): ReefField => {
      const f = computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: REFRACT_FLOOR_M });
      smoothFieldAmplitude(f, undefined, undefined, onsetSigma);
      return f;
    };
    const out: string[] = ['# one-curl Task 4: the curl along the crest at 6 ft, mid tide, peak + 3 s (the biggest set wave), spacing 1 m',
      '# per table: arc (m), tb (s; - unbroken), phase; the north side (z falling) over the 40 m around phase 0.45; width = arc from phase 1 to 0.45'];
    for (const onsetSigma of [8, 4]) {
      const f = fieldWith(onsetSigma), ctx: WaveContext = { omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ };
      const w: ActiveWave = { arrivalS: 0, heightM: setWaveHeight(6), omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
      const tb0 = timeSinceOnset(f, w, 0, 0, ctx, P), t = sampleField(f, 0, 0).tau - (tb0 ?? 0) + 3;
      const entries = traceStations(f, [w], t, ctx, { cameraX: -25, cameraZ: 45, params: P, minHeightM: minRibbonHeight(fieldBreakingHeight(f, P), P), spacingM: 1 });
      const line = entries.filter((e): e is Station => !e.gap);
      for (const sigma of [4, 2]) {
        const ph = phases(line, f.periodS, sigma);
        // The north side: from the station with the largest tb toward falling z.
        let top = 0;
        line.forEach((s, i) => { if (s.tb !== null && Number.isFinite(s.tb) && (line[top].tb === null || !Number.isFinite(line[top].tb!) || s.tb > line[top].tb!)) top = i; });
        const dir = top + 1 < line.length && line[top + 1].z < line[top].z ? 1 : -1;
        let at1 = -1, at45 = -1;
        for (let i = top; i >= 0 && i < line.length; i += dir) {
          if (at1 < 0 && ph[i] < 1 - 1e-3) at1 = i;
          if (at45 < 0 && ph[i] <= 0.45) { at45 = i; break; }
        }
        const width = at1 >= 0 && at45 >= 0 ? Math.abs(line[at45].arc - line[at1].arc) : NaN;
        out.push('', `## onset σ ${onsetSigma} m, station σ ${sigma} m: the curl's width ${width.toFixed(1)} m (phase 1 → 0.45)`);
        const rows: string[] = [];
        for (let i = 0; i < line.length; i++) {
          if (at45 < 0 || Math.abs(line[i].arc - line[at45].arc) > 20) continue;
          rows.push(`${line[i].arc.toFixed(1)} ${line[i].tb === null ? '-' : line[i].tb!.toFixed(2)} ${ph[i].toFixed(3)}`);
        }
        out.push(...rows);
        console.log(`onset σ ${onsetSigma}, station σ ${sigma}: width ${width.toFixed(1)} m`);
      }
    }
    writeFileSync('docs/superpowers/evidence/one-curl/t4-smoothing.txt', out.join('\n') + '\n');
  });
});
