import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { SWELL_BANDS } from '../frontend/sessionSetup';
import { coastReefField } from '../breaker/testField';
import { DEFAULT_SET_PARAMS, wavesBetween, wavesNear } from '../swell/sets';
import { DEFAULT_BREAK_PARAMS as P } from '../breaker/breaking';
import { minRibbonHeight, traceStations } from '../breaker/crestTrace';
import { sampleField } from '../breaker/reefField';
import { breakOptions, fieldBreakingHeight, sumWaves, toActiveWave } from '../breaker/setWaveModel';
import { MAX_SECTION_SLOPE, withSections } from './sectionWater';
import { type WaterFn, waterAt } from './water';
import { WIPEOUT_SLOPE } from './ridePhysics';
import { TAKEOFF_ARRIVE_S, takeoffLeadS, takeoffSpot } from './takeoff';

/**
 * The wipe regression (2026-10-15, docs/superpowers/evidence/womb-story/wipe/): the game's sheet, where it is the drawing's
 * stood face (womb-story Task 11) ahead of the curl, stands steeper than the ride's wipeout slope with no station near to
 * draw a section; the ride reads the drawn face as it reads a section (sectionWater.MAX_SECTION_SLOPE).
 */
describe('the drawn face on the game\'s sheet, as the ride reads it', () => {
  it('Solid at the take-off: the sheet marks its drawn face, steeper there than WIPEOUT_SLOPE raw, and the ride reads it at most MAX_SECTION_SLOPE', { timeout: 300_000 }, () => {
    const c = cloneConditions(DEFAULT_CONDITIONS), band = SWELL_BANDS.find((x) => x.label === 'Solid')!;
    c.swell.sizeFt = band.ft; c.swell.periodS = band.periodS; c.swell.directionDeg = 225; c.tideM = 0;
    const field = coastReefField({ periodS: c.swell.periodS, fromDeg: c.swell.directionDeg, tideM: c.tideM, peel: true });
    const ctx = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
    const set = wavesBetween(0, 600, c, DEFAULT_SET_PARAMS).filter((e) => e.arrivalS > 10).slice(0, 8);
    const big = set.reduce((a, b) => (b.heightM > a.heightM ? b : a));
    const o = { ...breakOptions(field, P), pile: false, shape: 'lean' as const }, minHeightM = minRibbonHeight(fieldBreakingHeight(field, P), P);
    const spot = takeoffSpot(field, big.heightM, P);
    const arrive = big.arrivalS - takeoffLeadS(field, spot) + TAKEOFF_ARRIVE_S;
    let drawn = 0, steepRaw = 0;
    const over: string[] = [];
    for (const dt of [-1, -0.5, 0, 0.5, 1]) {
      const t = arrive + dt, waves = wavesNear(t, c, DEFAULT_SET_PARAMS).map(toActiveWave);
      const sheet: WaterFn = (x, z) => waterAt(x, z, c.tideM, ctx.omega, (a, b) => sampleField(field, a, b), (a, b, f) => sumWaves(a, b, t, f, waves, ctx, o));
      const ride = withSections(sheet, traceStations(field, waves, t, ctx, { cameraX: spot.x, cameraZ: spot.z, params: P, minHeightM }), c.tideM);
      const d = sheet(spot.x, spot.z), tx = -d.dirZ, tz = d.dirX;
      for (let v = -40; v <= 40; v += 8) for (let u = -20; u <= 20; u += 0.5) {
        const x = spot.x + d.dirX * u + tx * v, z = spot.z + d.dirZ * u + tz * v;
        const raw = sheet(x, z), w = ride(x, z), g = Math.hypot(w.slopeX, w.slopeZ);
        if (!((raw.drawnFace ?? 0) > 0) || w.onSection) continue;
        drawn++;
        if (Math.hypot(raw.slopeX, raw.slopeZ) > WIPEOUT_SLOPE) steepRaw++;
        if (g > MAX_SECTION_SLOPE + 1e-9) over.push(`t ${dt} u ${u} v ${v}: ${g.toFixed(2)}`);
      }
    }
    console.log(`drawn-face samples ${drawn}, raw over WIPEOUT_SLOPE ${steepRaw}, ride over MAX_SECTION_SLOPE ${over.length}`);
    expect(drawn).toBeGreaterThan(20);
    expect(steepRaw).toBeGreaterThan(0);
    expect(over).toEqual([]);
  });
});
