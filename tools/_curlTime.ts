// one-curl Task 2: the reef field's bake time as the game bakes it (smooth, refraction floor). npx node tools/_curlTime.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const bed = bathy.downsample(bathy.buildBathymetry(), 2);
const ms: number[] = [];
for (let i = 0; i < 4; i++) {
  const t = performance.now();
  rf.computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, peel: 1, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M });
  ms.push(performance.now() - t);
}
console.log(`computeReefField: ${ms.map((m) => m.toFixed(0)).join(', ')} ms (first is warm-up)`);
