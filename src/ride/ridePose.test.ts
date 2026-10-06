import { describe, expect, it } from 'vitest';
import { type RideBody, startBody } from './ridePhysics';
import type { CameraPose } from '../dev/momentLink';
import { LOOK_HOLD_S, RIDE_BACK_M, RIDE_UP_M, RideCamera } from './ridePose';
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

describe('the ride camera from behind, and over her shoulder in the tube (Andrew 2026-10-04: "we can\'t see the face of the wave ahead")', () => {
  const settle = (cam: RideCamera, b: RideBody, cover = 0, s = 3) => {
    let pose = cam.update(b, DT, () => 0, undefined, cover);
    for (let t = 0; t < s; t += DT) pose = cam.update(b, DT, () => 0, undefined, cover);
    return pose;
  };
  /** Up and running down the line (−z) at 10 m/s, the swell running +x. */
  const riding = (): RideBody => {
    const b = startBody(0, 0, 0, flatWater());
    b.phase = 'ride';
    b.phaseT = 2;
    b.vz = -10;
    return b;
  };

  it('riding, it follows behind her and looks ahead down the line', () => {
    const pose = settle(new RideCamera(), riding());
    expect(pose.position[2]).toBeGreaterThan(3); // behind her (+z)
    expect(pose.position[0]).toBeGreaterThan(0); // a little to the shore side (+x), off the face
    expect(pose.position[0]).toBeLessThan(1.5);
    expect(Math.min(pose.yawDeg, 360 - pose.yawDeg)).toBeLessThan(10); // looking −z, down the line
  });

  it('riding with the wave as well as across it, it trails her along the line, not out the back of the wave', () => {
    // Andrew 2026-10-04: "behind them as they travel left, across the wave. Currently, the camera is behind the wave".
    // Carried in by the swell (+x, 8 m/s) while running down the line (−z) at 6 m/s: her run is mostly shoreward.
    const b = riding();
    b.water.c = 8;
    b.vx = 8;
    b.vz = -6;
    const pose = settle(new RideCamera(), b);
    expect(pose.position[2]).toBeGreaterThan(3); // up the line behind her (+z)
    expect(pose.position[2]).toBeLessThan(5); // close, so the whitewater behind her doesn't fill the frame
    expect(pose.position[0]).toBeGreaterThan(-0.5); // not out the back of the wave (−x)
    expect(Math.min(pose.yawDeg, 360 - pose.yawDeg)).toBeLessThan(20); // looking down the line at the wall
  });

  it('stays close at speed: her moving does not drag it further back', () => {
    const cam = new RideCamera(), b = riding();
    b.vz = -13;
    let pose = cam.update(b, DT, () => 0);
    for (let t = 0; t < 3; t += DT) {
      b.z += b.vz * DT;
      pose = cam.update(b, DT, () => 0);
    }
    expect(pose.position[2] - b.z).toBeLessThan(5);
    expect(pose.position[2] - b.z).toBeGreaterThan(3);
  });


  it('under a curl it goes over her shoulder (the shore side), still looking down the line, and back out after', () => {
    const cam = new RideCamera(), b = riding();
    settle(cam, b);
    const pov = settle(cam, b, 1, 1);
    expect(Math.hypot(pov.position[0], pov.position[2])).toBeLessThan(1.5);
    expect(pov.position[1]).toBeGreaterThan(1.2);
    expect(pov.position[0]).toBeGreaterThan(0.1); // the shore side (+x), away from the wall
    expect(Math.min(pov.yawDeg, 360 - pov.yawDeg)).toBeLessThan(10);
    expect(settle(cam, b, 0, 3).position[2]).toBeGreaterThan(3);
  });
});

describe('the take-off camera (R1 §4)', () => {
  const DEG = Math.PI / 180;
  // The swell runs toward the beach (+x) at 8 m/s on flat water.
  const water = () => ({ y: 0, slopeX: 0, slopeZ: 0, foam: 0, ux: 0, uz: 0, c: 8, dirX: 1, dirZ: 0 });
  const paddlingBody = (): RideBody => startBody(0, 0, 90, water);
  const ridingBody = (): RideBody => {
    const b = startBody(0, 0, 0, water);
    b.phase = 'ride';
    b.phaseT = 2;
    b.vx = 8 * -b.water.dirZ; b.vz = 8 * b.water.dirX; // along the line (−dirZ, dirX)
    return b;
  };
  const inFrame = (pose: CameraPose, p: [number, number, number]) => {
    const yaw = pose.yawDeg * DEG, pitch = pose.pitchDeg * DEG;
    const look = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const d = [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]], n = Math.hypot(d[0], d[1], d[2]);
    return Math.acos((look[0] * d[0] + look[1] * d[1] + look[2] * d[2]) / n) / DEG <= 40;
  };
  it('paddling: the rider and the oncoming crest are both in frame, from the shoulder side', () => {
    const b = paddlingBody(), cam = new RideCamera();
    let pose!: CameraPose;
    for (let k = 0; k < 60; k++) pose = cam.update(b, 1 / 60, () => 0);
    const shore = [b.water.dirX, b.water.dirZ];
    const crest: [number, number, number] = [b.x - shore[0] * 12, 2, b.z - shore[1] * 12];
    expect(inFrame(pose, [b.x, b.y + 1, b.z]), 'the rider').toBe(true);
    expect(inFrame(pose, crest), 'the crest').toBe(true);
    // on the shoulder side (along the line), not behind her along her run
    const line = [-shore[1], shore[0]];
    const along = (pose.position[0] - b.x) * line[0] + (pose.position[2] - b.z) * line[1];
    expect(Math.abs(along)).toBeGreaterThan(5);
  });
  it('a look swing during paddle still pivots around the rider', () => {
    const b = paddlingBody(), cam = new RideCamera();
    let pose!: CameraPose;
    for (let k = 0; k < 60; k++) pose = cam.update(b, 1 / 60, () => 0, k === 30 ? { yawDeg: 40, pitchDeg: 0 } : undefined);
    expect(inFrame(pose, [b.x, b.y + 1, b.z])).toBe(true);
  });
  it('standing: the pose is the along-the-line ride camera (unchanged)', () => {
    const b = ridingBody(), cam = new RideCamera();
    let pose!: CameraPose;
    for (let k = 0; k < 120; k++) pose = cam.update(b, 1 / 60, () => 0);
    const line = [-b.water.dirZ, b.water.dirX];
    const back = -((pose.position[0] - b.x) * line[0] + (pose.position[2] - b.z) * line[1]) * Math.sign(b.vx * line[0] + b.vz * line[1]);
    expect(back).toBeCloseTo(RIDE_BACK_M, 0);
    expect(pose.position[1] - b.y).toBeCloseTo(RIDE_UP_M, 0);
  });
});
