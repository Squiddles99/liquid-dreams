// lineup-truth Task 4: where a set breaks on the coast field, per size. For each of 4, 6, 8, 10, 12 ft (mid tide, 15 s,
// 225°, the game's refraction floor): the set height, the breaking cells per zone (the four breaks' footprints, the 60 m
// shore band, elsewhere = a closeout) and an ASCII map at 40 m per character (north up): '#' breaking outside every
// footprint and the shore band, 'L' 'W' 'B' 'E' breaking in Lefthanders', the Womb's, the Bombie's or Ellensbrook's
// footprint, 's' breaking in the shore band, 'C' on the Cobblestones approach, '.' sea, ' ' land.
// npx node tools/_coastBreaks.ts [--sizes=4,6,8,10,12] [--params='{"bombieTopM":5}']
import { runnerImport } from 'vite';
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: cm } = await runnerImport<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { module: cf } = await runnerImport<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { module: cc } = await runnerImport<typeof import('../src/seabed/coastContours')>('/src/seabed/coastContours.ts');
const { module: fld } = await runnerImport<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const { module: cb } = await runnerImport<typeof import('../src/breaker/coastBreaking')>('/src/breaker/coastBreaking.ts');
const { module: br } = await runnerImport<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { module: rf } = await runnerImport<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { module: rr } = await runnerImport<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const sizes = (arg('sizes') ?? '4,6,8,10,12').split(',').map(Number);
const params = { ...cf.DEFAULT_COAST_PARAMS, ...JSON.parse(arg('params') ?? '{}') };
const reef = bathy.downsample(bathy.buildBathymetry(), 4);
const coast = fld.computeCoastField({ bed: cm.buildCoastMap(reef, params), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
const g = coast.grid, STEP = 10; // cells per character: 40 m
const mark: Record<string, string> = { lefthanders: 'L', womb: 'W', bombie: 'B', ellensbrook: 'E', shore: 's', cobblestones: 'C', elsewhere: '#' };
console.log(`coast params ${JSON.stringify(params)}`);
for (const ft of sizes) {
  const H = rr.setWaveHeight(ft);
  const broken = cb.coastBreakingCells(coast, H, br.DEFAULT_BREAK_PARAMS);
  const r = cb.reportBreaking(coast, broken);
  console.log(`\n${ft} ft: set wave ${H.toFixed(2)} m; breaking cells ${JSON.stringify(r.cells)}; Bombie crest ${r.bombieCrestM.toFixed(0)} m`);
  if (r.closeouts.length) console.log(`  first closeouts: ${r.closeouts.map(([x, z]) => `(${x}, ${z})`).join(' ')}`);
  for (let r0 = 0; r0 < g.nz; r0 += STEP) {
    let line = '';
    for (let c0 = 0; c0 < g.nx; c0 += STEP) {
      const x = g.x0 + (c0 + STEP / 2) * g.cellM, z = g.z0 + (r0 + STEP / 2) * g.cellM;
      let ch = cc.waterlineX(z) < x ? ' ' : '.', rank = 0;
      for (let dr = 0; dr < STEP && r0 + dr < g.nz; dr++) for (let dc = 0; dc < STEP && c0 + dc < g.nx; dc++) {
        const i = (r0 + dr) * g.nx + c0 + dc;
        if (!broken[i]) continue;
        const zone = cb.breakZone(g.x0 + (c0 + dc) * g.cellM, g.z0 + (r0 + dr) * g.cellM);
        const k = zone === 'elsewhere' ? 3 : zone === 'shore' ? 1 : 2;
        if (k > rank) { rank = k; ch = mark[zone]; }
      }
      line += ch;
    }
    console.log(`${String(g.z0 + r0 * g.cellM).padStart(6)} ${line}`);
  }
}
