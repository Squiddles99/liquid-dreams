// src/surfer/poseTestKit.ts (test-only: imported by *.test.ts files, never by the game)
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { type BoardSpec, bottomYAt, deckYAt, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
import { type Box, PACK_PARTS, carriedBoard } from './carry';
import type { BoardFrame, SolvedPose } from './solvePose';
import { glbFloats, glbJson } from './glbData';
import { groundFrame } from './placement';
import type { PoseName } from './poseNames';
import { poseTargets } from './poses';
import { PRESETS, type PresetName, boardFor, boardsFor } from './presets';
import { BONES, type BoneName, type Limb, type SkeletonRest, type SurferManifest, referenceSkeleton, restFromManifest } from './rig';
import { boardQuaternion, solvePose } from './solvePose';

export const DIALS = { compression: 0, lean: 0, twist: 0, reach: 0 };
export const NAMES: PresetName[] = ['female', 'male', 'grommet'];

export function builtRest(name: PresetName): SkeletonRest {
  const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
  return restFromManifest(man, Object.fromEntries(BONES.map((b) => [b, new Quaternion()])) as Record<BoneName, Quaternion>);
}

export type StandCase = { tag: string; name: PresetName; rest: SkeletonRest; kind: ReturnType<typeof boardsFor>[number]; side: Limb };

/** Every rider × skeleton (reference, built) × board × side. */
export function standCases(): StandCase[] {
  const out: StandCase[] = [];
  for (const name of NAMES) for (const [skel, rest] of [['ref', referenceSkeleton(PRESETS[name].heightM)], ['built', builtRest(name)]] as const)
    for (const kind of boardsFor(PRESETS[name])) for (const side of ['l', 'r'] as Limb[]) out.push({ tag: `${name} ${skel} ${kind} ${side}`, name, rest, kind, side });
  return out;
}

/** A tilted-heading ground frame (the carry's Review Focus 5). */
export const GROUND = groundFrame({ x: 5, z: -2, headingDeg: 137, heightNudgeM: 0, pitchNudgeDeg: 0 }, 3, 0, 0);
export const Qg = boardQuaternion(GROUND);
export const toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qg).add(GROUND.position);

/** A land pose solved for one case: the targets, the solve, and the carried board. */
export function solveStand(pose: PoseName, c: StandCase, phaseT = 0, lookYawDeg = 0, reach = 0) {
  const spec = boardFor(PRESETS[c.name], c.kind);
  const t = poseTargets(pose, { spec, layout: layoutFor(spec, c.rest.heightM), rest: c.rest, stance: 'regular', dials: { ...DIALS, reach }, phaseT, carrySide: c.side, who: c.name });
  const look = t.look.clone().applyAxisAngle(new Vector3(0, 1, 0), (lookYawDeg * Math.PI) / 180).applyQuaternion(Qg);
  const head = toW(c.rest.joint.head);
  const s = solvePose(c.rest, t, GROUND, head.add(look.multiplyScalar(10)));
  return { spec, t, s, board: carriedBoard(t.carry!, GROUND, s) };
}

/** How deep a point is inside the board (0 outside). */
export function depthIn(p: Vector3, boxes: readonly Box[]): number {
  let deepest = 0;
  for (const b of boxes) {
    const d = p.clone().sub(b.centre);
    let inside = Infinity;
    for (let k = 0; k < 3; k++) inside = Math.min(inside, b.half[k] - Math.abs(d.dot(b.axes[k])));
    deepest = Math.max(deepest, inside);
  }
  return deepest;
}

/** A rider's pack and what's on it, rest pose (glTF axes), from the built glb. */
export function packPoints(name: PresetName, parts: readonly string[] = PACK_PARTS): number[][] {
  const path = `public/surfer/${name}.glb`, gltf = glbJson(path), out: number[][] = [];
  for (const m of gltf.meshes) for (const p of m.primitives) {
    if (!parts.includes(gltf.materials[p.material].name)) continue;
    const f = glbFloats(path, gltf, p.attributes.POSITION);
    for (let i = 0; i < f.length; i += 3) out.push([f[i], f[i + 1], f[i + 2]]);
  }
  return out;
}

/**
 * How far the carrying hand reaches into its board (m; 0 when it lies outside): the hand from the wrist to the fingertips
 * (10.8% of the rider's height, as the solved hand bone points it), 1.2 cm half thick, against the board's outline and
 * its bottom face (the side away from the body). Gate A: T-Bone's straight-on hand cut through the lower rail.
 */
export function handIntoBoard(s: SolvedPose, rest: SkeletonRest, side: Limb, board: BoardFrame, spec: BoardSpec): number {
  const h = `hand_${side}` as const, fa = `forearm_${side}` as const;
  const restDir = rest.joint[h].clone().sub(rest.joint[fa]).normalize();
  const dir = restDir.applyQuaternion(s.world[h].clone().multiply(rest.restQ[h].clone().invert()));
  const inv = boardQuaternion(board).invert(), L = 0.108 * rest.heightM;
  let worst = 0;
  for (let k = 0; k <= 40; k++) {
    const q = s.joint[h].clone().add(dir.clone().multiplyScalar((k / 40) * L)).sub(board.position).applyQuaternion(inv);
    if (Math.abs(q.x) > spec.lengthM / 2 || Math.abs(q.z) > halfWidthAt(spec, uAt(spec, q.x))) continue;
    worst = Math.max(worst, q.y + 0.012);
  }
  return worst;
}

/** A built body's grip data (finger joints from the hand's head, rest and curled), from its manifest. */
export function gripOf(name: PresetName): NonNullable<SurferManifest['grip']> {
  const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
  if (!man.grip) throw new Error(`${name}'s manifest has no grip data: rebuild the bodies (npm run build:surfers)`);
  return man.grip;
}

/** The carrying hand's shape for a board: the rail grip, or open flat on a bodyboard (its rail out of reach). */
export const handShapeFor = (kind: string): 'grip' | 'flat' => (kind === 'bodyboard' ? 'flat' : 'grip');

/** The hand's fingers in the world (each finger's four joints) in a baked shape, placed by the solved hand. */
export function gripFingers(s: SolvedPose, rest: SkeletonRest, side: Limb, name: PresetName, shape: 'grip' | 'flat' = 'grip'): Vector3[][] {
  const h = `hand_${side}` as const, D = s.world[h].clone().multiply(rest.restQ[h].clone().invert());
  const pts = gripOf(name)[side][shape];
  if (!pts) throw new Error(`${name}'s manifest has no '${shape}' hand: rebuild the bodies (npm run build:surfers)`);
  return pts.map((finger) => finger.map((p) => s.joint[h].clone().add(new Vector3(...p).applyQuaternion(D))));
}

/**
 * How deep the curled fingers (and the palm, wrist to knuckles) go into the board (m; 0 when clear): every 4 mm along
 * them, a finger 8 mm in radius (scaled with the rider), against the board's real section (bottom to deck, rail to rail).
 */
export function gripIntoBoard(s: SolvedPose, rest: SkeletonRest, side: Limb, name: PresetName, board: BoardFrame, spec: BoardSpec, shape: 'grip' | 'flat' = 'grip'): number {
  const r = 0.008 * (rest.heightM / 1.78), inv = boardQuaternion(board).invert();
  const fingers = gripFingers(s, rest, side, name, shape), wrist = s.joint[`hand_${side}`];
  const segs: [Vector3, Vector3][] = [];
  for (const f of fingers) {
    segs.push([wrist, f[0]]);
    for (let i = 0; i < 3; i++) segs.push([f[i], f[i + 1]]);
  }
  let worst = 0;
  for (const [a, b] of segs) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.004));
    for (let k = 0; k <= n; k++) {
      const q = a.clone().lerp(b, k / n).sub(board.position).applyQuaternion(inv);
      if (Math.abs(q.x) > spec.lengthM / 2) continue;
      const hw = halfWidthAt(spec, uAt(spec, q.x)), lo = bottomYAt(spec, q.x, q.z), hi = deckYAt(spec, q.x, q.z);
      const inWidth = hw + r - Math.abs(q.z), above = q.y - (lo - r), below = hi + r - q.y;
      if (inWidth > 0 && above > 0 && below > 0) worst = Math.max(worst, Math.min(inWidth, above, below));
    }
  }
  return worst;
}

/**
 * Which of the index, middle and ring fingertips hook the lower rail: past the rail's middle (its height at the edge, the
 * deck side of it) and hugging it, within 1.5 cm of its outline or back over the deck. Andrew: "his fingers should be
 * grasping the rail of the board".
 */
export function gripHooks(s: SolvedPose, rest: SkeletonRest, side: Limb, name: PresetName, board: BoardFrame, spec: BoardSpec): boolean[] {
  const inv = boardQuaternion(board).invert();
  return gripFingers(s, rest, side, name).slice(0, 3).map((f) => {
    const tip = f[3].clone().sub(board.position).applyQuaternion(inv), hw = halfWidthAt(spec, uAt(spec, tip.x));
    const edge = Math.sign(tip.z || -1) * (hw - 0.002), mid = (bottomYAt(spec, tip.x, edge) + deckYAt(spec, tip.x, edge)) / 2;
    return tip.y >= mid && Math.abs(tip.z) - hw <= 0.015;
  });
}
