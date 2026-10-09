// tools/captureHub.mjs: 1080p captures of the title, the map (glassy / offshore / onshore), the panel's On/Fair/Off and
// the details page. Usage: npx electron tools/captureHub.mjs --base=http://localhost:5180/ --out=docs/superpowers/evidence/surf-map-hub/hub
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5180/'), out = arg('out', 'docs/superpowers/evidence/surf-map-hub/hub');
mkdirSync(dirname(out), { recursive: true });
app.setPath('userData', join(tmpdir(), 'ld-capture-hub'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  // A true 1920×1080 page at devicePixelRatio 1 on a scaled Windows display: a window of 1920/dpr × 1080/dpr DIPs zoomed
  // by 1/dpr (a 1920×1080 DIP window would be clamped to the screen and drawn at the display's scale).
  const dpr = screen.getPrimaryDisplay().scaleFactor;
  const win = new BrowserWindow({ width: Math.round(1920 / dpr), height: Math.round(1080 / dpr), useContentSize: true, show: true, webPreferences: { backgroundThrottling: false, zoomFactor: 1 / dpr } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  const js = (s) => win.webContents.executeJavaScript(s);
  const shoot = async (name, wait = 1500) => { await sleep(wait); writeFileSync(`${out}-${name}.png`, (await win.webContents.capturePage()).toPNG()); console.log('saved', name); };
  await shoot('title', 3000);
  for (let i = 0; i < 300; i++) { if (await js(`document.documentElement.dataset.ldLoading === 'done'`)) break; await sleep(1000); }
  // Surf: the title's own press path (as a player would), then the map under it.
  await js(`window.liquidDreams.titleSurf()`);
  await shoot('map-forecast', 2500);
  const act = (a) => js(`window.liquidDreams.frontEnd.act('${a}')`);
  // The custom setup: Mid tide, 7 ft @ 15 s from the WSW; wind 0 glassy, 1 light offshore, 5 onshore.
  await act('toggle');
  const custom = async (name, patch) => {
    await js(`(() => { const c = window.liquidDreams.frontEnd.core; c.s = { ...c.s, setup: { ...c.s.setup, month: 6, swellFt: 7, periodS: 15, fromDeg: 247, tide: 2, ...${JSON.stringify(patch)} } }; })()`);
    await shoot(name);
  };
  await custom('map-custom-glassy', { wind: 0 });
  await custom('map-custom-offshore', { wind: 1 });
  await custom('map-custom-onshore', { wind: 5 });
  await custom('map-custom-off', { wind: 5, swellFt: 2.5, periodS: 11 });
  await custom('map-custom-offshore', { wind: 1 }); // the details page reads the panel's conditions: back to On
  await act('details');
  await shoot('details');
  await act('down');
  await act('down');
  await shoot('details-scrolled');
  app.quit();
});
