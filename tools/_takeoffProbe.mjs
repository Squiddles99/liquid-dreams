// Scratch: the water at the takeoff spot as the ride's wave arrives (how fast it travels, how fast the board would bob)
// and a paddling bot's catch timeline. npx electron tools/_takeoffProbe.mjs [--base=http://localhost:5173/] [--cond=<json>]
import { app } from 'electron';
import { quietWindow } from './quietWindow.mjs';
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const base = arg('base') ?? 'http://localhost:5173/';
const cond = arg('cond') ? JSON.parse(arg('cond')) : null;
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = quietWindow({ width: 800, height: 450, webPreferences: { backgroundThrottling: false } });
  await win.webContents.session.clearStorageData({ storages: ['localstorage'] });
  await win.loadURL(base);
  for (let i = 0; i < 120; i++) { if (await win.webContents.executeJavaScript('!!window.liquidDreams?.field')) break; await sleep(1000); }
  await sleep(8000);
  const out = await win.webContents.executeJavaScript(`(async () => { try {
    const a = window.liquidDreams, P = await import('/src/ride/ridePhysics.ts?t=' + Date.now());
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
    const b = a.ride.body, arr = a.rideSet[a.rideWave], x0 = b.x, z0 = b.z;
    const lines = [];
    const c0 = a.conditions;
    lines.push('conditions ' + JSON.stringify({ swell: c0.swell ?? c0.swellHeightFt, tide: c0.tideM }));
    // 1. Stationary at the takeoff spot: the water's height, its rate, the phase speed, and the crest's measured travel.
    const w0 = a.rideWater(arr)(x0, z0), dx = w0.dirX, dz = w0.dirZ;
    let prevY = null, prevCrest = null;
    for (let t = arr - 10; t <= arr + 4; t += 0.25) {
      const W = a.rideWater(t), w = W(x0, z0);
      // The crest along the travel line through the spot (−80 m seaward … +30 m shoreward).
      let best = -1e9, bestS = 0;
      for (let s = -80; s <= 30; s += 0.5) { const y = W(x0 + dx * s, z0 + dz * s).y; if (y > best) { best = y; bestS = s; } }
      const vy = prevY === null ? 0 : (w.y - prevY) / 0.25, vc = prevCrest === null ? 0 : (bestS - prevCrest) / 0.25;
      prevY = w.y; prevCrest = bestS;
      const front = -(w.slopeX * w.dirX + w.slopeZ * w.dirZ);
      lines.push(['t-arr', (t - arr).toFixed(2), 'y', w.y.toFixed(2), 'dy/dt', vy.toFixed(2), 'c', w.c.toFixed(1), 'front', front.toFixed(2), 'foam', w.foam.toFixed(2), 'crest@', bestS.toFixed(1), 'crestTop', best.toFixed(2), 'crestV', vc.toFixed(1)].join(' '));
    }
    // 1b. Does the Lagrangian inversion converge on the steep face? Residual after 4 steps vs a damped 40-step solve.
    {
      const RF = await import('/src/breaker/reefField.ts'), SW = await import('/src/breaker/setWaveModel.ts'), SE = await import('/src/swell/sets.ts');
      const field = a.field, ctx = a.waveCtx;
      lines.push('--- inversion ---');
      for (let t = arr - 2.3; t <= arr - 1.25; t += 1 / 30) {
        const waves = SE.wavesNear(t, a.conditions, a.sets).map(SW.toActiveWave);
        const o = a.breakParams.enabled ? SW.breakOptions(field, a.breakParams, a.offshoreMs) : undefined;
        const sum = (x, z) => SW.sumWaves(x, z, t, RF.sampleField(field, x, z), waves, ctx, o);
        const solve = (n, damp) => { let px = x0, pz = z0; for (let k = 0; k < n; k++) { const r = sum(px, pz); px += damp * (x0 - r.dx - px); pz += damp * (z0 - r.dz - pz); } const r = sum(px, pz); return { y: r.eta, res: Math.hypot(px + r.dx - x0, pz + r.dz - z0) }; };
        const f4 = solve(4, 1), f40 = solve(60, 0.3);
        lines.push(['t-arr', (t - arr).toFixed(3), 'y4', f4.y.toFixed(2), 'res4(m)', f4.res.toFixed(2), 'y60d', f40.y.toFixed(2), 'res60d', f40.res.toFixed(3)].join(' '));
      }
    }
    // 1c. A floating board that rides its water parcel (label x0: at p = x0 + d(x0, t)) vs the fixed point, and the flow u the
    // physics drags towards vs the parcel's own velocity.
    {
      const RF = await import('/src/breaker/reefField.ts'), SW = await import('/src/breaker/setWaveModel.ts'), SE = await import('/src/swell/sets.ts'), FL = await import('/src/breaker/flow.ts');
      const field = a.field, ctx = a.waveCtx;
      lines.push('--- parcel vs fixed ---');
      const at = (t, x, z) => { const waves = SE.wavesNear(t, a.conditions, a.sets).map(SW.toActiveWave); const o = a.breakParams.enabled ? SW.breakOptions(field, a.breakParams, a.offshoreMs) : undefined; const f = RF.sampleField(field, x, z); return { r: SW.sumWaves(x, z, t, f, waves, ctx, o), f }; };
      let prev = null, maxP = 0, maxF = 0, prevF = null;
      for (let t = arr - 4; t <= arr + 2; t += 1 / 60) {
        const P0 = at(t, x0, z0), px = x0 + P0.r.dx, pz = z0 + P0.r.dz, py = P0.r.eta;
        const fixed = a.rideWater(t)(x0, z0).y - a.conditions.tideM;
        const u = FL.flowFromEta(P0.r.eta, P0.f, ctx.omega, 0);
        let vp = 0, vy = 0, vf = 0;
        if (prev) { vp = (Math.hypot(px - prev.px, pz - prev.pz)) * 60 * Math.sign((px - prev.px) * P0.f.dirX + (pz - prev.pz) * P0.f.dirZ); vy = (py - prev.py) * 60; vf = (fixed - prevF) * 60; }
        maxP = Math.max(maxP, Math.abs(vy)); maxF = Math.max(maxF, Math.abs(vf));
        if (Math.round((t - arr) * 60) % 9 === 0) lines.push(['t-arr', (t - arr).toFixed(2), 'parcel y', py.toFixed(2), 'dy/dt', vy.toFixed(1), 'parcel fwd v', vp.toFixed(1), 'flow u', (u.ux * P0.f.dirX + u.uz * P0.f.dirZ).toFixed(1), '| fixed y', fixed.toFixed(2), 'dy/dt', vf.toFixed(1)].join(' '));
        prev = { px, pz, py }; prevF = fixed;
      }
      lines.push('max |dy/dt| parcel ' + maxP.toFixed(1) + ' fixed ' + maxF.toFixed(1));
    }
    // 2. Frame-rate trace of the still board's water through the steep part (does it jump?).
    lines.push('--- 1/60 s, still board ---');
    let py = null;
    for (let t = arr - 3; t <= arr - 0.8; t += 1 / 60) {
      const w = a.rideWater(t)(x0, z0), vy = py === null ? 0 : (w.y - py) * 60; py = w.y;
      if (Math.abs(vy) > 4 || Math.round((t - arr) * 60) % 6 === 0) lines.push(['t-arr', (t - arr).toFixed(3), 'y', w.y.toFixed(2), 'dy/dt', vy.toFixed(1), 'front', (-(w.slopeX * w.dirX + w.slopeZ * w.dirZ)).toFixed(2)].join(' '));
    }
    // 4. A board left floating at the spot through the wave (no controls): its height and tilt vs the water's.
    {
      lines.push('--- floating board ---');
      const head = Math.atan2(w0.dirX, -w0.dirZ) * 180 / Math.PI;
      const fb = P.startBody(x0, z0, head, a.rideWater(arr - 4));
      let py = fb.y, pt = Math.atan(Math.hypot(fb.tiltX, fb.tiltZ)), maxVy = 0, maxTr = 0, deep = 0, high = 0;
      for (let t = arr - 4; t <= arr + 2; t += 1 / 60) {
        P.stepRide(fb, P.NO_CONTROLS, a.rideWater(t), 1 / 60);
        const wy = a.rideWater(t)(fb.x, fb.z).y, tl = Math.atan(Math.hypot(fb.tiltX, fb.tiltZ));
        const vy = (fb.y - py) * 60, tr = (tl - pt) * 60 * 180 / Math.PI; py = fb.y; pt = tl;
        maxVy = Math.max(maxVy, Math.abs(vy)); maxTr = Math.max(maxTr, Math.abs(tr)); deep = Math.max(deep, wy - fb.y); high = Math.max(high, fb.y - wy);
        if (Math.round((t - arr) * 60) % 6 === 0 && t > arr - 3 && t < arr) lines.push(['t-arr', (t - arr).toFixed(2), 'board y', fb.y.toFixed(2), 'water y', wy.toFixed(2), 'vy', vy.toFixed(1), 'tilt', (tl * 180 / Math.PI).toFixed(0), 'tiltRate', tr.toFixed(0), 'x', (fb.x - x0).toFixed(1)].join(' '));
      }
      lines.push('floating max |vy| ' + maxVy.toFixed(1) + ' max tilt rate ' + maxTr.toFixed(0) + ' deg/s, deepest under ' + deep.toFixed(2) + ' highest over ' + high.toFixed(2));
    }
    // 5. The board-length water height at the spot, 60 Hz (for tuning the float offline).
    {
      const head = Math.atan2(w0.dirX, -w0.dirZ) * 180 / Math.PI, f = [Math.sin(head * Math.PI / 180), -Math.cos(head * Math.PI / 180)], ser = [];
      for (let t = arr - 4; t <= arr + 3; t += 1 / 60) { const W = a.rideWater(t); ser.push(+((W(x0 + f[0] * 0.9, z0 + f[1] * 0.9).y + 2 * W(x0, z0).y + W(x0 - f[0] * 0.9, z0 - f[1] * 0.9).y) / 4).toFixed(3)); }
      lines.push('SERIES ' + JSON.stringify(ser));
    }
    // 3. A paddling bot: paddles from arr-4, pops up 0.4 s after the catch, rides straight. Where is it on the wave?
    lines.push('--- bot ---');
    let t = arr - 10, caughtAt = null, popAt = null;
    const deg = 180 / Math.PI;
    while (t < arr + 6) {
      t += 1 / 60;
      if (b.caught && caughtAt === null) caughtAt = t;
      const popup = b.phase === 'paddle' && caughtAt !== null && t >= caughtAt + 0.4;
      if (popup && popAt === null) popAt = t;
      const e = P.stepRide(b, { paddle: t > arr - 4 && b.phase === 'paddle', steer: 0, crouch: 0, popup }, a.rideWater(t), 1 / 60);
      const W = a.rideWater(t), w = b.water, ddx = w.dirX, ddz = w.dirZ;
      let top = -1e9, topS = 0, low = 1e9;
      for (let s = -30; s <= 40; s += 0.5) { const y = W(b.x + ddx * s, b.z + ddz * s).y; if (y > top) { top = y; topS = s; } }
      for (let s = 0; s <= 40; s += 0.5) low = Math.min(low, W(b.x + ddx * s, b.z + ddz * s).y);
      if (t > arr - 4.2 && (Math.round((t - arr) * 60) % 6 === 0 || e)) lines.push(['t-arr', (t - arr).toFixed(2), b.phase, 'v', P.speedOf(b).toFixed(1), 'y', b.y.toFixed(2), 'crest', top.toFixed(2), 'crestAhead(m)', topS.toFixed(1), 'troughAhead', low.toFixed(2), 'face%', ((b.y - low) / Math.max(0.1, top - low) * 100).toFixed(0), 'front', (-(w.slopeX * w.dirX + w.slopeZ * w.dirZ)).toFixed(2), 'foam', w.foam.toFixed(2), e ?? ''].join(' '));
      if (e === 'wipeout' || e === 'kickout') break;
    }
    return { arr, lines };
  } catch (err) { return { lines: [String(err.stack)] }; } })()`);
  console.log(out.lines.join('\n'));
  app.quit();
});
