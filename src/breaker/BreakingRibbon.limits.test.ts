import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { computeWgsl, stubRenderer } from './wgslBuild.testutil';
import { describe, expect, it } from 'vitest';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { BreakingRibbon, MAX_STORAGE_BUFFERS_PER_STAGE, modelRibbonSurface } from './BreakingRibbon';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { SetWaves } from './SetWaves';
import { FoamField } from '../whitewater/FoamField';
import { SprayParticles } from '../whitewater/SprayParticles';
import { Land } from '../land/Land';
import { SkylineTable } from '../land/SkylineTable';
import { SunlightMap } from '../land/SunlightMap';
import { CoastalSurf } from '../surf/CoastalSurf';
import { GroundPatch } from '../beach/GroundPatchMesh';
import { Rocks } from '../beach/RockMeshes';
import { PlantMeshes } from '../heath/PlantMeshes';
import { KitMeshes } from '../heath/KitMeshes';
import { BombieMesh } from '../bombie/BombieMesh';
import { createLandLookUniforms } from '../land/landShading';

type N = any;

const storageBindings = (wgsl: string): number => (wgsl.match(/var<storage/g) ?? []).length;
/** Sampled (non-storage) texture bindings in a WGSL stage: the baseline allows 16 per stage. */
const sampledTextures = (wgsl: string): number => (wgsl.match(/var\s+\w+\s*:\s*texture_(?!storage)/g) ?? []).length;
/** Uniform buffer bindings in a WGSL stage: the baseline allows 12 per stage. */
const uniformBuffers = (wgsl: string): number => (wgsl.match(/var<uniform>/g) ?? []).length;


function renderWgsl(mesh: THREE.Mesh): { vertex: string; fragment: string } {
  const b: N = new (THREE as N).WGSLNodeBuilder(mesh, stubRenderer());
  b.scene = new THREE.Scene();
  b.material = mesh.material;
  b.camera = new THREE.PerspectiveCamera();
  b.context.material = mesh.material;
  b.lightsNode = null; b.environmentNode = null; b.fogNode = null;
  b.clippingContext = { version: 0, unionPlanes: [], intersectionPlanes: [], cacheKey: '' };
  b.build();
  return { vertex: b.vertexShader, fragment: b.fragmentShader };
}

describe('BreakingRibbon stays within WebGPU baseline limits', () => {
  // A tiny flat bed: the bindings are what matter, not the reef.
  const grid = { x0: 0, z0: 0, cellM: 1, nx: 4, nz: 4 };
  const bed = { grid, bed: new Float32Array(16).fill(-10), sand: new Float32Array(16), weed: new Float32Array(16) };
  const sim = new OceanSimulation();
  const sets = new SetWaves(sim.time);
  const model = new WaterSurfaceModel(sim, new Seabed(bed), sets);
  const production = new BreakingRibbon(modelRibbonSurface(model), {
    model, sky: new Sky(DEFAULT_ATMOSPHERE), optics: createWaterOpticsUniforms(DEFAULT_WATER_OPTICS),
  });
  const selfTestRig = new BreakingRibbon({ smooth: (xz) => sets.displacementNode(xz), chop: () => vec3(0.0) });
  const passes = ['framePass', 'vertexPass', 'developPass', 'lightPass', 'chopPass', 'normalPass'] as const;

  for (const [label, ribbon] of [['production', production], ['self-test rig', selfTestRig]] as const) {
    // Generating every pass's WGSL takes a few seconds: over the default 5 s when the whole suite shares the machine.
    it(`${label}: every compute pass binds at most ${MAX_STORAGE_BUFFERS_PER_STAGE} storage buffers`, { timeout: 30_000 }, () => {
      const counts = Object.fromEntries(passes.map((p) => [p, storageBindings(computeWgsl((ribbon as unknown as Record<string, THREE.ComputeNode>)[p]))]));
      console.log(`${label} storage buffers per pass: ${JSON.stringify(counts)}`);
      for (const p of passes) expect(counts[p], p).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    });
  }

  it(`the ribbon's and the footprint's shader stages bind at most ${MAX_STORAGE_BUFFERS_PER_STAGE} storage buffers`, () => {
    const footprintMesh = (production as unknown as { footprintScene: THREE.Scene }).footprintScene.children[0] as THREE.Mesh;
    for (const [label, mesh] of [['ribbon', production.mesh], ['footprint', footprintMesh]] as const) {
      const w = renderWgsl(mesh);
      expect(storageBindings(w.vertex), `${label} vertex`).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
      expect(storageBindings(w.fragment), `${label} fragment`).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    }
  });

  describe("the sheet's materials", () => {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    const optics = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
    const foam = new FoamField({ foamNode: (xz) => sets.breakingFoamNode(xz), dirNode: (xz) => sets.sample(xz, true).dir });
    const plain = new OceanSurface(model, sky, optics);
    const withFoam = new OceanSurface(model, sky, optics, { foamMap: foam });
    for (const which of ['aboveMaterial', 'belowMaterial'] as const) {
      const wgsl = (s: OceanSurface): { vertex: string; fragment: string } => renderWgsl(new THREE.Mesh(s.mesh.geometry, s[which]));
      it(`${which}: at most ${MAX_STORAGE_BUFFERS_PER_STAGE} storage buffers and 16 sampled textures per stage, with the foam map`, () => {
        const w = wgsl(withFoam);
        console.log(`sheet ${which} sampled textures: vertex ${sampledTextures(w.vertex)}, fragment ${sampledTextures(w.fragment)}`);
        console.log(`sheet ${which} uniform buffers: vertex ${uniformBuffers(w.vertex)}, fragment ${uniformBuffers(w.fragment)}`);
        for (const stage of [w.vertex, w.fragment]) expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        }
      });
      it(`${which}: the foam map adds exactly one sampled texture to the fragment stage`, () => {
        expect(sampledTextures(wgsl(withFoam).fragment) - sampledTextures(wgsl(plain).fragment)).toBe(1);
      });
    }
    it('the ribbon with the foam map stays within the limits and samples the map in its vertex stage', () => {
      const shading = { model, sky, optics };
      const r0 = new BreakingRibbon(modelRibbonSurface(model), shading);
      const r1 = new BreakingRibbon(modelRibbonSurface(model), { ...shading, foamMap: foam });
      const w0 = renderWgsl(r0.mesh), w1 = renderWgsl(r1.mesh);
      expect(sampledTextures(w1.vertex) - sampledTextures(w0.vertex)).toBe(1);
      for (const stage of [w1.vertex, w1.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
      }
    });
        const sunlight = new SunlightMap();
        it('the sunlight map adds exactly one sampled texture to the sheet above (the skyline none), and keeps every stage within the limits', () => {
          const w0 = renderWgsl(new THREE.Mesh(withFoam.mesh.geometry, withFoam.aboveMaterial));
          const lit = new OceanSurface(model, sky, optics, { foamMap: foam, sunlight, skyline: new SkylineTable() });
          const w1 = renderWgsl(new THREE.Mesh(lit.mesh.geometry, lit.aboveMaterial));
          console.log(`sheet above with sunlight: fragment sampled ${sampledTextures(w1.fragment)}, uniform buffers ${uniformBuffers(w1.fragment)}`);
          expect(sampledTextures(w1.fragment) - sampledTextures(w0.fragment)).toBe(1);
          for (const stage of [w1.vertex, w1.fragment]) {
            expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
            // 17 with the kelp's noise (reef build B, final review I3: baked instead of 3D noise per pixel, −2.9 ms): one
            // over the baseline, as the cloud shadows already were; createRenderer asks the adapter for up to 48.
            expect(sampledTextures(stage)).toBeLessThanOrEqual(17);
            expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
          }
        });
        it('the surf adds no sampled textures to the sheet and keeps it within the limits', () => {
      const surf = new CoastalSurf();
      const w0 = renderWgsl(new THREE.Mesh(withFoam.mesh.geometry, withFoam.aboveMaterial));
      const s = new OceanSurface(model, sky, optics, { foamMap: foam, surf });
      const w1 = renderWgsl(new THREE.Mesh(s.mesh.geometry, s.aboveMaterial));
      console.log(`sheet above with surf: vertex sampled ${sampledTextures(w1.vertex)} uniform ${uniformBuffers(w1.vertex)}, fragment sampled ${sampledTextures(w1.fragment)} uniform ${uniformBuffers(w1.fragment)}`);
      expect(sampledTextures(w1.fragment)).toBe(sampledTextures(w0.fragment));
      expect(sampledTextures(w1.vertex)).toBe(sampledTextures(w0.vertex));
      for (const stage of [w1.vertex, w1.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    });
    it('the ground patch, the rocks and the land with its hole stay within the limits', () => {
      const patch = new GroundPatch(sky, createLandLookUniforms(), { sunVisibility: (xz) => sunlight.visibilityNode(xz) });
      const rocks = new Rocks(sky, (xz) => sunlight.visibilityNode(xz), undefined, patch.layers);
      const land = new Land(sky);
      land.setSunVisibility((xz) => sunlight.visibilityNode(xz));
      land.setHole(patch.hole);
      for (const [label, w] of [['patch', renderWgsl(patch.mesh)], ['rocks', renderWgsl(rocks.meshes[0] as unknown as THREE.Mesh)], ['land', renderWgsl(land.mesh)]] as const) {
        console.log(`${label}: vertex sampled ${sampledTextures(w.vertex)} uniform ${uniformBuffers(w.vertex)}, fragment sampled ${sampledTextures(w.fragment)} uniform ${uniformBuffers(w.fragment)}`);
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
          expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
        }
      }
    });
    it('the ground patch has room for the dune-up-close layers (3 fragment and 2 vertex slots; spec §4.3)', () => {
      const patch = new GroundPatch(sky, createLandLookUniforms(), { sunVisibility: (xz) => sunlight.visibilityNode(xz) });
      const w = renderWgsl(patch.mesh);
      console.log(`patch headroom: vertex ${16 - sampledTextures(w.vertex)}, fragment ${16 - sampledTextures(w.fragment)}`);
      expect(sampledTextures(w.fragment)).toBeLessThanOrEqual(16 - 3);
      expect(sampledTextures(w.vertex)).toBeLessThanOrEqual(16 - 2);
    });
    it('the Bombie stays within the limits', () => {
      const b = new BombieMesh(model, sky, (xz) => sunlight.visibilityNode(xz));
      const w = renderWgsl(b.mesh);
      console.log(`bombie: vertex sampled ${sampledTextures(w.vertex)} uniform ${uniformBuffers(w.vertex)} storage ${storageBindings(w.vertex)}, fragment sampled ${sampledTextures(w.fragment)} uniform ${uniformBuffers(w.fragment)}`);
      for (const stage of [w.vertex, w.fragment]) {
        expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
        expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
        expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
      }
    });
    it('the plants stay within the limits', () => {
      const plants = new PlantMeshes(sky, (xz) => sunlight.visibilityNode(xz));
      for (const i of [0, 32, 64]) { // the first mesh of each level of detail (meshes are ordered level × kind × shape: 8 × 4); LOD 2's matrices exceed the uniform limit (storage)
        const w = renderWgsl(plants.meshes[i] as unknown as THREE.Mesh);
        console.log(`plants lod ${i}: vertex sampled ${sampledTextures(w.vertex)} uniform ${uniformBuffers(w.vertex)} storage ${storageBindings(w.vertex)}, fragment sampled ${sampledTextures(w.fragment)} uniform ${uniformBuffers(w.fragment)}`);
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
          expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
        }
      }
    });
    it('the heath kit stays within the limits (dune-up-close §7.2)', () => {
      const box = (): THREE.BufferGeometry => {
        const g = new THREE.BoxGeometry(1, 1, 1);
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 4).fill(1), 4));
        return g;
      };
      const kit = { manifest: { version: 1 as const, units: 'unit' as const, variants: [], items: [], atlas: { file: '', size: 2048, tiles: {} } }, atlas: new THREE.DataTexture(new Uint8Array(4), 1, 1), geometry: box, item: box };
      const k = new KitMeshes(kit, sky, (xz) => sunlight.visibilityNode(xz));
      for (const i of [0, 32]) {
        const w = renderWgsl(k.meshes[i] as unknown as THREE.Mesh);
        console.log(`kit lod ${i ? 1 : 0}: vertex sampled ${sampledTextures(w.vertex)} uniform ${uniformBuffers(w.vertex)} storage ${storageBindings(w.vertex)}, fragment sampled ${sampledTextures(w.fragment)} uniform ${uniformBuffers(w.fragment)}`);
        for (const stage of [w.vertex, w.fragment]) {
          expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
          expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
        }
      }
    });
    it('the ribbon, the spray and the land with the sunlight map stay within the limits', () => {
          const r = new BreakingRibbon(modelRibbonSurface(model), { model, sky, optics, foamMap: foam, sunlight, skyline: new SkylineTable() });
          const spray = new SprayParticles(sky, undefined, sunlight);
          const land = new Land(sky);
          land.setSunVisibility((xz) => sunlight.visibilityNode(xz));
          for (const w of [renderWgsl(r.mesh), renderWgsl(spray.mesh as unknown as THREE.Mesh), renderWgsl(land.mesh)]) {
            for (const stage of [w.vertex, w.fragment]) {
              expect(storageBindings(stage)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
              expect(sampledTextures(stage)).toBeLessThanOrEqual(16);
              expect(uniformBuffers(stage)).toBeLessThanOrEqual(12);
            }
          }
          for (const p of ['clearPass', 'marchPass'] as const) {
            expect(storageBindings(computeWgsl((sunlight as unknown as Record<string, THREE.ComputeNode>)[p]))).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
          }
        });
  });

  it('the spray passes and material stay within the limits', () => {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    for (const p of ['birthPass', 'stepPass', 'clearPass'] as const) {
      expect(storageBindings(computeWgsl((spray as unknown as Record<string, THREE.ComputeNode>)[p])), p).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    }
    const w = renderWgsl(spray.mesh as unknown as THREE.Mesh);
    console.log(`spray storage buffers: vertex ${storageBindings(w.vertex)}, fragment ${storageBindings(w.fragment)}`);
    expect(storageBindings(w.vertex)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    expect(storageBindings(w.fragment)).toBeLessThanOrEqual(MAX_STORAGE_BUFFERS_PER_STAGE);
    expect(sampledTextures(w.fragment)).toBeLessThanOrEqual(16);
  });
});
