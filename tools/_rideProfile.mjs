// Profiles the frame loop in cam mode, then on the board (CPU profile via CDP + rAF frame times).
// npx electron <this file> [--base=http://localhost:5173/] [--query=coast=off] [--ft=6] [--experience=intermediate] [--out=<prefix>] [--sim-t=<s>] [--stall] [--trace]
// The window stays on top and focused (an unfocused run is ~8x slower); the first line says whether it was.
// --sim-t (ride-framerate Task 14): the sim time the conditions are applied at, the cam pass starts at (once the field is
// built) and, 6 s later, the set is called from, so two runs ride the same moment of the same wave. Unset: the page's own.
// The bot (Task 15) keys its pop-up, Space release and steering to sim time (the clock and the board's own phaseT), not
// real time, so its inputs land at the same moments of the ride at every frame rate. It reads the board once per frame
// (after the game's step), so an input still lands on a frame boundary.
// --stall (ride-stall Task 2): the page's frame log on and GPUDevice creation hooks, saved per pass as <prefix>frames-*.json
// and <prefix>creates-*.json. --trace: Electron content tracing of the paddling and riding passes, one <prefix>ride.trace.json.
import { app, contentTracing } from 'electron';
import { quietWindow } from './quietWindow.mjs';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', out = arg('out') ?? 'prof-';
const ft = Number(arg('ft') ?? 6), experience = arg('experience') ?? 'intermediate';
const simT = arg('sim-t') === undefined ? null : Number(arg('sim-t'));
const stall = process.argv.includes('--stall'), trace = process.argv.includes('--trace');
const CAM_S = 6;
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarise(profile, label) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/src\//, 'src/').replace(/^.*\/node_modules\//, 'nm/')}:${f.lineNumber + 1}`; };
  const self = new Map(), incl = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] ?? 0; total += dt;
    const n = byId.get(profile.samples[i]); if (!n) continue;
    const k = key(n); self.set(k, (self.get(k) ?? 0) + dt);
    const seen = new Set(); let id = n.id;
    while (id !== undefined) { const kk = key(byId.get(id)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + dt); } id = parent.get(id); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(100 * v / total).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
  return [`== ${label}: ${(total / 1000).toFixed(0)} ms sampled`, '-- self time', ...top(self, 30), '-- inclusive', ...top(incl, 40)].join('\n');
}

app.whenReady().then(async () => {
  const win = quietWindow({ width: 1600, height: 900, webPreferences: { backgroundThrottling: false } });
  // Unfocused, Windows runs this process ~8x slower (Task 14: cam ~35 ms not 4.4, riding ~500 ms not ~50, the same sim
  // time and place): keep the window on top and focused, and say in the report whether it was.
  win.setAlwaysOnTop(true, 'screen-saver');
  const grab = () => { win.show(); win.moveTop(); app.focus({ steal: true }); win.focus(); };
  const focusNow = () => `focused ${win.isFocused()}, visible ${win.isVisible()}, minimized ${win.isMinimized()}`;
  grab();
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off' + (arg('query') ? '&' + arg('query') : ''));
  await win.webContents.executeJavaScript(`localStorage.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ takeoffSlowMo: 'off', experience: '${experience}' }))`);
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(12000);
  await win.webContents.executeJavaScript(`(async () => {
    const a = window.liquidDreams, before = a.field, c = JSON.parse(JSON.stringify(a.conditions));
    c.swell = { ...c.swell, sizeFt: ${ft}, periodS: 15, directionDeg: 225 }; c.tideM = 0;
    a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: ${simT ?? 'a.clock.simTime'}, paused: false });
    for (let i = 0; i < 120 && (a.field === before || !a.field); i++) await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 3000));
    document.querySelector('#loading')?.remove();
    a.setPaused(false);
  })()`);
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Profiler.enable');
  await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 });
  // The field's build takes as long as it takes: the clock goes back to the fixed time before the cam pass.
  grab();
  // Draw the rider once (3 s on the board) before the cam pass: the real path builds her 114-115 pipelines and drains
  // the set call's replay under the paddle-out cover; ?frontend=off has no cover, so they landed in the paddling pass.
  await win.webContents.executeJavaScript(`(async () => {
    const a = window.liquidDreams, pose = a.rig.getPose(); a.toggleRide();
    for (let i = 0; i < 180; i++) await new Promise((r) => requestAnimationFrame(r));
    a.toggleRide(); a.rig.setPose(pose, a.conditions.tideM); // stopRide put the camera at the board: the cam pass looks where it did
  })()`);
  grab(); // again: the window can lose the focus in those 3 s
  if (simT !== null) await win.webContents.executeJavaScript(`window.liquidDreams.clock.setTime(${simT})`);
  const focusCam = focusNow();
  const camFrom = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');

  // Frame-time recorder in the page.
  await win.webContents.executeJavaScript(`(() => {
    window.__ft = { on: false, dts: [] }; let last = performance.now();
    const loop = () => { const n = performance.now(); if (window.__ft.on) window.__ft.dts.push(n - last); last = n; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  })()`);
  const frames = async (label) => {
    const dts = await win.webContents.executeJavaScript('window.__ft.dts.slice()');
    const s = dts.slice().sort((a, b) => a - b), mean = dts.reduce((x, y) => x + y, 0) / dts.length;
    return `${label}: ${dts.length} frames, mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(1)} fps), median ${s[s.length >> 1]?.toFixed(1)} ms, p90 ${s[Math.floor(s.length * 0.9)]?.toFixed(1)} ms, max ${s[s.length - 1]?.toFixed(1)} ms`;
  };
  if (stall) await win.webContents.executeJavaScript(`(() => {
    const P = GPUDevice.prototype; window.__creates = [];
    for (const m of ['createRenderPipeline', 'createComputePipeline', 'createShaderModule', 'createBuffer', 'createTexture']) {
      const o = P[m];
      P[m] = function (d) { const size = typeof d?.size === 'number' ? d.size : JSON.stringify(d?.size ?? ''); window.__creates.push([performance.now(), m, d?.label ?? '', size]); return o.call(this, d); };
    }
    window.liquidDreams.frameLog.on = true; window.liquidDreams.frameLog.drain(); window.__creates.length = 0;
  })()`);
  // A pass's log starts empty; the mark ties the page's clock to the trace's (blink.user_timing): _traceStall.mjs reads it.
  const stallBegin = async () => { if (stall) await win.webContents.executeJavaScript("window.liquidDreams.frameLog.drain(); window.__creates.length = 0; performance.mark('ldStall:' + performance.now())"); };
  const saveStall = async (label) => {
    if (!stall) return;
    const frames = await win.webContents.executeJavaScript('window.liquidDreams.frameLog.drain()');
    const creates = await win.webContents.executeJavaScript('window.__creates.splice(0)');
    writeFileSync(`${out}frames-${label}.json`, JSON.stringify(frames));
    writeFileSync(`${out}creates-${label}.json`, JSON.stringify(creates));
  };
  const traceStart = async () => { if (trace) await contentTracing.startRecording({ included_categories: ['toplevel', 'gpu', 'viz', 'cc', 'disabled-by-default-gpu.dawn', 'blink.user_timing'], excluded_categories: ['*'] }); };
  const traceStop = async (label) => { if (trace) await contentTracing.stopRecording(`${out}${label}.trace.json`); };

  // A: cam mode, 6 s.
  // The frame stats start after Profiler.start returns: its own 160-310 ms renderer task was frame #1 of every pass.
  await dbg.sendCommand('Profiler.start');
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await stallBegin();
  await sleep(CAM_S * 1000);
  const pa = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const fa = await frames('cam mode');
  await saveStall('cam');

  // Ride: the bot (W from 3 s before arrival, Space 0.4 s of sim time after caught, A from phaseT 0.25 on the ride).
  if (simT !== null) await win.webContents.executeJavaScript(`window.liquidDreams.clock.setTime(${simT + CAM_S})`);
  const callFrom = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  await win.webContents.executeJavaScript(`(() => {
    const a = window.liquidDreams; if (!a.ride.active) a.toggleRide();
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(-1).toLowerCase() }));
    let paddling = false, caughtSim = null, popped = false, spaceUp = false, left = false;
    window.__ride = { phase: 'wait', caught: false };
    const loop = () => {
      const b = a.ride.body; if (!b) { window.__ride.phase = 'ended'; return; }
      const sim = a.clock.simTime;
      if (!paddling && sim > a.rideArriveS - 3) { key('keydown', 'KeyW'); paddling = true; }
      if (b.caught && caughtSim === null) { caughtSim = sim; }
      if (popped && !spaceUp) { key('keyup', 'Space'); spaceUp = true; }
      if (!popped && caughtSim !== null && sim > caughtSim + 0.4) { key('keydown', 'Space'); key('keyup', 'KeyW'); popped = true; }
      if (b.phase === 'ride' && !left && b.phaseT > 0.25) { key('keydown', 'KeyA'); left = true; }
      const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI, off = ((b.headingDeg - travel + 540) % 360) - 180;
      if (left) { if (off < -65) key('keyup', 'KeyA'); else if (off > -55) key('keydown', 'KeyA'); }
      window.__ride = { phase: b.phase, caught: b.caught, popped, caughtSim };
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  const arrive = await win.webContents.executeJavaScript('window.liquidDreams.rideArriveS');
  // B: from the paddle (ride active, in the water) for 6 s.
  await sleep(500);
  // One trace covers the paddling and riding passes (stopping one writes ~60-100 MB and took ~2 s, which pushed the
  // riding pass past the 6 ft stall's sim time): it starts here and stops after the riding pass's frames are saved.
  await traceStart();
  // The frame stats start after Profiler.start returns: its own 160-310 ms renderer task was frame #1 of every pass.
  await dbg.sendCommand('Profiler.start');
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await stallBegin();
  await sleep(6000);
  const pb = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const fb = await frames('paddling (ride active)');
  await saveStall('paddle');
  // C: wait for the ride phase, then 6 s standing.
  for (let i = 0; i < 600; i++) { const r = await win.webContents.executeJavaScript('window.__ride'); if (r.phase === 'ride' || r.phase === 'bail' || r.phase === 'ended') break; await sleep(100); }
  const r0 = await win.webContents.executeJavaScript('window.__ride');
  grab();
  const focusRide = focusNow();
  const rideStart = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  // The frame stats start after Profiler.start returns: its own 160-310 ms renderer task was frame #1 of every pass.
  await dbg.sendCommand('Profiler.start');
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await stallBegin();
  await sleep(5000);
  const pc = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const r1 = await win.webContents.executeJavaScript('window.__ride');
  const fc = await frames(`riding (phase ${r0.phase} -> ${r1.phase})`);
  await saveStall('ride');
  const rideFrom = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  const where = await win.webContents.executeJavaScript(`(() => { const b = window.liquidDreams.ride.body; return b ? b.x.toFixed(1) + ', ' + b.z.toFixed(1) : 'none'; })()`);
  // Before the trace stops: writing it took the focus (3 of 4 traced runs read minimized after it).
  const focusEnd = focusNow();
  await traceStop('ride');

  const times = `# sim-t ${simT ?? "unset (the page's own)"}: cam from ${camFrom.toFixed(2)} s, set called from ${callFrom.toFixed(2)} s, ride arrives ${arrive.toFixed(2)} s, caught ${r1.caughtSim?.toFixed(2) ?? 'never'} s, riding pass ${rideStart.toFixed(2)}–${rideFrom.toFixed(2)} s${r0.phase === 'ride' ? '' : ` (riding pass began in phase ${r0.phase})`} ending at x, z ${where} (${ft} ft, ${experience}); window at cam: ${focusCam}; at riding: ${focusRide}; at the end: ${focusEnd}; recorder after Profiler.start`;
  const report = [times, `# stall log ${stall ? 'on' : 'off'}, trace ${trace ? 'on' : 'off'}`, fa, fb, fc, '', summarise(pa, 'cam mode'), '', summarise(pb, 'paddling'), '', summarise(pc, 'riding')].join('\n');
  writeFileSync(out + 'report.txt', report);
  writeFileSync(out + 'cam.cpuprofile', JSON.stringify(pa));
  writeFileSync(out + 'paddle.cpuprofile', JSON.stringify(pb));
  writeFileSync(out + 'ride.cpuprofile', JSON.stringify(pc));
  console.log(report);
  app.quit();
});
