import type { Stance } from './presets';
import { type RiderClips, riderClipsProblems } from './clips';

/** The six held poses of ride-speed part C (ride pose blend spec §2), from Andrew's approved set-3 clips. */
export const KEY_POSES = ['tuck', 'stallTall', 'stallHand', 'stallLowBarrel', 'stallStandBarrel', 'driveOut'] as const;
export type KeyPoseName = (typeof KEY_POSES)[number];
/** A hand on something (the rail grip, the hand in the wall): the wrist from the same side's ankle, game axes, metres. */
export interface PoseContact { side: 'l' | 'r'; wrist: [number, number, number] }
export interface PoseLib extends RiderClips { contacts: Partial<Record<KeyPoseName, PoseContact>> }

export function posesProblems(j: unknown): string[] {
  const out = riderClipsProblems(j);
  const o = j as Partial<PoseLib> | null;
  if (!o || typeof o !== 'object' || !o.clips) return out;
  for (const k of ['trim', 'pumpCycle', ...KEY_POSES]) if (!o.clips[k]) out.push(`missing ${k}`);
  // The blend reads these every stall and tuck (final review: a file without them crashed the stand).
  if (typeof o.contacts !== 'object' || o.contacts === null) return [...out, 'contacts'];
  for (const k of ['tuck', 'stallHand', 'stallStandBarrel']) if (!(o.contacts as Record<string, unknown>)[k]) out.push(`missing contact ${k}`);
  for (const [k, c] of Object.entries(o.contacts)) {
    if (c.side !== 'l' && c.side !== 'r') out.push(`${k}: contact side`);
    if (!Array.isArray(c.wrist) || c.wrist.length !== 3 || !c.wrist.every(Number.isFinite)) out.push(`${k}: contact wrist`);
  }
  return out;
}

/** The poses file, or null when it isn't there (a 404 or HTML from the dev server); a broken file throws. */
export async function loadPoseLib(url: string): Promise<PoseLib | null> {
  const res = await fetch(url);
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
  const j: unknown = await res.json();
  const problems = posesProblems(j);
  if (problems.length) throw new Error(`${url}: ${problems.slice(0, 3).join('; ')}`);
  return j as PoseLib;
}

/** A pose's contact for the stance: authored regular (nose on the left); goofy swaps the hand and reflects x. */
export function contactFor(lib: PoseLib, name: KeyPoseName, stance: Stance): PoseContact | null {
  const c = lib.contacts[name];
  if (!c) return null;
  if (stance === 'regular') return c;
  return { side: c.side === 'l' ? 'r' : 'l', wrist: [-c.wrist[0], c.wrist[1], c.wrist[2]] };
}
