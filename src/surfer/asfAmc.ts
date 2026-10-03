import { Euler, Quaternion, Vector3 } from 'three/webgpu';

/**
 * CMU motion capture's ASF/AMC files (clip slice Task 8): the free, commercially usable source of real motion (Andrew:
 * no paid clips). ASF is the skeleton (each bone's rest direction and length in one global frame, its axis frame and
 * its degrees of freedom); AMC the frames (the root's position and turn, each bone's dof angles in degrees).
 */
export interface AsfBone {
  name: string;
  parent: string;
  /** Rest direction, global frame. */
  direction: Vector3;
  length: number;
  /** The bone's axis frame: its dof angles turn about these axes. */
  C: Quaternion;
  dof: string[];
}
export interface Asf {
  bones: Record<string, AsfBone>;
  /** Bone names, parents first; 'root' leads. */
  order: string[];
}
/** One AMC frame: bone → its values in dof order (root: tx ty tz rx ry rz). */
export type AmcFrame = Record<string, number[]>;

const DEG = Math.PI / 180;
/** ASF/AMC angles: static x, then y, then z (R = Rz Ry Rx), three's 'ZYX' order. */
export const eulerQ = (x: number, y: number, z: number): Quaternion => new Quaternion().setFromEuler(new Euler(x * DEG, y * DEG, z * DEG, 'ZYX'));

export function parseAsf(text: string): Asf {
  const bones: Record<string, AsfBone> = {}, children: Record<string, string[]> = {};
  let section = '', cur: Partial<AsfBone> & { dof?: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(), t = line.split(/\s+/);
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith(':')) {
      section = t[0];
      if (section === ':root' || section === ':units') continue;
      continue;
    }
    if (section === ':root' && t[0] === 'order' && t.slice(1).join(' ').toUpperCase() !== 'TX TY TZ RX RY RZ') throw new Error(`ASF root order ${t.slice(1).join(' ')} unsupported`);
    if (section === ':bonedata') {
      if (t[0] === 'begin') cur = { dof: [] };
      else if (t[0] === 'end' && cur) { bones[cur.name!] = { parent: '', ...cur } as AsfBone; cur = null; }
      else if (cur && t[0] === 'name') cur.name = t[1];
      else if (cur && t[0] === 'direction') cur.direction = new Vector3(+t[1], +t[2], +t[3]).normalize();
      else if (cur && t[0] === 'length') cur.length = +t[1];
      else if (cur && t[0] === 'axis') {
        if ((t[4] ?? 'XYZ').toUpperCase() !== 'XYZ') throw new Error(`ASF axis order ${t[4]} unsupported`);
        cur.C = eulerQ(+t[1], +t[2], +t[3]);
      } else if (cur && t[0] === 'dof') cur.dof = t.slice(1).map((d) => d.toLowerCase());
    }
    if (section === ':hierarchy' && t[0] !== 'begin' && t[0] !== 'end') children[t[0]] = [...(children[t[0]] ?? []), ...t.slice(1)];
  }
  const order = ['root'];
  for (let i = 0; i < order.length; i++) for (const c of children[order[i]] ?? []) {
    if (!bones[c]) throw new Error(`ASF hierarchy names ${c}, which has no bonedata`);
    bones[c].parent = order[i];
    order.push(c);
  }
  return { bones, order };
}

export function parseAmc(text: string): AmcFrame[] {
  const frames: AmcFrame[] = [];
  let started = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith(':')) { started = true; continue; }
    if (!started) continue;
    if (/^\d+$/.test(line)) { frames.push({}); continue; }
    const t = line.split(/\s+/);
    if (frames.length) frames[frames.length - 1][t[0]] = t.slice(1).map(Number);
  }
  return frames;
}

/** One frame posed: each bone's world rotation from rest (global frame) and where it ends (the root: its position). */
export interface AsfPose {
  rot: Record<string, Quaternion>;
  end: Record<string, Vector3>;
}

/** Forward kinematics: a bone turns by parent × C × R(dofs) × C⁻¹ and ends at its parent's end + that × direction × length. */
export function asfPose(asf: Asf, frame: AmcFrame): AsfPose {
  const r = frame.root ?? [0, 0, 0, 0, 0, 0];
  const rot: Record<string, Quaternion> = { root: eulerQ(r[3], r[4], r[5]) }, end: Record<string, Vector3> = { root: new Vector3(r[0], r[1], r[2]) };
  for (const n of asf.order) {
    if (n === 'root') continue;
    const b = asf.bones[n], v = frame[n] ?? [], a = { rx: 0, ry: 0, rz: 0 } as Record<string, number>;
    b.dof.forEach((d, i) => { a[d] = v[i] ?? 0; });
    rot[n] = rot[b.parent].clone().multiply(b.C).multiply(eulerQ(a.rx, a.ry, a.rz)).multiply(b.C.clone().invert());
    end[n] = end[b.parent].clone().add(b.direction.clone().multiplyScalar(b.length).applyQuaternion(rot[n]));
  }
  return { rot, end };
}
