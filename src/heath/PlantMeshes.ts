import * as THREE from 'three/webgpu';
import { PI, abs, attribute, cameraPosition, dot, float, length, max, mix, mx_noise_float, mx_noise_vec3, normalWorld, normalize, positionLocal, positionWorld, pow, reflect, saturate, sin, smoothstep, step, uniform, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { LOD_CAPACITY, PLANT_FULL_M, PLANT_GONE_M, PLANT_KINDS, PLANT_LODS, PLANT_SHAPES, type Plant, type PlantKind, plantLod, plantSeatY, plantShapeGeometry } from './plants';

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

/** One laid plant: its mesh and slot (the slot moves when another plant is swap-removed into it). */
interface SlotRec {
  mesh: number;
  slot: number;
}

/**
 * The heath's plants (spec §3.3–3.4): one InstancedMesh per level × kind × shape, a foliage material per kind. Laid cell
 * by cell (dune-up-close §4.5): a cell's plants take slots at the end of their meshes and give them back by swap-remove,
 * so a move lays only the cells that entered the ring.
 */
export class PlantMeshes {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly tints: THREE.InstancedBufferAttribute[] = [];
  private readonly seeds: THREE.InstancedBufferAttribute[] = [];
  /**
   * Each instance's base (x, y, z): the shader shrinks plants from 150 to 200 m from the camera about it, per frame, not
   * per lay. (three applies the instance matrix before the material's positionNode, so positionLocal there is already
   * placed: a plain scale of it pulled far plants toward the world's origin, into the sky.)
   */
  private readonly origins: THREE.InstancedBufferAttribute[] = [];
  /** Per mesh, by slot: the record that owns it (so a swap-remove can tell the moved plant its new slot). */
  private readonly owners: SlotRec[][] = [];
  private readonly cellSlots = new Map<number, SlotRec[]>();
  /** Per mesh, the lowest and highest slot written since the last flush. */
  private readonly dirty: [number, number][] = [];
  /** Plants that found their mesh full (dev readout). */
  dropped = 0;
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
          const origin = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          g.setAttribute('plantTint', tint);
          g.setAttribute('plantSeed', seed);
          g.setAttribute('plantOrigin', origin);
          const mesh = new THREE.InstancedMesh(g, materials.get(kind)!, cap);
          mesh.count = 0;
          mesh.frustumCulled = false;
          this.meshes.push(mesh);
          this.tints.push(tint);
          this.seeds.push(seed);
          this.origins.push(origin);
          this.owners.push([]);
          this.dirty.push([Infinity, -Infinity]);
        }
      }
    }
  }

  private readonly kindIndex = new Map<PlantKind, number>(PLANT_KINDS.map((k, i) => [k, i]));

  private index(lod: number, kind: PlantKind, shape: number): number {
    return (lod * PLANT_KINDS.length + this.kindIndex.get(kind)!) * PLANT_SHAPES + shape;
  }

  /** Writes plant p into slot i of mesh m, its base at y: a yaw rotation about y, scaled to its size (column-major). */
  private write(m: number, i: number, p: Plant, y: number): void {
    const sx = p.width / 2, sy = p.height, c = p.cosYaw, sn = p.sinYaw;
    const a = this.meshes[m].instanceMatrix.array as Float32Array, o = i * 16;
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -sn * sx; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = sn * sx; a[o + 9] = 0; a[o + 10] = c * sx; a[o + 11] = 0;
    a[o + 12] = p.x; a[o + 13] = y; a[o + 14] = p.z; a[o + 15] = 1;
    const tint = this.tints[m].array as Float32Array;
    tint[i * 3] = p.tint[0]; tint[i * 3 + 1] = p.tint[1]; tint[i * 3 + 2] = p.tint[2];
    (this.seeds[m].array as Float32Array)[i] = p.seed;
    const or = this.origins[m].array as Float32Array;
    or[i * 3] = p.x; or[i * 3 + 1] = y; or[i * 3 + 2] = p.z;
    this.touch(m, i);
  }

  /** Copies slot `from` of mesh m into slot `to`. */
  private copy(m: number, from: number, to: number): void {
    const mat = this.meshes[m].instanceMatrix.array as Float32Array;
    mat.copyWithin(to * 16, from * 16, from * 16 + 16);
    const t = this.tints[m].array as Float32Array;
    t.copyWithin(to * 3, from * 3, from * 3 + 3);
    const sd = this.seeds[m].array as Float32Array;
    sd[to] = sd[from];
    const or = this.origins[m].array as Float32Array;
    or.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.touch(m, to);
  }

  private touch(m: number, i: number): void {
    const d = this.dirty[m];
    d[0] = Math.min(d[0], i);
    d[1] = Math.max(d[1], i);
  }

  /**
   * Lays cell `key`'s plants (replacing the cell if it was laid): each in its kind × shape mesh at the level of detail
   * `lodOf` gives, its base at `seatOf`.
   */
  addCell(key: number, plants: readonly Plant[], seatOf: (p: Plant) => number, lodOf: (p: Plant) => number): void {
    this.removeCell(key);
    const recs: SlotRec[] = [];
    for (const p of plants) {
      const m = this.index(lodOf(p), p.kind, p.shape), mesh = this.meshes[m];
      const i = mesh.count;
      if (i >= mesh.instanceMatrix.count) {
        this.dropped++;
        continue;
      }
      mesh.count = i + 1;
      this.write(m, i, p, seatOf(p));
      const rec = { mesh: m, slot: i };
      this.owners[m][i] = rec;
      recs.push(rec);
    }
    this.cellSlots.set(key, recs);
  }

  /** Drops cell `key`'s plants: each slot takes its mesh's last instance (swap-remove). Nothing if it isn't laid. */
  removeCell(key: number): void {
    const recs = this.cellSlots.get(key);
    if (!recs) return;
    this.cellSlots.delete(key);
    for (const rec of recs) {
      const mesh = this.meshes[rec.mesh], last = mesh.count - 1;
      if (rec.slot !== last) {
        this.copy(rec.mesh, last, rec.slot);
        const moved = this.owners[rec.mesh][last];
        moved.slot = rec.slot;
        this.owners[rec.mesh][rec.slot] = moved;
      }
      this.owners[rec.mesh].length = last;
      mesh.count = last;
    }
  }

  /** Drops every cell. */
  clear(): void {
    for (const key of [...this.cellSlots.keys()]) this.removeCell(key);
    this.dropped = 0;
  }

  /** Uploads the slots written since the last flush (only those: a far mesh holds 11,000). */
  flush(): void {
    this.meshes.forEach((mesh, k) => {
      const d = this.dirty[k];
      for (const [attr, size] of [[mesh.instanceMatrix, 16], [this.tints[k], 3], [this.seeds[k], 1], [this.origins[k], 3]] as const) {
        attr.clearUpdateRanges();
        if (d[1] >= d[0]) {
          attr.addUpdateRange(d[0] * size, (d[1] - d[0] + 1) * size);
          attr.needsUpdate = true;
        }
      }
      d[0] = Infinity;
      d[1] = -Infinity;
    });
  }

  /** Instances laid. */
  get drawn(): number {
    return this.meshes.reduce((n, m) => n + m.count, 0);
  }

  /**
   * Lays `plants` as one cell after dropping every other (a whole layout at once: the tests, dev tools), each at its
   * level of detail by distance from (camX, camZ), seated on the surface drawn under it.
   */
  update(plants: readonly Plant[], camX: number, camZ: number, patch: { cx: number; cz: number; on: boolean }): { drawn: number; dropped: number } {
    this.clear();
    this.addCell(0, plants.filter((p) => Math.hypot(p.x - camX, p.z - camZ) < PLANT_GONE_M), (p) => plantSeatY(p, patch), (p) => plantLod(Math.hypot(p.x - camX, p.z - camZ)));
    this.flush();
    return { drawn: this.drawn, dropped: this.dropped };
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
    // Shrinking from 150 to 200 m (plantScale), by the instance's own distance each frame: the far cells are laid once,
    // not every move.
    const base: N = attribute('plantOrigin', 'vec3');
    const shrink: N = float(1.0).sub(smoothstep(PLANT_FULL_M, PLANT_GONE_M, length(base.xz.sub(cameraPosition.xz))));
    m.positionNode = base.add(positionLocal.add(vec3(swayX, 0.0, swayZ)).sub(base).mul(shrink));

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
