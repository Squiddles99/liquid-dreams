import * as THREE from 'three/webgpu';
import type { DebugOverlays } from '../ocean/OceanSurface';
import type { Sky } from '../sky/Sky';
import { type LandFile, decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { buildLandMesh } from './landMesh';
import { DEFAULT_LAND_PARAMS, type LandParams, beachProfileFor, normalizeLandParams } from './landParams';
import { type LandLookUniforms, createLandLookUniforms, createLandMaterial } from './landShading';

type N = any;

export const LAND_URL = `${import.meta.env?.BASE_URL ?? '/'}terrain/womb-land.bin`;

async function fetchLand(): Promise<Uint8Array> {
  const r = await fetch(LAND_URL);
  if (!r.ok) throw new Error(`land file: HTTP ${r.status} for ${LAND_URL}`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * The land (spec 2026-09-28-the-view-back-design.md): the baked file, the composed height, the static mesh and its
 * material. Until load() succeeds the mesh is hidden and height is null, and the game runs landless.
 */
export class Land {
  readonly mesh: THREE.Mesh;
  height: LandHeight | null = null;
  /** Bumped on every (re)build: the skyline and sunlight caches key on it. */
  version = 0;
  private file: LandFile | null = null;
  private readonly params: LandParams = { ...DEFAULT_LAND_PARAMS };
  private readonly look: LandLookUniforms = createLandLookUniforms();
  private readonly sky: Sky;
  private sunVisibility: ((xz: N) => N) | undefined;

  constructor(sky: Sky) {
    this.sky = sky;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), createLandMaterial(sky, this.look));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The sunlight map's lookup (Task 8); rebuilds the material. Call before the first render. */
  setSunVisibility(fn: (xz: N) => N): void {
    this.sunVisibility = fn;
    this.mesh.material = createLandMaterial(this.sky, this.look, fn);
  }

  async load(fetchBytes: () => Promise<Uint8Array> = fetchLand): Promise<void> {
    const file = decodeLandFile(await fetchBytes());
    this.file = file;
    this.rebuild();
  }

  /** Recompose the height and rebuild the mesh from the current beach params. */
  rebuild(): void {
    if (!this.file) return;
    this.height = new LandHeight(this.file, beachProfileFor(this.params));
    const d = buildLandMesh(this.height);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute('cover', new THREE.BufferAttribute(d.cover, 4));
    g.setAttribute('detail', new THREE.BufferAttribute(d.detail, 2));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = true;
    this.version++;
  }

  /** Copies the params in (normalized) and sets the look. Returns true when the beach shape changed (call rebuild()). */
  setParams(p: LandParams): boolean {
    const shape = p.beachWidthM !== this.params.beachWidthM || p.toeHeightM !== this.params.toeHeightM;
    Object.assign(this.params, p);
    normalizeLandParams(this.params);
    this.look.sandBrightness.value = this.params.sandBrightness;
    this.look.heathBrightness.value = this.params.heathBrightness;
    this.look.heathSilver.value = this.params.heathSilver;
    this.look.heathOrange.value = this.params.heathOrange;
    return shape && this.file !== null;
  }

  get shadowOn(): boolean {
    return this.params.shadow;
  }

  setOverlays(o: DebugOverlays): void {
    this.look.coverOn.value = o.coverMap ? 1 : 0;
    this.look.sunlightOn.value = o.sunlightMap ? 1 : 0;
  }
}
