import { AWST_UTC_OFFSET_HOURS } from './defaults';

/** Local AWST date + fractional hours → UTC instant. */
export function awstToUtc(date: string, hours: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + (hours - AWST_UTC_OFFSET_HOURS) * 3_600_000);
}
