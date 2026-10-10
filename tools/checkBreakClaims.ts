// tools/checkBreakClaims.ts: the game checks behind a break's claims (surf-map hub spec §6). Run from the repo root:
// npm run claims → src/breaks/<id>.claims.json. Each claim's `check` names a check below; 'none' (no game measure yet)
// writes pass: false, so the claim stays off screen until a check exists. Uses the reef report the criteria tests read.
import { readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { REFRACT_FLOOR_M, computeReefField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { setWaveHeight, leftStretches, rideOf, PEEL_BAND } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { NORTH_LEDGE } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { WIND_ROWS, SWELL_BANDS, BREAKS, BREAKS_TIDES_M, FROM_WINDOW } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { tideOf, inArc } = await imp<typeof import('../src/frontend/conditionsSource')>('/src/frontend/conditionsSource.ts');

const id = process.argv[2] ?? 'womb';
const file = JSON.parse(readFileSync(`src/breaks/${id}.json`, 'utf8'));
const best = file.best as { swellFromDeg: [number, number]; sizeFt: [number, number]; windFromDeg: [number, number]; tide: ('low' | 'mid' | 'high')[] };
const bed = downsample(buildBathymetry(), 2);
const midFt = (best.sizeFt[0] + best.sizeFt[1]) / 2;
const bandOf = (ft: number) => SWELL_BANDS.reduce((b, x) => (Math.abs(x.ft - ft) < Math.abs(b.ft - ft) ? x : b));

function left(ft: number, fromDeg: number, tideM: number) {
  const band = bandOf(ft), H = setWaveHeight(ft);
  const f = computeReefField({ bed, periodS: band.periodS, fromDeg, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  return leftStretches(f, H, NORTH_LEDGE, { first: [0] }, P).first;
}
const breaksWell = (r: ReturnType<typeof left>) => !!r && r.broken === r.of && r.peel >= PEEL_BAND[0] && r.peel <= PEEL_BAND[1];

const checks: Record<string, () => { pass: boolean; detail: string }> = {
  'peel-left': () => {
    const r = left(midFt, 247, 0);
    return { pass: breaksWell(r), detail: r ? `${midFt} ft WSW mid: first leg ${r.broken}/${r.of} broken, peel ${r.peel.toFixed(1)} m/s (band ${PEEL_BAND.join('–')})` : 'no break' };
  },
  barrel: () => {
    const r = left(midFt, 247, 0), ride = r ? rideOf(r) : 'no break';
    return { pass: ride === 'barrel', detail: `${midFt} ft WSW mid: ${ride}${r ? `, hollow ${r.hollow.toFixed(2)}` : ''}` };
  },
  'best-swell': () => {
    const dirs = FROM_WINDOW.filter((d) => inArc(d, best.swellFromDeg));
    const res = dirs.map((d) => [d, breaksWell(left(midFt, d, 0))] as const);
    return { pass: dirs.length > 0 && res.every(([, ok]) => ok), detail: res.map(([d, ok]) => `${d}°: ${ok ? 'breaks' : 'no'}`).join(', ') || 'no game direction in range' };
  },
  'best-wind': () => {
    // The game's offshore direction (spec §6): its Offshore rows. Cross-offshore is a different direction, not offshore.
    const offshore = WIND_ROWS.filter((w) => /offshore/i.test(w.label) && !/cross/i.test(w.label) && w.fromDeg !== null).map((w) => w.fromDeg!);
    const all = offshore.every((d) => inArc(d, best.windFromDeg));
    return { pass: offshore.length > 0 && all, detail: `the game's offshore winds blow from ${[...new Set(offshore)].join(', ')}°; best arc ${best.windFromDeg.join('–')}°` };
  },
  'best-tide': () => {
    const bands = SWELL_BANDS.filter((b) => b.ft >= best.sizeFt[0] && b.ft <= best.sizeFt[1]);
    const tides = BREAKS_TIDES_M.map((m, i) => [m, i] as const).filter(([m]) => best.tide.includes(tideOf(m)));
    const bad = bands.flatMap((b) => tides.filter(([, i]) => !BREAKS[b.label]?.[i]).map(([m]) => `${b.label}@${m}`));
    return { pass: bands.length > 0 && tides.length > 0 && bad.length === 0, detail: bad.length ? `doesn't break: ${bad.join(', ')}` : `breaks at ${tides.map(([m]) => m).join(', ')} m for ${bands.map((b) => b.label).join(', ')}` };
  },
  none: () => ({ pass: false, detail: 'no game check yet' }),
};

const out: Record<string, { pass: boolean; detail: string }> = {};
for (const c of file.claims as { id: string; check: string }[]) {
  const run = checks[c.check];
  out[c.id] = run ? run() : { pass: false, detail: `unknown check "${c.check}"` };
  console.log(`${out[c.id].pass ? 'PASS' : 'FAIL'} ${c.id}: ${out[c.id].detail}`);
}
writeFileSync(`src/breaks/${id}.claims.json`, JSON.stringify(out, null, 1) + '\n');
