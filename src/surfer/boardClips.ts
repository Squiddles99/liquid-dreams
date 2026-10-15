import { Quaternion, Vector3 } from 'three/webgpu';
import { type BoardSpec, deckYAt } from '../board/boardSpec';
import { type ClipSample, sampleClip } from './clipPlayer';
import type { ClipSolved } from './clipPose';
import { BONES, type BoneName, FINGER_BONES, type FingerBone, PARENT, type SkeletonRest } from './rig';
import { type BoardFrame, boardQuaternion } from './solvePose';

/**
 * The hero swap (2026-10-16): Andrew's approved clips that lie and sit on the board (sitting and waiting, sitting to
 * paddling, the paddle stroke, and later the turn while lying, the duck dive, the bail), exported from Shazza's hero rig
 * relative to the board itself (tools/hero/export_board_clips.py, in liquid-dreams-process). The ride clips stand on the
 * board by the ankles (clipPose); these ride the board: the game's board carries her as the physics moves it.
 */
export interface BoardClip {
  loop: boolean;
  frames: number;
  /** Per frame: [x / board length, height over the deck at that x, z], in the board's frame (m). */
  pelvis: number[];
  /** Per frame and bone: its rotation from rest in the board's frame, game axes [x, y, z, w]. */
  rot: Record<string, number[]>;
}
export interface BoardClips {
  rider: string;
  fps: number;
  boardLengthM: number;
  clips: Record<string, BoardClip>;
}
export type BoardClipName = 'sitIdle' | 'sitTurn' | 'sitToProne' | 'paddleCycle' | 'proneTurn' | 'duckDive' | 'bail';

/** The hips' soft floor over the deck (m): eased below HIP_SOFT, never under HIP_FLOOR. */
export const HIP_SOFT = 0.13, HIP_FLOOR = 0.1;

const KNOWN = new Set<string>([...BONES, ...FINGER_BONES]);
const finite = (a: unknown, n: number): boolean => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Everything wrong with a board clips file (empty = fine): a bad export fails the load, never a frame. */
export function boardClipsProblems(j: unknown): string[] {
  const o = j as Partial<BoardClips> | null;
  if (typeof o !== 'object' || o === null) return ['not an object'];
  const out: string[] = [];
  if (!(typeof o.fps === 'number' && o.fps > 0)) out.push('fps');
  if (!(typeof o.boardLengthM === 'number' && o.boardLengthM > 0)) out.push('boardLengthM');
  if (typeof o.clips !== 'object' || o.clips === null) return [...out, 'clips'];
  for (const [name, c] of Object.entries(o.clips)) {
    if (typeof c !== 'object' || c === null) { out.push(`${name}: not a clip`); continue; }
    if (!(Number.isInteger(c.frames) && c.frames >= 2)) { out.push(`${name}: frames`); continue; }
    if (!finite(c.pelvis, 3 * c.frames)) out.push(`${name}: pelvis`);
    for (const b of BONES) if (b !== 'root' && !c.rot?.[b]) out.push(`${name}: no ${b}`);
    for (const [b, q] of Object.entries(c.rot ?? {})) {
      if (!KNOWN.has(b)) out.push(`${name}: unknown bone ${b}`);
      else if (!finite(q, 4 * c.frames)) out.push(`${name}: ${b} values`);
    }
  }
  return out;
}

export async function loadBoardClips(url: string): Promise<BoardClips | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as unknown;
  const p = boardClipsProblems(j);
  if (p.length) throw new Error(`${url}: ${p.slice(0, 5).join('; ')}`);
  return j as BoardClips;
}

export const boardClipDuration = (lib: BoardClips, name: string): number => {
  const c = lib.clips[name];
  return c ? (c.loop ? c.frames : c.frames - 1) / lib.fps : 0;
};

/** The clip at t seconds (a loop wraps, a one-shot holds its ends); null when the file hasn't it. */
export function sampleBoardClip(lib: BoardClips, name: string, t: number): ClipSample | null {
  const c = lib.clips[name];
  return c ? sampleClip({ ...c, noseSide: 'left' }, lib.fps, t) : null;
}

/** Two board samples blended (a cross-fade between board clips: both ride the same board, so nothing slides). */
export function blendBoardSamples(a: ClipSample, b: ClipSample, k: number): ClipSample {
  const rot: ClipSample['rot'] = {};
  for (const [bone, q] of Object.entries(a.rot)) rot[bone] = b.rot[bone] ? q!.clone().slerp(b.rot[bone]!, k) : q!.clone();
  return { pelvis: a.pelvis.clone().lerp(b.pelvis, k), rot };
}

/** A board sample on the game's board: the pelvis at the same share of the board and height over its deck, every bone's
 * rotation from the clip in the board's frame, the joints by the game body's own bones; the clip's own head and hands. */
export function boardClipPose(rest: SkeletonRest, s: ClipSample, spec: BoardSpec, board: BoardFrame): ClipSolved {
  const half = spec.lengthM / 2, x = Math.min(half, Math.max(-half, s.pelvis.x * spec.lengthM));
  // A soft floor (final review): the hero's sit-to-paddle sinks the hips to ~7 cm over its deck mid-move, into the deck
  // on the game's board; under HIP_SOFT the height eases toward HIP_FLOOR, never below (lying 13 cm, sitting 17: kept).
  const h = s.pelvis.y < HIP_SOFT ? HIP_SOFT - (HIP_SOFT - HIP_FLOOR) * Math.tanh((HIP_SOFT - s.pelvis.y) / (HIP_SOFT - HIP_FLOOR)) : s.pelvis.y;
  const P = new Vector3(x, deckYAt(spec, x, 0) + h, s.pelvis.z);
  const D = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) D[b] = b === 'root' ? new Quaternion() : (s.rot[b]?.clone() ?? new Quaternion());
  const J = {} as Record<BoneName, Vector3>;
  J.root = rest.joint.root.clone();
  J.pelvis = P;
  for (const b of BONES) {
    if (b === 'root' || b === 'pelvis') continue;
    const p = PARENT[b]!;
    J[b] = J[p].clone().add(rest.joint[b].clone().sub(rest.joint[p]).applyQuaternion(D[p]));
  }
  const Qb = boardQuaternion(board), toW = (v: Vector3): Vector3 => v.clone().applyQuaternion(Qb).add(board.position);
  const joint = {} as Record<BoneName, Vector3>, world = {} as Record<BoneName, Quaternion>, local = {} as Record<BoneName, Quaternion>;
  for (const b of BONES) joint[b] = b === 'root' ? rest.joint.root.clone() : toW(J[b]);
  for (const b of BONES) world[b] = (b === 'root' ? new Quaternion() : Qb.clone().multiply(D[b])).multiply(rest.restQ[b]);
  for (const b of BONES) { const p = PARENT[b]; local[b] = p ? world[p].clone().invert().multiply(world[b]) : world[b].clone(); }
  const fingers: Partial<Record<FingerBone, Quaternion>> = {};
  for (const g of FINGER_BONES) { const q = s.rot[g]; if (q) fingers[g] = Qb.clone().multiply(q); }
  return { pelvisWorld: toW(P), joint, world, local, fingers };
}
