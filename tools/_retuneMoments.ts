// womb-retune Task 2b step 4 / Task 6: capture moments on the moved take-off. Per band at 225° and its tide: the biggest
// wave of the first set after 300 s (its crest reaches the tip, wombReef.TIP, at arrivalS), printed as captureMoments.mjs
// lines: down the line (_lineupMoments' dtl), the stand's lookout (frontEnd's Conditions camera: lookoutShot from the
// crew's stand spot on the real land) and the lineup camera. npx node tools/_retuneMoments.ts [--bands=Pumping]
// [--times=3,5] [--tide=0] [--base=http://localhost:5189/] [--out=../liquid-dreams-captures/womb-retune-2026-10-09]
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesBetween } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { DEFAULT_LINEUP_POSITION } = await imp<typeof import('../src/dev/referenceMoments')>('/src/dev/referenceMoments.ts');
const { SWELL_BANDS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { TIP, LEFT_BEARING_DEG } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { decodeLandFile } = await imp<typeof import('../src/land/landData')>('/src/land/landData.ts');
const { LandHeight } = await imp<typeof import('../src/land/landHeight')>('/src/land/landHeight.ts');
const { TrackNetwork, routeTracks } = await imp<typeof import('../src/land/tracks')>('/src/land/tracks.ts');
const { landSpots } = await imp<typeof import('../src/surfer/placement')>('/src/surfer/placement.ts');
const { lookoutShot } = await imp<typeof import('../src/frontend/beatCamera')>('/src/frontend/beatCamera.ts');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/', out = arg('out') ?? '../liquid-dreams-captures/womb-retune-2026-10-09';
const bands = (arg('bands') ?? 'Pumping').split(','), times = (arg('times') ?? '3,5').split(',').map(Number), tide = Number(arg('tide') ?? 0);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

const lh = new LandHeight(decodeLandFile(new Uint8Array(readFileSync('public/terrain/womb-land.bin'))));
lh.setTracks(new TrackNetwork(routeTracks(lh, lh.fineZRange())));
const stand = landSpots(lh, lh.profile).standSpot;
const look = lookoutShot(stand, (x, z) => lh.heightAt(x, z));
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
const cam = [TIP[0] + 100 * along[0] + 20 * inshore[0], TIP[1] + 100 * along[1] + 20 * inshore[1]], at = [TIP[0] + 30 * along[0], TIP[1] + 30 * along[1]];
const dtl = { mode: 'free', position: [+cam[0].toFixed(1), 3, +cam[1].toFixed(1)], yawDeg: +(((Math.atan2(at[0] - cam[0], -(at[1] - cam[1])) * 180) / Math.PI + 360) % 360).toFixed(1), pitchDeg: -3 };
const lineup = { mode: 'lineup', position: [...DEFAULT_LINEUP_POSITION], yawDeg: 0, pitchDeg: -2 };
console.log(`# stand ${JSON.stringify(stand)}; lookout ${JSON.stringify(look)}; tip ${TIP}`);
for (const label of bands) {
  const b = SWELL_BANDS.find((x) => x.label === label)!;
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = b.ft; c.swell.periodS = b.periodS; c.swell.directionDeg = 225; c.tideM = tide;
  const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS), set = waves.filter((w) => w.slot === waves[0].slot);
  const big = set.reduce((a, w) => (w.heightM > a.heightM ? w : a));
  const ts = times.map((t) => +(big.arrivalS + t).toFixed(2));
  console.log(`# ${label}: slot ${big.slot}, biggest ${big.heightM.toFixed(2)} m reaches the tip at ${big.arrivalS.toFixed(2)} s`);
  for (const [name, camera] of [['dtl', dtl], ['stand', look], ['lineup', lineup]] as const)
    console.log(`npx electron tools/captureMoments.mjs --base=${base} --out=${out}/${label}-tide${tide}-${name} --times=${ts.join(',')} --m=${b64({ conditions: c, camera, simTime: ts[0], paused: true })}`);
}
