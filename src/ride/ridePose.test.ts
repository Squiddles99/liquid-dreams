import { describe, expect, it } from 'vitest';
import { startBody } from './ridePhysics';
import { LOOK_HOLD_S, RideCamera } from './ridePose';
import { flatWater } from './water';

const DT = 1 / 60;
const yawGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('the ride camera: the player can look around, and it goes home (Andrew 2026-10-04)', () => {
  it('a look swings the view around the rider; LOOK_HOLD_S later it eases back to its framing', () => {
    const b = startBody(0, 0, 90, flatWater());
    const cam = new RideCamera(), still = new RideCamera();
    const water = (): number => 0;
    let home = still.update(b, DT, water);
    cam.update(b, DT, water);
    const swung = cam.update(b, DT, water, { yawDeg: 90, pitchDeg: 0 });
    home = still.update(b, DT, water);
    expect(yawGap(swung.yawDeg, home.yawDeg)).toBeGreaterThan(80);
    // Still where the player put it just before the hold runs out…
    let pose = swung;
    for (let t = 0; t < LOOK_HOLD_S - 0.2; t += DT) { pose = cam.update(b, DT, water); home = still.update(b, DT, water); }
    expect(yawGap(pose.yawDeg, home.yawDeg)).toBeGreaterThan(80);
    // …then back home within a couple of seconds.
    for (let t = 0; t < 2.5; t += DT) { pose = cam.update(b, DT, water); home = still.update(b, DT, water); }
    expect(yawGap(pose.yawDeg, home.yawDeg)).toBeLessThan(2);
  });

  it('looking up drops the camera, never under the water, and keeps the rider in view', () => {
    const b = startBody(0, 0, 90, flatWater());
    const cam = new RideCamera();
    const water = (): number => 0;
    const level = cam.update(b, DT, water);
    const up = cam.update(b, DT, water, { yawDeg: 0, pitchDeg: 60 });
    expect(up.position[1]).toBeLessThan(level.position[1]);
    expect(up.position[1]).toBeGreaterThanOrEqual(0.5);
    expect(up.pitchDeg).toBeGreaterThan(level.pitchDeg);
  });
});
