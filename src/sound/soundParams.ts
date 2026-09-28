/** The Sound folder (Phase 5 spec §3.5), persisted with the look. Volumes are linear gains, 0..1. */
export interface SoundParams {
  master: number;
  waves: number;
  ambience: number;
  nearWater: number;
  /** 0.2 is 14 dB under the effects (spec §3.4's gentle mix). */
  music: number;
  /** The M key: silences the master without losing its level. */
  muted: boolean;
}

export const DEFAULT_SOUND_PARAMS: Readonly<SoundParams> = { master: 0.8, waves: 1, ambience: 1, nearWater: 1, music: 0.2, muted: false };
const UNIT = { min: 0, max: 1 } as const;
export const SOUND_PARAM_RANGES = { master: UNIT, waves: UNIT, ambience: UNIT, nearWater: UNIT, music: UNIT } as const;
export const SOUND_VOLUME_KEYS = ['master', 'waves', 'ambience', 'nearWater', 'music'] as const;

export function normalizeSoundParams(p: SoundParams): void {
  for (const k of SOUND_VOLUME_KEYS) {
    const r = SOUND_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_SOUND_PARAMS[k];
  }
  p.muted = p.muted === true;
}

/** The master gain actually applied: 0 while muted. */
export function masterGain(p: SoundParams): number {
  return p.muted ? 0 : p.master;
}
