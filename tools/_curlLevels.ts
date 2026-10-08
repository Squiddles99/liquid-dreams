// one-curl Task 2 probe: nodes where a higher level's time since onset exceeds the level below's. npx node tools/_curlLevels.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const f = rf.computeReefField({ bed: bathy.downsample(bathy.buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
const R = br.ONSET_RECORD_LENGTH, D = br.ONSET_DELAY_OFFSET, L = br.ONSET_LEVELS, { nx, x0, z0, cellM } = f.grid;
const bad: [number, number, number][] = [];
for (let i = 0; i < f.tau.length; i++) for (let k = 1; k < L; k++) {
  const d = f.onset[i * R + 1 + 2 * k] - f.onset[i * R + 1 + 2 * (k - 1)];
  if (d > 1e-3 && f.onset[i * R] >= br.ONSET_LEVEL_Q[k]) bad.push([d, i, k]);
}
bad.sort((a, b) => b[0] - a[0]);
console.log(`${bad.length} inversions`);
for (const [d, i, k] of bad.slice(0, 8)) {
  const tb = (j: number) => f.onset[i * R + 1 + 2 * j].toFixed(2), dl = (j: number) => f.onset[i * R + D + j].toFixed(2);
  console.log(`(${x0 + (i % nx) * cellM}, ${z0 + Math.floor(i / nx) * cellM}) k ${k}: +${d.toFixed(2)} s; run ${f.onset[i * R].toFixed(3)} q ${br.ONSET_LEVEL_Q[k - 1].toFixed(3)}/${br.ONSET_LEVEL_Q[k].toFixed(3)}; tb ${tb(k - 1)}/${tb(k)} delay ${dl(k - 1)}/${dl(k)} fixed ${f.fixed?.[i]}`);
}
// Where the curl holds (delay > 0.05 s) at each level, by stretch of reef.
{
  const zones: [string, (x: number, z: number) => boolean][] = [['north z<0', (_x, z) => z < 0], ['south 0≤z<150', (_x, z) => z >= 0 && z < 150], ['south z≥150', (_x, z) => z >= 150]];
  for (const k of [3, 4, 5, 6, 7]) {
    const row: string[] = [];
    for (const [name, inZ] of zones) {
      let held = 0, broken = 0, capped = 0, maxD = 0;
      for (let i = 0; i < f.tau.length; i++) {
        const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
        if (!inZ(x, z) || f.onset[i * R] < br.ONSET_LEVEL_Q[k]) continue;
        broken++;
        const d = f.onset[i * R + D + k];
        if (d > 0.05) held++;
        if (d >= 6 - 1e-3) capped++;
        maxD = Math.max(maxD, d);
      }
      row.push(`${name}: ${(100 * held / Math.max(1, broken)).toFixed(1)}% held, ${(100 * capped / Math.max(1, broken)).toFixed(1)}% capped, max ${maxD.toFixed(2)} s`);
    }
    console.log(`level ${k}: ${row.join(' | ')}`);
  }
}
// Level 5 along z (10 m bins, z −60..260): the earliest physical onset (τ − tb − delay) and the earliest curl time (τ − tb)
// among broken nodes within 30 m inshore of the ledges (x ≤ 45).
{
  const k = 5, bins = new Map<number, [number, number]>();
  for (let i = 0; i < f.tau.length; i++) {
    const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
    if (z < -60 || z > 260 || x > 45 || f.onset[i * R] < br.ONSET_LEVEL_Q[k]) continue;
    const tbS = f.onset[i * R + 1 + 2 * k], d = f.onset[i * R + D + k], b = Math.round(z / 10) * 10;
    const cur = bins.get(b) ?? [Infinity, Infinity];
    bins.set(b, [Math.min(cur[0], f.tau[i] - tbS - d), Math.min(cur[1], f.tau[i] - tbS)]);
  }
  console.log('level 5, z: physical / curl (earliest in bin, s)');
  console.log([...bins.entries()].sort((a, b) => b[0] - a[0]).map(([z, [p, c]]) => `${z}:${p.toFixed(1)}/${c.toFixed(1)}`).join('  '));
}
