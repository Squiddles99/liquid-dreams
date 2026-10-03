import * as THREE from 'three/webgpu';
import { Fn, PI, abs, attribute, cameraPosition, dot, float, int, length, max, mix, mx_noise_float, normalWorld, normalize, positionWorld, pow, select, smoothstep, step, texture, uniform, vec3 } from 'three/tsl';
import { belowBedNode, seenThroughWaterNode } from '../ocean/WaterVolume';
import type { WaterOpticsUniforms } from '../ocean/waterShading';
import type { Seabed } from '../seabed/Seabed';
import type { Sky } from '../sky/Sky';
import type { GroundLayerTextures } from './groundDetail';
import { ROCK_SHAPES, type Rock, rockScale, rockShapeGeometry } from './rocks';

type N = any;

/** Instances per shape (eight shapes: room for the densest `rock density` with margin). */
export const ROCKS_PER_SHAPE = 800;
/** The unit rock's height, from its flat bottom (y −0.6) to about its top. */
const UNIT_HEIGHT = 1.7;
/** The sand's albedo seen by a rock's lower hemisphere (dry sand 0.62, less the wet and the shade around it). */
const GROUND_BOUNCE = 0.45;

/** The water an underwater eye sees the rocks through, and the bed that buries their bases. */
export interface RockWater {
  seabed: Seabed;
  optics: WaterOpticsUniforms;
}

/**
 * The limestone boulders (Phase 4c-1 §3.3): one InstancedMesh per shape, coloured per instance (body and top: the shore
 * rocks' weed), pitted and grained in world space, lit by the sun (× the land's sunlight map) and the sky (less under the
 * base), with aerial perspective; from an underwater eye, through the water, their buried parts hidden.
 */
export class Rocks {
  readonly meshes: THREE.InstancedMesh[] = [];
  /** 1 while the eye is underwater (setUnderwater): one material either side, so crossing the surface builds nothing. */
  readonly underwater = uniform(0);
  private readonly tints: THREE.InstancedBufferAttribute[] = [];
  private readonly topTints: THREE.InstancedBufferAttribute[] = [];
  /** 1 for the dune face's outcrops: they take the ground's limestone layer up close (dune-up-close §4.3). */
  private readonly faces: THREE.InstancedBufferAttribute[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(sky: Sky, sunVisibility?: (xz: N) => N, water?: RockWater, layers?: GroundLayerTextures) {
    const material = rockMaterial(sky, sunVisibility, water ? { ...water, on: this.underwater } : undefined, layers);
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
      const face = new THREE.InstancedBufferAttribute(new Float32Array(ROCKS_PER_SHAPE), 1);
      g.setAttribute('rockFace', face);
      this.faces.push(face);
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
      this.faces[r.shape].setX(i, r.kind === 'face' ? 1 : 0);
      counts[r.shape] = i + 1;
      total++;
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      this.tints[k].needsUpdate = true;
      this.topTints[k].needsUpdate = true;
      this.faces[k].needsUpdate = true;
    });
    return total;
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }

  setUnderwater(on: boolean): void {
    this.underwater.value = on ? 1 : 0;
  }
}

function rockMaterial(sky: Sky, sunVisibility?: (xz: N) => N, water?: RockWater & { on: N }, layers?: GroundLayerTextures): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  // The unit rock's own coordinates (the instancing moves positionLocal into the world).
  const local: N = attribute('position', 'vec3');
  // The top's colour (the shore rocks' weed) over the upper half, the body's beneath (spec §3.3).
  const tint = mix(attribute('rockTint', 'vec3'), attribute('rockTopTint', 'vec3'), smoothstep(0.1, 0.6, local.y));
  const n = normalize(normalWorld);
  const pits = mx_noise_float(local.mul(9.0)).mul(0.5).add(0.5);
  const grain = mx_noise_float(positionWorld.mul(3.0)).mul(0.15).add(0.9);
  let albedo = tint.mul(grain).mul(mix(float(0.7), float(1.0), smoothstep(0.35, 0.6, pits)));
  if (layers) {
    // The dune face's outcrops up close (dune-up-close §4.3): the ground's pitted limestone layer, projected from all
    // three axes, as a detail over their own colour, so outcrop and cap rock read as one stone; gone by 16 m.
    const wts = pow(abs(normalWorld), vec3(4.0));
    const wn = wts.div(wts.x.add(wts.y).add(wts.z));
    const lime = (uv: N): N => texture(layers.colour, uv.div(2.0)).depth(int(2)).rgb;
    const tri = lime(positionWorld.zy).mul(wn.x).add(lime(positionWorld.xz).mul(wn.y)).add(lime(positionWorld.xy).mul(wn.z));
    const on = attribute('rockFace', 'float').mul(float(1.0).sub(smoothstep(12.0, 16.0, length(cameraPosition.sub(positionWorld))))).mul(layers.on);
    albedo = mix(albedo, albedo.mul(tri.div(layers.means[2])), on);
  }
  const baseOcc = smoothstep(-0.6, 0.2, local.y).mul(0.6).add(0.4);
  const l = sky.sunDirection;
  const vis = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
  const sunE = sky.sunIlluminance.mul(vis).mul(max(dot(n, l), 0.0)).mul(step(0.0, l.y));
  const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(baseOcc);
  // Light off the sunlit sand onto the sides and undersides (the ground's albedo × the lower hemisphere): without it a
  // face turned from the sun sees only the sky and reads black against the bright beach.
  const bounce = sky.sunIlluminance.mul(max(l.y, 0.0)).add(sky.skyIrradiance).mul(GROUND_BOUNCE).mul(float(0.5).sub(n.y.mul(0.5)));
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const lit = albedo.mul(sunE.add(skyE).add(bounce)).div(PI);
  const inAir = (c: N): N => sky.applyAerialPerspective(c, dist, toCam.div(max(dist, 1e-3)).negate());
  if (!water) {
    m.colorNode = inAir(lit);
    return m;
  }
  // From underwater the land is hidden and the bed is the water volume's march, which writes no depth: the rocks show
  // through the water (fading where the reef does, not as bright dots on the far shore) and hide their own buried bases.
  const under = water.on.greaterThan(0.5);
  // The light is a var assigned before the branch: built inside the select, three (r186) assigns normalWorld only in the
  // underwater branch, the first to reach it, and above water normalize(normalWorld) is normalize(0), NaN: a black rock.
  m.colorNode = Fn(() => {
    const litHere = lit.toVar();
    return select(under, seenThroughWaterNode(cameraPosition, positionWorld, litHere, water.seabed, sky, water.optics), inAir(litHere));
  })();
  m.maskNode = under.not().or(belowBedNode(positionWorld, water.seabed).not());
  return m;
}
