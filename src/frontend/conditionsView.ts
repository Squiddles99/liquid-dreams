// src/frontend/conditionsView.ts
import type { PresetName } from '../surfer/presets';
import { type FrontState, conditionRows } from './frontEnd';
import { RIDER_COPY, RIDER_ORDER, chooseLine, fillLine, situationOf, sizeWords } from './riderCopy';
import { type RowId, TIDE_STOPS, rollSetup, rowDisplay } from './sessionSetup';

export interface RowView { row: RowId; label: string; value: string; small: string; focused: boolean; gapAfter: boolean }

const LABELS: Record<RowId, string> = { preset: 'Preset', month: 'Month', time: 'Time', sky: 'Sky', wind: 'Wind', swell: 'Swell', period: 'Period', from: 'From', tide: 'Tide' };

export function conditionsView(s: FrontState, today: Date): RowView[] {
  return conditionRows(s).map((row) => ({ row, label: LABELS[row], ...rowDisplay(s.setup, row, today), focused: row === s.rowFocus, gapAfter: row === 'preset' }));
}

/** The values a row ticks through on Roll the dice (240 ms, spec §5.6): two or three neighbours' rolls, then its own. */
export function rollFrames(seed: number, row: RowId, today: Date): string[] {
  const n = 3 + (seed % 2), out: string[] = [];
  for (let k = n - 1; k >= 1; k--) out.push(rowDisplay(rollSetup(seed + 7919 * k), row, today).value);
  out.push(rowDisplay(rollSetup(seed), row, today).value);
  return out;
}

/** A rider's line for the new conditions; the speaker rotates through the crew (spec §4.1). */
export function lineFor(s: FrontState, row: RowId, seed: number): { speaker: PresetName; text: string } {
  const speaker = RIDER_ORDER[((seed % 3) + 3) % 3];
  const lines = RIDER_COPY[speaker].situationLines[situationOf(s.setup, row)];
  return { speaker, text: fillLine(chooseLine(lines, seed), { size: sizeWords(s.setup.swellFt) }) };
}

/** The day's tide as a little curve (120 × 40 box): a semidiurnal-looking wave lifted to the chosen stop's height. */
export function tideCurve(tideStop: number): string {
  const lift = TIDE_STOPS[tideStop].m * 16, pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = i * 5, y = 20 - lift - 10 * Math.cos((i / 24) * 4 * Math.PI);
    pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${Math.min(40, Math.max(0, y)).toFixed(1)}`);
  }
  return pts.join(' ');
}
