import * as THREE from 'three/webgpu';
import { bearingToWorldXZ } from '../conditions/directions';
import type { Sky } from '../sky/Sky';
import { LightningClock, type LightningFrame, boltPath } from './lightning';
import type { Strike } from './rainModel';

/** The glow of a fully lit cloud (scene radiance; an overcast sky is ~0.3) and its colour: a cold blue-white. */
const FLASH_RADIANCE = 1.6;
const FLASH_COLOUR: readonly [number, number, number] = [0.85, 0.92, 1.1];
/** The sky light's lift at a full flash. */
const FLASH_IRRADIANCE = 0.8;
/** The lit patch of cloud is about this wide (m) around the strike. */
const FLASH_PATCH_M = 4000;
/** A bolt's radiance at a full flash (it tone-maps to white). */
const BOLT_RADIANCE = 60;
const BOLT_SEGMENTS = 24;

/**
 * Lightning in the scene (weather W2 Task 6): each frame, the flash from the schedule lights the cloud around the strike
 * and lifts the sky light; a cloud-to-ground strike draws its bolt from the cloud base to the ground.
 */
export class LightningView {
  readonly bolt: THREE.Line;
  private readonly clock = new LightningClock();
  private readonly boltMaterial: THREE.LineBasicMaterial;
  private boltFor: number | null = null;
  private readonly at = new THREE.Vector3();

  constructor(private readonly sky: Sky) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3));
    this.boltMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.bolt = new THREE.Line(g, this.boltMaterial);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
  }

  /** This frame's lightning; returns the strikes that fired (for the thunder). */
  update(seed: number, storm: number, simTimeS: number, cloudBaseM: number, camera: THREE.Vector3): LightningFrame {
    const f = this.clock.update(seed, storm, simTimeS);
    const s = f.strike;
    if (!s || f.flash <= 0) {
      this.sky.flashRadiance.value.set(0, 0, 0);
      this.sky.flashIrradiance.value.set(0, 0, 0);
      this.bolt.visible = false;
      return f;
    }
    const d = bearingToWorldXZ(s.bearingDeg);
    this.at.set(d.x * s.distanceM, cloudBaseM, d.z * s.distanceM);
    const toFlash = this.at.clone().sub(camera);
    const dist = toFlash.length();
    this.sky.flashDir.value.copy(toFlash.normalize());
    const radius = Math.atan(FLASH_PATCH_M / 2 / dist);
    this.sky.flashSpread.value = Math.max(1e-4, 1 - Math.cos(radius));
    const r = FLASH_RADIANCE * f.flash;
    this.sky.flashRadiance.value.set(FLASH_COLOUR[0] * r, FLASH_COLOUR[1] * r, FLASH_COLOUR[2] * r);
    const e = FLASH_IRRADIANCE * f.flash;
    this.sky.flashIrradiance.value.set(FLASH_COLOUR[0] * e, FLASH_COLOUR[1] * e, FLASH_COLOUR[2] * e);
    this.showBolt(s, f.flash, cloudBaseM);
    return f;
  }

  private showBolt(s: Strike, flash: number, baseM: number): void {
    if (!s.cloudToGround) { this.bolt.visible = false; return; }
    if (this.boltFor !== s.t) {
      const path = boltPath(Math.floor(s.t * 1000), baseM, BOLT_SEGMENTS);
      const pos = this.bolt.geometry.getAttribute('position') as THREE.BufferAttribute;
      path.forEach(([x, y, z], i) => pos.setXYZ(i, x, y, z));
      pos.needsUpdate = true;
      this.boltFor = s.t;
    }
    const d = bearingToWorldXZ(s.bearingDeg);
    this.bolt.position.set(d.x * s.distanceM, 0, d.z * s.distanceM);
    this.boltMaterial.color.setRGB(BOLT_RADIANCE * flash, BOLT_RADIANCE * flash, BOLT_RADIANCE * flash * 1.1);
    this.bolt.visible = true;
  }
}
