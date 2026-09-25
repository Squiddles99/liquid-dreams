/** Provisional: recalibrated in Phase 2 against the breaking wave's face height. */
export const SURFER_FT_TO_HS_M = 0.4;

export function surferFeetToHs(sizeFt: number): number {
  return Math.max(0, sizeFt) * SURFER_FT_TO_HS_M;
}
