import type { WaveEvent } from './sets';

/** Time left as m:ss, rounded up like any countdown (59.2 s left reads 1:00); ≤ 0 reads "now". */
export function formatCountdown(seconds: number): string {
  if (!(seconds > 0)) return 'now';
  const total = Math.ceil(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The "next set" readout: a countdown, or "flat" when the swell has no sets to time (nextSetArrivalS returned null). */
export function formatNextSet(nextArrivalS: number | null, t: number): string {
  return nextArrivalS === null ? 'flat' : formatCountdown(nextArrivalS - t);
}

/** Which wave is at the peak now (within half a period), for the dev readout. */
export function waveStatus(t: number, events: readonly WaveEvent[]): string {
  const at = events.find((e) => Math.abs(e.arrivalS - t) <= e.periodS / 2);
  if (!at) return 'lull';
  return at.indexInSet >= 0 ? `wave ${at.indexInSet + 1} of ${at.waveCount}` : 'stray wave';
}
