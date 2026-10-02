import * as THREE from 'three/webgpu';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { smoothstep } from '../math/smoothstep';
import { BAND_FADE_M, MID_M, NEAR_M } from './plantRing';

/** One plant (or scatter item) variant in the kit's manifest (tools/heath/build.py). */
export interface KitVariant {
  kind: string;
  variant: number;
  lods: { name: string; triangles: number }[];
  /** The unit plant's extent: max |x|, height, max |z|. */
  boundsUnit: [number, number, number];
  /** Its leaves' leaf-area-weighted colour (linear): what the far hull takes (spec §4.2). */
  leafColour: [number, number, number];
  checks: Record<string, number | boolean>;
}

export interface KitManifest {
  version: 1;
  units: 'unit';
  variants: KitVariant[];
  items: KitVariant[];
  atlas: { file: string; size: number; tiles: Record<string, [number, number, number, number]> };
}

/** The heath kit (dune-up-close spec §3.1): its manifest, each variant's geometry at L0 and L1, and the atlas. */
export interface Kit {
  manifest: KitManifest;
  geometry(kind: string, variant: number, lod: 0 | 1): THREE.BufferGeometry;
  /** A scatter item's geometry (a tuft at L0 or L1, a ground item at L0), in metres. */
  item(kind: string, variant: number, lod: 0 | 1): THREE.BufferGeometry;
  atlas: THREE.Texture;
}

/**
 * How much of a plant at distance d each band draws (spec §3.1): [L0, L1, the far hull], summing to 1; each boundary
 * (12 m, 40 m) hands over across BAND_FADE_M.
 */
export function bandWeights(d: number): [number, number, number] {
  const h = BAND_FADE_M / 2;
  const a = 1 - smoothstep(NEAR_M - h, NEAR_M + h, d), c = smoothstep(MID_M - h, MID_M + h, d);
  return [a, Math.max(0, 1 - a - c), c];
}

export const KIT_URL = 'heath/';

/** Each plant variant's canopy silhouette from the atlas (`canopy_<kind>_<v>`): its alpha, row by row (the shadows'). */
export async function canopySilhouettes(kit: Kit, base = import.meta.env.BASE_URL + KIT_URL): Promise<Map<string, Uint8Array>> {
  const bmp = await createImageBitmap(await (await fetch(base + kit.manifest.atlas.file)).blob(), { premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const out = new Map<string, Uint8Array>();
  for (const [name, [u0, v0, u1, v1]] of Object.entries(kit.manifest.atlas.tiles)) {
    if (!name.startsWith('canopy_')) continue;
    const x = Math.round(u0 * bmp.width - 0.5), y = Math.round(v0 * bmp.height - 0.5), n = Math.round((u1 - u0) * bmp.width + 1);
    const px = g.getImageData(x, y, n, n).data, a = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) a[i] = px[i * 4 + 3];
    out.set(name.slice('canopy_'.length), a);
  }
  return out;
}

export async function loadKit(base = import.meta.env.BASE_URL + KIT_URL): Promise<Kit> {
  const [manifest, gltf, atlas] = await Promise.all([
    fetch(base + 'heathKit.manifest.json').then((r) => {
      if (!r.ok) throw new Error(`heath kit: ${r.status} fetching the manifest`);
      return r.json() as Promise<KitManifest>;
    }),
    new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/')).loadAsync(base + 'heathKit.glb'),
    new THREE.TextureLoader().loadAsync(base + 'heathAtlas.png'),
  ]);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = false; // glTF's UVs: v down from the top
  atlas.anisotropy = 4;
  const byName = new Map<string, THREE.BufferGeometry>();
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) byName.set(o.name, (o as THREE.Mesh).geometry);
  });
  return {
    manifest,
    atlas,
    geometry(kind, variant, lod) {
      const g = byName.get(`plant_${kind}_${variant}_L${lod}`);
      if (!g) throw new Error(`heath kit: no mesh plant_${kind}_${variant}_L${lod}`);
      return g;
    },
    item(kind, variant, lod) {
      const g = byName.get(`${kind}_${variant}_L${lod}`);
      if (!g) throw new Error(`heath kit: no mesh ${kind}_${variant}_L${lod}`);
      return g;
    },
  };
}
