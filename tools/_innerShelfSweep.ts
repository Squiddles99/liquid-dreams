// inner-shelf Task 1: sweep the inner shelf's deepening (coastMap.InnerShelfDeep) over D (m at the peak row) × the north
// flank's half-width (m), the south flank ending at the Womb's halo (z −750). Per pick, mid tide, 15 s, 225°, the game's
// refraction floor: the breaking cells outside the four breaks, the shore band and the Cobblestones approach ('elsewhere')
// at each size, and where they are.
// npx node tools/_innerShelfSweep.ts [--d=9,10,11,12,13] [--w=200,300,400] [--peak=-950] [--sizes=4,6,8,10]
//   [--also='[{"depthM":10,"zNorth":600,"zPeak":800,"zSouth":1000}]'] (more deepenings, as coastMap.InnerShelfDeep)
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const nums = (s: string) => s.split(',').map(Number);
const bathy = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const cm = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const cf = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const fld = await imp<typeof import('../src/breaker/coastField')>('/src/breaker/coastField.ts');
const cb = await imp<typeof import('../src/breaker/coastBreaking')>('/src/breaker/coastBreaking.ts');
const br = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const rf = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const rr = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const reef = bathy.downsample(bathy.buildBathymetry(), 4), P = br.DEFAULT_BREAK_PARAMS;
const peak = Number(arg('peak') ?? -950), sizes = nums(arg('sizes') ?? '4,6,8,10');
console.log(`D m | north half-width m | ${sizes.map((s) => `${s} ft elsewhere (z range)`).join(' | ')}`);
for (const D of nums(arg('d') ?? '9,10,11,12,13')) for (const w of nums(arg('w') ?? '200,300,400')) {
  const deep = [{ depthM: D, zNorth: peak - w, zPeak: peak, zSouth: -750 }, ...JSON.parse(arg('also') ?? '[]')];
  const coast = fld.computeCoastField({ bed: cm.buildCoastMap(reef, cf.DEFAULT_COAST_PARAMS, deep), periodS: 15, fromDeg: 225, tideM: 0, refractFloorM: rf.REFRACT_FLOOR_M });
  const g = coast.grid, cols: string[] = [];
  for (const ft of sizes) {
    const H = rr.setWaveHeight(ft), broken = cb.coastBreakingCells(coast, H, P), bands = cb.shoreBands(coast, H, P);
    let n = 0, z0 = Infinity, z1 = -Infinity;
    for (let r = 0; r < g.nz; r++) for (let c = 0; c < g.nx; c++) {
      const i = r * g.nx + c;
      if (!broken[i] || coast.depth[i] <= 0) continue;
      const z = g.z0 + r * g.cellM;
      if (cb.breakZone(g.x0 + c * g.cellM, z, bands[r]) !== 'elsewhere') continue;
      n++; z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    cols.push(`${String(n).padStart(5)}${n ? ` (${z0}…${z1})` : ''}`);
  }
  console.log(`${String(D).padStart(3)} | ${String(w).padStart(18)} | ${cols.join(' | ')}`);
}
