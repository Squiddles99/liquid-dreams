type V3 = [number, number, number];

/**
 * Where the underwater self-test's reef wall stands ('a reef wall at or above eye level shows', underwater.selftest.ts): an
 * eye in the water, a level and a rising ray that meet the reef, and how far along the rising ray the surface point it
 * may hide lies. reefWallProbe.test.ts checks it against the CPU bed, so a change to the reef can't leave it stale.
 *
 * On the shelf 62 m north of the peak, 5 m deep over a hollow 5.7 m deep: east of the eye the bed climbs a reef head to
 * about 1.8 m deep by x ≈ 40, which the level ray meets about 6 m out and the rising ray about 10 m out. (It stood 9 m deep
 * 20 m west of the ledge until the softened ledge, 76f9c0a, made the bed there 6.1 m deep: the eye was inside the reef.)
 */
export const REEF_WALL_EYE: V3 = [28, -5, -62];
export const REEF_WALL_LEVEL: V3 = [1, 0, 0];
/** About 8° up, east. */
export const REEF_WALL_RISING: V3 = [0.99, 0.14, 0];
/** The surface point the reef hides lies this far along the rising ray (m). */
export const REEF_WALL_HIDDEN_M = 30;
