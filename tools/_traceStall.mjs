// Slices >= --min (default 30) ms in a Chrome trace, by process and thread, in time order; with --frames=<frames json>
// the riding frames with dt >= --stall (default 200) ms are printed first, with the slices overlapping each one.
// node tools/_traceStall.mjs <trace.json> [--frames=<frames-ride.json>] [--creates=<creates-ride.json>] [--min=30] [--stall=200]
import { readFileSync } from 'node:fs';
import { slices } from '../src/dev/traceSlices.ts';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const min = Number(arg('min', 30)), stallMs = Number(arg('stall', 200));
const trace = JSON.parse(readFileSync(file, 'utf8'));
const all = slices(trace, min);
const events = Array.isArray(trace) ? trace : trace.traceEvents;
const t0 = Math.min(...events.filter((e) => e.ph !== 'M').map((e) => e.ts)) / 1000;
const fmt = (s) => `${s.startMs.toFixed(0).padStart(7)} ms  ${s.durMs.toFixed(0).padStart(5)} ms  ${s.process} / ${s.thread}  ${s.name}  [${s.cat}]`;
const framesFile = arg('frames', null), createsFile = arg('creates', null);
if (framesFile) {
  const frames = JSON.parse(readFileSync(framesFile, 'utf8'));
  const creates = createsFile ? JSON.parse(readFileSync(createsFile, 'utf8')) : [];
  // Trace ts and performance.now() share no origin: align the first frame's t to the trace's first slice window by
  // the profiler's own clock offset, printed so the reader can judge it (the trace starts ~0-50 ms before the pass).
  const offset = frames[0].t - t0;
  console.log(`== frames with dt >= ${stallMs} ms (trace offset ${offset.toFixed(0)} ms assumed: frame t - offset = trace ms)`);
  for (const f of frames) {
    if (f.dt < stallMs) continue;
    const end = f.t - offset, start = end - f.dt;
    console.log(`\nframe at sim ${f.sim.toFixed(2)} s: dt ${f.dt.toFixed(0)} ms, gpu ${f.gpu.toFixed(1)} ms, ticks foam ${f.foam} spray ${f.spray} impact ${f.impact} kelp ${f.kelp}, under ${f.under}, ribbon ${f.ribbon}, pending ${f.pending}`);
    const c = creates.filter((x) => x[0] >= f.t - f.dt && x[0] <= f.t);
    console.log(`   creations in the frame: ${c.length}${c.length ? ' ' + c.map((x) => `${x[1]}(${x[2] || x[3]})`).join(', ') : ''}`);
    for (const s of all) if (s.startMs < end && s.startMs + s.durMs > start) console.log('   ' + fmt(s));
  }
}
console.log(`\n== all slices >= ${min} ms (${all.length})`);
for (const s of all) console.log(fmt(s));
