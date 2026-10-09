// Slices >= --min (default 30) ms in a Chrome trace, by process and thread, in time order; with --frames=<frames json>
// the riding frames with dt >= --stall (default 200) ms are printed first, with the slices overlapping each one.
// node tools/_traceStall.mjs <trace.json> [--frames=<frames-ride.json>] [--creates=<creates-ride.json>] [--min=30] [--stall=200] [--inner=2]
// Inside each stall frame, the slices >= --inner ms are also summed by process / thread / name (what filled the frame).
import { readFileSync } from 'node:fs';
import { passMarker, slices } from '../src/dev/traceSlices.ts';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const min = Number(arg('min', 30)), stallMs = Number(arg('stall', 200)), innerMs = Number(arg('inner', 2));
const trace = JSON.parse(readFileSync(file, 'utf8'));
const all = slices(trace, min);
const inner = slices(trace, innerMs);
const fmt = (s) => `${s.startMs.toFixed(0).padStart(7)} ms  ${s.durMs.toFixed(0).padStart(5)} ms  ${s.process} / ${s.thread}  ${s.name}  [${s.cat}]`;
const framesFile = arg('frames', null), createsFile = arg('creates', null);
if (framesFile) {
  const frames = JSON.parse(readFileSync(framesFile, 'utf8'));
  const creates = createsFile ? JSON.parse(readFileSync(createsFile, 'utf8')) : [];
  // Trace ts and performance.now() share no origin: the profiler's pass marker ties them (ldStall:<now> at the pass's
  // start); without one, the first frame is taken as the trace's start (approximate: printed so the reader can judge).
  const m = passMarker(trace);
  const offset = m ? m.nowMs - m.traceMs : frames[0].t;
  console.log(`== frames with dt >= ${stallMs} ms (offset ${offset.toFixed(0)} ms ${m ? 'from the pass marker' : 'ASSUMED from the first frame, no marker'}: frame t - offset = trace ms)`);
  for (const f of frames) {
    if (f.dt < stallMs) continue;
    const end = f.t - offset, start = end - f.dt;
    console.log(`\nframe at sim ${f.sim.toFixed(2)} s: dt ${f.dt.toFixed(0)} ms, gpu ${f.gpu.toFixed(1)} ms, ticks foam ${f.foam} spray ${f.spray} impact ${f.impact} kelp ${f.kelp}, under ${f.under}, ribbon ${f.ribbon}, pending ${f.pending}`);
    const c = creates.filter((x) => x[0] >= f.t - f.dt && x[0] <= f.t);
    console.log(`   creations in the frame: ${c.length}${c.length ? ' ' + c.map((x) => `${x[1]}(${x[2] || x[3]})`).join(', ') : ''}`);
    for (const s of all) if (s.startMs < end && s.startMs + s.durMs > start) console.log('   ' + fmt(s));
    // Clipped to the frame: ms of each process / thread / name inside it (nested slices count in each of their names).
    const sum = new Map();
    for (const s of inner) {
      const ms = Math.min(end, s.startMs + s.durMs) - Math.max(start, s.startMs);
      if (ms <= 0) continue;
      const k = `${s.process} / ${s.thread}  ${s.name}`, v = sum.get(k) ?? { ms: 0, n: 0 };
      v.ms += ms; v.n++; sum.set(k, v);
    }
    console.log(`   -- inside the frame (${start.toFixed(0)}..${end.toFixed(0)} trace ms), slices >= ${innerMs} ms summed:`);
    for (const [k, v] of [...sum].sort((x, y) => y[1].ms - x[1].ms).slice(0, 25)) console.log(`   ${v.ms.toFixed(0).padStart(6)} ms ${String(v.n).padStart(4)}x  ${k}`);
  }
}
console.log(`\n== all slices >= ${min} ms (${all.length})`);
for (const s of all) console.log(fmt(s));
