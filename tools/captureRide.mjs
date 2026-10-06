// Dev tool: npx electron tools/captureRide.mjs --base=http://localhost:5186/ --out=<prefix> [--at=<s,s,…>] [--left|--right]
// Starts a ride (G) paused, rides wave 1 of the set with a simple bot (paddles from 3 s before the crest reaches the take-off
// spot, App.rideArriveS (R1 §3; it paddled 4 s before the peak, after the wave had passed the spot), pops up when caught,
// carves left or right along the wave) stepping the physics at 60 Hz, and saves a captureFrame() PNG at each time (s from
// the wave reaching the peak) as <prefix>-<s>.png, with the ride's state and its events (caught, popup, …) logged.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base'), out = arg('out');
const at = (arg('at') ?? '-3,-1.5,-0.5,0.5,1.5,3,5').split(',').map(Number);
const dir = process.argv.includes('--right') ? 1 : -1;
// --cond=<json>: conditions to ride in, merged over the defaults (e.g. {"swell":{"sizeFt":5.5,"periodS":14},"tideM":-0.25}).
const cond = arg('cond') ? JSON.parse(arg('cond')) : null;
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: true, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(15000);
  await win.webContents.executeJavaScript(`(async () => {
    const a = window.liquidDreams, P = await import('/src/ride/ridePhysics.ts');
    const cond = ${JSON.stringify(cond)};
    if (cond) {
      const before = a.field;
      const c = JSON.parse(JSON.stringify(a.conditions));
      for (const [k, v] of Object.entries(cond)) c[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v;
      a.applyMoment({ conditions: c, camera: a.rig.getPose(), simTime: a.clock.simTime, paused: false });
      for (let i = 0; i < 120 && (a.field === before || !a.field); i++) await new Promise((r) => setTimeout(r, 500));
      await new Promise((r) => setTimeout(r, 3000));
    }
    a.setPaused(true);
    if (!a.ride.active) a.toggleRide();
    window.__bot = { a, P, arr: a.rideSet[a.rideWave], arrive: a.rideArriveS, t: a.clock.simTime, events: [] };
  })()`);
  for (const s of at) {
    const state = await win.webContents.executeJavaScript(`(() => {
      const { a, P, arr, arrive, events } = window.__bot, b = a.ride.body;
      while (window.__bot.t < arr + ${s}) {
        const t = (window.__bot.t += 1 / 60);
        const ridingFor = b.phase === 'ride' ? b.phaseT : 0;
        // Carve to 45° off the swell's travel, left or right.
        const travel = Math.atan2(b.water.dirX, -b.water.dirZ) * 180 / Math.PI, aim = travel + ${dir} * 45;
        const off = ((aim - b.headingDeg + 540) % 360) - 180;
        const steer = ridingFor > 0.3 ? Math.max(-1, Math.min(1, off / 20)) : 0;
        const ev = P.stepRide(b, { paddle: t > arrive - 3 && b.phase === 'paddle', steer, crouch: 0, popup: b.caught }, a.rideWater(t), 1 / 60);
        if (ev) events.push(ev + '@' + (t - arr).toFixed(2));
      }
      a.clock.setTime(window.__bot.t);
      return { s: ${s}, offset: +a.rideOffset.value.toFixed(2), underwater: a.underwater, phase: b.phase, x: +b.x.toFixed(1), z: +b.z.toFixed(1), y: +b.y.toFixed(2), v: +P.speedOf(b).toFixed(1), h: Math.round(b.headingDeg), foam: +b.water.foam.toFixed(2), arriveRel: +(arrive - arr).toFixed(2), events: events.join(' ') };
    })()`);
    let png = '';
    for (let k = 0; k < 4; k++) {
      png = await win.webContents.executeJavaScript(`window.liquidDreams.captureFrame().then(async (b) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); })`);
      await sleep(300);
    }
    writeFileSync(`${out}${s.toFixed(1)}.png`, Buffer.from(png, 'base64'));
    console.log(JSON.stringify(state));
  }
  app.quit();
});
