import * as THREE from 'three/webgpu';
import { clamp, float, floor, int, ivec2, max, min, mix, normalize, smoothstep, texture, textureLoad, uniform, vec2, vec3 } from 'three/tsl';
import type { TrackNetwork } from '../land/tracks';
import { BLEND_SOFT, LAYER_N, LAYER_TILE_M } from './groundHeights';
import { PATCH_SIZE_M } from './groundPatch';

type N = any;

/** The tracks mask over the whole fine patch: 256² at 0.25 m (the patch's own lattice), RG = (worn, sink m). */
export const MASK_N = 256;
export const MASK_CELL_M = PATCH_SIZE_M / MASK_N;
const COLOUR_N = 1024, NRH_N = 512, LAYERS = 5;

/** The ground layers on the GPU (dune-up-close §4.3): colour, normal-height-roughness, and the vertex stage's heights. */
export interface GroundLayerTextures {
  colour: THREE.DataArrayTexture;
  nrh: THREE.DataArrayTexture;
  heights: THREE.DataArrayTexture;
  /** Each layer's mean colour (linear): the sand and rock layers' detail is their colour over it. */
  means: THREE.UniformNode<'vec3', THREE.Vector3>[];
  /** 1 once the layers have loaded: until then the patch draws as it did. */
  on: THREE.UniformNode<'float', number>;
}

function arrayTexture(n: number, data: ArrayBufferView, format: THREE.PixelFormat, type: THREE.TextureDataType, linear: boolean): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data as unknown as Uint8Array, n, n, LAYERS);
  t.format = format;
  t.type = type;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = linear ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = linear;
  t.needsUpdate = true;
  return t;
}

/** The textures at their final sizes, empty: the patch's material is built on them once; the layers fill them in. */
export function emptyGroundLayerTextures(): GroundLayerTextures {
  const colour = arrayTexture(COLOUR_N, new Uint8Array(COLOUR_N * COLOUR_N * 4 * LAYERS), THREE.RGBAFormat, THREE.UnsignedByteType, true);
  colour.colorSpace = THREE.SRGBColorSpace;
  colour.anisotropy = 8;
  const nrh = arrayTexture(NRH_N, new Uint8Array(NRH_N * NRH_N * 4 * LAYERS), THREE.RGBAFormat, THREE.UnsignedByteType, true);
  const heights = arrayTexture(LAYER_N, new Float32Array(LAYER_N * LAYER_N * LAYERS), THREE.RedFormat, THREE.FloatType, false);
  return { colour, nrh, heights, means: Array.from({ length: LAYERS }, () => uniform(new THREE.Vector3(0.5, 0.5, 0.5))), on: uniform(0) };
}

async function pixels(url: string): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, bmp.width, bmp.height).data;
}

/** Fills `t` from public/heath/groundLayers.* (the layers stacked top to bottom: each layer's rows are contiguous). */
export async function loadGroundLayers(t: GroundLayerTextures, base = import.meta.env.BASE_URL + 'heath/'): Promise<void> {
  const [colour, nrh, bin, meta] = await Promise.all([
    pixels(base + 'groundLayers.colour.png'),
    pixels(base + 'groundLayers.nrh.png'),
    fetch(base + 'groundLayers.height.bin').then((r) => r.arrayBuffer()),
    fetch(base + 'groundLayers.json').then((r) => r.json() as Promise<{ meanColour: [number, number, number][] }>),
  ]);
  (t.colour.image.data as Uint8Array).set(colour);
  (t.nrh.image.data as Uint8Array).set(nrh);
  const h = new Uint16Array(bin), out = t.heights.image.data as unknown as Float32Array;
  for (let i = 0; i < h.length; i++) out[i] = h[i] / 65535;
  meta.meanColour.forEach((c, i) => t.means[i].value.set(c[0], c[1], c[2]));
  for (const x of [t.colour, t.nrh, t.heights]) x.needsUpdate = true;
  t.on.value = 1;
}

/**
 * The tracks mask over the patch's square (corner at (cornerX, cornerZ)): MASK_N² texels at MASK_CELL_M, on the global
 * lattice (the patch snaps to 4 m); RG = (the worn mask, the sink in metres), exactly TrackNetwork.worn/sinkExact there.
 */
export function buildTracksMask(
  tracks: TrackNetwork | null, cornerX: number, cornerZ: number, out: Float32Array<ArrayBuffer> = new Float32Array(MASK_N * MASK_N * 2),
  prev?: { mask: Float32Array; cornerX: number; cornerZ: number },
): Float32Array<ArrayBuffer> {
  // A recentre moves the square 8 m: the texels the old and new squares share are copied (seven-eighths of them).
  const si = prev ? Math.round((cornerX - prev.cornerX) / MASK_CELL_M) : 0, sj = prev ? Math.round((cornerZ - prev.cornerZ) / MASK_CELL_M) : 0;
  const shared = (i: number, j: number): boolean => !!prev && i + si >= 0 && i + si < MASK_N && j + sj >= 0 && j + sj < MASK_N;
  const old = prev && prev.mask !== out ? prev.mask : prev ? prev.mask.slice() : null;
  out.fill(0);
  if (!tracks) return out;
  // Each texel is a lattice point, where wornAt and sinkAt are the exact values: one search a texel, and none in the
  // 4 m cells no track reaches (most of them: the patch snaps to 4 m, so its cells are the tracks' own).
  const v: [number, number] = [0, 0], per = Math.round(4 / MASK_CELL_M);
  for (let cj = 0; cj < MASK_N / per; cj++) {
    for (let ci = 0; ci < MASK_N / per; ci++) {
      if (!tracks.touchesCell(Math.floor(cornerX / 4) + ci, Math.floor(cornerZ / 4) + cj)) continue;
      for (let j = cj * per; j < (cj + 1) * per; j++) {
        const z = cornerZ + j * MASK_CELL_M;
        for (let i = ci * per; i < (ci + 1) * per; i++) {
          const k = (j * MASK_N + i) * 2;
          if (old && shared(i, j)) {
            const o = ((j + sj) * MASK_N + i + si) * 2;
            out[k] = old[o];
            out[k + 1] = old[o + 1];
            continue;
          }
          tracks.wornSinkExact(cornerX + i * MASK_CELL_M, z, v);
          out[k] = v[0];
          out[k + 1] = v[1];
        }
      }
    }
  }
  return out;
}

/** The layer heights at the vertex (the texel nearest each 0.25 m vertex: exactly the CPU's GroundLayersCpu.height). */
export function layerHeightNode(heights: THREE.DataArrayTexture, layer: number, xz: N): N {
  const idx: N = floor(xz.div(LAYER_TILE_M).mul(LAYER_N).add(0.5));
  const wrapped: N = idx.sub(floor(idx.div(LAYER_N)).mul(LAYER_N));
  return textureLoad(heights, ivec2(wrapped), int(0)).depth(int(layer)).x;
}

/**
 * The height-blended weights (sand, soil, limestone, track) from the four layers' weights `w` and heights `h`: those
 * within BLEND_SOFT of the best height-plus-weight share, normalised (spec §4.3). Mirrors groundHeights.blendedHeight.
 */
export function blendWeightsNode(w: N[], h: N[]): N[] {
  const score = w.map((wi, i) => wi.greaterThan(0).select(h[i].add(wi), float(-1e9)));
  const top: N = max(max(score[0], score[1]), max(score[2], score[3]));
  const b: N[] = score.map((s) => max(s.sub(top.sub(BLEND_SOFT)), 0.0));
  const sum: N = max(b[0].add(b[1]).add(b[2]).add(b[3]), 1e-6);
  return b.map((bi, i) => bi.div(sum).mul(w[i].greaterThan(0).select(float(1), float(0))));
}

/** The worn mask and sink at world xz from the mask texture (bilinear between texels; 0 off the square). */
export function wornSinkNode(mask: THREE.DataTexture, corner: N, xz: N): N {
  const f: N = xz.sub(corner).div(MASK_CELL_M);
  const inside: N = f.x.greaterThanEqual(0).and(f.y.greaterThanEqual(0)).and(f.x.lessThanEqual(MASK_N - 1)).and(f.y.lessThanEqual(MASK_N - 1));
  const g: N = clamp(f, vec2(0.0), vec2(MASK_N - 1));
  const base: N = min(floor(g), vec2(MASK_N - 2));
  const t: N = g.sub(base);
  const i0: N = ivec2(base);
  const load = (dx: number, dz: number): N => textureLoad(mask, i0.add(ivec2(dx, dz)), int(0)).xy;
  const v: N = mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
  return inside.select(v, vec2(0.0));
}

/**
 * The fragment's ground detail (spec §4.3): each layer tiled every 2 m, height-blended by the layers' weights, faded to
 * nothing by 30 m: multipliers for the sand and the rock (their hue stays the land material's), the soil and the track
 * as albedos, the gully's rock steps, and the blended normal's tilt.
 */
export function groundDetailNodes(t: GroundLayerTextures, xz: N, cover: N, worn: N, nearIn: N): { sand: N; rock: N; soil: N; track: N; trackW: N; gully: N; tilt: N; near: N } {
  let near: N = nearIn;
  const uv: N = xz.div(LAYER_TILE_M);
  const col = (i: number): N => texture(t.colour, uv).depth(int(i));
  const nrh = (i: number): N => texture(t.nrh, uv).depth(int(i));
  const keep: N = float(1).sub(worn);
  const w: N[] = [cover.x.add(cover.y).mul(keep), cover.w.mul(keep), cover.z.mul(keep), worn];
  const n: N[] = [0, 1, 2, 3].map(nrh);
  const b: N[] = blendWeightsNode(w, n.map((x) => x.z));
  const tiltN: N = n.reduce((a: N, x: N, i: number) => a.add(x.xy.mul(2).sub(1).mul(b[i])), vec2(0.0));
  const mean = (i: number): N => t.means[i];
  near = near.mul(t.on);
  return {
    sand: mix(vec3(1.0), col(0).rgb.div(mean(0)), near),
    rock: mix(vec3(1.0), col(2).rgb.div(mean(2)), near),
    soil: col(1).rgb,
    track: col(3).rgb,
    trackW: worn.mul(near),
    // The beach path's gully (§4.1): where it cuts the limestone band its shoulders show rock steps.
    gully: cover.z.mul(smoothstep(0.2, 0.6, worn)).mul(float(1).sub(smoothstep(0.9, 1.0, worn))).mul(near),
    tilt: tiltN.mul(near).mul(0.5),
    near,
  };
}

export const groundNormalNode = (n0: N, tilt: N): N => normalize(n0.add(vec3(tilt.x.negate(), 0.0, tilt.y.negate())));
