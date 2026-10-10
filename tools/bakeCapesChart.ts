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
