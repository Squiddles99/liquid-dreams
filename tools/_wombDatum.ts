// womb-retune Task 1 (spec §2, §6.1): the datum table. For every SWELL_BANDS entry × distinct TIDE_STOPS.m × fromDeg
// {202, 225, 247}: the coast map + coast field + reef field (the game's field), sampled at the peak (0, 0) and at the reef
// map's west edge (x −400, z 0): arrival angle atan2(dirZ, dirX), amp, hmin, and the set-1 biggest wave's local height
// min(H·amp, 0.78·hmin) in m and in ft (the dial inverted: the ft whose set-1 biggest wave is that height).
// Run: npx node tools/_wombDatum.ts [out.txt] [--from=225] [--bands=Fun,Solid]
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { REFRACT_FLOOR_M, computeReefField, sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { setWaveHeight } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { DEFAULT_REEF_PARAMS } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { SWELL_BANDS, TIDE_STOPS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');

const args = process.argv.slice(2);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const froms = opt('from') ? opt('from')!.split(',').map(Number) : [202, 225, 247];
const bands = opt('bands') ? SWELL_BANDS.filter((b) => opt('bands')!.split(',').includes(b.label)) : SWELL_BANDS;
const bed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2);
const coast = buildCoastMap(bed, DEFAULT_COAST_PARAMS);
const tides = [...new Set(TIDE_STOPS.map((t) => t.m))].sort((a, b) => a - b);
const GAMMA = 0.78;

/** The dial's ft whose set-1 biggest wave is `h` metres (setWaveHeight is monotonic in ft). */
function heightToFt(h: number): number {
  let lo = 0, hi = 30;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (setWaveHeight(m) < h) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

const lines = [
  `# womb-retune datum, ${new Date().toISOString().slice(0, 10)}, coast-seeded reef field, smooth, refractFloorM; local = min(H·amp, ${GAMMA}·hmin)`,
  'from | band       ft  T  | tide  || peak: angle°  amp   hmin  local m  ft  || west edge (x −400): angle°  amp   hmin  local m  ft',
];
const at = (f: any, H: number, x: number, z: number) => {
  const s = sampleField(f, x, z), local = Math.min(H * s.amp, GAMMA * s.hmin);
  return `${(Math.atan2(s.dirZ, s.dirX) * 180 / Math.PI).toFixed(1).padStart(6)} ${s.amp.toFixed(3)} ${s.hmin.toFixed(2).padStart(5)} ${local.toFixed(2).padStart(6)} ${heightToFt(local).toFixed(1).padStart(4)}`;
};
for (const fromDeg of froms) for (const b of bands) {
  const H = setWaveHeight(b.ft);
  for (const tideM of tides) {
    const f = computeReefField({ bed, periodS: b.periodS, fromDeg, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M, coast });
    const line = `${fromDeg}  | ${b.label.padEnd(9)} ${String(b.ft).padStart(4)} ${String(b.periodS).padStart(2)} | ${tideM.toFixed(2).padStart(5)} ||       ${at(f, H, 0, 0)} ||                     ${at(f, H, -400, 0)}`;
    lines.push(line);
    console.log(line);
  }
}
const out = args.find((a) => !a.startsWith('--'));
if (out) writeFileSync(out, lines.join('\n') + '\n');
