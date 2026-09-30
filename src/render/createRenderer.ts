import * as THREE from 'three/webgpu';
import { viewportSize } from '../app/clock';

/** The most sampled textures (and samplers) a shader stage may ask for, when the adapter allows it. */
const WANTED_TEXTURES_PER_STAGE = 48;

/**
 * The limits to ask the device for: the water's fragment shader samples 17 textures once the clouds' shadow joins in,
 * one over WebGPU's default 16. Ask for what the adapter offers (the RTX 4060 offers 48), never more.
 */
async function requiredLimits(): Promise<Record<string, number>> {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return {};
  const l = adapter.limits;
  return {
    maxSampledTexturesPerShaderStage: Math.min(l.maxSampledTexturesPerShaderStage, WANTED_TEXTURES_PER_STAGE),
    maxSamplersPerShaderStage: Math.min(l.maxSamplersPerShaderStage, WANTED_TEXTURES_PER_STAGE),
  };
}

export async function createRenderer(container: HTMLElement): Promise<THREE.WebGPURenderer> {
  const options = {
    antialias: false,
    powerPreference: 'high-performance',
    trackTimestamp: true,
    reversedDepthBuffer: true,
    requiredLimits: await requiredLimits(),
  };
  // three typings gap: backend options (powerPreference, trackTimestamp, reversedDepthBuffer, requiredLimits) are not all typed.
  const renderer = new THREE.WebGPURenderer(options as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
  renderer.setPixelRatio(window.devicePixelRatio);
  const size = viewportSize(container.clientWidth, container.clientHeight);
  renderer.setSize(size.width, size.height);
  container.append(renderer.domElement);
  await renderer.init();
  if ((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true) {
    throw new Error('three.js fell back to WebGL; WebGPU is required.');
  }
  return renderer;
}
