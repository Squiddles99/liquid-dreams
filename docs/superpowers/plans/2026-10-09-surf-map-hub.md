# Title and Surf Map Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a title screen (with the main menu) in front of the game and a full-screen surf chart of the Capes in
front of Conditions. The chart shows today's swell and wind, a pin per built break, a break panel with On / Fair / Off,
and a details page backed by researched facts that the game's own checks confirm.

**Architecture:**
- **Pure modules** hold the geometry and logic: `capesGeom.ts` for the chart's projection, labels, swell lines and wind
  arrows; `conditionsSource.ts` for today's roll, the conditions read-out and the On / Fair / Off rule;
  `breakData.ts` for the break file and its claim filtering; `titleMenu.ts` for menu stepping. Each has Vitest tests.
- **The coastline** is baked once from OpenStreetMap into `public/ui/capesChart.json`, the way `bakeBreakMap.ts` bakes
  the Womb's map.
- **The DOM/SVG components** follow the existing front-end patterns (`mountFrontEndRoot`, `.fe-*` classes, `Legend`,
  `UiInput`): `CapesChart`, `SurfMapPanel`, `BreakDetails` and `TitleScreen`. They're checked by in-page self-tests and
  1080p captures.
- **The surf map** becomes a new first front-end beat, `'map'`.
- **The title** is a standalone overlay, like `PauseMenu`, shown from `main.ts` above the loading cover.

**Tech Stack:** TypeScript, Vite, Vitest (`npm test`), in-page GPU self-tests (`?selftest=` via
`npx electron tools/_selftest.mjs`), Node-run tools with `vite`'s `runnerImport`, Electron for captures, and Python/PIL
for image conversion.

**Spec:** `docs/superpowers/specs/2026-10-09-surf-map-hub-design.md`

## Global Constraints

- Worktree `C:\Dev\andrew-dev-personal-projects\ld-select-ui`, branch `surf-map-hub`. Its dev server is Vite on
  **port 5180**. If it isn't running, start it from the worktree with `npx vite --port 5180 --strictPort` as a
  background command. Never put scratch files in `src/`: the launcher's `tsc` build sees them.
- **Fonts:** Knewave for names, Caveat Brush for capes and subtitles, Barlow Semi Condensed for labels, Barlow for body.
  They're already loaded by the page.
- **Colours** are the chart palette from mockup A:

  | Token | Hex |
  |---|---|
  | sea | `#0a2c34` → `#17565f` (radial) |
  | panel | `#0b2a31` |
  | panel line | `#3f6f72` |
  | land paper | `#efe1c1` → `#e2d1ab` |
  | hatch | `#b9a57f` |
  | coast ink | `#2c4a4c` |
  | cream text | `#f6ecd6` |
  | dim text | `#a9c3c2` |
  | accent | `--fe-sun` `#ef7d2e` (front-end CSS) |
  | on-green | `#7fd36b` |
- **Only built breaks appear on the map.** Today that's the Womb only.
- **Facts on screen come from online sources** (at least two per claim, cautious wording when they disagree). Sources
  stay in the data, never on screen.
- **A wave claim shows only if its game check passed** (`src/breaks/<id>.claims.json`).
- **Noongar names only from openly published sources.** Skip any source whose licence or ICIP notice asks for Custodian
  permission.
- **Online and Real-time are locked placeholders.** Pressing them shows a toast and does nothing else.
- **Quit appears only in the Electron build** (`navigator.userAgent.includes('Electron')`) and calls `window.close()`.
- **AAA UI bar:**
  - safe areas via `--fe-safe-x/y`;
  - controller focus on everything;
  - a glyph legend;
  - motion eased with `--fe-ease-*`;
  - no web form controls, glass cards, emoji or centred walls of text.
- **Commits:** one per task (more is fine). End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push the branch after each task (`git push`).
  **Never merge to main**: Andrew decides.

## Rulings taken while planning (deviations from the spec, each forced by the code)

1. **The details page scrolls with up/down (stick or D-pad), the arrow keys and the mouse wheel,** not the right stick.
   `UiInput` doesn't read the right stick, and adding a new axis for one page isn't worth it.
2. **The coastline credit sits on the chart** as small text, bottom-left: "Coastline © OpenStreetMap contributors". It's
   also added to `public/LICENSES.md`. The settings panel has no credits page. On-map attribution is how ODbL is usually
   met, and it needs no new screen.
3. **"Today's forecast" is a daily roll:** `rollSetup` seeded by the date in AWST, passed through `offeredSetup`. No
   daily roll existed before; the dice roll is time-seeded.
4. **Claims without a game check yet** are written with result `pass: false`, `detail: 'no game check yet'`, so they're
   dropped from screen. That covers "short and punchy" and "meets a section breaking the other way": no ride-length or
   right-side measure exists. Andrew sees the list in the claims file.
5. **The Library tab shows on the map but is locked:** LB/RB shows a "Library: coming soon" toast until build 2.

## Review Focus

1. **Surf pressed on the title before the App exists** (a fast press during the WebGPU start). The press must still
   reach the map once the App is up, and must never be lost or double-applied. (Task 12 test.)
2. **Windows that aren't 16:9** (21:9 ultrawide, 4:3, a portrait-ish window). The chart must cover the whole window,
   with no bare edges, and pins and labels must stay where the land is. (Task 3 self-test.)
3. **Glassy wind** (`WIND_ROWS[0]`, `fromDeg: null`). The rule counts it as good, the strip says "Glassy", the chart
   draws no arrows, and nothing crashes. (Task 6 test, Task 3 self-test.)
4. **Direction arcs that cross north** (for example `[315, 45]`). `inArc` must handle the wrap. (Task 6 test.)
5. **A break whose claims fail.**
   - Paragraphs tied to a failed claim disappear.
   - A section left empty is hidden, not shown as a bare heading.
   - A best-conditions row whose claim failed is left out.
   - The panel never shows "undefined" or an empty row.

   (Task 4 test, Task 9 self-test.)

---

### Task 1: Chart geometry (`capesGeom.ts`)

**Files:**
- Create: `src/frontend/capesGeom.ts`
- Test: `src/frontend/capesGeom.test.ts`

**Interfaces:**
- Produces:
  - `CHART`
  - `capesToChart(lon, lat): [number, number]`
  - `CHART_LABELS: readonly ChartLabel[]`
  - `chartSwellLines(fromDeg, periodS, sizeFt): SwellLines`
  - `chartWindArrows(fromDeg: number | null, speedMs: number): WindArrows`
  - `compass16(deg): string`
  - `interface CapesChartData { land: string; coast: string; islands: string }`
  - `TITLE_VIEW: { x: number; y: number; w: number; h: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/capesGeom.test.ts
import { describe, expect, it } from 'vitest';
import { CHART, CHART_LABELS, TITLE_VIEW, capesToChart, chartSwellLines, chartWindArrows, compass16 } from './capesGeom';

describe('capesToChart', () => {
  it('puts the frame origin at the top-left', () => {
    const [x, y] = capesToChart(CHART.lon0, CHART.lat0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });
  it('frames Cape Naturaliste near the top and Cape Leeuwin near the bottom', () => {
    const [, yN] = capesToChart(115.012, -33.533), [, yL] = capesToChart(115.136, -34.374);
    expect(yN).toBeGreaterThan(60); expect(yN).toBeLessThan(160);
    expect(yL).toBeGreaterThan(940); expect(yL).toBeLessThan(1040);
  });
  it('puts the Womb on the left half of the chart, west of Margaret River', () => {
    const [xW] = capesToChart(114.982, -33.8952), [xM] = capesToChart(115.075, -33.955);
    expect(xW).toBeGreaterThan(500); expect(xW).toBeLessThan(720); expect(xM).toBeGreaterThan(xW);
  });
});

describe('labels', () => {
  it('names both capes, Geographe Bay and the seven towns', () => {
    const t = CHART_LABELS.map((l) => l.text);
    for (const n of ['Cape Naturaliste', 'Cape Leeuwin', 'GEOGRAPHE BAY', 'INDIAN OCEAN', 'YALLINGUP', 'DUNSBOROUGH', 'BUSSELTON', 'GRACETOWN', 'MARGARET RIVER', 'HAMELIN BAY', 'AUGUSTA'])
      expect(t).toContain(n);
  });
});

describe('chartSwellLines', () => {
  it('travels away from where the swell comes from (WSW swell runs east-north-east)', () => {
    const s = chartSwellLines(247, 14, 6);
    expect(s.travel[0]).toBeGreaterThan(0.85);   // east
    expect(s.travel[1]).toBeLessThan(0);         // north (y down is south)
  });
  it('spaces crests by the period and thickens them with size', () => {
    expect(chartSwellLines(247, 16, 6).spacing).toBeGreaterThan(chartSwellLines(247, 10, 6).spacing);
    expect(chartSwellLines(247, 14, 10).width).toBeGreaterThan(chartSwellLines(247, 14, 3).width);
  });
  it('draws each crest square to the travel', () => {
    const s = chartSwellLines(225, 12, 5), [[x1, y1], [x2, y2]] = s.lines[0];
    const dx = x2 - x1, dy = y2 - y1, dot = (dx * s.travel[0] + dy * s.travel[1]) / Math.hypot(dx, dy);
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });
});

describe('chartWindArrows', () => {
  it('draws nothing when glassy (null direction or under 1 m/s)', () => {
    expect(chartWindArrows(null, 0.5)).toEqual({ arrows: [], glassy: true });
    expect(chartWindArrows(90, 0.4).glassy).toBe(true);
  });
  it('points an easterly west (rotation 180°) and a northerly south (90°)', () => {
    expect(chartWindArrows(90, 5).arrows[0].angleDeg).toBe(180);
    expect(chartWindArrows(0, 5).arrows[0].angleDeg).toBe(90);
  });
});

describe('compass16', () => {
  it('names the sixteen points', () => {
    expect(compass16(247)).toBe('WSW'); expect(compass16(90)).toBe('E'); expect(compass16(359)).toBe('N'); expect(compass16(202)).toBe('SSW');
  });
});

describe('TITLE_VIEW', () => {
  it('is a 16:9 window inside the chart, around the Womb', () => {
    expect(TITLE_VIEW.w / TITLE_VIEW.h).toBeCloseTo(16 / 9, 3);
    const [x, y] = capesToChart(114.982, -33.8952);
    expect(x).toBeGreaterThan(TITLE_VIEW.x); expect(x).toBeLessThan(TITLE_VIEW.x + TITLE_VIEW.w);
    expect(y).toBeGreaterThan(TITLE_VIEW.y); expect(y).toBeLessThan(TITLE_VIEW.y + TITLE_VIEW.h);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/frontend/capesGeom.test.ts`
Expected: FAIL, "Failed to resolve import ./capesGeom".

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/frontend/capesGeom.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/frontend/capesGeom.ts src/frontend/capesGeom.test.ts
git commit -m "feat(surf-map): chart geometry for the Capes: projection, labels, swell lines, wind arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 2: The coastline bake

**Files:**
- Create: `tools/fetchCapesCoast.mjs`, `tools/bakeCapesChart.ts`, `public/ui/capesChart.json` (generated)
- Modify: `package.json` (scripts), `public/LICENSES.md`
- Test: `src/frontend/capesChartData.test.ts`

**Interfaces:**
- Consumes: `CHART`, `capesToChart`, `CapesChartData` (Task 1).
- Produces: `public/ui/capesChart.json` with `{ land, coast, islands }` SVG path strings in chart px.

- [ ] **Step 1: Write the fetch tool**

```js
// tools/fetchCapesCoast.mjs: the Capes coastline from OpenStreetMap (ODbL) via Overpass, into reference/capes/ (git-ignored).
// Run: node tools/fetchCapesCoast.mjs   (retries the public mirrors; Overpass is often busy)
import { mkdirSync, writeFileSync } from 'node:fs';
const Q = '[out:json][timeout:160];way["natural"="coastline"](-34.55,114.10,-33.35,115.95);out geom;';
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.osm.jp/api/interpreter'];
for (let round = 0; round < 8; round++) {
  for (const m of MIRRORS) {
    try {
      const r = await fetch(`${m}?data=${encodeURIComponent(Q)}`, { headers: { 'User-Agent': 'LiquidDreams/0.1 (coast bake)' } });
      const text = await r.text();
      const d = JSON.parse(text);
      if (!Array.isArray(d.elements) || d.elements.length === 0) throw new Error('no ways');
      mkdirSync('reference/capes', { recursive: true });
      writeFileSync('reference/capes/osm-coast.json', text);
      writeFileSync('reference/capes/sources.txt', `OpenStreetMap contributors, ODbL. natural=coastline ways via ${m}, ${new Date().toISOString()}\n`);
      console.log(`ok: ${d.elements.length} ways from ${m}`);
      process.exit(0);
    } catch (e) { console.log(`${m}: ${e.message}`); }
  }
  await new Promise((r) => setTimeout(r, 30000));
}
console.error('Overpass unavailable; try later'); process.exit(1);
```

Run: `node tools/fetchCapesCoast.mjs`
Expected: `ok: <n> ways from …`, and `reference/capes/osm-coast.json` exists. Retry later if every mirror is busy.

- [ ] **Step 2: Write the bake**

```ts
// tools/bakeCapesChart.ts: the surf chart's coastline. Run from the repo root: npm run bake:chart → public/ui/capesChart.json
// Reads reference/capes/osm-coast.json (node tools/fetchCapesCoast.mjs), chains the coastline ways (land on the left of
// their direction, OSM's rule), projects them with capesToChart and simplifies to 0.7 px (Douglas–Peucker).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const { module: geom } = await runnerImport<typeof import('../src/frontend/capesGeom')>('/src/frontend/capesGeom.ts');
type P = [number, number];
const raw = JSON.parse(readFileSync('reference/capes/osm-coast.json', 'utf8')) as { elements: { geometry: { lon: number; lat: number }[] }[] };
const ways: P[][] = raw.elements.map((e) => e.geometry.map((g) => [g.lon, g.lat] as P));
const same = (a: P, b: P) => a[0] === b[0] && a[1] === b[1];
const rings = ways.filter((w) => same(w[0], w[w.length - 1]));
const pool = ways.filter((w) => !same(w[0], w[w.length - 1]));
const chains: P[][] = [];
while (pool.length) {
  let c = pool.shift()!;
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < pool.length; i++) {
      const w = pool[i];
      if (same(w[0], c[c.length - 1])) { c = c.concat(w.slice(1)); pool.splice(i, 1); grew = true; break; }
      if (same(w[w.length - 1], c[0])) { c = w.concat(c.slice(1)); pool.splice(i, 1); grew = true; break; }
    }
  }
  chains.push(c);
}
const main = chains.sort((a, b) => b.length - a.length)[0];
function dp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  const keep = new Set([0, pts.length - 1]), stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!, [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1e-9;
    let best = 0, bi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / n; if (d > best) { best = d; bi = i; } }
    if (best > eps && bi > 0) { keep.add(bi); stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep.has(i));
}
const proj = (c: P[]) => c.map(([lon, lat]) => geom.capesToChart(lon, lat));
const path = (c: P[]) => 'M' + c.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
const coastPts = dp(proj(main), 0.7);
const W = geom.CHART.w, H = geom.CHART.h;
// The chain runs north → south down the west coast and on east; land is on its left, so close the polygon round the east.
const land = path(coastPts) + ` L${W + 600},${H + 600} L${W + 600},-600 Z`;
const islands = rings.map((r) => dp(proj(r), 0.5)).filter((r) => r.length > 3).map((r) => path(r) + ' Z').join(' ');
const data: import('../src/frontend/capesGeom').CapesChartData = { land, coast: path(coastPts), islands };
mkdirSync('public/ui', { recursive: true });
writeFileSync('public/ui/capesChart.json', JSON.stringify(data));
console.log(`capesChart.json: coast ${coastPts.length} pts, ${rings.length} islands, ${JSON.stringify(data).length} bytes`);
```

Add to `package.json` `scripts`: `"bake:chart": "node tools/bakeCapesChart.ts",` (after `bake:map`).

Run: `npm run bake:chart`
Expected: `capesChart.json: coast <~1500–3000> pts, …`.

- [ ] **Step 3: Write the data test**

```ts
// src/frontend/capesChartData.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { capesToChart } from './capesGeom';

const d = JSON.parse(readFileSync('public/ui/capesChart.json', 'utf8')) as { land: string; coast: string; islands: string };
const pts = d.coast.slice(1).split(' L').map((p) => p.split(',').map(Number) as [number, number]);

describe('the baked coastline', () => {
  it('is a closed land polygon and an open coast line', () => {
    expect(d.land.startsWith('M')).toBe(true); expect(d.land.trim().endsWith('Z')).toBe(true);
    expect(pts.length).toBeGreaterThan(500);
  });
  it('passes within 12 px of Cape Naturaliste, Gracetown and Cape Leeuwin', () => {
    for (const [lon, lat] of [[115.0045, -33.5375], [114.988, -33.866], [115.134, -34.3757]]) {
      const [x, y] = capesToChart(lon, lat);
      expect(Math.min(...pts.map(([px, py]) => Math.hypot(px - x, py - y)))).toBeLessThan(12);
    }
  });
  it('keeps the file small enough to load with the menus', () => {
    expect(JSON.stringify(d).length).toBeLessThan(250_000);
  });
});
```

Run: `npx vitest run src/frontend/capesChartData.test.ts`
Expected: PASS. If the distance test fails at one point, check that the bake used the longest chain and that the
coordinates are right. Don't loosen the bound past 12 px.

- [ ] **Step 4: Credit**

Append to `public/LICENSES.md`:

```markdown
## Coastline (surf chart)

The surf chart's coastline is derived from OpenStreetMap data, © OpenStreetMap contributors, available under the Open
Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright. Baked by tools/bakeCapesChart.ts into
public/ui/capesChart.json; the chart shows "Coastline © OpenStreetMap contributors".
```

- [ ] **Step 5: Commit**

```bash
git add tools/fetchCapesCoast.mjs tools/bakeCapesChart.ts public/ui/capesChart.json package.json public/LICENSES.md src/frontend/capesChartData.test.ts
git commit -m "feat(surf-map): bake the Capes coastline from OpenStreetMap into public/ui/capesChart.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 3: The chart component (`CapesChart`)

**Files:**
- Create: `src/frontend/ui/capesChart.ts`, `src/frontend/surfMap.selftest.ts`
- Modify: `src/dev/selfTests.ts` (import the new self-test), `src/frontend/ui/frontEnd.css` (chart classes)

**Interfaces:**
- Consumes: Task 1 (`CHART`, `CHART_LABELS`, `capesToChart`, `chartSwellLines`, `chartWindArrows`, `TITLE_VIEW`,
  `CapesChartData`) and `public/ui/capesChart.json`.
- Produces: `class CapesChart` with:
  - `readonly el: HTMLDivElement`
  - `constructor(opts: { view: 'full' | 'title' })`
  - `load(base?: string): Promise<void>`
  - `setConditions(c: { swellFromDeg: number; periodS: number; swellFt: number; windFromDeg: number | null; windMs: number }): void`
  - `setPins(pins: { id: string; name: string; lonLat: [number, number] }[], focusId: string | null): void`
  - `update(nowMs: number): void`
  - `pinPoint(id: string): [number, number] | null` (chart px)
  - `onPin: ((id: string) => void) | null`

- [ ] **Step 1: Implement the component**

```ts
// src/frontend/ui/capesChart.ts: the surf chart (surf-map hub spec §3–4, mockup A): our own Admiralty-style chart of the
// Capes. Paper land with a fine hatch over a deep-teal sea with depth bands and a compass rose; today's swell lines roll
// in under the land, wind arrows drift over it; one pin per built break. 'full' fills the window (the map beat); 'title'
// is a 3× close-up between Gracetown and the river mouth (no pins, no wind, no labels but the capes and towns in view).
import { CHART, CHART_LABELS, type CapesChartData, TITLE_VIEW, capesToChart, chartSwellLines, chartWindArrows } from '../capesGeom';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
const SOUNDINGS: readonly [number, number, string][] = [[560, 300, '38'], [430, 520, '61'], [300, 760, '84'], [620, 860, '45'], [240, 380, '96'], [520, 960, '70']];

export class CapesChart {
  readonly el = document.createElement('div');
  onPin: ((id: string) => void) | null = null;
  private readonly svg = el('svg');
  private readonly swell = el('g');
  private readonly wind = el('g');
  private readonly pins = el('g');
  private swellStep: [number, number] = [0, 0];
  private pinAt = new Map<string, [number, number]>();
  private readonly view: { x: number; y: number; w: number; h: number };

  constructor(private readonly opts: { view: 'full' | 'title' }) {
    this.view = opts.view === 'title' ? TITLE_VIEW : { x: 0, y: 0, w: CHART.w, h: CHART.h };
    this.el.className = 'fe-chart';
    // 'slice' covers any window shape: a 21:9 or 4:3 window crops the chart instead of showing bare edges (Review Focus 2).
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    this.el.appendChild(this.svg);
  }

  async load(base = import.meta.env.BASE_URL): Promise<void> {
    const r = await fetch(`${base}ui/capesChart.json`);
    if (!r.ok) throw new Error(`surf chart: ${r.status} fetching capesChart.json`);
    this.draw((await r.json()) as CapesChartData);
  }

  private draw(d: CapesChartData): void {
    const defs = el('defs');
    defs.innerHTML = `
      <radialGradient id="ch-sea" cx="40%" cy="45%" r="75%"><stop offset="0" stop-color="#17565f"/><stop offset="1" stop-color="#0a2c34"/></radialGradient>
      <linearGradient id="ch-paper" x1="0" x2="1"><stop offset="0" stop-color="#efe1c1"/><stop offset="1" stop-color="#e2d1ab"/></linearGradient>
      <pattern id="ch-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#b9a57f" stroke-width="1.1" opacity=".55"/></pattern>`;
    this.svg.appendChild(defs);
    this.svg.appendChild(el('rect', { x: -2000, y: -2000, width: CHART.w + 4000, height: CHART.h + 4000, fill: 'url(#ch-sea)' }));
    for (const [w, o] of [[150, 0.05], [96, 0.07], [52, 0.1], [22, 0.16]] as const)
      this.svg.appendChild(el('path', { d: d.coast, fill: 'none', stroke: '#a8d6d0', 'stroke-opacity': o, 'stroke-width': w, 'stroke-linejoin': 'round' }));
    if (this.opts.view === 'full') {
      for (const [x, y, t] of SOUNDINGS) { const s = el('text', { x, y, class: 'fe-chart-sounding' }); s.textContent = t; this.svg.appendChild(s); }
      const rose = el('g', { transform: 'translate(330,880)', class: 'fe-chart-rose' });
      rose.innerHTML = '<circle r="70"/><circle r="58" stroke-dasharray="2 4"/><path d="M0,-92 L9,0 L0,92 L-9,0 Z M-92,0 L0,9 L92,0 L0,-9 Z"/><text y="-100" text-anchor="middle">N</text>';
      this.svg.appendChild(rose);
    }
    this.svg.appendChild(this.swell);
    this.svg.appendChild(el('path', { d: d.land, fill: 'url(#ch-paper)' }));
    this.svg.appendChild(el('path', { d: d.land, fill: 'url(#ch-hatch)' }));
    this.svg.appendChild(el('path', { d: d.coast, fill: 'none', stroke: '#2c4a4c', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }));
    if (d.islands) this.svg.appendChild(el('path', { d: d.islands, fill: '#efe1c1', stroke: '#2c4a4c', 'stroke-width': 1.5 }));
    this.svg.appendChild(this.wind);
    for (const l of CHART_LABELS) {
      const [x, y] = capesToChart(...l.lonLat);
      if (l.dot) this.svg.appendChild(el('circle', { cx: x, cy: y, r: l.kind === 'cape' ? 4 : 5, class: 'fe-chart-dot' }));
      const t = el('text', { x: x + l.dx, y: y + l.dy, 'text-anchor': l.anchor, class: `fe-chart-${l.kind}` });
      t.textContent = l.text;
      this.svg.appendChild(t);
    }
    this.svg.appendChild(this.pins);
    if (this.opts.view === 'full') {
      const c = el('text', { x: 24, y: CHART.h - 16, class: 'fe-chart-credit' });
      c.textContent = 'Coastline © OpenStreetMap contributors';
      this.svg.appendChild(c);
    }
  }

  setConditions(c: { swellFromDeg: number; periodS: number; swellFt: number; windFromDeg: number | null; windMs: number }): void {
    const s = chartSwellLines(c.swellFromDeg, c.periodS, c.swellFt);
    this.swell.replaceChildren(...s.lines.map(([[x1, y1], [x2, y2]]) => el('line', { x1, y1, x2, y2 })));
    Object.assign(this.swell.style, { stroke: '#e8f6f2', strokeOpacity: String(s.opacity), strokeWidth: String(s.width), strokeLinecap: 'round' });
    this.swellStep = [s.travel[0] * s.spacing, s.travel[1] * s.spacing];
    const w = this.opts.view === 'full' ? chartWindArrows(c.windFromDeg, c.windMs) : { arrows: [], glassy: true };
    this.wind.replaceChildren(...w.arrows.map((a) => {
      const g = el('g', { transform: `translate(${a.x},${a.y}) rotate(${a.angleDeg})`, class: 'fe-chart-wind' });
      g.appendChild(el('path', { d: 'M-30,0 L30,0 M30,0 l-14,-8 M30,0 l-14,8' }));
      return g;
    }));
  }

  setPins(pins: { id: string; name: string; lonLat: [number, number] }[], focusId: string | null): void {
    if (this.opts.view !== 'full') return;
    this.pinAt.clear();
    this.pins.replaceChildren(...pins.map((p) => {
      const [x, y] = capesToChart(...p.lonLat);
      this.pinAt.set(p.id, [x, y]);
      const g = el('g', { class: `fe-chart-pin${p.id === focusId ? ' is-focus' : ''}`, 'data-hit': `pin:${p.id}` });
      g.append(el('circle', { cx: x, cy: y, r: 16, class: 'fe-chart-pin-pulse' }), el('circle', { cx: x, cy: y, r: 13, class: 'fe-chart-pin-dot' }));
      const t = el('text', { x: x - 26, y: y + 12, 'text-anchor': 'end', class: 'fe-chart-pin-name' });
      t.textContent = p.name;
      g.appendChild(t);
      g.addEventListener('pointerover', () => this.onPin?.(p.id));
      g.addEventListener('click', () => this.onPin?.(p.id));
      return g;
    }));
  }

  pinPoint(id: string): [number, number] | null {
    return this.pinAt.get(id) ?? null;
  }

  /** Rolls the swell in: one crest spacing every 3.2 s (calm, not the real wave speed; spec §3). */
  update(nowMs: number): void {
    const k = (nowMs / 3200) % 1;
    this.swell.setAttribute('transform', `translate(${(this.swellStep[0] * k).toFixed(2)},${(this.swellStep[1] * k).toFixed(2)})`);
    if (this.opts.view === 'title') {
      const drift = ((nowMs / 60000) * 20) % 40; // ~20 px a minute, there and back
      this.svg.setAttribute('viewBox', `${this.view.x + (drift > 20 ? 40 - drift : drift)} ${this.view.y} ${this.view.w} ${this.view.h}`);
    }
  }
}
```

Append to `src/frontend/ui/frontEnd.css`:

```css
/* The surf chart (surf-map hub, mockup A). */
.fe-chart { position: absolute; inset: 0; overflow: hidden; background: #0a2c34; }
.fe-chart > svg { width: 100%; height: 100%; display: block; }
.fe-chart-sounding { font: 400 13px Barlow; fill: #9ccac4; opacity: .55; }
.fe-chart-rose { fill: none; stroke: #cfe6df; stroke-width: 1.2; opacity: .7; }
.fe-chart-rose path { fill: #cfe6df; fill-opacity: .18; }
.fe-chart-rose text { fill: #cfe6df; stroke: none; font: 700 18px 'Barlow Semi Condensed'; }
.fe-chart-town { font: 700 17px 'Barlow Semi Condensed'; letter-spacing: .16em; fill: #3b3226; }
.fe-chart-cape { font: 400 30px 'Caveat Brush'; fill: #f6ecd6; }
.fe-chart-water { font: 600 22px 'Barlow Semi Condensed'; letter-spacing: .3em; fill: #7fb1b0; }
.fe-chart-dot { fill: #f4ead2; stroke: #333; stroke-width: 2; }
.fe-chart-wind path { stroke: #8a6f45; stroke-width: 3; fill: none; stroke-linecap: round; opacity: .7; }
.fe-chart-credit { font: 500 12px Barlow; fill: #7fb1b0; opacity: .7; }
.fe-chart-pin { cursor: pointer; }
.fe-chart-pin-dot { fill: var(--fe-sun); stroke: #fff3dc; stroke-width: 4; }
.fe-chart-pin-pulse { fill: none; stroke: var(--fe-sun); stroke-width: 3; opacity: 0; }
.fe-chart-pin.is-focus .fe-chart-pin-pulse { animation: fe-pin-pulse 1.8s var(--fe-ease-out) infinite; }
.fe-chart-pin-name { font: 400 34px Knewave; fill: #fff3dc; paint-order: stroke; stroke: #0b2a31; stroke-width: 7px; }
@keyframes fe-pin-pulse { from { r: 14; opacity: 1; } to { r: 34; opacity: 0; } }
.is-calm .fe-chart-pin.is-focus .fe-chart-pin-pulse { animation: none; opacity: .8; }
```

- [ ] **Step 2: Write the self-test** (in-page: it needs a DOM and the served JSON)

```ts
// src/frontend/surfMap.selftest.ts: the surf chart, the map beat and the details page in the page (surf-map hub plan).
import { registerSelfTest } from '../dev/selfTest';
import { withRoot } from './frontEnd.selftest';
import { capesToChart } from './capesGeom';
import { CapesChart } from './ui/capesChart';

registerSelfTest({
  name: 'frontend: surf chart covers the window at 16:9, 21:9 and 4:3, with the Womb pin on screen',
  async run() {
    const problems: string[] = [];
    for (const [w, h] of [[1920, 1080], [2560, 1080], [1440, 1080]] as const) {
      await withRoot(w, h, async (root) => {
        const c = new CapesChart({ view: 'full' });
        root.appendChild(c.el);
        await c.load();
        c.setConditions({ swellFromDeg: 247, periodS: 14, swellFt: 6, windFromDeg: 90, windMs: 4 });
        c.setPins([{ id: 'womb', name: 'The Womb', lonLat: [114.982, -33.8952] }], 'womb');
        const svg = c.el.querySelector('svg')!.getBoundingClientRect(), box = root.getBoundingClientRect();
        if (svg.width + 1 < box.width || svg.height + 1 < box.height) problems.push(`${w}x${h}: chart ${svg.width}x${svg.height} under root ${box.width}x${box.height}`);
        const pin = c.el.querySelector('.fe-chart-pin-dot')!.getBoundingClientRect();
        if (pin.left < box.left || pin.right > box.right || pin.top < box.top || pin.bottom > box.bottom) problems.push(`${w}x${h}: Womb pin off screen`);
        if (!c.pinPoint('womb')) problems.push('no pinPoint');
        const p = capesToChart(114.982, -33.8952);
        if (Math.abs(c.pinPoint('womb')![0] - p[0]) > 0.01) problems.push('pinPoint mismatch');
      });
    }
    return { pass: problems.length === 0, detail: problems.join('; ') || 'covers, pin on screen' };
  },
});

registerSelfTest({
  name: 'frontend: surf chart glassy wind draws no arrows; swell lines roll',
  async run() {
    return withRoot(1920, 1080, async (root) => {
      const c = new CapesChart({ view: 'full' });
      root.appendChild(c.el);
      await c.load();
      c.setConditions({ swellFromDeg: 247, periodS: 14, swellFt: 6, windFromDeg: null, windMs: 0.5 });
      const arrows = c.el.querySelectorAll('.fe-chart-wind').length;
      const swell = [...c.el.querySelectorAll('svg > g')].find((g) => g.querySelector('line'))!;
      c.update(0); const a = swell.getAttribute('transform');
      c.update(1600); const b = swell.getAttribute('transform');
      const ok = arrows === 0 && a !== b;
      return { pass: ok, detail: `arrows ${arrows}, transform ${a} → ${b}` };
    });
  },
});
```

Add `import '../frontend/surfMap.selftest';` to `src/dev/selfTests.ts`, after the `frontEnd.selftest` import.

(The swell group is found as the `svg > g` that holds `line` children, because in the full view the compass rose is
also a top-level `g`.)

- [ ] **Step 3: Run the self-tests**

Run (dev server on 5180 running):
`npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter="surf chart"`
Expected: `GPU self-tests: 2/2 passed`.

- [ ] **Step 4: Typecheck and unit tests**

Run: `npm run typecheck && npm test`
Expected: no type errors, and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/ui/capesChart.ts src/frontend/ui/frontEnd.css src/frontend/surfMap.selftest.ts src/dev/selfTests.ts
git commit -m "feat(surf-map): the surf chart component (full and title views), with self-tests for cover and glassy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 4: Break data types and claim filtering (`breakData.ts`)

**Files:**
- Create: `src/breaks/breakData.ts`
- Test: `src/breaks/breakData.test.ts`

**Interfaces:**
- Produces:
  - Types: `Tide = 'low' | 'mid' | 'high'`, `Level = 'beginner' | 'intermediate' | 'advanced'`,
    `SectionId = 'wave' | 'when' | 'who' | 'hazards' | 'access' | 'story' | 'inGame'`,
    `Para = { text: string; claim?: string }`, `BreakBest`, `BreakSection`, `BreakClaim`, `BreakFile`,
    `ClaimResults`, `BreakView`
  - `SECTION_ORDER: readonly SectionId[]`
  - `parseBreak(raw: unknown): BreakFile` (throws `Error('break file: …')`)
  - `viewOf(b: BreakFile, results: ClaimResults): BreakView`

- [ ] **Step 1: Write the failing tests**

```ts
// src/breaks/breakData.test.ts
import { describe, expect, it } from 'vitest';
import { type BreakFile, SECTION_ORDER, parseBreak, viewOf } from './breakData';

const good = (): BreakFile => ({
  id: 'test', name: 'Test Break', kicker: 'REEF BREAK · NEAR TESTVILLE', subtitle: 'A test left', lonLat: [115, -33.9], hero: 'breaks/test-hero.webp',
  best: { swellFromDeg: [225, 270], sizeFt: [4, 10], windFromDeg: [45, 135], tide: ['mid'], level: 'advanced' },
  bestClaims: { swell: 'best-swell', wind: 'best-wind', tide: 'best-tide' },
  summary: [{ text: 'A heavy left.', claim: 'left' }, { text: 'It barrels.', claim: 'barrels' }, { text: 'Mind the reef.' }],
  details: SECTION_ORDER.map((id) => ({ id, heading: id.toUpperCase(), paragraphs: [{ text: `${id} text.` }] })),
  sources: Object.fromEntries(SECTION_ORDER.map((id) => [id, ['https://example.org/a', 'https://example.org/b']])) as BreakFile['sources'],
  claims: [
    { id: 'left', text: 'A left', check: 'peel-left' }, { id: 'barrels', text: 'Barrels', check: 'barrel' },
    { id: 'best-swell', text: 'Best swell W–SW', check: 'best-swell' }, { id: 'best-wind', text: 'Best wind E', check: 'best-wind' },
    { id: 'best-tide', text: 'Best tide mid', check: 'best-tide' },
  ],
});

describe('parseBreak', () => {
  it('accepts a good file', () => { expect(parseBreak(good()).id).toBe('test'); });
  it('rejects a file missing a section', () => {
    const b = good(); b.details = b.details.slice(1);
    expect(() => parseBreak(b)).toThrow(/break file: test: details must have the 7 sections/);
  });
  it('rejects a paragraph citing an unknown claim', () => {
    const b = good(); b.details[0].paragraphs.push({ text: 'x', claim: 'nope' });
    expect(() => parseBreak(b)).toThrow(/unknown claim "nope"/);
  });
  it('rejects a section with fewer than two sources', () => {
    const b = good(); b.sources.wave = ['https://example.org/a'];
    expect(() => parseBreak(b)).toThrow(/wave needs at least 2 sources/);
  });
  it('rejects nonsense', () => { expect(() => parseBreak(null)).toThrow(/break file/); });
});

describe('viewOf', () => {
  const pass = { pass: true, detail: '' }, fail = { pass: false, detail: 'no game check yet' };
  it('keeps everything when every claim passed', () => {
    const v = viewOf(good(), { left: pass, barrels: pass, 'best-swell': pass, 'best-wind': pass, 'best-tide': pass });
    expect(v.summary).toHaveLength(3); expect(v.dropped).toEqual([]); expect(v.bestShown).toEqual({ swell: true, wind: true, tide: true });
  });
  it('drops paragraphs and summary lines whose claim failed or has no result, and says which', () => {
    const v = viewOf(good(), { left: pass, 'best-swell': pass, 'best-wind': fail });
    expect(v.summary.map((p) => p.text)).toEqual(['A heavy left.', 'Mind the reef.']);
    expect(v.dropped.sort()).toEqual(['barrels', 'best-tide', 'best-wind']);
    expect(v.bestShown).toEqual({ swell: true, wind: false, tide: false });
  });
  it('hides a section all of whose paragraphs were dropped (Review Focus 5)', () => {
    const b = good(); b.details[0].paragraphs = [{ text: 'only claim', claim: 'barrels' }];
    const v = viewOf(b, { barrels: fail });
    expect(v.details.map((s) => s.id)).not.toContain('wave');
    expect(v.details.every((s) => s.paragraphs.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/breaks/breakData.test.ts`
Expected: FAIL, "Failed to resolve import ./breakData".

- [ ] **Step 3: Implement**

```ts
// src/breaks/breakData.ts: a surf break's file (surf-map hub spec §5–6): where it is, its best conditions, the panel's
// summary and the details page's seven sections, the sources behind them (never shown) and the claims the game must back.
// A paragraph or summary line tied to a claim shows only if that claim's game check passed (src/breaks/<id>.claims.json).

export type Tide = 'low' | 'mid' | 'high';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type SectionId = 'wave' | 'when' | 'who' | 'hazards' | 'access' | 'story' | 'inGame';
export const SECTION_ORDER: readonly SectionId[] = ['wave', 'when', 'who', 'hazards', 'access', 'story', 'inGame'];

export interface Para { text: string; claim?: string }
export interface BreakBest { swellFromDeg: [number, number]; sizeFt: [number, number]; windFromDeg: [number, number]; tide: Tide[]; level: Level }
export interface BreakSection { id: SectionId; heading: string; paragraphs: Para[] }
export interface BreakClaim { id: string; text: string; check: string }
export interface BreakFile {
  id: string; name: string; kicker: string; subtitle: string; lonLat: [number, number]; hero: string;
  best: BreakBest;
  /** The claim each best-conditions row stands on (the row hides if it failed). */
  bestClaims: { swell: string; wind: string; tide: string };
  summary: Para[];
  details: BreakSection[];
  sources: Record<SectionId, string[]>;
  claims: BreakClaim[];
}
export type ClaimResults = Record<string, { pass: boolean; detail: string }>;
export interface BreakView extends Omit<BreakFile, 'summary' | 'details'> {
  summary: Para[]; details: BreakSection[]; dropped: string[]; bestShown: { swell: boolean; wind: boolean; tide: boolean };
}

const fail = (id: string, why: string): never => { throw new Error(`break file: ${id}: ${why}`); };
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function parseBreak(raw: unknown): BreakFile {
  if (!raw || typeof raw !== 'object') throw new Error('break file: not an object');
  const b = raw as BreakFile, id = isStr(b.id) ? b.id : fail('?', 'missing id');
  for (const k of ['name', 'kicker', 'subtitle', 'hero'] as const) if (!isStr(b[k])) fail(id, `missing ${k}`);
  if (!isPair(b.lonLat)) fail(id, 'lonLat must be [lon, lat]');
  const best = b.best;
  if (!best || !isPair(best.swellFromDeg) || !isPair(best.sizeFt) || !isPair(best.windFromDeg) || !Array.isArray(best.tide) || best.tide.length === 0) fail(id, 'best is incomplete');
  if (!best.tide.every((t) => t === 'low' || t === 'mid' || t === 'high')) fail(id, 'best.tide must be low/mid/high');
  if (!['beginner', 'intermediate', 'advanced'].includes(best.level)) fail(id, 'best.level is wrong');
  if (!Array.isArray(b.claims)) fail(id, 'claims must be a list');
  const claimIds = new Set(b.claims.map((c) => (isStr(c.id) && isStr(c.text) && isStr(c.check) ? c.id : fail(id, 'a claim needs id, text and check'))));
  const known = (c: string | undefined, where: string): void => { if (c !== undefined && !claimIds.has(c)) fail(id, `${where} cites unknown claim "${c}"`); };
  if (!b.bestClaims) fail(id, 'missing bestClaims');
  for (const k of ['swell', 'wind', 'tide'] as const) known(b.bestClaims[k], `bestClaims.${k}`);
  if (!Array.isArray(b.summary) || b.summary.length === 0) fail(id, 'summary is empty');
  b.summary.forEach((p, i) => { if (!isStr(p.text)) fail(id, `summary ${i} has no text`); known(p.claim, `summary ${i}`); });
  if (!Array.isArray(b.details) || b.details.map((s) => s.id).join() !== SECTION_ORDER.join()) fail(id, `details must have the 7 sections in order: ${SECTION_ORDER.join(', ')}`);
  for (const s of b.details) {
    if (!isStr(s.heading) || !Array.isArray(s.paragraphs) || s.paragraphs.length === 0) fail(id, `section ${s.id} needs a heading and paragraphs`);
    s.paragraphs.forEach((p, i) => { if (!isStr(p.text)) fail(id, `${s.id} paragraph ${i} has no text`); known(p.claim, `${s.id} paragraph ${i}`); });
  }
  for (const s of SECTION_ORDER) if (!Array.isArray(b.sources?.[s]) || b.sources[s].length < 2) fail(id, `${s} needs at least 2 sources`);
  return b;
}

/** What the panel and the details page may show: claims without a passing result are dropped, with their text. */
export function viewOf(b: BreakFile, results: ClaimResults): BreakView {
  const ok = (c?: string): boolean => c === undefined || results[c]?.pass === true;
  const dropped = b.claims.map((c) => c.id).filter((c) => !ok(c));
  const details = b.details.map((s) => ({ ...s, paragraphs: s.paragraphs.filter((p) => ok(p.claim)) })).filter((s) => s.paragraphs.length > 0);
  return {
    ...b, summary: b.summary.filter((p) => ok(p.claim)), details, dropped,
    bestShown: { swell: ok(b.bestClaims.swell), wind: ok(b.bestClaims.wind), tide: ok(b.bestClaims.tide) },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/breaks/breakData.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/breaks/breakData.ts src/breaks/breakData.test.ts
git commit -m "feat(surf-map): break files and claim filtering: only claims the game backs are shown

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 5: The Womb's researched file and hero capture

**Files:**
- Create: `src/breaks/womb.json`, `src/breaks/index.ts`, `public/breaks/womb-hero.webp`,
  `docs/superpowers/evidence/surf-map-hub/womb-research.md`
- Test: `src/breaks/index.test.ts`

**Interfaces:**
- Consumes: `parseBreak`, `viewOf`, `BreakFile`, `ClaimResults` (Task 4).
- Produces: `SURF_BREAKS: readonly BreakView[]` (from `src/breaks/index.ts`), sorted north to south. Claim results
  come from `src/breaks/womb.claims.json`. Until Task 7 writes it, the stub `{}` drops every claim.

- [ ] **Step 1: Research.** Use web search and fetch. Open every page you cite; never write a fact from memory or from
  Andrew's description. Start from:
  - https://en.wikipedia.org/wiki/Surfing_locations_in_the_Capes_region_of_South_West_Western_Australia
  - https://www.margaretriver.com/things-to-do/attractions/surfing/the-margaret-river-regions-surf-breaks-a-locals-guide/
  - https://www.mondo.surf/surf-spot/the-womb/guide/10394
  - https://www.surf-forecast.com/breaks/The-Womb

  Add at least two more independent sources: surf guides, the Shire of Augusta–Margaret River, DBCA (Leeuwin-Naturaliste
  NP, access), Surfline or Magicseaweed archives, and books with online previews.

  Write `docs/superpowers/evidence/surf-map-hub/womb-research.md`. Organise it per section (wave / when / who / hazards
  / access / story / inGame) and give each fact with its source URLs and the quote that supports it.

  Rules:
  - At least 2 sources per fact. When sources disagree, write the cautious version. For the level, pick the higher of
    the sources' ratings.
  - Noongar place names only from openly published sources. Skip anything under a non-commercial licence or an ICIP
    "ask the Custodians" notice, and don't suggest contacting anyone.
  - Note where the name "The Womb" comes from only if a source says so.

- [ ] **Step 2: Write `src/breaks/womb.json`** from the research. Exact shape, Task 4's `BreakFile`:

```json
{
  "id": "womb",
  "name": "The Womb",
  "kicker": "REEF BREAK · NEAR GRACETOWN",
  "subtitle": "<from research, ≤ 34 characters, e.g. a short, punchy left over reef>",
  "lonLat": [114.982, -33.8952],
  "hero": "breaks/womb-hero.webp",
  "best": { "swellFromDeg": [<min>, <max>], "sizeFt": [<min>, <max>], "windFromDeg": [<min>, <max>], "tide": ["<low|mid|high>"], "level": "<intermediate|advanced>" },
  "bestClaims": { "swell": "best-swell", "wind": "best-wind", "tide": "best-tide" },
  "summary": [
    { "text": "<line 1, ≤ 44 characters>", "claim": "left" },
    { "text": "<line 2, ≤ 44 characters>", "claim": "barrels" },
    { "text": "<line 3, ≤ 44 characters>" }
  ],
  "details": [
    { "id": "wave", "heading": "The wave", "paragraphs": [{ "text": "…", "claim": "left" }, { "text": "…", "claim": "barrels" }] },
    { "id": "when", "heading": "When it works", "paragraphs": [{ "text": "…", "claim": "best-swell" }, { "text": "…", "claim": "best-wind" }, { "text": "…", "claim": "best-tide" }] },
    { "id": "who", "heading": "Who it's for", "paragraphs": [{ "text": "…" }] },
    { "id": "hazards", "heading": "Hazards", "paragraphs": [{ "text": "…" }] },
    { "id": "access", "heading": "Getting there", "paragraphs": [{ "text": "…" }] },
    { "id": "story", "heading": "Name and story", "paragraphs": [{ "text": "…" }] },
    { "id": "inGame", "heading": "In the game", "paragraphs": [{ "text": "…" }] }
  ],
  "sources": { "wave": ["…", "…"], "when": ["…", "…"], "who": ["…", "…"], "hazards": ["…", "…"], "access": ["…", "…"], "story": ["…", "…"], "inGame": ["…", "…"] },
  "claims": [
    { "id": "left", "text": "A left", "check": "peel-left" },
    { "id": "barrels", "text": "Barrels at its best size", "check": "barrel" },
    { "id": "short", "text": "Short and punchy", "check": "none" },
    { "id": "other-way", "text": "Can meet a section breaking the other way", "check": "none" },
    { "id": "best-swell", "text": "Best swell <range>", "check": "best-swell" },
    { "id": "best-wind", "text": "Best wind <range>, offshore", "check": "best-wind" },
    { "id": "best-tide", "text": "Best tide <list>", "check": "best-tide" }
  ]
}
```

The `<…>` placeholders above are filled from the research; none may remain in the committed file. Any wave claim the
research supports beyond these goes in `claims` with `"check": "none"`. Its paragraph cites it, and the game hides it
until a check exists.

Writing style, for players: easy to read and a bit entertaining, one or two short paragraphs per section, under 60 words
each, no jargon without a gloss. "In the game" describes what the player will see in our game, and every sentence there
must hold in the game today; when in doubt, leave it out. "Story" and "access" carry no `claim`.

- [ ] **Step 3: Write `src/breaks/index.ts` and the claims stub**

Create `src/breaks/womb.claims.json` with `{}`. Then:

```ts
// src/breaks/index.ts: the breaks on the surf map (surf-map hub spec §5): every built break's file, parsed, with only
// the claims its game checks passed. Only built breaks are listed (Andrew 2026-10-09).
import { type BreakView, type ClaimResults, parseBreak, viewOf } from './breakData';
import womb from './womb.json';
import wombClaims from './womb.claims.json';

const files: [unknown, ClaimResults][] = [[womb, wombClaims as ClaimResults]];

/** North to south, the order focus moves in on the map. */
export const SURF_BREAKS: readonly BreakView[] = files
  .map(([raw, results]) => viewOf(parseBreak(raw), results))
  .sort((a, b) => b.lonLat[1] - a.lonLat[1]);

export const breakById = (id: string): BreakView | undefined => SURF_BREAKS.find((b) => b.id === id);
```

Check that `tsconfig.json` has `"resolveJsonModule": true`. If it doesn't, add it under `compilerOptions`.

- [ ] **Step 4: Write the test**

```ts
// src/breaks/index.test.ts
import { describe, expect, it } from 'vitest';
import { SURF_BREAKS, breakById } from './index';
import raw from './womb.json';

describe('the Womb file', () => {
  it('parses, sits at the spot Andrew chose, and has no unfilled placeholder', () => {
    expect(breakById('womb')?.lonLat).toEqual([114.982, -33.8952]);
    expect(JSON.stringify(raw)).not.toMatch(/<[^>]*>|…|TODO/);
  });
  it('keeps the panel lines short enough for the panel', () => {
    for (const p of (raw as { summary: { text: string }[] }).summary) expect(p.text.length).toBeLessThanOrEqual(44);
    expect((raw as { subtitle: string }).subtitle.length).toBeLessThanOrEqual(34);
  });
  it('lists only built breaks (one today)', () => { expect(SURF_BREAKS.map((b) => b.id)).toEqual(['womb']); });
});
```

Run: `npx vitest run src/breaks`
Expected: PASS.

- [ ] **Step 5: The hero capture.** With the dev server on 5180, capture the Womb in its best conditions (mid tide, the
  middle of the best swell range, light offshore). Use the existing ride capture:

```bash
npx electron tools/captureRide.mjs --base=http://localhost:5180/ --out=C:/Users/Andre/AppData/Local/Temp/womb-hero- --at=2,4,6 --left --cond="{\"swell\":{\"sizeFt\":6,\"periodS\":14,\"directionDeg\":247},\"wind\":{\"speedMs\":3,\"directionDeg\":90},\"tideM\":0}"
```

Look at the three frames (Read tool) and pick the one that best shows a left barrelling over the ledge. Convert it:

```bash
python -c "from PIL import Image; im=Image.open(r'C:/Users/Andre/AppData/Local/Temp/womb-hero-4.0.png').convert('RGB'); w,h=im.size; k=round(w*9/16); im=im.crop((0,(h-k)//2,w,(h-k)//2+k)) if h>k else im; im.thumbnail((1600,900)); im.save('public/breaks/womb-hero.webp',quality=86,method=6)"
```

(Make `public/breaks/` first. Swap in the chosen frame's file name.)

- [ ] **Step 6: Commit**

```bash
git add src/breaks/womb.json src/breaks/womb.claims.json src/breaks/index.ts src/breaks/index.test.ts public/breaks/womb-hero.webp docs/superpowers/evidence/surf-map-hub/womb-research.md tsconfig.json
git commit -m "feat(surf-map): the Womb's researched break file (sources kept internal) and in-game hero capture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 6: Today's conditions and the On / Fair / Off rule (`conditionsSource.ts`)

**Files:**
- Create: `src/frontend/conditionsSource.ts`
- Modify: `src/frontend/frontSettings.ts` (add `conditionsSource`)
- Test: `src/frontend/conditionsSource.test.ts`, plus one case in `src/frontend/frontSettings.test.ts`

**Interfaces:**
- Consumes: `SessionSetup`, `rollSetup`, `offeredSetup`, `WIND_ROWS`, `TIDE_STOPS` (`sessionSetup.ts`); `BreakBest`,
  `Tide` (Task 4); `compass16` (Task 1).
- Produces:
  - `ConditionsSource = 'forecast' | 'realtime' | 'custom'`
  - `daySeed(today: Date): number`
  - `todaysSetup(today: Date): SessionSetup`
  - `interface ConditionsNow { swellFt: number; periodS: number; swellFromDeg: number; windMs: number; windFromDeg: number | null; windLabel: string; tideM: number; tideLabel: string; sky: string }`
  - `nowOf(s: SessionSetup): ConditionsNow`
  - `conditionsNow(source: ConditionsSource, setups: { forecast: SessionSetup; custom: SessionSetup }): ConditionsNow`
  - `inArc(deg: number, arc: [number, number]): boolean`
  - `tideOf(m: number): Tide`
  - `type Verdict = 'on' | 'fair' | 'off'`
  - `breakToday(c: ConditionsNow, best: BreakBest): { verdict: Verdict; reason: string }`
  - `FrontSettings.conditionsSource: 'forecast' | 'custom'`

- [ ] **Step 1: Write the failing tests**

```ts
// src/frontend/conditionsSource.test.ts
import { describe, expect, it } from 'vitest';
import type { BreakBest } from '../breaks/breakData';
import { breakToday, conditionsNow, daySeed, inArc, nowOf, tideOf, todaysSetup } from './conditionsSource';
import { offeredSetup, presetById } from './sessionSetup';

const BEST: BreakBest = { swellFromDeg: [225, 270], sizeFt: [4, 10], windFromDeg: [45, 135], tide: ['mid'], level: 'advanced' };
const base = presetById('winterOffshore')!.setup;
const now = (o: Partial<ReturnType<typeof nowOf>>) => ({ ...nowOf(base), ...o });

describe('today', () => {
  it('is the same all day in WA and different the next day', () => {
    const a = new Date('2026-10-09T00:30:00+08:00'), b = new Date('2026-10-09T23:30:00+08:00'), c = new Date('2026-10-10T00:30:00+08:00');
    expect(daySeed(a)).toBe(daySeed(b)); expect(daySeed(a)).not.toBe(daySeed(c));
    expect(todaysSetup(a)).toEqual(todaysSetup(b));
  });
  it('only rolls a setup the Womb offers (it breaks)', () => {
    for (let d = 1; d <= 28; d++) { const s = todaysSetup(new Date(`2026-02-${String(d).padStart(2, '0')}T09:00:00+08:00`)); expect(offeredSetup(s)).toEqual(s); }
  });
});

describe('conditionsNow', () => {
  it('reads the forecast or the custom setup, and refuses real-time for now', () => {
    const custom = { ...base, swellFt: 9 };
    expect(conditionsNow('custom', { forecast: base, custom }).swellFt).toBe(9);
    expect(conditionsNow('forecast', { forecast: base, custom }).swellFt).toBe(base.swellFt);
    expect(() => conditionsNow('realtime', { forecast: base, custom })).toThrow(/real-time conditions are not available yet/);
  });
  it('says glassy with no direction (Review Focus 3)', () => {
    const c = nowOf({ ...base, wind: 0 });
    expect(c.windFromDeg).toBeNull(); expect(c.windLabel).toBe('Glassy');
  });
});

describe('inArc', () => {
  it('handles plain arcs and arcs across north (Review Focus 4)', () => {
    expect(inArc(250, [225, 270])).toBe(true); expect(inArc(200, [225, 270])).toBe(false);
    expect(inArc(350, [315, 45])).toBe(true); expect(inArc(10, [315, 45])).toBe(true); expect(inArc(180, [315, 45])).toBe(false);
    expect(inArc(225, [225, 270])).toBe(true); expect(inArc(270, [225, 270])).toBe(true);
  });
});

describe('tideOf', () => {
  it('splits the game tides into low / mid / high', () => {
    expect(tideOf(-0.5)).toBe('low'); expect(tideOf(-0.25)).toBe('low'); expect(tideOf(0)).toBe('mid'); expect(tideOf(0.5)).toBe('high');
  });
});

describe('breakToday', () => {
  it('is On with all four in range, and says why', () => {
    const r = breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST);
    expect(r).toEqual({ verdict: 'on', reason: 'WSW swell and an offshore E wind' });
  });
  it('counts glassy as good wind', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: null, windMs: 0.5, tideM: 0 }), BEST)).toEqual({ verdict: 'on', reason: 'WSW swell and glassy' });
  });
  it('is Fair with one miss and names it', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 6, windFromDeg: 270, windMs: 9, tideM: 0 }), BEST)).toEqual({ verdict: 'fair', reason: 'Wind onshore from the W' });
  });
  it('is Off with two or more misses and names them', () => {
    expect(breakToday(now({ swellFromDeg: 202, swellFt: 2, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST))
      .toEqual({ verdict: 'off', reason: 'Swell from the SSW · Swell too small' });
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 12, windFromDeg: 90, windMs: 3, tideM: 0.5 }), BEST))
      .toEqual({ verdict: 'off', reason: 'Swell too big · Tide too high' });
  });
  it('treats the size range as inclusive at both ends', () => {
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 4, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST).verdict).toBe('on');
    expect(breakToday(now({ swellFromDeg: 247, swellFt: 10, windFromDeg: 90, windMs: 3, tideM: 0 }), BEST).verdict).toBe('on');
  });
});
```

Add to `src/frontend/frontSettings.test.ts`:

```ts
it('keeps the conditions source, forecast by default, never real-time', () => {
  expect(sanitizeFrontSettings({}).conditionsSource).toBe('forecast');
  expect(sanitizeFrontSettings({ conditionsSource: 'custom' }).conditionsSource).toBe('custom');
  expect(sanitizeFrontSettings({ conditionsSource: 'realtime' }).conditionsSource).toBe('forecast');
});
```

(Import `sanitizeFrontSettings` there if the file doesn't already.)

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/frontend/conditionsSource.test.ts src/frontend/frontSettings.test.ts`
Expected: FAIL (missing module; `conditionsSource` undefined).

- [ ] **Step 3: Implement**

```ts
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
```

The "Wind onshore" wording only fits a wind outside the break's offshore arc. That holds because every Capes break faces
west, so a wind outside its offshore arc blows from the sea. If a future break faces otherwise, revisit the wording.

In `src/frontend/frontSettings.ts`:
- add `conditionsSource: 'forecast' | 'custom';` to `FrontSettings`;
- add `conditionsSource: 'forecast'` to `DEFAULT_FRONT_SETTINGS`;
- add this to `sanitizeFrontSettings`, using the file's existing `oneOf` helper:

  ```ts
  conditionsSource: oneOf(r.conditionsSource, ['forecast', 'custom'] as const, DEFAULT_FRONT_SETTINGS.conditionsSource),
  ```

Read how `oneOf` is called for `displayMode` in that function and match its argument order exactly.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/frontend/conditionsSource.test.ts src/frontend/frontSettings.test.ts`
Expected: PASS. If `todaysSetup` fails "only rolls a setup the Womb offers" for a date, `offeredSetup` found no offered
band for that tide (it returns `s` unchanged when `nearestOfferedBand` is −1). Read `offered`/`BREAKS`: every tide has
offered bands today, so a failure means the roll produced an out-of-table tide. Fix the cause; don't skip the date.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/conditionsSource.ts src/frontend/conditionsSource.test.ts src/frontend/frontSettings.ts src/frontend/frontSettings.test.ts
git commit -m "feat(surf-map): today's game forecast, the conditions source and the On/Fair/Off rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 7: The claims checker

**Files:**
- Create: `tools/checkBreakClaims.ts`
- Modify: `src/breaks/womb.claims.json` (generated), `package.json` (script)
- Test: `src/breaks/claims.test.ts`

**Interfaces:**
- Consumes: `womb.json`'s `claims` and `best` (Task 5). From `src/breaker/reefReport.ts`: `setWaveHeight`,
  `leftStretches`, `rideOf`, `PEEL_BAND`. From `src/breaker/reefField.ts`: `computeReefField`, `REFRACT_FLOOR_M`. From
  `src/seabed/bathymetry.ts`: `buildBathymetry`, `downsample`. `NORTH_LEDGE`. `DEFAULT_BREAK_PARAMS`. From
  `sessionSetup.ts`: `WIND_ROWS`, `SWELL_BANDS`, `BREAKS`, `BREAKS_TIDES_M`, `FROM_WINDOW`. `tideOf` (Task 6).
- Produces: `src/breaks/womb.claims.json`: `{ [claimId]: { pass: boolean; detail: string } }`, one entry per claim.

- [ ] **Step 1: Write the checker**

```ts
// tools/checkBreakClaims.ts: the game checks behind a break's claims (surf-map hub spec §6). Run from the repo root:
// npm run claims → src/breaks/<id>.claims.json. Each claim's `check` names a check below; 'none' (no game measure yet)
// writes pass: false, so the claim stays off screen until a check exists. Uses the reef report the criteria tests read.
import { readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { REFRACT_FLOOR_M, computeReefField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { setWaveHeight, leftStretches, rideOf, PEEL_BAND } = await imp<typeof import('../src/breaker/reefReport')>('/src/breaker/reefReport.ts');
const { NORTH_LEDGE } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { WIND_ROWS, SWELL_BANDS, BREAKS, BREAKS_TIDES_M, FROM_WINDOW } = await imp<typeof import('../src/frontend/sessionSetup')>('/src/frontend/sessionSetup.ts');
const { tideOf, inArc } = await imp<typeof import('../src/frontend/conditionsSource')>('/src/frontend/conditionsSource.ts');

const id = process.argv[2] ?? 'womb';
const file = JSON.parse(readFileSync(`src/breaks/${id}.json`, 'utf8'));
const best = file.best as { swellFromDeg: [number, number]; sizeFt: [number, number]; windFromDeg: [number, number]; tide: ('low' | 'mid' | 'high')[] };
const bed = downsample(buildBathymetry(), 2);
const midFt = (best.sizeFt[0] + best.sizeFt[1]) / 2;
const bandOf = (ft: number) => SWELL_BANDS.reduce((b, x) => (Math.abs(x.ft - ft) < Math.abs(b.ft - ft) ? x : b));

function left(ft: number, fromDeg: number, tideM: number) {
  const band = bandOf(ft), H = setWaveHeight(ft);
  const f = computeReefField({ bed, periodS: band.periodS, fromDeg, tideM, smooth: true, refractFloorM: REFRACT_FLOOR_M });
  return leftStretches(f, H, NORTH_LEDGE, { first: [0] }, P).first;
}
const breaksWell = (r: ReturnType<typeof left>) => !!r && r.broken === r.of && r.peel >= PEEL_BAND[0] && r.peel <= PEEL_BAND[1];

const checks: Record<string, () => { pass: boolean; detail: string }> = {
  'peel-left': () => {
    const r = left(midFt, 247, 0);
    return { pass: breaksWell(r), detail: r ? `${midFt} ft WSW mid: first leg ${r.broken}/${r.of} broken, peel ${r.peel.toFixed(1)} m/s (band ${PEEL_BAND.join('–')})` : 'no break' };
  },
  barrel: () => {
    const r = left(midFt, 247, 0), ride = r ? rideOf(r) : 'no break';
    return { pass: ride === 'barrel', detail: `${midFt} ft WSW mid: ${ride}${r ? `, hollow ${r.hollow.toFixed(2)}` : ''}` };
  },
  'best-swell': () => {
    const dirs = FROM_WINDOW.filter((d) => inArc(d, best.swellFromDeg));
    const res = dirs.map((d) => [d, breaksWell(left(midFt, d, 0))] as const);
    return { pass: dirs.length > 0 && res.every(([, ok]) => ok), detail: res.map(([d, ok]) => `${d}°: ${ok ? 'breaks' : 'no'}`).join(', ') || 'no game direction in range' };
  },
  'best-wind': () => {
    const offshore = WIND_ROWS.filter((w) => /offshore/i.test(w.label) && w.fromDeg !== null).map((w) => w.fromDeg!);
    const all = offshore.every((d) => inArc(d, best.windFromDeg));
    return { pass: offshore.length > 0 && all, detail: `the game's offshore winds blow from ${[...new Set(offshore)].join(', ')}°; best arc ${best.windFromDeg.join('–')}°` };
  },
  'best-tide': () => {
    const bands = SWELL_BANDS.filter((b) => b.ft >= best.sizeFt[0] && b.ft <= best.sizeFt[1]);
    const tides = BREAKS_TIDES_M.map((m, i) => [m, i] as const).filter(([m]) => best.tide.includes(tideOf(m)));
    const bad = bands.flatMap((b) => tides.filter(([, i]) => !BREAKS[b.label]?.[i]).map(([m]) => `${b.label}@${m}`));
    return { pass: bands.length > 0 && tides.length > 0 && bad.length === 0, detail: bad.length ? `doesn't break: ${bad.join(', ')}` : `breaks at ${tides.map(([m]) => m).join(', ')} m for ${bands.map((b) => b.label).join(', ')}` };
  },
  none: () => ({ pass: false, detail: 'no game check yet' }),
};

const out: Record<string, { pass: boolean; detail: string }> = {};
for (const c of file.claims as { id: string; check: string }[]) {
  const run = checks[c.check];
  out[c.id] = run ? run() : { pass: false, detail: `unknown check "${c.check}"` };
  console.log(`${out[c.id].pass ? 'PASS' : 'FAIL'} ${c.id}: ${out[c.id].detail}`);
}
writeFileSync(`src/breaks/${id}.claims.json`, JSON.stringify(out, null, 1) + '\n');
```

Add the script `"claims": "node tools/checkBreakClaims.ts"` to `package.json`.

- [ ] **Step 2: Run it**

Run: `npm run claims`
Expected: one PASS/FAIL line per claim, and `src/breaks/womb.claims.json` written. `short` and `other-way` FAIL with
"no game check yet". For any other FAIL, **do not change the check or the wave.** Write the line into
`docs/superpowers/evidence/surf-map-hub/claims-report.md` under "Failing claims for Andrew", with the detail; Andrew
decides between retuning and rewording (spec §6). Leave the result failing; the claim stays off screen.

- [ ] **Step 3: Test that the file and the checker agree**

```ts
// src/breaks/claims.test.ts
import { describe, expect, it } from 'vitest';
import claims from './womb.claims.json';
import raw from './womb.json';

describe('the Womb claims file', () => {
  it('has a result for every claim in womb.json (rerun npm run claims after editing claims)', () => {
    const ids = (raw as { claims: { id: string }[] }).claims.map((c) => c.id).sort();
    expect(Object.keys(claims).sort()).toEqual(ids);
  });
  it('never marks a check-less claim as passed', () => {
    for (const c of (raw as { claims: { id: string; check: string }[] }).claims)
      if (c.check === 'none') expect((claims as Record<string, { pass: boolean }>)[c.id].pass).toBe(false);
  });
});
```

Run: `npx vitest run src/breaks`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/checkBreakClaims.ts src/breaks/womb.claims.json src/breaks/claims.test.ts package.json docs/superpowers/evidence/surf-map-hub/
git commit -m "feat(surf-map): the claims checker: the Womb's wave claims tested against the reef report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 8: The map beat in the front-end state machine

**Files:**
- Modify: `src/frontend/frontEnd.ts`, `src/frontend/frontEnd.test.ts`, `src/frontend/legend.ts`,
  `src/frontend/glyphs.ts`, `src/frontend/backdrop/backdropMath.ts`, `src/frontend/backdrop/riderPortrait.ts`,
  `src/frontend/beatCamera.ts`, `src/frontend/staging.ts`, `src/app/App.ts` (`frontEndGoTo`),
  `src/dev/frontEndCheck.ts`
- Test: `src/frontend/frontEnd.test.ts` (new cases)

**Interfaces:**
- Consumes: `SURF_BREAKS` (Task 5), `todaysSetup` (Task 6).
- Produces:
  - `Beat = 'map' | 'conditions' | 'rider' | 'gear' | 'out'`
  - `FrontState` gains `breakId: string; source: 'forecast' | 'custom'; breakDetails: boolean; detailsScroll: number`
  - New `FrontEvent`s: `{ kind: 'surfHere'; breakId: string }`, `{ kind: 'title' }`,
    `{ kind: 'locked'; what: 'library' | 'realtime' }`, `{ kind: 'source'; source: 'forecast' | 'custom' }`,
    `{ kind: 'breakDetails'; open: boolean }`, `{ kind: 'pinFocus'; breakId: string }`
  - `initialFront(saved, source = 'forecast')` starts on `'map'`
  - `focusTo` accepts `{ pin: string }`
  - `LegendAction` gains `'toggle'`

- [ ] **Step 1: Write the failing tests** (add to `src/frontend/frontEnd.test.ts`; reuse its `CTX`, `run`, `settle`
  and `fresh` helpers, and read them first)

```ts
describe('the map beat (surf-map hub)', () => {
  it('opens on the map with the first break focused', () => {
    const s = fresh();
    expect(s.beat).toBe('map'); expect(s.breakId).toBe('womb'); expect(s.breakDetails).toBe(false);
  });
  it('Surf here on the forecast loads today\'s forecast and moves to Conditions', () => {
    const r = step(fresh(), 'confirm', CTX);
    expect(r.state.beat).toBe('conditions');
    expect(r.state.setup).toEqual(todaysSetup(CTX.today));
    expect(r.events).toContainEqual({ kind: 'surfHere', breakId: 'womb' });
  });
  it('Surf here on custom keeps the player\'s setup', () => {
    const s = { ...fresh(), source: 'custom' as const, setup: { ...fresh().setup, swellFt: 9 } };
    expect(step(s, 'confirm', CTX).state.setup.swellFt).toBe(9);
  });
  it('Back on the map asks for the title; Back on Conditions returns to the map', () => {
    expect(step(fresh(), 'back', CTX).events).toEqual([{ kind: 'title' }]);
    const onCond = settle(step(fresh(), 'confirm', CTX).state);
    const r = step(onCond, 'back', CTX);
    expect(r.state.beat).toBe('map'); expect(r.events).toContainEqual({ kind: 'back' });
  });
  it('Tab flips forecast and custom; LB/RB say the Library is locked', () => {
    expect(step(fresh(), 'toggle', CTX).state.source).toBe('custom');
    expect(step(fresh(), 'toggle', CTX).events).toEqual([{ kind: 'source', source: 'custom' }]);
    expect(step(fresh(), 'tabPlus', CTX).events).toEqual([{ kind: 'locked', what: 'library' }]);
  });
  it('Details opens the break page; up/down scroll it; Back closes it, not the map', () => {
    let s = step(fresh(), 'details', CTX).state;
    expect(s.breakDetails).toBe(true);
    s = step(s, 'down', CTX).state; s = step(s, 'down', CTX).state; s = step(s, 'up', CTX).state;
    expect(s.detailsScroll).toBe(1);
    const r = step(s, 'back', CTX);
    expect(r.state.breakDetails).toBe(false); expect(r.state.beat).toBe('map'); expect(r.events).toEqual([{ kind: 'breakDetails', open: false }]);
  });
  it('never scrolls above the top', () => {
    expect(step(step(fresh(), 'details', CTX).state, 'up', CTX).state.detailsScroll).toBe(0);
  });
  it('pointer focus on a pin selects that break', () => {
    expect(focusTo(fresh(), { pin: 'womb' }).breakId).toBe('womb');
  });
});
```

Change the existing assertion at `frontEnd.test.ts:66` (`expect(step(s, 'back', CTX).events).toEqual([]);` on
Conditions). Back on Conditions now moves to the map, so assert `step(s, 'back', CTX).state.beat` is `'map'`. Wherever
the existing tests build a Conditions-first state through `fresh()`, they now start on the map: update `fresh()` (or
add `freshOn('conditions')`) so the older Conditions/Rider/Gear tests still start where they expect, by settling a
`'confirm'` from the map. Import `todaysSetup` from `./conditionsSource` in the test file.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/frontend/frontEnd.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement in `frontEnd.ts`**

- `export type Beat = 'map' | 'conditions' | 'rider' | 'gear' | 'out';`
- Add the four `FrontState` fields above, with JSDoc:
  - `breakId`: the focused break on the map;
  - `source`: where the map's conditions come from (settings);
  - `breakDetails`: the break's details page is open;
  - `detailsScroll`: the details page's scroll step.
- Add the six events to `FrontEvent`.
- `initialFront(saved: SavedChoices, source: 'forecast' | 'custom' = 'forecast')`: set `beat: 'map'`,
  `breakId: SURF_BREAKS[0].id`, `source`, `breakDetails: false`, `detailsScroll: 0` (keep the existing fields).
- Add `stepMap`:

```ts
function stepMap(s: FrontState, a: FrontAction, ctx: Ctx): Out {
  if (s.breakDetails) {
    switch (a) {
      case 'down': return { state: { ...s, detailsScroll: s.detailsScroll + 1 }, events: [] };
      case 'up': return { state: { ...s, detailsScroll: Math.max(0, s.detailsScroll - 1) }, events: [] };
      case 'back': case 'details': return { state: { ...s, breakDetails: false, detailsScroll: 0 }, events: [{ kind: 'breakDetails', open: false }] };
      case 'confirm': return surfHere(s, ctx);
      default: return { state: s, events: [] };
    }
  }
  const i = SURF_BREAKS.findIndex((b) => b.id === s.breakId), n = SURF_BREAKS.length;
  switch (a) {
    case 'up': case 'left': case 'down': case 'right': {
      if (n < 2) return { state: s, events: [] };
      const next = SURF_BREAKS[(i + (a === 'down' || a === 'right' ? 1 : -1) + n) % n].id;
      return { state: { ...s, breakId: next }, events: [{ kind: 'pinFocus', breakId: next }] };
    }
    case 'confirm': return surfHere(s, ctx);
    case 'details': return { state: { ...s, breakDetails: true, detailsScroll: 0 }, events: [{ kind: 'breakDetails', open: true }] };
    case 'toggle': { const source = s.source === 'forecast' ? 'custom' : 'forecast'; return { state: { ...s, source }, events: [{ kind: 'source', source }] }; }
    case 'tabMinus': case 'tabPlus': return { state: s, events: [{ kind: 'locked', what: 'library' }] };
    case 'back': return { state: s, events: [{ kind: 'title' }] };
    default: return { state: s, events: [] };
  }
}

function surfHere(s: FrontState, ctx: Ctx): Out {
  const setup = s.source === 'forecast' ? todaysSetup(ctx.today) : s.setup;
  return moveTo({ ...s, setup, presetId: presetOfSetup(setup), breakDetails: false, detailsScroll: 0 }, 'conditions', ctx, [{ kind: 'surfHere', breakId: s.breakId }]);
}
```

- In `stepConditions`, add `case 'back': return moveTo(s, 'map', ctx, [{ kind: 'back' }]);`.
- In `step`, route `if (s.beat === 'map') return stepMap(s, a, ctx);` before the Conditions line.
- Keep `'start'` (paddle out from any beat) as it is. From the map it paddles out with today's saved setup, which
  matches the old behaviour from Conditions.
- `focusTo`: add a `{ pin: string }` target. It applies only on a settled `'map'` beat, sets `breakId`, and returns the
  state unchanged otherwise. Extend the target union and its beat mapping
  (`'pin' in target ? 'map' : 'row' in target ? …`).
- `savedOf` is unchanged. The source is saved by the page through settings (Task 9).

Add `'map'` everywhere the beat list is hard-coded:
- `backdropMath.ts` `groundOf`: `beat === 'map' || beat === 'conditions' ? { conditions: 1, select: 0 } : …`. The chart
  covers the screen, so the ground behind it doesn't matter, but it must never be `null`.
- `riderPortrait.ts`: treat `'map'` like `'conditions'` (no portrait).
- `beatCamera.ts` `crewFor`: treat `'map'` like `'conditions'`.
- `staging.ts`: treat `'map'` like `'conditions'`.
- `App.ts` `frontEndGoTo`: `beat: 'map' | 'conditions' | 'rider' | 'gear'`, `order = ['map', 'conditions', 'rider', 'gear'] as const`.
- `dev/frontEndCheck.ts:21`: add `'map'` to its list.

In `glyphs.ts`, add `'toggle'` to `LegendAction`; it already has glyphs in all three tables. In `legend.ts`:
- add `'toggle'` to `ORDER` after `'details'`;
- in `legendFor`, add the map's entries first:

  ```ts
  if (s.beat === 'map') {
    if (s.breakDetails) e.push({ action: 'confirm', text: 'Surf here', accent: true }, { action: 'back', text: 'Close' });
    else e.push({ action: 'confirm', text: 'Surf here', accent: true }, { action: 'details', text: 'Break details' }, { action: 'toggle', text: s.source === 'forecast' ? 'Custom conditions' : 'Game forecast' }, { action: 'back', text: 'Title' });
  }
  ```

  Keep the `controls` entry for every beat but `'out'`.

- [ ] **Step 4: Run all tests and the typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS and no type errors. The typecheck flags any `switch` or record over `Beat` that misses `'map'`; fix each
one the same way as Conditions.

- [ ] **Step 5: Commit**

```bash
git add -A src/frontend src/app/App.ts src/dev/frontEndCheck.ts
git commit -m "feat(surf-map): the map beat: break focus, Surf here by source, details open/scroll, Back to the title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 9: The surf map page (chart, strip, source switch, break panel)

**Files:**
- Create: `src/frontend/ui/surfMapPanel.ts`
- Modify: `src/frontend/frontEndPage.ts` (mount, render, events, toast, settings save), `src/frontend/frontEndCore.ts`
  (`react` for the new events), `src/frontend/ui/frontEnd.css`, `src/frontend/surfMap.selftest.ts`

**Interfaces:**
- Consumes: `CapesChart` (Task 3), `SURF_BREAKS`/`BreakView` (Tasks 4–5), `conditionsNow`/`breakToday`/
  `todaysSetup`/`ConditionsNow` (Task 6), the Task 8 state and events, `compass16`.
- Produces:
  - `class SurfMapPanel` with `readonly el: HTMLDivElement`, `constructor(onPointer: (p: { kind: 'pin'; id: string } | { kind: 'action'; action: FrontAction } | { kind: 'locked'; what: 'realtime' | 'library' }) => void)`,
    `load(): Promise<void>`, `render(s: FrontState, today: Date): void`, `update(nowMs: number): void`
  - `FrontEnd.toast(text: string): void`
  - `FrontEndHost.backToTitle?(): void`

- [ ] **Step 1: Implement the panel**

```ts
// src/frontend/ui/surfMapPanel.ts: the surf map beat (surf-map hub spec §3, mockup A): the chart full screen; top-left
// the tabs (Surf map · Library, locked), today's conditions and the source switch; top-right the Local tag; on the right
// the focused break's panel; a dotted leader from its pin to the panel.
import { SURF_BREAKS, breakById } from '../../breaks/index';
import { compass16 } from '../capesGeom';
import { breakToday, conditionsNow, todaysSetup } from '../conditionsSource';
import type { FrontAction, FrontState } from '../frontEnd';
import { CapesChart } from './capesChart';

type Pointer = { kind: 'pin'; id: string } | { kind: 'action'; action: FrontAction } | { kind: 'locked'; what: 'realtime' | 'library' };
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e;
};
const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const TIDE = { low: 'Low', mid: 'Mid', high: 'High' } as const;

export class SurfMapPanel {
  readonly el = h('div', 'fe-map');
  private readonly chart = new CapesChart({ view: 'full' });
  private readonly strip = h('div', 'fe-map-strip');
  private readonly sw = h('div', 'fe-map-source');
  private readonly panel = h('div', 'fe-map-panel');
  private readonly leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private key = '';

  constructor(private readonly onPointer: (p: Pointer) => void) {
    const tabs = h('div', 'fe-map-tabs');
    const map = h('span', 'fe-map-tab is-on', 'SURF MAP'), lib = h('span', 'fe-map-tab is-locked', 'LIBRARY');
    lib.dataset.hit = 'library'; lib.addEventListener('click', () => onPointer({ kind: 'locked', what: 'library' }));
    tabs.append(map, lib);
    const local = h('div', 'fe-map-local', 'LOCAL');
    for (const [id, label] of [['forecast', 'GAME FORECAST'], ['realtime', 'REAL-TIME · SOON'], ['custom', 'CUSTOM']] as const) {
      const b = h('span', 'fe-map-src', label); b.dataset.src = id; b.dataset.hit = `src:${id}`;
      b.addEventListener('click', () => (id === 'realtime' ? onPointer({ kind: 'locked', what: 'realtime' }) : onPointer({ kind: 'action', action: 'toggle' })));
      this.sw.appendChild(b);
    }
    this.leader.setAttribute('class', 'fe-map-leader');
    this.chart.onPin = (id) => onPointer({ kind: 'pin', id });
    this.panel.dataset.hit = 'panel';
    this.el.append(this.chart.el, this.leader, tabs, this.strip, this.sw, local, this.panel);
  }

  load(): Promise<void> { return this.chart.load(); }

  render(s: FrontState, today: Date): void {
    const forecast = todaysSetup(today), now = conditionsNow(s.source, { forecast, custom: s.setup });
    const b = breakById(s.breakId) ?? SURF_BREAKS[0];
    const key = JSON.stringify([s.source, s.breakId, now]);
    for (const el of this.sw.children) (el as HTMLElement).classList.toggle('is-on', (el as HTMLElement).dataset.src === s.source);
    if (key === this.key) return;
    this.key = key;
    this.chart.setConditions(now);
    this.chart.setPins(SURF_BREAKS.map((x) => ({ id: x.id, name: x.name, lonLat: x.lonLat })), s.breakId);
    const kmh = Math.round(now.windMs * 3.6);
    this.strip.replaceChildren(
      h('div', 'fe-map-strip-k', s.source === 'forecast' ? 'TODAY · GAME FORECAST' : 'CUSTOM CONDITIONS'),
      line('Swell', `${now.swellFt} ft @ ${now.periodS} s ${compass16(now.swellFromDeg)}`),
      line('Wind', now.windFromDeg === null || now.windMs < 1 ? 'Glassy' : `${kmh} km/h ${compass16(now.windFromDeg)} · ${now.windLabel.toLowerCase()}`),
      line('Tide', now.tideLabel),
    );
    const today_ = breakToday(now, b.best);
    const verdictText = { on: 'ON TODAY', fair: 'FAIR TODAY', off: 'OFF TODAY' }[today_.verdict];
    const stat = (k: string, v: string) => { const d = h('div', 'fe-map-stat'); d.append(h('div', 'fe-map-stat-k', k), h('div', 'fe-map-stat-v', v)); return d; };
    const stats = h('div', 'fe-map-stats');
    if (b.bestShown.swell) stats.appendChild(stat('BEST SWELL', `${compass16(b.best.swellFromDeg[0])} – ${compass16(b.best.swellFromDeg[1])}`));
    if (b.bestShown.wind) stats.appendChild(stat('BEST WIND', `${compass16(b.best.windFromDeg[0])} – ${compass16(b.best.windFromDeg[1])} · offshore`));
    if (b.bestShown.tide) stats.appendChild(stat('BEST TIDE', b.best.tide.map((t) => TIDE[t]).join(', ')));
    stats.appendChild(stat('LEVEL', LEVEL[b.best.level]));
    const verdict = h('div', `fe-map-verdict is-${today_.verdict}`);
    verdict.append(h('span', 'fe-map-verdict-dot'), h('div', 'fe-map-verdict-t', verdictText), h('div', 'fe-map-verdict-s', today_.reason));
    const more = h('div', 'fe-map-more', 'DETAILS ›'); more.dataset.hit = 'details';
    more.addEventListener('click', () => this.onPointer({ kind: 'action', action: 'details' }));
    this.panel.replaceChildren(h('div', 'fe-map-kick', b.kicker), h('div', 'fe-map-name', b.name), h('div', 'fe-map-sub', b.subtitle),
      verdict, stats, ...b.summary.map((p) => h('p', 'fe-map-para', p.text)), more);
    this.drawLeader(b.id);
  }

  private drawLeader(id: string): void {
    const p = this.chart.pinPoint(id), svg = this.chart.el.querySelector('svg');
    if (!p || !svg) return;
    const ctm = svg.getScreenCTM(), box = this.el.getBoundingClientRect(), panel = this.panel.getBoundingClientRect();
    if (!ctm || box.width === 0) return;
    const pt = svg.createSVGPoint(); pt.x = p[0]; pt.y = p[1];
    const s = pt.matrixTransform(ctm), sx = box.width / this.el.offsetWidth || 1;
    const x1 = (s.x - box.left) / sx + 18, y = (s.y - box.top) / sx, x2 = (panel.left - box.left) / sx;
    this.leader.innerHTML = `<path d="M${x1.toFixed(0)},${y.toFixed(0)} L${x2.toFixed(0)},${y.toFixed(0)}"/>`;
  }

  update(nowMs: number): void { this.chart.update(nowMs); }
}

function line(k: string, v: string): HTMLElement {
  const d = document.createElement('div'); d.className = 'fe-map-strip-l';
  const a = document.createElement('span'); a.textContent = `${k} `; const b = document.createElement('b'); b.textContent = v;
  d.append(a, b); return d;
}
```

Append the styles to `frontEnd.css`. Positions are taken from mockup A, in design px inside the safe area:

```css
.fe-map { position: absolute; inset: 0; }
.fe-map-tabs { position: absolute; left: var(--fe-safe-x); top: var(--fe-safe-y); display: flex; gap: 44px; font: 700 30px 'Barlow Semi Condensed'; letter-spacing: .12em; }
.fe-map-tab { color: #a9c3c2; padding-bottom: 10px; }
.fe-map-tab.is-on { color: #f6ecd6; border-bottom: 4px solid var(--fe-sun); }
.fe-map-tab.is-locked { opacity: .55; }
.fe-map-strip { position: absolute; left: var(--fe-safe-x); top: calc(var(--fe-safe-y) + 86px); font: 500 22px/1.45 Barlow; color: #a9c3c2; }
.fe-map-strip-k { font: 600 17px 'Barlow Semi Condensed'; letter-spacing: .22em; color: var(--fe-sun); margin-bottom: 6px; }
.fe-map-strip-l b { color: #f6ecd6; font-weight: 600; }
.fe-map-source { position: absolute; left: var(--fe-safe-x); top: calc(var(--fe-safe-y) + 240px); display: flex; gap: 8px; }
.fe-map-src { font: 700 15px 'Barlow Semi Condensed'; letter-spacing: .14em; color: #a9c3c2; padding: 8px 14px; border: 1.5px solid #3f6f72; border-radius: 18px; background: #0b2a31; }
.fe-map-src.is-on { background: var(--fe-sun); border-color: var(--fe-sun); color: #13262a; }
.fe-map-src[data-src="realtime"] { opacity: .55; }
.fe-map-local { position: absolute; right: var(--fe-safe-x); top: var(--fe-safe-y); font: 700 17px 'Barlow Semi Condensed'; letter-spacing: .14em; color: #f6ecd6; padding: 10px 22px; border-radius: 22px; background: #0b2a31; border: 1.5px solid #3f6f72; }
.fe-map-leader { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.fe-map-leader path { stroke: var(--fe-sun); stroke-width: 2; stroke-dasharray: 2 7; stroke-linecap: round; fill: none; }
.fe-map-panel { position: absolute; right: var(--fe-safe-x); top: 250px; width: 472px; padding: 46px 36px 36px; background: #0b2a31; border: 1.5px solid #3f6f72; border-top: 6px solid var(--fe-sun); border-radius: 10px; color: #f6ecd6; }
.fe-map-kick { font: 600 17px 'Barlow Semi Condensed'; letter-spacing: .2em; color: var(--fe-sun); display: flex; align-items: center; gap: 12px; }
.fe-map-kick::before { content: ''; width: 34px; height: 4px; background: var(--fe-sun); }
.fe-map-name { font: 400 64px/1.05 Knewave; margin-top: 10px; text-shadow: 0 3px 0 #0e4a52; }
.fe-map-sub { font: 400 28px 'Caveat Brush'; opacity: .85; }
.fe-map-verdict { display: grid; grid-template-columns: 22px 1fr; column-gap: 12px; align-items: center; margin: 24px 0 8px; padding: 12px 18px; border-radius: 8px; background: #12434a; }
.fe-map-verdict-dot { width: 18px; height: 18px; border-radius: 50%; grid-row: span 2; }
.fe-map-verdict.is-on .fe-map-verdict-dot { background: #7fd36b; } .fe-map-verdict.is-fair .fe-map-verdict-dot { background: #e0b63a; } .fe-map-verdict.is-off .fe-map-verdict-dot { background: #d9574a; }
.fe-map-verdict-t { font: 700 20px 'Barlow Semi Condensed'; letter-spacing: .14em; }
.fe-map-verdict.is-on .fe-map-verdict-t { color: #9be48a; } .fe-map-verdict.is-fair .fe-map-verdict-t { color: #f0cd63; } .fe-map-verdict.is-off .fe-map-verdict-t { color: #f08a7e; }
.fe-map-verdict-s { font: 500 18px Barlow; opacity: .85; }
.fe-map-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; margin: 20px 0; }
.fe-map-stat-k { font: 600 15px 'Barlow Semi Condensed'; letter-spacing: .2em; color: #a9c3c2; }
.fe-map-stat-v { font: 600 26px 'Barlow Semi Condensed'; }
.fe-map-para { font: 400 21px/1.35 Barlow; opacity: .9; margin: 0; }
.fe-map-more { margin-top: 18px; font: 700 18px 'Barlow Semi Condensed'; letter-spacing: .2em; color: var(--fe-sun); cursor: pointer; }
.fe-toast { position: absolute; left: 50%; top: calc(var(--fe-safe-y) + 8px); transform: translateX(-50%); padding: 12px 26px; border-radius: 24px; background: #0b2a31; border: 1.5px solid #3f6f72; color: #f6ecd6; font: 600 20px 'Barlow Semi Condensed'; letter-spacing: .06em; opacity: 0; transition: opacity 200ms var(--fe-ease-out); }
.fe-toast.is-on { opacity: 1; }
```

- [ ] **Step 2: Wire it into `frontEndPage.ts`**
- Import `SurfMapPanel`.
- In `open()`:
  - Create `const surf = new SurfMapPanel((p) => (p.kind === 'pin' ? this.cue(this.core!.pointer({ pin: p.id }, performance.now())) : p.kind === 'locked' ? this.toast(p.what === 'library' ? 'Library: coming soon' : 'Real-time conditions: coming soon') : act(p.action)));`
  - Start loading it: `void surf.load().then(() => surf.render(this.core!.state, this.today));`
  - Add `map: wrap(surf.el)` to `this.beatEls`. It gets no `beatHead`, because the map has its own tabs.
  - Append it first, so it sits under the legend: `this.root.append(bottom, this.beatEls.map, this.beatEls.conditions, …)`.
  - Add `surf` to `this.parts`.
- Pass the saved source into the core so the map opens on it. Change `FrontEndCore`'s constructor options to take
  `source: 'forecast' | 'custom'`, and call `initialFront(saved, opts.source)`. In `open()`, pass
  `source: this.settings.conditionsSource`.
- In `render`: `if (visibleBeat === 'map' || s.beat === 'map') { p.surf.render(s, this.today); p.surf.update(now); }`
  (`now` is `render`'s time argument).
- Update `BEAT_HEAD` and `beatEls` typing so `map` exists, with no pips. The pip count stays 3 for
  conditions/rider/gear.
- Add `toast(text)`. It creates one `.fe-toast` element on the root the first time, sets the text, adds `is-on`, and
  clears it after 1800 ms with `window.setTimeout`, replacing any pending timer.
- In `cue` (or `FrontEndCore.react`), handle the new events:
  - `source`: set `this.settings = { ...this.settings, conditionsSource: e.source }`, then call `applySettings()`
    (which saves).
  - `locked`: `this.toast(e.what === 'library' ? 'Library: coming soon' : 'Real-time conditions: coming soon')`.
  - `title`: `this.host.backToTitle?.()`.
  - `breakDetails`, `pinFocus`, `surfHere`: play the existing `'confirm'`/`'focus'` UI sounds through `soundFor`. Add
    the mappings in `uiSounds.ts`: `breakDetails` → the sound `details` uses, `pinFocus` → the focus sound, `surfHere`
    → the move sound.
- Add `backToTitle?(): void` to `FrontEndHost` in `frontEndCore.ts`, with a JSDoc: "B on the map: the title screen
  again (App shows it; absent in tests)".

- [ ] **Step 3: Self-test the page.** Add to `surfMap.selftest.ts`:

```ts
import { FrontEnd } from './frontEndPage';
// fakeHost / memory / noSound: copy the helpers used by frontEnd.selftest.ts:301 (export them from there if they're local).

registerSelfTest({
  name: 'frontend: the map beat shows the Womb panel, On/Fair/Off, the leader and the Local tag; no undefined',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    try {
      fe.open();
      for (let i = 0; i < 40; i++) { fe.update(16); await new Promise((r) => setTimeout(r, 16)); }
      const panel = host.querySelector('.fe-map-panel'), text = host.innerText;
      const problems: string[] = [];
      if (!panel?.textContent?.includes('The Womb')) problems.push('no Womb panel');
      if (!host.querySelector('.fe-map-verdict.is-on, .fe-map-verdict.is-fair, .fe-map-verdict.is-off')) problems.push('no verdict');
      if (!host.querySelector('.fe-map-leader path')) problems.push('no leader');
      if (!text.includes('LOCAL')) problems.push('no Local tag');
      if (/undefined|NaN/.test(text)) problems.push('undefined/NaN on screen');
      if (host.querySelectorAll('.fe-map-stat').length < 1) problems.push('no stats');
      return { pass: problems.length === 0, detail: problems.join('; ') || 'map beat renders' };
    } finally { fe.close(); host.remove(); }
  },
});
```

Run: `npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter=frontend`
Expected: every `frontend:` test passes, the existing ones included. If "B leaves every beat"
(`frontEnd.selftest.ts:297`) now fails because the front end opens on the map, update it: walk map → Conditions →
Rider → Gear with confirm, then assert that B goes back one beat each time, and that B on the map calls
`host.backToTitle`. Record the call in the fake host.

- [ ] **Step 4: Typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/frontend
git commit -m "feat(surf-map): the surf map page: chart, today's strip, source switch, break panel, leader, toasts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 10: The break details page

**Files:**
- Create: `src/frontend/ui/breakDetails.ts`
- Modify: `src/frontend/frontEndPage.ts`, `src/frontend/ui/frontEnd.css`, `src/frontend/surfMap.selftest.ts`

**Interfaces:**
- Consumes: `BreakView` (Task 4), `breakById` (Task 5), `breakToday`/`conditionsNow`/`todaysSetup` (Task 6),
  `FrontState.breakDetails`/`detailsScroll` (Task 8).
- Produces: `class BreakDetails` with `readonly el: HTMLDivElement`, `constructor(onAction: (a: FrontAction) => void)`,
  `render(s: FrontState, today: Date): void`.

- [ ] **Step 1: Implement**

```ts
// src/frontend/ui/breakDetails.ts: a break's details page (surf-map hub spec §8): over the dimmed chart, the in-game hero
// capture, name and today's verdict on the left; the seven sections (only those with claims the game backs) on the right,
// scrolled by up/down, the arrow keys or the wheel (one step = 120 design px).
import { breakById } from '../../breaks/index';
import { breakToday, conditionsNow, todaysSetup } from '../conditionsSource';
import type { FrontAction, FrontState } from '../frontEnd';

const STEP_PX = 120;

export class BreakDetails {
  readonly el = document.createElement('div');
  private readonly left = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly inner = document.createElement('div');
  private key = '';

  constructor(onAction: (a: FrontAction) => void) {
    this.el.className = 'fe-details';
    this.left.className = 'fe-details-left';
    this.body.className = 'fe-details-body';
    this.inner.className = 'fe-details-inner';
    this.body.appendChild(this.inner);
    this.el.append(this.left, this.body);
    this.body.addEventListener('wheel', (e) => { e.preventDefault(); onAction(e.deltaY > 0 ? 'down' : 'up'); }, { passive: false });
  }

  render(s: FrontState, today: Date): void {
    this.el.classList.toggle('is-open', s.breakDetails);
    if (!s.breakDetails) return;
    const b = breakById(s.breakId);
    if (!b) return;
    const key = `${b.id}|${s.source}`;
    if (key !== this.key) {
      this.key = key;
      const t = breakToday(conditionsNow(s.source, { forecast: todaysSetup(today), custom: s.setup }), b.best);
      const img = document.createElement('img');
      img.className = 'fe-details-hero'; img.src = `${import.meta.env.BASE_URL}${b.hero}`; img.alt = '';
      const name = document.createElement('div'); name.className = 'fe-map-name'; name.textContent = b.name;
      const sub = document.createElement('div'); sub.className = 'fe-map-sub'; sub.textContent = b.subtitle;
      const v = document.createElement('div'); v.className = `fe-map-verdict is-${t.verdict}`;
      v.innerHTML = '<span class="fe-map-verdict-dot"></span>';
      const vt = document.createElement('div'); vt.className = 'fe-map-verdict-t'; vt.textContent = { on: 'ON TODAY', fair: 'FAIR TODAY', off: 'OFF TODAY' }[t.verdict];
      const vs = document.createElement('div'); vs.className = 'fe-map-verdict-s'; vs.textContent = t.reason;
      v.append(vt, vs);
      this.left.replaceChildren(img, name, sub, v);
      this.inner.replaceChildren(...b.details.map((sec) => {
        const d = document.createElement('section'); d.className = 'fe-details-sec';
        const hd = document.createElement('div'); hd.className = 'fe-details-h'; hd.textContent = sec.heading.toUpperCase();
        d.appendChild(hd);
        for (const p of sec.paragraphs) { const e = document.createElement('p'); e.textContent = p.text; d.appendChild(e); }
        return d;
      }));
    }
    const max = Math.max(0, this.inner.scrollHeight - this.body.clientHeight);
    this.inner.style.transform = `translateY(${-Math.min(max, s.detailsScroll * STEP_PX)}px)`;
  }
}
```

CSS (append):

```css
.fe-details { position: absolute; inset: 0; background: rgba(6, 22, 27, .82); opacity: 0; pointer-events: none; transition: opacity 220ms var(--fe-ease-out); }
.fe-details.is-open { opacity: 1; pointer-events: auto; }
.fe-details-left { position: absolute; left: var(--fe-safe-x); top: calc(var(--fe-safe-y) + 40px); width: 760px; color: #f6ecd6; }
.fe-details-hero { width: 760px; height: 428px; object-fit: cover; border-radius: 8px; border-top: 6px solid var(--fe-sun); display: block; margin-bottom: 22px; }
.fe-details-body { position: absolute; right: var(--fe-safe-x); top: calc(var(--fe-safe-y) + 40px); bottom: 130px; width: 860px; overflow: hidden; color: #f6ecd6; }
.fe-details-inner { transition: transform 220ms var(--fe-ease-out); }
.fe-details-sec { margin-bottom: 30px; }
.fe-details-h { font: 600 17px 'Barlow Semi Condensed'; letter-spacing: .22em; color: var(--fe-sun); margin-bottom: 10px; }
.fe-details-sec p { font: 400 23px/1.5 Barlow; margin: 0 0 12px; max-width: 800px; }
.is-calm .fe-details, .is-calm .fe-details-inner { transition: none; }
```

- [ ] **Step 2: Wire it into `frontEndPage.ts`**
- In `open()`: `const details = new BreakDetails((a) => act(a));`, then append `details.el` inside
  `this.beatEls.map` after `surf.el`, and add `details` to `parts`.
- In `render`: call `p.details.render(s, this.today)` wherever `p.surf.render` is called.

- [ ] **Step 3: Self-test.** Add to `surfMap.selftest.ts`:

```ts
registerSelfTest({
  name: 'frontend: break details opens, shows only kept sections, scrolls and closes',
  async run() {
    const host = document.createElement('div'); document.body.appendChild(host);
    const fe = new FrontEnd(fakeHost(), host, noSound, memory());
    const tick = async (n = 20) => { for (let i = 0; i < n; i++) { fe.update(16); await new Promise((r) => setTimeout(r, 16)); } };
    try {
      fe.open(); await tick();
      fe.act('details'); await tick();
      const open = host.querySelector('.fe-details.is-open');
      const secs = [...host.querySelectorAll('.fe-details-sec')];
      const empty = secs.filter((s) => s.querySelectorAll('p').length === 0).length;
      const inner = host.querySelector<HTMLElement>('.fe-details-inner')!;
      fe.act('down'); fe.act('down'); await tick();
      const moved = inner.style.transform;
      fe.act('back'); await tick();
      const closed = !host.querySelector('.fe-details.is-open') && fe.state?.beat === 'map';
      const ok = !!open && secs.length >= 3 && empty === 0 && closed && /translateY\(-?\d/.test(moved) && !/undefined|NaN/.test(host.innerText);
      return { pass: ok, detail: `open ${!!open}, sections ${secs.length}, empty ${empty}, scroll ${moved}, closed ${closed}` };
    } finally { fe.close(); host.remove(); }
  },
});
```

Run: `npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter=frontend`
Expected: all `frontend:` tests pass.

- [ ] **Step 4: Typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/frontend
git commit -m "feat(surf-map): the break details page: hero capture, verdict, kept sections, scroll

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 11: Share the settings panel (`SettingsController`)

**Files:**
- Create: `src/frontend/ui/settingsController.ts`
- Modify: `src/frontend/frontEndPage.ts` (`openSettings`, `settingsAct`, `applySettings` move out)

**Interfaces:**
- Produces: `class SettingsController` with:
  - `constructor(root: HTMLElement, storage: SettingsStorage | null, onApply: (s: FrontSettings) => void, legend: Legend)`
  - `get isOpen(): boolean`
  - `get settings(): FrontSettings`
  - `set(s: FrontSettings): void` (save and apply, without opening)
  - `open(): void`
  - `act(a: FrontAction): boolean` (true if the panel consumed it; it closes on back/settings)
  - `close(): void`

- [ ] **Step 1: Move the code.** Read `frontEndPage.ts:338-387` (`openSettings`, `settingsAct`, `applySettings`) and
  the `settingsPanel`/`settingsFocus` fields. Move them **verbatim** into `SettingsController`, renaming only
  `this.root` → the constructor's `root`, `this.settings` → its own field (loaded with
  `sanitizeFrontSettings(loadJson(storage, FRONT_SETTINGS_KEY))`), and `applySettings` → save with
  `saveJson(storage, FRONT_SETTINGS_KEY, …)` then `onApply(settings)`.

  `FrontEnd` keeps a `SettingsController`:
  - its `onApply` does what `applySettings()` did after saving (re-layout, calm to the core);
  - `route` asks `this.settingsCtl.act(a)` first while it's open;
  - the `source` event from Task 9 uses `this.settingsCtl.set({ ...this.settingsCtl.settings, conditionsSource })`.

  Replace every remaining `this.settings` read with `this.settingsCtl.settings`.

- [ ] **Step 2: Run the existing settings self-tests and units**

Run: `npx vitest run && npm run typecheck && npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter=frontend`
Expected: everything passes as before. This is a pure move: no behaviour changes and no test edits beyond imports.

- [ ] **Step 3: Commit**

```bash
git add -A src/frontend
git commit -m "refactor(frontend): SettingsController, so the title can open the same settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 12: The title screen

**Files:**
- Create: `src/frontend/titleMenu.ts`, `src/frontend/titleMenu.test.ts`, `src/frontend/ui/titleScreen.ts`,
  `src/frontend/title.selftest.ts`, `public/ui/logo-wordmark.svg` (copied from `art/loading/logo-wordmark.svg`)
- Modify: `src/main.ts`, `src/app/App.ts`, `src/sound/SoundSystem.ts`, `src/dev/selfTests.ts`,
  `src/frontend/ui/frontEnd.css`

**Interfaces:**
- Consumes: `CapesChart` (Task 3, `'title'` view), `SettingsController` (Task 11), `UiInput`, `Legend`, `UiSounds`,
  `todaysSetup`/`nowOf` (Task 6), `FrontEndHost.backToTitle` (Task 9).
- Produces:
  - `type TitleItem = 'surf' | 'online' | 'settings' | 'quit'`
  - `titleItems(electron: boolean): TitleItem[]`
  - `stepTitle(s: { focus: number }, a: FrontAction, items: readonly TitleItem[]): { state; pick: 'surf' | 'settings' | 'quit' | null; toast: string | null; moved: boolean }`
  - `class TitleScreen` with `constructor(parent: HTMLElement, opts: { storage: SettingsStorage | null; soundOut: () => { ctx: BaseAudioContext; out: AudioNode } | null; electron: boolean; onSurf: () => void })`,
    `show(): void`, `hide(): void`, `get isOpen(): boolean`, `update(nowMs: number): void`
  - `SoundSystem.gestureNow(): void`
  - `App.attachTitle(t: TitleScreen): void`, `App.titleSurf(): void`

- [ ] **Step 1: Write the failing menu tests**

```ts
// src/frontend/titleMenu.test.ts
import { describe, expect, it } from 'vitest';
import { stepTitle, titleItems } from './titleMenu';

describe('title menu', () => {
  it('shows Quit only in the desktop build', () => {
    expect(titleItems(true)).toEqual(['surf', 'online', 'settings', 'quit']);
    expect(titleItems(false)).toEqual(['surf', 'online', 'settings']);
  });
  it('wraps focus up and down', () => {
    const items = titleItems(false);
    expect(stepTitle({ focus: 0 }, 'up', items).state.focus).toBe(2);
    expect(stepTitle({ focus: 2 }, 'down', items).state.focus).toBe(0);
  });
  it('Surf, Settings and Quit pick; Online toasts and stays', () => {
    const items = titleItems(true);
    expect(stepTitle({ focus: 0 }, 'confirm', items).pick).toBe('surf');
    expect(stepTitle({ focus: 1 }, 'confirm', items)).toMatchObject({ pick: null, toast: 'Online play is coming soon.' });
    expect(stepTitle({ focus: 2 }, 'confirm', items).pick).toBe('settings');
    expect(stepTitle({ focus: 3 }, 'confirm', items).pick).toBe('quit');
  });
  it('START picks Surf from anywhere; Back does nothing on the title', () => {
    expect(stepTitle({ focus: 2 }, 'start', titleItems(false)).pick).toBe('surf');
    expect(stepTitle({ focus: 1 }, 'back', titleItems(false))).toMatchObject({ pick: null, moved: false });
  });
});
```

Run: `npx vitest run src/frontend/titleMenu.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 2: Implement the menu**

```ts
// src/frontend/titleMenu.ts: the title's main menu (surf-map hub spec §2). Pure.
import type { FrontAction } from './frontEnd';

export type TitleItem = 'surf' | 'online' | 'settings' | 'quit';
export const TITLE_LABELS: Readonly<Record<TitleItem, string>> = { surf: 'Surf', online: 'Online', settings: 'Settings', quit: 'Quit' };

/** Quit only where a window can be closed (the desktop build). */
export function titleItems(electron: boolean): TitleItem[] {
  return electron ? ['surf', 'online', 'settings', 'quit'] : ['surf', 'online', 'settings'];
}

export function stepTitle(s: { focus: number }, a: FrontAction, items: readonly TitleItem[]): { state: { focus: number }; pick: 'surf' | 'settings' | 'quit' | null; toast: string | null; moved: boolean } {
  const n = items.length, none = { state: s, pick: null, toast: null, moved: false };
  if (a === 'up' || a === 'down') return { ...none, state: { focus: (s.focus + (a === 'down' ? 1 : -1) + n) % n }, moved: true };
  if (a === 'start') return { ...none, pick: 'surf' };
  if (a === 'confirm') {
    const it = items[s.focus];
    return it === 'online' ? { ...none, toast: 'Online play is coming soon.' } : { ...none, pick: it };
  }
  return none;
}
```

Run: `npx vitest run src/frontend/titleMenu.test.ts`
Expected: PASS.

- [ ] **Step 3: Implement `TitleScreen`.** Model it on `ui/pauseMenu.ts`: own `mountFrontEndRoot`, `UiInput`, `Legend`,
  `UiSounds`, rows with `pointerover`/`click`.

```ts
// src/frontend/ui/titleScreen.ts: the title (surf-map hub spec §2): the surf chart close-up drifting with today's swell,
// the emblem and wordmark upper left, the main menu down the left (Surf · Online, locked · Settings · Quit on desktop).
// It sits above the loading cover; the game boots behind it. The first press starts the sound (App.titleSurf).
import type { SettingsStorage } from '../../dev/devSettings';
import { nowOf, todaysSetup } from '../conditionsSource';
import { safeAreaFraction } from '../frontSettings';
import { TITLE_LABELS, type TitleItem, stepTitle, titleItems } from '../titleMenu';
import { type Device, UiInput } from '../uiInput';
import { UiSounds } from '../uiSounds';
import { CapesChart } from './capesChart';
import { applyLayout, layoutFor, mountFrontEndRoot } from './layout';
import { Legend } from './legend';
import { SettingsController } from './settingsController';

type SoundOut = () => { ctx: BaseAudioContext; out: AudioNode } | null;

export class TitleScreen {
  private readonly root: HTMLElement;
  private readonly chart = new CapesChart({ view: 'title' });
  private readonly rows: HTMLElement[] = [];
  private readonly items: TitleItem[];
  private readonly legend: Legend;
  private readonly settingsCtl: SettingsController;
  private readonly input = new UiInput(window);
  private readonly toastEl = document.createElement('div');
  private toastTimer = 0;
  private sounds: UiSounds | null = null;
  private focus = 0;
  private device: Device = 'keyboard';
  private open = true;

  constructor(parent: HTMLElement, private readonly opts: { storage: SettingsStorage | null; soundOut: SoundOut; electron: boolean; onSurf: () => void }) {
    this.root = mountFrontEndRoot(parent);
    this.root.classList.add('fe-title-screen');
    this.items = titleItems(opts.electron);
    const logo = document.createElement('div'); logo.className = 'fe-title-logo';
    logo.innerHTML = `<img src="${import.meta.env.BASE_URL}loading/emblem.webp" alt=""><img src="${import.meta.env.BASE_URL}ui/logo-wordmark.svg" alt="Liquid Dreams">`;
    const col = document.createElement('div'); col.className = 'fe-title-rows';
    this.items.forEach((it, i) => {
      const row = document.createElement('div'); row.className = `fe-row fe-title-row${it === 'online' ? ' is-locked' : ''}`;
      row.dataset.hit = it;
      row.innerHTML = `<span class="fe-value">${TITLE_LABELS[it]}</span>${it === 'online' ? '<span class="fe-title-soon">COMING SOON</span>' : ''}`;
      row.addEventListener('pointerover', () => { this.focus = i; this.render(); });
      row.addEventListener('click', () => { this.focus = i; this.act('confirm'); });
      this.rows.push(row); col.appendChild(row);
    });
    this.toastEl.className = 'fe-toast';
    this.legend = new Legend((a) => this.act(a));
    this.settingsCtl = new SettingsController(this.root, opts.storage, () => this.resize(), this.legend);
    this.root.append(this.chart.el, logo, col, this.toastEl, this.legend.el);
    this.resize();
    const today = nowOf(todaysSetup(new Date()));
    void this.chart.load().then(() => this.chart.setConditions(today));
    window.addEventListener('resize', this.resize);
    this.render();
  }

  get isOpen(): boolean { return this.open; }

  private readonly resize = (): void => {
    const s = this.settingsCtl.settings;
    applyLayout(this.root, layoutFor(window.innerWidth, window.innerHeight, safeAreaFraction(s)), s);
  };

  show(): void { this.open = true; this.root.style.display = ''; this.render(); }
  hide(): void { this.open = false; this.root.style.display = 'none'; }

  act(a: Parameters<typeof stepTitle>[1]): void {
    if (!this.open) return;
    if (this.settingsCtl.isOpen) { this.settingsCtl.act(a); this.render(); return; }
    const r = stepTitle({ focus: this.focus }, a, this.items);
    this.focus = r.state.focus;
    if (r.moved) this.play('focus');
    if (r.toast) { this.play('deny'); this.toast(r.toast); }
    if (r.pick === 'surf') { this.play('confirm'); this.hide(); this.opts.onSurf(); return; }
    if (r.pick === 'settings') { this.play('confirm'); this.settingsCtl.open(); }
    if (r.pick === 'quit') window.close();
    this.render();
  }

  private toast(text: string): void {
    this.toastEl.textContent = text; this.toastEl.classList.add('is-on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('is-on'), 1800);
  }

  private play(kind: 'focus' | 'confirm' | 'deny'): void {
    const out = this.opts.soundOut();
    if (!out) return;
    this.sounds ??= new UiSounds(out.ctx, out.out);
    this.sounds.play(kind === 'deny' ? 'back' : kind);
  }

  private render(): void {
    this.rows.forEach((r, i) => r.classList.toggle('is-focus', i === this.focus));
    this.legend.set(this.settingsCtl.isOpen ? [{ action: 'back', text: 'Back' }] : [{ action: 'confirm', text: 'Select' }], this.device);
  }

  update(nowMs: number): void {
    if (!this.open) return;
    const { actions, device } = this.input.poll(nowMs);
    if (device) this.device = device;
    for (const a of actions) this.act(a);
    this.chart.update(nowMs);
  }
}
```

Before you write it, check `UiSounds`' constructor and `play` names in `uiSounds.ts`, and `UiInput.poll`'s return
shape. Use the real names: the pause menu's `play` shows how it calls them. Swap `'focus'`/`'confirm'`/`'back'` for the
actual `UiSound` ids if they differ. Copy `art/loading/logo-wordmark.svg` to `public/ui/logo-wordmark.svg`.

CSS (append):

```css
.fe-title-screen { z-index: 2147483600; pointer-events: auto; background: #0a2c34; }
.fe-title-logo { position: absolute; left: var(--fe-safe-x); top: calc(var(--fe-safe-y) + 40px); display: flex; align-items: center; gap: 28px; }
.fe-title-logo img:first-child { width: 168px; height: 168px; }
.fe-title-logo img:last-child { height: 120px; }
.fe-title-rows { position: absolute; left: var(--fe-safe-x); top: 560px; width: 520px; }
.fe-title-row { grid-template-columns: 1fr auto; }
.fe-title-row.is-locked .fe-value { opacity: .5; }
.fe-title-soon { font: 700 14px 'Barlow Semi Condensed'; letter-spacing: .18em; color: #a9c3c2; align-self: center; }
```

The focused row reuses `.fe-row.is-focus` from the front-end CSS (the orange rule). Check that the class name matches
how `pauseMenu` marks focus, and use the same one.

- [ ] **Step 4: Sound from the first press.** In `SoundSystem.ts`:
  - add `gestureNow(): void { this.gesture(); }`, with a JSDoc: "The title's first press: start the sound now, inside
    that press's handler (browsers allow audio only from a gesture)";
  - at the top of `arm()`, add `if (this.running) return;`, so the "Click or press a key for sound" hint never shows
    once the title has started the sound.

  Make sure `gesture` is safe to call twice: it creates the context only once. Read it at `:96-110` and guard if it
  isn't.

- [ ] **Step 5: Wire boot.** In `src/main.ts`, inside `main()`, right after `const loading = LoadingScreen.adopt(document);`:

```ts
const wantFrontEnd = frontEndWanted(location.search, location.hash);
let appRef: App | null = null, surfPressed = false;
const title = wantFrontEnd ? new TitleScreen(document.body, {
  storage: browserStorage, electron: navigator.userAgent.includes('Electron'),
  soundOut: () => appRef?.soundOut() ?? null,
  onSurf: () => { if (appRef) appRef.titleSurf(); else surfPressed = true; },
}) : null;
if (title) { const tick = (t: number) => { title.update(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
```

Then after `app = new App(...)` and `app.attachLoading(...)`, add:

```ts
appRef = app;
if (title) app.attachTitle(title);
```

After `if (frontEnd) app.openFrontEnd();`, add `if (surfPressed) app.titleSurf();`. Also remove the second
`frontEndWanted` call (`const frontEnd = …`) and use `wantFrontEnd`.

`browserStorage` is module-private in `App.ts:143-147`. Export it from `App.ts` (`export const browserStorage`) and
import it in `main.ts`, along with `TitleScreen` from `./frontend/ui/titleScreen`.

In `App.ts`:

```ts
private title: TitleScreen | null = null;
attachTitle(t: TitleScreen): void { this.title = t; }
/** The title's Surf (or a press while the App was still starting): sound now, the title away, the map under it. */
titleSurf(): void { this.sound.gestureNow(); this.title?.hide(); }
soundOut(): { ctx: BaseAudioContext; out: AudioNode } | null { return this.sound.uiOut(); }
```

- In `reportLoading`, change `if (this.frontEnd) this.frontEnd.inputHeld = l.blocking;` to
  `if (this.frontEnd) this.frontEnd.inputHeld = l.blocking || !!this.title?.isOpen;`.
- Do the same where `inputHeld` is set when there's no cover: with no loading screen, `reportLoading` returns early. So
  also set `this.frontEnd.inputHeld = !!this.title?.isOpen` in `frame()` just before `this.frontEnd?.update(realDt)`
  when `!this.loadingScreen`.
- In `frontEndHost()`, add `backToTitle: () => this.title?.show()`.

- [ ] **Step 6: Self-test the title.**

```ts
// src/frontend/title.selftest.ts
import { registerSelfTest } from '../dev/selfTest';
import { TitleScreen } from './ui/titleScreen';

registerSelfTest({
  name: 'frontend: title menu: Surf hides it and calls onSurf once; Online toasts; no Quit in the browser',
  async run() {
    let surf = 0;
    const t = new TitleScreen(document.body, { storage: null, soundOut: () => null, electron: false, onSurf: () => { surf++; } });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const labels = [...document.querySelectorAll('.fe-title-row')].map((r) => r.textContent ?? '');
      t.act('down'); t.act('confirm');
      const toast = document.querySelector('.fe-title-screen .fe-toast.is-on')?.textContent ?? '';
      t.act('up'); t.act('confirm'); t.act('confirm');
      const ok = labels.length === 3 && !labels.some((l) => /Quit/.test(l)) && toast.includes('coming soon') && surf === 1 && !t.isOpen;
      return { pass: ok, detail: `rows ${labels.join('|')}, toast "${toast}", surf ${surf}, open ${t.isOpen}` };
    } finally { document.querySelector('.fe-title-screen')?.remove(); }
  },
});
```

Add `import '../frontend/title.selftest';` to `src/dev/selfTests.ts`.

Run: `npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter=frontend`
Expected: all `frontend:` tests pass.

- [ ] **Step 7: Boot by hand (Review Focus 1).** With the dev server on 5180, load `http://localhost:5180/` in the
  Playwright browser and check:
  1. The title paints within about 1 s.
  2. Press Enter at once. The loading cover shows under it if loading isn't done, then the map. There's exactly one
     map, and the sound starts with no "Click or press a key for sound" hint.
  3. On the map, press Esc. The title is back; pressing Enter returns to the map.
  4. On Conditions, press Esc. You're back on the map.

  Note each result in `docs/superpowers/evidence/surf-map-hub/boot-check.md`.

- [ ] **Step 8: Typecheck, tests, build**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: PASS, and the build succeeds. The Electron launcher builds `dist/`, so a broken build breaks Andrew's
shortcut.

- [ ] **Step 9: Commit**

```bash
git add -A src public/ui/logo-wordmark.svg docs/superpowers/evidence/surf-map-hub/boot-check.md
git commit -m "feat(title): the title screen and main menu over the surf chart; the first press starts the sound; Back from the map returns to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

### Task 13: Captures, the AAA check and the handover

**Files:**
- Create: `tools/captureHub.mjs`, `docs/superpowers/evidence/surf-map-hub/` captures + `README.md`
- Modify: memory note, via the session, not the repo

**Interfaces:**
- Consumes: everything above. It uses `window.liquidDreams` (DEV) and `frontEnd.act`, as `captureRiders.mjs` does.

- [ ] **Step 1: Write the capture tool** (modelled on `tools/captureRiders.mjs`: read it first, and reuse its window
  setup, the wait for `dataset.ldLoading === 'done'` and `capturePage`):

```js
// tools/captureHub.mjs: 1080p captures of the title, the map (glassy / offshore / onshore), the panel's On/Fair/Off and
// the details page. Usage: npx electron tools/captureHub.mjs --base=http://localhost:5180/ --out=docs/superpowers/evidence/surf-map-hub/hub
```

It must produce:
- `-title.png`: before pressing anything;
- `-map-forecast.png`: after Enter, on the map;
- `-map-custom-glassy.png`, `-map-custom-onshore.png`, `-map-custom-offshore.png`: set the setup with
  `window.liquidDreams.frontEnd.core.s.setup = {...}`, where `wind` is `0` / `5` / `1`. Toggle the source to custom with
  `act('toggle')`, so the panel shows On / Fair / Off;
- `-details.png`: `act('details')`;
- `-details-scrolled.png`: two `act('down')`.

`core` is private TS, reached at runtime like `captureRiders` does. Size the window to 1920×1080.

- [ ] **Step 2: Capture and compare.** Run the tool, then read every PNG. Compare each with mockup A, which sits in
  `.superpowers/brainstorm/53402-1791557166/content/map-style.html`; open it from the companion URL or render it with
  Playwright. Check the AAA bar for each:
  - safe areas;
  - nothing clipped or overlapping;
  - legend glyphs right for the device;
  - focus visible;
  - no "undefined", "NaN" or empty rows;
  - text sizes match the mockup.

  Fix anything that fails in the owning task's file, with its test, and recapture.

- [ ] **Step 3: Write `docs/superpowers/evidence/surf-map-hub/README.md`.** List:
  - the captures;
  - the claims report (which Womb claims passed or failed, and why);
  - the planning rulings from the plan's header;
  - what's left for builds 2 (Library) and 3 (studio screen).

- [ ] **Step 4: Full check**

Run: `npm run typecheck && npx vitest run && npm run build && npx electron tools/_selftest.mjs --base=http://localhost:5180/ --filter=frontend`
Expected: all green. The `frontend:` self-tests all pass.

- [ ] **Step 5: Commit and push** (do not merge; Andrew decides)

```bash
git add tools/captureHub.mjs docs/superpowers/evidence/surf-map-hub/
git commit -m "docs(surf-map): 1080p captures of the title, map, panel verdicts and details; the claims report and handover

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
