// shelf-polish Task 1: the ride's CPU cost per step, off the GPU and the page (the frame profiler's spread on this machine
// is ±25 % run to run). The rideOnSections harness on the game's field as the worker builds it (coast-seeded), one band's
// biggest set wave from the take-off spot, 60 Hz steps; per step: ms, the board's wave sums (sheet reads), the section
// curves read, live stations, waves in the sum, and the trace's own ms. Runs in whichever tree is the cwd (vite root), so
// the same file measures main and the pre-merge tree: `cd <tree> && npx node <this file> [--ft=7] [--period=15] [--s=12]`.
import { runnerImport } from 'vite';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ft = Number(arg('ft') ?? 7), periodS = Number(arg('period') ?? 15), seconds = Number(arg('s') ?? 12);
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const defaults = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const bathy = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const reef = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const coastFeat = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const coastMap = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const coastField = await imp<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const sets = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const ct = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const sw = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const sec = await imp<typeof import('../src/ride/sectionWater')>('/src/ride/sectionWater.ts');
const wat = await imp<typeof import('../src/ride/water')>('/src/ride/water.ts');
const rp = await imp<typeof import('../src/ride/ridePhysics')>('/src/ride/ridePhysics.ts');
const tk = await imp<typeof import('../src/ride/takeoff')>('/src/ride/takeoff.ts');
const rl = await imp<typeof import('../src/ride/rideLine')>('/src/ride/rideLine.ts');

const P = br.DEFAULT_BREAK_PARAMS;
const c = defaults.cloneConditions(defaults.DEFAULT_CONDITIONS);
c.swell.sizeFt = ft; c.swell.periodS = periodS; c.swell.directionDeg = 225; c.tideM = 0;
const bed = bathy.downsample(bathy.buildBathymetry(reef.DEFAULT_REEF_PARAMS), 2);
const map = coastMap.buildCoastMap(bed, coastFeat.DEFAULT_COAST_PARAMS);
const cf = coastField.computeCoastField({ bed: map, periodS, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
const field = rf.computeReefField({ bed, periodS, fromDeg: 225, tideM: 0, peel: P.peel, curlMaxMs: P.curlMaxMs, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M, coastField: cf } as never);
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const set = sets.wavesBetween(0, 600, c, sets.DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
const o = { ...sw.breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = ct.minRibbonHeight(sw.fieldBreakingHeight(field, P), P);
let sums = 0, traceMs = 0, nWaves = 0, nLive = 0;
let lastEntries: import('../src/breaker/crestTrace').StationEntry[] = [];
const stats = { curves: 0, full: 0 };
const waterAtT = (t: number, cx: number, cz: number) => {
  const waves = sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS).map(sw.toActiveWave);
  nWaves = waves.length;
  const sheet = (x: number, z: number) => wat.waterAt(x, z, c.tideM, ctx.omega, (a, b) => rf.sampleField(field, a, b), (a, b, f) => { sums++; return sw.sumWaves(a, b, t, f, waves, ctx, o); });
  const t0 = performance.now();
  const entries = ct.traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM });
  traceMs = performance.now() - t0;
  nLive = entries.filter((e) => !e.gap).length; lastEntries = entries;
  return sec.withSections(sheet, entries, c.tideM, { stats });
};
const { x: sx, z: sz } = tk.takeoffSpot(field, big.heightM, P);
let t = big.arrivalS - tk.takeoffLeadS(field, { x: sx, z: sz });
const arrive = t + tk.TAKEOFF_ARRIVE_S;
const start = waterAtT(t, sx, sz)(sx, sz);
const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
const b = rp.startBody(sx, sz, swellHeading, waterAtT(t, sx, sz));
const line = swellHeading - rl.LINE_OFF_DEG, dt = 1 / 60;
let popped = false;
console.log(`# ${ft} ft ${periodS} s, wave ${big.heightM.toFixed(2)} m, take-off (${sx.toFixed(1)}, ${sz.toFixed(1)}), arrive ${arrive.toFixed(2)} s`);
console.log('#  t-arrive  phase   x      z     stepMs  traceMs  sums  curves  live  waves | nearest station: phase rho tb until');
/** The live station nearest the board: its section phase, rho, tb and until (what the board's water stands on). */
const near = (): string => {
  let best: import('../src/breaker/crestTrace').Station | null = null, d = Infinity;
  for (const e of lastEntries) if (!e.gap) { const q = Math.hypot(e.x - b.x, e.z - b.z); if (q < d) { d = q; best = e; } }
  return best ? `${best.section.phase.toFixed(2)} ${best.section.rho.toFixed(3)} ${best.tb?.toFixed(2) ?? 'null'} ${best.until?.toFixed(2) ?? 'null'} (${d.toFixed(1)} m)` : 'none';
};
const rows: { phase: string; ms: number; trace: number; sums: number; curves: number; full: number }[] = [];
for (let k = 0; k < 60 * seconds; k++) {
  t += dt;
  sums = 0; stats.curves = 0; stats.full = 0;
  const s0 = performance.now();
  const water = waterAtT(t, b.x, b.z);
  if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
  const err = ((b.headingDeg - line + 540) % 360) - 180;
  const under = water(b.x, b.z);
  const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
  if (popup) popped = true;
  rp.stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - 2, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt, rp.TUNING.intermediate);
  const ms = performance.now() - s0;
  rows.push({ phase: b.phase, ms, trace: traceMs, sums, curves: stats.curves, full: stats.full });
  if (k % 30 === 0) console.log(`${(t - arrive).toFixed(2).padStart(9)}  ${b.phase.padEnd(6)} ${b.x.toFixed(1).padStart(6)} ${b.z.toFixed(1).padStart(6)} ${ms.toFixed(1).padStart(7)} ${traceMs.toFixed(1).padStart(7)} ${String(sums).padStart(6)} ${String(stats.curves).padStart(6)} ${String(nLive).padStart(5)} ${String(nWaves).padStart(5)} | ${near()}`);
  if (b.phase === 'bail' || b.phase === 'ended' as never) break;
}
const ride = rows.filter((r) => r.phase === 'ride');
const med = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] ?? NaN; };
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`# riding steps ${ride.length}: step ms median ${med(ride.map((r) => r.ms)).toFixed(1)} mean ${mean(ride.map((r) => r.ms)).toFixed(1)}; trace ms median ${med(ride.map((r) => r.trace)).toFixed(1)}; sums/step mean ${mean(ride.map((r) => r.sums)).toFixed(0)}; curves/step mean ${mean(ride.map((r) => r.curves)).toFixed(1)} (at g = 1: ${mean(ride.map((r) => r.full)).toFixed(1)}); sums per curve ${(mean(ride.map((r) => r.sums)) / Math.max(1e-9, mean(ride.map((r) => r.curves)))).toFixed(0)}`);
