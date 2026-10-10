// whitewater Task 6 probe: when the default set's biggest wave stands as a wall ahead of its break (tb null, until
// finite, wallWeight > 0.6) along the spray's trace. npx tsx tools/_featherProbe.ts
import { DEFAULT_BREAK_PARAMS as P } from '../src/breaker/breaking';
import { minRibbonHeight, traceStations } from '../src/breaker/crestTrace';
import { computeReefField } from '../src/breaker/reefField';
import { fieldBreakingHeight, toActiveWave } from '../src/breaker/setWaveModel';
import { wallWeight } from '../src/breaker/wombSection';
import { DEFAULT_CONDITIONS } from '../src/conditions/defaults';
import { buildBathymetry, downsample } from '../src/seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } from '../src/swell/sets';
const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const B = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const MIN_H = minRibbonHeight(fieldBreakingHeight(field, P), P);
for (let dt = -8; dt <= 8; dt += 1) {
  const t = B.arrivalS + dt, waves = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave);
  const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: MIN_H, spacingM: 3 }).filter((s) => !s.gap) as any[];
  const nul = st.filter((s) => s.tb === null), fin = nul.filter((s) => s.until !== null && Number.isFinite(s.until));
  const wall = fin.filter((s) => wallWeight(s.until) > 0.6);
  console.log(`dt ${dt}: live ${st.length}, tb null ${nul.length}, until finite ${fin.length}, wall>0.6 ${wall.length}, untils ${fin.slice(0, 5).map((s) => s.until.toFixed(1)).join(',')}`);
}

// The drawn crest vs its cheap estimates at the standing stations, 2 s before the arrival.
import { breakOptions, sumWaves } from '../src/breaker/setWaveModel';
import { sampleField } from '../src/breaker/reefField';
import { CREST_KNOT, profileKnots } from '../src/breaker/wombProfile';
import { SWELL_CURL_U, curlWeight, sectionFrame, sectionScale } from '../src/breaker/wombSection';
{
  const t = B.arrivalS - 2, waves = wavesNear(t, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS).map(toActiveWave);
  const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const };
  const st = traceStations(field, waves, t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM: MIN_H, spacingM: 3 }).filter((s: any) => !s.gap && s.tb === null && s.until !== null && Number.isFinite(s.until) && wallWeight(s.until) > 0.6) as any[];
  for (const s of st) {
    const own = [waves[s.wave]];
    const base = (u: number): [number, number] => { const x = s.x + s.nx * u, z = s.z + s.nz * u, r = sumWaves(x, z, t, sampleField(field, x, z), own, ctx, o); return [u + r.dx * s.nx + r.dz * s.nz, r.eta]; };
    const f = sectionFrame(s.section, s.H, s.c, base), q = s.section;
    const kc = profileKnots(q.phase, q.hollow)[CREST_KNOT][1];
    console.log(`H ${s.H.toFixed(2)} A ${q.A.toFixed(2)} (sectionScale ${sectionScale(s.H).toFixed(2)}) phase ${q.phase.toFixed(2)} g ${curlWeight(q).toFixed(2)} | crest ${f.crest[1].toFixed(2)} | A·k ${(q.A * kc).toFixed(2)} | sheet@crestHome ${base(q.A * SWELL_CURL_U[0])[1].toFixed(2)} | sheet@0 ${base(0)[1].toFixed(2)} | max eta ±2A ${Math.max(...Array.from({ length: 41 }, (_, i) => base((i - 20) * q.A * 0.1)[1])).toFixed(2)}`);
  }
}
