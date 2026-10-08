// one-curl Task 5: capture moments for 6, 8, 12 ft (15 s, 225°, tide 0): the biggest wave of the first set after 300 s, the
// sim time its peak section breaks (game field), and the moment JSON (base64) for tools/captureMoments.mjs. npx node tools/_curlMoments.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { module: ct } = await runnerImport<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const { module: sm } = await runnerImport<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const { module: sets } = await runnerImport<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { module: cd } = await runnerImport<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const f = rf.computeReefField({ bed: bathy.downsample(bathy.buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M });
const ctx = { omega: f.omega, travelX: f.far.dirX, travelZ: f.far.dirZ };
for (const ft of [6, 8, 12]) {
  const c = cd.cloneConditions(cd.DEFAULT_CONDITIONS);
  c.swell.sizeFt = ft; c.swell.periodS = 15; c.swell.directionDeg = 225; c.tideM = 0;
  let waves: ReturnType<typeof sets.wavesOfSet> = [];
  for (let slot = 1; slot < 200; slot++) { waves = sets.wavesOfSet(slot, c, sets.DEFAULT_SET_PARAMS); if (waves.length && waves[0].arrivalS > 300) break; }
  const big = waves.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const w = sm.toActiveWave(big);
  const tb = ct.timeSinceOnset(f, w, 0, 0, ctx, br.DEFAULT_BREAK_PARAMS) ?? 0;
  const peak = big.arrivalS + rf.sampleField(f, 0, 0).tau - tb;
  console.log(JSON.stringify({ ft, arrivalS: +big.arrivalS.toFixed(2), heightM: +big.heightM.toFixed(2), peakBreakS: +peak.toFixed(2), conditions: c }));
}
