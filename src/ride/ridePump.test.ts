import { describe, expect, it } from 'vitest';
import { type RideBody, type RideControls, NO_CONTROLS, TUNING, speedOf, startBody, stepRide } from './ridePhysics';
import { PUMP_EXTEND_MIN, PUMP_EXTEND_SHARE, PUMP_POWER_WKG, PUMP_WEAVE, weaveSteer } from './riderBody';
import { type WaterFn, flatWater } from './water';

const DT = 1 / 60;
/** A face running +x (the travel), down toward +x at s; the rider rides it north along the line. */
const face = (s: number): WaterFn => (x) => ({ y: -s * x, slopeX: -s, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
const riding = (water: WaterFn, v = 8): RideBody => {
  const b = startBody(0, 0, 0, water);
  b.phase = 'ride';
  b.phaseT = 1;
  b.vz = -v;
  return b;
};
const run = (b: RideBody, c: (t: number, b: RideBody) => RideControls, water: WaterFn, s: number, tune = TUNING.expert): void => {
  for (let i = 0; i < s / DT; i++) stepRide(b, c((i + 1) * DT, b), water, DT, tune);
};
/** The weave: hard carves either way, 1 s a cycle. */
const weave = (t: number): number => Math.sin(2 * Math.PI * t);
/** Expert timing: extend (RT) into the turn's load peak, full travel; compress (LT) as it unloads. */
const pump = (t: number, b: RideBody): RideControls => ({ ...NO_CONTROLS, steer: weave(t), crouch: b.load - b.n0 > 0.45 ? -1 : 1 });
const backwards = (t: number, b: RideBody): RideControls => ({ ...NO_CONTROLS, steer: weave(t), crouch: b.load - b.n0 > 0.45 ? 1 : -1 });
const still = (t: number): RideControls => ({ ...NO_CONTROLS, steer: weave(t), crouch: 0 });

describe('pumping (ride-speed spec §4.1)', () => {
  it('a timed pump on the face gains 0.15–0.8 m/s a weave cycle (two pumps) over the same weave unpumped', () => {
    const a = riding(face(0.35)), b = riding(face(0.35));
    run(a, pump, face(0.35), 4);
    run(b, still, face(0.35), 4);
    const perCycle = (speedOf(a) - speedOf(b)) / 4;
    expect(perCycle).toBeGreaterThan(0.15);
    expect(perCycle).toBeLessThan(0.8);
  });
  it('timed backwards it loses', () => {
    const a = riding(face(0.35)), b = riding(face(0.35));
    run(a, backwards, face(0.35), 4);
    run(b, still, face(0.35), 4);
    expect(speedOf(a)).toBeLessThan(speedOf(b));
  });
  it('on flat water it cannot hold the rider\'s speed', () => {
    const a = riding(flatWater(), 6);
    run(a, pump, flatWater(), 5);
    expect(speedOf(a)).toBeLessThan(6);
  });
  it('realism guard: the pump adds no more than the legs’ power over the same run', () => {
    const a = riding(flatWater(), 8), b = riding(flatWater(), 8);
    run(a, pump, flatWater(), 5);
    run(b, still, flatWater(), 5);
    expect(0.5 * speedOf(a) ** 2 - 0.5 * speedOf(b) ** 2).toBeLessThanOrEqual(PUMP_POWER_WKG * 5 + 1e-6);
  });
  it('the load reads about 1 in a straight run and more in a hard carve', () => {
    const a = riding(flatWater(), 8);
    run(a, () => NO_CONTROLS, flatWater(), 0.5);
    expect(a.load).toBeCloseTo(1, 1);
    run(a, () => ({ ...NO_CONTROLS, steer: 1 }), flatWater(), 0.3);
    expect(a.load).toBeGreaterThan(1.5);
  });
});

describe('the pump assist (RB held)', () => {
  const held = (): RideControls => ({ ...NO_CONTROLS, pump: true });
  /** A perfect manual pump: the assist's own weave and timing, by hand (so the ratio is the assist's efficiency). */
  const expertOnWeave = (t: number, b: RideBody): RideControls => ({
    ...NO_CONTROLS, steer: weaveSteer(t, 1.8), crouch: b.load - b.n0 > Math.max(PUMP_EXTEND_MIN, PUMP_EXTEND_SHARE * b.loadPeak) ? -1 : 1,
  });
  const plain = (t: number): RideControls => ({ ...NO_CONTROLS, steer: weaveSteer(t, 1.8) });
  it('beginner: about 70 % of the expert’s gain on the same face', () => {
    const a = riding(face(0.35)), e = riding(face(0.35)), n = riding(face(0.35));
    run(a, held, face(0.35), 4, TUNING.beginner);
    run(e, expertOnWeave, face(0.35), 4, TUNING.expert);
    run(n, plain, face(0.35), 4, TUNING.expert);
    const ratio = (speedOf(a) - speedOf(n)) / (speedOf(e) - speedOf(n));
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });
  it('beginner holding pump on the flats still slows', () => {
    const a = riding(flatWater(), 6);
    run(a, held, flatWater(), 5, TUNING.beginner);
    expect(speedOf(a)).toBeLessThan(6);
  });
  it('expert: RB does nothing', () => {
    const a = riding(face(0.35)), b = riding(face(0.35));
    run(a, held, face(0.35), 3, TUNING.expert);
    run(b, () => NO_CONTROLS, face(0.35), 3, TUNING.expert);
    expect(speedOf(a)).toBeCloseTo(speedOf(b), 6);
  });
  it('the weave is ±PUMP_WEAVE, about 1 s a cycle on a 6 ft (1.8 m) face', () => {
    expect(Math.abs(weaveSteer(0.25, 1.8))).toBeCloseTo(PUMP_WEAVE, 1);
    expect(weaveSteer(1.006, 1.8)).toBeCloseTo(0, 1);
  });
});
