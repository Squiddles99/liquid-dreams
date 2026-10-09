// lineup-truth Task 5: rideOnSections' four rides (src/ride/rideOnSections.test.ts, copied: src/ride is untouched) with the
// reef field seeded by the 1-D far field (as on main) and by the coast field (the game on this branch), side by side:
// held / rode seconds and how each ride ends. npx node tools/_coastRide.ts
import { runnerImport } from 'vite';
const imp = async <T>(p: string) => (await runnerImport<T>(p)).module;
const { DEFAULT_CONDITIONS, cloneConditions } = await imp<typeof import('../src/conditions/defaults')>('/src/conditions/defaults.ts');
const { buildBathymetry, downsample } = await imp<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts');
const { DEFAULT_REEF_PARAMS } = await imp<typeof import('../src/seabed/wombReef')>('/src/seabed/wombReef.ts');
const { DEFAULT_COAST_PARAMS } = await imp<typeof import('../src/seabed/coastFeatures')>('/src/seabed/coastFeatures.ts');
const { buildCoastMap } = await imp<typeof import('../src/seabed/coastMap')>('/src/seabed/coastMap.ts');
const { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } = await imp<typeof import('../src/swell/sets')>('/src/swell/sets.ts');
const { DEFAULT_BREAK_PARAMS: P } = await imp<typeof import('../src/breaker/breaking')>('/src/breaker/breaking.ts');
const { minRibbonHeight, traceStations } = await imp<typeof import('../src/breaker/crestTrace')>('/src/breaker/crestTrace.ts');
const { REFRACT_FLOOR_M, computeReefField, sampleField } = await imp<typeof import('../src/breaker/reefField')>('/src/breaker/reefField.ts');
const { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } = await imp<typeof import('../src/breaker/setWaveModel')>('/src/breaker/setWaveModel.ts');
const { withSections } = await imp<typeof import('../src/ride/sectionWater')>('/src/ride/sectionWater.ts');
const { waterAt } = await imp<typeof import('../src/ride/water')>('/src/ride/water.ts');
const { TUNING, startBody, stepRide } = await imp<typeof import('../src/ride/ridePhysics')>('/src/ride/ridePhysics.ts');
const { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } = await imp<typeof import('../src/ride/takeoff')>('/src/ride/takeoff.ts');
const { LINE_OFF_DEG, aheadOf } = await imp<typeof import('../src/ride/rideLine')>('/src/ride/rideLine.ts');

type Exp = 'beginner' | 'intermediate' | 'expert';
const bed = downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2);
const coastBed = buildCoastMap(bed, DEFAULT_COAST_PARAMS);

function ride(ft: number, experience: Exp, withCoast: boolean): string {
  const c = cloneConditions(DEFAULT_CONDITIONS);
  c.swell.sizeFt = ft;
  const field = computeReefField({ bed, periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M, ...(withCoast ? { coast: coastBed } : {}) });
  const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
  const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
  let herStations: any[] = [];
  const waterAtT = (t: number, cx: number, cz: number) => {
    const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
    const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
    const sheet = (x: number, z: number) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
    const entries = traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM });
    herStations = entries.filter((e: any) => !e.gap && e.wave === mine);
    return withSections(sheet, entries, c.tideM);
  };
  const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
  let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
  const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
  const start = waterAtT(t, sx, sz)(sx, sz);
  const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
  const b = startBody(sx, sz, swellHeading, waterAtT(t, sx, sz));
  const line = swellHeading - LINE_OFF_DEG;
  const dt = 1 / 60, events: string[] = [];
  let popped = false, rodeS = 0, heldS = 0;
  for (let k = 0; k < 60 * 20; k++) {
    t += dt;
    const water = waterAtT(t, b.x, b.z);
    if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
    const err = ((b.headingDeg - line + 540) % 360) - 180;
    const under = water(b.x, b.z);
    const popup = b.phase === 'paddle' && b.caught && !popped && Math.hypot(under.slopeX, under.slopeZ) > 0.6;
    if (popup) popped = true;
    const ev = stepRide(b, { paddle: b.phase === 'paddle' && t > arrive - PADDLE_FROM_S, steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt, TUNING[experience]);
    if (ev) events.push(ev);
    const ahead = aheadOf(herStations, b.water, b.x, b.z);
    if (b.phase === 'ride') { rodeS += dt; if (ahead !== undefined && ahead > 0) heldS += dt; }
    if (ev === 'wipeout' || ev === 'kickout') break;
  }
  return `take-off (${sx.toFixed(1)}, ${sz.toFixed(1)}), held ${heldS.toFixed(2)} s of ${rodeS.toFixed(2)} s, events ${events.join(' ')}, end (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`;
}

for (const [ft, exp] of [[6, 'intermediate'], [12, 'intermediate'], [6, 'beginner'], [6, 'expert']] as [number, Exp][]) {
  console.log(`${ft} ft ${exp}\n  far field: ${ride(ft, exp, false)}\n  coast:     ${ride(ft, exp, true)}`);
}
