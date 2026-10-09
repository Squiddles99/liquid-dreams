// lineup-truth Task 5: the lookout (the select screen's Conditions beat) at 6 ft, clear morning, a frame every 10 s for one
// dune set cycle (a set every 120 s), so one frame shows set lines on the shelf.
// npx electron tools/_lookoutSets.mjs --base=http://localhost:5173/ --out=<prefix> [--ft=6] [--frames=14]
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5173/'), out = arg('out'), ft = Number(arg('ft', 6)), frames = Number(arg('frames', 14));
mkdirSync(dirname(out), { recursive: true });
app.setPath('userData', join(tmpdir(), 'ld-capture-lookout-sets'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grab = (win) => win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`).then((s) => Buffer.from(s, 'base64'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 300; i++) {
    if (await win.webContents.executeJavaScript(`document.documentElement.dataset.ldLoading === 'done'`)) break;
    await sleep(1000);
  }
  await win.webContents.executeJavaScript(`window.liquidDreams.frontEndGoTo('conditions')`);
  await win.webContents.executeJavaScript(`(() => { const h = window.liquidDreams.frontEndHost(), c = h.baseConditions();
    h.applyConditions({ ...c, timeOfDay: 9.5, swell: { ...c.swell, sizeFt: ${ft} } }); })()`);
  await sleep(15000);
  for (let i = 0; i < frames; i++) {
    const t = await win.webContents.executeJavaScript('window.liquidDreams.clock.simTime');
    writeFileSync(`${out}-${String(i).padStart(2, '0')}-t${t.toFixed(1)}.png`, await grab(win));
    console.log('saved', i, t.toFixed(1));
    await sleep(10000);
  }
  app.quit();
});
