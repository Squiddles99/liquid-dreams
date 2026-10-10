// level-read Task 1 (the run's age it printed then is gone with candidate A): the record at the seam's corner nodes and the history of their rays. The crestTrace test's game field
// (as tools/_curlSeams.ts builds it). Per station (x, z): the four corner nodes' run, tb5/tb6, D5/D6 and own ratio; then
// each corner's ray walked back 1 m at a time (own amp/hminBreak, run, tb5, tb6) until level 5 is unbroken.
// `npx tsx tools/_levelRead.ts --at=0.7,191.3 [--at=1.3,192.1] [--k=5] [--every=2]`
import { runnerImport } from 'vite';
const ats = process.argv.filter((a) => a.startsWith('--at=')).map((a) => a.slice(5).split(',').map(Number));
const argN = (n: string, d: number) => Number(process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d);
const K = argN('k', 5), EVERY = argN('every', 2);
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const tf = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { bed, coast } = tf.reefBeds(2);
const game = rf.computeReefField({ bed, coast, periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M });
const g = game.grid, R = br.ONSET_RECORD_LENGTH, D = br.ONSET_DELAY_OFFSET;
const node = (i: number) => {
  const r = game.onset.subarray(i * R, (i + 1) * R), own = game.hminBreak[i] > 0 ? game.amp[i] / game.hminBreak[i] : 0;
  return `run ${r[0].toFixed(3)} own ${own.toFixed(3)} tb${K} ${r[1 + 2 * K].toFixed(2)} tb${K + 1} ${r[3 + 2 * K].toFixed(2)} D ${r[D + K].toFixed(2)}/${r[D + K + 1].toFixed(2)} tau ${game.tau[i].toFixed(2)}`;
};
console.log(`# Q${K} ${br.ONSET_LEVEL_Q[K].toFixed(4)} Q${K + 1} ${br.ONSET_LEVEL_Q[K + 1].toFixed(4)}`);
for (const [x, z] of ats) {
  const fx = (x - g.x0) / g.cellM, fz = (z - g.z0) / g.cellM, c = Math.floor(fx), r = Math.floor(fz);
  const rec = rf.sampleOnset(game, x, z)!;
  console.log(`station (${x}, ${z}): sampled run ${rec[0].toFixed(3)} tb${K} ${rec[1 + 2 * K].toFixed(2)} tb${K + 1} ${rec[3 + 2 * K].toFixed(2)}; cell (${c}, ${r}) w (${(fx - c).toFixed(2)}, ${(fz - r).toFixed(2)})`);
  for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = (r + dr) * g.nx + c + dc;
    console.log(`  corner (${g.x0 + (c + dc) * g.cellM}, ${g.z0 + (r + dr) * g.cellM}): ${node(i)}`);
    // Walk back along the ray (the node's direction), nearest node every EVERY m.
    let px = g.x0 + (c + dc) * g.cellM, pz = g.z0 + (r + dr) * g.cellM;
    for (let b = EVERY; b <= 80; b += EVERY) {
      const d = rf.sampleField(game, px, pz);
      px -= EVERY * d.dirX; pz -= EVERY * d.dirZ;
      const j = Math.round((pz - g.z0) / g.cellM) * g.nx + Math.round((px - g.x0) / g.cellM);
      const t = game.onset[j * R + 1 + 2 * K];
      console.log(`    ${String(b).padStart(3)} m back (${px.toFixed(1)}, ${pz.toFixed(1)}): ${node(j)}`);
      if (game.onset[j * R] < br.ONSET_LEVEL_Q[K] && t === 0) break;
    }
  }
}
