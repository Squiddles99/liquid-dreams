import * as THREE from 'three/webgpu';
import type { DebugOverlays } from '../ocean/OceanSurface';
import type { Sky } from '../sky/Sky';
import { type LandFile, decodeLandFile } from './landData';
import { LandHeight } from './landHeight';
import { buildLandMesh } from './landMesh';
import { DEFAULT_LAND_PARAMS, type LandParams, beachProfileFor, normalizeLandParams } from './landParams';
import { type LandLookUniforms, type PatchHole, createLandLookUniforms, createLandMaterial } from './landShading';
import { SkylineTable } from './SkylineTable';
import { SunlightMap } from './SunlightMap';
import { buildMarchHeights } from './sunlight';

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
  /** The land's shadow over the ground and the water (spec §4.8): 1 everywhere until the land loads. */
  readonly sunlight = new SunlightMap();
  /** The skyline for the water's reflections (spec §4.9). */
  readonly skyline = new SkylineTable();
  height: LandHeight | null = null;
  /** Bumped on every (re)build: the skyline and sunlight caches key on it. */
  version = 0;
  private file: LandFile | null = null;
  private readonly params: LandParams = { ...DEFAULT_LAND_PARAMS };
  /** The look uniforms (the Land folder), shared with the fine ground patch. */
  readonly look: LandLookUniforms = createLandLookUniforms();
  private readonly sky: Sky;
  private sunVisibility: ((xz: N) => N) | undefined;
  private wetHeight: ((xz: N) => N) | undefined;
  private hole: PatchHole | undefined;

  constructor(sky: Sky) {
    this.sky = sky;
    this.sunVisibility = (xz) => this.sunlight.visibilityNode(xz);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), createLandMaterial(sky, this.look, { sunVisibility: this.sunVisibility }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The sunlight map's lookup (Phase 4a §4.8); rebuilds the material. Call before the first render. */
  setSunVisibility(fn: (xz: N) => N): void {
    this.sunVisibility = fn;
    this.rebuildMaterial();
  }

  /** The height the sand is wet up to (Phase 4b §3.4: the tide plus the recent runup); rebuilds the material. */
  setWetHeight(fn: (xz: N) => N): void {
    this.wetHeight = fn;
    this.rebuildMaterial();
  }

  /** The fine ground patch's square, cut out of this mesh while the patch shows (Phase 4c-1 §3.2); rebuilds the material. */
  setHole(h: PatchHole): void {
    this.hole = h;
    this.rebuildMaterial();
  }

  private rebuildMaterial(): void {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.material = createLandMaterial(this.sky, this.look, { sunVisibility: this.sunVisibility, wetHeight: this.wetHeight, hole: this.hole });
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
    g.setAttribute('detail', new THREE.BufferAttribute(d.detail, 3));
    g.setAttribute('zones', new THREE.BufferAttribute(d.zones, 4));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = true;
    const lh = this.height;
    this.sunlight.setHeights(buildMarchHeights((x, z) => lh.heightAt(x, z)));
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
    this.sunlight.setEnabled(this.params.shadow);
    return shape && this.file !== null;
  }

  /** The sunlight map when the sun moved (at most one march per frame); the skyline when the eye moved 25 m. */
  update(renderer: THREE.WebGPURenderer, sun: readonly [number, number, number], eye: THREE.Vector3): void {
    this.sunlight.update(renderer, sun);
    this.skyline.update(this.height, this.version, eye);
  }

  get shadowOn(): boolean {
    return this.params.shadow;
  }

  setOverlays(o: DebugOverlays): void {
    this.look.coverOn.value = o.coverMap ? 1 : 0;
    this.look.sunlightOn.value = o.sunlightMap ? 1 : 0;
  }
}
