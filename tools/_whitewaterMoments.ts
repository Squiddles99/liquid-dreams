// whitewater Task 0: the segment's A/B moments. M-beach: the stand's lookout camera (frontEnd's Conditions camera), 10 ft,
// tide 0, seed 2002, 18 kn from 90°, 09:30, at the biggest wave of the first set after 300 s, `--times` s after it reaches
// the tip (wombReef.TIP). M-tube: a free camera 3 m up, 100 m down the line from the tip looking back at it (_retuneMoments'
// dtl): the closest moment camera to the ride's behind/tube view. high: a drone 30 m up over the inside (photo 4); side: 55 m down the line, 1.5 m up (photo 5). Printed as captureMoments.mjs lines and base64url #m= links.
// npx node tools/_whitewaterMoments.ts [--ft=10] [--period=15] [--wind=18,90] [--hour=9.5] [--times=3,4,5] [--base=http://localhost:5174/] [--out=<dir>]
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesBetween } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { TIP, LEFT_BEARING_DEG } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { decodeLandFile } = await imp<typeof import('../src/land/landData')>('/src/land/landData.ts');
const { LandHeight } = await imp<typeof import('../src/land/landHeight')>('/src/land/landHeight.ts');
const { TrackNetwork, routeTracks } = await imp<typeof import('../src/land/tracks')>('/src/land/tracks.ts');
const { landSpots } = await imp<typeof import('../src/surfer/placement')>('/src/surfer/placement.ts');
const { lookoutShot } = await imp<typeof import('../src/frontend/beatCamera')>('/src/frontend/beatCamera.ts');
const { encodeMoment } = await imp<typeof import('../src/dev/momentLink')>('/src/dev/momentLink.ts');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5174/', out = arg('out') ?? '../liquid-dreams-captures/whitewater-2026-10-10';
const ft = Number(arg('ft') ?? 10), periodS = Number(arg('period') ?? 15), hour = Number(arg('hour') ?? 9.5), tide = Number(arg('tide') ?? 0);
const [windKn, windFrom] = (arg('wind') ?? '18,90').split(',').map(Number);
const times = (arg('times') ?? '3,4,5').split(',').map(Number), label = arg('label') ?? 'M';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

const lh = new LandHeight(decodeLandFile(new Uint8Array(readFileSync('public/terrain/womb-land.bin'))));
lh.setTracks(new TrackNetwork(routeTracks(lh, lh.fineZRange())));
const look = lookoutShot(landSpots(lh, lh.profile).standSpot, (x, z) => lh.heightAt(x, z));
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
const cam = [TIP[0] + 100 * along[0] + 20 * inshore[0], TIP[1] + 100 * along[1] + 20 * inshore[1]], at = [TIP[0] + 30 * along[0], TIP[1] + 30 * along[1]];
const tube = { mode: 'free', position: [+cam[0].toFixed(1), 3, +cam[1].toFixed(1)], yawDeg: +(((Math.atan2(at[0] - cam[0], -(at[1] - cam[1])) * 180) / Math.PI + 360) % 360).toFixed(1), pitchDeg: -3 };
// High (Task 8, photo 4's drone): 30 m up over the inside, 45 m shoreward of the line, looking down at the section.
const hp = [TIP[0] + 40 * along[0] + 45 * inshore[0], TIP[1] + 40 * along[1] + 45 * inshore[1]], hat = [TIP[0] + 30 * along[0], TIP[1] + 30 * along[1]];
const high = { mode: 'free', position: [+hp[0].toFixed(1), 30, +hp[1].toFixed(1)], yawDeg: +(((Math.atan2(hat[0] - hp[0], -(hat[1] - hp[1])) * 180) / Math.PI + 360) % 360).toFixed(1), pitchDeg: -35 };
// Side (Task 8, photo 5's side-on): 1.5 m up, 55 m down the line and 12 m inshore, looking at the curl's stretch.
const sp = [TIP[0] + 55 * along[0] + 12 * inshore[0], TIP[1] + 55 * along[1] + 12 * inshore[1]];
const side = { mode: 'free', position: [+sp[0].toFixed(1), 1.5, +sp[1].toFixed(1)], yawDeg: +(((Math.atan2(at[0] - sp[0], -(at[1] - sp[1])) * 180) / Math.PI + 360) % 360).toFixed(1), pitchDeg: 2 };
const c = cloneConditions(DEFAULT_CONDITIONS);
c.swell.sizeFt = ft; c.swell.periodS = periodS; c.swell.directionDeg = 225; c.tideM = tide; c.seed = 2002; c.timeOfDay = hour;
c.wind = { speedMs: windKn * 0.5144, directionDeg: windFrom };
const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS), set = waves.filter((w) => w.slot === waves[0].slot);
const big = set.reduce((a, w) => (w.heightM > a.heightM ? w : a));
const ts = times.map((t) => +(big.arrivalS + t).toFixed(2));
console.log(`# ${ft} ft ${periodS} s tide ${tide} seed 2002 ${windKn} kn from ${windFrom}° ${hour} h: slot ${big.slot}, biggest ${big.heightM.toFixed(2)} m reaches the tip at ${big.arrivalS.toFixed(2)} s`);
for (const [name, camera] of [['beach', look], ['tube', tube], ['high', high], ['side', side]] as const) {
  const m = { conditions: c, camera, simTime: ts[0], paused: true };
  console.log(`# ${label}-${name} link: ${encodeMoment(m as never)}`);
  console.log(`npx electron tools/captureMoments.mjs --base=${base} --out=${out}/${label}-${name} --times=${ts.join(',')} --m=${b64(m)}`);
}
