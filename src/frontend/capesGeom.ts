// src/frontend/capesGeom.ts: the surf chart's geometry (surf-map hub spec §3–4). Pure: shared by tools/bakeCapesChart.ts,
// the chart component, the pins and the tests. The chart is drawn in its own 1920×1080 design pixels, north up.

/** The frame (mockup A): top-left at 114.27° E, 33.43° S, 9.5 px a km, equirectangular at 33.9° S. */
export const CHART = { w: 1920, h: 1080, lon0: 114.27, lat0: -33.43, pxPerKm: 9.5, cosLat: Math.cos((33.9 * Math.PI) / 180) } as const;

/** Lon/lat (degrees, south negative) → chart px. */
export function capesToChart(lon: number, lat: number): [number, number] {
  return [(lon - CHART.lon0) * 111.32 * CHART.cosLat * CHART.pxPerKm, (CHART.lat0 - lat) * 110.57 * CHART.pxPerKm];
}

/** The baked coastline (tools/bakeCapesChart.ts → public/ui/capesChart.json): SVG paths in chart px. */
export interface CapesChartData { land: string; coast: string; islands: string }

export interface ChartLabel { text: string; lonLat: [number, number]; kind: 'cape' | 'town' | 'water'; dx: number; dy: number; anchor: 'start' | 'middle' | 'end'; dot: boolean }

/** Placed by eye on mockup A (offsets in chart px from the point). */
export const CHART_LABELS: readonly ChartLabel[] = [
  { text: 'Cape Naturaliste', lonLat: [115.012, -33.533], kind: 'cape', dx: 18, dy: -14, anchor: 'start', dot: true },
  { text: 'Cape Leeuwin', lonLat: [115.136, -34.374], kind: 'cape', dx: -20, dy: -4, anchor: 'end', dot: true },
  { text: 'GEOGRAPHE BAY', lonLat: [115.27, -33.555], kind: 'water', dx: 0, dy: 0, anchor: 'middle', dot: false },
  { text: 'INDIAN OCEAN', lonLat: [114.56, -33.93], kind: 'water', dx: 0, dy: 0, anchor: 'middle', dot: false },
  { text: 'YALLINGUP', lonLat: [115.03, -33.645], kind: 'town', dx: 14, dy: 8, anchor: 'start', dot: true },
  { text: 'DUNSBOROUGH', lonLat: [115.105, -33.615], kind: 'town', dx: 22, dy: 58, anchor: 'start', dot: true },
  { text: 'BUSSELTON', lonLat: [115.345, -33.652], kind: 'town', dx: 14, dy: 26, anchor: 'start', dot: true },
  { text: 'GRACETOWN', lonLat: [114.99, -33.866], kind: 'town', dx: 16, dy: -6, anchor: 'start', dot: true },
  { text: 'MARGARET RIVER', lonLat: [115.075, -33.955], kind: 'town', dx: 14, dy: 8, anchor: 'start', dot: true },
  { text: 'HAMELIN BAY', lonLat: [115.03, -34.222], kind: 'town', dx: 16, dy: 8, anchor: 'start', dot: true },
  { text: 'AUGUSTA', lonLat: [115.16, -34.315], kind: 'town', dx: 14, dy: -12, anchor: 'start', dot: true },
];

const travelOf = (fromDeg: number): [number, number] => { const r = (fromDeg * Math.PI) / 180; return [-Math.sin(r), Math.cos(r)]; };

export interface SwellLines { lines: [[number, number], [number, number]][]; spacing: number; width: number; opacity: number; travel: [number, number] }

/**
 * Today's swell on the chart: parallel crests square to the travel, `spacing` px apart (the period), `width` px thick (the
 * size), long enough to cross the whole chart at any angle. The component slides the group by `spacing` along `travel`
 * on a loop, so they roll in; the land is drawn over them.
 */
export function chartSwellLines(fromDeg: number, periodS: number, sizeFt: number): SwellLines {
  const travel = travelOf(fromDeg), along: [number, number] = [-travel[1], travel[0]];
  const spacing = 3.3 * periodS, width = 1.2 + 0.25 * sizeFt, cx = CHART.w / 2, cy = CHART.h / 2, half = 1400;
  const lines: [[number, number], [number, number]][] = [];
  for (let k = -32; k <= 32; k++) {
    const ox = cx + travel[0] * k * spacing, oy = cy + travel[1] * k * spacing;
    lines.push([[ox - along[0] * half, oy - along[1] * half], [ox + along[0] * half, oy + along[1] * half]]);
  }
  return { lines, spacing, width, opacity: 0.32, travel };
}

/** Where wind arrows sit: on the land east of the coast, clear of the break panel (mockup A). */
const WIND_ANCHORS: readonly [number, number][] = [[1030, 470], [1150, 640], [1080, 820], [1210, 380], [1250, 760], [980, 980]];

export interface WindArrows { arrows: { x: number; y: number; angleDeg: number }[]; glassy: boolean }

/** Wind arrows for a wind from `fromDeg` (null when glassy) at `speedMs`; angleDeg rotates an arrow drawn pointing +x. */
export function chartWindArrows(fromDeg: number | null, speedMs: number): WindArrows {
  if (fromDeg === null || speedMs < 1) return { arrows: [], glassy: true };
  const angleDeg = (fromDeg + 90) % 360;
  return { arrows: WIND_ANCHORS.map(([x, y]) => ({ x, y, angleDeg })), glassy: false };
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass16(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** The title's close-up: a 640×360 window (3× zoom) centred between Gracetown and the river mouth. */
export const TITLE_VIEW = (() => {
  const [x, y] = capesToChart(114.99, -33.92);
  return { x: x - 320, y: y - 180, w: 640, h: 360 };
})();
