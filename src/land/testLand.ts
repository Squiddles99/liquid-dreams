import { DEFAULT_BEACH, beachHeight } from './landHeight';
import type { RouteLand } from './tracks';

const toeEnd = DEFAULT_BEACH.wetWidthM + DEFAULT_BEACH.dryWidthM + DEFAULT_BEACH.toeWidthM;

/**
 * A synthetic coast for the tracks' tests: the waterline at x = 190, the default beach, and a dune rising 0.25 m per
 * metre to 40 m (its along-coast swell easing in over 10 m, so the land has no step at the toe); `ridge`: a 30 m ridge
 * at x = 280.
 */
export function testLand(ridge = false): RouteLand {
  return {
    profile: DEFAULT_BEACH,
    waterlineAt: () => 190,
    baseHeightAt: (x, z) => {
      const d = x - 190;
      let h = d <= toeEnd ? beachHeight(d) : Math.min(DEFAULT_BEACH.toeTopM + 0.25 * (d - toeEnd), 40) + 0.6 * Math.sin(z / 37) * Math.min(1, (d - toeEnd) / 10);
      if (ridge) h += 30 * Math.exp(-(((x - 280) / 6) ** 2));
      return h;
    },
  };
}
