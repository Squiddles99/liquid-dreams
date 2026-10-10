// tools/captureLibrary.mjs: 1080p captures for the Library (build 2). Modes:
//   --mode=chart  the bare surf chart (the map's UI hidden), the backdrop for the mock
//   --mode=mock   the mock (docs/superpowers/mockups/library-codex/library-1080.html) in each state
//   --mode=game   the real Library (Task 7)
// Usage: npx electron tools/captureLibrary.mjs --base=http://localhost:5173/ --mode=chart
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5173/'), mode = arg('mode', 'game'), out = 'docs/superpowers/evidence/library';
mkdirSync(out, { recursive: true });
// The card with the most text (fact + Noongar), by the Library's rules (src/frontend/library.ts): its worst case for fitting.
const CATS = ['flora-', 'sea-flora-', 'sea-fauna-', 'birds-', 'reptiles-', 'marsupials-'];
const cards = JSON.parse(readFileSync('art/loading/cards.json', 'utf8'));
const cats = CATS.map(() => []);
for (const [key, card] of Object.entries(cards)) { if (key.startsWith('_')) continue; const p = [...CATS].sort((a, b) => b.length - a.length).find((x) => key.startsWith(x)); cats[CATS.indexOf(p)].push(card); }
for (const c of cats) c.sort((a, b) => a.name.localeCompare(b.name, 'en'));
const LONGEST = cats.flatMap((c, ci) => c.map((card, ei) => ({ ci, ei, n: card.fact.length + (card.noongar ?? '').length }))).sort((a, b) => b.n - a.n)[0];
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
  } else if (mode === 'game') {
    const act = (a) => js(`window.liquidDreams.frontEnd.act('${a}')`);
    const go = async (cat, entry) => {
      for (let k = 0; k < 3; k++) if ((await js(`window.liquidDreams.frontEnd.state.library.zone`)) !== 'cats') await act('left');
      for (let k = 0; k < 6; k++) await act('up');
      await act('down'); await act('up');                    // resets the tile to 0
      for (let k = 0; k < cat; k++) await act('down');
      await act('right');
      for (let k = 0; k < Math.floor(entry / 3); k++) await act('down');
      for (let k = 0; k < entry % 3; k++) await act('right');
    };
    for (const text of [1, 2]) {
      await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
      await win.loadURL(base);
      await js(`localStorage.setItem('liquid-dreams.front-settings.v1', JSON.stringify({ textScale: ${text} }))`);
      await boot();
      await act('tabPlus');
      const tag = text === 1 ? '' : '-text200';
      if (text === 1) for (let cat = 0; cat < 6; cat++) { await go(cat, 0); await shoot(`lib-cat${cat}`); }
      await go(0, 0); await shoot(`lib-balga${tag}`);                         // a Noongar entry
      await act('confirm'); await shoot(`lib-balga-open${tag}`); await act('back');
      await go(LONGEST.ci, LONGEST.ei); await shoot(`lib-longest${tag}`);
      await act('confirm'); await shoot(`lib-longest-open${tag}`); await act('back');
    }
  }
  app.quit();
});
