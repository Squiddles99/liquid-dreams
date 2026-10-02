import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, dot, faceDirection, float, fract, fwidth, length, log2, max, normalize, normalWorld, positionLocal, positionWorld, pow, saturate, screenCoordinate, sin, smoothstep, step, texture, uniform, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { Kit } from './kit';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';
import { PLANT_ALBEDO, PLANT_KINDS, PLANT_SHAPES, type Plant, plantSeatY } from './plants';

type N = any;

/** Instances per variant mesh: L0 holds the plants within 13.5 m, L1 those to 41.5 m (dune-up-close §3.1). */
export const KIT_CAPACITY = [600, 3000] as const;

/**
 * The dither shared by every band's material for one plant (its seed) at one pixel: L0 keeps [0, wNear), L1
 * [wNear, wNear + wMid), the far hull the rest, so the bands hand over pixel for pixel (spec §3.1).
 */
export function bandDitherNode(seed: N): N {
  return fract(sin(dot(screenCoordinate.xy.add(seed.mul(97.0)), vec2(12.9898, 78.233))).mul(43758.5453));
}

/** [wNear, wFar] at world position p from the camera: the kit's L0 and the far hull's shares (L1 takes the rest). */
export function bandWeightNodes(p: N): [N, N] {
  const d: N = length(p.xz.sub(cameraPosition.xz));
  const h = BAND_FADE_M / 2;
  return [float(1).sub(smoothstep(NEAR_M - h, NEAR_M + h, d)), smoothstep(MID_M - h, MID_M + h, d)];
}

/**
 * The heath's real plants near the camera (dune-up-close §3.1, §4.2): each kind × variant at L0 (every branch and leaf
 * spray, to 12 m) and L1 (thick wood and cluster cards, 12–40 m), instanced; the plants the camera can see, re-laid each
 * frame from the near list.
 */
export class KitMeshes {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly tints: THREE.InstancedBufferAttribute[] = [];
  private readonly seeds: THREE.InstancedBufferAttribute[] = [];
  private readonly index = new Map<string, number>();
  private readonly time = uniform(0);
  private readonly sway = uniform(0);
  /** 1: every mesh draws its whole plant whatever the band (the self-tests' views of one LOD). */
  readonly forceBand = uniform(0);
  private readonly kindColour: Record<string, [number, number, number]>;
  private readonly frustum = new THREE.Frustum();
  private readonly m4 = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor(kit: Kit, sky: Sky, sunVisibility?: (xz: N) => N) {
    this.kindColour = Object.fromEntries(kit.manifest.variants.filter((v) => v.variant === 0).map((v) => [v.kind, v.leafColour]));
    const materials = [0, 1].map((lod) => this.material(kit, sky, lod as 0 | 1, sunVisibility));
    for (const lod of [0, 1] as const) {
      for (const kind of PLANT_KINDS) {
        for (let v = 0; v < PLANT_SHAPES; v++) {
          const g = kit.geometry(kind, v, lod).clone();
          const cap = KIT_CAPACITY[lod];
          const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
          const seed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
          g.setAttribute('plantTint', tint);
          g.setAttribute('plantSeed', seed);
          const mesh = new THREE.InstancedMesh(g, materials[lod], cap);
          mesh.name = `kit_${kind}_${v}_L${lod}`;
          mesh.count = 0;
          mesh.frustumCulled = false;
          this.index.set(`${kind}:${v}:${lod}`, this.meshes.length);
          this.meshes.push(mesh);
          this.tints.push(tint);
          this.seeds.push(seed);
        }
      }
    }
  }

  /**
   * Lays the plants within MID_M + the fade that the camera can see (a padded frustum test of each plant's bounding
   * sphere), each in L0 and/or L1 by its distance, seated on the surface drawn under it. Returns the plants laid and
   * those culled.
   */
  update(plants: readonly Plant[], camera: THREE.Camera, patch: { cx: number; cz: number; on: boolean }): { drawn: number; culled: number } {
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cx = camera.position.x, cz = camera.position.z;
    const counts = new Array<number>(this.meshes.length).fill(0);
    const far = MID_M + BAND_FADE_M / 2, near = NEAR_M + BAND_FADE_M / 2, nearIn = NEAR_M - BAND_FADE_M / 2;
    let drawn = 0, culled = 0;
    for (const p of plants) {
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d > far) continue;
      const y = plantSeatY(p, patch);
      this.sphere.center.set(p.x, y + p.height / 2, p.z);
      this.sphere.radius = Math.max(p.width / 2, p.height) + 1;
      if (!this.frustum.intersectsSphere(this.sphere)) {
        culled++;
        continue;
      }
      for (const lod of [0, 1] as const) {
        if (lod === 0 && d > near) continue;
        if (lod === 1 && d < nearIn) continue;
        const m = this.index.get(`${p.kind}:${p.shape}:${lod}`);
        if (m === undefined) continue;
        const i = counts[m];
        if (i >= KIT_CAPACITY[lod]) continue;
        this.write(m, i, p, y);
        counts[m] = i + 1;
      }
      drawn++;
    }
    this.meshes.forEach((mesh, k) => {
      const n = counts[k];
      mesh.count = n;
      for (const [attr, size] of [[mesh.instanceMatrix, 16], [this.tints[k], 3], [this.seeds[k], 1]] as const) {
        attr.clearUpdateRanges();
        if (n > 0) {
          attr.addUpdateRange(0, n * size);
          attr.needsUpdate = true;
        }
      }
    });
    return { drawn, culled };
  }

  private write(m: number, i: number, p: Plant, y: number): void {
    const sx = p.width / 2, sy = p.height, c = p.cosYaw, sn = p.sinYaw;
    const a = this.meshes[m].instanceMatrix.array as Float32Array, o = i * 16;
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -sn * sx; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = sn * sx; a[o + 9] = 0; a[o + 10] = c * sx; a[o + 11] = 0;
    a[o + 12] = p.x; a[o + 13] = y; a[o + 14] = p.z; a[o + 15] = 1;
    // The plant's colour jitter, relative to its kind's palette (the atlas carries the kind's own colour).
    const base = PLANT_ALBEDO[p.kind];
    const t = this.tints[m].array as Float32Array;
    t[i * 3] = p.tint[0] / base[0]; t[i * 3 + 1] = p.tint[1] / base[1]; t[i * 3 + 2] = p.tint[2] / base[2];
    (this.seeds[m].array as Float32Array)[i] = p.seed;
  }

  /** The wind (the conditions'): none on glass, gentle on a Doctor afternoon; the same scale the hulls sway at. */
  tick(timeS: number, windSpeedMs: number): void {
    this.time.value = timeS;
    this.sway.value = 0.06 * Math.min(1.5, Math.max(0, windSpeedMs) / 8);
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }

  /** The kinds' leaf colours from the manifest (what the far hulls take: spec §4.2). */
  get leafColours(): Record<string, [number, number, number]> {
    return this.kindColour;
  }

  private material(kit: Kit, sky: Sky, lod: 0 | 1, sunVisibility?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
    const m = new THREE.MeshBasicNodeMaterial();
    m.side = THREE.DoubleSide;
    const col: N = attribute('color', 'vec4'); // AO, root distance, flutter phase, what it is (0 wood, .2 dead, .5 leaf, 1 flower)
    const uv: N = attribute('uv', 'vec2');
    const tex: N = texture(kit.atlas, uv);
    // The atlas's mips average a spray's or a card's alpha toward its coverage (a third, for daisy needles), under the
    // 0.5 cut: far cards vanished. Raise the alpha with the mip level the pixel samples.
    const mip: N = max(log2(max(fwidth(uv.x), fwidth(uv.y)).mul(kit.manifest.atlas.size)), 0.0);
    const alpha: N = tex.a.mul(float(1.0).add(mip.mul(0.35)));
    const seed: N = attribute('plantSeed', 'float');
    const leafy: N = step(0.4, col.w);
    // Wind (spec §4.2): stiff at the root, the tips moving with the root distance cubed; leaves flutter on their own phase.
    // (positionLocal is already placed by the instance here, so the sway is in metres.)
    const bend: N = col.y.mul(col.y).mul(col.y).mul(this.sway);
    const sway: N = vec3(sin(this.time.mul(1.7).add(seed.mul(6.28))), 0.0, sin(this.time.mul(1.3).add(seed.mul(4.1))).mul(0.6)).mul(bend);
    const flutter: N = normalWorld.mul(sin(this.time.mul(9.0).add(col.z.mul(6.28))).mul(0.004).mul(leafy).mul(this.sway.mul(16.0)));
    m.positionNode = positionLocal.add(sway).add(flutter);
    // The band fade (spec §3.1).
    const [wNear, wFar] = bandWeightNodes(positionWorld);
    const dither: N = bandDitherNode(seed);
    const keepBand: N = lod === 0 ? dither.lessThan(wNear) : dither.greaterThanEqual(wNear).and(dither.lessThan(float(1).sub(wFar)));
    m.maskNode = keepBand.or(this.forceBand.greaterThan(0.5)).and(alpha.greaterThan(0.5));

    const n: N = normalize(normalWorld.mul(faceDirection));
    const l = sky.sunDirection;
    const toCam: N = cameraPosition.sub(positionWorld);
    const dist: N = length(toCam);
    const v: N = toCam.div(max(dist, 1e-3));
    const ao: N = col.x;
    const albedo: N = tex.rgb.mul(attribute('plantTint', 'vec3'));
    const vis: N = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
    const wrap: N = max(dot(n, l).add(0.4).div(1.4), 0.0);
    const sunE: N = sky.sunIlluminance.mul(vis).mul(wrap).mul(ao).mul(step(0.0, l.y));
    // Light through the leaves when they're backlit (thin-leaf translucency), tinted by the leaf.
    const through: N = pow(saturate(dot(v.negate(), l)), 4.0).mul(0.5).mul(leafy);
    const glow: N = sky.sunIlluminance.mul(vis).mul(through).mul(albedo.mul(2.0)).mul(step(0.0, l.y));
    const skyE: N = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(ao);
    const bounce: N = sky.sunIlluminance.mul(max(l.y, 0.0)).mul(0.3).mul(float(0.5).sub(n.y.mul(0.5))).mul(ao);
    const lit: N = albedo.mul(sunE.add(skyE).add(bounce)).add(glow).div(PI);
    m.colorNode = sky.applyAerialPerspective(lit, dist, v.negate());
    return m;
  }
}
