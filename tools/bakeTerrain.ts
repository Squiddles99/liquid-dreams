// Bakes the terrarium tiles into public/terrain/womb-land.bin (spec 2026-09-28-the-view-back-design.md §4.2).
// Run from the repo root:  node tools/bakeTerrain.ts <tile folder>
// The folder holds <zoom>/<x>_<y>.png (zoom 15 for the fine grid, 12 for the ring). The tiles are never committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FINE_GRID, RING_GRID, SKY_GRID, type TileMosaic, gridSampler, gridWaterlines, sampleGrid, skyViewGrid, tileRange } from '../src/land/bake.ts';
import { decodeLandFile, encodeLandFile } from '../src/land/landData.ts';
import { decodePng, terrariumHeight } from '../src/land/png.ts';

async function mosaic(dir: string, zoom: number, grid: typeof FINE_GRID): Promise<TileMosaic> {
  const r = tileRange(grid, zoom);
  const cols = r.tx1 - r.tx0 + 1, rows = r.ty1 - r.ty0 + 1, w = cols * 256;
  const heights = new Float32Array(w * rows * 256);
  for (let ty = r.ty0; ty <= r.ty1; ty++) {
    for (let tx = r.tx0; tx <= r.tx1; tx++) {
      const file = join(dir, String(zoom), `${tx}_${ty}.png`);
      const png = await decodePng(new Uint8Array(readFileSync(file)));
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const p = (j * 256 + i) * 4;
          heights[((ty - r.ty0) * 256 + j) * w + (tx - r.tx0) * 256 + i] = terrariumHeight(png.rgba[p], png.rgba[p + 1], png.rgba[p + 2]);
        }
      }
    }
  }
  return { zoom, tx0: r.tx0, ty0: r.ty0, cols, rows, heights };
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/bakeTerrain.ts <tile folder>'); process.exit(2); }
const fineHeights = sampleGrid(await mosaic(dir, 15, FINE_GRID), FINE_GRID);
const ringHeights = sampleGrid(await mosaic(dir, 12, RING_GRID), RING_GRID);
const fineWaterline = gridWaterlines(FINE_GRID, fineHeights, 12);
const ringWaterline = gridWaterlines(RING_GRID, ringHeights, 3);
const skyView = skyViewGrid(gridSampler(FINE_GRID, fineHeights), SKY_GRID);
const bytes = encodeLandFile({ fine: FINE_GRID, ring: RING_GRID, sky: SKY_GRID, fineHeights, ringHeights, skyView, fineWaterline, ringWaterline });
decodeLandFile(bytes); // self-check
const row0 = Math.round((0 - FINE_GRID.z0) / FINE_GRID.cellM);
const womb = fineWaterline[row0];
console.log(`waterline at z = 0: ${womb.toFixed(1)} m (checkpoint 190 ± 30)`);
for (const z of [-3000, -2000, -1000, -500, 500, 1000, 2000, 3000]) {
  console.log(`  z = ${z}: ${fineWaterline[Math.round((z - FINE_GRID.z0) / FINE_GRID.cellM)].toFixed(1)} m`);
}
if (!(Math.abs(womb - 190) <= 30)) { console.error('Womb checkpoint failed'); process.exit(1); }
mkdirSync('public/terrain', { recursive: true });
writeFileSync('public/terrain/womb-land.bin', bytes);
console.log(`wrote public/terrain/womb-land.bin (${(bytes.length / 1e6).toFixed(2)} MB)`);
