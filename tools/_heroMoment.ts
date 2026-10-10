// surf-map hub: the break details page's hero, a shot from the beach in ideal conditions (Andrew 2026-10-10: not the
// tube cam). Finds the beach inshore of the Womb's tip, puts a standing eye on it looking at the take-off, and prints
// captureMoments.mjs lines for the biggest wave of a set at a few times after it reaches the tip.
// npx node tools/_heroMoment.ts [--down=25] [--look=25] [--fov=0 (the game's)] [--pitch=1] [--from=247] [--band=Pumping] [--tide=0] [--times=1,2,3,4] [--eye=1.7] [--base=http://localhost:5173/] [--out=…]
import { readFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { DEFAULT_SET_PARAMS, wavesBetween } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { SWELL_BANDS } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { TIP, LEFT_BEARING_DEG } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { decodeLandFile } = await imp<typeof import('../src/land/landData')>('/src/land/landData.ts');
const { LandHeight } = await imp<typeof import('../src/land/landHeight')>('/src/land/landHeight.ts');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const from = Number(arg('from') ?? 247), band = arg('band') ?? 'Pumping', tide = Number(arg('tide') ?? 0), eye = Number(arg('eye') ?? 1.7);
const times = (arg('times') ?? '1,2,3,4').split(',').map(Number), base = arg('base') ?? 'http://localhost:5173/';
const out = arg('out') ?? '../liquid-dreams-captures/hero';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
const lh = new LandHeight(decodeLandFile(new Uint8Array(readFileSync('public/terrain/womb-land.bin'))));
const br = (LEFT_BEARING_DEG * Math.PI) / 180, along = [Math.sin(br), -Math.cos(br)], inshore = [Math.cos(br), Math.sin(br)];
// The beach: the dry ground (0.4 m above the tide) nearest that point, searched on a 2 m grid.
// --down: the shore nearest a point that far down the line (a left is shot from down the beach, looking back up the
// line into the tube); --look: the point on the line the camera looks at.
const down = Number(arg('down') ?? 25), look = Number(arg('look') ?? 25), fov = Number(arg('fov') ?? 0);
const at0 = [TIP[0] + down * along[0], TIP[1] + down * along[1]];
let beach: [number, number] | null = null, ground = 0, best = Infinity;
for (let dx = -400; dx <= 400; dx += 2) for (let dz = -400; dz <= 400; dz += 2) {
  const x = at0[0] + dx, z = at0[1] + dz, h = lh.heightAt(x, z), d = Math.hypot(dx, dz);
  if (h !== null && Number.isFinite(h) && h > tide + 0.4 && d < best) { best = d; beach = [x, z]; ground = h; }
}
if (!beach) throw new Error('no beach found inshore of the tip');
const at = [TIP[0] + look * along[0], TIP[1] + look * along[1]];
const yawDeg = +(((Math.atan2(at[0] - beach[0], -(at[1] - beach[1])) * 180) / Math.PI + 360) % 360).toFixed(1);
const camera = { mode: 'free', position: [+beach[0].toFixed(1), +(ground + eye).toFixed(2), +beach[1].toFixed(1)], yawDeg, pitchDeg: Number(arg('pitch') ?? 1) };
const b = SWELL_BANDS.find((x) => x.label === band)!, c = cloneConditions(DEFAULT_CONDITIONS);
c.swell.sizeFt = b.ft; c.swell.periodS = b.periodS; c.swell.directionDeg = from; c.tideM = tide;
c.wind.speedMs = 3; c.wind.directionDeg = 90;
const waves = wavesBetween(300, 900, c, DEFAULT_SET_PARAMS), set = waves.filter((w) => w.slot === waves[0].slot);
const big = set.reduce((a, w) => (w.heightM > a.heightM ? w : a));
const ts = times.map((t) => +(big.arrivalS + t).toFixed(2));
console.log(`# beach ${beach.map((v) => v.toFixed(1))} ground ${ground.toFixed(2)} m, ${Math.hypot(beach[0] - TIP[0], beach[1] - TIP[1]).toFixed(0)} m from the tip; yaw ${yawDeg}`);
const pre = fov ? ` "--pre=(() => { const c = window.liquidDreams.camera; c.fov = ${fov}; c.updateProjectionMatrix(); })()"` : '';
console.log(`npx electron tools/captureMoments.mjs --base=${base} --out=${out}/${band}-${from}-tide${tide} --times=${ts.join(',')} --m=${b64({ conditions: c, camera, simTime: ts[0], paused: true })}${pre}`);
