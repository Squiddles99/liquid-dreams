// shelf-polish Task 2: where one curl, one clock breaks on the real shelf. The crestTrace test's game field (coast-seeded,
// smoothed, the refraction floor), the biggest set wave at --ft; at peak + dt the stations either side of the curl, and
// every step where tb grows away from the curl (or until shrinks ahead of it) with its place: distance from the TIP, from
// the ledge's turn north (TURN), its station numbers. `npx tsx tools/_curlSeams.ts [--ft=6] [--dt=1,3,6] [--around=175,200]`
import { runnerImport } from 'vite';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ft = Number(arg('ft') ?? 6), dts = (arg('dt') ?? '1,3,6').split(',').map(Number);
const around = arg('around')?.split(',').map(Number) ?? null;
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const tf = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const sw = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const rr = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const wr = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const P = br.DEFAULT_BREAK_PARAMS;
const { bed, coast } = tf.reefBeds(2);
const dbg: import('../src/breaker/reefField').OnsetDebug = {};
const game = rf.computeReefField({ bed, coast, periodS: 15, fromDeg: 225, tideM: 0, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M, onsetDebug: dbg });
const ctx = { omega: game.omega, travelX: game.far.dirX, travelZ: game.far.dirZ };
const plain = rf.computeReefField({ bed, coast, periodS: 15, fromDeg: 225, tideM: 0 });
const MIN_H = ct.minRibbonHeight(sw.fieldBreakingHeight(plain, P), P);
const [PX, PZ] = wr.TIP, TURN = wr.NORTH_LEDGE[1], LINEUP: [number, number] = [PX - 25, PZ + 45];
const w = { arrivalS: 0, heightM: rr.setWaveHeight(ft), omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 };
const tb0 = ct.timeSinceOnset(game, w, PX, PZ, ctx, P), peak = w.arrivalS + rf.sampleField(game, PX, PZ).tau - (tb0 ?? 0);
const KLO = ((): number => { const g = w.heightM * br.onsetGain(P), lq = Math.log(1 / (g * br.ONSET_LEVEL_Q[0])) / Math.log(br.ONSET_LEVEL_Q[1] / br.ONSET_LEVEL_Q[0]); console.log(`# level lq ${lq.toFixed(3)} (k = ${Math.floor(lq)} and k + 1 blended)`); return Math.floor(lq); })();
console.log(`# ${ft} ft, H ${w.heightM.toFixed(2)} m, peak broke ${peak.toFixed(3)} s; TIP (${PX}, ${PZ}), TURN (${TURN[0].toFixed(1)}, ${TURN[1].toFixed(1)})`);
/** The onset node of level k on the ray through (x, z): walk back against the ray 0.5 m at a time, up to 150 m, and take
 * the first node (of the 3 × 3 around the walk) where level k's onset time is set. */
function rayOnset(x: number, z: number, k: number): { line: number; T: number; Tc: number; x: number; z: number; back: number } | null {
  const g = game.grid, L = br.ONSET_LEVELS;
  for (let b = 0; b <= 150; b += 0.5) {
    const d = rf.sampleField(game, x, z);
    const c = Math.round((x - g.x0) / g.cellM), r = Math.round((z - g.z0) / g.cellM);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const i = (r + dr) * g.nx + c + dc;
      if (i >= 0 && i < g.nx * g.nz && Number.isFinite(dbg.onsetT![i * L + k])) return { line: dbg.line![i * L + k], T: dbg.onsetT![i * L + k], Tc: dbg.curlT![i * L + k], x, z, back: b };
    }
    x -= 0.5 * d.dirX; z -= 0.5 * d.dirZ;
  }
  return null;
}
const quiet = process.argv.includes('--quiet');
let violations = 0, worstTb = 0, worstAt = '';
const f2 = (v: number | null | undefined) => (v === null || v === undefined ? 'null' : Number.isFinite(v) ? v.toFixed(2) : String(v));
for (const dt of dts) {
  const entries = ct.traceStations(game, [w], peak + dt, ctx, { cameraX: LINEUP[0], cameraZ: LINEUP[1], params: P, minHeightM: MIN_H, spacingM: 1 });
  const runs: import('../src/breaker/crestTrace').Station[][] = [[]];
  for (const e of entries) { if (e.gap) runs.push([]); else runs[runs.length - 1].push(e); }
  for (const run of runs) {
    let top = -1;
    run.forEach((s, i) => { if (s.tb !== null && Number.isFinite(s.tb) && (top < 0 || s.tb > run[top].tb!)) top = i; });
    if (top < 0) continue;
    const c = run[top];
    console.log(`t + ${dt}: run of ${run.length}, arcs ${run[0].arc.toFixed(0)}..${run[run.length - 1].arc.toFixed(0)}, curl at arc ${c.arc.toFixed(0)} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) tb ${f2(c.tb)}`);
    const row = (s: import('../src/breaker/crestTrace').Station, why: string) => {
      const rec = rf.sampleOnset(game, s.x, s.z);
      const ons = [KLO, KLO + 1].map((k) => { const o = rayOnset(s.x, s.z, k); return o ? `k${k} line ${o.line % 100000} T ${o.T.toFixed(2)} T' ${o.Tc.toFixed(2)} @(${o.x.toFixed(0)},${o.z.toFixed(0)}) ${o.back.toFixed(0)} m back` : `k${k} -`; }).join(' | ');
      const recS = rec ? `tb${KLO} ${rec[1 + 2 * KLO].toFixed(2)} tb${KLO + 1} ${rec[3 + 2 * KLO].toFixed(2)} D${KLO} ${rec[br.ONSET_DELAY_OFFSET + KLO].toFixed(2)} q${KLO + 1} ${br.ONSET_LEVEL_Q[KLO + 1].toFixed(3)}` : '';
      console.log(`  ${recS} ::`);
      console.log(`  ${why.padEnd(6)} arc ${s.arc.toFixed(0).padStart(4)} (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) tip ${Math.hypot(s.x - PX, s.z - PZ).toFixed(0)} m turn ${Math.hypot(s.x - TURN[0], s.z - TURN[1]).toFixed(0)} m | tb ${f2(s.tb)} until ${f2(s.until)} H ${s.H.toFixed(2)} | run ${rec ? rec[0].toFixed(3) : '-'} || ${ons}`);
    };
    for (const dir of [1, -1]) {
      let prev = run[top], broken = true;
      for (let i = top + dir; i >= 0 && i < run.length; i += dir) {
        const s = run[i];
        let bad = '';
        if (broken && s.tb !== null && Number.isFinite(s.tb) && prev.tb !== null) { if (s.tb > prev.tb + 0.05) bad = 'TB'; }
        else if (s.tb === null) {
          if (!broken && s.until !== null && prev.until !== null && Number.isFinite(s.until) && Number.isFinite(prev.until) && s.until < prev.until - 0.05) bad = 'UNTIL';
          broken = false;
        }
        if (bad) {
          violations++;
          const jump = bad === 'TB' ? s.tb! - prev.tb! : prev.until! - s.until!;
          if (jump > worstTb) { worstTb = jump; worstAt = `t + ${dt} arcs ${prev.arc.toFixed(0)}/${s.arc.toFixed(0)} (${s.x.toFixed(0)}, ${s.z.toFixed(0)}) tip ${Math.hypot(s.x - PX, s.z - PZ).toFixed(0)} m ${bad}`; }
          if (!quiet) { row(prev, 'prev'); row(s, bad); }
          else console.log(`  ${bad} t + ${dt} arc ${prev.arc.toFixed(0)}->${s.arc.toFixed(0)} tip ${Math.hypot(s.x - PX, s.z - PZ).toFixed(0)} m: ${bad === 'TB' ? `tb ${f2(prev.tb)} -> ${f2(s.tb)}` : `until ${f2(prev.until)} -> ${f2(s.until)}`}`);
        }
        else if (around && s.arc >= around[0] && s.arc <= around[1]) row(s, '');
        prev = s;
      }
    }
  }
}
console.log(`# ${ft} ft: ${violations} violations over the whole trace (dt ${dts.join(',')}); worst ${worstTb.toFixed(2)} s at ${worstAt || '-'}`);

// --lines: per level, every breaking line of the bake (onset nodes, first break place and T, extent), and the nodes in
// --box=x0,x1,z0,z1 every --every m: their line, T, T′.
if (process.argv.includes('--lines')) {
  const L = br.ONSET_LEVELS, g = game.grid, { nx } = g;
  const kk = Number(arg('level') ?? -1);
  for (let k = 0; k < L; k++) {
    if (kk >= 0 && k !== kk) continue;
    const lines = new Map<number, { n: number; first: number; T0: number; x0: number; x1: number; z0: number; z1: number }>();
    for (let i = 0; i * L + k < dbg.line!.length && i < g.nx * g.nz; i++) {
      const l = dbg.line![i * L + k]; if (l < 0) continue;
      const T = dbg.onsetT![i * L + k], x = g.x0 + (i % nx) * g.cellM, z = g.z0 + Math.floor(i / nx) * g.cellM;
      const e = lines.get(l) ?? { n: 0, first: i, T0: Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      e.n++; if (T < e.T0) { e.T0 = T; e.first = i; }
      e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z);
      lines.set(l, e);
    }
    console.log(`level ${k} (q ${br.ONSET_LEVEL_Q[k].toFixed(3)}): ${lines.size} lines`);
    for (const [l, e] of [...lines].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
      const fx = g.x0 + (e.first % nx) * g.cellM, fz = g.z0 + Math.floor(e.first / nx) * g.cellM;
      console.log(`  line ${l}: ${e.n} nodes, x ${e.x0}..${e.x1}, z ${e.z0}..${e.z1}, first break (${fx}, ${fz}) T ${e.T0.toFixed(2)}`);
    }
    const box = arg('box')?.split(',').map(Number);
    if (box) {
      const ev = Number(arg('every') ?? 5);
      for (let z = box[2]; z <= box[3]; z += ev) {
        const cells: string[] = [];
        for (let x = box[0]; x <= box[1]; x += ev) {
          const i = Math.round((z - g.z0) / g.cellM) * nx + Math.round((x - g.x0) / g.cellM), l = dbg.line![i * L + k];
          cells.push(l < 0 ? '      .      ' : `${String(l % 1000).padStart(3)}:${dbg.onsetT![i * L + k].toFixed(1)}/${dbg.curlT![i * L + k].toFixed(1)}`.padStart(13));
        }
        console.log(`  z ${String(z).padStart(4)} ${cells.join(' ')}`);
      }
    }
  }
}
// --nodes=k,x0,x1,z0,z1: every level-k onset node in the box (x, z, line, T, T′, τ).
const nodesArg = arg('nodes')?.split(',').map(Number);
if (nodesArg) {
  const [k, x0, x1, z0, z1] = nodesArg, g = game.grid, L = br.ONSET_LEVELS;
  const rows: string[] = [];
  for (let i = 0; i < g.nx * g.nz; i++) {
    const T = dbg.onsetT![i * L + k]; if (!Number.isFinite(T)) continue;
    const x = g.x0 + (i % g.nx) * g.cellM, z = g.z0 + Math.floor(i / g.nx) * g.cellM;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    rows.push(`  (${x.toFixed(1)}, ${z.toFixed(1)}) line ${dbg.line![i * L + k]} T ${T.toFixed(2)} T' ${dbg.curlT![i * L + k].toFixed(2)} tau ${game.tau[i].toFixed(2)}`);
  }
  console.log(`level ${k} onset nodes in the box: ${rows.length}`); console.log(rows.join('\n'));
}
