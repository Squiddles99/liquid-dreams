import { describe, expect, it } from 'vitest';
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
