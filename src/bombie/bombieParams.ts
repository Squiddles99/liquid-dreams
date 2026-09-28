/** The Bombie folder (spec §3.5), persisted with the look. */
export interface BombieParams {
  enabled: boolean;
  /** Scales the white water and the spray. */
  size: number;
  /** The swell (surfer ft) at which it starts to break. */
  thresholdFt: number;
}

export const DEFAULT_BOMBIE_PARAMS: Readonly<BombieParams> = { enabled: true, size: 1, thresholdFt: 6 };
export const BOMBIE_PARAM_RANGES = { size: { min: 0.5, max: 2 }, thresholdFt: { min: 4, max: 10 } } as const;

export function normalizeBombieParams(p: BombieParams): void {
  for (const k of ['size', 'thresholdFt'] as const) {
    const r = BOMBIE_PARAM_RANGES[k];
    p[k] = Number.isFinite(p[k]) ? Math.min(r.max, Math.max(r.min, p[k])) : DEFAULT_BOMBIE_PARAMS[k];
  }
  p.enabled = p.enabled !== false;
}
