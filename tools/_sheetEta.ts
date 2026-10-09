// womb-retune Task 6 item 7: the sheet's height (sumWaves, the CPU twin of SetWaves) over a box at one sim time; prints
// the lowest points (the stand frame's "quads" past the ribbon's end). npx node tools/_sheetEta.ts <t> <x0> <x1> <z0> <z1> [ft=7] [T=15]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesNear } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { breakOptions, sumWaves, toActiveWave } = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const { sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { coastReefField } = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const [t, x0, x1, z0, z1, ft = 7, T = 15, step = 1] = process.argv.slice(2).map(Number);
const grid = process.argv.includes('--grid');
const c = cloneConditions(DEFAULT_CONDITIONS);
c.swell.sizeFt = ft; c.swell.periodS = T; c.swell.directionDeg = 225; c.tideM = 0;
const field = coastReefField({ periodS: T, fromDeg: 225, tideM: 0, peel: true });
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave), o = breakOptions(field, P);
const pts: [number, number, number][] = [];
for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
  const eta = sumWaves(x, z, t, sampleField(field, x, z), waves, ctx, o).eta;
  pts.push([x, z, eta]);
}
if (grid) console.log(JSON.stringify(pts.map((p) => [p[0], p[1], +p[2].toFixed(2)])));
pts.sort((a, b) => a[2] - b[2]);
console.log('lowest', pts.slice(0, 12).map((p) => `(${p[0]},${p[1]}) ${p[2].toFixed(2)}`).join('  '));
console.log('highest', pts.slice(-6).map((p) => `(${p[0]},${p[1]}) ${p[2].toFixed(2)}`).join('  '));
