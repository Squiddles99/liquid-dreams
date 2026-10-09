// shelf-polish Task 2: the reefField test "until carries the hold back along its ray" on the real shelf: for each failing
// held node (peel 1.7 field, as the test), its place, its hold, the holds of the nodes one cell either side across its ray,
// and the error one cell back. `npx tsx tools/_untilJumps.ts`
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const tf = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const wr = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { bed, coast } = tf.reefBeds(2);
const f = rf.computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, peel: 1.7, coast });
const R = br.ONSET_RECORD_LENGTH, U = br.ONSET_UNTIL_OFFSET, { nx, cellM, x0, z0 } = f.grid;
const [a, b] = [wr.NORTH_LEDGE[0], wr.NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
const hold = (i: number, k: number) => (f.onset[i * R] >= br.ONSET_LEVEL_Q[k] ? -f.onset[i * R + 1 + 2 * k] : NaN);
let n = 0;
for (let i = 0; i < f.tau.length; i++) {
  const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
  const s = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
  const off = Math.abs((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len;
  if (s < 5 || s > 80 || off > 3) continue;
  for (let k = 0; k < br.ONSET_LEVELS; k++) {
    if (!(f.onset[i * R] >= br.ONSET_LEVEL_Q[k] && f.onset[i * R + 1 + 2 * k] < -0.2)) continue;
    const u0 = f.onset[i * R + U + k], bx = x - f.dirX[i] * cellM, bz = z - f.dirZ[i] * cellM;
    const rec = rf.sampleOnset(f, bx, bz)!;
    if (rec[0] >= br.ONSET_LEVEL_Q[k]) continue;
    const err = rec[U + k] - u0 - (f.tau[i] - rf.sampleField(f, bx, bz).tau);
    n++;
    if (Math.abs(err) < 0.02) continue;
    // across the ray: the nodes one cell either side (rounded)
    const px = -f.dirZ[i], pz = f.dirX[i];
    const side = [-1, 1].map((d) => { const j = Math.round((z + pz * d * cellM - z0) / cellM) * nx + Math.round((x + px * d * cellM - x0) / cellM); return hold(j, k); });
    console.log(`node ${i} (${x.toFixed(1)}, ${z.toFixed(1)}) s ${s.toFixed(1)} m level ${k}: hold ${hold(i, k).toFixed(3)} s, across the ray ${side.map((v) => v.toFixed(3)).join(' / ')} | err 1 cell back ${err.toFixed(3)} s`);
  }
}
console.log(`${n} checks`);
