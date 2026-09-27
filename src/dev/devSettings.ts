import type { BreakParams } from '../breaker/breaking';
import { cloneConditions } from '../conditions/defaults';
import { sanitizeConditions } from '../conditions/sanitize';
import type { Conditions } from '../conditions/types';
import type { OceanSimParams } from '../ocean/OceanSimulation';
import type { DebugOverlays } from '../ocean/OceanSurface';
import type { OceanSpectrumParams } from '../ocean/spectrum';
import type { WaterOpticsParams } from '../ocean/waterOptics';
import type { ShallowSwellParams } from '../ocean/waterSurface';
import type { PictureParams } from '../render/PicturePipeline';
import type { ReefParams } from '../seabed/wombReef';
import type { AtmosphereParams } from '../sky/atmosphereParams';
import type { SetParams } from '../swell/sets';
import { type CameraPose, type Moment, parseCameraPose } from './momentLink';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS, findReferenceMoment, type MomentKind } from './referenceMoments';

/**
 * Dev settings that survive a reload and a reference pick (Andrew: "my tweaks carry over").
 * Pure functions over a minimal storage interface, so tests pass a fake and a missing or blocked
 * localStorage never breaks the app.
 */

export const DEV_SETTINGS_KEY = 'liquid-dreams.dev-settings.v1';
/**
 * Saved with the settings. A stored `breaking` from another model is dropped for the defaults: its numbers meant
 * something else there (model 2: the breaking ratio became ρ = H / breakingHeight, so the stage span, the drain end,
 * the collapse start and the ribbon onset all moved; model 3: the ribbon onset rose to 0.7, above the deep water's ρ at
 * 6.6 ft, so the ribbon no longer redraws the plain sheet along every crest in the set; model 4: the curl collapses over
 * 1.8 × its landing time, not 1 ×, so a barrel no longer drops like a trap door once the lip lands).
 */
export const BREAKING_MODEL = 4;

export interface SettingsStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** `custom`: picks carry the user's conditions, camera and look over, and edits are saved. `default`: moments as designed. */
export type SettingsMode = 'custom' | 'default';

/** The look: every tuning object the panel edits besides the moment's conditions. A reference pick never changes these in custom mode. */
export interface DevLookParams {
  spectrum: OceanSpectrumParams;
  sim: OceanSimParams;
  water: WaterOpticsParams;
  atmosphere: AtmosphereParams;
  picture: PictureParams;
  maxFps: number;
  sets: SetParams;
  reef: ReefParams;
  shallow: ShallowSwellParams;
  overlays: DebugOverlays;
  breaking: BreakParams;
}

export interface DevSettings extends DevLookParams {
  mode: SettingsMode;
  conditions: Conditions;
  camera: CameraPose;
  /** The reference list's display, e.g. after a pick or a #ref= link visit. Display state only: loading it never re-applies the moment. */
  reference: string;
}

export const LOOK_KEYS = ['spectrum', 'sim', 'water', 'atmosphere', 'picture', 'maxFps', 'sets', 'reef', 'shallow', 'overlays', 'breaking'] as const satisfies readonly (keyof DevLookParams)[];

type Plain = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep copy of JSON-shaped data (every settings value is numbers, strings, booleans, arrays and plain objects). */
const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function cloneDevSettings(s: DevSettings): DevSettings {
  return deepClone(s);
}

export function cloneLook(l: DevLookParams): DevLookParams {
  const out = {} as Record<string, unknown>;
  for (const k of LOOK_KEYS) out[k] = deepClone(l[k]);
  return out as unknown as DevLookParams;
}

/** Stored value if it has the default's type (arrays: same length, element-wise; objects: key by key), else the default. */
function mergeValue(def: unknown, stored: unknown): unknown {
  if (Array.isArray(def)) {
    const ok = Array.isArray(stored) && stored.length === def.length && stored.every((x, i) => typeof x === typeof def[i]);
    return ok ? [...(stored as unknown[])] : deepClone(def);
  }
  if (isPlainObject(def)) {
    const src = isPlainObject(stored) ? stored : {};
    const out: Plain = {};
    for (const k of Object.keys(def)) out[k] = mergeValue(def[k], src[k]);
    return out;
  }
  if (typeof def === 'number') return typeof stored === 'number' && Number.isFinite(stored) ? stored : def;
  return typeof stored === typeof def ? stored : def;
}

/** Writes the settings as JSON. Never throws (a full or blocked store just keeps the old value). */
export function saveDevSettings(storage: SettingsStorage, settings: DevSettings): void {
  try {
    storage.setItem(DEV_SETTINGS_KEY, JSON.stringify({ ...settings, breakingModel: BREAKING_MODEL }));
  } catch {
    // Storage unavailable or full: the app behaves as it did before settings were persisted.
  }
}

/**
 * The stored settings, fully populated from `defaults` wherever a value is missing or has the wrong type;
 * null when nothing usable is stored. Never throws. Unknown keys are ignored.
 */
export function loadDevSettings(storage: SettingsStorage, defaults: DevSettings): DevSettings | null {
  let raw: unknown;
  try {
    const text = storage.getItem(DEV_SETTINGS_KEY);
    if (text === null) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  const look = {} as Record<string, unknown>;
  for (const k of LOOK_KEYS) look[k] = mergeValue(defaults[k], raw[k]);
  if (raw.breakingModel !== BREAKING_MODEL) look.breaking = deepClone(defaults.breaking);
  return {
    ...(look as unknown as DevLookParams),
    mode: raw.mode === 'default' || raw.mode === 'custom' ? raw.mode : 'custom',
    conditions: isPlainObject(raw.conditions) ? sanitizeConditions(raw.conditions) : cloneConditions(defaults.conditions),
    camera: parseCameraPose(raw.camera) ?? deepClone(defaults.camera),
    reference: typeof raw.reference === 'string' && REFERENCE_MOMENTS.some((r) => r.name === raw.reference) ? raw.reference : DEFAULT_MOMENT_NAME,
  };
}

/** Removes the stored settings. Never throws. */
export function clearDevSettings(storage: SettingsStorage): void {
  try {
    storage.removeItem(DEV_SETTINGS_KEY);
  } catch {
    // Nothing stored that we can reach, so nothing to clear.
  }
}

/**
 * The profile a save stores. After a #m= / #ref= link opened a moment, the link's conditions and camera are a visit,
 * not an edit: the stored profile keeps its own until the user takes the moment over; the look is saved either way.
 * The reference name goes with them: a visit doesn't overwrite the reference list either, so a reload shows the
 * last one Andrew actually picked (own or a time moment), not a view or set he only passed through.
 */
export function mergeProfile(snapshot: DevSettings, stored: DevSettings, conditionsFromLink: boolean): DevSettings {
  const out = cloneDevSettings(snapshot);
  if (conditionsFromLink) {
    out.conditions = cloneConditions(stored.conditions);
    out.camera = deepClone(stored.camera);
    out.reference = stored.reference;
  }
  return out;
}

/** The custom profile and whether the moment on screen came from a link (see mergeProfile). */
export class CustomProfile {
  private linkVisit = false;

  constructor(public profile: DevSettings) {}

  get visiting(): boolean {
    return this.linkVisit;
  }

  /** A link, or a view/set reference pick in custom mode, applied its moment: a visit that leaves the profile's conditions and camera alone. */
  visitLink(): void {
    this.linkVisit = true;
  }

  /** The user took the moment over: edited a condition, picked a time moment, reset, or switched mode. */
  own(): void {
    this.linkVisit = false;
  }

  /** Fold the app's current state into the profile and return it. */
  capture(snapshot: DevSettings): DevSettings {
    this.profile = mergeProfile(snapshot, this.profile, this.linkVisit);
    return this.profile;
  }
}

/** Copy `source` into `target` in place (the panel binds `target`); arrays are copied element-wise, keeping their identity. */
export function assignParams<T extends object>(target: T, source: T): void {
  const t = target as Plain, s = source as Plain;
  for (const k of Object.keys(t)) {
    const tv = t[k], sv = s[k];
    if (Array.isArray(tv) && Array.isArray(sv)) {
      tv.length = 0;
      tv.push(...sv);
    } else if (isPlainObject(tv) && isPlainObject(sv)) assignParams(tv, sv);
    else t[k] = sv;
  }
}

/**
 * A custom-mode reference pick: the moment's date and time of day, simTime and pause state; the current swell,
 * wind, tide and seed; and the current camera pose (Andrew: "and also be facing the same way").
 */
export function carryOverPick(current: Conditions, camera: CameraPose, picked: Moment): Moment {
  const conditions = cloneConditions(current);
  conditions.date = picked.conditions.date;
  conditions.timeOfDay = picked.conditions.timeOfDay;
  return { conditions, camera: deepClone(camera), simTime: picked.simTime, paused: picked.paused };
}

export interface ReferencePick {
  moment: Moment;
  /** Whether this pick counts as a visit (see CustomProfile): a save leaves the stored profile's conditions and camera untouched, as for a hash link. */
  visit: boolean;
}

/**
 * What picking a reference moment in the panel applies, and whether the pick counts as a visit. Default mode
 * always shows the moment exactly as designed and is never a visit. Custom mode carries over by kind:
 *  - 'time': carryOverPick from Andrew's own conditions and camera - the live ones, or, while a visit is already
 *    active, the ones in his stored profile (a time pick always returns to his own profile and ends the visit,
 *    rather than carrying over the visited state it's leaving).
 *  - 'view': the same carry-over, but the moment's own camera; a visit, since that camera isn't his own.
 *  - 'set': the full moment; a visit, since a set's timeline only lands on cue with its own conditions.
 */
export function pickMoment(
  mode: SettingsMode, kind: MomentKind, visiting: boolean,
  current: Conditions, stored: Pick<DevSettings, 'conditions' | 'camera'>, camera: CameraPose, picked: Moment,
): ReferencePick {
  if (mode === 'default') return { moment: deepClone(picked), visit: false };
  if (kind === 'set') return { moment: deepClone(picked), visit: true };
  const base = visiting ? stored : { conditions: current, camera };
  const pickedCamera = kind === 'view' ? picked.camera : base.camera;
  return { moment: carryOverPick(base.conditions, pickedCamera, picked), visit: kind === 'view' };
}

/** The reference moment a `#ref=` hash names, if it names one. */
export function referenceNameFromHash(hash: string): string | null {
  if (!hash.startsWith('#ref=')) return null;
  let name: string;
  try {
    name = decodeURIComponent(hash.slice(5));
  } catch {
    return null;
  }
  return findReferenceMoment(name) ? name : null;
}
