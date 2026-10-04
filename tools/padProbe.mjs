// Dev tool: what a controller actually sends. npx electron tools/padProbe.mjs
// Shows the pad's id and mapping and walks through the buttons (press each one when asked); writes pad-probe.json in the
// repo root with what each press was, so the game can learn a pad that isn't on the standard mapping.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = join(resolve(import.meta.dirname, '..'), 'pad-probe.json');
const ASK = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View (the two squares)', 'Menu (the three lines)', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];

const page = `<!doctype html><meta charset="utf-8"><title>Pad probe</title>
<body style="background:#10171a;color:#f7ecd2;font:22px system-ui;padding:40px">
<h1 style="margin:0 0 16px">Controller probe</h1>
<p id="pad">Press any button on the controller…</p>
<p style="font-size:34px">Press: <b id="ask"></b></p>
<p id="done" style="color:#ffa14f"></p>
<pre id="live" style="font-size:16px;opacity:.7"></pre>
<script>
const ASK = ${JSON.stringify(ASK)};
let i = 0, prev = [], prevAxes = [], result = { id: '', mapping: '', presses: {} };
document.getElementById('ask').textContent = ASK[0];
function loop() {
  const p = [...navigator.getGamepads()].find((g) => g && g.connected);
  if (p) {
    result.id = p.id; result.mapping = p.mapping || '(none)';
    document.getElementById('pad').textContent = p.id + ' — mapping: ' + result.mapping;
    const now = p.buttons.map((b) => b.pressed || b.value > 0.5);
    document.getElementById('live').textContent = 'buttons held: ' + now.map((v, k) => (v ? k : null)).filter((k) => k !== null).join(', ')
      + '\\naxes: ' + p.axes.map((a) => a.toFixed(2)).join('  ');
    if (i < ASK.length) {
      const fresh = now.findIndex((v, k) => v && !prev[k]);
      const axis = p.axes.findIndex((a, k) => Math.abs(a) > 0.6 && !(Math.abs(prevAxes[k] ?? 0) > 0.6));
      if (fresh >= 0 || axis >= 0) {
        result.presses[ASK[i]] = fresh >= 0 ? { button: fresh } : { axis, sign: Math.sign(p.axes[axis]) };
        i++;
        document.getElementById('ask').textContent = i < ASK.length ? ASK[i] : 'all done — you can close this window';
        window.probe(result);
      }
    }
    prev = now; prevAxes = [...p.axes];
  }
  requestAnimationFrame(loop);
}
loop();
</script>`;

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 560, webPreferences: { preload: undefined } });
  win.webContents.on('console-message', () => {});
  win.webContents.on('did-finish-load', async () => {
    await win.webContents.executeJavaScript(`window.probe = (r) => { document.title = 'probe:' + JSON.stringify(r); };`).catch(() => {});
    // --check: print what the page shows and quit (a smoke test without a controller).
    if (process.argv.includes('--check')) {
      setTimeout(async () => { console.log(await win.webContents.executeJavaScript('document.body.innerText').catch((e) => String(e))); app.quit(); }, 1500);
    }
  });
  win.on('page-title-updated', (e, title) => {
    e.preventDefault();
    if (!title.startsWith('probe:')) return;
    writeFileSync(OUT, JSON.stringify(JSON.parse(title.slice(6)), null, 2));
  });
  // A file page (a secure context: the Gamepad API needs one).
  const html = join(tmpdir(), 'liquid-dreams-pad-probe.html');
  writeFileSync(html, page);
  win.loadFile(html);
  win.on('closed', () => app.quit());
});
