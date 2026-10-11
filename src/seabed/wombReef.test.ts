import { describe, expect, it } from 'vitest';
import { NORTH_LEDGE, SHELF_INNER_X, SHELF_POLYGON, SOUTH_CORNER_RADIUS_M, SOUTH_LEDGE, rightLedgeFrom, shelfPolygon } from './wombReef';

type Pt = readonly [number, number];

// spec 2026-10-11-south-corner: the shelf's south-west corner, where the right's ledge meets the closing leg, is an arc.
const check = (poly: readonly Pt[], south: readonly Pt[], north: readonly Pt[]) => {
  const corner = south[south.length - 1], prev = south[south.length - 2];
  // The polygon is unchanged elsewhere: the south ledge up to its last leg's start, then (after the arc) the closing leg,
  // and the north ledge reversed at the end.
  expect(poly.slice(0, south.length - 1)).toEqual(south.slice(0, -1));
  const back = [...north].reverse().slice(0, -1);
  expect(poly.slice(-back.length)).toEqual(back);
  expect(poly[poly.length - back.length - 1]).toEqual([SHELF_INNER_X, -450]);
  expect(poly[poly.length - back.length - 2]).toEqual([SHELF_INNER_X, corner[1]]);
  const arc = poly.slice(south.length - 1, poly.length - back.length - 2);
  expect(arc.length).toBeGreaterThanOrEqual(6);
  expect(arc.length).toBeLessThanOrEqual(8);
  // The arc's end points lie on the two legs (tangent points), ~60 m from the corner.
  const t0 = arc[0], t1 = arc[arc.length - 1];
  const cross = (prev[0] - corner[0]) * (t0[1] - corner[1]) - (prev[1] - corner[1]) * (t0[0] - corner[0]);
  expect(Math.abs(cross) / Math.hypot(prev[0] - corner[0], prev[1] - corner[1])).toBeLessThan(1e-6);
  expect(t1[1]).toBeCloseTo(corner[1], 6);
  for (const t of [t0, t1]) expect(Math.abs(Math.hypot(t[0] - corner[0], t[1] - corner[1]) - 60)).toBeLessThan(10);
  // The centre: where the normals at the tangent points meet; every arc point 60 ± 3 m from it.
  const d0 = [corner[0] - prev[0], corner[1] - prev[1]], n0 = [-d0[1], d0[0]];
  const k = (t1[0] - t0[0]) / n0[0], centre = [t1[0], t0[1] + k * n0[1]];
  for (const p of arc) expect(Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - SOUTH_CORNER_RADIUS_M)).toBeLessThan(3);
  // No interior angle sharper than ~150° between consecutive legs within 80 m of the old corner.
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (Math.hypot(p[0] - corner[0], p[1] - corner[1]) > 80) continue;
    const a = poly[(i + poly.length - 1) % poly.length], c = poly[(i + 1) % poly.length];
    const u = [a[0] - p[0], a[1] - p[1]], v = [c[0] - p[0], c[1] - p[1]];
    const ang = (Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])) * 180) / Math.PI;
    expect(ang, `interior angle at (${p[0].toFixed(1)}, ${p[1].toFixed(1)})`).toBeGreaterThan(150);
  }
};

describe('the shelf polygon: the south-west corner is rounded (spec 2026-10-11-south-corner)', () => {
  it('on the default ledges: a ~60 m arc between the right\'s last leg and the closing leg, the rest unchanged', () => {
    check(SHELF_POLYGON, SOUTH_LEDGE, NORTH_LEDGE);
    expect(shelfPolygon(NORTH_LEDGE)).toEqual(SHELF_POLYGON);
  });
  it('on an overriding south ledge (ReefParams.southLedge): the arc follows that ledge\'s last leg', () => {
    const south = rightLedgeFrom([-110, 20]);
    check(shelfPolygon(NORTH_LEDGE, south), south, NORTH_LEDGE);
  });
});
