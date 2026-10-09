// Scratch: frames of the ride's wave from the channel, looking back up the line at the peak, every second as it breaks.
// npx electron tools/_peelShots.mjs --out=<prefix> [--base=http://localhost:5189/] [--cond=<json>] [--peel=1.7]
import { app } from 'electron';
import { quietWindow } from './quietWindow.mjs';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/', out = arg('out') ?? 'peel-';
const cond = arg('cond') ? JSON.parse(arg('cond')) : null;
const peel = arg('peel') ? Number(arg('peel')) : null;
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = quietWindow({ width: 1600, height: 900, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off');
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(10000);
  const arr = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('#loading')?.remove();
    const a = window.liquidDreams, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const cond = ${JSON.stringify(cond)}, peel = ${JSON.stringify(peel)};
    if (cond) {
      const before = a.field;
      const c = JSON.parse(JSON.stringify(a.conditions));
      for (const [k, v] of Object.entries(cond)) c[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v;
      a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: a.clock.simTime, paused: false });
      for (let i = 0; i < 240 && (a.field === before || !a.field); i++) await wait(500);
      await wait(2000);
    }
    if (peel !== null && peel !== a.breakParams.peel) {
      const before = a.field;
      a.breakParams.peel = peel;
      a.requestFieldIfNeeded(true);
      for (let i = 0; i < 240 && a.field === before; i++) await wait(500);
      await wait(1000);
    }
    a.setPaused(true);
    a.toggleRide();
    const arr = a.rideSet[a.rideWave];
    a.toggleRide();
    // In the channel down the line, looking back up it at the peak.
    const p = [70, 8, -150], yaw = Math.atan2(0 - p[0], -(0 - p[2])) * 180 / Math.PI;
    a.rig.setPose({ mode: 'free', position: p, yawDeg: (yaw + 360) % 360, pitchDeg: -4 });
    return arr;
  })()`);
  for (let s = -1; s <= 9; s++) {
    await win.webContents.executeJavaScript(`window.liquidDreams.clock.setTime(${arr + s})`);
    await sleep(900);
    let png = '';
    for (let k = 0; k < 3; k++) {
      png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
      await sleep(250);
    }
    writeFileSync(`${out}${s >= 0 ? '+' : ''}${s}.png`, Buffer.from(png, 'base64'));
  }
  console.log('arr', arr);
  app.quit();
});
