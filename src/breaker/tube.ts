import { LH82_K } from './overturn';

/**
 * The overturning tube's geometry (spec 2026-09-30-barrel-from-maths §3.2): Longuet-Higgins' outline in the tube's own
 * axes. O is the round end (ξ = 0), d the axis (down and forward), n across it (up and forward); the upper side is
 * O + ξL·d + h(ξ)·n, the lower side O + ξL·d − h(ξ)·n with y held at or above clipY (the water it lands on). The GPU
 * mirror is in lipProfileNodes.ts.
 */
export type Vec2 = [number, number];
export interface Tube { O: Vec2; d: Vec2; n: Vec2; L: number; W: number; clipY: number }

/** ξ is kept this far off 0 where √ξ's slope is needed. */
export const TUBE_XI_EPS = 1e-4;
/** Ternary-search steps for the tube's top and back; samples along an arc; bisections for the water cut. */
export const TUBE_SEARCH_STEPS = 24;
export const TUBE_ARC_STEPS = 16;
export const TUBE_WATER_STEPS = 20;

/** The axes for a tube tilted θ below the horizontal: d down and forward, n up and forward. */
export function tubeAxes(theta: number): { d: Vec2; n: Vec2 } {
  return { d: [Math.cos(theta), -Math.sin(theta)], n: [Math.sin(theta), Math.cos(theta)] };
}
export function tubeHalf(t: Tube, xi: number): number {
  const x = Math.min(1, Math.max(0, xi));
  return LH82_K * t.W * Math.sqrt(x) * (1 - x);
}
export function tubeAxis(t: Tube, xi: number): Vec2 {
  return [t.O[0] + t.d[0] * xi * t.L, t.O[1] + t.d[1] * xi * t.L];
}
export function tubeUpper(t: Tube, xi: number): Vec2 {
  const a = tubeAxis(t, xi), h = tubeHalf(t, xi);
  return [a[0] + t.n[0] * h, a[1] + t.n[1] * h];
}
export function tubeLower(t: Tube, xi: number): Vec2 {
  const a = tubeAxis(t, xi), h = tubeHalf(t, xi);
  return [a[0] - t.n[0] * h, Math.max(a[1] - t.n[1] * h, t.clipY)];
}
/** The upper side's unit normal at ξ, pointing out of the tube. */
export function tubeUpperNormal(t: Tube, xi: number): Vec2 {
  const x = Math.min(1, Math.max(TUBE_XI_EPS, xi));
  const dh = LH82_K * t.W * ((1 - x) / (2 * Math.sqrt(x)) - Math.sqrt(x));
  const T: Vec2 = [t.d[0] * t.L + t.n[0] * dh, t.d[1] * t.L + t.n[1] * dh];
  const l = Math.hypot(T[0], T[1]);
  // A tube of no size (W = L = 0): the tube's own n (the cap's angle reads this normal; atan2(0, 0) is undefined on the GPU).
  if (!(l > 0)) return [t.n[0], t.n[1]];
  let nr: Vec2 = [-T[1] / l, T[0] / l];
  if (nr[0] * t.n[0] + nr[1] * t.n[1] < 0) nr = [-nr[0], -nr[1]];
  return nr;
}
/** Ternary search for the maximum of a unimodal f on [a, b] (fixed steps, as the GPU does it). */
function argmax(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < TUBE_SEARCH_STEPS; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) lo = m1; else hi = m2;
  }
  return (lo + hi) / 2;
}
/** The ξ of the upper side's highest point. */
export function tubeTopXi(t: Tube): number {
  return argmax((xi) => tubeUpper(t, xi)[1], 0, 1);
}
/** The tube's back-most x (on the lower side, which leans back; or the round end itself). */
export function tubeBackMostX(t: Tube): number {
  const xi = argmax((x) => -tubeLower({ ...t, clipY: -Infinity }, x)[0], 0, 1);
  return Math.min(t.O[0], tubeLower({ ...t, clipY: -Infinity }, xi)[0]);
}
/** The upper side's arc length from ξ = a to b (TUBE_ARC_STEPS chords). */
export function tubeUpperArc(t: Tube, a: number, b: number): number {
  let s = 0, prev = tubeUpper(t, a);
  for (let i = 1; i <= TUBE_ARC_STEPS; i++) {
    const q = tubeUpper(t, a + ((b - a) * i) / TUBE_ARC_STEPS);
    s += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return s;
}
/** The first ξ past `from` where the upper side comes down to height y (bisection; the side falls from its top on). */
export function tubeWaterXi(t: Tube, from: number, y: number): number {
  let lo = from, hi = 1;
  for (let i = 0; i < TUBE_WATER_STEPS; i++) { const m = (lo + hi) / 2; if (tubeUpper(t, m)[1] > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
