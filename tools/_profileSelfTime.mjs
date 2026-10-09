// Task 16 (ride-framerate): self time by function and by source line inside sumWaves and inside waterAt, from the profiler's
// *-ride.cpuprofile files: node tools/_profileSelfTime.mjs <file>... Lines map through vite's own transform of each module.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = process.argv.slice(2);
const server = await createServer({ root: ROOT, configFile: ROOT + '/vite.config.ts', server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
const maps = new Map();
async function mapFor(path) {
  if (!maps.has(path)) {
    let m = null;
    try { const r = await server.transformRequest(path); m = r?.map ? new TraceMap(r.map) : null; } catch (e) { m = null; }
    maps.set(path, m);
  }
  return maps.get(path);
}
const pathOf = (url) => { const m = /^https?:\/\/[^/]+(\/src\/[^?]+)/.exec(url); return m ? m[1] : null; };
async function srcLine(url, line1) {
  const p = pathOf(url); if (!p) return null;
  const m = await mapFor(p); if (!m) return `${p}:?${line1}`;
  // column: try a few
  for (const col of [0, 2, 4, 6, 8, 10, 20, 40]) { const o = originalPositionFor(m, { line: line1, column: col }); if (o.line) return `${p.replace('/src/', '')}:${o.line}`; }
  return `${p}:?${line1}`;
}
const short = (u) => (pathOf(u) || u).replace('/src/', '');
for (const file of files) {
  const prof = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  // ms per sample from timeDeltas
  const ms = new Map();
  prof.samples.forEach((id, i) => { const d = (prof.timeDeltas[i + 1] ?? prof.timeDeltas[i]) / 1000; ms.set(id, (ms.get(id) || 0) + d); });
  const perHit = (n) => (n.hitCount ? (ms.get(n.id) || 0) / n.hitCount : 0);
  const total = [...ms.values()].reduce((a, b) => a + b, 0);
  const isFn = (n, name, f) => n.callFrame.functionName === name && n.callFrame.url.includes(f);
  function roots(name, f) {
    const out = [];
    for (const n of prof.nodes) if (isFn(n, name, f)) { let p = parent.get(n.id), nested = false; while (p) { if (isFn(byId.get(p), name, f)) { nested = true; break; } p = parent.get(p); } if (!nested) out.push(n); }
    return out;
  }
  async function analyse(name, f, label) {
    const rs = roots(name, f);
    const fn = new Map(), line = new Map(), incl = new Map(); let tot = 0;
    const walk = async (n, stack) => {
      const key = `${n.callFrame.functionName || '(anon)'} ${short(n.callFrame.url)}`;
      const self = ms.get(n.id) || 0; tot += self;
      fn.set(key, (fn.get(key) || 0) + self);
      const st = stack.includes(key) ? stack : [...stack, key];
      for (const k of st) incl.set(k, (incl.get(k) || 0) + self);
      if (n.positionTicks && n.hitCount) { const ph = self / n.hitCount; for (const pt of n.positionTicks) { const sl = await srcLine(n.callFrame.url, pt.line); const lk = `${n.callFrame.functionName || '(anon)'} ${sl}`; line.set(lk, (line.get(lk) || 0) + ph * pt.ticks); } }
      for (const c of n.children || []) await walk(byId.get(c), st);
    };
    for (const r of rs) await walk(r, []);
    const pct = (v) => ((100 * v) / tot).toFixed(1).padStart(5) + '%';
    console.log(`\n== ${label}: ${tot.toFixed(0)} ms (${((100 * tot) / total).toFixed(1)}% of the pass), ${rs.length} root nodes`);
    console.log('-- self by function'); for (const [k, v] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(pct(v), v.toFixed(0).padStart(6), 'ms', k);
    console.log('-- inclusive by function (within)'); for (const [k, v] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(pct(v), v.toFixed(0).padStart(6), 'ms', k);
    console.log('-- self by line'); for (const [k, v] of [...line].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(pct(v), v.toFixed(0).padStart(6), 'ms', k);
  }
  console.log(`\n######## ${file.split(/[\/]/).pop()}  total ${total.toFixed(0)} ms`);
  await analyse('sumWaves', 'setWaveModel', 'inside sumWaves');
  await analyse('waterAt', 'ride/water', 'inside waterAt');
}
await server.close();
