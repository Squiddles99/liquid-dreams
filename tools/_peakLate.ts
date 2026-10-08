// one-curl Task 3: when the biggest 6 ft wave first reads as breaking at the peak (peakFace), relative to its arrival.
// npx node tools/_peakLate.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { module: pf } = await runnerImport<typeof import('../src/breaker/peakFace')>('/src/breaker/peakFace.ts');
const { module: sets } = await runnerImport<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { module: cd } = await runnerImport<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const f = rf.computeReefField({ bed: bathy.downsample(bathy.buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const c = cd.cloneConditions(cd.DEFAULT_CONDITIONS); c.swell.sizeFt = 6;
const big = sets.wavesOfSet(1, c, sets.DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const rows: string[] = [];
for (let dt = -0.5; dt <= 1.5001; dt += 0.1) {
  const t = big.arrivalS + dt, face = pf.peakFace(f, sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS), t, br.DEFAULT_BREAK_PARAMS);
  rows.push(`${dt.toFixed(1)}: ${face ? `${face.faceM.toFixed(1)} m stage ${face.stage.toFixed(2)}` : 'null'}`);
}
console.log(rows.join(' | '));
