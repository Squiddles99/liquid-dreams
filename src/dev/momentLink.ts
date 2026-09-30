import { sanitizeConditions, wrapDegrees } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { type SurferParams, sanitizeSurferParams } from '../surfer/surferParams';
import { findReferenceMoment } from './referenceMoments';

export type CameraMode = 'lineup' | 'free' | 'walk';

export interface CameraPose {
  mode: CameraMode;
  position: [number, number, number];
  /** Compass bearing the camera looks along (0 = north, 90 = east). */
  yawDeg: number;
  pitchDeg: number;
}

export interface Moment {
  conditions: Conditions;
  camera: CameraPose;
  simTime: number;
  paused: boolean;
  /**
   * The stand's surfer, when it was on. Optional, so MOMENT_VERSION stays 1 and every older link still opens (the spec
   * asked for a version bump, but the parser rejects any other version, which would break every saved link: ruling).
   */
  surfer?: SurferParams;
}

export const MOMENT_VERSION = 1;

/** A link's simTime cannot exceed this (11.6 days): unbounded, an absurd value (e.g. a hand-edited link) sends
 * sets.ts's slot search hunting indefinitely and freezes the tab. */
export const MAX_LINK_SIM_TIME_S = 1e6;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A valid camera pose from untrusted input (links, stored settings), or null. */
export function parseCameraPose(v: unknown): CameraPose | null {
  if (typeof v !== 'object' || v === null) return null;
  const c = v as Record<string, unknown>;
  if (c.mode !== 'lineup' && c.mode !== 'free' && c.mode !== 'walk') return null;
  if (!Array.isArray(c.position) || c.position.length !== 3 || !c.position.every(finite)) return null;
  if (!finite(c.yawDeg) || !finite(c.pitchDeg)) return null;
  return {
    mode: c.mode,
    position: [c.position[0], c.position[1], c.position[2]],
    yawDeg: wrapDegrees(c.yawDeg),
    pitchDeg: Math.max(-89, Math.min(89, c.pitchDeg)),
  };
}

export function encodeMoment(m: Moment): string {
  return `#m=${toBase64Url(JSON.stringify({ v: MOMENT_VERSION, ...m }))}`;
}

/** A `#m=` link's moment, or why it was rejected. */
function parseMomentLink(hash: string): Moment | string {
  if (!hash.startsWith('#m=')) return 'not a #m= link';
  if (hash.length <= 3) return 'the #m= link is empty';
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(hash.slice(3)));
  } catch {
    return 'the #m= link is not valid base64url JSON';
  }
  if (typeof raw !== 'object' || raw === null) return 'the #m= link does not hold an object';
  const o = raw as Record<string, unknown>;
  if (o.v !== MOMENT_VERSION) return `the #m= link is version ${String(o.v)}, this build reads version ${MOMENT_VERSION}`;
  const camera = parseCameraPose(o.camera);
  if (!camera) return 'the #m= link has a missing or invalid camera pose';
  return {
    conditions: sanitizeConditions(o.conditions),
    camera,
    simTime: finite(o.simTime) ? Math.min(Math.max(o.simTime, 0), MAX_LINK_SIM_TIME_S) : 0,
    paused: o.paused === true,
    ...(o.surfer !== undefined ? { surfer: sanitizeSurferParams(o.surfer) } : {}),
  };
}

export function decodeMoment(hash: string): Moment | null {
  const m = parseMomentLink(hash);
  return typeof m === 'string' ? null : m;
}

/** A `#ref=` hash's reference moment, or why there is none. */
function parseReferenceHash(hash: string): Moment | string {
  let name: string;
  try {
    name = decodeURIComponent(hash.slice(5));
  } catch {
    return 'the #ref= reference moment name is not valid URI encoding';
  }
  return findReferenceMoment(name) ?? `unknown reference moment "${name}"`;
}

/** `#m=<link>` or `#ref=<reference-moment-name>`; anything else → null. */
export function momentFromHash(hash: string): Moment | null {
  const m = hash.startsWith('#ref=') ? parseReferenceHash(hash) : parseMomentLink(hash);
  return typeof m === 'string' ? null : m;
}

/** Why a non-empty hash opened no moment (for a console warning); null when it is empty or resolves. */
export function momentHashProblem(hash: string): string | null {
  if (hash === '' || hash === '#') return null;
  if (hash.startsWith('#ref=')) {
    const m = parseReferenceHash(hash);
    return typeof m === 'string' ? m : null;
  }
  if (!hash.startsWith('#m=')) return 'expected #m=<moment link> or #ref=<reference moment name>';
  const m = parseMomentLink(hash);
  return typeof m === 'string' ? m : null;
}
