import { type BeachProfile, DEFAULT_BEACH } from './landHeight';

/** The Land folder (spec §4.11): look uniforms, two beach-shape values (a mesh rebuild) and the shadow switch. */
export interface LandParams {
  sandBrightness: number;
  heathBrightness: number;
  /** Share of silver-grey daisy-bush in the heath mix. */
  heathSilver: number;
  /** Share of orange-tipped pigface. */
  heathOrange: number;
  /** The dry beach's width (m). */
  beachWidthM: number;
  /** The limestone toe's top (m above mean sea level). */
  toeHeightM: number;
  /** The land's shadow on (off for comparison captures). */
  shadow: boolean;
}

export const DEFAULT_LAND_PARAMS: Readonly<LandParams> = {
  sandBrightness: 1, heathBrightness: 1, heathSilver: 0.35, heathOrange: 0.12, beachWidthM: DEFAULT_BEACH.dryWidthM, toeHeightM: DEFAULT_BEACH.toeTopM, shadow: true,
};

export const LAND_PARAM_RANGES = {
  sandBrightness: { min: 0.5, max: 1.5 },
  heathBrightness: { min: 0.5, max: 2 },
  heathSilver: { min: 0, max: 1 },
  heathOrange: { min: 0, max: 0.5 },
  beachWidthM: { min: 15, max: 45 },
  toeHeightM: { min: 3, max: 10 },
} as const;

export function normalizeLandParams(p: LandParams): void {
  for (const k of Object.keys(LAND_PARAM_RANGES) as (keyof typeof LAND_PARAM_RANGES)[]) {
    const r = LAND_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_LAND_PARAMS[k];
  }
  p.shadow = p.shadow !== false;
}

export function beachProfileFor(p: LandParams): BeachProfile {
  return { ...DEFAULT_BEACH, dryWidthM: p.beachWidthM, toeTopM: p.toeHeightM };
}
