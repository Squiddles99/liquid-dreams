/**
 * The feel of the load through the pad (Andrew 2026-10-14: "use the shock-vibration to give feedback as to when the most
 * energy is being harnessed from the wave"): the heavy motor carries the weight in the rider's feet, a light tick marks
 * each peak, the moment to extend.
 */
export const RUMBLE_CHUNK_MS = 100;
const TICK_S = 0.04, PEAK_ON = 1.2, PEAK_OFF = 1.1;

export interface RumbleState { peaked: boolean; tickUntil: number; nextAt: number }
export const newRumble = (): RumbleState => ({ peaked: false, tickUntil: -1, nextAt: -1 });

/** This frame's chunk (magnitudes 0 … 1), or null while the last chunk still runs and no tick starts. */
export function rumbleFor(load: number, s: RumbleState, now: number): { strong: number; weak: number } | null {
  let tickStarted = false;
  if (!s.peaked && load > PEAK_ON) {
    s.peaked = true;
    s.tickUntil = now + TICK_S;
    tickStarted = true;
  } else if (s.peaked && load < PEAK_OFF) s.peaked = false;
  if (!tickStarted && now < s.nextAt) return null;
  s.nextAt = now + RUMBLE_CHUNK_MS / 1000;
  return { strong: Math.min(1, Math.max(0, (load - 1) / 0.8)), weak: now < s.tickUntil ? 0.6 : 0 };
}
