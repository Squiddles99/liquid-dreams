// Fable probe: does a small set break at the Womb at low tide? 3.5 ft, 13 s, 225°, tide -1.5 (Andrew's link) and variants.
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { REFRACT_FLOOR_M, computeReefField, sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { DEFAULT_BREAK_PARAMS: P, breakingRatio } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { fieldSteepeningHeight, fieldBreakingHeight } = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const { setWaveHeight, leftStretches } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { NORTH_LEDGE } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const bed = downsample(buildBathymetry(), 2), coast = buildCoastMap(bed, DEFAULT_COAST_PARAMS);
for (const [ft, periodS, tideM] of [[3, 13, -0.5], [3.5, 13, -0.5], [4, 13, -0.5], [4, 15, 0], [3.5, 13, 0.5]] as [number, number, number][]) {
  const H = setWaveHeight(ft);
  for (const withCoast of [false]) {
    const f = computeReefField({ bed, periodS, fromDeg: 225, tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M, ...(withCoast ? { coast } : {}) });
    const s = sampleField(f, 0, 0), ratio = breakingRatio(H * s.amp, s.hminBreak, P);
    const st = leftStretches(f, H, NORTH_LEDGE, { first: [0], second: [1] }, P).first; const st2 = leftStretches(f, H, NORTH_LEDGE, { first: [0], second: [1] }, P).second;
    console.log(`${ft} ft ${periodS} s tide ${tideM} ${withCoast ? 'coast' : 'far  '}: H ${H.toFixed(2)} m, peak amp ${s.amp.toFixed(2)} depth ${s.depth.toFixed(2)} hminBreak ${s.hminBreak.toFixed(2)} ratio ${ratio.toFixed(2)}; steepening ${fieldSteepeningHeight(f, P).toFixed(2)} breaking ${fieldBreakingHeight(f, P).toFixed(2)}; first leg ${st ? `${st.broken}/${st.of} broken, start ${st.start?.toFixed(1)} s, peel ${st.peel?.toFixed(1)}, hollow ${st.hollow?.toFixed(2)}` : 'none'}; second ${st2 ? `peel ${st2.peel?.toFixed(1)}` : 'none'}`);
  }
}
