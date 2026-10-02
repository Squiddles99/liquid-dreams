import { describe, expect, it } from 'vitest';
import { DEFAULT_BEACH } from './landHeight';
import { testLand } from './testLand';
import { CLEARING_SEMI_M, LATTICE_M, SINK_M, TrackNetwork, WOMB_LINEUP, routeTracks, type RouteLand } from './tracks';

const toeEnd = DEFAULT_BEACH.wetWidthM + DEFAULT_BEACH.dryWidthM + DEFAULT_BEACH.toeWidthM;
const land = testLand;
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

describe('TrackNetwork', () => {
  const t = new TrackNetwork(routeTracks(land(), [-600, 600]));
  const j = t.data.junction;
  it('knows the clearing as a 7 × 5 m ellipse along the Cape to Cape', () => {
    expect(t.inClearing(j.x, j.z)).toBe(true);
    expect(t.inClearing(j.x + j.along[0] * (CLEARING_SEMI_M[0] - 0.1), j.z + j.along[1] * (CLEARING_SEMI_M[0] - 0.1))).toBe(true);
    expect(t.inClearing(j.x - j.along[1] * (CLEARING_SEMI_M[1] + 0.1), j.z + j.along[0] * (CLEARING_SEMI_M[1] + 0.1))).toBe(false);
  });
  it('sinks a corridor 4 cm at its centre and nothing beyond its shoulders', () => {
    const p = t.data.pieces[0].points[200];
    expect(t.sinkExact(p[0], p[1])).toBeCloseTo(SINK_M, 3);
    expect(t.sinkExact(p[0] + 5, p[1])).toBe(0);
  });
  it('changes the sink by at most 1 cm per 25 cm, across a corridor and out of the clearing', () => {
    const p = t.data.pieces[1].points[10];
    for (let s = -2; s < 2; s += 0.05) expect(Math.abs(t.sinkAt(p[0] + s + LATTICE_M, p[1]) - t.sinkAt(p[0] + s, p[1]))).toBeLessThanOrEqual(0.01);
    const ax = -j.along[1], az = j.along[0];
    for (let s = 1.5; s < 5; s += 0.05) {
      const a = t.sinkAt(j.x + ax * s, j.z + az * s), b = t.sinkAt(j.x + ax * (s + LATTICE_M), j.z + az * (s + LATTICE_M));
      expect(Math.abs(b - a)).toBeLessThanOrEqual(0.01);
    }
  });
  it('matches sinkExact on the lattice and interpolates between', () => {
    const x = Math.floor(j.x / LATTICE_M) * LATTICE_M, z = Math.floor(j.z / LATTICE_M) * LATTICE_M;
    expect(t.sinkAt(x, z)).toBeCloseTo(t.sinkExact(x, z), 6);
    const mid = t.sinkAt(x + LATTICE_M / 2, z);
    expect(mid).toBeCloseTo((t.sinkExact(x, z) + t.sinkExact(x + LATTICE_M, z)) / 2, 6);
  });
  it('puts the stand spot in the clearing, seaward of the junction, facing inland', () => {
    const s = t.standSpot();
    expect(t.inClearing(s.x, s.z)).toBe(true);
    expect(s.headingDeg).toBe(90);
    expect(s.x).toBeLessThan(j.x);
  });
  it('reaches along a heading only as far as the track goes', () => {
    const s = t.standSpot();
    const r = t.reach(s.x, s.z, 1, 0, 5.5);
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThanOrEqual(5.5);
    expect(t.onTrack(s.x + r, s.z)).toBe(true);
  });
});
