// womb-retune Task 4: the Conditions screen (its DOM panel over the lookout) at 1080p, at the first preset and after
// stepping the preset row on `--steps` presets, with the swell row's words printed. Whole-window capture (capturePage), not
// captureFrame (the canvas alone). npx electron tools/_captureConditions.mjs --base=http://localhost:5189/ --out=<prefix> [--steps=1]
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5189/'), out = arg('out'), steps = Number(arg('steps', '1'));
mkdirSync(dirname(out), { recursive: true });
app.setPath('userData', join(tmpdir(), 'ld-capture-conditions'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (win, keyCode) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await sleep(400); };
const swellText = (win) => win.webContents.executeJavaScript(`[...document.querySelectorAll('*')].map((e) => e.childElementCount === 0 ? e.textContent : '').filter((t) => /ft · .*s/.test(t) && t.length < 80).join(' | ')`);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 400; i++) { if (await win.webContents.executeJavaScript(`document.documentElement.dataset.ldLoading === 'done'`)) break; await sleep(1000); }
  await win.webContents.executeJavaScript(`window.liquidDreams.frontEndGoTo('conditions')`);
  await sleep(8000);
  writeFileSync(`${out}-preset.png`, (await win.webContents.capturePage()).toPNG());
  console.log('preset:', await swellText(win));
  // The preset row has the focus: right `steps` presets (the next is Big winter swell, the Big band).
  win.focus(); win.webContents.focus();
  await key(win, 'Shift'); // the first key wakes the sound
  for (let i = 0; i < steps; i++) await key(win, 'Right');
  await sleep(4000);
  writeFileSync(`${out}-preset+${steps}.png`, (await win.webContents.capturePage()).toPNG());
  console.log(`preset +${steps}:`, await swellText(win));
  app.quit();
});
