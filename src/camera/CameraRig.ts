import * as THREE from 'three/webgpu';
import { type Ground, type WalkState, canStand, initialWalkState, stepWalk } from '../beach/walk';
import type { CameraMode, CameraPose } from '../dev/momentLink';
import { DEFAULT_LINEUP_POSITION } from '../dev/referenceMoments';
import type { Input } from './Input';
import { type LineupState, initialLineupState, stepLineup } from './lineup';
import { applyMouseLook, lookDirection } from './look';
import { type FreeState, adjustSpeed, stepFree } from './movement';

/** The still water a return to the lineup needs under it, or it goes back to the last lineup spot instead. */
const LINEUP_MIN_DEPTH_M = 0.2;

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60000);
  mode: CameraMode = 'lineup';
  private lineup: LineupState;
  private free: FreeState;
  private walk: WalkState | null = null;
  private ground: Ground | null = null;

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
    if (this.mode === 'walk' && this.walk) return { x: this.walk.x, z: this.walk.z };
    if (this.mode === 'free') return { x: this.free.position[0], z: this.free.position[2] };
    return { x: this.lineup.x, z: this.lineup.z };
  }

  /**
   * Where walking can stand (Phase 4c-1 §3.1), or null before the land has loaded: walk mode is then skipped, and a
   * walk pose becomes a free one at the same position.
   */
  setGround(g: Ground | null): void {
    this.ground = g;
    if (!g && this.mode === 'walk') {
      const p = this.getPose();
      this.free = { ...this.free, position: p.position, look: { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg } };
      this.mode = 'free';
      this.apply();
    }
  }

  /** The walking ground's height at (x, z); NaN without ground. */
  groundAt(x: number, z: number): number {
    return this.ground ? this.ground.groundAt(x, z) : Number.NaN;
  }

  setPose(p: CameraPose, waterHeight = 0): void {
    const look = { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg };
    // The lineup and walk cameras take their height from the water or the ground (plus the eye height), never from a
    // saved pose, so p.position[1] is informational only for them.
    if (p.mode === 'lineup') {
      this.lineup = initialLineupState(p.position[0], p.position[2], look, waterHeight);
      this.mode = 'lineup';
    } else if (p.mode === 'walk' && this.ground) {
      this.walk = initialWalkState(p.position[0], p.position[2], look, this.ground);
      this.mode = 'walk';
    } else {
      this.free = { ...this.free, position: [...p.position], look };
      this.mode = 'free';
    }
    this.apply();
  }

  getPose(): CameraPose {
    if (this.mode === 'lineup') {
      const l = this.lineup;
      return { mode: 'lineup', position: [l.x, l.height.value, l.z], yawDeg: l.look.yawDeg, pitchDeg: l.look.pitchDeg };
    }
    if (this.mode === 'walk' && this.walk) {
      const w = this.walk;
      return { mode: 'walk', position: [w.x, w.height.value, w.z], yawDeg: w.look.yawDeg, pitchDeg: w.look.pitchDeg };
    }
    return { mode: 'free', position: [...this.free.position], yawDeg: this.free.look.yawDeg, pitchDeg: this.free.look.pitchDeg };
  }

  update(dt: number, input: Input, waterHeight: number): void {
    if (input.consumePressed('KeyC')) this.cycleMode(waterHeight);
    const { dx, dy } = input.consumeMouse();
    const wheel = input.consumeWheel();
    const keys = input.moveKeys();
    if (this.mode === 'lineup') {
      this.lineup = stepLineup({ ...this.lineup, look: applyMouseLook(this.lineup.look, dx, dy) }, keys, waterHeight, dt);
    } else if (this.mode === 'walk' && this.walk && this.ground) {
      this.walk = stepWalk({ ...this.walk, look: applyMouseLook(this.walk.look, dx, dy) }, keys, this.ground, dt);
    } else {
      const look = applyMouseLook(this.free.look, dx, dy);
      this.free = stepFree({ ...this.free, look, baseSpeedMs: adjustSpeed(this.free.baseSpeedMs, wheel) }, keys, dt);
    }
    this.apply();
  }

  /**
   * C: lineup → free → walk → lineup. Free → walk drops onto the ground below, unless there's no ground yet or the water
   * there is too deep to stand in: then back to the lineup.
   */
  cycleMode(waterHeight: number): void {
    const p = this.getPose();
    const look = { yawDeg: p.yawDeg, pitchDeg: p.pitchDeg };
    if (this.mode === 'lineup') {
      this.free = { ...this.free, position: p.position, look };
      this.mode = 'free';
    } else if (this.mode === 'free' && this.ground && canStand(this.ground, p.position[0], p.position[2])) {
      this.walk = initialWalkState(p.position[0], p.position[2], look, this.ground);
      this.mode = 'walk';
    } else {
      // Set down in the water where you are, unless that's dry land (the lineup's eye would be under the sand): then
      // back to the last lineup spot (final review I1).
      const ground = this.groundAt(p.position[0], p.position[2]);
      const dry = Number.isFinite(ground) && ground > waterHeight - LINEUP_MIN_DEPTH_M;
      const [x, z] = dry ? [this.lineup.x, this.lineup.z] : [p.position[0], p.position[2]];
      this.lineup = initialLineupState(x, z, look, waterHeight);
      this.mode = 'lineup';
    }
    this.apply();
  }

  private apply(): void {
    const pose = this.getPose();
    const [x, y, z] = pose.position;
    const d = lookDirection({ yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg });
    this.camera.position.set(x, y, z);
    this.camera.lookAt(x + d[0], y + d[1], z + d[2]);
  }
}
