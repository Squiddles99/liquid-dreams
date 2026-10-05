/**
 * The Womb's profile family (spec 2026-10-05-womb-profile-design §1): one rule for the breaking wave's cross-section,
 * drawn from Andrew's side-on sketch. Units of H (the crest's height above sea level), u along the wave's travel
 * (toward the beach), the crest's base at u = 0, y up from sea level. The curve runs from flat sea behind the crest, up
 * the back, over the crest, round the lip's outside to its tip, back along the lip's underside (the tube's ceiling), down
 * the barrel wall to its floor, through the trough and out to flat sea in front.
 *
 * Two numbers shape it: phase (0 unbroken swell … 1 round barrel … 2 white-water wall) and hollow (0 a thick, open
 * curl … 1 the Womb's barrel). Height scales the whole. Andrew approved phases 0–1 on 2026-10-05 ("your drawings
 * accurately represent the barrel shape I want"), then the rounded lip's end and the collapse (1–2) the same day ("both
 * look perfect").
 *
 * No imports: the GPU mirrors this line for line.
 */

export type P2 = readonly [number, number];

/** Knots per keyframe: back far, back mid, shoulder, crest, lip outside, lip outside low, tip, ceiling, tube top-back,
 * wall, floor, trough, front, flat. */
export const KNOTS = 14;
export const CREST_KNOT = 3;
export const TIP_KNOT = 6;
export const FLOOR_KNOT = 10;
export const TROUGH_KNOT = 11;
/** Samples per Catmull–Rom span before resampling, and the sample count the ribbon mesh takes. */
const SPAN_SAMPLES = 24;
export const CURVE_SAMPLES = 160;

export const STAGES = { swell: 0, standing: 0.25, pitching: 0.5, throwing: 0.75, barrel: 1, tubeFilling: 1.25, cavingIn: 1.5, whitewater: 2 } as const;

export interface ProfileKey {
  phase: number;
  /** The shape at full hollowness (hollow 1): the Womb's barrel. */
  hollow: readonly P2[];
  /** The shape at hollow 0: a shorter throw, a shallower trough, a thick, open curl. */
  open: readonly P2[];
}

/** The tube-filling keyframes (phase 1.25), whose cavity the collapse shrinks away. */
const FILLING_HOLLOW: readonly P2[] = [[-7, 0], [-3.5, 0.17], [-1.4, 0.58], [0.3, 0.92], [1.05, 0.9], [1.6, 0.6], [1.75, 0.05], [1.6, 0.3], [1.35, 0.4], [1.15, 0.2], [1.3, -0.12], [2.2, -0.3], [3.4, -0.1], [7, 0]];
const FILLING_OPEN: readonly P2[] = [[-7, 0], [-3.5, 0.16], [-1.4, 0.55], [0.3, 0.9], [0.75, 0.88], [1.05, 0.6], [1.12, 0.08], [1.0, 0.3], [0.82, 0.42], [0.7, 0.22], [0.85, -0.05], [1.9, -0.14], [3.3, -0.1], [7, 0]];
/** The share of its size the filled tube keeps once it has closed: a pocket too small to see (1 cm on a 1 m wave). */
const CLOSED_POCKET = 0.01;
/** The closed pocket is turned this far (rad, anticlockwise) so the steep front above it never cuts across it. */
const CLOSED_POCKET_TURN = Math.PI / 6;

/**
 * A shape whose tube has closed: the back and crest (`before`, knots 0–5), the cavity's knots (tip to floor) as `from`'s
 * cavity shrunk to CLOSED_POCKET of its size, turned CLOSED_POCKET_TURN and centred on `at`, then the front (`after`, knots 11–13). The mesh keeps
 * its samples, so the cavity cannot vanish; shrinking it whole (one shape at every size until it is too small to see)
 * closes it without the curve ever folding through itself.
 */
function closed(before: readonly P2[], from: readonly P2[], at: P2, after: readonly P2[]): P2[] {
  const cavity = from.slice(TIP_KNOT, FLOOR_KNOT + 1);
  const cu = cavity.reduce((s, p) => s + p[0], 0) / cavity.length, cy = cavity.reduce((s, p) => s + p[1], 0) / cavity.length;
  const c = Math.cos(CLOSED_POCKET_TURN) * CLOSED_POCKET, s = Math.sin(CLOSED_POCKET_TURN) * CLOSED_POCKET;
  return [...before, ...cavity.map((p): P2 => [at[0] + (p[0] - cu) * c - (p[1] - cy) * s, at[1] + (p[0] - cu) * s + (p[1] - cy) * c]), ...after];
}

/**
 * The keyframes. Phases 0–1 at hollow 1 are Andrew's approved drawings (2026-10-05); at phase 1, hollow 0 and 0.5 are
 * the approved "less hollow" and "middle" (the mockup's rule: the lip thrown ×0.55 about the crest, lifted 0.125·(1 − y),
 * the trough and floor ×0.45 below sea level, so the blend at hollow 0.5 is that rule's). Before the lip pitches, the
 * reef's step has not shaped the wave yet (open = hollow). The collapse (phase > 1), approved the same day:
 * a weaker wave's tube is smaller and caves into a lower hump.
 */
export const PROFILE_KEYS: readonly ProfileKey[] = [
  {
    phase: 0,
    hollow: [[-7, 0], [-3.5, 0.1], [-1.5, 0.38], [0, 0.55], [0.35, 0.53], [0.6, 0.49], [0.85, 0.43], [1.05, 0.37], [1.25, 0.3], [1.5, 0.21], [1.8, 0.09], [2.7, -0.1], [4.2, -0.04], [7, 0]],
    open: [[-7, 0], [-3.5, 0.1], [-1.5, 0.38], [0, 0.55], [0.35, 0.53], [0.6, 0.49], [0.85, 0.43], [1.05, 0.37], [1.25, 0.3], [1.5, 0.21], [1.8, 0.09], [2.7, -0.1], [4.2, -0.04], [7, 0]],
  },
  {
    phase: 0.25,
    hollow: [[-7, 0], [-3.5, 0.14], [-1.4, 0.52], [0, 0.82], [0.25, 0.81], [0.45, 0.76], [0.6, 0.69], [0.68, 0.6], [0.73, 0.48], [0.77, 0.32], [0.86, 0.1], [1.6, -0.2], [3.2, -0.08], [7, 0]],
    open: [[-7, 0], [-3.5, 0.14], [-1.4, 0.52], [0, 0.82], [0.25, 0.81], [0.45, 0.76], [0.6, 0.69], [0.68, 0.6], [0.73, 0.48], [0.77, 0.32], [0.86, 0.1], [1.6, -0.2], [3.2, -0.08], [7, 0]],
  },
  {
    phase: 0.5,
    hollow: [[-7, 0], [-3.5, 0.17], [-1.4, 0.6], [0.1, 1], [0.5, 1], [0.82, 0.9], [0.98, 0.72], [0.8, 0.72], [0.55, 0.72], [0.42, 0.42], [0.5, 0], [1.5, -0.3], [3.2, -0.11], [7, 0]],
    open: [[-7, 0], [-3.5, 0.17], [-1.4, 0.6], [0.1, 1], [0.32, 1], [0.496, 0.9], [0.584, 0.72], [0.485, 0.72], [0.3475, 0.72], [0.42, 0.42], [0.5, 0], [1.5, -0.135], [3.2, -0.11], [7, 0]],
  },
  {
    phase: 0.75,
    hollow: [[-7, 0], [-3.5, 0.18], [-1.4, 0.62], [0.15, 1], [0.8, 1], [1.3, 0.76], [1.48, 0.3], [1.12, 0.58], [0.62, 0.64], [0.36, 0.3], [0.55, -0.22], [1.65, -0.34], [3.2, -0.12], [7, 0]],
    open: [[-7, 0], [-3.5, 0.18], [-1.4, 0.62], [0.15, 1], [0.5075, 1], [0.7825, 0.775], [0.8815, 0.34375], [0.6835, 0.60625], [0.4085, 0.6625], [0.36, 0.3], [0.55, -0.099], [1.65, -0.153], [3.2, -0.12], [7, 0]],
  },
  {
    phase: 1,
    hollow: [[-7, 0], [-3.5, 0.18], [-1.4, 0.62], [0.2, 1], [0.98, 0.98], [1.55, 0.6], [1.62, -0.14], [1.36, 0.4], [0.86, 0.64], [0.38, 0.28], [0.7, -0.3], [1.85, -0.36], [3.3, -0.12], [7, 0]],
    open: [[-7, 0], [-3.5, 0.18], [-1.4, 0.62], [0.2, 1], [0.629, 0.9825], [0.9425, 0.65], [0.981, 0.0025], [0.838, 0.475], [0.563, 0.685], [0.38, 0.28], [0.7, -0.135], [1.85, -0.162], [3.3, -0.12], [7, 0]],
  },
  // The tube filling: the lip has landed and the cavity shrinks toward its floor, still round.
  { phase: 1.25, hollow: FILLING_HOLLOW, open: FILLING_OPEN },
  // Caving in: the tube has filled; a rounded hump with a steep front.
  {
    phase: 1.5,
    hollow: closed([[-7, 0], [-3.5, 0.15], [-1.4, 0.48], [0.6, 0.7], [1.2, 0.72], [1.55, 0.6]], FILLING_HOLLOW, [1.7, 0.3], [[2.05, -0.2], [3.4, -0.08], [7, 0]]),
    open: closed([[-7, 0], [-3.5, 0.13], [-1.4, 0.42], [0.6, 0.6], [1.0, 0.6], [1.3, 0.5]], FILLING_OPEN, [1.42, 0.26], [[1.7, -0.1], [3.2, -0.06], [7, 0]]),
  },
  // The white-water wall rolling to the beach, about half the wave's height.
  {
    phase: 2,
    hollow: closed([[-7, 0], [-3.5, 0.08], [-1.4, 0.25], [0.8, 0.45], [1.4, 0.47], [1.75, 0.4]], FILLING_HOLLOW, [1.85, 0.2], [[2.1, -0.1], [3.6, -0.03], [7, 0]]),
    open: closed([[-7, 0], [-3.5, 0.06], [-1.4, 0.18], [0.8, 0.32], [1.3, 0.34], [1.6, 0.28]], FILLING_OPEN, [1.68, 0.12], [[1.85, -0.06], [3.4, -0.02], [7, 0]]),
  },
];

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** The knots at (phase, hollow): each family eased between its keyframes, then blended by hollowness. */
export function profileKnots(phase: number, hollow: number): P2[] {
  const ph = clamp(phase, 0, 2), hv = clamp(hollow, 0, 1);
  let i = 0;
  while (i < PROFILE_KEYS.length - 2 && ph > PROFILE_KEYS[i + 1].phase) i++;
  const a = PROFILE_KEYS[i], b = PROFILE_KEYS[i + 1];
  const t = smooth((ph - a.phase) / (b.phase - a.phase));
  const out: P2[] = [];
  for (let k = 0; k < KNOTS; k++) {
    const ho = (j: 0 | 1): number => a.hollow[k][j] + (b.hollow[k][j] - a.hollow[k][j]) * t;
    const op = (j: 0 | 1): number => a.open[k][j] + (b.open[k][j] - a.open[k][j]) * t;
    out.push([op(0) + (ho(0) - op(0)) * hv, op(1) + (ho(1) - op(1)) * hv]);
  }
  return out;
}

/** Centripetal Catmull–Rom through the knots (no cusps or loops between them), SPAN_SAMPLES per span. */
function catmullRom(pts: readonly P2[]): P2[] {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out: P2[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const tj = (ti: number, a: P2, b: P2): number => ti + Math.sqrt(Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let k = 0; k < SPAN_SAMPLES; k++) {
      const t = t1 + ((t2 - t1) * k) / SPAN_SAMPLES;
      const L = (a: P2, b: P2, ta: number, tb: number): P2 => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      out.push(L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** How far (share of the way to its nearer neighbour) the lip's end is rounded, and how far its point is pulled in: the tip
 * reads as a thick, round end, not a point. */
const TIP_ROUND = 0.18;
const TIP_PULL = 0.35;
/** Each radian the curve turns costs this much length (units of H) when the samples are spread, so the lip's end and
 * the tube get more samples than the straight back. */
const TURN_COST_H = 0.15;

/** The knots with the lip's end rounded: the tip knot becomes three, either side of it and its point pulled in. Only
 * while there is a lip: from the standing wave to the tube filling, faded in and out (`life`, 0–1). */
function roundedTip(k: readonly P2[], life: number): P2[] {
  const T = k[TIP_KNOT], A = k[TIP_KNOT - 1], B = k[TIP_KNOT + 1], pull = TIP_PULL * life;
  // The same distance both sides, set by the nearer neighbour: the rounding shrinks with a closing tube.
  const dA = Math.hypot(A[0] - T[0], A[1] - T[1]), dB = Math.hypot(B[0] - T[0], B[1] - T[1]);
  const d = TIP_ROUND * Math.min(dA, dB), rA = dA > 0 ? d / dA : 0, rB = dB > 0 ? d / dB : 0;
  const tA: P2 = [T[0] + (A[0] - T[0]) * rA, T[1] + (A[1] - T[1]) * rA];
  const tB: P2 = [T[0] + (B[0] - T[0]) * rB, T[1] + (B[1] - T[1]) * rB];
  const mid: P2 = [(tA[0] + tB[0]) / 2, (tA[1] + tB[1]) / 2];
  const tT: P2 = [T[0] + (mid[0] - T[0]) * pull, T[1] + (mid[1] - T[1]) * pull];
  return [...k.slice(0, TIP_KNOT), tA, tT, tB, ...k.slice(TIP_KNOT + 1)];
}

/** The profile at (phase, hollow) as n points along the curve, back to front, spread by length plus turning. */
export function profileCurve(phase: number, hollow: number, n = CURVE_SAMPLES): P2[] {
  const ph = clamp(phase, 0, 2);
  const life = smooth(clamp((ph - STAGES.standing) / 0.25, 0, 1)) * (1 - smooth(clamp((ph - STAGES.tubeFilling) / 0.25, 0, 1)));
  const dense = catmullRom(roundedTip(profileKnots(ph, hollow), life));
  const s = [0];
  for (let i = 1; i < dense.length; i++) {
    let turn = 0;
    if (i < dense.length - 1) {
      const a1 = Math.atan2(dense[i][1] - dense[i - 1][1], dense[i][0] - dense[i - 1][0]);
      const a2 = Math.atan2(dense[i + 1][1] - dense[i][1], dense[i + 1][0] - dense[i][0]);
      turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    }
    s.push(s[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]) + TURN_COST_H * turn);
  }
  const total = s[s.length - 1], out: P2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < dense.length - 2 && s[j + 1] < target) j++;
    const f = s[j + 1] > s[j] ? clamp((target - s[j]) / (s[j + 1] - s[j]), 0, 1) : 0;
    out.push([dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f]);
  }
  return out;
}
