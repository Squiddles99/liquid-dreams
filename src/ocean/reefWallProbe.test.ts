import { describe, expect, it } from 'vitest';
import { bedHeightAt, buildBathymetry } from '../seabed/bathymetry';
import { MAX_MARCH_DIST_M } from '../seabed/waterColumn';
import { REEF_WALL_EYE, REEF_WALL_HIDDEN_M, REEF_WALL_LEVEL, REEF_WALL_RISING } from './reefWallProbe';

type V3 = [number, number, number];

const bathymetry = buildBathymetry();
const bed = (x: number, z: number): number => bedHeightAt(bathymetry, x, z);
const unit = (d: V3): V3 => { const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l]; };

/** The first distance along `dir` within `reach` at or below the CPU bed (−1 if none), and the deepest the ray goes into it. */
function meetsReef(dir: V3, reach: number): { first: number; deepest: number } {
  const [ox, oy, oz] = REEF_WALL_EYE, d = unit(dir);
  let first = -1, deepest = -Infinity;
  for (let s = 0; s <= reach; s += 0.05) {
    const into = bed(ox + d[0] * s, oz + d[2] * s) - (oy + d[1] * s);
    if (into >= 0 && first < 0) first = s;
    deepest = Math.max(deepest, into);
  }
  return { first, deepest };
}

// The self-test's still water is at y = 0 (the seabed's tide uniform is never set there).
describe('the underwater reef-wall probe stands where the reef is', () => {
  it('the eye is in open water: below the still surface, at least half a metre above the bed (so straight up is only water)', () => {
    const [x, y, z] = REEF_WALL_EYE;
    expect(y).toBeLessThan(-1);
    expect(y - bed(x, z)).toBeGreaterThan(0.5);
  });
  it('the level ray meets the reef within the march, and goes a metre into it (the GPU march\'s steps can\'t step over it)', () => {
    const m = meetsReef(REEF_WALL_LEVEL, MAX_MARCH_DIST_M);
    expect(m.first).toBeGreaterThan(0);
    expect(m.deepest).toBeGreaterThan(1);
  });
  it('the rising ray meets the reef before the still surface and before the hidden surface point, a metre into it', () => {
    const toSurface = -REEF_WALL_EYE[1] / unit(REEF_WALL_RISING)[1];
    const m = meetsReef(REEF_WALL_RISING, Math.min(toSurface, REEF_WALL_HIDDEN_M));
    expect(m.first).toBeGreaterThan(0);
    expect(m.deepest).toBeGreaterThan(1);
  });
});
