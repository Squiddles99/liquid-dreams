import { TIP } from '../seabed/wombReef';

type V3 = [number, number, number];

/**
 * Where the underwater self-test's reef wall stands ('a reef wall at or above eye level shows', underwater.selftest.ts): an
 * eye in the water, a level and a rising ray that meet the reef, and how far along the rising ray the surface point it
 * may hide lies. reefWallProbe.test.ts checks it against the CPU bed, so a change to the reef can't leave it stale.
 *
 * In front of the south ledge, 31 m south of the corner (wombReef.TIP), 6 m deep over the face's 14 m: east of the eye the face climbs to
 * the ledge (3.5 m), which the level ray meets about 5 m out and the rising ray about 6 m out. (It stood on the old reef's
 * shelf 62 m north of the peak until the reef moved in to Andrew's satellite line, 2026-10-05: the eye was inside the
 * reef there.)
 */
export const REEF_WALL_EYE: V3 = [TIP[0] - 10, -6, TIP[1] + 31];
export const REEF_WALL_LEVEL: V3 = [1, 0, 0];
/** About 8° up, east. */
export const REEF_WALL_RISING: V3 = [0.99, 0.14, 0];
/** The surface point the reef hides lies this far along the rising ray (m). */
export const REEF_WALL_HIDDEN_M = 30;
