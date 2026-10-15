import { CREST_KNOT, FRONT_KNOT, SPAN_SAMPLES, TIP_KNOT, densePoint, roundedKnots } from './wombProfile';

/**
 * The drawn face as the sheet takes it (womb-story Task 11, Fable's STOP 3 ruling 1: "the sheet's stand-up below the root
 * follows the approved section's face"): for each (phase, hollow) on a grid, the approved drawing's face from its top to its
 * lowest point in front, as one normalised shape S(s) (s 0 at the top, 1 at the low; S 1 at the top, -1 at the low) and its
 * size (L its length along u, D its drop, units of A). The face is the drawing as seen from in front and below: walking back
 * from the front knot, every point of the curve behind all the points ahead of it (the floor and the tube's back wall where
 * they curl back under the roof's root, the crest; the lip, the tube's roof and its root are the overhang and stand in front
 * of it). The sheet cannot overhang, so this is the most of the drawing a sheet can be.
 *
 * Stored per s sample as (S, dS/ds, L, D), the slopes Fritsch-Butland (monotone, no overshoot through the near-vertical wall)
 * and 0 at both ends: the face leaves its crest level and meets the water in front tangent, as the swell's own face does.
 * The CPU (faceShape, faceSize) and the GPU (SetWaves) read the same table with the same interpolation: linear in phase and
 * hollow, the cubic Hermite in s.
 */
export const FACE_PHASE_STEP = 1 / 32;
export const FACE_PHASES = 65;
export const FACE_HOLLOW_STEP = 0.1;
export const FACE_HOLLOWS = 11;
export const FACE_SAMPLES = 33;

/** The drawing's face at (phase, hollow) as a polyline (units of A, the profile's own frame), u rising: the curve's points that
 * stand behind every point ahead of them, from its crest knot to its front knot; `top` its highest, `low` its lowest after. */
export function faceEnvelope(phase: number, hollow: number): { pts: [number, number][]; top: number; low: number } {
  const k = roundedKnots(phase, hollow), r = (j: number): number => (j > TIP_KNOT ? j + 2 : j === TIP_KNOT ? j + 1 : j);
  const from = CREST_KNOT * SPAN_SAMPLES, to = r(FRONT_KNOT) * SPAN_SAMPLES;
  // Back from the front knot: a point is on the face if it stands behind every point ahead of it.
  const env: [number, number][] = [];
  let minU = Infinity;
  for (let d = to; d >= from; d--) { const p = densePoint(k, d); if (p[0] < minU) { minU = p[0]; env.push([p[0], p[1]]); } }
  env.reverse();
  let iT = 0;
  for (let i = 1; i < env.length; i++) if (env[i][1] > env[iT][1]) iT = i;
  let iL = iT;
  for (let i = iT + 1; i < env.length; i++) if (env[i][1] < env[iL][1]) iL = i;
  // Once the lip pitches, between the crest and the roof's root (the overhang's span along u) the silhouette is the straight
  // drop from the crest to the tube's back wall, a corner at the crest under the lip's root (the ribbon's crest knot met a
  // kink: oneSurface.test 3-38 deg). There the sheet stands inside the tube, under its roof: it falls from its crest level
  // (slope 0) to where the silhouette falls to the root's height (its slope there, at most 3 x the drop's secant: monotone;
  // below the root the silhouette is the drawing's), a cubic Hermite,
  // eased in over phases SHOULDER_PHASES as the lip pitches.
  const w = Math.min(1, Math.max(0, (phase - SHOULDER_PHASES[0]) / (SHOULDER_PHASES[1] - SHOULDER_PHASES[0]))), ws = w * w * (3 - 2 * w);
  const yRoot = k[r(TIP_KNOT + 2)][1], [uT, yT] = env[iT];
  let jr = iT;
  while (jr < iL && env[jr + 1][1] > yRoot) jr++;
  const uH = jr < iL ? env[jr][0] + (env[jr + 1][0] - env[jr][0]) * ((env[jr][1] - yRoot) / Math.max(1e-9, env[jr][1] - env[jr + 1][1])) : uT;
  const uR = Math.max(uH, uH + SHOULDER_TO_ROOT * (k[r(TIP_KNOT + 2)][0] - uH));
  if (ws > 0 && uR > uT && yRoot < yT) {
    let j = iT;
    while (j < iL && env[j + 1][0] < uR) j++;
    if (j < iL) {
      const [ua, ya] = env[j], [ub, yb] = env[j + 1], f = ub > ua ? (uR - ua) / (ub - ua) : 0, yR = ya + (yb - ya) * f;
      const sec = (yR - yT) / (uR - uT), mR = Math.max(3 * sec, Math.min(0, ub > ua ? (yb - ya) / (ub - ua) : sec));
      for (let i = iT + 1; i <= j; i++) {
        const x = (env[i][0] - uT) / (uR - uT), x2 = x * x, x3 = x2 * x, h = uR - uT;
        const ySh = (2 * x3 - 3 * x2 + 1) * yT + (3 * x2 - 2 * x3) * yR + (x3 - x2) * h * mR;
        env[i] = [env[i][0], env[i][1] + (ySh - env[i][1]) * ws];
      }
    }
  }
  return { pts: env, top: iT, low: iL };
}
/** The shoulder under the overhang (faceEnvelope) comes in over these phases (the lip pitching). */
export const SHOULDER_PHASES: readonly [number, number] = [0.4, 0.5];
/** The shoulder ends this share of the way from where the silhouette falls to the root's height (0) to the root's own u (1). */
export const SHOULDER_TO_ROOT = 0.5;

/** The face at one (phase, hollow), sampled: S and its slope at FACE_SAMPLES s, and L, D (units of A). */
export function faceOf(phase: number, hollow: number): { S: number[]; m: number[]; L: number; D: number } {
  const { pts: env, top: iT, low: iL } = faceEnvelope(phase, hollow);
  const N = FACE_SAMPLES, S: number[] = [], m: number[] = [];
  const L = env[iL][0] - env[iT][0], D = env[iT][1] - env[iL][1];
  if (!(L > 1e-6) || !(D > 1e-6)) {
    for (let j = 0; j < N; j++) { S.push(1 - (2 * j) / (N - 1)); m.push(-2); }
    return { S, m, L: Math.max(L, 1e-3), D: Math.max(D, 1e-3) };
  }
  let i = iT;
  for (let j = 0; j < N; j++) {
    const u = env[iT][0] + (L * j) / (N - 1);
    while (i < iL - 1 && env[i + 1][0] < u) i++;
    const [ua, ya] = env[i], [ub, yb] = env[Math.min(i + 1, iL)], f = ub > ua ? Math.min(1, Math.max(0, (u - ua) / (ub - ua))) : 0;
    const v = -1 + (2 * (ya + (yb - ya) * f - env[iL][1])) / D;
    // Non-increasing: the face falls from its top to its low (a ripple of the curve's samples never stands as a step).
    S.push(j === 0 ? 1 : j === N - 1 ? -1 : Math.min(v, S[j - 1]));
  }
  const h = 1 / (N - 1), delta = S.slice(1).map((v, j) => (v - S[j]) / h);
  for (let j = 0; j < N; j++) {
    if (j === 0 || j === N - 1) { m.push(0); continue; }
    const a = delta[j - 1], b = delta[j];
    m.push(a * b > 0 ? (2 * a * b) / (a + b) : 0);
  }
  return { S, m, L, D };
}

let TABLE: Float32Array | null = null;
/** The table, (phase, hollow, s)-major as RGBA (S, dS/ds, L, D): texel (s, hollow + FACE_HOLLOWS × phase). */
export function faceTable(): Float32Array {
  if (TABLE) return TABLE;
  const out = new Float32Array(FACE_PHASES * FACE_HOLLOWS * FACE_SAMPLES * 4);
  for (let p = 0; p < FACE_PHASES; p++) for (let q = 0; q < FACE_HOLLOWS; q++) {
    const f = faceOf(p * FACE_PHASE_STEP, q * FACE_HOLLOW_STEP), row = (p * FACE_HOLLOWS + q) * FACE_SAMPLES;
    for (let j = 0; j < FACE_SAMPLES; j++) out.set([f.S[j], f.m[j], f.L, f.D], (row + j) * 4);
  }
  TABLE = out;
  return out;
}

/** The grid cell and weights of (phase, hollow): rows (phase × hollow) a..d and the bilinear weights. */
function cell(phase: number, hollow: number): { rows: [number, number, number, number]; w: [number, number, number, number] } {
  const gp = Math.min(FACE_PHASES - 1, Math.max(0, phase / FACE_PHASE_STEP)), gh = Math.min(FACE_HOLLOWS - 1, Math.max(0, hollow / FACE_HOLLOW_STEP));
  const p0 = Math.min(FACE_PHASES - 2, Math.floor(gp)), h0 = Math.min(FACE_HOLLOWS - 2, Math.floor(gh)), tp = gp - p0, th = gh - h0;
  const row = (p: number, q: number): number => (p * FACE_HOLLOWS + q) * FACE_SAMPLES;
  return { rows: [row(p0, h0), row(p0, h0 + 1), row(p0 + 1, h0), row(p0 + 1, h0 + 1)], w: [(1 - tp) * (1 - th), (1 - tp) * th, tp * (1 - th), tp * th] };
}
const texel = (t: Float32Array, c: ReturnType<typeof cell>, j: number, ch: number): number =>
  c.w[0] * t[(c.rows[0] + j) * 4 + ch] + c.w[1] * t[(c.rows[1] + j) * 4 + ch] + c.w[2] * t[(c.rows[2] + j) * 4 + ch] + c.w[3] * t[(c.rows[3] + j) * 4 + ch];

/** The face's length and drop (units of A) at (phase, hollow). */
export function faceSize(phase: number, hollow: number): { L: number; D: number } {
  const t = faceTable(), c = cell(phase, hollow);
  return { L: texel(t, c, 0, 2), D: texel(t, c, 0, 3) };
}

/** The face's shape S at s in [0, 1] (1 at the top, -1 at the low) and dS/ds, at (phase, hollow). */
export function faceShape(phase: number, hollow: number, s: number): { S: number; dS: number } {
  const t = faceTable(), c = cell(phase, hollow), g = Math.min(FACE_SAMPLES - 1, Math.max(0, s * (FACE_SAMPLES - 1)));
  const j = Math.min(FACE_SAMPLES - 2, Math.floor(g)), x = g - j, h = 1 / (FACE_SAMPLES - 1);
  const s0 = texel(t, c, j, 0), m0 = texel(t, c, j, 1), s1 = texel(t, c, j + 1, 0), m1 = texel(t, c, j + 1, 1);
  const x2 = x * x, x3 = x2 * x;
  const S = (2 * x3 - 3 * x2 + 1) * s0 + (x3 - 2 * x2 + x) * h * m0 + (3 * x2 - 2 * x3) * s1 + (x3 - x2) * h * m1;
  const dS = ((6 * x2 - 6 * x) * s0 + (3 * x2 - 4 * x + 1) * h * m0 + (6 * x - 6 * x2) * s1 + (3 * x2 - 2 * x) * h * m1) / h;
  return { S, dS };
}

/** The longest the drawn face gets from the lip's pitch on (phases STOOD 0.45 to 2), per hollow on the grid (units of A). */
export const FACE_STOOD_PHASE = 0.45;
let BROKEN_L: Float32Array | null = null;
export function faceBrokenLengths(): Float32Array {
  if (BROKEN_L) return BROKEN_L;
  const t = faceTable(), out = new Float32Array(FACE_HOLLOWS);
  for (let q = 0; q < FACE_HOLLOWS; q++) {
    let m = 0;
    for (let p = 0; p < FACE_PHASES; p++) if (p * FACE_PHASE_STEP >= FACE_STOOD_PHASE - 1e-9) m = Math.max(m, t[(p * FACE_HOLLOWS + q) * FACE_SAMPLES * 4 + 2]);
    out[q] = m;
  }
  BROKEN_L = out;
  return out;
}
/**
 * The length (units of A) the sheet gives its drawn face at (phase, hollow): the drawing's own (faceSize) while the wave
 * stands up, then, from the lip's pitch on, the longest the drawing gets through the break (faceBrokenLengths, eased in over
 * phases 0.25 to 0.45). Across one cross-section of the sheet each point reads its own time since onset (on its own ray), and
 * through the pitch the drawing's face shortens by half in a tenth of a second: at each point's own length the points of one
 * face disagreed on where its foot is (a notch 2 m deep at 7 ft). On the longer face the drawing keeps its own length and the
 * rest lies level at its low (faceShapeIn).
 */
export function faceLengthRef(phase: number, hollow: number): number {
  const L = faceSize(phase, hollow).L, b = faceBrokenLengths(), g = Math.min(FACE_HOLLOWS - 1, Math.max(0, hollow / FACE_HOLLOW_STEP));
  const h0 = Math.min(FACE_HOLLOWS - 2, Math.floor(g)), lb = b[h0] + (b[h0 + 1] - b[h0]) * (g - h0);
  const x = Math.min(1, Math.max(0, (phase - 0.25) / (FACE_STOOD_PHASE - 0.25))), e = x * x * (3 - 2 * x);
  return Math.max(L, lb * e);
}
/** faceShape on a face `ref` long (faceLengthRef): the drawing over its own length L, then level at its low. */
export function faceShapeIn(phase: number, hollow: number, s: number, ref: number): { S: number; dS: number } {
  const L = faceSize(phase, hollow).L, k = ref / L, x = s * k;
  if (x >= 1) return { S: -1, dS: 0 };
  const f = faceShape(phase, hollow, x);
  return { S: f.S, dS: f.dS * k };
}
