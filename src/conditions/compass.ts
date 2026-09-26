/** The 16 compass points, each covering 22.5° centred on its bearing (N is centred on 0). */
const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** The 16-point compass name for a bearing in degrees true. Any input normalises into [0, 360) first. */
export function compassPoint(deg: number): string {
  const normalised = ((deg % 360) + 360) % 360;
  const index = Math.round(normalised / 22.5) % COMPASS_POINTS.length;
  return COMPASS_POINTS[index];
}
