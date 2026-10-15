import type { WaterAt, WaterFn } from './water';

/**
 * Where the face pays (ride-speed spec §6): gravity's push along the trim heading, the line turned TRIM_DOWN_DEG down the
 * face (the coaching trim line runs a little downhill). A dev view: what the face can give a rider at each spot, before
 * any tuning.
 */
export const TRIM_DOWN_DEG = 20;
const G = 9.81, DEG = Math.PI / 180;

export function trimAccel(w: WaterAt, lineSign: 1 | -1): number {
  if (!Number.isFinite(w.slopeX) || !Number.isFinite(w.slopeZ)) return 0;
  // The line runs across the wave's travel; down the face is along the travel (the face drops toward the shore).
  const lx = -w.dirZ * lineSign, lz = w.dirX * lineSign, k = Math.cos(TRIM_DOWN_DEG * DEG), d = Math.sin(TRIM_DOWN_DEG * DEG);
  const hx = k * lx + d * w.dirX, hz = k * lz + d * w.dirZ;
  const s2 = w.slopeX * w.slopeX + w.slopeZ * w.slopeZ;
  return (-G * (w.slopeX * hx + w.slopeZ * hz)) / (1 + s2);
}

/** trimAccel on a square grid around (x, z), in the line (i) / travel (j) frame. */
export function energyGrid(water: WaterFn, x: number, z: number, lineSign: 1 | -1, halfM = 20, stepM = 1): { size: number; values: Float32Array; lineX: number; lineZ: number } {
  const w0 = water(x, z), lineX = -w0.dirZ * lineSign, lineZ = w0.dirX * lineSign;
  const n = Math.round(halfM / stepM), size = 2 * n + 1, values = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const a = (i - n) * stepM, t = (j - n) * stepM; // a along the line, t along the travel
      const v = trimAccel(water(x + a * lineX + t * w0.dirX, z + a * lineZ + t * w0.dirZ), lineSign);
      values[j * size + i] = Number.isFinite(v) ? v : 0;
    }
  }
  return { size, values, lineX, lineZ };
}
