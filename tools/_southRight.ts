// south-side (spec 2026-10-11-south-side-design.md): the right's ride (reefReport) at 6/8/10/12 ft, 225°, low/mid/high tide,
// on the game's field (testField.coastReefField). Legs of SOUTH_LEDGE: r0 (from the tip), r1 (the next), r01 (both).
// node tools/_southRight.ts
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { SOUTH_LEDGE } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { coastReefField } = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const { leftStretches, rideOf, setWaveHeight } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { DEFAULT_BREAK_PARAMS } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
console.log('SOUTH_LEDGE', JSON.stringify(SOUTH_LEDGE));
const fmt = (r: any) => (r ? `${rideOf(r).padEnd(10)} peel ${r.peel.toFixed(1).padStart(6)} m/s hollow ${r.hollow.toFixed(2)} broken ${r.broken}/${r.of}` : 'no break');
for (const [ft, periodS] of [[6, 14], [8, 15], [10, 16], [12, 17]] as const) {
  for (const tideM of [-0.5, 0, 0.5]) {
    const f = coastReefField({ periodS, tideM }), H = setWaveHeight(ft);
    const s = leftStretches(f, H, SOUTH_LEDGE, { r0: [0], r1: [1], r01: [0, 1] }, DEFAULT_BREAK_PARAMS);
    console.log(`${ft} ft ${periodS} s tide ${tideM.toFixed(2)}: r0 ${fmt(s.r0)} | r1 ${fmt(s.r1)} | r01 ${fmt(s.r01)}`);
  }
}
