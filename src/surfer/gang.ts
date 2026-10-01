import type { CameraPose } from '../dev/momentLink';
import { type LandSpot, headingAxes } from './placement';
import type { PresetName } from './presets';

/** Between the three, shoulder to shoulder with room for the boards (walking spec §6; gang.test pins the clearance). */
export const GANG_SPACING_M = 1.05;

export interface GangPlace {
  preset: PresetName;
  x: number;
  z: number;
  headingDeg: number;
  carrySide: 'l' | 'r';
}

/**
 * The mockup's lineup (walking spec §6): Grommet at `centre`, Shazza on his left and T-Bone on his right, all facing its
 * heading; the outer two carry on their outside arms (the boards never between two riders but his), Grommet on his left.
 */
export function gangPlaces(centre: LandSpot): GangPlace[] {
  const { right } = headingAxes(centre.headingDeg);
  const at = (k: number): { x: number; z: number } => ({ x: centre.x + right[0] * k * GANG_SPACING_M, z: centre.z + right[1] * k * GANG_SPACING_M });
  return [
    { preset: 'female', ...at(-1), headingDeg: centre.headingDeg, carrySide: 'l' },
    { preset: 'grommet', ...at(0), headingDeg: centre.headingDeg, carrySide: 'l' },
    { preset: 'male', ...at(1), headingDeg: centre.headingDeg, carrySide: 'r' },
  ];
}

/** Their chests, roughly (Grommet's lowest): the camera sits a little below (walking spec §6). */
const CHEST_M = 1.1;

/**
 * The mockup's camera: `distM` in front of the line's centre, 15 cm below their chests, looking back at their chests
 * along the line's heading, so the Womb's lineup and the horizon sit behind them. Where the land rises inland of them
 * (the Womb's does) it stays half a metre over its own ground (`cameraGroundY`), looking down to them.
 */
export function gangCamera(centre: LandSpot, groundY: number, distM = 5.5, cameraGroundY = -Infinity): CameraPose {
  const { fwd } = headingAxes(centre.headingDeg);
  const y = Math.max(groundY + CHEST_M - 0.15, cameraGroundY + 0.5);
  return {
    mode: 'free',
    position: [centre.x + fwd[0] * distM, y, centre.z + fwd[1] * distM],
    yawDeg: (centre.headingDeg + 180) % 360,
    pitchDeg: (Math.atan2(groundY + CHEST_M - y, distM) * 180) / Math.PI,
  };
}

/** The heath trampled into a track from the line toward the camera (a lookout path): clearings every 1.2 m. */
export function gangTrack(centre: LandSpot, distM = 5.5): { x: number; z: number; r: number }[] {
  const { fwd } = headingAxes(centre.headingDeg), out: { x: number; z: number; r: number }[] = [];
  for (let d = 1.2; d <= distM + 1e-9; d += 1.2) out.push({ x: centre.x + fwd[0] * d, z: centre.z + fwd[1] * d, r: GANG_SPACING_M + 0.75 });
  return out;
}
