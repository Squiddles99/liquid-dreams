import * as THREE from 'three/webgpu';
import { context, vec3 } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { BreakingRibbon, MAX_STORAGE_BUFFERS_PER_STAGE, modelRibbonSurface } from './BreakingRibbon';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { SetWaves } from './SetWaves';

type N = any;

/**
 * WebGPU checks maxStorageBuffersPerShaderStage only when the device creates the bind group layout, so an over-limit pass
 * builds, compiles offline and then fails at runtime (every dispatch invalid). This builds each of the ribbon's shaders
 * to WGSL with three's own node builder on a minimal stand-in renderer (no device) and counts its storage bindings.
 */
function stubRenderer(): N {
  return {
    library: new (THREE as N).StandardNodeLibrary(),
    lighting: { createNode: () => null, getNode: () => null },
    getRenderTarget: () => null,
    getOutputRenderTarget: () => null,
    getMRT: () => null,
    getColorBufferType: () => THREE.HalfFloatType,
    coordinateSystem: THREE.WebGPUCoordinateSystem,
    toneMapping: THREE.NoToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    currentColorSpace: THREE.SRGBColorSpace,
    currentToneMapping: THREE.NoToneMapping,
    contextNode: context(),
    logarithmicDepthBuffer: false,
    _currentRenderContext: null,
    backend: {
      utils: { getTextureSampleData: () => ({ primarySamples: 1 }) },
      isWebGPUBackend: true, device: { features: new Set(), limits: {} }, compatibilityMode: false, hasFeature: () => false, getClearColor: () => null,
    },
    hasCompatibility: () => false,
    hasFeature: () => false,
    getCanvasTarget: () => null,
    xr: { enabled: false },
    debug: { onNodeBuilderCreated: null, diagnostics: { keywords: false } },
    depth: true, stencil: false, alpha: true,
    shadowMap: { enabled: false },
    info: {},
    samples: 1,
  };
}

const storageBindings = (wgsl: string): number => (wgsl.match(/var<storage/g) ?? []).length;

function computeWgsl(node: THREE.ComputeNode): string {
  const b: N = new (THREE as N).WGSLNodeBuilder(null, stubRenderer());
  b.compute = node;
  b.build();
  return b.computeShader;
}

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
  const production = new BreakingRibbon(modelRibbonSurface(model), DEFAULT_BREAK_PARAMS, {
    model, sky: new Sky(DEFAULT_ATMOSPHERE), optics: createWaterOpticsUniforms(DEFAULT_WATER_OPTICS),
  });
  const selfTestRig = new BreakingRibbon({ smooth: (xz) => sets.displacementNode(xz), chop: () => vec3(0.0) }, DEFAULT_BREAK_PARAMS);
  const passes = ['framePass', 'vertexPass', 'developPass', 'chopPass', 'normalPass'] as const;

  for (const [label, ribbon] of [['production', production], ['self-test rig', selfTestRig]] as const) {
    it(`${label}: every compute pass binds at most ${MAX_STORAGE_BUFFERS_PER_STAGE} storage buffers`, () => {
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
});
