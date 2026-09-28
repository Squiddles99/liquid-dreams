import { smoothstep } from '../math/smoothstep';
import { valueNoise2 } from '../seabed/noise';
import type { BeachProfile } from './landHeight';

/**
 * What covers the ground (spec §4.6): wet + sand + rock + heath = 1; rockGrey 0 = rust, 1 = weathered grey; weed = the
 * share of the rock that is the weed-covered shore platform (green), the rest bare limestone.
 */
export interface Cover {
  wet: number;
  sand: number;
  rock: number;
  heath: number;
  rockGrey: number;
  weed: number;
  /** Where the toe's clumps may lie, and the dune rise's bushes and boulders (1 inside each band): the shader redraws them per pixel. */
  toeBand: number;
  duneBand: number;
  /** The share of `rock` that is the toe's clumps and the dune's boulders here, and of `heath` the dune's bushes. */
  clumpRock: number;
  bushes: number;
}

/** [0, 1] noise from the seabed's value noise. */
const n01 = (x: number, z: number, seed: number): number => 0.5 + 0.5 * valueNoise2(x, z, seed);

/** The first dune rise, inland of the toe: mostly sand with bush clumps and boulders; the heath starts above it. */
export const DUNE_FACE_M = 35;

/**
 * The cover at d m inland of the waterline, on ground of this slope (1 − normal.y), at (x, z) and this height, after
 * Andrew's aerial (2026-09-28): weedy shore rock at the waterline along most of the coast (sandy gaps between), wet then
 * dry sand, the rust limestone toe in clumps, the first dune rise (mostly sand, a third bush clumps, some boulders), then
 * heath with pale blowouts and grey outcrops on steep faces.
 */
export function coverAt(d: number, slope: number, x: number, z: number, heightM: number, p: BeachProfile): Cover {
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM, duneEnd = toeEnd + DUNE_FACE_M;
  const shoreRock = smoothstep(0.3, 0.42, n01(0.5, z / 80, 421)) * (1 - smoothstep(4, 8, d));
  let wet = (1 - smoothstep(wetEnd - 2, wetEnd + 2, d)) * (1 - shoreRock);
  // The toe's limestone lies in clumps with sand between them (Andrew's inside-shelf aerial), not a continuous band.
  const clumps = smoothstep(0.3, 0.5, n01(x / 9, z / 9, 424));
  const toe = smoothstep(dryEnd - 2, dryEnd + 2, d) * (1 - smoothstep(toeEnd - 2, toeEnd + 4, d)) * clumps;
  const heathZone = smoothstep(duneEnd - 5, duneEnd + 10, d);
  const duneZone = smoothstep(toeEnd - 3, toeEnd + 3, d) * (1 - heathZone);
  const bushes = duneZone * smoothstep(0.58, 0.66, n01(x / 7, z / 7, 425));
  const boulders = duneZone * (1 - bushes) * smoothstep(0.7, 0.78, n01(x / 5, z / 5, 426));
  const blowout = heathZone * smoothstep(0.62, 0.72, n01(x / 45, z / 45, 422)) * smoothstep(0.25, 0.45, slope);
  const outcrop = heathZone * (1 - blowout) * smoothstep(0.45, 0.6, slope) * smoothstep(0.55, 0.65, n01(x / 25, z / 25, 423));
  const toeBand = smoothstep(dryEnd - 2, dryEnd + 2, d) * (1 - smoothstep(toeEnd - 2, toeEnd + 4, d)) * (1 - duneZone - heathZone);
  const shore = shoreRock * (1 - toe) * (1 - duneZone - heathZone);
  const bare = toe * (1 - duneZone - heathZone) + outcrop + boulders;
  let rock = Math.max(toe * (1 - duneZone - heathZone), shore) + outcrop + boulders;
  let heath = heathZone * (1 - blowout - outcrop) + bushes;
  let sand = Math.max(0, 1 - wet - rock - heath);
  const total = wet + sand + rock + heath;
  wet /= total; sand /= total; rock /= total; heath /= total;
  const weed = shore + bare > 1e-6 ? shore / (shore + bare) : 0;
  const toeRock = toe * (1 - duneZone - heathZone);
  const clumpRock = Math.min(rock, (toeRock + boulders) / total);
  return { wet, sand, rock, heath, rockGrey: smoothstep(8, 25, heightM), weed, toeBand, duneBand: duneZone, clumpRock, bushes: Math.min(heath, bushes / total) };
}
