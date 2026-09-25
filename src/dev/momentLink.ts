import { sanitizeConditions, wrapDegrees } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import { findReferenceMoment } from './referenceMoments';

export type CameraMode = 'lineup' | 'free';

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
}

export const MOMENT_VERSION = 1;

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

function parseCamera(v: unknown): CameraPose | null {
  if (typeof v !== 'object' || v === null) return null;
  const c = v as Record<string, unknown>;
  if (c.mode !== 'lineup' && c.mode !== 'free') return null;
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

export function decodeMoment(hash: string): Moment | null {
  if (!hash.startsWith('#m=') || hash.length <= 3) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(hash.slice(3)));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== MOMENT_VERSION) return null;
  const camera = parseCamera(o.camera);
  if (!camera) return null;
  return {
    conditions: sanitizeConditions(o.conditions),
    camera,
    simTime: finite(o.simTime) && o.simTime >= 0 ? o.simTime : 0,
    paused: o.paused === true,
  };
}

/** `#m=<link>` or `#ref=<reference-moment-name>`; anything else → null. */
export function momentFromHash(hash: string): Moment | null {
  if (hash.startsWith('#ref=')) {
    try {
      return findReferenceMoment(decodeURIComponent(hash.slice(5)));
    } catch {
      return null;
    }
  }
  return decodeMoment(hash);
}
