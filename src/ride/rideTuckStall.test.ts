import { describe, expect, it } from 'vitest';
import { type RideBody, type RideControls, NO_CONTROLS, TUNING, speedOf, startBody, stepRide } from './ridePhysics';
import type { WaterFn } from './water';

const DT = 1 / 60;
const face = (s: number): WaterFn => (x) => ({ y: -s * x, slopeX: -s, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
const riding = (water: WaterFn, headingDeg: number, v: number): RideBody => {
  const b = startBody(0, 0, headingDeg, water);
  const h = (headingDeg * Math.PI) / 180;
  b.phase = 'ride';
  b.phaseT = 1;
  b.vx = Math.sin(h) * v;
  b.vz = -Math.cos(h) * v;
  return b;
};
const run = (b: RideBody, c: RideControls, water: WaterFn, s: number): void => {
  for (let i = 0; i < s / DT; i++) stepRide(b, c, water, DT, TUNING.intermediate);
};

describe('tuck and drive (ride-speed spec §4.2)', () => {
  it('on the line, a tuck keeps more speed over 3 s than standing', () => {
    // heading 340: along the line (north), a little down the face
    const t = riding(face(0.3), 340, 12), s = riding(face(0.3), 340, 12);
    run(t, { ...NO_CONTROLS, crouch: 1 }, face(0.3), 3);
    run(s, NO_CONTROLS, face(0.3), 3);
    expect(t.tuck).toBeGreaterThan(0.8);
    expect(speedOf(t)).toBeGreaterThan(speedOf(s));
  });
  it('straightened out (heading down the face, off the line), it is no tuck and the rider still slows on the flats', () => {
    const flat: WaterFn = () => ({ y: 0, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 7, dirX: 1, dirZ: 0 });
    const t = riding(flat, 90, 10);
    run(t, { ...NO_CONTROLS, crouch: 1 }, flat, 2);
    expect(t.tuck).toBeLessThan(0.05);
    expect(speedOf(t)).toBeLessThan(10);
  });
});
