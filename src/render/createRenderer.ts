import * as THREE from 'three/webgpu';
import { viewportSize } from '../app/clock';

export async function createRenderer(container: HTMLElement): Promise<THREE.WebGPURenderer> {
  const options = {
    antialias: false,
    powerPreference: 'high-performance',
    trackTimestamp: true,
    reversedDepthBuffer: true,
  };
  // three typings gap: backend options (powerPreference, trackTimestamp, reversedDepthBuffer) are not all typed.
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
