import { describe, expect, it } from 'vitest';
import type { Ground } from '../beach/walk';
import { CameraRig } from './CameraRig';
import type { Input } from './Input';
import { NO_KEYS, type MoveKeys } from './movement';

/** Just enough of Input for CameraRig.update: optional C press and held movement keys. */
function fakeInput(pressC: boolean, keys: MoveKeys = NO_KEYS): Input {
  let c = pressC;
  return {
    consumePressed: (code: string) => { const hit = code === 'KeyC' && c; c = false; return hit; },
    consumeMouse: () => ({ dx: 0, dy: 0 }),
    consumeWheel: () => 0,
    moveKeys: () => keys,
  } as unknown as Input;
}

describe('CameraRig probe position', () => {
  it('samples under the lineup camera in lineup mode', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'lineup', position: [5, 0, 7], yawDeg: 270, pitchDeg: 0 });
    expect(rig.probeXZ).toEqual({ x: 5, z: 7 });
  });
  it('follows the free-fly camera so a return to lineup seeds from the water under it', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'lineup', position: [5, 0, 7], yawDeg: 270, pitchDeg: 0 });
    rig.setPose({ mode: 'free', position: [200, 30, -300], yawDeg: 90, pitchDeg: -10 });
    expect(rig.probeXZ).toEqual({ x: 200, z: -300 });
    // Fly east for a second, then press C: the probe must already be under the camera.
    rig.update(1, fakeInput(false, { ...NO_KEYS, forward: true }), 0);
    const { x, z } = rig.camera.position;
    expect(rig.probeXZ.x).toBeCloseTo(x);
    expect(rig.probeXZ.z).toBeCloseTo(z);
    expect(x).toBeGreaterThan(200);
    rig.update(0, fakeInput(true), 0.4);
    expect(rig.mode).toBe('lineup');
    expect(rig.probeXZ.x).toBeCloseTo(x);
    expect(rig.probeXZ.z).toBeCloseTo(z);
  });
});

describe('the walk mode', () => {
  const ground: Ground = { groundAt: (x) => 0.1 * x, waterLevel: () => 0 };
  it('cycles lineup → free → walk → lineup, skipping walk without ground or over deep water', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'free', position: [20, 10, 0], yawDeg: 90, pitchDeg: 0 });
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup'); // no ground yet
    rig.setGround(ground);
    rig.setPose({ mode: 'free', position: [20, 10, 0], yawDeg: 90, pitchDeg: 0 });
    rig.cycleMode(0);
    expect(rig.mode).toBe('walk');
    expect(rig.getPose().position[1]).toBeCloseTo(2 + 1.7, 1);
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup');
    rig.setPose({ mode: 'free', position: [-50, 10, 0], yawDeg: 90, pitchDeg: 0 }); // 5 m deep below
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup');
  });
  it('C from walk on dry land returns to the last lineup (final review I1: never under the sand); from the swash, sets down there', () => {
    const rig = new CameraRig();
    rig.setGround(ground);
    rig.setPose({ mode: 'lineup', position: [-25, 0, 45], yawDeg: 270, pitchDeg: 0 });
    rig.setPose({ mode: 'walk', position: [20, 0, 0], yawDeg: 90, pitchDeg: 0 }); // ground 2 m, water 0
    rig.cycleMode(0);
    expect(rig.mode).toBe('lineup');
    expect(rig.probeXZ).toEqual({ x: -25, z: 45 });
    expect(rig.getPose().position[1]).toBeGreaterThan(0.5);
    rig.setPose({ mode: 'walk', position: [-8, 0, 3], yawDeg: 90, pitchDeg: 0 }); // wading: ground −0.8 m
    rig.cycleMode(0);
    expect(rig.probeXZ).toEqual({ x: -8, z: 3 });
  });
  it('a walk pose without ground falls back to free at that position', () => {
    const rig = new CameraRig();
    rig.setPose({ mode: 'walk', position: [20, 3.7, 0], yawDeg: 90, pitchDeg: 0 });
    expect(rig.mode).toBe('free');
    expect(rig.getPose().position).toEqual([20, 3.7, 0]);
  });
});
