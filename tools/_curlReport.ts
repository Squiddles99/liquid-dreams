// one-curl Task 3: the reef's clock after the curl and the unwarped ledge. At 6, 8 and 12 ft, mid tide, curlMaxMs 20 and
// 12: the left's stretches (reefReport.leftStretches) and the share of first-leg onset nodes held, and held to the cap.
// npx node tools/_curlReport.ts
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { module: rr } = await runnerImport<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { module: wr } = await runnerImport<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const bed = bathy.downsample(bathy.buildBathymetry(), 2), P = br.DEFAULT_BREAK_PARAMS;
const R = br.ONSET_RECORD_LENGTH, D = br.ONSET_DELAY_OFFSET;
const [a, b] = [wr.NORTH_LEDGE[0], wr.NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
console.log('ft  curl  | first: peel m/s, hollow, broke t | second: peel, hollow | first-leg onset nodes (≤ 30 m inshore of the ledge): held > 0.05 s, at the cap');
for (const v of (process.env.CURL_V ?? "20,12").split(",").map(Number)) {
  const f = rf.computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, peel: 1, curlMaxMs: v, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M });
  const { nx, cellM, x0, z0 } = f.grid;
  for (const ft of [6, 8, 12]) {
    const H = rr.setWaveHeight(ft);
    const st = rr.leftStretches(f, H, wr.NORTH_LEDGE, { first: [0], second: [1] }, P);
    const k = Math.floor(Math.log(1 / (H * br.onsetGain(P) * br.ONSET_LEVEL_Q0)) / Math.log(br.ONSET_LEVEL_RATIO)), q = br.ONSET_LEVEL_Q[k];
    let n = 0, held = 0, capped = 0;
    for (let i = 0; i < f.tau.length; i++) {
      if (f.onset[i * R] < q) continue;
      const x = x0 + (i % nx) * cellM, z = z0 + Math.floor(i / nx) * cellM;
      const s = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len, off = ((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len;
      if (s < 0 || s > len || off < -30 || off > 30) continue;
      const back = rf.sampleOnset(f, x - f.dirX[i] * cellM, z - f.dirZ[i] * cellM);
      if (!back || back[0] >= q) continue; // an onset node: broken here, not one cell back along its ray
      n++;
      const d = f.onset[i * R + D + k];
      if (d > 0.05) held++;
      if (d >= rf.PEEL_MAX_HOLD_S - 1e-3) capped++;
    }
    const fmt = (r: typeof st.first) => (r ? `${r.peel.toFixed(1)}, ${r.hollow.toFixed(2)}, ${r.start.toFixed(1)}–${r.end.toFixed(1)} s` : 'none');
    console.log(`${String(ft).padStart(2)}  ${String(v).padStart(4)}  | ${fmt(st.first)} | ${st.second ? `${st.second.peel.toFixed(1)}, ${st.second.hollow.toFixed(2)}` : 'none'} | level ${k}: ${n} nodes, ${(100 * held / Math.max(1, n)).toFixed(1)}% held, ${(100 * capped / Math.max(1, n)).toFixed(1)}% capped`);
  }
}
