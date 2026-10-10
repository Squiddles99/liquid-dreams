// Dev tool: npx electron tools/captureMoments.mjs --base=http://localhost:5183/ --out=<prefix> --times=<t1,t2,…> --m=<base64 moment JSON> [--pre=<js>] [--settle=<ms>] [--run]
// Loads the moment once (paused at the first time), waits for the game, then for each sim time applies the moment in the
// page (App.applyMoment, no reload), runs --pre, lets the frame settle and saves a captureFrame() PNG as <prefix>-<t>.png.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base'), out = arg('out'), pre = arg('pre'), times = arg('times').split(',').map(Number);
const settle = Number(arg('settle') ?? 2500);
// --probe=<js>: an expression evaluated after each frame, printed (e.g. JSON.stringify(window.liquidDreams.bombieBurst)).
const probe = arg('probe');
// --run: unpaused (the frame is taken `settle` ms of sim time later): an underwater eye needs running frames to switch views.
const paused = !process.argv.includes('--run');
const moment = JSON.parse(Buffer.from(arg('m'), 'base64').toString('utf8'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// A locked or covered screen makes Chromium stop drawing the window: keep drawing.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  // Stored dev settings would override the code's defaults: start from the defaults.
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  const first = { ...moment, simTime: times[0], paused };
  const b64 = Buffer.from(JSON.stringify(first)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await win.loadURL(`${base}#m=${b64}`);
  for (let i = 0; i < 90; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams')) break; await sleep(1000); }
  await sleep(25000);
  for (const t of times) {
    const m = { conditions: moment.conditions, camera: moment.camera, simTime: t, paused };
    await win.webContents.executeJavaScript(`window.liquidDreams.applyMoment(${JSON.stringify(m)})`);
    if (pre) await win.webContents.executeJavaScript(pre);
    await sleep(settle);
    const png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
    writeFileSync(`${out}-${t.toFixed(2)}.png`, Buffer.from(png, 'base64'));
    console.log('saved', t);
    if (probe) console.log('probe', t, await win.webContents.executeJavaScript(probe));
  }
  app.quit();
});
