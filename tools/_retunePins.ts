// womb-retune Task 3: the numbers the reef tests pin, on the game's field (testField.coastReefField). Per offered band
// (Solid…Huge, 225°) × the select's tides: the first leg (peel, hollow, start), the inside (leg 1) peel, the right (south
// ledge legs 0, 1) peel, the first break (depth, metres seaward of the tip); and the arrival bearing 30 m seaward of the tip.
// npx node tools/_retunePins.ts [out.txt] [--tides=-0.5,-0.25,0,0.5] [--bands=Solid,Pumping,Big,Huge]
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { coastReefField } = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const { sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { setWaveHeight, leftStretches, firstBreakDepth } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { NORTH_LEDGE, SOUTH_LEDGE, TIP } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { SWELL_BANDS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const tides = (arg('tides') ?? '-0.5,-0.25,0,0.5').split(',').map(Number), labels = (arg('bands') ?? 'Solid,Pumping,Big,Huge').split(',');
const f1 = (v: number | undefined, d = 1) => (v === undefined || !Number.isFinite(v) ? '  –  ' : v.toFixed(d).padStart(5));
const lines: string[] = ['band     tide  | first: peel hollow start broken | inside peel | right r0 r1 | fb depth, m seaward | bearing@(tip−30,30)'];
for (const label of labels) {
  const b = SWELL_BANDS.find((x) => x.label === label)!, H = setWaveHeight(b.ft);
  for (const tideM of tides) {
    const f = coastReefField({ periodS: b.periodS, tideM });
    const st = leftStretches(f, H, NORTH_LEDGE, { first: [0], inside: [1] }, P), rt = leftStretches(f, H, SOUTH_LEDGE, { r0: [0], r1: [1] }, P);
    const fb = firstBreakDepth(f, H, P), s = sampleField(f, TIP[0] - 30, TIP[1] + 30), bearing = (Math.atan2(s.dirX, -s.dirZ) * 180) / Math.PI;
    const a = st.first;
    const line = `${label.padEnd(8)} ${tideM.toFixed(2).padStart(5)} | ${f1(a?.peel)} ${f1(a?.hollow, 2)} ${f1(a?.start)} ${a ? `${a.broken}/${a.of}` : '–'} | ${f1(st.inside?.peel)} | ${f1(rt.r0?.peel)} ${f1(rt.r1?.peel)} | ${f1(fb?.depth)} ${f1(fb?.d)} | ${bearing.toFixed(1)}`;
    lines.push(line); console.log(line);
  }
}
const out = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (out) writeFileSync(out, lines.join('\n') + '\n');
