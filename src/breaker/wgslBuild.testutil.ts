import * as THREE from 'three/webgpu';
import { context } from 'three/tsl';

type N = any;

/**
 * WebGPU checks maxStorageBuffersPerShaderStage only when the device creates the bind group layout, so an over-limit pass
 * builds, compiles offline and then fails at runtime (every dispatch invalid). This builds each of the ribbon's shaders
 * to WGSL with three's own node builder on a minimal stand-in renderer (no device) and counts its storage bindings.
 */
export function stubRenderer(): N {
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
      // WebGPU's default maxUniformBufferBindingSize (instanced meshes size their matrix buffer against it).
      capabilities: { getUniformBufferLimit: () => 65536 },
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


/** A compute node built to WGSL with three's own node builder on stubRenderer (no device). */
export function computeWgsl(node: THREE.ComputeNode): string {
  const b: N = new (THREE as N).WGSLNodeBuilder(null, stubRenderer());
  b.compute = node;
  b.build();
  return b.computeShader;
}
