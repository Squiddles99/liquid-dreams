import * as THREE from 'three/webgpu';
import { SimClock, clampFrameDt, viewportSize } from './clock';

export class App {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly clock = new SimClock();
  private lastMs = performance.now();

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60000);
    this.scene.background = new THREE.Color(0x0b2a4a);
    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  private onResize = (): void => {
    const { width, height } = viewportSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private frame = (): void => {
    const now = performance.now();
    const realDt = clampFrameDt((now - this.lastMs) / 1000);
    this.lastMs = now;
    this.clock.tick(realDt);
    this.renderer.render(this.scene, this.camera);
  };
}
