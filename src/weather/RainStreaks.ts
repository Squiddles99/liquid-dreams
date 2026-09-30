import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, cross, float, length, max, mod, normalize, uint, uniform, uvec3, vec3, vec4 } from 'three/tsl';
import { hash3 } from './cloudNoiseNodes';
import type { Sky } from '../sky/Sky';

type N = any;

/** The most streaks drawn (a downpour); the count scales with the rain at the camera. */
export const MAX_STREAKS = 20000;
/** The box of rain around the camera (m): across and tall. */
export const RAIN_BOX_M = 30;
export const RAIN_BOX_H_M = 20;
/** Raindrops fall at about 7 m/s (2–3 mm drops at terminal velocity). */
export const RAIN_FALL_MS = 7;
/** The eye's (and a camera's) blur: a drop draws the path it covers in this long. */
const STREAK_EXPOSURE_S = 1 / 15;

/** How many streaks to draw for the rain falling at the camera (0..1): none when dry. */
export function streakCount(rainHere: number): number {
  return Math.round(Math.min(1, Math.max(0, rainHere)) * MAX_STREAKS);
}

/**
 * Falling rain near the camera (weather W2 Task 4): thin streaks in a box that follows the camera. Each streak's place
 * comes from its index and the sim clock, falling and drifting with the wind, wrapped into the box, so there is no
 * state to simulate, and a paused or linked moment shows the same rain. Lit by the (cloudy) sky light.
 */
export class RainStreaks {
  readonly mesh: THREE.Mesh;
  private readonly time = uniform(0);
  private readonly wind = uniform(new THREE.Vector3());

  constructor(sky: Sky) {
    const geometry = new THREE.BufferGeometry();
    const corners = new Float32Array(MAX_STREAKS * 4 * 2);
    const seeds = new Float32Array(MAX_STREAKS * 4);
    const index = new Uint32Array(MAX_STREAKS * 6);
    for (let i = 0; i < MAX_STREAKS; i++) {
      const c = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        corners.set(c[k], (i * 4 + k) * 2);
        seeds[i * 4 + k] = i;
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_STREAKS * 4 * 3), 3));
    geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);

    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const corner: N = attribute('corner', 'vec2');
    const seed: N = attribute('seed', 'float');
    // Three independent hashes of the streak's index (a 1D sequence put the streaks on a few planes: the box looked empty).
    const h = hash3(uvec3(uint(seed), uint(17), uint(29)));
    const velocity = vec3(this.wind.x, -RAIN_FALL_MS, this.wind.z);
    const travelled = velocity.mul(this.time);
    const box = vec3(RAIN_BOX_M, RAIN_BOX_H_M, RAIN_BOX_M);
    // The streak's place, wrapped into the box around the camera.
    // The box sits mostly above the eye's level (rain below the sea surface is hidden anyway).
    const rel = mod(h.mul(box).add(travelled).sub(cameraPosition), box).sub(box.mul(vec3(0.5, 0.3, 0.5)));
    const centre = cameraPosition.add(rel);
    const along = normalize(velocity);
    const toEye = cameraPosition.sub(centre);
    const dist = length(toEye);
    const side = normalize(cross(along, toEye));
    // At least about a pixel wide at any distance, or the far streaks shimmer; thinner-than-a-pixel is spread as fainter.
    const width = max(float(0.003), dist.mul(0.0008));
    const len = length(velocity).mul(STREAK_EXPOSURE_S);
    material.positionNode = centre.add(side.mul(corner.x.mul(width))).sub(along.mul(corner.y.mul(len)));
    // Even across the width: a streak is only a pixel or two wide, and a tapered edge left almost nothing drawn.
    const fade = float(0.004).div(width).min(1.0).mul(float(1.0).sub(dist.div(RAIN_BOX_M * 0.5)).max(0.0));
    material.colorNode = vec4(sky.skyIrradiance.div(PI).mul(0.9), fade.mul(0.45));
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  /** This frame's rain: the sim clock, the surface wind (world m/s, x and z), the rain at the camera, and whether the eye is under water. */
  update(simTimeS: number, windX: number, windZ: number, rainHere: number, underwater: boolean): void {
    this.time.value = simTimeS;
    this.wind.value.set(windX, 0, windZ);
    const n = underwater ? 0 : streakCount(rainHere);
    this.mesh.geometry.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
  }
}
