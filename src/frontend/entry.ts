// src/frontend/entry.ts
/** A normal start opens the front end; links, self-tests, sheets and ?frontend=off open the game as today (spec §3). */
export function frontEndWanted(search: string, hash: string): boolean {
  const q = new URLSearchParams(search);
  if (q.has('selftest') || q.has('sheet') || q.get('frontend') === 'off') return false;
  return !/^#(m|moment|ref)=/.test(hash);
}

/** Paddle out and Back to the dune (loading screens §4): the UI leaves, the cover comes in, holds at least this long, dissolves. */
export const PADDLE_OUT_MS = { uiOut: 180, minHold: 1500, minHoldCalm: 600 } as const;
