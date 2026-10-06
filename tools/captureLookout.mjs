// Dev tool (lookout backdrop spec, Testing): npx electron tools/captureLookout.mjs --base=http://localhost:5180/ --out=<prefix> [--size=1920x1080] [--only=<case>]
// Opens the game on Conditions; for each case sets the weather, time and wind, waits, saves a captureFrame() PNG, then a
// second frame 0.5 s later (<prefix>-<case>-b.png), so a short Python pass can check the sand holds still and the shrubs move.
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5180/'), out = arg('out'), only = arg('only');
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
mkdirSync(dirname(out), { recursive: true });
// Andrew's own game window holds the default profile: use a scratch one, or the shader cache fails.
app.setPath('userData', join(tmpdir(), 'ld-capture-lookout'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sky = (lowCover, convection, lowBaseM, midCover, highCover, rain, storm, visibilityKm, fogTopM, windAloftDeg, windAloftMs) =>
  ({ lowCover, convection, lowBaseM, midCover, highCover, rain, storm, visibilityKm, fogTopM, windAloftDeg, windAloftMs });
const SKY = {
  clear: sky(0, 0.4, 1000, 0, 0, 0, 0, 60, 1500, 270, 10),
  grey: sky(1, 0.15, 450, 0.5, 0.2, 0, 0, 20, 1500, 280, 12),
  storm: sky(0.95, 1, 500, 0, 0.4, 1, 1, 8, 1500, 300, 22),
};
const KN = 1 / 1.943844;
// [name, time of day, sky, wind kn, wind from °]
const CASES = [
  ['clear-morning-light-offshore', 9.5, 'clear', 8, 90],
  ['clear-morning-calm', 9.5, 'clear', 1, 90],
  ['grey-light-offshore', 11, 'grey', 8, 90],
  ['late-arvo-strong-onshore', 16.8, 'clear', 22, 270],
  ['storm-strong-onshore', 13, 'storm', 28, 270],
  ['night-calm', 21.5, 'clear', 1, 90],
].filter((c) => !only || c[0] === only);
const grab = (win) => win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`).then((s) => Buffer.from(s, 'base64'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 300; i++) {
    if (await win.webContents.executeJavaScript(`document.documentElement.dataset.ldLoading === 'done'`)) break;
    await sleep(1000);
  }
  await win.webContents.executeJavaScript(`window.liquidDreams.frontEndGoTo('conditions')`);
  for (const [name, tod, s, kn, from] of CASES) {
    await win.webContents.executeJavaScript(`(() => { const h = window.liquidDreams.frontEndHost(), c = h.baseConditions();
      h.applyConditions({ ...c, timeOfDay: ${tod}, weather: ${JSON.stringify(SKY[s])}, wind: { speedMs: ${kn * KN}, directionDeg: ${from} } }); })()`);
    await sleep(12000); // a weather change builds its sky and the exposure adapts over several seconds
    const a = await grab(win);
    await sleep(500);
    const b = await grab(win);
    writeFileSync(`${out}-${name}.png`, a);
    writeFileSync(`${out}-${name}-b.png`, b);
    console.log('saved', name);
  }
  app.quit();
});
