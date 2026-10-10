// tools/captureLibrary.mjs: 1080p captures for the Library (build 2). Modes:
//   --mode=chart  the bare surf chart (the map's UI hidden), the backdrop for the mock
//   --mode=mock   the mock (docs/superpowers/mockups/library-codex/library-1080.html) in each state
//   --mode=game   the real Library (Task 7)
// Usage: npx electron tools/captureLibrary.mjs --base=http://localhost:5173/ --mode=chart
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5173/'), mode = arg('mode', 'game'), out = 'docs/superpowers/evidence/library';
mkdirSync(out, { recursive: true });
app.setPath('userData', join(tmpdir(), 'ld-capture-library'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  // A true 1920×1080 page at dpr 1 on a scaled display (as tools/captureHub.mjs).
  const dpr = screen.getPrimaryDisplay().scaleFactor;
  const win = new BrowserWindow({ width: Math.round(1920 / dpr), height: Math.round(1080 / dpr), useContentSize: true, show: true, webPreferences: { backgroundThrottling: false, zoomFactor: 1 / dpr } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  const js = (s) => win.webContents.executeJavaScript(s);
  const shoot = async (name, wait = 1500) => { await sleep(wait); writeFileSync(join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG()); console.log('saved', name); };
  const boot = async () => {
    await win.loadURL(base);
    for (let i = 0; i < 300; i++) { if (await js(`document.documentElement.dataset.ldLoading === 'done'`)) break; await sleep(1000); }
    await js(`window.liquidDreams.titleSurf()`);
    await sleep(2500);
  };
  if (mode === 'chart') {
    await boot();
    await js(`(() => { const s = document.createElement('style'); s.textContent = '.fe-map > :not(.fe-chart), .fe-legend { visibility: hidden !important; }'; document.head.appendChild(s); })()`);
    await shoot('chart-bare');
  } else if (mode === 'mock') {
    for (const state of ['grid', 'noongar', 'open', 'text200', 'open200']) {
      await win.loadURL(`${base}docs/superpowers/mockups/library-codex/library-1080.html?s=${state}#${state}`);
      await shoot(`mock-${state}`, 2000);
    }
  }
  app.quit();
});
