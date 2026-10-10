// lineup-truth Task 5: the capture moments. For 6 and 10 ft (default conditions otherwise): the third
// wave of the first set after 300 s, when it reaches the peak, and when it reaches Lefthanders, the Bombie and Ellensbrook
// on the coast field (its τ there); each printed as a captureMoments.mjs command line (lineup camera at
// DEFAULT_LINEUP_POSITION, yaw 0 north or 180 south, pitch -2; R1's down-the-line camera for the Womb).
// npx node tools/_lineupMoments.ts [--base=http://localhost:5173/] [--out=../liquid-dreams-captures/lineup-truth-2026-10-09]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesBetween } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { DEFAULT_LINEUP_POSITION } = await imp<typeof import('../src/dev/referenceMoments')>('/src/dev/referenceMoments.ts');
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { REFRACT_FLOOR_M, computeReefField, sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', out = arg('out') ?? '../liquid-dreams-captures/lineup-truth-2026-10-09';
const bed = downsample(buildBathymetry(), 2);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const lineup = (yawDeg: number) => ({ mode: 'lineup', position: [...DEFAULT_LINEUP_POSITION], yawDeg, pitchDeg: -2 });
// Down the line: on the shelf 100 m along the left's ledge from the tip and 20 m inshore of it, looking back at the ledge
// 30 m from the tip (womb-retune: the take-off at wombReef.TIP, the ledge at LEFT_BEARING_DEG).
const { TIP, LEFT_BEARING_DEG } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
const camXZ = [TIP[0] + 100 * along[0] + 20 * inshore[0], TIP[1] + 100 * along[1] + 20 * inshore[1]], lookXZ = [TIP[0] + 30 * along[0], TIP[1] + 30 * along[1]];
const dtl = { mode: 'free', position: [+camXZ[0].toFixed(1), 3, +camXZ[1].toFixed(1)], yawDeg: +(((Math.atan2(lookXZ[0] - camXZ[0], -(lookXZ[1] - camXZ[1])) * 180) / Math.PI + 360) % 360).toFixed(1), pitchDeg: -3 };
const PLACES: Record<string, [number, number]> = { lefthanders: [-231, -1670], bombie: [-280, 1020], ellensbrook: [323, 1080] };

for (const ft of [6, 10]) {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = ft;
  const field = computeReefField({ bed, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: 1, smooth: true, refractFloorM: REFRACT_FLOOR_M, coast: buildCoastMap(bed, DEFAULT_COAST_PARAMS) });
  const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS);
  const first = waves[0], set = waves.filter((w) => w.slot === first.slot);
  const third = set[Math.min(2, set.length - 1)];
  const t = (p: [number, number]) => +(third.arrivalS + sampleField(field, p[0], p[1]).tau).toFixed(2);
  const at = { peak: +third.arrivalS.toFixed(2), lefthanders: t(PLACES.lefthanders), bombie: t(PLACES.bombie), ellensbrook: t(PLACES.ellensbrook) };
  console.log(`# ${ft} ft: set slot ${first.slot}, ${set.length} waves; third wave ${third.heightM.toFixed(2)} m reaches ${JSON.stringify(at)}`);
  const cmd = (name: string, camera: unknown, times: number[], q = '') =>
    console.log(`npx electron tools/captureMoments.mjs --base=${base}${q} --out=${out}/${ft}ft-${name} --times=${times.join(',')} --m=${b64({ conditions: c, camera, simTime: times[0], paused: true })}`);
  cmd('north', lineup(0), [at.lefthanders - 2, at.lefthanders + 2]);
  cmd('south', lineup(180), [at.bombie, at.ellensbrook + 2]);
  if (ft === 6) {
    cmd('dtl-coast', dtl, [at.peak + 3, at.peak + 5]);
  }
}
