// src/breaks/index.ts: the breaks on the surf map (surf-map hub spec §5): every built break's file, parsed, with only
// the claims its game checks passed. Only built breaks are listed (Andrew 2026-10-09).
import { type BreakView, type ClaimResults, parseBreak, viewOf } from './breakData';
import womb from './womb.json';
import wombClaims from './womb.claims.json';

const files: [unknown, ClaimResults][] = [[womb, wombClaims as ClaimResults]];

/** North to south, the order focus moves in on the map. */
export const SURF_BREAKS: readonly BreakView[] = files
  .map(([raw, results]) => viewOf(parseBreak(raw), results))
  .sort((a, b) => b.lonLat[1] - a.lonLat[1]);

export const breakById = (id: string): BreakView | undefined => SURF_BREAKS.find((b) => b.id === id);
