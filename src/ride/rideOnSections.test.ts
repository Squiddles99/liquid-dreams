import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from '../breaker/breaking';
import { minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { computeReefField, sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { withSections } from './sectionWater';
import { type WaterFn, waterAt } from './water';
import { type RideEvent, startBody, stepRide } from './ridePhysics';

/**
 * A rider on the drawn wave (Andrew, 2026-10-05: "the surfer wipes out instantly"): the 6 ft set's biggest wave from the
 * take-off spot, as App.catchSetWave starts it, the ride standing on the ribbon's sections (App.rideWater). The rider faces
 * the swell and paddles until caught, pops up, then steers to hold a line along the left.
 */
describe('a ride on the drawn sections', () => {
  it('a 6 ft set wave: caught, popped up and ridden along the left for 5 s or more without a wipeout', { timeout: 300_000 }, () => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = 6;
    const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    const waterAtT = (t: number, cx: number, cz: number): WaterFn => {
      const waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      return withSections(sheet, traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM }), c.tideM);
    };
    let t = big.arrivalS - 10;
    const start = waterAtT(t, -10, 3)(-10, 3);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(-10, 3, swellHeading, waterAtT(t, -10, 3));
    // The left: facing the beach, the rider's left, a little toward the beach (heading 330° at the default swell).
    const line = swellHeading - 88;
    const dt = 1 / 60, events: RideEvent[] = [];
    let popped = false, rodeS = 0;
    for (let k = 0; k < 60 * 20; k++) {
      t += dt;
      const water = waterAtT(t, b.x, b.z);
      if (b.phase === 'paddle' && !popped) b.headingDeg = swellHeading;
      const err = ((b.headingDeg - line + 540) % 360) - 180;
      const popup = b.phase === 'paddle' && b.caught && !popped;
      if (popup) popped = true;
      const ev = stepRide(b, { paddle: b.phase === 'paddle', steer: popped ? Math.max(-1, Math.min(1, -err / 30)) : 0, crouch: 0, popup }, water, dt);
      if (ev) events.push(ev);
      if (b.phase === 'ride') rodeS += dt;
      if (ev === 'wipeout' || ev === 'kickout') break;
    }
    expect(events).toContain('caught');
    expect(events).toContain('popup');
    expect(events).not.toContain('wipeout');
    expect(rodeS).toBeGreaterThan(5);
  });
});
