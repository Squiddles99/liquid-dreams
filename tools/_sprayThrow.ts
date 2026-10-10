// shelf-polish Task 4: sprayEmitters.test's mid-throw count over time (its own field: uncoasted, unsmoothed; 4 ft default
// set's biggest), to see where the throw is on the real shelf. npx tsx tools/_sprayThrow.ts [--ft=4]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const sw = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { DEFAULT_SET_PARAMS, wavesNear, wavesOfSet } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const se = await imp<typeof import('../src/whitewater/sprayEmitters')>('/src/whitewater/sprayEmitters.ts');
const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = Number(arg('ft') ?? DEFAULT_CONDITIONS.swell.sizeFt);
const field = rf.computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 } as never);
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const B = wavesOfSet(1, c, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const MIN_H = ct.minRibbonHeight(sw.fieldBreakingHeight(field, P), P);
console.log(`${c.swell.sizeFt} ft biggest ${B.heightM.toFixed(2)} m arrives ${B.arrivalS.toFixed(2)}`);
for (let dt = -3; dt <= 6; dt += 0.3) {
  const t = B.arrivalS + dt;
  const e = se.sprayEmitters({ field, ctx, events: wavesNear(t, c, DEFAULT_SET_PARAMS), t, params: P, minHeightM: MIN_H, wind: { speedMs: 22 / 3.6, fromDeg: 57 }, tideM: 0, amount: 1 });
  const own = e.filter((x) => x.waveId === B.id);
  console.log(`dt ${dt.toFixed(1)}: ${e.length} emitters (${own.length} of the biggest)${own.length ? ` at ${own.slice(0, 6).map((x) => `(${x.x.toFixed(0)},${x.z.toFixed(0)})`).join(' ')}` : ''}`);
}
