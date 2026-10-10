// Dev tool: npx electron tools/captureMoments.mjs --base=http://localhost:5183/ --out=<prefix> --times=<t1,t2,…> --m=<base64 moment JSON> [--pre=<js>] [--settle=<ms>] [--run] [--size=1920x1080]
//   or     npx electron tools/captureMoments.mjs --base=… --batch=<jobs.json> (a list of { out, times: number[], m: base64 })
// Loads the first moment once (paused at its first time), waits for the game, then for each job and sim time applies the
// moment in the page (App.applyMoment, no reload), runs --pre, lets the frame settle and saves a captureFrame() PNG as
// <prefix>-<t>.png. One Electron process per batch.
// Evidence capture never takes the foreground (whitewater process ruling, 2026-10-11: Andrew works on this machine): the
// window is hidden (a paused moment read back from the renderer is deterministic; frame rate does not matter), never on
// top, never focused. --offscreen: shown but parked off-screen, unfocused, if a hidden window ever reads back blank.
// --focused: the old path (on top, focus stolen per frame), kept only to check a hidden capture against a focused one.
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base'), pre = arg('pre');
const settle = Number(arg('settle') ?? 2500);
// --size (whitewater Task 0): the content size, 1920x1080 by default (was a 1600x900 window).
const [W, H] = (arg('size') ?? '1920x1080').split('x').map(Number);
// --probe=<js>: an expression evaluated after each frame, printed (e.g. JSON.stringify(window.liquidDreams.bombieBurst)).
const probe = arg('probe');
// --run: unpaused (the frame is taken `settle` ms of sim time later): an underwater eye needs running frames to switch views.
const paused = !process.argv.includes('--run');
const focused = process.argv.includes('--focused'), offscreen = process.argv.includes('--offscreen');
const decode = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
const jobs = arg('batch')
  ? JSON.parse(readFileSync(arg('batch'), 'utf8')).map((j) => ({ out: j.out, times: j.times.map(Number), moment: decode(j.m) }))
  : [{ out: arg('out'), times: arg('times').split(',').map(Number), moment: decode(arg('m')) }];
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// A hidden, locked or covered window makes Chromium stop drawing: keep drawing.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: focused, focusable: focused, skipTaskbar: !focused,
    ...(offscreen ? { x: -W - 200, y: 0 } : {}), webPreferences: { backgroundThrottling: false },
  });
  // The old path: an unfocused window ran ~8x slower, so it stayed on top and took the focus (as _rideProfile does).
  if (focused) win.setAlwaysOnTop(true, 'screen-saver');
  const grab = () => { if (focused) { win.show(); win.moveTop(); app.focus({ steal: true }); win.focus(); } };
  if (offscreen) win.showInactive();
  grab();
  // Stored dev settings would override the code's defaults: start from the defaults.
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  const first = { ...jobs[0].moment, simTime: jobs[0].times[0], paused };
  const b64 = Buffer.from(JSON.stringify(first)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await win.loadURL(`${base}#m=${b64}`);
  for (let i = 0; i < 90; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams')) break; await sleep(1000); }
  await sleep(25000);
  // A capture's applyMoment has no loading cover: ask for the foam map's exact (covered) replay, as a link at boot gets.
  await win.webContents.executeJavaScript('window.liquidDreams.exactFoamReplays = true');
  let lastConditions = JSON.stringify(jobs[0].moment.conditions);
  for (const job of jobs) {
    // New conditions rebuild the field (the worker): give the first frame of a changed moment longer to settle.
    const changed = JSON.stringify(job.moment.conditions) !== lastConditions;
    lastConditions = JSON.stringify(job.moment.conditions);
    for (const [ti, t] of job.times.entries()) {
      grab();
      const m = { conditions: job.moment.conditions, camera: job.moment.camera, simTime: t, paused };
      await win.webContents.executeJavaScript(`window.liquidDreams.applyMoment(${JSON.stringify(m)})`);
      if (pre) await win.webContents.executeJavaScript(pre);
      await sleep(changed && ti === 0 ? Math.max(settle, 15000) : settle);
      const png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
      writeFileSync(`${job.out}-${t.toFixed(2)}.png`, Buffer.from(png, 'base64'));
      console.log('saved', job.out.split(/[\\/]/).pop(), t);
      if (probe) console.log('probe', t, await win.webContents.executeJavaScript(probe));
    }
  }
  app.quit();
});
