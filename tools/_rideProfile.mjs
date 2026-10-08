// Profiles the frame loop in cam mode, then on the board (CPU profile via CDP + rAF frame times).
// npx electron <this file> [--base=http://localhost:5173/] [--ft=6] [--experience=intermediate] [--out=<prefix>] [--sim-t=<s>]
// The window stays on top and focused (an unfocused run is ~8x slower); the first line says whether it was.
// --sim-t (ride-framerate Task 14): the sim time the conditions are applied at, the cam pass starts at (once the field is
// built) and, 6 s later, the set is called from, so two runs ride the same moment of the same wave. Unset: the page's own.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', out = arg('out') ?? 'prof-';
const ft = Number(arg('ft') ?? 6), experience = arg('experience') ?? 'intermediate';
const simT = arg('sim-t') === undefined ? null : Number(arg('sim-t'));
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
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  // Unfocused, Windows runs this process ~8x slower (Task 14: cam ~35 ms not 4.4, riding ~500 ms not ~50, the same sim
  // time and place): keep the window on top and focused, and say in the report whether it was.
  win.setAlwaysOnTop(true, 'screen-saver');
  const grab = () => { win.show(); win.moveTop(); app.focus({ steal: true }); win.focus(); };
  const focusNow = () => `focused ${win.isFocused()}, visible ${win.isVisible()}, minimized ${win.isMinimized()}`;
  grab();
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off');
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

  // A: cam mode, 6 s.
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await dbg.sendCommand('Profiler.start');
  await sleep(CAM_S * 1000);
  const pa = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const fa = await frames('cam mode');

  // Ride: the bot (W from 3 s before arrival, Space 0.4 s after caught, A on the ride).
  if (simT !== null) await win.webContents.executeJavaScript(`window.liquidDreams.clock.setTime(${simT + CAM_S})`);
  const callFrom = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  await win.webContents.executeJavaScript(`(() => {
    const a = window.liquidDreams; if (!a.ride.active) a.toggleRide();
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(-1).toLowerCase() }));
    let paddling = false, caughtReal = null, popped = false, left = false, t0 = performance.now();
    window.__ride = { phase: 'wait', caught: false };
    const loop = () => {
      const b = a.ride.body; if (!b) { window.__ride.phase = 'ended'; return; }
      const real = (performance.now() - t0) / 1000;
      if (!paddling && a.clock.simTime > a.rideArriveS - 3) { key('keydown', 'KeyW'); paddling = true; }
      if (b.caught && caughtReal === null) { caughtReal = real; }
      if (!popped && caughtReal !== null && real > caughtReal + 0.4) { key('keydown', 'Space'); setTimeout(() => key('keyup', 'Space'), 50); key('keyup', 'KeyW'); popped = true; }
      if (b.phase === 'ride' && !left && b.phaseT > 0.25) { key('keydown', 'KeyA'); left = true; }
      const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI, off = ((b.headingDeg - travel + 540) % 360) - 180;
      if (left) { if (off < -65) key('keyup', 'KeyA'); else if (off > -55) key('keydown', 'KeyA'); }
      window.__ride = { phase: b.phase, caught: b.caught, popped };
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`);
  const arrive = await win.webContents.executeJavaScript('window.liquidDreams.rideArriveS');
  // B: from the paddle (ride active, in the water) for 6 s.
  await sleep(500);
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await dbg.sendCommand('Profiler.start');
  await sleep(6000);
  const pb = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const fb = await frames('paddling (ride active)');
  // C: wait for the ride phase, then 6 s standing.
  for (let i = 0; i < 300; i++) { const r = await win.webContents.executeJavaScript('window.__ride'); if (r.phase === 'ride' || r.phase === 'bail' || r.phase === 'ended') break; await sleep(100); }
  const r0 = await win.webContents.executeJavaScript('window.__ride');
  const rideStart = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  await win.webContents.executeJavaScript('window.__ft.dts = []; window.__ft.on = true');
  await dbg.sendCommand('Profiler.start');
  await sleep(5000);
  const pc = (await dbg.sendCommand('Profiler.stop')).profile;
  await win.webContents.executeJavaScript('window.__ft.on = false');
  const r1 = await win.webContents.executeJavaScript('window.__ride');
  const fc = await frames(`riding (phase ${r0.phase} -> ${r1.phase})`);
  const rideFrom = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
  const focusEnd = focusNow();

  const times = `# sim-t ${simT ?? "unset (the page's own)"}: cam from ${camFrom.toFixed(2)} s, set called from ${callFrom.toFixed(2)} s, ride arrives ${arrive.toFixed(2)} s, riding pass ${rideStart.toFixed(2)}–${rideFrom.toFixed(2)} s (${ft} ft, ${experience}); window at cam: ${focusCam}; at the end: ${focusEnd}`;
  const report = [times, fa, fb, fc, '', summarise(pa, 'cam mode'), '', summarise(pb, 'paddling'), '', summarise(pc, 'riding')].join('\n');
  writeFileSync(out + 'report.txt', report);
  writeFileSync(out + 'cam.cpuprofile', JSON.stringify(pa));
  writeFileSync(out + 'paddle.cpuprofile', JSON.stringify(pb));
  writeFileSync(out + 'ride.cpuprofile', JSON.stringify(pc));
  console.log(report);
  app.quit();
});
