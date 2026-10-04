/** What the reef wave field is baked from (App re-bakes when it changes): the swell's period and direction, the tide,
 * the reef's own params, and the peel stretch (spec 2026-10-04 §1). */
export function fieldKey(c: { swell: { periodS: number; directionDeg: number }; tideM: number }, reef: unknown, peel: number): string {
  return JSON.stringify([c.swell.periodS, c.swell.directionDeg, c.tideM, reef, peel]);
}
