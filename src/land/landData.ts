/**
 * The baked land file (spec 2026-09-28-the-view-back-design.md §4.2; plan ruling P3), little-endian:
 *   u32 magic 'WLND', u32 version, 3 × grid (f32 x0, z0, cellM; u32 nx, nz): fine, ring, sky;
 *   u16 fine heights, u16 ring heights (HEIGHT_STEP_M steps, negative stored as 0); u8 sky view (/255);
 *   f32 fine waterline (per fine row), f32 ring waterline (per ring row; NaN where a row has no land).
 * No imports: tools/bakeTerrain.ts runs this under plain Node.
 */
export interface GridSpec {
  /** Sample i is at x0 + i·cellM (m), sample j at z0 + j·cellM. */
  x0: number;
  z0: number;
  cellM: number;
  nx: number;
  nz: number;
}

export interface LandFile {
  fine: GridSpec;
  ring: GridSpec;
  sky: GridSpec;
  fineHeights: Float32Array;
  ringHeights: Float32Array;
  skyView: Float32Array;
  fineWaterline: Float32Array;
  ringWaterline: Float32Array;
}

export const LAND_MAGIC = 0x444e4c57; // 'WLND' read as a little-endian u32
export const LAND_VERSION = 1;
export const HEIGHT_STEP_M = 0.05;
const GRID_BYTES = 20;
const HEADER_BYTES = 8 + 3 * GRID_BYTES;

const count = (g: GridSpec): number => g.nx * g.nz;

function byteSize(fine: GridSpec, ring: GridSpec, sky: GridSpec): number {
  return HEADER_BYTES + 2 * (count(fine) + count(ring)) + count(sky) + 4 * (fine.nz + ring.nz);
}

export function encodeLandFile(f: LandFile): Uint8Array {
  const out = new Uint8Array(byteSize(f.fine, f.ring, f.sky));
  const v = new DataView(out.buffer);
  let o = 0;
  v.setUint32(o, LAND_MAGIC, true); o += 4;
  v.setUint32(o, LAND_VERSION, true); o += 4;
  for (const g of [f.fine, f.ring, f.sky]) {
    v.setFloat32(o, g.x0, true); v.setFloat32(o + 4, g.z0, true); v.setFloat32(o + 8, g.cellM, true);
    v.setUint32(o + 12, g.nx, true); v.setUint32(o + 16, g.nz, true);
    o += GRID_BYTES;
  }
  for (const hs of [f.fineHeights, f.ringHeights]) {
    for (let i = 0; i < hs.length; i++) {
      v.setUint16(o, Math.min(65535, Math.round(Math.max(0, hs[i]) / HEIGHT_STEP_M)), true);
      o += 2;
    }
  }
  for (let i = 0; i < f.skyView.length; i++) out[o++] = Math.round(Math.min(1, Math.max(0, f.skyView[i])) * 255);
  for (const w of [f.fineWaterline, f.ringWaterline]) {
    for (let i = 0; i < w.length; i++) { v.setFloat32(o, w[i], true); o += 4; }
  }
  return out;
}

export function decodeLandFile(bytes: Uint8Array): LandFile {
  if (bytes.length < HEADER_BYTES) throw new Error('land file: size too small for the header');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== LAND_MAGIC) throw new Error('land file: bad magic');
  if (v.getUint32(4, true) !== LAND_VERSION) throw new Error(`land file: version ${v.getUint32(4, true)}, expected ${LAND_VERSION}`);
  let o = 8;
  const grids: GridSpec[] = [];
  for (let k = 0; k < 3; k++) {
    grids.push({ x0: v.getFloat32(o, true), z0: v.getFloat32(o + 4, true), cellM: v.getFloat32(o + 8, true), nx: v.getUint32(o + 12, true), nz: v.getUint32(o + 16, true) });
    o += GRID_BYTES;
  }
  const [fine, ring, sky] = grids;
  if (bytes.length !== byteSize(fine, ring, sky)) throw new Error(`land file: size ${bytes.length}, expected ${byteSize(fine, ring, sky)}`);
  const heights = (n: number): Float32Array => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) { a[i] = v.getUint16(o, true) * HEIGHT_STEP_M; o += 2; }
    return a;
  };
  const fineHeights = heights(count(fine)), ringHeights = heights(count(ring));
  const skyView = new Float32Array(count(sky));
  for (let i = 0; i < skyView.length; i++) skyView[i] = bytes[o++] / 255;
  const floats = (n: number): Float32Array => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) { a[i] = v.getFloat32(o, true); o += 4; }
    return a;
  };
  return { fine, ring, sky, fineHeights, ringHeights, skyView, fineWaterline: floats(fine.nz), ringWaterline: floats(ring.nz) };
}
