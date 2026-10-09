// Scratch: how fast the ride's wave breaks along its crest (the peel). At several moments as the wave passes the peak, the
// crest stations (1 m apart) give each point's onset time (t − tb); the peel is d(arc)/d(onset) along the line.
// npx electron tools/_peelProbe.mjs [--base=http://localhost:5189/] [--cond=<json>] [--peel=1]
import { app } from 'electron';
import { quietWindow } from './quietWindow.mjs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/';
const cond = arg('cond') ? JSON.parse(arg('cond')) : null;
const peel = arg('peel') ? Number(arg('peel')) : null;
app.commandLine.appendSwitch('force_high_performance_gpu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = quietWindow({ width: 800, height: 450, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off');
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(6000);
  const out = await win.webContents.executeJavaScript(`(async () => { try {
    const a = window.liquidDreams;
    const cond = ${JSON.stringify(cond)};
    if (cond) {
      const before = a.field;
      const c = JSON.parse(JSON.stringify(a.conditions));
      for (const [k, v] of Object.entries(cond)) c[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v;
      a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: a.clock.simTime, paused: false });
      for (let i = 0; i < 120 && (a.field === before || !a.field); i++) await new Promise((r) => setTimeout(r, 500));
      await new Promise((r) => setTimeout(r, 3000));
    }
    const peel = ${JSON.stringify(peel)};
    if (peel !== null && peel !== a.breakParams.peel) {
      // The dial (BreakParams.peel) re-bakes the field: 1 is physics (main).
      const before = a.field;
      a.breakParams.peel = peel;
      a.requestFieldIfNeeded(true);
      for (let i = 0; i < 240 && a.field === before; i++) await new Promise((r) => setTimeout(r, 500));
      await new Promise((r) => setTimeout(r, 1000));
    }
    a.setPaused(true);
    if (!a.ride.active) a.toggleRide();
    const CT = await import('/src/breaker/crestTrace.ts'), SW = await import('/src/breaker/setWaveModel.ts'), SE = await import('/src/swell/sets.ts');
    const arr = a.rideSet[a.rideWave], lines = [], c0 = a.conditions;
    lines.push('conditions ' + JSON.stringify({ swell: c0.swell, tide: c0.tideM, peel: a.breakParams.peel }));
    const pts = new Map();
    for (let t = arr - 2; t <= arr + 8; t += 0.5) {
      const events = SE.wavesNear(t, a.conditions, a.sets);
      const waves = events.map(SW.toActiveWave);
      const wi = events.findIndex((e) => Math.abs(e.arrivalS - arr) < 1e-3);
      const st = CT.traceStations(a.field, waves, t, a.waveCtx, { cameraX: 0, cameraZ: 0, params: a.breakParams, minHeightM: a.ribbonMinHeightM, offshoreMs: a.offshoreMs, spacingM: 1 });
      for (const s of st) {
        if (s.gap || s.wave !== wi || s.tb === null || !Number.isFinite(s.tb) || s.tb > 1.5) continue;
        // Keyed by position along the coast: z rounded (the line runs roughly north-south); the earliest reading wins.
        const key = Math.round(s.z / 2) * 2;
        const on = t - s.tb;
        if (!pts.has(key) || pts.get(key).on > on) pts.set(key, { on, x: s.x, z: s.z, H: s.H, c: s.c, nx: s.nx, nz: s.nz, psi: s.psi });
      }
    }
    const rows = [...pts.values()].sort((p, q) => p.on - q.on);
    // The peel per ~1 s of onset time: the left (x < 80, toward −z from the peak) and the right (x < 80, z > 10).
    const table = (name, sel) => {
      const g = rows.filter(sel);
      if (g.length < 2) { lines.push(name + ': no stations'); return; }
      lines.push(name + ': first onset ' + (g[0].on - arr).toFixed(2) + ' s at (' + g[0].x.toFixed(0) + ', ' + g[0].z.toFixed(0) + '), ' + g.length + ' stations');
      for (let i = 0; i < g.length;) {
        let j = i; while (j < g.length && g[j].on - g[i].on < 1) j++;
        if (j >= g.length) break;
        const a = g[i], b = g[j];
        lines.push('  onset ' + (a.on - arr).toFixed(1) + '..' + (b.on - arr).toFixed(1) + '  z ' + a.z.toFixed(0) + '..' + b.z.toFixed(0) + '  peel ' + (Math.hypot(b.x - a.x, b.z - a.z) / (b.on - a.on)).toFixed(1) + ' m/s  H ' + a.H.toFixed(1));
        i = j;
      }
    };
    table('left', (p) => p.x < 80 && p.z <= 10);
    table('right', (p) => p.x < 80 && p.z > 10);
    return lines;
  } catch (err) { return [String(err.stack)]; } })()`);
  console.log(out.join('\n'));
  app.quit();
});
