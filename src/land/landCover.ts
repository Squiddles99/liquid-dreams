import { smoothstep } from '../math/smoothstep';
import { valueNoise2 } from '../seabed/noise';
import type { BeachProfile } from './landHeight';

/** What covers the ground (spec §4.6): wet + sand + rock + heath = 1; rockGrey 0 = rust, 1 = weathered grey. */
export interface Cover {
  wet: number;
  sand: number;
  rock: number;
  heath: number;
  rockGrey: number;
}

/** [0, 1] noise from the seabed's value noise. */
const n01 = (x: number, z: number, seed: number): number => 0.5 + 0.5 * valueNoise2(x, z, seed);

/**
 * The cover at d m inland of the waterline, on ground of this slope (1 − normal.y), at (x, z) and this height. Wet sand to
 * the end of the wet band, dry sand to the toe, the rust limestone toe, then heath, with pale sand blowouts and grey
 * outcrops on steep faces (noise-selected) and stretches of rock at the waterline.
 */
export function coverAt(d: number, slope: number, x: number, z: number, heightM: number, p: BeachProfile): Cover {
  const wetEnd = p.wetWidthM, dryEnd = wetEnd + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM;
  const shoreRock = smoothstep(0.62, 0.75, n01(0.5, z / 80, 421)) * (1 - smoothstep(wetEnd - 4, wetEnd + 4, d));
  let wet = (1 - smoothstep(wetEnd - 2, wetEnd + 2, d)) * (1 - shoreRock);
  const toe = smoothstep(dryEnd - 2, dryEnd + 2, d) * (1 - smoothstep(toeEnd - 2, toeEnd + 4, d));
  const heathZone = smoothstep(toeEnd - 3, toeEnd + 5, d);
  const blowout = heathZone * smoothstep(0.62, 0.72, n01(x / 45, z / 45, 422)) * smoothstep(0.25, 0.45, slope);
  const outcrop = heathZone * (1 - blowout) * smoothstep(0.45, 0.6, slope) * smoothstep(0.55, 0.65, n01(x / 25, z / 25, 423));
  let rock = Math.max(toe, shoreRock * (1 - toe)) * (1 - heathZone) + outcrop;
  let heath = heathZone * (1 - blowout - outcrop);
  let sand = Math.max(0, 1 - wet - rock - heath);
  const total = wet + sand + rock + heath;
  wet /= total; sand /= total; rock /= total; heath /= total;
  return { wet, sand, rock, heath, rockGrey: smoothstep(8, 25, heightM) };
}
