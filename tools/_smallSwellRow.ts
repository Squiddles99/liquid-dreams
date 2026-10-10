// level-read Task 5: the small-swell matrix test's first-leg numbers (broken/of, start s, peel m/s, hollow) for a band x
// tide on the game field, as src/breaker/smallSwell.test.ts measures them. `npx tsx tools/_smallSwellRow.ts --band=Solid --tide=0.5`
import { runnerImport } from 'vite';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const wr = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const ss = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const rr = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const tf = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const b = ss.SWELL_BANDS.find((x) => x.label === (arg('band') ?? 'Solid'))!, tideM = Number(arg('tide') ?? 0.5);
const first = rr.leftStretches(tf.coastReefField({ periodS: b.periodS, tideM }), rr.setWaveHeight(b.ft), wr.NORTH_LEDGE, { first: [0] }, br.DEFAULT_BREAK_PARAMS).first!;
console.log(`${b.label} tide ${tideM}: ${first.broken}/${first.of}, start ${first.start.toFixed(3)}, peel ${first.peel.toFixed(3)}, hollow ${first.hollow.toFixed(4)}`);
