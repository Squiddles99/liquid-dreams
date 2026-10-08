import { describe, expect, it } from 'vitest';
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
import { type Experience, type RideEvent, TUNING, startBody, stepRide } from './ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from './takeoff';

/**
 * A rider on the drawn wave (Andrew, 2026-10-05: "the surfer wipes out instantly"): each size's set's biggest wave from the
 * take-off spot, as App.catchSetWave starts it (takeoff.takeoffSpot), the ride standing on the ribbon's sections (App.rideWater).
 * The rider faces the swell and paddles until caught, pops up once the face is steep under the board (as a surfer waits
 * for the wave to stand up: popped as soon as it lifted, the rider was left on the gentle front and the wave ran on), then
 * steers to hold a line along the left.
 */
describe('a ride on the drawn sections', () => {
  // 6 ft at every Experience level (plan Review Focus 5: the assist is forgiveness, not the engine), 12 ft at intermediate.
  it.each([[6, 'intermediate'], [12, 'intermediate'], [6, 'beginner'], [6, 'expert']] as [number, Experience][])('a %i ft set wave (%s): caught, popped up and ridden along the left for 5 s or more without a wipeout', { timeout: 300_000 }, (ft, experience) => {
    const c = cloneConditions(DEFAULT_CONDITIONS);
    c.swell.sizeFt = ft;
    const field = computeReefField({ bed: downsample(buildBathymetry(DEFAULT_REEF_PARAMS), 2), periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: P.peel, smooth: true, refractFloorM: REFRACT_FLOOR_M });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    // Her wave's live stations at the last step traced (R2 §3: the ride must not end because they vanished).
    let herLive = 0;
    const waterAtT = (t: number, cx: number, cz: number): WaterFn => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const entries = traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM });
      herLive = entries.filter((e): e is Station => !e.gap && e.wave === mine).length;
      return withSections(sheet, entries, c.tideM);
    };
    const { x: sx, z: sz } = takeoffSpot(field, big.heightM, P);
    let t = big.arrivalS - takeoffLeadS(field, { x: sx, z: sz });
    // The crest reaches the spot TAKEOFF_ARRIVE_S after the start; the rider waits, then paddles for the last PADDLE_FROM_S
    // (paddling from the start carried her 8–9 m in, onto the onset itself: the R1 review).
    const arrive = t + TAKEOFF_ARRIVE_S, PADDLE_FROM_S = 2;
    const start = waterAtT(t, sx, sz)(sx, sz);
    const swellHeading = Math.atan2(start.dirX, -start.dirZ) / (Math.PI / 180);
    const b = startBody(sx, sz, swellHeading, waterAtT(t, sx, sz));
    // The left: facing the beach, the rider's left, a little toward the beach (heading 330° at the default swell).
    const line = swellHeading - 88;
    const dt = 1 / 60, events: RideEvent[] = [];
    let popped = false, rodeS = 0;
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
      if (b.phase === 'ride') rodeS += dt;
      if (ev === 'wipeout' || ev === 'kickout') break;
    }
    expect(events).toContain('caught');
    expect(events).toContain('popup');
    expect(events).not.toContain('wipeout');
    expect(rodeS).toBeGreaterThan(5);
    // Not ended by her wave vanishing from under her (R2 §3): at the end it is still traced, or the end is the wave's
    // (foam, or on a drawn section), or the window's. (The kickouts here at 10-14 s are stalls behind the wave, R2 §1's
    // probe: she is over the back within ~1 s of the pop-up on this line, 88° off the swell.)
    const last = b.water;
    expect({ herLive, foam: last.foam, onSection: !!last.onSection, rodeS, real: herLive > 0 || last.foam > 0 || last.onSection === true || rodeS >= 15 }).toMatchObject({ real: true });
  });
});
