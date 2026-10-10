// whitewater 7b (S2): feather emitters and births around a moment (8 ft, strong offshore): how many stations feather,
// their strength, and the feather puffs alive. cd <tree> && npx node tools/_featherCount.ts [--ft=8] [--t=400.17]
import { runnerImport } from 'vite';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ft = Number(arg('ft') ?? 8), T = Number(arg('t') ?? 400.17);
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
const se = await imp<typeof import('../src/whitewater/sprayEmitters')>('/src/whitewater/sprayEmitters.ts');
const fs = await imp<typeof import('../src/whitewater/foamStep')>('/src/whitewater/foamStep.ts');
const P = br.DEFAULT_BREAK_PARAMS;
const c = defaults.cloneConditions(defaults.DEFAULT_CONDITIONS);
c.swell.sizeFt = ft; c.swell.periodS = 15; c.swell.directionDeg = 225; c.tideM = 0; c.seed = 2002; c.wind = { speedMs: 18 * 0.5144, directionDeg: 90 };
const bed = bathy.downsample(bathy.buildBathymetry(reef.DEFAULT_REEF_PARAMS), 2);
const cf = coastField.computeCoastField({ bed: coastMap.buildCoastMap(bed, coastFeat.DEFAULT_COAST_PARAMS), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
const field = rf.computeReefField({ bed, periodS: 15, fromDeg: 225, tideM: 0, peel: P.peel, curlMaxMs: P.curlMaxMs, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M, coastField: cf } as never);
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const minHeightM = ct.minRibbonHeight(sw.fieldBreakingHeight(field, P), P);
for (let dt = -2; dt <= 1; dt += 0.5) {
  const t = T + dt, k = fs.tickIndex(t);
  const e = se.breakEmitters({ field, ctx, events: sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS), t, params: P, minHeightM, wind: { speedMs: c.wind.speedMs, fromDeg: 90 }, tideM: 0, amount: 1, impactAmount: 1 } as never);
  let births = 0;
  for (let j = k - 19; j <= k; j++) births += se.featherBirths(e.feather, j).length;
  const s = e.feather.map((q) => q.strength);
  console.log(`t ${t.toFixed(2)}: ${e.feather.length} feathering stations (strength mean ${(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)).toFixed(2)}, max ${Math.max(0, ...s).toFixed(2)}), ~${births} feather births per s; spray ${e.spray.length}, w_off ${e.feather[0]?.wOff.toFixed(2) ?? '-'}`);
}
{
  const t = T, e = se.breakEmitters({ field, ctx, events: sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS), t, params: P, minHeightM, wind: { speedMs: c.wind.speedMs, fromDeg: 90 }, tideM: 0, amount: 1, impactAmount: 1 } as never);
  console.log('feather (x, y, z, strength, waveId):', e.feather.map((q) => `(${q.x.toFixed(0)}, ${q.y.toFixed(2)}, ${q.z.toFixed(0)}, ${q.strength.toFixed(2)}, w${q.waveId})`).join(' '));
  console.log('spray   (x, y, z, waveId):', e.spray.map((q) => `(${q.x.toFixed(0)}, ${q.y.toFixed(2)}, ${q.z.toFixed(0)}, w${q.waveId})`).join(' '));
  const b = se.featherBirths(e.feather, fs.tickIndex(t));
  console.log('a tick of feather births (y, vy, life, strength, kind):', b.slice(0, 6).map((q) => `(${q.y.toFixed(2)}, ${q.vy.toFixed(2)}, ${q.life.toFixed(2)}, ${q.strength.toFixed(2)}, ${q.kind})`).join(' '));
}
{
  const t = T, e = se.breakEmitters({ field, ctx, events: sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS), t, params: P, minHeightM, wind: { speedMs: c.wind.speedMs, fromDeg: 90 }, tideM: 0, amount: 1, impactAmount: 1 } as never);
  const st = ct.traceStations(field, sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS).map(sw.toActiveWave), t, ctx, { cameraX: 0, cameraZ: 0, params: P, minHeightM, spacingM: se.SPRAY_SPACING_M });
  for (const id of [...new Set(e.feather.map((q) => q.waveId))]) {
    const f = e.feather.filter((q) => q.waveId === id), arcs = f.map((q) => q.arc * se.SPRAY_SPACING_M);
    const end = (q: typeof f[0]) => `(${q.x.toFixed(0)}, ${q.z.toFixed(0)})`;
    console.log(`wave ${id}: ${f.length} feathering stations along ${(Math.max(...arcs) - Math.min(...arcs)).toFixed(0)} m of crest, from ${end(f[0])} to ${end(f[f.length - 1])}; strength ${Math.min(...f.map((q) => q.strength)).toFixed(2)}–${Math.max(...f.map((q) => q.strength)).toFixed(2)}`);
  }
  const live = st.filter((s) => !s.gap);
  console.log(`trace: ${live.length} live stations; tb null with finite until ${live.filter((s: any) => s.tb === null && Number.isFinite(s.until ?? NaN)).length}, tb null with until null/never ${live.filter((s: any) => s.tb === null && !Number.isFinite(s.until ?? NaN)).length}`);
}
