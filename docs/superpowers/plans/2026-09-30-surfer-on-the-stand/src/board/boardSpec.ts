/**
 * The boards as shaper numbers (spec §3.7, §5.1). Board frame: +x toward the nose, +y the deck's normal, +z the right
 * rail (forward × up); the origin is on the stringer at mid-length, and y = 0 is the bottom at the wide point.
 */
export const IN_M = 0.0254;

export type BoardKind = 'thruster' | 'stepUp' | 'bodyboard';
export type TailShape = 'squash' | 'roundPin' | 'crescent';

export interface FinSpec {
  /** The base's centre, from the tail (m). */
  fromTailM: number;
  /** -1 left rail, 0 on the stringer, +1 right rail. */
  side: -1 | 0 | 1;
  /** Side fins: the base's centre in from the rail (m). */
  railInsetM: number;
  baseM: number;
  depthM: number;
}

export interface BoardSpec {
  kind: BoardKind;
  lengthM: number;
  maxWidthM: number;
  thicknessM: number;
  /** Full widths as fractions of the max: the tail's end, 12" up from the tail, 12" and 3" down from the nose, the nose's end. */
  tailFrac: number;
  tail12Frac: number;
  nose12Frac: number;
  nose3Frac: number;
  noseFrac: number;
  /** The wide point, as a fraction of the length from the tail. */
  widePointU: number;
  /** Thickness at the ends, as fractions of the max. */
  noseThickFrac: number;
  tailThickFrac: number;
  rockerNoseM: number;
  rockerTailM: number;
  tail: TailShape;
  /** Crescent tails: how far the tail's centre is cut in (m). */
  crescentDepthM: number;
  /** Superellipse exponents of the deck and bottom halves of the rail (higher = boxier). */
  deckExp: number;
  bottomExp: number;
  fins: FinSpec[];
  /** Surfboards: the back foot's spot, from the tail (m), over the fins. */
  backFootFromTailM: number;
}

export interface BoardDims {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
}

const thrusterFins = (fromTailSide: number, fromTailCentre: number, depthM: number): FinSpec[] => [
  { fromTailM: fromTailSide, side: 1, railInsetM: 0.032, baseM: 0.11, depthM },
  { fromTailM: fromTailSide, side: -1, railInsetM: 0.032, baseM: 0.11, depthM },
  { fromTailM: fromTailCentre, side: 0, railInsetM: 0, baseM: 0.11, depthM },
];

/** Shapes per kind; the volumes these give are checked against real boards in boardGeometry.test.ts. */
const SHAPES: Record<BoardKind, Omit<BoardSpec, 'kind' | 'lengthM' | 'maxWidthM' | 'thicknessM'>> = {
  thruster: {
    tailFrac: 0.4, tail12Frac: 0.74, nose12Frac: 0.6, nose3Frac: 0.27, noseFrac: 0.03, widePointU: 0.49,
    noseThickFrac: 0.3, tailThickFrac: 0.42, rockerNoseM: 5.0 * IN_M, rockerTailM: 2.1 * IN_M,
    tail: 'squash', crescentDepthM: 0, deckExp: 2.4, bottomExp: 4.0, fins: thrusterFins(0.285, 0.095, 0.115),
    backFootFromTailM: 0.3,
  },
  stepUp: {
    tailFrac: 0.14, tail12Frac: 0.64, nose12Frac: 0.57, nose3Frac: 0.25, noseFrac: 0.03, widePointU: 0.53,
    noseThickFrac: 0.28, tailThickFrac: 0.4, rockerNoseM: 5.6 * IN_M, rockerTailM: 2.6 * IN_M,
    tail: 'roundPin', crescentDepthM: 0, deckExp: 2.4, bottomExp: 4.0, fins: thrusterFins(0.305, 0.11, 0.12),
    backFootFromTailM: 0.34,
  },
  bodyboard: {
    tailFrac: 0.64, tail12Frac: 0.86, nose12Frac: 0.95, nose3Frac: 0.86, noseFrac: 0.78, widePointU: 0.6,
    noseThickFrac: 0.86, tailThickFrac: 0.8, rockerNoseM: 1.2 * IN_M, rockerTailM: 0.4 * IN_M,
    tail: 'crescent', crescentDepthM: 0.035, deckExp: 5, bottomExp: 7, fins: [], backFootFromTailM: 0.2,
  },
};

export function makeBoard(kind: BoardKind, d: BoardDims): BoardSpec {
  return { kind, lengthM: d.lengthIn * IN_M, maxWidthM: d.widthIn * IN_M, thicknessM: d.thicknessIn * IN_M, ...SHAPES[kind] };
}

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/** Monotone cubic (Fritsch–Carlson) through (xs, ys): no overshoot between the outline's control points. */
export function pchip(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  let k = 0;
  while (x > xs[k + 1]) k++;
  const t = (x - xs[k]) / h[k], t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h[k] * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h[k] * m[k + 1];
}

/** u: 0 at the tail, 1 at the nose. */
export const uAt = (s: BoardSpec, x: number): number => clamp01((x + s.lengthM / 2) / s.lengthM);

export function halfWidthAt(s: BoardSpec, u: number): number {
  const L = s.lengthM, k12 = (12 * IN_M) / L, k3 = (3 * IN_M) / L;
  return 0.5 * s.maxWidthM * pchip([0, k12, s.widePointU, 1 - k12, 1 - k3, 1], [s.tailFrac, s.tail12Frac, 1, s.nose12Frac, s.nose3Frac, s.noseFrac], clamp01(u));
}

/** The bottom's height on the stringer (flat through the wide point, curving up to each end). */
export function rockerAt(s: BoardSpec, u: number): number {
  const m = s.widePointU;
  return u >= m ? s.rockerNoseM * Math.pow((u - m) / (1 - m), 2.4) : s.rockerTailM * Math.pow((m - u) / m, 2.0);
}

/** The foil: full just behind the middle, thinning to each end. */
export function thicknessAt(s: BoardSpec, u: number): number {
  const c = 0.45, nose = u >= c, q = (u - c) / (nose ? 1 - c : c), end = nose ? s.noseThickFrac : s.tailThickFrac;
  return s.thicknessM * (end + (1 - end) * Math.pow(Math.max(0, 1 - q * q), 1.2));
}

/** The cross-section's surface height at z: sign +1 the deck, -1 the bottom. */
function sectionY(s: BoardSpec, x: number, z: number, sign: 1 | -1): number {
  const u = uAt(s, x), W = Math.max(halfWidthAt(s, u), 0.004), t = Math.max(thicknessAt(s, u), 0.004);
  const e = sign > 0 ? s.deckExp : s.bottomExp;
  const c = Math.pow(Math.min(1, Math.abs(z) / W), e / 2);
  const sn = Math.sqrt(Math.max(0, 1 - c * c));
  return rockerAt(s, u) + t / 2 + sign * (t / 2) * Math.pow(sn, 2 / e);
}

export const deckYAt = (s: BoardSpec, x: number, z: number): number => sectionY(s, x, z, 1);
export const bottomYAt = (s: BoardSpec, x: number, z: number): number => sectionY(s, x, z, -1);

export type SpotName = 'front' | 'back' | 'chest' | 'hips' | 'dkFoot' | 'dkKnee';
export type Vec3Tuple = [number, number, number];

export interface BoardLayout {
  /** Deck points (board frame) the poses put feet, knees, chest and hips on. */
  spots: Record<SpotName, Vec3Tuple>;
  leashPlug: Vec3Tuple;
  leashLengthM: number;
}

/** Where a rider of this height stands and lies on the board (spec §3.5). */
export function layoutFor(s: BoardSpec, riderHeightM: number): BoardLayout {
  const L = s.lengthM, tail = -L / 2, nose = L / 2, bb = s.kind === 'bodyboard';
  const on = (x: number, z = 0): Vec3Tuple => [x, deckYAt(s, x, z), z];
  const back = tail + s.backFootFromTailM;
  const plugX = nose - 0.12;
  return {
    spots: {
      back: on(back),
      front: on(back + 0.31 * riderHeightM),
      chest: on(bb ? nose - 0.4 * L : nose - 0.3 * L),
      hips: on(bb ? tail + 0.05 : nose - 0.3 * L - 0.5),
      dkFoot: on(nose - 0.42 * L),
      dkKnee: on(tail + 0.12),
    },
    leashPlug: bb ? on(plugX, 0.75 * halfWidthAt(s, uAt(s, plugX))) : on(tail + 0.06),
    leashLengthM: bb ? 1.0 : L,
  };
}
