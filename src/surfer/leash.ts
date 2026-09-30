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
