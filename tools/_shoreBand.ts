// shelf-polish Task 5: the coast's breaking cells outside the four breaks, against the shore band. Per size: every breaking
// cell not in a footprint, its distance off the waterline (s), depth, hmin, hminBreak, amp, ratio; and per row the first s
// from the waterline where the set does not break (the shore break's own extent along that row).
// npx tsx tools/_shoreBand.ts [--sizes=4,6,8] [--rows=-990,-980]
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const bathy = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const cm = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const cf = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const cc = await imp<typeof import('../src/seabed/coastContours')>('/src/seabed/coastContours.ts');
const fld = await imp<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const cb = await imp<typeof import('../src/breaker/coastBreaking')>('/src/breaker/coastBreaking.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const rr = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const P = br.DEFAULT_BREAK_PARAMS;
const coast = fld.computeCoastField({ bed: cm.buildCoastMap(bathy.downsample(bathy.buildBathymetry(), 4), cf.DEFAULT_COAST_PARAMS), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
const g = coast.grid;
for (const ft of (arg('sizes') ?? '4,6,8').split(',').map(Number)) {
  const H = rr.setWaveHeight(ft), broken = cb.coastBreakingCells(coast, H, P), bands = cb.shoreBands(coast, H, P);
  console.log(`${ft} ft: set breaking depth ${cb.setBreakingDepth(H, P).toFixed(2)} m; bands ${Math.min(...bands).toFixed(0)}-${Math.max(...bands).toFixed(0)} m`);
  const out: string[] = [];
  let maxS = 0;
  for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
    const i = r * g.nx + c, x = g.x0 + c * g.cellM, z = g.z0 + r * g.cellM;
    if (!broken[i] || coast.depth[i] <= 0) continue;
    const zone = cb.breakZone(x, z, bands[r]);
    if (zone !== 'shore' && zone !== 'elsewhere') continue;
    const s = cc.waterlineX(z) - x;
    if (zone === 'shore') { maxS = Math.max(maxS, s); continue; }
    out.push(`(${x}, ${z}) s ${s.toFixed(0)} depth ${coast.depth[i].toFixed(2)} hmin ${coast.hmin[i].toFixed(2)} hminBreak ${coast.hminBreak[i].toFixed(2)} amp ${coast.amp[i].toFixed(2)} ratio ${br.breakingRatio(H * coast.amp[i], coast.hminBreak[i], P).toFixed(3)}`);
  }
  console.log(`${ft} ft H ${H.toFixed(2)}: ${out.length} cells outside the footprints and the shore band; shore cells up to s ${maxS.toFixed(0)} m`);
  for (const l of out.slice(0, Number(arg('n') ?? 12))) console.log('  ' + l);
  // per row of the elsewhere cells: the profile from the waterline (depth, breaks?)
  for (const zr of (arg('rows') ?? '').split(',').filter(Boolean).map(Number)) {
    const r = Math.round((zr - g.z0) / g.cellM), row: string[] = [];
    for (let s = 0; s <= 260; s += 8) {
      const x = cc.waterlineX(zr) - s, c = Math.round((x - g.x0) / g.cellM), i = r * g.nx + c;
      row.push(`${s}:${coast.depth[i].toFixed(1)}${broken[i] ? '*' : ''}`);
    }
    console.log(`  row z ${zr}: ${row.join(' ')}`);
  }
}
