import { it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_REEF_PARAMS } from '../seabed/wombReef';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from '../breaker/breaking';
import { type Station, minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { REFRACT_FLOOR_M, computeReefField, sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { withSections } from './sectionWater';
import { type WaterFn, waterAt } from './water';
import { type Experience, TUNING, liftAt, speedOf, startBody, stepRide } from './ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from './takeoff';

/**
 * A probe, not a test (R2 §1): where she is in the wave's frame through the take-off, at each size and Experience level.
 * `PROBE_RIDE_FT=6,7,8 npx vitest run src/ride/takeoffProbe.test.ts --silent=false`. Skipped otherwise.
 * Columns: t−arrive, phase, speed, c, slope under her, lift, ahead (m in front of her wave's nearest live station along
 * its normal; + is shoreward of the crest line), up (height above still water / that station's H), n (live stations of
 * her wave), near (m along the crest to the nearest), dy (board − water), foam, onSection, event (NOT-IN-wavesNear: her
 * wave is not among the active waves at all).
 */
const SIZES = (process.env.PROBE_RIDE_FT ?? '').split(',').map(Number).filter((n) => n > 0);
const LEVELS: Experience[] = ['beginner', 'intermediate', 'expert'];

it.skipIf(SIZES.length === 0)('probe: her position in the wave through the take-off', { timeout: 1_800_000 }, () => {
  const lines: string[] = [];
  for (const ft of SIZES) for (const experience of LEVELS) {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = ft;
    const field = computeReefField({ bed: downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    const stationsAt = (t: number, cx: number, cz: number) => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      return { waves, mine, entries: traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM }) };
    };
    const waterAtT = (t: number, cx: number, cz: number): { water: WaterFn; live: Station[]; mine: number } => {
      const { waves, mine, entries } = stationsAt(t, cx, cz);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const live = entries.filter((e): e is Station => !e.gap && e.wave === mine);
      return { water: withSections(sheet, entries, c.tideM), live, mine };
    };
    const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
    let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
    const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
    const start = waterAtT(t, sx, sz).water(sx, sz);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(sx, sz, swellHeading, waterAtT(t, sx, sz).water);
    const line = swellHeading - 88;
    const dt = 1 / 60;
    let popped = false, rodeS = 0, nextRow = -Infinity, ended = '';
    lines.push(`\n=== ${ft} ft ${experience}: H0 ${big.heightM.toFixed(2)} m, spot (${sx.toFixed(1)}, ${sz.toFixed(1)}), arrive ${arrive.toFixed(2)}`);
    lines.push('  t-arr  phase   v     c   slope lift  ahead   up    n  near    dy  foam sec  event');
    for (let k = 0; k < 60 * 25; k++) {
      t += dt;
      const { water, live, mine } = waterAtT(t, b.x, b.z);
      if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
      const err = ((b.headingDeg - line + 540) % 360) - 180;
      const under = water(b.x, b.z);
      const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
      if (popup) popped = true;
      const ev = stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - PADDLE_FROM_S, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt, TUNING[experience]);
      if (b.phase === 'ride') rodeS += dt;
      const row = ev !== null || t >= nextRow || (b.phase === 'ride' && (Math.abs(rodeS - 1) < dt / 2 || Math.abs(rodeS - 3) < dt / 2));
      if (row) {
        nextRow = Math.max(nextRow, Math.floor(t) + 1);
        const w = b.water, lx = w.lx ?? b.x, lz = w.lz ?? b.z;
        let near: { al: number; ah: number; H: number } | null = null;
        for (const s of live) { const dx = lx - s.x, dz = lz - s.z, al = Math.abs(-dx * s.nz + dz * s.nx); if (!near || al < near.al) near = { al, ah: dx * s.nx + dz * s.nz, H: s.H }; }
        const f = (v: number, d = 2, wd = 6) => (Number.isFinite(v) ? v.toFixed(d) : '-').padStart(wd);
        lines.push(`${f(t - arrive)} ${b.phase.padEnd(6)} ${f(speedOf(b), 1, 5)} ${f(w.c, 1, 5)} ${f(Math.hypot(w.slopeX, w.slopeZ))} ${f(liftAt(w, b.headingDeg))} ${near ? f(near.ah) : '     -'} ${near ? f((b.y - c.tideM) / near.H) : '     -'} ${String(live.length).padStart(4)} ${near ? f(near.al, 1, 5) : '    -'} ${f(b.y - w.y)} ${f(w.foam)} ${w.onSection ? ' y ' : ' n '} ${mine < 0 ? 'NOT-IN-wavesNear ' : ''}${ev ?? ''}`);
      }
      if (ev === 'wipeout' || ev === 'kickout') { ended = `${ev} at +${(t - arrive).toFixed(2)}, rode ${rodeS.toFixed(2)} s`; break; }
    }
    lines.push(`  end: ${ended || `window, rode ${rodeS.toFixed(2)} s`}`);
  }
  console.log(lines.join('\n'));
});
