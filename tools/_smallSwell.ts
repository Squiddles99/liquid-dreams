// Small-swell probe (plan 2026-10-09-small-swell-low-tide). Run: npx node tools/_smallSwell.ts [out.txt]
// Fable's first version read Andrew's link (3.5 ft, 13 s, 225°, tide −1.5) and variants on the lineup-truth checkout;
// Task 4 (Opus): the select screen's matrix, every SWELL_BANDS entry (its ft, periodS, 225°) × every distinct TIDE_STOPS.m,
// main physics (no coast map), smooth, refractFloorM. A pair BREAKS when the first leg is all broken (28/28), its start
// ≤ 2.0 s after the peak and its peel 8–13 m/s (a surfer's left, R3's bar).
// womb-retune Task 0: `--coast` (default) seeds the reef field from the coast map (the game's field on lineup-truth);
// `--no-coast` keeps main's run. `--from=<deg>` sets the swell direction (default 225).
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { REFRACT_FLOOR_M, computeReefField, sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { DEFAULT_BREAK_PARAMS: P, SHALLOW_BREAKING_DEPTH_M, breakingRatio } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { setWaveHeight, leftStretches } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { NORTH_LEDGE } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_REEF_PARAMS, TIP } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { SWELL_BANDS, TIDE_STOPS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');

const args = process.argv.slice(2);
const useCoast = !args.includes('--no-coast');
const fromDeg = Number(args.find((a) => a.startsWith('--from='))?.slice(7) ?? 225);
const bed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2);
const coast = useCoast ? buildCoastMap(bed, DEFAULT_COAST_PARAMS) : undefined;
const tides = [...new Set(TIDE_STOPS.map((t) => t.m))].sort((a, b) => a - b);
const lines: string[] = [
  `# small-swell Task 4: band × tide matrix, ${new Date().toISOString().slice(0, 10)}, SHALLOW_BREAKING_DEPTH_M ${SHALLOW_BREAKING_DEPTH_M} m, ${useCoast ? 'coast-seeded field' : 'main physics (no coast map)'}, ${fromDeg}°, smooth, refractFloorM`,
  '# breaks = first leg 28/28 broken, start ≤ 2.0 s, peel 8–13 m/s',
  'band       ft  T  | tide  | ratio@peak | first: broken, start s, peel m/s, hollow | second peel | breaks',
];
const breaks: Record<string, boolean[]> = {};
for (const b of SWELL_BANDS) {
  const H = setWaveHeight(b.ft), row: boolean[] = [];
  for (const tideM of tides) {
    const f = computeReefField({ bed, periodS: b.periodS, fromDeg, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M, ...(coast ? { coast } : {}) });
    const s = sampleField(f, TIP[0], TIP[1]), ratio = breakingRatio(H * s.amp, s.hminBreak, P);
    const st = leftStretches(f, H, NORTH_LEDGE, { first: [0], second: [1] }, P), a = st.first, c = st.second;
    const ok = !!a && a.of === 28 && a.broken === a.of && a.start <= 2.0 && a.peel >= 8 && a.peel <= 13;
    row.push(ok);
    const line = `${b.label.padEnd(9)} ${String(b.ft).padStart(4)} ${String(b.periodS).padStart(2)} | ${tideM.toFixed(2).padStart(5)} | ${ratio.toFixed(2).padStart(10)} | `
      + (a ? `${a.broken}/${a.of}, ${a.start.toFixed(1)}, ${a.peel.toFixed(1)}, ${a.hollow.toFixed(2)}` : 'none').padEnd(40)
      + ` | ${c ? c.peel.toFixed(1) : 'none'} | ${ok ? 'YES' : 'no'}`;
    lines.push(line);
    console.log(line);
  }
  breaks[b.label] = row;
}
lines.push('', `# tides (m): ${JSON.stringify(tides)}`, `# BREAKS: ${JSON.stringify(breaks)}`);
const out = args.find((a) => !a.startsWith('--'));
if (out) writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.slice(-2).join('\n'));
