import { Vector3 } from 'three/webgpu';

export const LEASH_POINTS = 16;
export const LEASH_SIDES = 6;
const LIFT_M = 0.012;
const MAX_SAG_M = 0.4;

/**
 * The leash from the ankle (or arm) to the plug, board frame (spec §3.2): a quadratic sag with the slack, lifted onto
 * the deck wherever it crosses the board, so it never passes through it.
 */
export function leashCurve(from: Vector3, to: Vector3, lengthM: number, deckY: (x: number, z: number) => number | null, n = LEASH_POINTS): Vector3[] {
  const slack = Math.max(0, lengthM - from.distanceTo(to));
  const sag = Math.min(0.5 * slack, MAX_SAG_M);
  const ctrl = from.clone().add(to).multiplyScalar(0.5);
  ctrl.y -= 2 * sag;
  const pts: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const p = new Vector3(a * from.x + b * ctrl.x + c * to.x, a * from.y + b * ctrl.y + c * to.y, a * from.z + b * ctrl.z + c * to.z);
    const d = deckY(p.x, p.z);
    if (d !== null && p.y < d + LIFT_M) p.y = d + LIFT_M;
    pts.push(p);
  }
  return pts;
}

/** A tube of `sides` around the points, written into `out` ((points × sides) × 3). */
export function tubePositions(points: readonly Vector3[], radius: number, sides: number, out: Float32Array): void {
  const t = new Vector3(), n = new Vector3(), b = new Vector3();
  for (let i = 0; i < points.length; i++) {
    t.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
    n.set(0, 1, 0).cross(t);
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(t);
    n.normalize();
    b.crossVectors(t, n);
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides, o = (i * sides + k) * 3;
      out[o] = points[i].x + radius * (Math.cos(a) * n.x + Math.sin(a) * b.x);
      out[o + 1] = points[i].y + radius * (Math.cos(a) * n.y + Math.sin(a) * b.y);
      out[o + 2] = points[i].z + radius * (Math.cos(a) * n.z + Math.sin(a) * b.z);
    }
  }
}

export function tubeIndices(nPoints: number, sides: number): Uint32Array {
  const idx: number[] = [];
  for (let i = 0; i < nPoints - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k, b = i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  return new Uint32Array(idx);
}

/** The cuff the leash is strapped to: a neoprene band round the limb, `width` along its `axis`. */
export interface Cuff { centre: Vector3; axis: Vector3; radius: number; width: number }
export const CUFF_SIDES = 12;

/**
 * Where the leash straps on (Andrew: to the wrist): a bodyboarder's right wrist, round the forearm 3 cm above the
 * wrist joint; a surfer's trailing ankle (regular: the right), round the shin 6 cm above the ankle joint. Sized to the
 * rider (a 1.75 m rider's wrist ~2.4 cm across the cuff's middle, ankle ~3.6 cm, plus the neoprene).
 */
export function leashCuff(board: string, stance: 'regular' | 'goofy', joint: Record<string, Vector3>, heightM: number): Cuff {
  const k = heightM / 1.75;
  if (board === 'bodyboard') {
    const axis = joint.hand_r.clone().sub(joint.forearm_r).normalize();
    return { centre: joint.hand_r.clone().addScaledVector(axis, -0.03), axis, radius: 0.024 * k + 0.004, width: 0.04 };
  }
  const t = stance === 'regular' ? 'r' : 'l';
  const axis = joint[`foot_${t}`].clone().sub(joint[`shin_${t}`]).normalize();
  return { centre: joint[`foot_${t}`].clone().addScaledVector(axis, -0.06), axis, radius: 0.036 * k + 0.005, width: 0.05 };
}

/** Where the leash leaves the cuff: on its side facing `toward` (the plug). */
export function leashStart(c: Cuff, toward: Vector3): Vector3 {
  const d = toward.clone().sub(c.centre);
  d.addScaledVector(c.axis, -d.dot(c.axis));
  if (d.lengthSq() < 1e-12) d.copy(new Vector3(0, -1, 0)).addScaledVector(c.axis, c.axis.y).normalize();
  return c.centre.clone().addScaledVector(d.normalize(), c.radius);
}

/** The cuff's band: two rings of CUFF_SIDES at either edge, written into `out` (2 × CUFF_SIDES × 3). */
export function cuffPositions(c: Cuff, out: Float32Array): void {
  const n = new Vector3(0, 1, 0).cross(c.axis);
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(c.axis);
  n.normalize();
  const b = new Vector3().crossVectors(c.axis, n);
  for (let r = 0; r < 2; r++) {
    const along = (r - 0.5) * c.width;
    for (let k = 0; k < CUFF_SIDES; k++) {
      const a = (2 * Math.PI * k) / CUFF_SIDES, o = (r * CUFF_SIDES + k) * 3;
      out[o] = c.centre.x + along * c.axis.x + c.radius * (Math.cos(a) * n.x + Math.sin(a) * b.x);
      out[o + 1] = c.centre.y + along * c.axis.y + c.radius * (Math.cos(a) * n.y + Math.sin(a) * b.y);
      out[o + 2] = c.centre.z + along * c.axis.z + c.radius * (Math.cos(a) * n.z + Math.sin(a) * b.z);
    }
  }
}
