import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { Kit } from './kit';
import { kitMaterial } from './KitMeshes';
import { ITEM_RANGE_M, SCATTER_VARIANTS, type ScatterItem, type ScatterKind, TUFT_RANGE_M } from './nearScatter';
import { BAND_FADE_M } from './plantRing';

type N = any;

/** Instances per mesh: a tuft variant at L0 or L1, or a ground item. */
export const SCATTER_CAPACITY = 400;
const TUFT_L0_M = 12;

/**
 * The near scatter drawn (dune-up-close §4.4): each tuft variant at L0 (its blades, to 12 m) and L1 (crossed cards,
 * 12–20 m), each ground item to 12 m, instanced; laid each frame from the near list, culled to the view.
 */
export class ScatterMeshes {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly seeds: THREE.InstancedBufferAttribute[] = [];
  /** Each instance's base: the band weights are the whole item's (KitMeshes' bandWeightNodes). */
  private readonly origins: THREE.InstancedBufferAttribute[] = [];
  private readonly index = new Map<string, number>();
  private readonly time = uniform(0);
  private readonly sway = uniform(0);
  readonly forceBand = uniform(0);
  private readonly frustum = new THREE.Frustum();
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly sphere = new THREE.Sphere();

  constructor(kit: Kit, sky: Sky, sunVisibility?: (xz: N) => N) {
    const opts = { time: this.time, sway: this.sway, forceBand: this.forceBand, sunVisibility };
    const size = kit.manifest.atlas.size;
    const tuft0 = kitMaterial(kit.atlas, size, sky, { ...opts, lod: 0, nearM: TUFT_L0_M, farM: TUFT_RANGE_M });
    const tuft1 = kitMaterial(kit.atlas, size, sky, { ...opts, lod: 1, nearM: TUFT_L0_M, farM: TUFT_RANGE_M });
    const item = kitMaterial(kit.atlas, size, sky, { ...opts, lod: 0, nearM: ITEM_RANGE_M, farM: ITEM_RANGE_M + 50 });
    for (const kind of Object.keys(SCATTER_VARIANTS) as ScatterKind[]) {
      const tuft = kind.startsWith('tuft_');
      for (let v = 0; v < SCATTER_VARIANTS[kind]; v++) {
        for (const lod of tuft ? ([0, 1] as const) : ([0] as const)) {
          const g = kit.item(kind, v, lod).clone();
          const tint = new THREE.InstancedBufferAttribute(new Float32Array(SCATTER_CAPACITY * 3).fill(1), 3);
          const seed = new THREE.InstancedBufferAttribute(new Float32Array(SCATTER_CAPACITY), 1);
          g.setAttribute('plantTint', tint);
          g.setAttribute('plantSeed', seed);
          const origin = new THREE.InstancedBufferAttribute(new Float32Array(SCATTER_CAPACITY * 3), 3);
          g.setAttribute('plantOrigin', origin);
          this.origins.push(origin);
          const mesh = new THREE.InstancedMesh(g, tuft ? (lod === 0 ? tuft0 : tuft1) : item, SCATTER_CAPACITY);
          mesh.name = `scatter_${kind}_${v}_L${lod}`;
          mesh.count = 0;
          mesh.frustumCulled = false;
          this.index.set(`${kind}:${v}:${lod}`, this.meshes.length);
          this.meshes.push(mesh);
          this.seeds.push(seed);
        }
      }
    }
  }

  /** Lays the items the camera can see: tufts at L0 to 12 m and L1 to 20 m, ground items to 12 m (each band dithered). */
  update(items: readonly ScatterItem[], camera: THREE.Camera): { drawn: number; culled: number } {
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cx = camera.position.x, cz = camera.position.z, h = BAND_FADE_M / 2;
    const counts = new Array<number>(this.meshes.length).fill(0);
    let drawn = 0, culled = 0;
    for (const it of items) {
      const d = Math.hypot(it.x - cx, it.z - cz);
      const tuft = it.kind.startsWith('tuft_');
      if (d > (tuft ? TUFT_RANGE_M : ITEM_RANGE_M) + h) continue;
      this.sphere.center.set(it.x, it.y + 0.3, it.z);
      this.sphere.radius = 1;
      if (!this.frustum.intersectsSphere(this.sphere)) {
        culled++;
        continue;
      }
      this.s.setScalar(it.scale);
      this.e.set(it.tiltX, it.yaw, it.tiltZ);
      this.q.setFromEuler(this.e);
      this.p.set(it.x, it.y, it.z);
      this.m4.compose(this.p, this.q, this.s);
      for (const lod of tuft ? ([0, 1] as const) : ([0] as const)) {
        if (tuft && lod === 0 && d > TUFT_L0_M + h) continue;
        if (tuft && lod === 1 && d < TUFT_L0_M - h) continue;
        const m = this.index.get(`${it.kind}:${it.variant}:${lod}`);
        if (m === undefined || counts[m] >= SCATTER_CAPACITY) continue;
        const i = counts[m]++;
        this.meshes[m].setMatrixAt(i, this.m4);
        (this.seeds[m].array as Float32Array)[i] = it.seed;
        const o3 = this.origins[m].array as Float32Array;
        o3[i * 3] = it.x; o3[i * 3 + 1] = it.y; o3[i * 3 + 2] = it.z;
      }
      drawn++;
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      if (counts[k] > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        this.seeds[k].needsUpdate = true;
        this.origins[k].needsUpdate = true;
      }
    });
    return { drawn, culled };
  }

  tick(timeS: number, windSpeedMs: number): void {
    this.time.value = timeS;
    // Grass sways more than the shrubs (spec §4.4).
    this.sway.value = 0.1 * Math.min(1.5, Math.max(0, windSpeedMs) / 8);
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }
}
