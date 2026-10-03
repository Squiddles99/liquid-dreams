// src/frontend/entry.ts
/** A normal start opens the front end; links, self-tests, sheets and ?frontend=off open the game as today (spec §3). */
export function frontEndWanted(search: string, hash: string): boolean {
  const q = new URLSearchParams(search);
  if (q.has('selftest') || q.has('sheet') || q.get('frontend') === 'off') return false;
  return !/^#(m|moment|ref)=/.test(hash);
}

/** Paddle out (spec §3): the UI leaves, the screen fades to black, the session is set up, it fades back in. */
export const PADDLE_OUT_MS = { uiOut: 180, fadeOut: 600, fadeIn: 600 } as const;
