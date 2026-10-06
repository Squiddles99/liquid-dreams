// Scratch: rides the set's wave live (the real frame loop: slow-mo, takeoff camera), a key-pressing bot (W from 4 s before
// the peak, Space 0.4 s real after "caught", then A to go left), and saves frames at the takeoff's moments.
// npx electron tools/_takeoffLive.mjs [--base=http://localhost:5188/] [--out=<prefix>] [--slow=full|gentle|off]
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', out = arg('out') ?? 'takeoff-', slow = arg('slow') ?? 'full', aim = Number(arg('aim') ?? 60);
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
  await win.webContents.executeJavaScript(`localStorage.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ takeoffSlowMo: '${slow}' }))`);
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(12000);
  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#loading')?.remove();
    window.__aim = ${aim};
    const a = window.liquidDreams;
    a.setPaused(false);
    if (!a.ride.active) a.toggleRide();
    const arr = a.rideSet[a.rideWave], key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(-1).toLowerCase() }));
    const log = [], snaps = [];
    let paddling = false, caughtReal = null, popped = false, left = false, camWas = null, t0 = performance.now();
    const loop = () => {
      const b = a.ride.body; if (!b) return;
      const sim = a.clock.simTime - arr, real = (performance.now() - t0) / 1000;
      if (!paddling && sim > -4) { key('keydown', 'KeyW'); paddling = true; }
      if (b.caught && caughtReal === null) { caughtReal = real; snaps.push('caught'); }
      if (!popped && caughtReal !== null && real > caughtReal + 0.4) { key('keydown', 'Space'); setTimeout(() => key('keyup', 'Space'), 50); key('keyup', 'KeyW'); popped = true; snaps.push('popup'); }
      if (b.phase === 'ride' && !left && b.phaseT > 0.25) { key('keydown', 'KeyA'); left = true; snaps.push('turn'); }
      const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI, off = ((b.headingDeg - travel + 540) % 360) - 180;
      const aim = window.__aim ?? 60; if (left) { if (off < -aim - 5) key('keyup', 'KeyA'); else if (off > -aim + 5) key('keydown', 'KeyA'); }
      const cam = a.camera.position, pov = a.ride.camera?.pov ?? 0, take = pov > 0.5;
      if (take !== camWas) { snaps.push(take ? 'cam-pov' : 'cam-chase'); camWas = take; }
      if (b.phase === 'ride' && real - (window.__lastRide ?? -9) > 2) { window.__lastRide = real; snaps.push('ride' + sim.toFixed(1)); }
      if (pov > 0.05 && real - (window.__lastSnap ?? -9) > 0.3) { window.__lastSnap = real; snaps.push('tube' + sim.toFixed(1)); }
      let near = null;
      for (const s of a.ribbonStations) { if (s.gap) continue; const dx = (b.water.lx ?? b.x) - s.x, dz = (b.water.lz ?? b.z) - s.z, al = Math.abs(-dx * s.nz + dz * s.nx); if (!near || al < near.al) near = { al, ah: dx * s.nx + dz * s.nz, tb: s.tb, H: s.H, psi: s.psi }; }
      log.push({ real: +real.toFixed(2), sim: +sim.toFixed(2), scale: +(a.clock.scale ?? 1).toFixed(2), phase: b.phase, caught: b.caught, y: +b.y.toFixed(2), cam: [+(cam.x - b.x).toFixed(1), +(cam.y - b.y).toFixed(1), +(cam.z - b.z).toFixed(1)], take, cover: +a.rideCover.toFixed(2), pov: +pov.toFixed(2), lens: +a.tubeLensWet.toFixed(2), near: near && { al: +near.al.toFixed(1), ah: +near.ah.toFixed(1), tb: near.tb === null ? null : +near.tb.toFixed(2), H: +near.H.toFixed(1), psi: +near.psi.toFixed(3) }, head: Math.round(b.headingDeg), v: +Math.hypot(b.vx, b.vz).toFixed(1) });
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
  const live = await win.webContents.executeJavaScript('window.__live');
  console.log('snaps', live.snaps.join(', '));
  const L = live.log;
  writeFileSync(out + 'log.json', JSON.stringify(L));
  app.quit();
});
