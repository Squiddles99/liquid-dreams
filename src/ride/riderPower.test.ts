// Rider power profiles (Andrew, 2026-10-14: true-to-life male/female power gap, with the counterweights; no T-Bone meta).
// Research: relative leg power men ~57 vs women ~45 W/kg (CMJ, ~20 % lower); competitive surfers: men ~11 % faster peak
// paddle speed (ECU 2017, 20 + 20). Today's tuning is Shazza's; T-Bone scales up from it.
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../surfer/presets';
import { NO_CONTROLS, speedOf, startBody, stepRide, TUNING } from './ridePhysics';
import { COM_TRAVEL_M, PUMP_POWER_WKG, legRiseRate, newRiderState, riderBodyOf } from './riderBody';
import { flatWater } from './water';

const shazza = riderBodyOf(PRESETS.female);
const tbone = riderBodyOf(PRESETS.male);

describe('rider power profiles', () => {
  it('Shazza keeps the tuned values the game was built on; T-Bone has ~26 % more leg power per kg', () => {
    expect(shazza.legPowerWkg).toBe(PUMP_POWER_WKG);
    expect(shazza.paddleStrength).toBe(1);
    expect(tbone.legPowerWkg / shazza.legPowerWkg).toBeGreaterThan(1.2);
    expect(tbone.legPowerWkg / shazza.legPowerWkg).toBeLessThan(1.32);
  });

  it('Grommet (the bodyboard) is unchanged', () => {
    const g = riderBodyOf(PRESETS.grommet);
    expect(g.legPowerWkg).toBe(PUMP_POWER_WKG);
    expect(g.paddleStrength).toBe(1);
  });

  it('the leg travel scales with height: the default rider (1.65 m) keeps COM_TRAVEL_M', () => {
    expect(newRiderState(1.65, 55).comTravelM).toBeCloseTo(COM_TRAVEL_M, 6);
    expect(newRiderState(1.78, 68).comTravelM).toBeCloseTo(COM_TRAVEL_M * 1.78 / 1.65, 6);
  });

  it('under a heavy load the weaker legs straighten more slowly (power against the full load); at rest load both are free', () => {
    const s = newRiderState(1.65, 55, shazza);
    const t = newRiderState(1.78, 68, tbone);
    expect(legRiseRate(s, 1.9)).toBeLessThan(legRiseRate(t, 1.9));
    expect(legRiseRate(s, 1.9) / legRiseRate(t, 1.9)).toBeGreaterThan(0.72);
    expect(legRiseRate(s, 1.0)).toBe(legRiseRate(t, 1.0));
  });

  it('T-Bone paddles ~11 % faster than Shazza on flat water (the gap players feel most)', () => {
    const top = (rider: { standH: number; massKg: number } & ReturnType<typeof riderBodyOf>) => {
      const b = startBody(0, 0, 0, flatWater(), rider);
      for (let i = 0; i < 60 * 20; i++) stepRide(b, { ...NO_CONTROLS, paddle: true }, flatWater(), 1 / 60, TUNING.intermediate);
      return speedOf(b);
    };
    const vs = top({ standH: 1.65, massKg: 55, ...shazza });
    const vt = top({ standH: 1.78, massKg: 68, ...tbone });
    expect(vt / vs).toBeGreaterThan(1.08);
    expect(vt / vs).toBeLessThan(1.15);
  });

  it('the default rider paddles exactly as before (no rider given: Shazza)', () => {
    const run = (b: ReturnType<typeof startBody>) => {
      for (let i = 0; i < 60 * 5; i++) stepRide(b, { ...NO_CONTROLS, paddle: true }, flatWater(), 1 / 60, TUNING.intermediate);
      return speedOf(b);
    };
    expect(run(startBody(0, 0, 0, flatWater()))).toBeCloseTo(run(startBody(0, 0, 0, flatWater(), { standH: 1.65, massKg: 55, ...shazza })), 9);
  });
});
