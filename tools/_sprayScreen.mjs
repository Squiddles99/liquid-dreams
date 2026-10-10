// whitewater 7b (S1): what of the spray pool SHOWS on screen. For each sim time: the frame with the spray pool and without
// it (impact pool kept), diffed; pixels that change by more than --tol (of 255, any channel) are where the spray is
// visible. The crest line and the line one H above it are projected through the game's camera at the throwing section
// (App.emittersAt's spray emitters over the last second: their highest tip, their mean xz), so the visible top is printed
// in metres and in H above the crest line, with the width of the visible fan above it.
// npx electron tools/_sprayScreen.mjs --base=http://localhost:5174/ --m=<moment b64> --times=403.67 --hm=6.77 [--tol=10] [--out=<prefix>] [--settle=2500]
import { app, BrowserWindow, nativeImage } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base'), times = arg('times').split(',').map(Number), Hm = Number(arg('hm')), tol = Number(arg('tol') ?? 10);
const out = arg('out'), settle = Number(arg('settle') ?? 2500);
const moment = JSON.parse(Buffer.from(arg('m'), 'base64').toString('utf8'));
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grabPng = (win) => win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`).then((b) => Buffer.from(b, 'base64'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1920, height: 1080, useContentSize: true, show: true, webPreferences: { backgroundThrottling: false } });
  win.setAlwaysOnTop(true, 'screen-saver');
  const grab = () => { win.show(); win.moveTop(); app.focus({ steal: true }); win.focus(); };
  grab();
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  const first = { ...moment, simTime: times[0], paused: true };
  const b64 = Buffer.from(JSON.stringify(first)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await win.loadURL(`${base}#m=${b64}`);
  for (let i = 0; i < 90; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams')) break; await sleep(1000); }
  await sleep(25000);
  await win.webContents.executeJavaScript('window.liquidDreams.exactFoamReplays = true');
  for (const t of times) {
    grab();
    const m = { conditions: moment.conditions, camera: moment.camera, simTime: t, paused: true };
    await win.webContents.executeJavaScript(`window.liquidDreams.applyMoment(${JSON.stringify(m)})`);
    await sleep(settle);
    const withPng = await grabPng(win);
    // App.frame sets the pools' visibility every frame (underwater): pin it off for the capture, then restore it.
    await win.webContents.executeJavaScript(`Object.defineProperty(window.liquidDreams.spray.mesh, 'visible', { get: () => false, set: () => {}, configurable: true }); 0`);
    const withoutPng = await grabPng(win);
    await win.webContents.executeJavaScript(`delete window.liquidDreams.spray.mesh.visible; window.liquidDreams.spray.mesh.visible = true; 0`);
    // The anchor: the throwing section's crest (its tips' highest over the last second) and one H above it, projected.
    const anchor = JSON.parse(await win.webContents.executeJavaScript(`(() => {
      const a = window.liquidDreams, k = Math.floor(${t} * 20 + 1e-6), em = [];
      for (let j = k - 19; j <= k; j++) em.push(...a.emittersAt(j).spray);
      const now = a.emittersAt(k).spray;
      if (em.length === 0 || now.length === 0) return JSON.stringify(null);
      const crest = Math.max(...em.map((e) => e.y));
      const cam = a.camera, el = a.renderer.domElement;
      const px = (x, y, z) => { const v = cam.position.clone().set(x, y, z).project(cam); return [(v.x + 1) / 2 * el.width, (1 - v.y) / 2 * el.height, v.z]; };
      // The stations on screen (in front of the eye, inside the frame); the anchor is the one nearest the frame's centre.
      const on = now.map((e) => ({ e, p: px(e.x, crest, e.z) })).filter((q) => q.p[2] < 1 && q.p[0] >= 0 && q.p[0] <= el.width && q.p[1] >= 0 && q.p[1] <= el.height);
      if (on.length === 0) return JSON.stringify(null);
      const c = on.reduce((b, q) => (Math.abs(q.p[0] - el.width / 2) < Math.abs(b.p[0] - el.width / 2) ? q : b));
      const xs = on.map((q) => q.p[0]);
      // The feathering stations (the standing wall ahead of the curl) on screen: where S2's haze must show.
      const fe = a.emittersAt(k).feather.map((e) => px(e.x, e.y, e.z)).filter((p) => p[2] < 1 && p[0] >= 0 && p[0] <= el.width && p[1] >= 0 && p[1] <= el.height);
      return JSON.stringify({ fe, crest, at: c.p, up: px(c.e.x, crest + ${Hm}, c.e.z), xMin: Math.min(...xs), xMax: Math.max(...xs), n: on.length, w: el.width, h: el.height, wOff: now.reduce((s, e) => s + e.wOff, 0) / now.length });
    })()`));
    const A = nativeImage.createFromBuffer(withPng), B = nativeImage.createFromBuffer(withoutPng);
    const size = A.getSize(), pa = A.toBitmap(), pb = B.toBitmap();
    if (out) { writeFileSync(`${out}-${t.toFixed(2)}.png`, withPng); writeFileSync(`${out}-${t.toFixed(2)}-nospray.png`, withoutPng); }
    if (!anchor) { console.log(`t ${t}: no throwing section on screen to anchor`); continue; }
    const sc = size.height / anchor.h, crestPx = anchor.at[1] * sc, perH = (anchor.at[1] - anchor.up[1]) * sc; // px per H at the anchor
    console.log(`t ${t}: crest y ${anchor.crest.toFixed(2)} m, ${perH.toFixed(0)} px per H at the anchor, mean w_off ${anchor.wOff.toFixed(2)} m/s; the throwing stations on screen span ${(((anchor.xMax - anchor.xMin) * sc / perH) * Hm).toFixed(1)} m at the anchor's scale (${anchor.n})`);
    // Feather: changed pixels in a window over each feathering station (±FW px across, FU px up, 4 px down), deduplicated.
    const FW = 12, FU = 40;
    for (const tl of [tol, 25, 50]) {
      const seen = new Set();
      for (const f of anchor.fe) {
        const fx = Math.round(f[0] * sc), fy = Math.round(f[1] * sc);
        for (let y = Math.max(0, fy - FU); y <= Math.min(size.height - 1, fy + 4); y++) for (let x = Math.max(0, fx - FW); x <= Math.min(size.width - 1, fx + FW); x++) {
          const i = (y * size.width + x) * 4;
          if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > tl) seen.add(y * size.width + x);
        }
      }
      console.log(`  feather tol ${tl}: ${seen.size} px changed over ${anchor.fe.length} feathering stations on screen (window ${2 * FW + 1} × ${FU + 5} px each)`);
    }
    for (const tl of [tol, 25, 50]) {
      let n = 0, top = Infinity, x0 = Infinity, x1 = -1, nAbove = 0;
      const mask = out ? Buffer.from(pa) : null;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
        const p = i / 4, x = p % size.width, y = Math.floor(p / size.width);
        if (d > tl) {
          n++;
          if (y < crestPx) { nAbove++; top = Math.min(top, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
          if (mask) { mask[i] = 255; mask[i + 1] = 0; mask[i + 2] = 0; }
        } else if (mask) { mask[i] >>= 1; mask[i + 1] >>= 1; mask[i + 2] >>= 1; }
      }
      if (mask) writeFileSync(`${out}-${t.toFixed(2)}-mask${tl}.png`, nativeImage.createFromBitmap(mask, size).toPNG());
      const topM = Number.isFinite(top) ? ((crestPx - top) / perH) * Hm : 0, widthM = x1 >= 0 ? ((x1 - x0) / perH) * Hm : 0;
      console.log(`  tol ${tl}: ${n} px show the spray, ${nAbove} above the crest line; visible top ${topM.toFixed(2)} m = ${(topM / Hm).toFixed(2)} H above it; fan ${widthM.toFixed(1)} m wide`);
    }
  }
  app.quit();
});
