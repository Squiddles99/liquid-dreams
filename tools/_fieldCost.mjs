// The field build's cost at boot (lineup-truth Task 2): N fresh boots straight into the water (?frontend=off), each
// timed from load to the first field with its coast, with the worker's [field] lines (coast map, coast eikonal, reef).
// Alternates ?coast=off (the far-field seed, as on main) and the coast, so the two are compared in one session.
// npx electron tools/_fieldCost.mjs [--base=http://localhost:5173/] [--boots=3] [--out=<file>]
import { app } from 'electron';
import { quietWindow } from './quietWindow.mjs';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/', boots = Number(arg('boots') ?? 3), out = arg('out');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const lines = [];
  for (let b = 1; b <= 2 * boots; b++) {
    const coastOff = b % 2 === 1;
    const win = quietWindow({ width: 1600, height: 900, webPreferences: { backgroundThrottling: false } });
    win.setAlwaysOnTop(true, 'screen-saver'); win.focus();
    const log = [];
    win.webContents.on('console-message', (_e, _lvl, msg) => { if (msg.includes('[field]')) log.push(msg); });
    await win.webContents.session.clearStorageData();
    const t0 = Date.now();
    await win.loadURL(base + '?frontend=off' + (coastOff ? '&coast=off' : ''));
    let ms = null, coast = false;
    for (let i = 0; i < 240; i++) {
      const s = await win.webContents.executeJavaScript('(() => { const f = window.liquidDreams?.field; return f ? { coast: !!f.coast } : null; })()');
      if (s) { ms = Date.now() - t0; coast = s.coast; break; }
      await sleep(250);
    }
    await sleep(1500);
    lines.push(`boot ${b} (${coastOff ? 'coast off' : 'coast on '}): first field ${ms} ms after load (coast ${coast}); ${log.join(' | ')}`);
    console.log(lines[lines.length - 1]);
    win.destroy();
    await sleep(1000);
  }
  if (out) writeFileSync(out, lines.join('\n') + '\n');
  app.quit();
});
