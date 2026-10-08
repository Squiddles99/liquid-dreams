// one-curl Task 2 probe: how a level's onset nodes split into breaking lines on the real field (6 ft, mid tide), by link
// radius; and the onset band's biggest gaps along the north ledge. npx node tools/_curlLines.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { module: rr } = await runnerImport<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const f = rf.computeReefField({ bed: bathy.downsample(bathy.buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const { nx, nz, cellM, x0, z0 } = f.grid, n = nx * nz, R = br.ONSET_RECORD_LENGTH;
const h6 = rr.setWaveHeight(6);
const k = Math.floor(Math.log(1 / (h6 * br.onsetGain(br.DEFAULT_BREAK_PARAMS) * br.ONSET_LEVEL_Q0)) / Math.log(br.ONSET_LEVEL_RATIO));
// Onset nodes: broken at level k here but not one cell back along the ray.
const q = br.ONSET_LEVEL_Q[k], onset: number[] = [];
for (let i = 0; i < n; i++) {
  if (f.onset[i * R] < q) continue;
  const x = x0 + (i % nx) * cellM - f.dirX[i] * cellM, z = z0 + Math.floor(i / nx) * cellM - f.dirZ[i] * cellM;
  const b = rf.sampleOnset(f, x, z);
  if (b && b[0] < q) onset.push(i);
}
console.log(`level ${k}, ${onset.length} onset nodes (approx.)`);
for (const rad of [3, 6, 10, 16]) {
  const parent = new Map<number, number>(onset.map((i) => [i, i]));
  const find = (i: number): number => { while (parent.get(i) !== i) i = parent.get(i)!; return i; };
  const set = new Set(onset);
  for (const i of onset) { const c = i % nx, r = Math.floor(i / nx); for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { const j = (r + dr) * nx + c + dc; if (set.has(j)) { const a = find(i), b = find(j); if (a !== b) parent.set(Math.max(a, b), Math.min(a, b)); } } }
  const sizes = new Map<number, number>();
  for (const i of onset) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1);
  const big = [...sizes.values()].sort((a, b) => b - a);
  console.log(`radius ${rad}: ${big.length} lines, sizes ${big.slice(0, 12).join(' ')}`);
}
for (const rad of [3, 10]) {
  const parent = new Map<number, number>(onset.map((i) => [i, i]));
  const find = (i: number): number => { while (parent.get(i) !== i) i = parent.get(i)!; return i; };
  const set = new Set(onset);
  for (const i of onset) { const c = i % nx, r = Math.floor(i / nx); for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { const j = (r + dr) * nx + c + dc; if (set.has(j)) { const a = find(i), b = find(j); if (a !== b) parent.set(Math.max(a, b), Math.min(a, b)); } } }
  const g = new Map<number, number[]>();
  for (const i of onset) { const r = find(i); if (!g.has(r)) g.set(r, []); g.get(r)!.push(i); }
  console.log(`-- radius ${rad}`);
  for (const nodes of g.values()) {
    const T = (i: number) => f.tau[i] - f.onset[i * R + 1 + 2 * k];
    const xs = nodes.map((i) => x0 + (i % nx) * cellM), zs = nodes.map((i) => z0 + Math.floor(i / nx) * cellM), ts = nodes.map(T);
    const m = ts.indexOf(Math.min(...ts));
    console.log(`  ${nodes.length} nodes, x ${Math.min(...xs)}..${Math.max(...xs)}, z ${Math.min(...zs)}..${Math.max(...zs)}, first break T ${ts[m].toFixed(2)} at (${xs[m]}, ${zs[m]}), last T ${Math.max(...ts).toFixed(2)}`);
  }
}
{
  const bins = new Map<number, number[]>();
  for (const i of onset) { const z = z0 + Math.floor(i / nx) * cellM; if (z < -230 || z > 300) continue; const b = Math.round(z / 10) * 10; if (!bins.has(b)) bins.set(b, []); bins.get(b)!.push(f.tau[i] - f.onset[i * R + 1 + 2 * k]); }
  console.log('-- onset T by z (10 m bins): min / max');
  console.log([...bins.entries()].sort((a, b) => b[0] - a[0]).map(([z, t]) => `${z}:${Math.min(...t).toFixed(1)}/${Math.max(...t).toFixed(1)}`).join('  '));
}
