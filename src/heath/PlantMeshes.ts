import * as THREE from 'three/webgpu';
import { PI, abs, attribute, cameraPosition, dot, float, length, max, mix, mx_noise_float, mx_noise_vec3, normalWorld, normalize, positionLocal, positionWorld, pow, reflect, saturate, sin, smoothstep, step, uniform, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { LOD_CAPACITY, PLANT_KINDS, PLANT_LODS, PLANT_SHAPES, type Plant, type PlantKind, plantLod, plantScale, plantShapeGeometry } from './plants';

type N = any;

/** Accent colours (spec §3.4): pigface's orange tips, rice-flower's pink flowers. */
const PIGFACE_TIPS = vec3(0.45, 0.22, 0.06);
const RICE_PINK = vec3(0.55, 0.36, 0.4);

/**
 * Keep the fragment? Ragged silhouettes (spec §3.4): a pixel is cut where the noise is below a threshold that grows as the
 * surface turns edge-on (facing = |n·v| → 0); a surface facing the camera is never cut.
 */
export function raggedKeepNode(noise01: N, facing: N): N {
  const cut = smoothstep(0.2, 0.9, float(1.0).sub(facing)).mul(0.95);
  return noise01.greaterThanEqual(cut);
}

/** The heath's plants (spec §3.3–3.4): one InstancedMesh per level × kind × shape, a foliage material per kind. */
export class PlantMeshes {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly tints: THREE.InstancedBufferAttribute[] = [];
  private readonly seeds: THREE.InstancedBufferAttribute[] = [];
  private readonly time = uniform(0);
  private readonly sway = uniform(0);

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    const materials = new Map(PLANT_KINDS.map((k) => [k, this.material(sky, k, sunVisibility)]));
    for (let lod = 0; lod < PLANT_LODS; lod++) {
      for (const kind of PLANT_KINDS) {
        for (let shape = 0; shape < PLANT_SHAPES; shape++) {
          const d = plantShapeGeometry(kind, shape, lod);
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
          g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
          g.setIndex(new THREE.BufferAttribute(d.indices, 1));
          const cap = LOD_CAPACITY[lod];
          const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          const seed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
          g.setAttribute('plantTint', tint);
          g.setAttribute('plantSeed', seed);
          const mesh = new THREE.InstancedMesh(g, materials.get(kind)!, cap);
          mesh.count = 0;
          mesh.frustumCulled = false;
          this.meshes.push(mesh);
          this.tints.push(tint);
          this.seeds.push(seed);
        }
      }
    }
  }

  private readonly kindIndex = new Map<PlantKind, number>(PLANT_KINDS.map((k, i) => [k, i]));

  private index(lod: number, kind: PlantKind, shape: number): number {
    return (lod * PLANT_KINDS.length + this.kindIndex.get(kind)!) * PLANT_SHAPES + shape;
  }

  /**
   * Lays the plants out around the camera: each at its level of detail, shrinking beyond 150 m, seated on the surface
   * drawn there (the true ground inside the fine patch, blending to the coarse mesh over its outer 4 m, the coarse mesh
   * beyond or with the patch hidden).
   */
  update(plants: readonly Plant[], camX: number, camZ: number, patch: { cx: number; cz: number; on: boolean }): { drawn: number; dropped: number } {
    const counts = new Array<number>(this.meshes.length).fill(0);
    let drawn = 0, dropped = 0;
    for (const p of plants) {
      const dx = p.x - camX, dz = p.z - camZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const s = plantScale(dist);
      if (s <= 0) continue;
      const m = this.index(plantLod(dist), p.kind, p.shape);
      const i = counts[m];
      const mesh = this.meshes[m];
      if (i >= mesh.instanceMatrix.count) { dropped++; continue; }
      let w = 0;
      if (patch.on) {
        const t = Math.min(1, Math.max(0, (32 - Math.max(Math.abs(p.x - patch.cx), Math.abs(p.z - patch.cz))) / 4));
        w = t * t * (3 - 2 * t); // smoothstep(0, 4, distance inside the patch's edge): the patch's own height blend
      }
      const y = p.yCoarse + (p.yTrue - p.yCoarse) * w;
      const sx = (p.width / 2) * s, sy = p.height * s, c = p.cosYaw, sn = p.sinYaw;
      // Column-major, written in place (a refresh lays out ~20,000 plants): a yaw rotation about y, scaled.
      const a = mesh.instanceMatrix.array as Float32Array, o = i * 16;
      a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -sn * sx; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = sn * sx; a[o + 9] = 0; a[o + 10] = c * sx; a[o + 11] = 0;
      a[o + 12] = p.x; a[o + 13] = y; a[o + 14] = p.z; a[o + 15] = 1;
      const tint = this.tints[m].array as Float32Array;
      tint[i * 3] = p.tint[0]; tint[i * 3 + 1] = p.tint[1]; tint[i * 3 + 2] = p.tint[2];
      (this.seeds[m].array as Float32Array)[i] = p.seed;
      counts[m] = i + 1;
      drawn++;
    }
    this.meshes.forEach((mesh, k) => {
      const n = counts[k];
      mesh.count = n;
      // Upload only the instances in use (a far mesh's full buffer is 6,000 matrices).
      for (const [attr, size] of [[mesh.instanceMatrix, 16], [this.tints[k], 3], [this.seeds[k], 1]] as const) {
        attr.clearUpdateRanges();
        if (n > 0) attr.addUpdateRange(0, n * size);
        attr.needsUpdate = n > 0;
      }
    });
    return { drawn, dropped };
  }

  /** The sway's clock and strength (the conditions' wind: none on glass, gentle on a Doctor afternoon). */
  tick(timeS: number, windSpeedMs: number): void {
    this.time.value = timeS;
    this.sway.value = 0.06 * Math.min(1.5, Math.max(0, windSpeedMs) / 8);
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }

  private material(sky: Sky, kind: PlantKind, sunVisibility?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
    const m = new THREE.MeshBasicNodeMaterial();
    const local: N = attribute('position', 'vec3'); // the unit plant: y 0 at the base, 1 at the top
    const seed: N = attribute('plantSeed', 'float');
    // Sway: grows with height squared, two slow phases per plant (unit space; the instance scale sizes it).
    const lean: N = local.y.mul(local.y).mul(this.sway);
    const swayX: N = sin(this.time.mul(1.7).add(seed.mul(6.28))).mul(lean);
    const swayZ: N = sin(this.time.mul(1.3).add(seed.mul(4.1))).mul(lean).mul(0.6);
    m.positionNode = positionLocal.add(vec3(swayX, 0.0, swayZ));

    // Leaf clumps in the shading: the normal jittered by a 3D noise (~15 cm), so a shrub doesn't shade like a smooth stone.
    const n = normalize(normalWorld.add(mx_noise_vec3(positionWorld.mul(6.0)).mul(0.45)));
    const l = sky.sunDirection;
    const toCam = cameraPosition.sub(positionWorld);
    const dist = length(toCam);
    const v = toCam.div(max(dist, 1e-3));
    const facing = abs(dot(n, v));
    // Ragged silhouettes, faded out by 100 m (the edge is under a pixel beyond).
    const edgeN = mx_noise_float(positionWorld.mul(5.0)).mul(0.5).add(0.5);
    const keep = raggedKeepNode(edgeN.add(smoothstep(80.0, 100.0, dist)), facing);
    m.maskNode = keep;

    const near = float(1.0).sub(smoothstep(20.0, 60.0, dist));
    const leaf = mx_noise_float(positionWorld.mul(10.0)).mul(0.5).add(0.5);
    const fine = mx_noise_float(positionWorld.mul(40.0)).mul(0.5).add(0.5);
    let albedo: N = attribute('plantTint', 'vec3').mul(mix(float(1.0), leaf.mul(0.6).add(0.7), near)).mul(mix(float(1.0), fine.mul(0.2).add(0.9), near));
    if (kind === 'pigface') albedo = mix(albedo, PIGFACE_TIPS, smoothstep(0.62, 0.72, leaf).mul(smoothstep(0.4, 0.9, local.y)).mul(0.8));
    if (kind === 'rice') albedo = mix(albedo, RICE_PINK, smoothstep(0.7, 0.8, fine).mul(smoothstep(0.3, 0.7, local.y)));

    const interior = smoothstep(0.0, 0.8, local.y).mul(0.6).add(0.4);
    const vis = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
    const wrap = max(dot(n, l).add(0.4).div(1.4), 0.0);
    const sunE = sky.sunIlluminance.mul(vis).mul(wrap).mul(interior).mul(step(0.0, l.y));
    // Backlight: light through the thin edges when looking toward the sun.
    const back = pow(saturate(dot(v.negate(), l)), 4.0).mul(float(1.0).sub(facing)).mul(0.6);
    const glow = sky.sunIlluminance.mul(vis).mul(back).mul(vec3(1.0, 0.85, 0.6)).mul(step(0.0, l.y));
    const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(interior);
    const bounce = sky.sunIlluminance.mul(max(l.y, 0.0)).mul(0.3).mul(float(0.5).sub(n.y.mul(0.5)));
    let lit: N = albedo.mul(sunE.add(skyE).add(bounce).add(glow)).div(PI);
    if (kind === 'daisy') {
      // The daisy-bush's hairy leaves: a soft silvery sheen.
      const r: N = reflect(l.negate(), n);
      lit = lit.add(sky.sunIlluminance.mul(vis).mul(pow(max(dot(r, v), 0.0), 8.0)).mul(0.04).mul(step(0.0, l.y)));
    }
    m.colorNode = sky.applyAerialPerspective(lit, dist, v.negate());
    return m;
  }
}
