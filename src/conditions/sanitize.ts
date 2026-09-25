import { DEFAULT_CONDITIONS } from './defaults';
import type { Conditions } from './types';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function wrapDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Turn untrusted input (moment links, panel edits) into valid Conditions. Never throws. */
export function sanitizeConditions(input: unknown): Conditions {
  const d = DEFAULT_CONDITIONS;
  const o = obj(input);
  const swell = obj(o.swell);
  const wind = obj(o.wind);
  const seed = o.seed;
  return {
    date: isValidDate(o.date) ? o.date : d.date,
    timeOfDay: clamp(num(o.timeOfDay, d.timeOfDay), 0, 23.999),
    swell: {
      sizeFt: clamp(num(swell.sizeFt, d.swell.sizeFt), 0, 12),
      periodS: clamp(num(swell.periodS, d.swell.periodS), 4, 25),
      directionDeg: wrapDegrees(num(swell.directionDeg, d.swell.directionDeg)),
    },
    wind: {
      speedMs: clamp(num(wind.speedMs, d.wind.speedMs), 0, 30),
      directionDeg: wrapDegrees(num(wind.directionDeg, d.wind.directionDeg)),
    },
    tideM: clamp(num(o.tideM, d.tideM), -1.5, 1.5),
    seed: typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : d.seed,
  };
}
