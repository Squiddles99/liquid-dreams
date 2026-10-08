// Scratch: rides the set's wave live (the real frame loop: slow-mo, takeoff camera), a key-pressing bot (W from 3 s before
// the crest reaches the take-off spot, App.rideArriveS (R1 §3), Space 0.4 s real after "caught", then A to go left), and
// saves frames at the takeoff's moments.
// npx electron tools/_takeoffLive.mjs [--base=http://localhost:5188/] [--out=<prefix>] [--slow=full|gentle|off] [--ft=7]
//   [--experience=beginner|intermediate|expert] (the front setting, default intermediate) [--until=<sim s after the peak, default 12>]
//   [--pop=<real s after caught before Space, default 0.4>]
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', out = arg('out') ?? 'takeoff-', slow = arg('slow') ?? 'full', aim = Number(arg('aim') ?? 60);
const ft = arg('ft') ? Number(arg('ft')) : null;
const experience = arg('experience') ?? 'intermediate', until = Number(arg('until') ?? 12), pop = Number(arg('pop') ?? 0.4);
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off');
  await win.webContents.executeJavaScript(`localStorage.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ takeoffSlowMo: '${slow}', experience: '${experience}' }))`);
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  // R3 §4: the nearest station's settle span (breaking.settleSpan), to name a bail a closeout (tb ≥ settle) or not.
  await win.webContents.executeJavaScript(`(async () => { const a = window.liquidDreams; try { const B = await import('/src/breaker/breaking.ts'); window.__settle = (H) => B.settleSpan(H, a.breakParams); } catch { window.__settle = () => NaN; } })()`);
  await sleep(12000);
  if (ft !== null) await win.webContents.executeJavaScript(`(async () => {
    const a = window.liquidDreams, before = a.field, c = JSON.parse(JSON.stringify(a.conditions));
    c.swell = { ...c.swell, sizeFt: ${ft}, periodS: 15, directionDeg: 225 }; c.tideM = 0;
    a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: a.clock.simTime, paused: false });
    for (let i = 0; i < 120 && (a.field === before || !a.field); i++) await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => setTimeout(r, 3000));
  })()`);
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#loading')?.remove();
    window.__aim = ${aim};
    window.__until = ${until};
    const a = window.liquidDreams;
    a.setPaused(false);
    if (!a.ride.active) a.toggleRide();
    const arr = a.rideSet[a.rideWave], key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(-1).toLowerCase() }));
    const log = [], snaps = [];
    let paddling = false, caughtReal = null, popped = false, left = false, camWas = null, t0 = performance.now();
    const loop = () => {
      const b = a.ride.body; if (!b) return;
      const sim = a.clock.simTime - arr, real = (performance.now() - t0) / 1000;
      if (!paddling && a.clock.simTime > a.rideArriveS - 3) { key('keydown', 'KeyW'); paddling = true; }
      if (b.caught && caughtReal === null) { caughtReal = real; snaps.push('caught'); }
      if (!popped && caughtReal !== null && real > caughtReal + ${pop}) { key('keydown', 'Space'); setTimeout(() => key('keyup', 'Space'), 50); key('keyup', 'KeyW'); popped = true; snaps.push('popup'); }
      if (b.phase === 'ride' && !left && b.phaseT > 0.25) { key('keydown', 'KeyA'); left = true; snaps.push('turn'); }
      const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI, off = ((b.headingDeg - travel + 540) % 360) - 180;
      const aim = window.__aim ?? 60; if (left) { if (off < -aim - 5) key('keyup', 'KeyA'); else if (off > -aim + 5) key('keydown', 'KeyA'); }
      const cam = a.camera.position, pov = a.ride.camera?.pov ?? 0, take = pov > 0.5;
      if (take !== camWas) { snaps.push(take ? 'cam-pov' : 'cam-chase'); camWas = take; }
      if (b.phase === 'ride' && real - (window.__lastRide ?? -9) > 2) { window.__lastRide = real; snaps.push('ride' + sim.toFixed(1)); }
      if (pov > 0.05 && real - (window.__lastSnap ?? -9) > 0.3) { window.__lastSnap = real; snaps.push('tube' + sim.toFixed(1)); }
      // R3 §4: the water under her (foam, steepness, on a drawn section) and the nearest station's clock beside its settle span.
      let near = null;
      for (const s of a.ribbonStations) { if (s.gap) continue; const dx = (b.water.lx ?? b.x) - s.x, dz = (b.water.lz ?? b.z) - s.z, al = Math.abs(-dx * s.nz + dz * s.nx); if (!near || al < near.al) near = { al, ah: dx * s.nx + dz * s.nz, tb: s.tb, until: s.until, wait: s.wait, H: s.H, psi: s.psi, A: s.section.A, settle: window.__settle(s.H) }; }
      const w = b.water, steep = Math.hypot(w.slopeX, w.slopeZ), n2 = (v) => (v === null || v === undefined ? null : +v.toFixed(2));
      log.push({ real: +real.toFixed(2), sim: +sim.toFixed(2), scale: +(a.clock.scale ?? 1).toFixed(2), phase: b.phase, caught: b.caught, y: +b.y.toFixed(2), cam: [+(cam.x - b.x).toFixed(1), +(cam.y - b.y).toFixed(1), +(cam.z - b.z).toFixed(1)], take, cover: +a.rideCover.toFixed(2), pov: +pov.toFixed(2), lens: +a.tubeLensWet.toFixed(2), foam: +w.foam.toFixed(2), steep: +steep.toFixed(2), sec: !!w.onSection, near: near && { al: +near.al.toFixed(1), ah: +near.ah.toFixed(1), tb: n2(near.tb), until: n2(near.until), H: +near.H.toFixed(1), psi: +near.psi.toFixed(3), A: +near.A.toFixed(2), settle: +near.settle.toFixed(2) }, head: Math.round(b.headingDeg), v: +Math.hypot(b.vx, b.vz).toFixed(1) });
      if (b.phase === 'bail' && !window.__bailed) {
        // The R2 capture bot's wipeout trace line (captureRide.mjs), and a frame of the bail.
        window.__bailed = true; snaps.push('bail' + sim.toFixed(1));
        const f2 = (v) => (v === null || v === undefined ? String(v) : (+v).toFixed(2));
        log.push({ bailTrace: '[foam=' + f2(w.foam) + ' steep=' + f2(steep) + ' sec=' + !!w.onSection + (near ? ' al=' + f2(near.al) + ' tb=' + f2(near.tb) + ' until=' + f2(near.until) + ' wait=' + f2(near.wait) + ' A=' + f2(near.A) + ' H=' + f2(near.H) + ' settle=' + f2(near.settle) : ' no-station') + ']' });
      }
      if (sim < (window.__until ?? 12) && b.phase !== 'bail') requestAnimationFrame(loop); else window.__done = true;
    };
    window.__live = { log, snaps };
    requestAnimationFrame(loop);
  })()`);
  let taken = 0, n = 0;
  while (!(await win.webContents.executeJavaScript('!!window.__done'))) {
    const snaps = await win.webContents.executeJavaScript('window.__live.snaps.slice()');
    if (snaps.length > taken) {
      const name = snaps[snaps.length - 1];
      taken = snaps.length;
      const png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
      writeFileSync(`${out}${++n}-${name}.png`, Buffer.from(png, 'base64'));
    }
    await sleep(30);
  }
  // The loop can finish on the frame that asked for a snap (the bail): take it now.
  const left = await win.webContents.executeJavaScript('window.__live.snaps.slice()');
  if (left.length > taken) {
    const png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
    writeFileSync(`${out}${++n}-${left[left.length - 1]}.png`, Buffer.from(png, 'base64'));
  }
  const live = await win.webContents.executeJavaScript('window.__live');
  console.log('snaps', live.snaps.join(', '));
  const L = live.log;
  writeFileSync(out + 'log.json', JSON.stringify(L));
  app.quit();
});
