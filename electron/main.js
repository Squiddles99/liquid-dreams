// Spike: Liquid Dreams in an Electron window, to check that WebGPU runs on the discrete GPU without the player
// touching Windows' graphics settings, and to find where the game assumes it lives in a browser tab.
//
//   Liquid Dreams.bat           one click: build if anything changed, then open the built game (electron/launch.mjs)
//   npm run electron            build, then open the built game (served over app://game/)
//   npm run electron:dev        open the Vite dev server (run `npm run dev` first)
//   ...  -- --no-force-gpu      don't ask Chromium for the high-performance GPU (the A/B for the spike)
//   ...  -- --probe=<dir>       run ~20 s, write <dir>/probe.json (GPUs, adapter, frame rate) + probe.png, quit
import { app, BrowserWindow, clipboard, protocol } from 'electron';
import { existsSync, mkdirSync, readdirSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const DEV_URL = 'http://localhost:5173/';
const APP_URL = 'app://game/';
const ICON = join(ROOT, 'electron', 'icon.png');
/** The loading cover's sand (index.html --ld-sand): the window's colour before the page paints. */
const SAND = '#e8dbc4';

const args = process.argv.slice(1);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dev = flag('dev');
const forceGpu = !flag('no-force-gpu');
const probeDir = option('probe');

// On a two-GPU laptop Chromium otherwise takes whatever Windows hands a new .exe: usually the integrated GPU.
if (forceGpu) app.commandLine.appendSwitch('force_high_performance_gpu');

// A standard, secure scheme: absolute paths (/assets/…, /music/…) resolve, WebGPU sees a secure context,
// localStorage has a stable origin, and <audio> can stream with range requests.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.wav': 'audio/wav',
};

/** Music files served while probing: proof the soundtrack streams from inside the app. */
const mediaRequests = [];

/** Serves dist/ over app://game/, with Range support so the music's <audio> element can seek. */
function serveDist(request) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST + sep) && file !== DIST) return new Response('Forbidden', { status: 403 });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const size = statSync(file).size;
  const headers = { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (probeDir && /\.(mp3|m4a|ogg|flac|wav)$/i.test(file)) mediaRequests.push(`${range ? 206 : 200} ${path.split('/').pop()}`);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const body = Readable.toWeb(createReadStream(file, { start, end }));
    return new Response(body, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)), { headers: { ...headers, 'Content-Length': String(size) } });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, backgroundColor: SAND, show: false, autoHideMenuBar: true, title: 'Liquid Dreams',
    // The logo on the window and the taskbar (electron/icon.png; see electron/launch.mjs for the shortcut's .ico).
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  // Shown on the page's first paint (the loading cover), never as an empty black window.
  win.once('ready-to-show', () => win.show());
  // The screenshot key (K) "downloads" a PNG. A browser drops it in Downloads; Electron would ask where to save it
  // every time. Save straight to Pictures\Liquid Dreams instead (the probe's own folder while probing).
  win.webContents.session.on('will-download', (_e, item) => {
    if (probeDir) console.log('[probe] will-download', item.getFilename(), item.getURL().slice(0, 40));
    const dir = probeDir ?? join(app.getPath('pictures'), 'Liquid Dreams');
    mkdirSync(dir, { recursive: true });
    item.setSavePath(join(dir, item.getFilename()));
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  if (probeDir) {
    const t0 = Date.now();
    win.webContents.on('console-message', (e) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s renderer ${e.level}] ${e.message}`));
  }
  await win.loadURL(dev ? DEV_URL : APP_URL);
  if (probeDir) await probe(win, probeDir);
}

/** What the spike needs to know, gathered without anyone watching: which GPU, how fast, and what it looks like. */
async function probe(win, dir) {
  mkdirSync(dir, { recursive: true });
  // Every frame over 60 s: the rate per 5 s window (start-up work vs a steady cost) and each hitch (>50 ms) by time.
  const timeline = await win.webContents.executeJavaScript(`new Promise((done) => {
    const hitches = [], perWindow = []; let last = performance.now(), frames = 0, windowStart = last;
    const tick = (now) => {
      if (now - last > 50) hitches.push({ atS: Math.round(now / 100) / 10, ms: Math.round(now - last) });
      last = now; frames++;
      if (now - windowStart >= 5000) { perWindow.push(Math.round(frames / ((now - windowStart) / 1000))); frames = 0; windowStart = now; }
      perWindow.length < 12 ? requestAnimationFrame(tick) : done({ fpsPer5s: perWindow, hitches });
    };
    requestAnimationFrame(tick);
  })`);
  const gpuInfo = await app.getGPUInfo('complete');
  const page = await win.webContents.executeJavaScript(`(async () => {
    const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    const info = a?.info ?? {};
    let frames = 0; const t0 = performance.now();
    await new Promise((done) => { const tick = () => { frames++; performance.now() - t0 < 5000 ? requestAnimationFrame(tick) : done(); }; requestAnimationFrame(tick); });
    return {
      adapter: { vendor: info.vendor, architecture: info.architecture, description: info.description },
      fps: frames / ((performance.now() - t0) / 1000),
      origin: location.origin, href: location.href, isSecureContext,
      localStorageKeys: Object.keys(localStorage),
      overlay: document.body.innerText.slice(0, 400),
    };
  })()`);
  // The two keys that hand something to the outside world: K (screenshot) and L (moment link to the clipboard).
  const clipboardBefore = await clipboard.readText();
  for (const keyCode of ['K', 'L']) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'char', keyCode: keyCode.toLowerCase() });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  }
  await new Promise((r) => setTimeout(r, 5000));
  const keys = {
    screenshotSaved: readdirSync(dir).filter((f) => f.startsWith('liquid-dreams-') && f.endsWith('.png')),
    momentLink: (await clipboard.readText()).slice(0, 80),
  };
  await clipboard.writeText(clipboardBefore);
  const image = await win.webContents.capturePage();
  writeFileSync(join(dir, 'probe.png'), image.toPNG());
  const result = {
    electron: process.versions.electron, ...timeline, chrome: process.versions.chrome, forceGpu, dev,
    gpus: (gpuInfo.gpuDevice ?? []).map((g) => ({ vendorId: g.vendorId, deviceId: g.deviceId, active: g.active, driver: g.driverVersion })),
    glRenderer: gpuInfo.auxAttributes?.glRenderer,
    ...page,
    keys,
    mediaRequests: mediaRequests.slice(0, 5),
  };
  writeFileSync(join(dir, 'probe.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}

// Windows groups the taskbar button by this id, and shows the window's icon for it (not Electron's).
app.setAppUserModelId('com.liquiddreams.game');

app.whenReady().then(() => {
  protocol.handle('app', serveDist);
  return createWindow();
});
app.on('window-all-closed', () => app.quit());
