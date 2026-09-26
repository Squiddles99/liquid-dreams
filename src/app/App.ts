import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import { type Moment, momentFromHash } from '../dev/momentLink';
import { PicturePipeline } from '../render/PicturePipeline';
import { Sky } from '../sky/Sky';
import { SimClock, clampFrameDt, viewportSize } from './clock';

export class App {
  readonly scene = new THREE.Scene();
  readonly clock = new SimClock();
  readonly rig = new CameraRig();
  readonly input: Input;
  readonly sky = new Sky();
  readonly picture: PicturePipeline;
  conditions: Conditions;
  private lastMs = performance.now();
  private readonly sunDir = new THREE.Vector3();
  /** Temporary visual reference until the ocean exists (removed in Task 12). */
  private readonly devGrid = new THREE.GridHelper(200, 40, 0x88aacc, 0x335577);

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    initial: Moment,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera);
    this.scene.add(this.devGrid);
    this.conditions = cloneConditions(initial.conditions);
    this.applyMoment(initial);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('hashchange', this.onHashChange);
    this.onResize();
  }

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  start(): void {
    this.renderer.setAnimationLoop(this.frame);
  }

  applyMoment(m: Moment): void {
    this.conditions = cloneConditions(m.conditions);
    this.clock.setTime(m.simTime);
    this.clock.paused = m.paused;
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Replaced by the GPU height probe in Task 14. */
  protected waterHeightAtCamera(): number {
    return 0;
  }

  private onHashChange = (): void => {
    const m = momentFromHash(location.hash);
    if (m) this.applyMoment(m);
  };

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
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());
    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);
    this.picture.setSunElevation(sun.elevationDeg);
    this.picture.render();
  };
}
