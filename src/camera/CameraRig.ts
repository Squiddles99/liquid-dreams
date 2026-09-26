import * as THREE from 'three/webgpu';
import type { CameraMode, CameraPose } from '../dev/momentLink';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import type { Input } from './Input';
import { type LineupState, initialLineupState, stepLineup } from './lineup';
import { applyMouseLook, lookDirection } from './look';
import { type FreeState, adjustSpeed, stepFree } from './movement';

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60000);
  mode: CameraMode = 'lineup';
  private lineup: LineupState;
  private free: FreeState;

  constructor() {
    this.lineup = initialLineupState(DEFAULT_LINEUP_POSITION[0], DEFAULT_LINEUP_POSITION[2], { yawDeg: 270, pitchDeg: -2 });
    this.free = { position: [0, 10, 0], look: { yawDeg: 270, pitchDeg: -10 }, baseSpeedMs: 10 };
    this.apply();
  }

  /**
   * Where to sample the water height: under the lineup camera, or under the free-fly camera so that switching
   * back to lineup (C) seeds the float height from the water where it lands.
   */
  get probeXZ(): { x: number; z: number } {
    if (this.mode === 'free') return { x: this.free.position[0], z: this.free.position[2] };
    return { x: this.lineup.x, z: this.lineup.z };
  }

  setPose(p: CameraPose, waterHeight = 0): void {
    this.mode = p.mode;
    const look = { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg };
    // The lineup camera floats: its height always comes from the water surface plus the eye height,
    // never from a saved pose, so p.position[1] is informational only and intentionally ignored here.
    if (p.mode === 'lineup') this.lineup = initialLineupState(p.position[0], p.position[2], look, waterHeight);
    else this.free = { ...this.free, position: [...p.position], look };
    this.apply();
  }

  getPose(): CameraPose {
    if (this.mode === 'lineup') {
      const l = this.lineup;
      return { mode: 'lineup', position: [l.x, l.height.value, l.z], yawDeg: l.look.yawDeg, pitchDeg: l.look.pitchDeg };
    }
    return { mode: 'free', position: [...this.free.position], yawDeg: this.free.look.yawDeg, pitchDeg: this.free.look.pitchDeg };
  }

  update(dt: number, input: Input, waterHeight: number): void {
    if (input.consumePressed('KeyC')) this.toggleMode(waterHeight);
    const { dx, dy } = input.consumeMouse();
    const wheel = input.consumeWheel();
    const keys = input.moveKeys();
    if (this.mode === 'lineup') {
      this.lineup = stepLineup({ ...this.lineup, look: applyMouseLook(this.lineup.look, dx, dy) }, keys, waterHeight, dt);
    } else {
      const look = applyMouseLook(this.free.look, dx, dy);
      this.free = stepFree({ ...this.free, look, baseSpeedMs: adjustSpeed(this.free.baseSpeedMs, wheel) }, keys, dt);
    }
    this.apply();
  }

  private toggleMode(waterHeight: number): void {
    if (this.mode === 'lineup') {
      const p = this.getPose();
      this.free = { ...this.free, position: p.position, look: { ...this.lineup.look } };
      this.mode = 'free';
    } else {
      this.lineup = initialLineupState(this.free.position[0], this.free.position[2], { ...this.free.look }, waterHeight);
      this.mode = 'lineup';
    }
  }

  private apply(): void {
    const pose = this.getPose();
    const [x, y, z] = pose.position;
    const d = lookDirection({ yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg });
    this.camera.position.set(x, y, z);
    this.camera.lookAt(x + d[0], y + d[1], z + d[2]);
  }
}
