// womb-retune Task 6 item 7: the seabed and material around a world point (the quads in the stand frame).
// npx node tools/_bedAround.ts <x> <z> [half=30] [step=3]
import { runnerImport } from 'vite';
const { buildBathymetry, bedHeightAt, bedMaterialAt } = (await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts')).module;
const [x0, z0, half = 30, step = 3] = process.argv.slice(2).map(Number);
const b = buildBathymetry();
for (let z = z0 - half; z <= z0 + half; z += step) {
  let row = `${String(z).padStart(5)} |`;
  for (let x = x0 - half; x <= x0 + half; x += step) row += ` ${bedHeightAt(b, x, z).toFixed(1).padStart(5)}`;
  console.log(row);
}
console.log('x:', Array.from({ length: Math.floor((2 * half) / step) + 1 }, (_, i) => x0 - half + i * step).join(' '));
console.log('material at centre', bedMaterialAt(b, x0, z0));
