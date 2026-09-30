/**
 * The sky map's layout (spec 2026-09-30 §4.4): a panorama of the upper hemisphere around the camera, u = world azimuth
 * (atan2(z, x), as Sky.radiance measures it) / 2π, v = sqrt(elevation / 90°) so the horizon, where most of the view
 * is, gets the most texels. Below the horizon there is no cloud (T = 1, L = 0).
 */
export const SKY_MAP = { width: 2048, height: 768 } as const;
/** The 4×-downsampled copy that reflections and the sky-light integration read (less aliasing on rough water). */
export const SKY_MAP_SMALL = { width: 512, height: 192 } as const;
/** Frames to march every texel once: a 4×4 ordered pattern, one texel of each 4×4 block a frame. */
export const SLICES = 16;

/** Bayer 4×4: the frame (0..15) at which each position in a block is marched. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The position in a block marched at frame k: [ox, oy]. */
export const SLICE_OFFSETS: ReadonlyArray<readonly [number, number]> = Array.from({ length: SLICES }, (_, k) => {
  const i = BAYER4.indexOf(k);
  return [i % 4, Math.floor(i / 4)] as const;
});

export function skyMapUv(elevation: number, azimuth: number): { u: number; v: number } {
  const turns = azimuth / (2 * Math.PI);
  return { u: turns - Math.floor(turns), v: Math.sqrt(Math.max(elevation, 0) / (Math.PI / 2)) };
}

export function skyMapDir(u: number, v: number): [number, number, number] {
  const el = v * v * (Math.PI / 2), az = u * 2 * Math.PI;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

/** The texel that thread i marches in slice k, for a map `width` texels wide (a multiple of 4). */
export function sliceTexel(k: number, i: number, width: number): [number, number] {
  const blocks = width / 4;
  const [ox, oy] = SLICE_OFFSETS[k % SLICES];
  return [(i % blocks) * 4 + ox, Math.floor(i / blocks) * 4 + oy];
}
