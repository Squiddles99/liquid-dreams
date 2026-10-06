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
export const FRONT_KNOT = 12;
/** Samples per Catmull–Rom span before resampling, and the sample count the ribbon mesh takes. */
export const SPAN_SAMPLES = 24;
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
    hollow: [[-7, 0], [-3.5, 0.18], [-1.4, 0.62], [0.2, 1], [0.98, 0.98], [1.55, 0.6], [1.62, -0.41], [1.36, 0.4], [0.86, 0.64], [0.38, 0.28], [0.7, -0.3], [1.85, -0.36], [3.3, -0.12], [7, 0]],
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

/**
 * A knot's velocity in phase at key i (units of H per unit phase): the slope across its neighbours (a Catmull–Rom in
 * phase), so the shape flows through every stage without stopping; at rest at the first and last keys. The closed tube's
 * knots rest at the keys after the tube has closed: shrunk to CLOSED_POCKET, a velocity through them would turn the pocket
 * inside out.
 */
function keyVelocity(i: number, k: number, j: 0 | 1, family: 'hollow' | 'open'): number {
  const K = PROFILE_KEYS;
  if (i === 0 || i === K.length - 1) return 0;
  if (k >= TIP_KNOT && k <= FLOOR_KNOT && K[i].phase > 1.25) return 0;
  return (K[i + 1][family][k][j] - K[i - 1][family][k][j]) / (K[i + 1].phase - K[i - 1].phase);
}

/** The knots at (phase, hollow): each family through its keyframes by a cubic Hermite in phase, then blended by
 * hollowness. At a keyframe's phase the knots are that keyframe's exactly. */
export function profileKnots(phase: number, hollow: number): P2[] {
  const ph = clamp(phase, 0, 2), hv = clamp(hollow, 0, 1);
  let i = 0;
  while (i < PROFILE_KEYS.length - 2 && ph > PROFILE_KEYS[i + 1].phase) i++;
  const a = PROFILE_KEYS[i], b = PROFILE_KEYS[i + 1], span = b.phase - a.phase;
  const t = (ph - a.phase) / span, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const at = (family: 'hollow' | 'open', k: number, j: 0 | 1): number =>
    h00 * a[family][k][j] + h10 * span * keyVelocity(i, k, j, family) + h01 * b[family][k][j] + h11 * span * keyVelocity(i + 1, k, j, family);
  const out: P2[] = [];
  for (let k = 0; k < KNOTS; k++) {
    const ho0 = at('hollow', k, 0), ho1 = at('hollow', k, 1), op0 = at('open', k, 0), op1 = at('open', k, 1);
    out.push([op0 + (ho0 - op0) * hv, op1 + (ho1 - op1) * hv]);
  }
  return out;
}

/** How far (share of the way to its nearer neighbour) the lip's end is rounded, and how far its point is pulled in: the tip
 * reads as a thick, round end, not a point. */
export const TIP_ROUND = 0.18;
export const TIP_PULL = 0.35;
/** Each radian the curve turns costs this much length (units of H) when the samples are spread, so the lip's end and
 * the tube get more samples than the straight back. */
export const TURN_COST_H = 0.15;
/** The knots once the lip's end is rounded (the tip becomes three), the Catmull–Rom's spans through them, and its points. */
export const ROUNDED_KNOTS = KNOTS + 2;
export const SPANS = ROUNDED_KNOTS - 1;
export const DENSE_POINTS = SPANS * SPAN_SAMPLES + 1;
/** The rounded tip's point among the rounded knots. */
export const ROUNDED_TIP = TIP_KNOT + 1;

/** How much rounding the tip's point takes at a phase: from the standing wave to the tube filling, faded in and out. */
export const tipLife = (phase: number): number =>
  smooth(clamp((phase - STAGES.standing) / 0.25, 0, 1)) * (1 - smooth(clamp((phase - STAGES.tubeFilling) / 0.25, 0, 1)));

/** The knots with the lip's end rounded: the tip knot (`tip`, TIP_KNOT by default) becomes three, either side of it and its
 * point pulled in by `life`. Knots may carry more coordinates than (u, y) (a section's home: wombSection.sectionKnots);
 * distances are (u, y)'s, the rest is carried along. */
export function roundedTip<K extends readonly number[]>(k: readonly K[], life: number, tip = TIP_KNOT): K[] {
  const T = k[tip], A = k[tip - 1], B = k[tip + 1], pull = TIP_PULL * life;
  // The same distance both sides, set by the nearer neighbour: the rounding shrinks with a closing tube.
  const dA = Math.hypot(A[0] - T[0], A[1] - T[1]), dB = Math.hypot(B[0] - T[0], B[1] - T[1]);
  const d = TIP_ROUND * Math.min(dA, dB), rA = dA > 0 ? d / dA : 0, rB = dB > 0 ? d / dB : 0;
  const lerp = (a: K, b: K, f: number): K => a.map((v, j) => v + (b[j] - v) * f) as unknown as K;
  const tA = lerp(T, A, rA), tB = lerp(T, B, rB);
  const tT = lerp(T, lerp(tA, tB, 0.5), pull);
  return [...k.slice(0, tip), tA, tT, tB, ...k.slice(tip + 1)];
}

/** The rounded knots at (phase, hollow). */
export const roundedKnots = (phase: number, hollow: number): P2[] => roundedTip(profileKnots(phase, hollow), tipLife(clamp(phase, 0, 2)));

/**
 * Dense point d (0 … (k.length − 1) × SPAN_SAMPLES) of the centripetal Catmull–Rom through the knots `k` (the rounded knots:
 * DENSE_POINTS of them; no cusps or loops between them): SPAN_SAMPLES per span, the ends' knots repeated as their outer
 * neighbours, the last point the last knot. The parameter is from (u, y); further coordinates are interpolated with it.
 */
export function densePoint<K extends readonly number[]>(k: readonly K[], d: number): K {
  const last = k.length - 1;
  if (d >= last * SPAN_SAMPLES) return k[last];
  const sp = Math.floor(d / SPAN_SAMPLES), i = d - sp * SPAN_SAMPLES;
  const p0 = k[Math.max(sp - 1, 0)], p1 = k[sp], p2 = k[sp + 1], p3 = k[Math.min(sp + 2, last)];
  const tj = (ti: number, a: K, b: K): number => ti + Math.sqrt(Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
  const t = t1 + ((t2 - t1) * i) / SPAN_SAMPLES;
  const L = (a: K, b: K, ta: number, tb: number): K => a.map((v, j) => ((tb - t) * v + (t - ta) * b[j]) / (tb - ta)) as unknown as K;
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}

/**
 * The centripetal Catmull–Rom as cubic Hermite spans (the same curve: Barry–Goldman's pyramid is a cubic with these end
 * derivatives), so a knot's tangent can be given rather than taken from its neighbours. `t` holds the knots' parameters
 * (cumulative √ of the (u, y) distance), `m` their derivatives in t; dense point d as densePoint numbers them.
 */
export function hermitePoint<K extends readonly number[]>(k: readonly K[], t: readonly number[], m: readonly K[], d: number): K {
  const last = k.length - 1;
  if (d >= last * SPAN_SAMPLES) return k[last];
  const sp = Math.floor(d / SPAN_SAMPLES), s = (d - sp * SPAN_SAMPLES) / SPAN_SAMPLES, dt = t[sp + 1] - t[sp];
  const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = 3 * s2 - 2 * s3, h11 = s3 - s2;
  return k[sp].map((v, j) => h00 * v + h10 * dt * m[sp][j] + h01 * k[sp + 1][j] + h11 * dt * m[sp + 1][j]) as unknown as K;
}

/** The centripetal Catmull–Rom's derivative in t at a knot `p` (parameter tp) between `a` (ta) and `b` (tb). */
export function crTangent<K extends readonly number[]>(a: K, ta: number, p: K, tp: number, b: K, tb: number): K {
  return p.map((v, j) => (v - a[j]) / (tp - ta) - (b[j] - a[j]) / (tb - ta) + (b[j] - v) / (tb - tp)) as unknown as K;
}

/** The centripetal parameter step from knot a to b: √ of their (u, y) distance (floored as densePoint floors it). */
export const crStep = (a: readonly number[], b: readonly number[]): number => Math.sqrt(Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1])));

/** The angle (rad, 0 … π) the curve turns from segment a to segment b; 0 where either has no length. */
export function turnAngle(ax: number, ay: number, bx: number, by: number): number {
  const cr = ax * by - ay * bx, dt = ax * bx + ay * by;
  return ax * ax + ay * ay > 1e-12 && bx * bx + by * by > 1e-12 ? Math.abs(Math.atan2(cr, dt)) : 0;
}

/**
 * The profile at (phase, hollow) as n points along the curve, back to front, spread by length plus turning: each dense
 * point's spread position is the one before's, plus the segment between them, plus TURN_COST_H × the turn at the point
 * before. Written as one walk along the dense points (twice: the total, then the samples), as the GPU's frame pass walks.
 */
export function profileCurve(phase: number, hollow: number, n = CURVE_SAMPLES): P2[] {
  return profileSamples(phase, hollow, n).curve;
}

/** The marked knots' samples (indices into the back-to-front curve): the first sample at or past each knot's dense point. */
export interface ProfileMarks { crest: number; tip: number; floor: number }
export const MARKED_KNOTS = { crest: CREST_KNOT, tip: ROUNDED_TIP, floor: FLOOR_KNOT + 2 } as const;

/** profileCurve with the samples where it passes the crest, the (rounded) tip and the floor. */
export function profileSamples(phase: number, hollow: number, n = CURVE_SAMPLES): { curve: P2[]; marks: ProfileMarks } {
  const k = roundedKnots(phase, hollow);
  return curveSamples((d) => densePoint(k, d), k.length, MARKED_KNOTS, n);
}

/**
 * n points along a curve through `knots` knots (back to front), given as its dense points (`point(d)`, SPAN_SAMPLES per span:
 * densePoint, or wombSection's), spread by length plus turning (profileCurve), and the samples where it passes the
 * `marked` knots. Coordinates past (u, y) are carried along.
 */
export function curveSamples<K extends readonly number[]>(point: (d: number) => K, knots: number, marked: Readonly<Record<keyof ProfileMarks, number>>, n = CURVE_SAMPLES): { curve: K[]; marks: ProfileMarks } {
  const dense = (knots - 1) * SPAN_SAMPLES + 1;
  // visit(q0, q1, s0, s1, d): the segment from dense point d − 1 to d and their spread positions.
  const walk = (visit: (q0: K, q1: K, s0: number, s1: number, d: number) => boolean): number => {
    let prev = point(0), cur = point(1), s = 0;
    let s1 = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    if (visit(prev, cur, s, s1, 1)) return s1;
    for (let d = 2; d < dense; d++) {
      const next = point(d);
      const turn = turnAngle(cur[0] - prev[0], cur[1] - prev[1], next[0] - cur[0], next[1] - cur[1]);
      s = s1;
      s1 = s + Math.hypot(next[0] - cur[0], next[1] - cur[1]) + TURN_COST_H * turn;
      prev = cur; cur = next;
      if (visit(prev, cur, s, s1, d)) break;
    }
    return s1;
  };
  const total = walk(() => false), out: K[] = [];
  const marks: ProfileMarks = { crest: n - 1, tip: n - 1, floor: n - 1 };
  const seen = { crest: false, tip: false, floor: false };
  walk((q0, q1, s0, s1, d) => {
    // A knot's dense point is d = knot × SPAN_SAMPLES: its mark is the next sample emitted from here on.
    for (const key of ['crest', 'tip', 'floor'] as const) {
      if (!seen[key] && d >= marked[key] * SPAN_SAMPLES) { seen[key] = true; marks[key] = Math.min(out.length, n - 1); }
    }
    // Every sample up to the last falls on the segment its spread position reaches; the last is the last knot.
    while (out.length < n - 1) {
      const target = (total * out.length) / (n - 1);
      if (target > s1) return false;
      const f = s1 > s0 ? clamp((target - s0) / (s1 - s0), 0, 1) : 0;
      out.push(q0.map((v, j) => v + (q1[j] - v) * f) as unknown as K);
    }
    return true;
  });
  out.push(point(dense - 1));
  return { curve: out, marks };
}

/**
 * The keyframes as the GPU reads them: per key and knot, two vec4s, (hollow x, y, open x, y) and their velocities in phase
 * (keyVelocity), key-major. The key phases are compile-time constants (PROFILE_KEYS[i].phase).
 */
export function keyTable(): Float32Array {
  const out = new Float32Array(PROFILE_KEYS.length * KNOTS * 8);
  PROFILE_KEYS.forEach((key, i) => {
    for (let m = 0; m < KNOTS; m++) {
      out.set([key.hollow[m][0], key.hollow[m][1], key.open[m][0], key.open[m][1],
        keyVelocity(i, m, 0, 'hollow'), keyVelocity(i, m, 1, 'hollow'), keyVelocity(i, m, 0, 'open'), keyVelocity(i, m, 1, 'open')], (i * KNOTS + m) * 8);
    }
  });
  return out;
}
