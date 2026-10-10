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
