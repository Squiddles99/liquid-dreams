import { describe, expect, it } from 'vitest';
import { DEFAULT_BEACH, beachHeight } from './landHeight';
import { WOMB_LINEUP, routeTracks, type RouteLand } from './tracks';

const toeEnd = DEFAULT_BEACH.wetWidthM + DEFAULT_BEACH.dryWidthM + DEFAULT_BEACH.toeWidthM;
/** The waterline at x = 190, the default beach, a dune rising 0.25 m per metre to 40 m (its along-coast swell easing in
 * over 10 m, so the land has no step at the toe); `ridge`: a 30 m ridge at x = 280. */
function land(ridge = false): RouteLand {
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
const grade = (l: RouteLand, a: [number, number], b: [number, number]): number =>
  Math.abs(l.baseHeightAt(b[0], b[1]) - l.baseHeightAt(a[0], a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('routeTracks', () => {
  const l = land();
  const t = routeTracks(l, [-600, 600]);
  const c2c = t.pieces.find((p) => p.name === 'capeToCape')!, beach = t.pieces.find((p) => p.name === 'beachPath')!;
  it('is deterministic', () => {
    expect(JSON.stringify(routeTracks(land(), [-600, 600]))).toBe(JSON.stringify(t));
  });
  it('runs the Cape to Cape the length of the range, 1 m wide, behind the dunes', () => {
    expect(c2c.halfWidthM).toBe(0.5);
    expect(c2c.points[0][1]).toBeLessThanOrEqual(-598);
    expect(c2c.points.at(-1)![1]).toBeGreaterThanOrEqual(598);
    for (const [x] of c2c.points) expect(x - 190).toBeGreaterThan(toeEnd + 20);
  });
  it('keeps every track walkable (grade ≤ 0.35 over any 2 m)', () => {
    for (const p of [c2c, beach]) {
      for (let i = 2; i < p.points.length; i += 2) expect(grade(l, p.points[i - 2], p.points[i])).toBeLessThanOrEqual(0.35);
    }
  });
  it('puts the junction on the Cape to Cape within 40 m of the lineup', () => {
    expect(Math.abs(t.junction.z - WOMB_LINEUP.z)).toBeLessThanOrEqual(40);
    const near = Math.min(...c2c.points.map(([x, z]) => Math.hypot(x - t.junction.x, z - t.junction.z)));
    expect(near).toBeLessThan(0.6);
  });
  it('ends the beach path at the waterline within 5 m of the lineup, 0.9 m wide', () => {
    const end = beach.points.at(-1)!;
    expect(beach.halfWidthM).toBe(0.45);
    expect(Math.abs(end[0] - 190)).toBeLessThan(1);
    expect(Math.abs(end[1] - WOMB_LINEUP.z)).toBeLessThanOrEqual(5);
    expect(Math.hypot(beach.points[0][0] - t.junction.x, beach.points[0][1] - t.junction.z)).toBeLessThan(0.6);
  });
  it('without a clear view anywhere near the lineup, takes the highest ground there (Review Focus 4)', () => {
    const r = routeTracks(land(true), [-600, 600]);
    const c = r.pieces[0].points.filter(([, z]) => Math.abs(z - WOMB_LINEUP.z) <= 40);
    const top = Math.max(...c.map(([x, z]) => land(true).baseHeightAt(x, z)));
    expect(land(true).baseHeightAt(r.junction.x, r.junction.z)).toBeCloseTo(top, 1);
  });
});
