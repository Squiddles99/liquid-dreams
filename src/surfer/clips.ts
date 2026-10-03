import type { PoseName } from './poseNames';
import type { Stance } from './presets';
import { BONES, FINGER_BONES } from './rig';

/**
 * One baked clip (clip slice spec §3.3), in the character rest frame (glTF axes: +Y up, +Z facing, +X the character's
 * left). Per frame: the pelvis joint from the ankles' midpoint (3 numbers, metres), and every bone's world rotation
 * from rest (4 numbers, x y z w), what solvePose calls D. Bones the source lacks (fingers, often) are absent.
 */
export interface BakedClip {
  loop: boolean;
  frames: number;
  /** Which side of the character the board's nose is on: 'left' for a regular-footed source. */
  noseSide: 'left' | 'right';
  pelvis: number[];
  rot: Record<string, number[]>;
}
export interface RiderClips {
  rider: string;
  fps: number;
  clips: Record<string, BakedClip>;
}

/** The poses a clip plays (§4.2): this slice has one. */
export const POSE_CLIP: Partial<Record<PoseName, string>> = { trim: 'trim' };

const KNOWN = new Set<string>([...BONES, ...FINGER_BONES]);
const REQUIRED = BONES.filter((b) => b !== 'root');
const finite = (a: unknown, n: number): boolean => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Everything wrong with a clips file (empty = fine): a stale bake or a hand edit must fail the load, not a frame. */
export function riderClipsProblems(j: unknown): string[] {
  const out: string[] = [];
  const o = j as Partial<RiderClips> | null;
  if (typeof o !== 'object' || o === null) return ['not an object'];
  if (typeof o.fps !== 'number' || !(o.fps > 0)) out.push('fps');
  if (typeof o.clips !== 'object' || o.clips === null) return [...out, 'clips'];
  for (const [name, c] of Object.entries(o.clips)) {
    if (!Number.isInteger(c.frames) || c.frames < 2) { out.push(`${name}: frames`); continue; }
    if (c.noseSide !== 'left' && c.noseSide !== 'right') out.push(`${name}: noseSide`);
    if (typeof c.loop !== 'boolean') out.push(`${name}: loop`);
    if (!finite(c.pelvis, 3 * c.frames)) out.push(`${name}: pelvis`);
    for (const b of REQUIRED) if (!(b in (c.rot ?? {}))) out.push(`${name}: no ${b}`);
    for (const [b, q] of Object.entries(c.rot ?? {})) {
      if (!KNOWN.has(b)) out.push(`${name}: unknown bone ${b}`);
      else if (!finite(q, 4 * c.frames)) out.push(`${name}: ${b}`);
    }
  }
  return out;
}

/**
 * A rider's baked clips (§4.2): null when not built. A 404, or the index.html Vite's dev server answers a missing file
 * with (Review Focus 2). Throws, naming the file, on anything else wrong.
 */
export async function loadRiderClips(url: string, fetchFn: typeof fetch = fetch): Promise<RiderClips | null> {
  const res = await fetchFn(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
  const j: unknown = await res.json();
  const problems = riderClipsProblems(j);
  if (problems.length) throw new Error(`${url}: ${problems.slice(0, 3).join('; ')}`);
  return j as RiderClips;
}

const otherSide = (b: string): string => (b.endsWith('_l') ? `${b.slice(0, -2)}_r` : b.endsWith('_r') ? `${b.slice(0, -2)}_l` : b);

/** The clip for the other foot forward (§3.3 step 6): left and right swapped, everything reflected in x = 0. */
export function mirrorClip(c: BakedClip): BakedClip {
  const rot: Record<string, number[]> = {};
  for (const [b, q] of Object.entries(c.rot)) rot[otherSide(b)] = q.map((v, i) => (i % 4 === 1 || i % 4 === 2 ? -v : v));
  return { ...c, noseSide: c.noseSide === 'left' ? 'right' : 'left', pelvis: c.pelvis.map((v, i) => (i % 3 === 0 ? -v : v)), rot };
}

const mirrored = new WeakMap<BakedClip, BakedClip>();
/** The named clip with the nose on the stance's side (regular: the character's left), mirrored once if need be. */
export function clipFor(rc: RiderClips, name: string, stance: Stance): BakedClip | null {
  const c = rc.clips[name];
  if (!c) return null;
  if (c.noseSide === (stance === 'regular' ? 'left' : 'right')) return c;
  let m = mirrored.get(c);
  if (!m) mirrored.set(c, (m = mirrorClip(c)));
  return m;
}

/** Seconds: a loop includes the step from its last frame back to its first. */
export const clipDuration = (rc: RiderClips, c: BakedClip): number => (c.loop ? c.frames : c.frames - 1) / rc.fps;
