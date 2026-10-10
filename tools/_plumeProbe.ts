// whitewater 7b (S1): the spray pool alone at a moment, on the CPU reference (sprayStep ≡ the GPU, spray.selftest), seen
// face-on to the crest: each live puff a soft disc (its kind's size and opacity × strength × its fades × the soft fade),
// composited "over" into 0.5 m cells of (along the crest, height). Prints the box of alpha > 0.1 in metres above the
// crest line (the highest the spray emitters' tips stood over the last second), per kind and all together.
// cd <tree> && npx node tools/_plumeProbe.ts [--ft=10] [--period=15] [--wind=18,90] [--t=403.67] [--seed=2002] [--tide=0]
import { runnerImport } from 'vite';
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ft = Number(arg('ft') ?? 10), periodS = Number(arg('period') ?? 15), T = Number(arg('t') ?? 403.67);
const windArg = (arg('wind') ?? '18,90').split(',').map(Number), seed = Number(arg('seed') ?? 2002), tide = Number(arg('tide') ?? 0);
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
const ss = await imp<typeof import('../src/whitewater/sprayStep')>('/src/whitewater/sprayStep.ts');
const pk = await imp<typeof import('../src/whitewater/particleKinds')>('/src/whitewater/particleKinds.ts');
const fs = await imp<typeof import('../src/whitewater/foamStep')>('/src/whitewater/foamStep.ts');

const P = br.DEFAULT_BREAK_PARAMS;
const c = defaults.cloneConditions(defaults.DEFAULT_CONDITIONS);
c.swell.sizeFt = ft; c.swell.periodS = periodS; c.swell.directionDeg = 225; c.tideM = tide; c.seed = seed;
c.wind = { speedMs: windArg[0] * 0.5144, directionDeg: windArg[1] };
const bed = bathy.downsample(bathy.buildBathymetry(reef.DEFAULT_REEF_PARAMS), 2);
const map = coastMap.buildCoastMap(bed, coastFeat.DEFAULT_COAST_PARAMS);
const cf = coastField.computeCoastField({ bed: map, periodS, fromDeg: 225, tideM: tide, refractFloorM: rf.REFRACT_FLOOR_M });
const field = rf.computeReefField({ bed, periodS, fromDeg: 225, tideM: tide, peel: P.peel, curlMaxMs: P.curlMaxMs, smooth: true, refractFloorM: rf.REFRACT_FLOOR_M, coastField: cf } as never);
const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
const minHeightM = ct.minRibbonHeight(sw.fieldBreakingHeight(field, P), P);
const wind = { speedMs: c.wind.speedMs, fromDeg: c.wind.directionDeg };
const [wx0, wz0] = se.windToVector(c.wind.directionDeg), wx = wx0 * c.wind.speedMs, wz = wz0 * c.wind.speedMs;
const emitters = (k: number) => {
  const t = fs.tickTime(k);
  return se.breakEmitters({ field, ctx, events: sets.wavesNear(t, c, sets.DEFAULT_SET_PARAMS), t, params: P, minHeightM, wind, tideM: tide, amount: 1, impactAmount: 1 } as never);
};

// The spray pool as App runs it: its replay window (the longest life), births then a step per tick.
const kEnd = fs.tickIndex(T), maxLife = Math.max(1.2 * se.DEFAULT_SPRAY_PARAMS.lifeS, se.PLUME_LIFE_S[1]);
const n = se.replayTicksForMaxLife(maxLife);
const pool = new ss.SprayPool();
let births = 0, maxBirths = 0, tipY: number[] = [], wOff = 0, H = 0, crestY = -Infinity;
for (let k = kEnd - n + 1; k <= kEnd; k++) {
  const e = emitters(k);
  const b = se.sprayAndPlumeBirths(e.spray, k, se.DEFAULT_SPRAY_PARAMS, e.feather);
  births += b.length; maxBirths = Math.max(maxBirths, b.length);
  ss.birthInto(pool, k, b);
  ss.stepPool(pool, wx, wz);
  // The crest line: the highest the lip's tip stood over the last second (it leaves the crest as it pitches).
  if (k > kEnd - 20) for (const q of e.spray) crestY = Math.max(crestY, q.y);
  if (k === kEnd) { tipY = e.spray.map((q) => q.y); wOff = e.spray.length ? e.spray.reduce((s, q) => s + q.wOff, 0) / e.spray.length : 0; }
}
const ev = sets.wavesNear(T, c, sets.DEFAULT_SET_PARAMS);
H = Math.max(...ev.map((q) => q.heightM));
const lipY = Number.isFinite(crestY) ? crestY : tide;
// The crest's direction (along) from the wave's travel: perpendicular to it in xz.
const along = (x: number, z: number) => -ctx.travelZ * x + ctx.travelX * z;
const CELL = 0.5;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function boxOf(kinds: number[] | null, threshold = 0.1): string {
  const grid = new Map<string, number>(); // transmittance per cell
  let live = 0;
  for (let i = 0; i < pool.size; i++) {
    const j = i * 4, age = pool.posAge[j + 3], life = pool.velLife[j + 3];
    if (!(age < life)) continue;
    const kind = Math.round(pool.meta[j + 1]);
    if (kinds && !kinds.includes(kind)) continue;
    live++;
    const q = pk.PARTICLE_KINDS[kind], ageFrac = Math.min(1, age / life);
    const size = q.sizeM[0] + (q.sizeM[1] - q.sizeM[0]) * ageFrac;
    const fades = sstep(0, 0.1, age) * (1 - sstep(0.6, 1, ageFrac));
    const y = pool.posAge[j + 1], soft = sstep(0, ss.SOFT_FADE_M, y - pool.meta[j + 2]);
    const a0 = Math.min(1, q.opacity * pool.meta[j] * fades * soft);
    if (a0 <= 1e-4) continue;
    const s = along(pool.posAge[j], pool.posAge[j + 2]), r = size / 2;
    for (let cs = Math.floor((s - r) / CELL); cs <= Math.floor((s + r) / CELL); cs++) for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
      const d = Math.hypot((cs + 0.5) * CELL - s, (cy + 0.5) * CELL - y) / r;
      const a = a0 * (1 - sstep(0.3, 1, d));
      if (a <= 0) continue;
      const key = `${cs},${cy}`;
      grid.set(key, (grid.get(key) ?? 1) * (1 - a));
    }
  }
  let top = -Infinity, sMin = Infinity, sMax = -Infinity, cells = 0;
  for (const [key, tr] of grid) {
    if (1 - tr <= threshold) continue;
    const [cs, cy] = key.split(',').map(Number), y = (cy + 1) * CELL;
    cells++;
    top = Math.max(top, y);
    if (y > lipY) { sMin = Math.min(sMin, cs * CELL); sMax = Math.max(sMax, (cs + 1) * CELL); }
  }
  if (cells === 0) return `live ${live}: nothing reaches alpha ${threshold}`;
  return `live ${live}: top ${(top - lipY).toFixed(2)} m above the crest line (${((top - lipY) / H).toFixed(2)} H); width above it ${Number.isFinite(sMax) ? (sMax - sMin).toFixed(1) : 0} m; cells ${cells}`;
}
console.log(`# ${ft} ft ${periodS} s seed ${seed} tide ${tide}, wind ${windArg[0]} kn from ${windArg[1]}°, t ${T}: H ${H.toFixed(2)} m, crest line y ${lipY.toFixed(2)} (the tips' highest over the last 1 s; ${tipY.length} throwing stations now), mean w_off ${wOff.toFixed(2)} m/s → plume smoothstep(3, 9) ${sstep(3, 9, wOff).toFixed(2)}`);
console.log(`# births over ${n} ticks: ${births} (max ${maxBirths}/tick, cap ${se.SPRAY_BIRTH_CAP})`);
for (const th of [0.1, 0.3, 0.5]) console.log(`alpha > ${th}  plume: ${boxOf([pk.KIND_INDEX.plume], th)}`);
console.log(`veil + feather (spray kind): ${boxOf([pk.KIND_INDEX.spray, ...('feather' in pk.KIND_INDEX ? [(pk.KIND_INDEX as Record<string, number>).feather] : [])])}`);
for (const th of [0.1, 0.3, 0.5]) console.log(`alpha > ${th}  all: ${boxOf(null, th)}`);
