// Dev tool (painted riders spec, testing): npx electron tools/captureRiders.mjs --base=http://localhost:5180/ --out=<prefix> [--size=1920x1080]
// Opens the game, goes to Choose your rider and shoots each rider (the whole window, menus and all), then Grab your gear's
// Outfit tab and shoots every outfit of the last rider focused.
import { app } from 'electron';
import { quietWindow } from './quietWindow.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base', 'http://localhost:5180/'), out = arg('out'), rider = arg('rider', 'female');
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
mkdirSync(dirname(out), { recursive: true });
app.setPath('userData', join(tmpdir(), 'ld-capture-riders'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = quietWindow({ width: W, height: H, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 300; i++) {
    if (await win.webContents.executeJavaScript(`document.documentElement.dataset.ldLoading === 'done'`)) break;
    await sleep(1000);
  }
  const js = (s) => win.webContents.executeJavaScript(s);
  const shoot = async (name) => { await sleep(1500); writeFileSync(`${out}-${name}.png`, (await win.webContents.capturePage()).toPNG()); console.log('saved', name); };
  const state = () => js(`(() => { const s = window.liquidDreams.frontEnd.state; return { beat: s.beat, rider: s.rider, tab: s.gearTab, focus: s.gearFocus }; })()`);
  await js(`window.liquidDreams.frontEndGoTo('rider')`);
  await sleep(4000);
  for (let k = 0; k < 3; k++) {
    const s = await state();
    await shoot(`rider-${s.rider}`);
    await js(`window.liquidDreams.frontEnd.act('right')`);
  }
  for (let k = 0; k < 3 && (await state()).rider !== rider; k++) await js(`window.liquidDreams.frontEnd.act('right')`);
  await js(`window.liquidDreams.frontEndGoTo('gear')`);
  for (let k = 0; k < 3 && (await state()).tab !== 'outfit'; k++) { await js(`window.liquidDreams.frontEnd.act('tabPlus')`); await sleep(300); }
  for (let k = 0; k < 7; k++) {
    const s = await state();
    await shoot(`gear-${s.rider}-${k}`);
    await js(`window.liquidDreams.frontEnd.act('down')`);
  }
  app.quit();
});
