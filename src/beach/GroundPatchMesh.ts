import * as THREE from 'three/webgpu';
import { attribute, clamp, float, floor, int, ivec2, max, min, mix, mx_noise_float, normalize, smoothstep, texture, textureLoad, uniform, varying, vec2, vec3 } from 'three/tsl';
import { type LandLookUniforms, type PatchHole, createLandMaterial } from '../land/landShading';
import type { Sky } from '../sky/Sky';
import { PATCH_CELL_M, PATCH_FADE_M, PATCH_GRID_N, PATCH_SIZE_M, PATCH_SKIRT_M, PATCH_VERTS, type PatchGrids } from './groundPatch';
import { SHADOW_N } from './rockShadows';

type N = any;

const HALF = PATCH_SIZE_M / 2;

function gridTexture(channels: 1 | 4): THREE.DataTexture {
  const n = PATCH_GRID_N;
  const t = new THREE.DataTexture(new Float32Array(n * n * channels), n, n, channels === 1 ? THREE.RedFormat : THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * A PATCH_VERTS² grid over the square in local metres (−32…32 in x and z), plus a skirt: a copy of the edge ring with
 * attribute `skirt` = 1, joined to the edge by a wall, dropped PATCH_SKIRT_M so the coarse land never shows a crack.
 */
function patchGeometry(): THREE.BufferGeometry {
  const v = PATCH_VERTS, ring: number[] = [];
  for (let i = 0; i < v - 1; i++) ring.push(i); // south edge, west → east
  for (let j = 0; j < v - 1; j++) ring.push(j * v + v - 1); // east edge
  for (let i = v - 1; i > 0; i--) ring.push((v - 1) * v + i); // north edge, east → west
  for (let j = v - 1; j > 0; j--) ring.push(j * v); // west edge
  const count = v * v + ring.length;
  const pos = new Float32Array(count * 3), skirt = new Float32Array(count);
  for (let j = 0; j < v; j++) {
    for (let i = 0; i < v; i++) {
      const k = j * v + i;
      pos[k * 3] = -HALF + i * PATCH_CELL_M;
      pos[k * 3 + 2] = -HALF + j * PATCH_CELL_M;
    }
  }
  ring.forEach((src, r) => {
    const k = v * v + r;
    pos[k * 3] = pos[src * 3];
    pos[k * 3 + 2] = pos[src * 3 + 2];
    skirt[k] = 1;
  });
  const idx: number[] = [];
  for (let j = 0; j < v - 1; j++) {
    for (let i = 0; i < v - 1; i++) {
      const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let r = 0; r < ring.length; r++) {
    const a = ring[r], b = ring[(r + 1) % ring.length], a2 = v * v + r, b2 = v * v + ((r + 1) % ring.length);
    idx.push(a, b, a2, b, b2, a2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skirt', new THREE.BufferAttribute(skirt, 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return g;
}

/**
 * The fine ground at your feet (Phase 4c-1 §3.2): the land's composed height (a 1 m grid, bilinear) plus fine procedural
 * relief, lit by the land's own material with its cover read from textures, the rocks' grounding shadows, and the sand's
 * grit, shell flecks and ripples. It draws in walk mode or near the ground; the coarse land cuts its square out (`hole`).
 */
export class GroundPatch {
  readonly mesh: THREE.Mesh;
  readonly hole: PatchHole;
  private readonly corner = uniform(new THREE.Vector2(0, 0));
  private readonly heights = gridTexture(1);
  private readonly cover = gridTexture(4);
  private readonly detail = gridTexture(4);
  private readonly zones = gridTexture(4);
  private readonly shadows: THREE.DataTexture;

  constructor(sky: Sky, look: LandLookUniforms, opts: { sunVisibility?: (xz: N) => N; wetHeight?: (xz: N) => N } = {}) {
    this.hole = { centre: uniform(new THREE.Vector2(0, 0)), half: uniform(HALF), on: uniform(0) };
    this.shadows = new THREE.DataTexture(new Uint8Array(SHADOW_N * SHADOW_N * 2), SHADOW_N, SHADOW_N, THREE.RGFormat, THREE.UnsignedByteType);
    this.shadows.minFilter = THREE.LinearFilter;
    this.shadows.magFilter = THREE.LinearFilter;
    this.shadows.wrapS = THREE.ClampToEdgeWrapping;
    this.shadows.wrapT = THREE.ClampToEdgeWrapping;
    this.shadows.generateMipmaps = false;
    this.shadows.needsUpdate = true;

    const local: N = attribute('position', 'vec3');
    const xz: N = local.xz.add(this.hole.centre);
    const cover: N = this.bilinear(this.cover, xz);
    const detail: N = this.bilinear(this.detail, xz);
    const zones: N = this.bilinear(this.zones, xz);
    const h: N = this.heightNode(xz);
    const hx: N = this.heightNode(xz.add(vec2(1, 0))).sub(this.heightNode(xz.sub(vec2(1, 0)))).mul(0.5);
    const hz: N = this.heightNode(xz.add(vec2(0, 1))).sub(this.heightNode(xz.sub(vec2(0, 1)))).mul(0.5);
    // The relief, zero within PATCH_FADE_M of the edge so the patch meets the coarse land: low lumps on the dry sand
    // (the wet sand stays flat), rougher ground on rock and heath. The 12 cm ripples are in the shading normal (plan
    // ruling: a 25 cm grid can't carry them).
    const edge = float(1.0).sub(smoothstep(HALF - PATCH_FADE_M, HALF, max(local.x.abs(), local.z.abs())));
    const lumps = mx_noise_float(vec3(xz.x.div(1.3), xz.y.div(1.3), 2.2)).sub(mx_noise_float(vec3(xz.x.div(0.6), xz.y.div(0.6), 2.9)).mul(0.5)).mul(0.03);
    const rough = mx_noise_float(vec3(xz.x.div(0.7), xz.y.div(0.7), 4.4)).mul(0.04);
    const relief = lumps.mul(cover.y).add(rough.mul(cover.z.add(cover.w))).mul(edge);
    const y = h.add(relief).sub(attribute('skirt', 'float').mul(PATCH_SKIRT_M));

    const m = createLandMaterial(sky, look, {
      sunVisibility: opts.sunVisibility,
      wetHeight: opts.wetHeight,
      inputs: { normal: varying(normalize(vec3(hx.negate(), 1.0, hz.negate()))), cover: varying(cover), detail: varying(detail.xyz), zones: varying(zones) },
      patch: { shadow: (p: N) => texture(this.shadows, p.sub(this.corner).div(PATCH_SIZE_M)).xy },
    });
    m.positionNode = vec3(xz.x, y, xz.y);
    m.side = THREE.DoubleSide;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    this.mesh = new THREE.Mesh(patchGeometry(), m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    // Drawn before the land and the water: the coarse land discards its pixels under the patch, so without the patch's
    // depth already there the land (and the water beneath the beach) would shade them first (0.3–0.6 ms, measured).
    this.mesh.renderOrder = -1;
  }

  /** The grid's height at world xz (bilinear between 1 m samples, clamped to the square), without the relief. */
  heightNode(xz: N): N {
    return this.bilinear(this.heights, xz).x;
  }

  private bilinear(tex: THREE.DataTexture, xz: N): N {
    const maxIndex = vec2(PATCH_GRID_N - 1, PATCH_GRID_N - 1);
    const f = clamp(xz.sub(this.corner), vec2(0.0), maxIndex);
    const base = min(floor(f), maxIndex.sub(1.0));
    const t = f.sub(base);
    const i0 = ivec2(base);
    const load = (dx: number, dz: number): N => textureLoad(tex, i0.add(ivec2(dx, dz)), int(0));
    return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
  }

  setGrids(g: PatchGrids): void {
    (this.heights.image.data as Float32Array).set(g.heights);
    (this.cover.image.data as Float32Array).set(g.cover);
    (this.detail.image.data as Float32Array).set(g.detail);
    (this.zones.image.data as Float32Array).set(g.zones);
    for (const t of [this.heights, this.cover, this.detail, this.zones]) t.needsUpdate = true;
    this.corner.value.set(g.cornerX, g.cornerZ);
    this.hole.centre.value.set(g.cornerX + HALF, g.cornerZ + HALF);
  }

  /** The rocks' grounding shadows (buildRockShadows' output for this square), stored as 8-bit (filterable). */
  setShadows(s: Float32Array): void {
    const d = this.shadows.image.data as Uint8Array;
    for (let k = 0; k < d.length; k++) d[k] = Math.round(Math.min(1, Math.max(0, s[k])) * 255);
    this.shadows.needsUpdate = true;
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on;
    this.hole.on.value = on ? 1 : 0;
  }
}
