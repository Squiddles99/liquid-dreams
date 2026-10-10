// shelf-polish Task 4: the breakingField bars on the real shelf, measured (the test's own field and helpers, copied).
// npx tsx tools/_breakerBars.ts --case=terrace|closure|peak|stall|pile|lift
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { NORTH_LEDGE, SOUTH_LEDGE, TIP } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { reefBeds } = await imp<typeof import('../src/breaker/testField')>('/src/breaker/testField.ts');
const { DEFAULT_SET_PARAMS, wavesOfSet } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { firstBreak, setWaveHeight } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const sw = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const P = br.DEFAULT_BREAK_PARAMS;
const field = rf.computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0, coast: reefBeds(2).coast } as never);
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const sheet0 = sw.breakOptions(field, P);
const sheet = process.argv.includes('--game') ? { ...sheet0, pile: false, shape: 'lean' as const } : sheet0;
const at = (x: number, z: number) => rf.sampleField(field, x, z);
const testWave = (heightM: number) => ({ arrivalS: 0, heightM, omega: ctx.omega, travelX: ctx.travelX, travelZ: ctx.travelZ, crestLengthM: 400, crestOffsetM: 0 });
function ray(px: number, pz: number, backM: number, aheadM: number) {
  const step = 0.5; let x = px, z = pz;
  for (let d = 0; d < backM; d += step) { const s = at(x, z); x -= s.dirX * step; z -= s.dirZ * step; }
  const out: { x: number; z: number; tau: number }[] = [];
  for (let d = 0; d <= backM + aheadM + 1e-9; d += step) { const s = at(x, z); out.push({ x, z, tau: s.tau }); x += s.dirX * step; z += s.dirZ * step; }
  return out;
}
const along = (line: readonly (readonly [number, number])[], metres: number): [number, number] => {
  const [a, b] = [line[0], line[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [a[0] + ((b[0] - a[0]) * metres) / len, a[1] + ((b[1] - a[1]) * metres) / len];
};
const c6 = cloneConditions(DEFAULT_CONDITIONS); c6.swell.sizeFt = 6;
const REF_BIGGEST = wavesOfSet(1, c6, DEFAULT_SET_PARAMS).reduce((a, b) => (b.heightM > a.heightM ? b : a));
const kase = arg('case') ?? 'terrace';
console.log(`TIP ${TIP}; NORTH_LEDGE ${JSON.stringify(NORTH_LEDGE)}; SOUTH ${JSON.stringify(SOUTH_LEDGE)}; 6 ft biggest ${REF_BIGGEST.heightM.toFixed(2)} m`);

if (kase === 'terrace') {
  const w = testWave(setWaveHeight(6));
  for (const up of [20, 40, 60, 80]) for (const dt of [-3, -2, -1]) {
    const [px, pz] = along(NORTH_LEDGE, up);
    const line = ray(px, pz, 70, 40), t = at(px, pz).tau + dt;
    const eta = line.map((p) => sw.sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, sheet).eta);
    const top = eta.indexOf(Math.max(...eta));
    let low = top; for (let j = top; j < eta.length; j++) if (eta[j] < eta[low]) low = j;
    let run = 0, worst = 0, worstEnd = -1;
    for (let j = top + 1; j <= low; j++) { const flat = eta[j - 1] - eta[j] < 0.02 && eta[j] - eta[low] > 0.25 * w.heightM; run = flat ? run + 1 : 0; if (run > worst) { worst = run; worstEnd = j; } }
    console.log(`up ${up} dt ${dt}: H ${w.heightM.toFixed(2)} top ${(top * 0.5 - 70).toFixed(1)} m (eta ${eta[top].toFixed(2)}) low ${(low * 0.5 - 70).toFixed(1)} m (${eta[low].toFixed(2)}) terrace ${(worst * 0.5).toFixed(1)} m ending ${(worstEnd * 0.5 - 70).toFixed(1)} m`);
    if (worst * 0.5 >= 3 || arg('dump')) {
      for (let j = top; j <= low; j += 2) { const f = at(line[j].x, line[j].z); console.log(`   s ${(j * 0.5 - 70).toFixed(1)} eta ${eta[j].toFixed(3)} depth ${f.depth.toFixed(2)} hminBreak ${f.hminBreak.toFixed(2)} hminLean ${f.hminLean.toFixed(2)} amp ${f.amp.toFixed(2)}`); }
    }
  }
}
if (kase === 'closure') {
  const w = testWave(REF_BIGGEST.heightM);
  for (const [lbl, [px, pz]] of [['tip', TIP], ['left 15', along(NORTH_LEDGE, 15)], ['left 30', along(NORTH_LEDGE, 30)]] as const) {
    const path = ray(px, pz, 60, 60).map((p) => ({ ...p, s: sw.crestStage(p.x, p.z, at(p.x, p.z).tau, at(p.x, p.z), w, ctx, sheet), d: at(p.x, p.z).depth }));
    const on = path.find((p) => p.s > 0), cl = path.find((p) => p.s >= 0.75);
    console.log(`${lbl}: onset tau ${on?.tau.toFixed(2)} depth ${on?.d.toFixed(2)} | closed tau ${cl?.tau.toFixed(2)} depth ${cl?.d.toFixed(2)} | closure ${on && cl ? (cl.tau - on.tau).toFixed(3) : '-'} s; H ${w.heightM.toFixed(2)}; landingEstimate ${br.landingEstimate(w.heightM, P).toFixed(2)}`);
  }
}
const onLeft = (s: number): [number, number] => along(NORTH_LEDGE, s).map((v) => Math.round(v * 10) / 10) as [number, number];
const fromTip = (x: number, z: number): [number, number] => [TIP[0] + x, TIP[1] + z];
const LEDGE_POINTS: [number, number][] = [...[0, 15, 30, 45, 60, 75].map(onLeft), fromTip(12.5, 14), fromTip(25, 28), fromTip(42, 33)];
function breakPoint(px: number, pz: number, w: ReturnType<typeof testWave>): [number, number] {
  const broken = (x: number, z: number) => { const r = rf.sampleOnset(field, x, z); return !!r && br.onsetTime(r, 0, w.heightM, P) !== null; };
  if (!broken(px, pz)) return [px, pz];
  let x = px, z = pz;
  for (let d = 0; d < 300; d += 0.5) { const s = at(x, z), nx = x - s.dirX * 0.5, nz = z - s.dirZ * 0.5; if (!broken(nx, nz)) break; x = nx; z = nz; }
  return [x, z];
}
if (kase === 'stall') {
  // As the test: the top of the highest water within 20 m of the crest, every 0.25 s; print each ledge point's runs of >= 3 stands.
  const w = testWave(REF_BIGGEST.heightM);
  for (const [lx, lz] of LEDGE_POINTS) {
    const [px, pz] = breakPoint(lx, lz, w), line = ray(px, pz, 30, 70), tau0 = at(px, pz).tau;
    let prev: number | null = null, stand = 0; const rows: string[] = [];
    for (let t = tau0 - 0.5; t <= tau0 + 6 + 1e-9; t += 0.25) {
      const eta = line.map((p) => sw.sumWaves(p.x, p.z, t, at(p.x, p.z), [w], ctx, sheet).eta);
      const j = line.findIndex((p) => p.tau >= t);
      if (j < 1 || j * 0.5 > 90) { prev = null; continue; }
      let hi = -1; for (let i = 0; i < line.length; i++) if (Math.abs(i - j) * 0.5 <= 20 && (hi < 0 || eta[i] > eta[hi])) hi = i;
      if (!(eta[hi] > 0.3)) { prev = null; continue; }
      const level = eta[hi] - 0.01 * Math.abs(eta[hi]); let lo = hi, up = hi;
      while (lo > 0 && Math.abs(lo - 1 - j) * 0.5 <= 20 && eta[lo - 1] >= level) lo--;
      while (up < line.length - 1 && Math.abs(up + 1 - j) * 0.5 <= 20 && eta[up + 1] >= level) up++;
      const top = (lo + up) / 2, cp = line[j], cc = sw.crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet);
      const v = prev === null ? NaN : ((top - prev) * 0.5) / 0.25;
      stand = v < 2 ? stand + 1 : 0;
      rows.push(`   t ${(t - tau0).toFixed(2)} crest ${(j * 0.5 - 30).toFixed(1)} top ${(top * 0.5 - 30).toFixed(1)} [${(lo * 0.5 - 30).toFixed(1)}..${(up * 0.5 - 30).toFixed(1)}] eta ${eta[hi].toFixed(2)} v ${v.toFixed(1)} stand ${stand} tb ${cc?.tb?.toFixed(2) ?? '-'} pile ${cc?.lc.pile?.toFixed(2) ?? '-'} depth ${at(line[Math.round(top)].x, line[Math.round(top)].z).depth.toFixed(2)}`);
      prev = top;
    }
    const worst = Math.max(...rows.map((r) => Number(/stand (\d+)/.exec(r)![1])));
    console.log(`(${lx}, ${lz}) -> break (${px.toFixed(1)}, ${pz.toFixed(1)}) worst stand ${worst}`);
    if (worst > 2) console.log(rows.join('\n'));
  }
}
if (kase === 'peak') {
  const w = testWave(REF_BIGGEST.heightM), tx = -ctx.travelZ, tz = ctx.travelX;
  const [px0, pz0] = breakPoint(TIP[0], TIP[1], w), tPeak = at(px0, pz0).tau;
  console.log(`peak break (${px0.toFixed(1)}, ${pz0.toFixed(1)}) tau ${tPeak.toFixed(2)}`);
  for (const dt of [0, 0.5]) {
    const t = tPeak + dt;
    const row = [-100, -80, -60, -40, -20, -10, -5, 0, 5, 10, 20, 40, 60, 80, 100].map((v) => {
      let x = 0, z = 0;
      for (let u = -200; u <= 200; u += 0.5) { x = px0 + ctx.travelX * u + tx * v; z = pz0 + ctx.travelZ * u + tz * v; if (at(x, z).tau >= t) break; }
      let top = -Infinity, xx = x, zz = z;
      for (let d = -4; d <= 4; d += 0.5) { const f = at(xx, zz); top = Math.max(top, sw.sumWaves(xx, zz, t, f, [w], ctx, sheet).eta); xx += f.dirX * 0.5; zz += f.dirZ * 0.5; }
      const c = sw.crestAt(x, z, t, at(x, z), w, ctx, sheet);
      return `v ${v} (${x.toFixed(0)},${z.toFixed(0)}) top ${top.toFixed(2)} depth ${at(x, z).depth.toFixed(1)} amp ${at(x, z).amp.toFixed(2)} tb ${c?.tb?.toFixed(2) ?? '-'}`;
    });
    console.log(`dt ${dt}:\n  ${row.join('\n  ')}`);
  }
}
if (kase === 'lift') {
  for (const ft of [4, 6, 8]) {
    const wv = testWave(setWaveHeight(ft)), b = firstBreak(field, wv.heightM)!, s0 = at(b.x, b.z);
    for (const u of [20, 30, 40]) {
      const x = b.x + s0.dirX * u, z = b.z + s0.dirZ * u, f = at(x, z);
      const series: [number, number][] = [];
      for (let dt = -10; dt <= 6; dt += 0.1) { const y = sw.sumWaves(x, z, s0.tau + dt, f, [wv], ctx, sheet).eta; if (y > 1) break; series.push([dt, y]); }
      const bottom = series.reduce((a, s, i) => (s[1] < series[a][1] ? i : a), 0);
      let low = Infinity, rise = 0, lowAt = 0, riseAt = 0;
      for (const [dt, y] of series.slice(0, bottom + 1)) { if (y - low > rise) { rise = y - low; riseAt = dt; } if (y < low) { low = y; lowAt = dt; } }
      console.log(`${ft} ft u ${u}: break (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) depth here ${f.depth.toFixed(1)} rise ${rise.toFixed(3)} (low before at ${lowAt.toFixed(1)} s, peak of rise at ${riseAt.toFixed(1)} s) bottom at ${series[bottom][0].toFixed(1)} s ${series[bottom][1].toFixed(2)}`);
    }
  }
}
if (kase === 'liftdump') {
  const ft = Number(arg('ft') ?? 6), u = Number(arg('u') ?? 20);
  const wv = testWave(setWaveHeight(ft)), b = firstBreak(field, wv.heightM)!, s0 = at(b.x, b.z);
  const x = b.x + s0.dirX * u, z = b.z + s0.dirZ * u, f = at(x, z);
  const rows: string[] = [];
  for (let dt = Number(arg("t0") ?? -10); dt <= Number(arg("t1") ?? 3); dt += Number(arg("dt") ?? 0.3)) { const r = sw.sumWaves(x, z, s0.tau + dt, f, [wv], ctx, sheet); const c = sw.crestAt(x, z, s0.tau + dt, f, wv, ctx, sheet); rows.push(`${dt.toFixed(1)}:${r.eta.toFixed(2)}${c?.tb != null ? '/tb' + c.tb.toFixed(1) : ''}`); }
  console.log(`${ft} ft u ${u} at (${x.toFixed(1)}, ${z.toFixed(1)}) depth ${f.depth.toFixed(2)} amp ${f.amp.toFixed(2)} H ${wv.heightM.toFixed(2)}\n${rows.join(' ')}`);
}
if (kase === 'spike') {
  const ft = Number(arg('ft') ?? 6), u = Number(arg('u') ?? 20);
  const wv = testWave(setWaveHeight(ft)), b = firstBreak(field, wv.heightM)!, s0 = at(b.x, b.z);
  const x = b.x + s0.dirX * u, z = b.z + s0.dirZ * u, f = at(x, z);
  for (let dt = Number(arg('t0') ?? -7.3); dt <= Number(arg('t1') ?? -7.1); dt += Number(arg('dt') ?? 0.01)) {
    const t = s0.tau + dt, r = sw.waveAt(x, z, t, f, wv, ctx, sheet), c = sw.crestAt(x, z, t, f, wv, ctx, sheet), xi = sw.phaseXi(x, z, t, f, wv, ctx);
    const pick = Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.round((v as number) * 1000) / 1000]));
    console.log(`dt ${dt.toFixed(3)} xi ${xi.toFixed(3)} crest ${c ? `(${c.x?.toFixed?.(1)}, ${c.z?.toFixed?.(1)}) s ${c.s?.toFixed?.(3)} tb ${c.tb ?? '-'}` : 'none'} ${JSON.stringify(pick)}`);
  }
}
if (kase === 'spike2') {
  const wv = testWave(setWaveHeight(6)), b = firstBreak(field, wv.heightM)!, s0 = at(b.x, b.z);
  const x = b.x + s0.dirX * 20, z = b.z + s0.dirZ * 20, f = at(x, z);
  for (const dt of [-7.21, -7.19]) {
    const t = s0.tau + dt;
    const v = (o: unknown) => sw.waveAt(x, z, t, f, wv, ctx, o as never).eta.toFixed(3);
    console.log(`dt ${dt}: phase1 ${v(undefined)} sheet ${v(sheet)} shape:false ${v({ ...sheet, shape: false })} shape:lean ${v({ ...sheet, shape: 'lean' })} pile:false ${v({ ...sheet, pile: false })}`);
  }
}
function onsetAt(px: number, pz: number, w: ReturnType<typeof testWave>) {
  for (const p of ray(px, pz, 0, 40)) { const f = at(p.x, p.z), c = sw.crestAt(p.x, p.z, f.tau, f, w, ctx, sheet)!; if (c.tb != null && Number.isFinite(c.tb)) return { tOn: f.tau - c.tb, H: sw.localHeight(w, c.f) }; }
  throw new Error('no onset');
}
if (kase === 'pile') {
  const w = testWave(REF_BIGGEST.heightM);
  for (const [lx, lz] of LEDGE_POINTS.filter(([x, z]) => x !== TIP[0] || z !== TIP[1])) {
    const [px, pz] = breakPoint(lx, lz, w), line = ray(px, pz, 40, 110), { tOn } = onsetAt(px, pz, w);
    const t = tOn + 3.4, j = line.findIndex((p) => p.tau >= t);
    const pts = line.slice(j - 4, j + 17);
    const lips = pts.map((p) => sw.crestAt(p.x, p.z, t, at(p.x, p.z), w, ctx, sheet)!.lipH as number);
    const ang = pts.map((p) => (Math.atan2(at(p.x, p.z).dirZ, at(p.x, p.z).dirX) * 180) / Math.PI);
    console.log(`(${lx}, ${lz}) -> (${px.toFixed(1)}, ${pz.toFixed(1)}): lip spread ${((Math.max(...lips) - Math.min(...lips)) / Math.max(...lips)).toFixed(3)}; lips ${lips.map((v) => v.toFixed(2)).join(' ')}; ray dir ${Math.min(...ang).toFixed(1)}..${Math.max(...ang).toFixed(1)} deg; depth ${pts.map((p) => at(p.x, p.z).depth.toFixed(1)).join(' ')}`);
  }
}
if (kase === 'pilegrow') {
  const w = testWave(REF_BIGGEST.heightM), [lx, lz] = onLeft(Number(arg('s') ?? 30));
  const [px, pz] = breakPoint(lx, lz, w), line = ray(px, pz, 20, 110), { tOn, H } = onsetAt(px, pz, w);
  const from = tOn + br.landingEstimate(H, P) + br.settleSpan(H, P) + 0.5;
  for (let t = from; t <= tOn + 12 + 1e-9; t += 0.5) {
    const j = line.findIndex((p) => p.tau >= t); if (j < 1) break;
    const cp = line[j], pt = sw.crestPileTop(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet); if (!pt) break;
    const c = sw.crestAt(cp.x, cp.z, t, at(cp.x, cp.z), w, ctx, sheet)!;
    console.log(`t ${(t - tOn).toFixed(1)} at ${(j * 0.5 - 20).toFixed(1)} m (${cp.x.toFixed(1)}, ${cp.z.toFixed(1)}) depth ${at(cp.x, cp.z).depth.toFixed(2)} own ${pt.own.toFixed(3)} floor ${pt.floor.toFixed(3)} top ${pt.top.toFixed(3)} lipH ${c.lipH?.toFixed(2)} surge ${c.lc.surge.toFixed(3)} decay ${c.lc.decay.toFixed(3)} crest at (${c.x?.toFixed(1)}, ${c.z?.toFixed(1)})`);
  }
}
if (kase === 'peel') {
  // crestTrace.test's left peel: field without smoothing (as that test), 1.8 Hs, stations on the left's first segment.
  const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
  const { surferFeetToHs } = await imp<typeof import('../src/conditions/units')>('/src/conditions/units.ts');
  const f2 = rf.computeReefField({ bed: reefBeds(2).bed, coast: reefBeds(2).coast, periodS: 15, fromDeg: 225, tideM: 0 } as never);
  const c2 = { omega: f2.omega, travelX: f2.far.dirX, travelZ: f2.far.dirZ };
  const w = { ...testWave(1.8 * surferFeetToHs(6)), omega: c2.omega, travelX: c2.travelX, travelZ: c2.travelZ };
  const tb0 = ct.timeSinceOnset(f2, w, TIP[0], TIP[1], c2, P), pk = w.arrivalS + rf.sampleField(f2, TIP[0], TIP[1]).tau - (tb0 ?? 0);
  const minH = ct.minRibbonHeight(sw.fieldBreakingHeight(f2, P), P);
  const [a, b] = [NORTH_LEDGE[0], NORTH_LEDGE[1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const dt of [4, 5, 6, 6.9, 8, 9]) {
    const st = ct.traceStations(f2, [w], pk + dt, c2, { cameraX: TIP[0] - 25, cameraZ: TIP[1] + 45, params: P, minHeightM: minH }).filter((s): s is never => !(s as { gap: boolean }).gap) as unknown as { x: number; z: number; tb: number | null }[];
    const pts = st.filter((s) => s.tb !== null && Number.isFinite(s.tb) && s.tb > 0.05 && s.z < 0).map((s) => ({ d: ((s.x - a[0]) * (b[0] - a[0]) + (s.z - a[1]) * (b[1] - a[1])) / len, tb: s.tb as number })).filter((p) => p.d > 5 && p.d < 110);
    const n = pts.length; if (n < 3) { console.log(`dt ${dt}: ${n} pts`); continue; }
    const md = pts.reduce((s, p) => s + p.d, 0) / n, mt = pts.reduce((s, p) => s + p.tb, 0) / n;
    const slope = pts.reduce((s, p) => s + (p.d - md) * (p.tb - mt), 0) / pts.reduce((s, p) => s + (p.d - md) ** 2, 0);
    console.log(`dt ${dt}: ${n} stations d ${Math.min(...pts.map((p) => p.d)).toFixed(0)}..${Math.max(...pts.map((p) => p.d)).toFixed(0)} m, speed ${(-1 / slope).toFixed(2)} m/s; H ${w.heightM.toFixed(2)}`);
  }
}
