// tools/bakeBreakMap.ts: bakes the map of the break (spec §7) from our own land and reef. Run from the repo root:
//   npm run bake:map   → public/ui/breakMap.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const { module: geom } = await runnerImport<typeof import('../src/frontend/mapGeom')>('/src/frontend/mapGeom.ts');
const { module: landData } = await runnerImport<typeof import('../src/land/landData')>('/src/land/landData.ts');
const { module: bathy } = await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { module: reef } = await runnerImport<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { module: landHeight } = await runnerImport<typeof import('../src/land/landHeight')>('/src/land/landHeight.ts');

const land = landData.decodeLandFile(new Uint8Array(readFileSync('public/terrain/womb-land.bin')));
const bed = bathy.buildBathymetry(reef.RESHAPED_REEF_PARAMS);
// The land as the game shapes it (the waterline pinned at the reef, the hand-made beach), not the raw file.
const ground = new landHeight.LandHeight(land);
const { MAP, worldToMap, mapCentre } = geom;
const STEP_PX = 2, PAD = 2; // sample every 2 map px (9.2 m), padded so every contour closes
const mainW = MAP.w - MAP.insetW, nx = Math.ceil(mainW / STEP_PX) + 1 + 2 * PAD, nz = Math.ceil(MAP.h / STEP_PX) + 1 + 2 * PAD;
const c = mapCentre();
const worldOf = (i: number, j: number): [number, number] => [c.x + ((i - PAD) * STEP_PX - mainW / 2) * MAP.mPerPx, c.z + ((j - PAD) * STEP_PX - MAP.h / 2) * MAP.mPerPx];
const pxOf = ([i, j]: [number, number]): [number, number] => [(i - PAD) * STEP_PX, (j - PAD) * STEP_PX];

function field(sample: (x: number, z: number) => number | null, padValue: number): Float32Array {
  const v = new Float32Array(nx * nz).fill(padValue);
  for (let j = PAD; j < nz - PAD; j++) for (let i = PAD; i < nx - PAD; i++) {
    const [x, z] = worldOf(i, j);
    v[j * nx + i] = sample(x, z) ?? padValue;
  }
  return v;
}
const landH = (x: number, z: number) => ground.heightAt(x, z);
const seabed = (x: number, z: number) => geom.bilinear(bed.grid, bed.bed, x, z);
const path = (v: Float32Array, level: number, closed: boolean, tol = 0.6) =>
  geom.toPath(geom.contours(v, nx, nz, level).map((l) => geom.simplify(l.map(pxOf), tol)).filter((l) => l.length > 2), closed);

// The land's fill closes along the view's edge (padded low); the beach, the dune line and the reef's depth contours stop
// at the edge of their data (NaN), so no line runs along the view's or the reef grid's border.
const landField = field(landH, -1000), landLines = field(landH, NaN);
const deep = field((x, z) => { const b = seabed(x, z); return b === null ? null : -b; }, NaN);
const [px, py] = worldToMap(-25, 45);

// The inset: the whole ring's coastline (0 m) squeezed into the 78 px strip, the main view boxed in orange.
const R = land.ring, rnx = R.nx + 2, rnz = R.nz + 2, ringField = new Float32Array(rnx * rnz).fill(-1000);
for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) ringField[(j + 1) * rnx + i + 1] = land.ringHeights[j * R.nx + i];
const sx = (MAP.insetW - 12) / (R.nx * R.cellM), sy = (MAP.h - 40) / (R.nz * R.cellM), s = Math.min(sx, sy);
const inset = (wx: number, wz: number): [number, number] => [mainW + 6 + (wx - R.x0) * s, 20 + (wz - R.z0) * s];
const coast = geom.toPath(geom.contours(ringField, rnx, rnz, 0).map((l) => geom.simplify(l.map(([i, j]) => inset(R.x0 + (i - 1) * R.cellM, R.z0 + (j - 1) * R.cellM)), 0.4)).filter((l) => l.length > 2), false);
const [bx0, by0] = inset(c.x - (mainW / 2) * MAP.mPerPx, c.z - (MAP.h / 2) * MAP.mPerPx), [bx1, by1] = inset(c.x + (mainW / 2) * MAP.mPerPx, c.z + (MAP.h / 2) * MAP.mPerPx);

const data = {
  reef: { d3: path(deep, 3, false), d6: path(deep, 6, false), d9: path(deep, 9, false) },
  land: path(landField, 0, true), beach: path(landLines, 0, false), dune20: path(landLines, 20, false, 0.8),
  peak: [Math.round(px * 10) / 10, Math.round(py * 10) / 10],
  reefEdgeY: [worldToMap(0, bed.grid.z0 + (bed.grid.nz - 1) * bed.grid.cellM)[1], worldToMap(0, bed.grid.z0)[1]].map((v) => Math.round(v * 10) / 10),
  inset: { coast, box: [bx0, by0, bx1 - bx0, by1 - by0].map((v) => Math.round(v * 10) / 10), north: 'GRACETOWN', south: 'MARGARET R.' },
};
mkdirSync('public/ui', { recursive: true });
writeFileSync('public/ui/breakMap.json', JSON.stringify(data));
console.log(`breakMap.json: ${(JSON.stringify(data).length / 1024).toFixed(1)} KB`);
