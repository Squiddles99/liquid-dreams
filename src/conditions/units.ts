/** Provisional: recalibrated in Phase 2 against the breaking wave's face height. */
export const SURFER_FT_TO_HS_M = 0.4;

export function surferFeetToHs(sizeFt: number): number {
  return Math.max(0, sizeFt) * SURFER_FT_TO_HS_M;
}

const KMH_PER_MS = 3.6;

/** Wind speed is stored in m/s (canonical); the panel edits it in km/h through a proxy. */
export function msToKmh(ms: number): number {
  return ms * KMH_PER_MS;
}

export function kmhToMs(kmh: number): number {
  return kmh / KMH_PER_MS;
}
