// One fresh boot to the select screen (one-curl Task 0): when the boot cover dissolves, which pipeline builds are still
// pending, and from which screenshot the water shows.
// npx electron tools/_bootWater.mjs [--base=http://localhost:5174/] [--out=<dir>/boot-] [--after-s=6]
// Writes <out>frames.json (the frame log from the first frame liquidDreams exists), <out>creates.json (GPUDevice
// creations), <out>log.txt ([loading] console lines + the dissolve time) and <out>shot-<ms>.png every 500 ms (ms relative
// to the dissolve; shots from 1 s before it are kept).
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5174/', out = arg('out') ?? 'boot-', afterS = Number(arg('after-s') ?? 6);
mkdirSync(dirname(out + 'x'), { recursive: true });
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page's own world before its scripts (contextIsolation off): the creation hooks, the frame log switched on
// as soon as the app exists, and the cover's dissolve timestamped (the class is-out).
const preload = join(tmpdir(), `ld-bootwater-preload-${process.pid}.cjs`);
writeFileSync(preload, `
  const P = GPUDevice.prototype; window.__creates = [];
  for (const m of ['createRenderPipeline', 'createComputePipeline', 'createRenderPipelineAsync', 'createComputePipelineAsync', 'createShaderModule', 'createTexture']) {
    const o = P[m]; if (!o) continue;
    P[m] = function (d) { window.__creates.push([performance.now(), m, d?.label ?? '']); return o.call(this, d); };
  }
  window.__dissolveAt = null;
  const poll = setInterval(() => {
    const a = window.liquidDreams; if (a && !a.frameLog.on) a.frameLog.on = true;
    const c = document.getElementById('ld-cover');
    if (c && window.__dissolveAt === null && c.classList.contains('is-out')) {
      window.__dissolveAt = performance.now();
      window.__pendingAtDissolve = a ? a.asyncPipelines.inflight() : null;
    }
  }, 5);
`);

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false, contextIsolation: false, preload } });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.show(); win.moveTop(); app.focus({ steal: true }); win.focus();
  const log = [];
  win.webContents.on('console-message', (_e, _lvl, msg) => { if (msg.includes('[loading]')) log.push(msg); });
  await win.webContents.session.clearStorageData();
  const t0 = Date.now();
  await win.loadURL(base);
  // Shots every 500 ms from the start; each keeps its page time so it can be placed against the dissolve.
  const shots = [];
  let dissolveAt = null;
  for (let i = 0; i < 400; i++) {
    const pageT = await win.webContents.executeJavaScript('performance.now()');
    const img = await win.webContents.capturePage();
    shots.push({ pageT, png: img.toPNG() });
    if (shots.length > 6) shots.shift(); // only the last 3 s before the dissolve are kept
    dissolveAt = await win.webContents.executeJavaScript('window.__dissolveAt');
    if (dissolveAt !== null) break;
    await sleep(500);
  }
  const kept = [...shots];
  for (let i = 0; i < afterS * 2; i++) {
    await sleep(500);
    const pageT = await win.webContents.executeJavaScript('performance.now()');
    kept.push({ pageT, png: (await win.webContents.capturePage()).toPNG() });
  }
  for (const s of kept) if (dissolveAt === null || s.pageT >= dissolveAt - 1000) writeFileSync(`${out}shot-${dissolveAt === null ? Math.round(s.pageT) : Math.round(s.pageT - dissolveAt)}.png`, s.png);
  const frames = await win.webContents.executeJavaScript('window.liquidDreams ? window.liquidDreams.frameLog.drain() : []');
  const creates = await win.webContents.executeJavaScript('window.__creates');
  const pending = await win.webContents.executeJavaScript('window.__pendingAtDissolve');
  writeFileSync(`${out}frames.json`, JSON.stringify(frames));
  writeFileSync(`${out}creates.json`, JSON.stringify(creates));
  writeFileSync(`${out}log.txt`, [`wall ${(Date.now() - t0) / 1000} s`, `dissolve at page t ${dissolveAt?.toFixed(0)} ms`, `pending at dissolve: ${JSON.stringify(pending)}`, ...log].join('\n') + '\n');
  try { unlinkSync(preload); } catch { /* gone */ }
  app.exit(0);
});
