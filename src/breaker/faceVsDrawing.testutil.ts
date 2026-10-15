/**
 * womb-story Task 11 (Fable's STOP 3 ruling 1): the drawn section's face below the roof's root, as the sheet's stood face
 * is measured against it (tools/_faceVsDrawing.ts, faceDrawn.test.ts). Test and tool code only.
 *
 * The reference: wombProfile's knots at the section's phase and hollow, u scaled by A from the crest, y seated as the ribbon
 * seats the overhang under the one-surface law (wombSection.oneSurfaceKnots): the drawing's crest knot on the sheet's crest,
 * the drawing's lowest face point on the sheet's low in front, scaled between. The face: from the crest knot (phase <
 * STOOD_PHASE: nothing overhangs yet) or the roof's root (the tube's top-back knot) through the wall, the floor and the trough
 * to the front knot; where the drawing has two heights at one u (the tube's back wall curls back under the root near phase 1)
 * the lowest (the floor's branch: what a board stands on).
 */
import { CREST_KNOT, FRONT_KNOT, SPAN_SAMPLES, TIP_KNOT, TROUGH_KNOT, densePoint, roundedKnots } from './wombProfile';
import { ROOT_KNOT, STOOD_PHASE } from './wombSection';

export type Pt = [number, number];

/** The drawing's dense curve (units of A), its crest knot at (0, 0); the face's first and last dense index; the trough's. */
export function drawnCurve(phase: number, hollow: number): { pts: Pt[]; from: number; to: number; trough: number } {
  const k = roundedKnots(phase, hollow), S = SPAN_SAMPLES;
  const r = (m: number): number => (m > TIP_KNOT ? m + 2 : m === TIP_KNOT ? m + 1 : m);
  const pts: Pt[] = [];
  for (let d = 0; d <= (k.length - 1) * S; d++) { const p = densePoint(k, d); pts.push([p[0] - k[CREST_KNOT][0], p[1] - k[CREST_KNOT][1]]); }
  return { pts, from: r(phase < STOOD_PHASE ? CREST_KNOT : ROOT_KNOT) * S, to: r(FRONT_KNOT) * S, trough: r(TROUGH_KNOT) * S };
}

/** The lowest y of the polyline pts[a..b] at u (NaN where it does not reach). */
export function lowestAt(pts: readonly Pt[], a: number, b: number, u: number): number {
  let y = NaN;
  for (let j = a; j < b; j++) {
    const [ua, ya] = pts[j], [ub, yb] = pts[j + 1];
    if ((u - ua) * (u - ub) <= 0 && ub !== ua) { const v = ya + ((yb - ya) * (u - ua)) / (ub - ua); if (!(v >= y)) y = v; }
  }
  return y;
}

export interface FaceRow { du: number; sheet: number; draw: number; dy: number; sSheet: number; sDraw: number }
export interface FaceCompare {
  A: number; seatScale: number; uLow: number; phase: number; hollow: number; crestU: number; crestY: number; faceFrom: number; faceTo: number;
  troughDy: number; worstDy: number; worstAt: number; meanAbsDy: number; maxSlopeSheet: number; maxSlopeDraw: number;
  rider: { u: number; sheet: number; draw: number; dy: number } | null; rows: FaceRow[]; sheetProfile: Pt[]; drawn: Pt[];
}

/**
 * The sheet along a line (`sheetY(u)`: its height above still water at u m along the section's normal) against the seated
 * drawing at `numbers`: per 0.5 m of u from the face's start to the front knot, the sheet, the drawing, their difference and
 * both slopes (down the face positive). The sheet's crest: its highest point from `behind` A behind u 0 to 1 A ahead.
 * `riderU`: a board's u, read there too.
 */
export function compareFace(numbers: { A: number; phase: number; hollow: number }, sheetY: (u: number) => number, riderU?: number, behind = 1): FaceCompare {
  const { A, phase, hollow } = numbers;
  let cu = 0, cy = -Infinity;
  for (let u = -behind * A; u <= A; u += 0.05) { const y = sheetY(u); if (y > cy) { cy = y; cu = u; } }
  const d = drawnCurve(phase, hollow);
  let yLow = 0, uLow = 0;
  for (let j = d.from; j <= d.to; j++) if (d.pts[j][1] < yLow) { yLow = d.pts[j][1]; uLow = d.pts[j][0]; }
  let sLow = Infinity;
  for (let u = cu; u <= cu + A * d.pts[d.to][0]; u += 0.1) sLow = Math.min(sLow, sheetY(u));
  const sy = yLow < 0 ? (cy - sLow) / (-yLow * A) : 1;
  const pts = d.pts.map((p): Pt => [cu + A * p[0], cy + A * sy * p[1]]);
  const u0 = pts[d.from][0], u1 = pts[d.to][0];
  const rows: FaceRow[] = [];
  for (let u = Math.ceil(u0 / 0.5) * 0.5; u <= u1; u += 0.5) {
    const dy = lowestAt(pts, d.from, d.to, u), dyn = lowestAt(pts, d.from, d.to, u + 0.5), y = sheetY(u), yn = sheetY(u + 0.5);
    rows.push({ du: u - cu, sheet: y, draw: dy, dy: y - dy, sSheet: -(yn - y) / 0.5, sDraw: Number.isFinite(dyn) ? -(dyn - dy) / 0.5 : NaN });
  }
  const ok = rows.filter((r) => Number.isFinite(r.dy));
  const worst = ok.reduce((a, b) => (Math.abs(b.dy) > Math.abs(a.dy) ? b : a), ok[0] ?? { du: NaN, sheet: NaN, draw: NaN, dy: NaN, sSheet: NaN, sDraw: NaN });
  const slopeAt = (f: (u: number) => number, u: number): number => -(f(u + 0.25) - f(u - 0.25)) / 0.5;
  const drawY = (u: number): number => lowestAt(pts, d.from, d.to, u);
  const rider = riderU === undefined ? null : { u: riderU - cu, sheet: slopeAt(sheetY, riderU), draw: slopeAt(drawY, riderU), dy: sheetY(riderU) - drawY(riderU) };
  const sheetProfile: Pt[] = [];
  for (let u = cu - 2 * A; u <= u1 + A; u += 0.25) sheetProfile.push([u - cu, sheetY(u)]);
  const finite = (xs: number[]): number[] => xs.filter(Number.isFinite);
  return {
    A, seatScale: sy, uLow: uLow * A, phase, hollow, crestU: cu, crestY: cy, faceFrom: u0 - cu, faceTo: u1 - cu,
    troughDy: sheetY(pts[d.trough][0]) - pts[d.trough][1], worstDy: worst.dy, worstAt: worst.du,
    meanAbsDy: ok.reduce((a, r) => a + Math.abs(r.dy), 0) / Math.max(1, ok.length),
    maxSlopeSheet: Math.max(...finite(rows.map((r) => r.sSheet))), maxSlopeDraw: Math.max(...finite(rows.map((r) => r.sDraw))),
    rider, rows, sheetProfile, drawn: pts.map((p): Pt => [p[0] - cu, p[1]]),
  };
}
