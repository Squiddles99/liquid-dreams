// whitewater Task 8: a frame gate's medians from _rideProfile reports, raw and with the paddle-out STALLED runs left out.
// node tools/_frameGate.mjs --main=<report>,… --branch=<report>,…   (or globs expanded by the shell)
import { readFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)?.split(',').filter(Boolean) ?? [];
const read = (f) => {
  const t = readFileSync(f, 'utf8');
  const line = (start) => t.split(/\r?\n/).find((l) => l.startsWith(start)) ?? '';
  const med = (start) => Number(/median ([0-9.]+) ms/.exec(line(start))?.[1]);
  const max = Number(/max ([0-9.]+) ms/.exec(line('paddling'))?.[1] ?? 0);
  return { f, cam: med('cam mode:'), riding: med('riding (phase'), stalled: max > 1000 };
};
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const rows = { main: arg('main').map(read), branch: arg('branch').map(read) };
for (const [k, r] of Object.entries(rows)) {
  console.log(`${k}: riding ${r.map((x) => `${x.riding}${x.stalled ? '*' : ''}`).join(' / ')} (* stalled); cam ${r.map((x) => x.cam).join(' / ')}`);
}
const m = (k, f) => median(rows[k].filter(f).map((x) => x.riding));
const all = () => true, clean = (x) => !x.stalled;
console.log(`riding median raw: main ${m('main', all)}, branch ${m('branch', all)} → ${(m('branch', all) / m('main', all)).toFixed(3)} ×`);
console.log(`riding median no-stall: main ${m('main', clean)}, branch ${m('branch', clean)} → ${(m('branch', clean) / m('main', clean)).toFixed(3)} ×`);
console.log(`cam median: main ${median(rows.main.map((x) => x.cam))}, branch ${median(rows.branch.map((x) => x.cam))}`);
