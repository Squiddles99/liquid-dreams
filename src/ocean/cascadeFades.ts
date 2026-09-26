import { float, smoothstep } from 'three/tsl';

type N = any;

export type FadeRange = readonly [number, number];

export interface CascadeFade {
  /** Distance (m) over which the cascade's vertex displacement fades out. */
  geometry: FadeRange;
  /** Distance (m) over which its normals fade out (after which it only adds roughness). */
  normals: FadeRange;
}

/** One per cascade: 3000 m, 250 m, 35 m patches. */
export const CASCADE_FADES: readonly CascadeFade[] = [
  { geometry: [8000, 15000], normals: [12000, 20000] },
  { geometry: [300, 1500], normals: [2000, 8000] },
  { geometry: [20, 60], normals: [150, 600] },
];

/** 1 − smoothstep(start, end, d), matching the TSL version exactly. */
export function fadeWeight(distance: number, [start, end]: FadeRange): number {
  if (distance <= start) return 1;
  if (distance >= end) return 0;
  const t = (distance - start) / (end - start);
  return 1 - t * t * (3 - 2 * t);
}

export function fadeWeightNode(distance: N, [start, end]: FadeRange): N {
  return float(1.0).sub(smoothstep(start, end, distance));
}
