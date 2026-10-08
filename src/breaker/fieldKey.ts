/** What the reef wave field is baked from (App re-bakes when it changes): the swell's period and direction, the tide,
 * the reef's own params, the peel stretch (spec 2026-10-04 §1) and the curl's top speed (one-curl §3d; absent: unnamed). */
export function fieldKey(c: { swell: { periodS: number; directionDeg: number }; tideM: number }, reef: unknown, peel: number, curlMaxMs?: number): string {
  return JSON.stringify(curlMaxMs === undefined ? [c.swell.periodS, c.swell.directionDeg, c.tideM, reef, peel] : [c.swell.periodS, c.swell.directionDeg, c.tideM, reef, peel, curlMaxMs]);
}
