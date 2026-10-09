// shelf-polish Task 2: where the bake holds nodes (tb < -0.2 s) within R m of the tip, per peel/field. Probe only.
// `npx tsx tools/_heldScan.ts [--peel=1] [--game] [--r=220]`
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const tf = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const wr = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}`));
const peel = Number(arg('peel')?.split('=')[1] ?? 1), game = !!arg('game'), floor = !!arg('floor'), RAD = Number(arg('r')?.split('=')[1] ?? 220);
const { bed, coast } = tf.reefBeds(2);
const f = rf.computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, peel, coast, ...(game ? { smooth: true } : {}), ...(game || floor ? { refractFloorM: rf.REFRACT_FLOOR_M } : {}) });
const R = br.ONSET_RECORD_LENGTH, U = br.ONSET_UNTIL_OFFSET, { nx, cellM, x0, z0 } = f.grid;
const [TX, TZ] = wr.TIP;
const perK = new Array(br.ONSET_LEVELS).fill(0), maxK = new Array(br.ONSET_LEVELS).fill(0);
let n = 0, checks = 0, jumps = 0, worst = 0, ident = 0;
const bad: string[] = [];
for (let i = 0; i < f.tau.length; i++) {
  const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
  if (Math.hypot(x - TX, z - TZ) > RAD) continue;
  for (let k = 0; k < br.ONSET_LEVELS; k++) {
    if (!(f.onset[i * R] >= br.ONSET_LEVEL_Q[k] && f.onset[i * R + 1 + 2 * k] < -0.2)) continue;
    const h = -f.onset[i * R + 1 + 2 * k];
    if (Math.abs(f.onset[i * R + U + k] - h) > 1e-4) ident++;
    n++; perK[k]++; maxK[k] = Math.max(maxK[k], h);
    const u0 = f.onset[i * R + U + k], bx = x - f.dirX[i] * cellM, bz = z - f.dirZ[i] * cellM;
    const rec = rf.sampleOnset(f, bx, bz);
    if (!rec || rec[0] >= br.ONSET_LEVEL_Q[k]) continue;
    const err = rec[U + k] - u0 - (f.tau[i] - rf.sampleField(f, bx, bz).tau);
    checks++; worst = Math.max(worst, Math.abs(err)); if (Math.abs(err) >= 0.02) { jumps++; if (bad.length < 6) bad.push(`(${x}, ${z}) k ${k} hold ${h.toFixed(2)} u0 ${u0.toFixed(2)} back ${rec[U + k].toFixed(2)} err ${err.toFixed(3)} d ${Math.hypot(x - TX, z - TZ).toFixed(0)} m`); }
  }
}
console.log(`peel ${peel}${game ? ' game' : ''} r ${RAD}: ${n} held (level: count/max s) ${perK.map((c, k) => `${k}:${c}/${maxK[k].toFixed(2)}`).join(' ')}; ${checks} one-cell-back checks, ${jumps} >= 0.02 s, worst ${worst.toFixed(3)}; until != hold at ${ident}`);
for (const b of bad) console.log('  ' + b);
