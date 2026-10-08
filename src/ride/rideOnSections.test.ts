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
import { LINE_OFF_DEG, aheadOf } from './rideLine';

/**
 * A rider on the drawn wave (Andrew, 2026-10-05: "the surfer wipes out instantly"): each size's set's biggest wave from the
 * take-off spot, as App.catchSetWave starts it (takeoff.takeoffSpot), the ride standing on the ribbon's sections (App.rideWater).
 * The rider faces the swell and paddles until caught, pops up once the face is steep under the board (as a surfer waits
 * for the wave to stand up: popped as soon as it lifted, the rider was left on the gentle front and the wave ran on), then
 * steers to hold a surfer's line, LINE_OFF_DEG off the swell toward the left, and is gated on riding in front of the crest.
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
    // Her wave's live stations at the last step traced (the ride test reads `ahead` from them).
    let herStations: Station[] = [];
    const waterAtT = (t: number, cx: number, cz: number): WaterFn => {
      const events = wavesNear(t, c, DEFAULT_SET_PARAMS), waves = events.map(toActiveWave);
      const mine = events.findIndex((e) => Math.abs(e.arrivalS - big.arrivalS) < 1e-6);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const entries = traceStations(field, waves, t, ctx, { cameraX: cx, cameraZ: cz, params: P, minHeightM });
      herStations = entries.filter((e): e is Station => !e.gap && e.wave === mine);
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
    // A surfer's line (R3 §1): LINE_OFF_DEG off the swell toward the left. To hold a place on the face her speed along the
    // travel must be c; at 12 m/s against c 10 that is 33° off it. (88°, R1–R2, left her ~0.3 m/s along the travel: over the
    // back within a second of the pop-up, and the "ride" was the board coasting behind the wave.)
    const line = swellHeading - LINE_OFF_DEG;
    const dt = 1 / 60, events: RideEvent[] = [], aheadAt: Record<string, number | undefined> = {};
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
      if (ev === 'popup') aheadAt.popup = ahead;
      if (b.phase === 'ride') {
        rodeS += dt;
        if (ahead !== undefined && ahead > 0) heldS += dt;
        for (const s of [1, 2, 3]) if (Math.abs(rodeS - s) < dt / 2) aheadAt[`ride+${s}`] = ahead;
      }
      if (ev === 'wipeout' || ev === 'kickout') break;
    }
    const last = b.water;
    console.log(`${ft} ft ${experience}: line ${LINE_OFF_DEG}°, held ${heldS.toFixed(2)} s of ${rodeS.toFixed(2)} s, end ${events[events.length - 1]} (foam ${last.foam.toFixed(2)}, section ${!!last.onSection}), ahead ${JSON.stringify(aheadAt)}`);
    expect(events).toContain('caught');
    expect(events).toContain('popup');
    expect(events).not.toContain('wipeout');
    expect(rodeS).toBeGreaterThan(5);
    // The ride is in front of the crest (R3 §1): 5 s or more of riding with her wave's nearest station behind her. A section's
    // back does not count (onSection is true there too), and a wave still traced while she coasts behind it does not count.
    expect(heldS).toBeGreaterThan(5);
    // A real end: the wave's (foam, or on a drawn section at the last step) or the window's. A stall behind the wave is not.
    expect({ foam: last.foam, onSection: !!last.onSection, rodeS, real: last.foam > 0 || last.onSection === true || rodeS >= 15 }).toMatchObject({ real: true });
  });
});
