import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, dot, faceDirection, float, fract, fwidth, length, log2, max, mix, normalize, normalWorld, positionLocal, positionWorld, pow, saturate, screenCoordinate, sin, smoothstep, step, texture, uniform, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { Kit } from './kit';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';
import { PLANT_ALBEDO, PLANT_KINDS, PLANT_SHAPES, type Plant, type PlantKind, plantSeatY } from './plants';

type N = any;

/** Instances per variant mesh: L0 holds the plants within 13.5 m, L1 those to 41.5 m (dune-up-close §3.1). */
export const KIT_CAPACITY = [600, 3000] as const;

/**
 * The dither shared by every band's material for one plant (its seed) at one pixel: L0 keeps [0, wNear), L1
 * [wNear, wNear + wMid), the far hull the rest, so the bands hand over pixel for pixel (spec §3.1).
 */
export function bandDitherNode(seed: N): N {
  // Interleaved gradient noise, shifted per plant: even over [0, 1) at any pixel scale. (A sin hash's values clustered on
  // the GPU, its sin imprecise at large arguments: a plant crossing a band lost a fifth to a half of its pixels.)
  const p: N = screenCoordinate.xy.add(vec2(seed.mul(113.0), seed.mul(71.0)).floor());
  return fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));
}

/**
 * [wNear, wFar] for a plant whose base is at world position p: the kit's L0 and the far hull's shares (L1 takes the
 * rest). Weighed at the plant's base, never per fragment: L0's leaves and L1's cards lie at different depths, and per
 * fragment a pixel could fail both levels' tests (a fifth of a plant crossing a band went missing).
 */
export function bandWeightNodes(p: N, nearM = NEAR_M, farM = MID_M): [N, N] {
  const d: N = length(p.xz.sub(cameraPosition.xz));
  const h = BAND_FADE_M / 2;
  return [float(1).sub(smoothstep(nearM - h, nearM + h, d)), smoothstep(farM - h, farM + h, d)];
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
  /** Each instance's base (x, y, z): the band weights are the whole plant's. */
  private readonly origins: THREE.InstancedBufferAttribute[] = [];
  private readonly index = new Map<string, number>();
  private readonly time = uniform(0);
  private readonly sway = uniform(0);
  /** 1: every mesh draws its whole plant whatever the band (the self-tests' views of one LOD). */
  readonly forceBand = uniform(0);
  /** Each kind's L1 alpha cut at 12 m and at 40 m (KIT_L1_CUT's; the self-tests' fit mode moves them). */
  readonly l1Cut = new Map<PlantKind, [N, N]>();
  /** Per mesh: its level's colour gain for its kind (KIT_CALIBRATION). */
  private readonly gains: [number, number, number][] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly m4 = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor(kit: Kit, sky: Sky, sunVisibility?: (xz: N) => N) {
    const opts = { time: this.time, sway: this.sway, forceBand: this.forceBand, sunVisibility };
    const l0 = kitMaterial(kit.atlas, kit.manifest.atlas.size, sky, { ...opts, lod: 0 });
    // L1 per kind: its own alpha cut (KIT_L1_CUT).
    const l1 = new Map(PLANT_KINDS.map((k) => {
      const c = [uniform(KIT_L1_CUT[k][0]), uniform(KIT_L1_CUT[k][1])] as [N, N];
      this.l1Cut.set(k, c);
      return [k, kitMaterial(kit.atlas, kit.manifest.atlas.size, sky, { ...opts, lod: 1, alphaCut: c })];
    }));
    for (const lod of [0, 1] as const) {
      for (const kind of PLANT_KINDS) {
        for (let v = 0; v < PLANT_SHAPES; v++) {
          const g = kit.geometry(kind, v, lod).clone();
          const cap = KIT_CAPACITY[lod];
          const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
          const seed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
          g.setAttribute('plantTint', tint);
          g.setAttribute('plantSeed', seed);
          const origin = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          g.setAttribute('plantOrigin', origin);
          this.origins.push(origin);
          const mesh = new THREE.InstancedMesh(g, lod === 0 ? l0 : l1.get(kind)!, cap);
          mesh.name = `kit_${kind}_${v}_L${lod}`;
          mesh.count = 0;
          mesh.frustumCulled = false;
          this.index.set(`${kind}:${v}:${lod}`, this.meshes.length);
          this.meshes.push(mesh);
          this.tints.push(tint);
          this.seeds.push(seed);
          const c = KIT_CALIBRATION[kind];
          this.gains.push(lod === 0 ? [c.l0, c.l0, c.l0] : c.l1);
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
      for (const [attr, size] of [[mesh.instanceMatrix, 16], [this.tints[k], 3], [this.seeds[k], 1], [this.origins[k], 3]] as const) {
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
    // The plant's colour jitter, relative to its kind's palette (the atlas carries the kind's own colour), and the
    // level's colour gain (KIT_CALIBRATION).
    const base = PLANT_ALBEDO[p.kind], g = this.gains[m];
    const t = this.tints[m].array as Float32Array;
    t[i * 3] = (p.tint[0] / base[0]) * g[0]; t[i * 3 + 1] = (p.tint[1] / base[1]) * g[1]; t[i * 3 + 2] = (p.tint[2] / base[2]) * g[2];
    (this.seeds[m].array as Float32Array)[i] = p.seed;
    const o3 = this.origins[m].array as Float32Array;
    o3[i * 3] = p.x; o3[i * 3 + 1] = y; o3[i * 3 + 2] = p.z;
  }

  /** The wind (the conditions'): none on glass, gentle on a Doctor afternoon; the same scale the hulls sway at. */
  tick(timeS: number, windSpeedMs: number): void {
    this.time.value = timeS;
    this.sway.value = 0.06 * Math.min(1.5, Math.max(0, windSpeedMs) / 8);
  }

  setVisible(on: boolean): void {
    for (const m of this.meshes) m.visible = on;
  }
}

/**
 * Near, mid and far agreeing (dune-up-close §4.2, measured by the self-test "heath: each kind's levels match in colour
 * where they meet" under one sun): each kind's L0 brightness gain and L1 colour gain (L0's average hue: its red tips
 * and flowers, at the hull's brightness), written into the instances' tint, and its hull's colour multiplier (L1's hue
 * at the hull's own brightness, so the far heath keeps its brightness). A kit rebuild re-measures: the self-test prints
 * the corrections still needed ("fit"), which multiply these.
 */
export const KIT_CALIBRATION: Record<PlantKind, { l0: number; l1: [number, number, number]; hull: [number, number, number] }> = {
  daisy: { l0: 1.271, l1: [0.733, 0.725, 0.722], hull: [1.01, 0.947, 1.067] },
  green: { l0: 2.231, l1: [1.292, 1.177, 1.399], hull: [0.786, 1.291, 0.688] },
  tall: { l0: 1.431, l1: [0.784, 0.752, 0.775], hull: [0.96, 0.926, 1.231] },
  pigface: { l0: 2.524, l1: [0.817, 0.626, 1.213], hull: [0.873, 1.05, 1.168] },
  rice: { l0: 1.926, l1: [1.177, 1.066, 1.236], hull: [1.007, 0.957, 1.085] },
  dead: { l0: 0.663, l1: [0.622, 0.606, 0.584], hull: [1.011, 0.992, 0.995] },
  cushion: { l0: 1.068, l1: [0.567, 0.568, 0.566], hull: [0.985, 0.99, 1.03] },
  spinach: { l0: 1.792, l1: [1.127, 1.133, 1.069], hull: [0.951, 1.058, 0.933] },
};

/**
 * Each kind's L1 alpha cut at 12 m and at 40 m (spec §3.1's no pop): L1's cards cover what L0's leaves did where they
 * meet, and what the hull does where it takes over (the far heath unchanged). Fitted by the self-test "heath: a plant's
 * coverage changes 10% or less" with ?fit=1 (it bisects each and prints the table). Never under 0.45: lower, a card
 * draws its faint halo too and a lacy shrub turns into a grey lump (daisy and cushion did, at 0.2 and 0.03).
 */
export const KIT_L1_CUT: Record<PlantKind, [number, number]> = {
  daisy: [0.45, 0.556],
  green: [0.773, 0.969],
  tall: [0.969, 0.969],
  pigface: [0.969, 0.969],
  rice: [0.45, 0.45],
  dead: [0.969, 0.45],
  cushion: [0.45, 0.969],
  spinach: [0.679, 0.514],
};

/** Each kind's hull colour multiplier (KIT_CALIBRATION's), for PlantMeshes.setKindColours. */
export function hullColours(): Record<PlantKind, [number, number, number]> {
  return Object.fromEntries(PLANT_KINDS.map((k) => [k, KIT_CALIBRATION[k].hull])) as Record<PlantKind, [number, number, number]>;
}

/** What the kit's material needs beyond the atlas: the wind's clock and strength, the self-tests' switch, the bands. */
export interface KitMaterialOptions {
  lod: 0 | 1;
  time: N;
  sway: N;
  forceBand: N;
  sunVisibility?: (xz: N) => N;
  /** The band edges: L0 hands to L1 at nearM, L1 to the far hulls (or to nothing) at farM. Default 12 and 40 m. */
  nearM?: number;
  farM?: number;
  /** The alpha a texel must reach to draw: at nearM and at farM, eased between (default 0.5 throughout). */
  alphaCut?: [N, N];
}

/**
 * The kit's material (dune-up-close §4.2): the atlas's colour × each instance's tint, its AO, the wind (stiff at the
 * root, fluttering leaves), wrap lighting with light through backlit leaves, the band dither, and alpha raised with the
 * mip so far cards don't vanish. The plants, the tufts and the ground items all draw with it.
 */
export function kitMaterial(atlas: THREE.Texture, atlasSize: number, sky: Sky, o: KitMaterialOptions): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.DoubleSide;
  const col: N = attribute('color', 'vec4'); // AO, root distance, flutter phase, what it is (0 wood, .2 dead, .5 leaf, 1 flower)
  const uv: N = attribute('uv', 'vec2');
  const tex: N = texture(atlas, uv);
  // The atlas's mips average a spray's or a card's alpha toward its coverage (a third, for daisy needles), under the
  // 0.5 cut: far cards vanished. Raise the alpha with the mip level the pixel samples.
  const mip: N = max(log2(max(fwidth(uv.x), fwidth(uv.y)).mul(atlasSize)), 0.0).toVar();
  const alpha: N = tex.a.mul(float(1.0).add(mip.mul(0.35)));
  const seed: N = attribute('plantSeed', 'float');
  const leafy: N = step(0.4, col.w);
  // Wind (spec §4.2): stiff at the root, the tips moving with the root distance cubed; leaves flutter on their own phase.
  // (positionLocal is already placed by the instance here, so the sway is in metres.)
  const bend: N = col.y.mul(col.y).mul(col.y).mul(o.sway);
  const sway: N = vec3(sin(o.time.mul(1.7).add(seed.mul(6.28))), 0.0, sin(o.time.mul(1.3).add(seed.mul(4.1))).mul(0.6)).mul(bend);
  const flutter: N = normalWorld.mul(sin(o.time.mul(9.0).add(col.z.mul(6.28))).mul(0.004).mul(leafy).mul(o.sway.mul(16.0)));
  m.positionNode = positionLocal.add(sway).add(flutter);
  // The band fade (spec §3.1).
  const [wNear, wFar] = bandWeightNodes(attribute('plantOrigin', 'vec3'), o.nearM ?? NEAR_M, o.farM ?? MID_M);
  const dither: N = bandDitherNode(seed);
  const keepBand: N = o.lod === 0 ? dither.lessThan(wNear) : dither.greaterThanEqual(wNear).and(dither.lessThan(float(1).sub(wFar)));
  const cut: N = o.alphaCut ? mix(o.alphaCut[0], o.alphaCut[1], smoothstep(o.nearM ?? NEAR_M, o.farM ?? MID_M, length(cameraPosition.sub(positionWorld)))) : float(0.5);
  // The alpha test first: its mip comes from derivatives, which are only defined in uniform control flow, and WGSL's &&
  // short-circuits (behind the dither, L0's alpha read mip 0 beside every dithered-out pixel and lost its thin leaves).
  m.maskNode = alpha.greaterThan(cut).and(keepBand.or(o.forceBand.greaterThan(0.5)));

  // Never normalise a zero normal (NaN): a hair of up keeps it finite.
  const n: N = normalize(normalWorld.mul(faceDirection).add(vec3(0.0, 1e-4, 0.0)));
  const l = sky.sunDirection;
  const toCam: N = cameraPosition.sub(positionWorld);
  const dist: N = length(toCam);
  const v: N = toCam.div(max(dist, 1e-3));
  // Leaves keep half their light inside the crown (silver and fleshy leaves scatter it: gate 1 read them too dark).
  const ao: N = max(col.x, leafy.mul(0.5));
  const albedo: N = tex.rgb.mul(attribute('plantTint', 'vec3'));
  const vis: N = o.sunVisibility ? o.sunVisibility(positionWorld.xz) : float(1.0);
  const wrap: N = max(dot(n, l).add(0.4).div(1.4), 0.0);
  const sunE: N = sky.sunIlluminance.mul(vis).mul(wrap).mul(ao).mul(step(0.0, l.y));
  // Light through the leaves when they're backlit (thin-leaf translucency), tinted by the leaf.
  const through: N = pow(saturate(dot(v.negate(), l)), 4.0).mul(0.35).mul(leafy);
  const glow: N = sky.sunIlluminance.mul(vis).mul(through).mul(albedo.mul(1.2)).mul(step(0.0, l.y));
  const skyE: N = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5)).mul(ao);
  const bounce: N = sky.sunIlluminance.mul(max(l.y, 0.0)).mul(0.3).mul(float(0.5).sub(n.y.mul(0.5))).mul(ao);
  const lit: N = albedo.mul(sunE.add(skyE).add(bounce)).add(glow).div(PI);
  m.colorNode = sky.applyAerialPerspective(lit, dist, v.negate());
  return m;
}
