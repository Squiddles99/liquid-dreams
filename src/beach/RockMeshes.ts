import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, dot, float, length, max, mix, mx_noise_float, normalWorld, normalize, positionWorld, smoothstep, step } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { ROCK_SHAPES, type Rock, rockScale, rockShapeGeometry } from './rocks';

type N = any;

/** Instances per shape (eight shapes: room for the densest `rock density` with margin). */
export const ROCKS_PER_SHAPE = 800;
/** The unit rock's height, from its flat bottom (y −0.6) to about its top. */
const UNIT_HEIGHT = 1.7;

/**
 * The limestone boulders (Phase 4c-1 §3.3): one InstancedMesh per shape, coloured per instance (body and top: the shore
 * rocks' weed), pitted and grained in world space, lit by the sun (× the land's sunlight map) and the sky (less under the
 * base), with aerial perspective.
 */
export class Rocks {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly tints: THREE.InstancedBufferAttribute[] = [];
  private readonly topTints: THREE.InstancedBufferAttribute[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    const material = rockMaterial(sky, sunVisibility);
    for (let i = 0; i < ROCK_SHAPES; i++) {
      const d = rockShapeGeometry(i);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
      g.setIndex(new THREE.BufferAttribute(d.indices, 1));
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(ROCKS_PER_SHAPE * 3), 3);
      const top = new THREE.InstancedBufferAttribute(new Float32Array(ROCKS_PER_SHAPE * 3), 3);
      g.setAttribute('rockTint', tint);
      g.setAttribute('rockTopTint', top);
      const mesh = new THREE.InstancedMesh(g, material, ROCKS_PER_SHAPE);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.tints.push(tint);
      this.topTints.push(top);
    }
  }

  /** Lays out the rocks around the camera: full size within ROCK_FULL_M, shrinking into the ground by ROCK_GONE_M. */
  update(rocks: readonly Rock[], camX: number, camZ: number): number {
    const counts = new Array<number>(ROCK_SHAPES).fill(0);
    let total = 0;
    for (const r of rocks) {
      const sc = rockScale(Math.hypot(r.x - camX, r.z - camZ));
      const i = counts[r.shape];
      if (sc <= 0 || i >= ROCKS_PER_SHAPE) continue;
      const scaleY = (r.height * sc) / UNIT_HEIGHT;
      this.s.set(r.radius * sc, scaleY, r.radius * sc);
      this.e.set(r.tiltX, r.yaw, r.tiltZ);
      this.q.setFromEuler(this.e);
      this.p.set(r.x, r.y + 0.6 * scaleY, r.z);
      this.m4.compose(this.p, this.q, this.s);
      this.meshes[r.shape].setMatrixAt(i, this.m4);
      this.tints[r.shape].setXYZ(i, r.tint[0], r.tint[1], r.tint[2]);
      this.topTints[r.shape].setXYZ(i, r.topTint[0], r.topTint[1], r.topTint[2]);
      counts[r.shape] = i + 1;
      total++;
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      this.tints[k].needsUpdate = true;
      this.topTints[k].needsUpdate = true;
    });
    return total;
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }
}

function rockMaterial(sky: Sky, sunVisibility?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  // The unit rock's own coordinates (the instancing moves positionLocal into the world).
  const local: N = attribute('position', 'vec3');
  // The top's colour (the shore rocks' weed) over the upper half, the body's beneath (spec §3.3).
  const tint = mix(attribute('rockTint', 'vec3'), attribute('rockTopTint', 'vec3'), smoothstep(0.1, 0.6, local.y));
  const n = normalize(normalWorld);
  const pits = mx_noise_float(local.mul(9.0)).mul(0.5).add(0.5);
  const grain = mx_noise_float(positionWorld.mul(3.0)).mul(0.15).add(0.9);
  const albedo = tint.mul(grain).mul(mix(float(0.7), float(1.0), smoothstep(0.35, 0.6, pits)));
  const baseOcc = smoothstep(-0.6, 0.2, local.y).mul(0.6).add(0.4);
  const l = sky.sunDirection;
  const vis = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
  const sunE = sky.sunIlluminance.mul(vis).mul(max(dot(n, l), 0.0)).mul(step(0.0, l.y));
  const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(baseOcc);
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  m.colorNode = sky.applyAerialPerspective(albedo.mul(sunE.add(skyE)).div(PI), dist, toCam.div(max(dist, 1e-3)).negate());
  return m;
}
