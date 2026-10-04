// Scratch: rides the set's wave with a physics bot at several aims to the left, at a peel dial, and prints each ride.
// npx electron tools/_peelRide.mjs [--base=http://localhost:5189/] [--cond=<json>] [--peel=1.7]
import { app, BrowserWindow } from 'electron';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5189/';
const cond = arg('cond') ? JSON.parse(arg('cond')) : null;
const peel = arg('peel') ? Number(arg('peel')) : null;
app.commandLine.appendSwitch('force_high_performance_gpu');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 450, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base + '?frontend=off');
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(6000);
  const out = await win.webContents.executeJavaScript(`(async () => { try {
    const a = window.liquidDreams, P = await import('/src/ride/ridePhysics.ts');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const cond = ${JSON.stringify(cond)}, peel = ${JSON.stringify(peel)};
    if (cond) {
      const before = a.field;
      const c = JSON.parse(JSON.stringify(a.conditions));
      for (const [k, v] of Object.entries(cond)) c[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v;
      a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: a.clock.simTime, paused: false });
      for (let i = 0; i < 240 && (a.field === before || !a.field); i++) await wait(500);
      await wait(2000);
    }
    if (peel !== null && peel !== a.breakParams.peel) {
      const before = a.field;
      a.breakParams.peel = peel;
      a.requestFieldIfNeeded(true);
      for (let i = 0; i < 240 && a.field === before; i++) await wait(500);
      await wait(1000);
    }
    a.setPaused(true);
    const lines = ['peel ' + a.breakParams.peel + ' ' + JSON.stringify(a.conditions.swell)];
    for (const aim of [45, 60, 75]) {
      if (a.ride.active) a.toggleRide();
      a.toggleRide();
      const b = a.ride.body, arr = a.rideSet[a.rideWave], x0 = b.x, z0 = b.z;
      const d0 = [b.water.dirX, b.water.dirZ], left = [d0[1], -d0[0]];
      let t = a.clock.simTime, caughtAt = null, upAt = null, end = 'riding at arr+20', maxAlong = 0;
      while (t < arr + 20) {
        t += 1 / 60;
        if (b.caught && caughtAt === null) caughtAt = t;
        let steer = 0;
        if (b.phase === 'ride' || b.phase === 'popup') {
          if (upAt === null) upAt = t;
          const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI;
          const off = ((b.headingDeg - travel + 540) % 360) - 180; // + right of straight in
          const want = -aim;
          steer = Math.abs(want - off) > 8 ? Math.sign(want - off) : 0;
        }
        const popup = b.phase === 'paddle' && caughtAt !== null && t >= caughtAt + 0.4;
        const e = P.stepRide(b, { paddle: t > arr - 4 && b.phase === 'paddle', steer, crouch: 0, popup }, a.rideWater(t), 1 / 60);
        if (upAt !== null) maxAlong = Math.max(maxAlong, (b.x - x0) * left[0] + (b.z - z0) * left[1]);
        if (upAt !== null && (e === 'wipeout' || e === 'kickout' || e === 'aground')) { end = e; break; }
      }
      lines.push('aim ' + aim + ': ' + (upAt === null ? 'never up' : 'rode ' + (t - upAt).toFixed(1) + ' s, ' + maxAlong.toFixed(0) + ' m along the line, ended: ' + end));
    }
    return lines;
  } catch (err) { return [String(err.stack)]; } })()`);
  console.log(out.join('\n'));
  app.quit();
});
