// src/frontend/conditionsSource.ts: where the map's conditions come from (surf-map hub spec §7): today's game forecast (a
// daily roll), the player's custom setup, or later Andrew's real-time weather API (locked until then). And the break
// panel's On / Fair / Off: today against a break's researched best conditions.
import type { BreakBest, Tide } from '../breaks/breakData';
import { compass16 } from './capesGeom';
import { type SessionSetup, TIDE_STOPS, WIND_ROWS, offeredSetup, rollSetup } from './sessionSetup';

export type ConditionsSource = 'forecast' | 'realtime' | 'custom';

/** The date in Western Australia (UTC+8) as YYYYMMDD: one forecast a day, the same for everyone that day. */
export function daySeed(today: Date): number {
  const d = new Date(today.getTime() + 8 * 3600e3);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Today's game forecast: the dice roll seeded by the date, moved to a swell that breaks on its tide. */
export function todaysSetup(today: Date): SessionSetup {
  return offeredSetup(rollSetup(daySeed(today)));
}

export interface ConditionsNow {
  swellFt: number; periodS: number; swellFromDeg: number;
  windMs: number; windFromDeg: number | null; windLabel: string;
  tideM: number; tideLabel: string; sky: string;
}

const KN_TO_MS = 0.514444;

export function nowOf(s: SessionSetup): ConditionsNow {
  const w = WIND_ROWS[s.wind], t = TIDE_STOPS[s.tide];
  return {
    swellFt: s.swellFt, periodS: s.periodS, swellFromDeg: s.fromDeg,
    windMs: w.kn * KN_TO_MS, windFromDeg: w.fromDeg, windLabel: w.label,
    tideM: t.m, tideLabel: t.label, sky: s.sky,
  };
}

export function conditionsNow(source: ConditionsSource, setups: { forecast: SessionSetup; custom: SessionSetup }): ConditionsNow {
  if (source === 'realtime') throw new Error('real-time conditions are not available yet');
  return nowOf(source === 'forecast' ? setups.forecast : setups.custom);
}

/** Whether a compass bearing lies on the arc from arc[0] clockwise to arc[1] (both inclusive; arcs may cross north). */
export function inArc(deg: number, arc: [number, number]): boolean {
  const n = (x: number) => ((x % 360) + 360) % 360, d = n(deg), a = n(arc[0]), b = n(arc[1]);
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

/** The game's tide stops in words: below −0.1 m low, above +0.1 m high, between mid. */
export function tideOf(m: number): Tide {
  return m < -0.1 ? 'low' : m > 0.1 ? 'high' : 'mid';
}

export type Verdict = 'on' | 'fair' | 'off';

/**
 * Today at a break (spec §3): swell direction, swell size, wind and tide each in the break's best range or not. Glassy
 * counts as good wind. All in: On (the reason says what's good). One out: Fair. More: Off (the reason names the misses).
 */
export function breakToday(c: ConditionsNow, best: BreakBest): { verdict: Verdict; reason: string } {
  const misses: string[] = [];
  if (!inArc(c.swellFromDeg, best.swellFromDeg)) misses.push(`Swell from the ${compass16(c.swellFromDeg)}`);
  if (c.swellFt < best.sizeFt[0]) misses.push('Swell too small');
  else if (c.swellFt > best.sizeFt[1]) misses.push('Swell too big');
  const glassy = c.windFromDeg === null || c.windMs < 1;
  if (!glassy && !inArc(c.windFromDeg!, best.windFromDeg)) misses.push(`Wind onshore from the ${compass16(c.windFromDeg!)}`);
  const tide = tideOf(c.tideM);
  if (!best.tide.includes(tide)) {
    const order: Tide[] = ['low', 'mid', 'high'], want = best.tide.map((t) => order.indexOf(t));
    misses.push(order.indexOf(tide) > Math.max(...want) ? 'Tide too high' : 'Tide too low');
  }
  if (misses.length === 0) {
    const wind = glassy ? 'glassy' : `an offshore ${compass16(c.windFromDeg!)} wind`;
    return { verdict: 'on', reason: `${compass16(c.swellFromDeg)} swell and ${wind}` };
  }
  return { verdict: misses.length === 1 ? 'fair' : 'off', reason: misses.join(' · ') };
}
