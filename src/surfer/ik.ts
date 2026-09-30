import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';

/** The closest a two-bone chain can fold its end to its root without bending past maxFlexDeg. */
export function minReach(l1: number, l2: number, maxFlexDeg: number): number {
  const c = Math.cos((maxFlexDeg * Math.PI) / 180);
  return Math.sqrt(Math.max(l1 * l1 + l2 * l2 + 2 * l1 * l2 * c, 0));
}

/** A unit vector perpendicular to unit v. */
export function anyPerpendicular(v: Vector3): Vector3 {
  const a = Math.abs(v.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  return a.sub(v.clone().multiplyScalar(a.dot(v))).normalize();
}

/** The rotation whose x axis is `primary` and whose y axis is `secondary` made perpendicular to it. */
export function basisQ(primary: Vector3, secondary: Vector3): Quaternion {
  const x = primary.clone().normalize();
  const y = secondary.clone().sub(x.clone().multiplyScalar(secondary.dot(x)));
  if (y.lengthSq() < 1e-10) y.copy(anyPerpendicular(x));
  y.normalize();
  const z = new Vector3().crossVectors(x, y);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** The rotation taking rest direction d0 to d, with rest secondary s0 turned toward s (the bone's twist). */
export function aimRotation(d0: Vector3, s0: Vector3, d: Vector3, s: Vector3): Quaternion {
  return basisQ(d, s).multiply(basisQ(d0, s0).invert());
}

export interface TwoBone {
  mid: Vector3;
  end: Vector3;
  /** False when the target was out of reach (or too close) and the end was clamped onto the line toward it. */
  reached: boolean;
}

/** Analytic two-bone IK: the middle joint bends toward `pole`, never past maxFlexDeg. */
export function twoBoneIK(root: Vector3, target: Vector3, l1: number, l2: number, pole: Vector3, maxFlexDeg: number): TwoBone {
  const toT = target.clone().sub(root);
  const raw = toT.length();
  const maxR = (l1 + l2) * 0.9995, minR = minReach(l1, l2, maxFlexDeg);
  const dist = Math.min(Math.max(raw, minR), maxR);
  const dir = raw > 1e-9 ? toT.divideScalar(raw) : new Vector3(0, -1, 0);
  const end = root.clone().add(dir.clone().multiplyScalar(dist));
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  let p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  p = p.lengthSq() < 1e-10 ? anyPerpendicular(dir) : p.normalize();
  const mid = root.clone().add(dir.clone().multiplyScalar(a)).add(p.multiplyScalar(h));
  return { mid, end, reached: raw >= minR - 1e-9 && raw <= maxR + 1e-9 };
}

/** How far the middle joint is bent (0 = straight). */
export function flexDeg(root: Vector3, mid: Vector3, end: Vector3): number {
  return 180 - (root.clone().sub(mid).angleTo(end.clone().sub(mid)) * 180) / Math.PI;
}
