// inner-shelf Task 0: where the coast field focuses the swell over the hand-set inner shelf (x from the waterline to the
// traced 10 m line, z −1 500…+600), mid tide, 15 s, 225°, the game's refraction floor. Per 20 m of z: the cells with
// amp > 1.5, their distance off the waterline, depth and amp, the swell's heading there, and the 10 m line's distance
// off the waterline and bearing (° west of north-south, + where the line runs out to sea going north); then an ASCII map
// of amp at 20 m per character (north up): ' ' land, '.' < 1.2, '-' < 1.5, '+' < 1.8, '#' < 2.2, '@' ≥ 2.2, 'x' beyond
// the 10 m line (not shown).
// npx node tools/_innerShelf.ts [--params='{"innerShelfDeepM":11}'] [--z=-1500,600]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const bathy = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const cm = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const cf = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const cc = await imp<typeof import('../src/seabed/coastContours')>('/src/seabed/coastContours.ts');
const fld = await imp<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const params = { ...cf.DEFAULT_COAST_PARAMS, ...JSON.parse(arg('params') ?? '{}') };
const [zA, zB] = (arg('z') ?? '-1500,600').split(',').map(Number);
const coast = fld.computeCoastField({ bed: cm.buildCoastMap(bathy.downsample(bathy.buildBathymetry(), 4), params), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
const g = coast.grid, L10 = cc.COAST_CONTOURS[0];
const idx = (x: number, z: number) => Math.round((z - g.z0) / g.cellM) * g.nx + Math.round((x - g.x0) / g.cellM);
const deg = (a: number) => (a * 180) / Math.PI;
console.log(`coast params ${JSON.stringify(params)}`);
console.log('z band      | cells amp>1.5 | s range   | depth      | amp max (at s) | heading°  | 10 m line s, bearing°');
for (let z0 = zA; z0 < zB; z0 += 20) {
  let n = 0, sLo = Infinity, sHi = -Infinity, dLo = Infinity, dHi = -Infinity, aMax = 0, aS = 0, hd = 0;
  for (let z = z0; z < z0 + 20; z += g.cellM) {
    const shore = cc.waterlineX(z), x10 = cc.contourXAt(L10, z);
    for (let x = Math.ceil((x10 - g.x0) / g.cellM) * g.cellM + g.x0; x < shore; x += g.cellM) {
      const i = idx(x, z), a = coast.amp[i];
      if (a <= 1.5 || coast.depth[i] <= 0) continue;
      const s = shore - x;
      n++; sLo = Math.min(sLo, s); sHi = Math.max(sHi, s); dLo = Math.min(dLo, coast.depth[i]); dHi = Math.max(dHi, coast.depth[i]);
      if (a > aMax) { aMax = a; aS = s; hd = deg(Math.atan2(coast.dirZ[i], coast.dirX[i])); }
    }
  }
  const zc = z0 + 10, s10 = cc.waterlineX(zc) - cc.contourXAt(L10, zc);
  const bearing = deg(Math.atan2(cc.contourXAt(L10, zc - 25) - cc.contourXAt(L10, zc + 25), 50)); // + : the line runs west (out) going north
  if (!n) { console.log(`${String(z0).padStart(6)}…${String(z0 + 20).padStart(5)} |             0 |           |            |                |           | ${s10.toFixed(0).padStart(4)} m ${bearing.toFixed(1).padStart(6)}`); continue; }
  console.log(`${String(z0).padStart(6)}…${String(z0 + 20).padStart(5)} | ${String(n).padStart(13)} | ${sLo.toFixed(0).padStart(3)}–${sHi.toFixed(0).padEnd(4)} | ${dLo.toFixed(2)}–${dHi.toFixed(2)} | ${aMax.toFixed(2)} (${aS.toFixed(0).padStart(3)} m)   | ${hd.toFixed(1).padStart(8)} | ${s10.toFixed(0).padStart(4)} m ${bearing.toFixed(1).padStart(6)}`);
}
console.log('\namp map, 20 m per char, x −900…+120 (west left), north up');
for (let z = zA; z < zB; z += 20) {
  let line = '';
  for (let x = -900; x < 120; x += 20) {
    const shore = cc.waterlineX(z);
    if (x >= shore) { line += ' '; continue; }
    if (x < cc.contourXAt(L10, z)) { line += 'x'; continue; }
    const a = coast.amp[idx(x, z)];
    line += a < 1.2 ? '.' : a < 1.5 ? '-' : a < 1.8 ? '+' : a < 2.2 ? '#' : '@';
  }
  console.log(`${String(z).padStart(6)} ${line}`);
}
