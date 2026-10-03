// src/surfer/poseTestKit.ts (test-only: imported by *.test.ts files, never by the game)
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three/webgpu';
import { type BoardSpec, halfWidthAt, layoutFor, uAt } from '../board/boardSpec';
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
