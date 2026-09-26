import * as THREE from 'three/webgpu';
import { sunForConditions } from '../astro/sunForConditions';
import { CameraRig } from '../camera/CameraRig';
import { Input } from '../camera/Input';
import { cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import { type Moment, momentFromHash } from '../dev/momentLink';
import { HeightProbe } from '../ocean/HeightProbe';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { OceanSurface } from '../ocean/OceanSurface';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
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
  readonly ocean = new OceanSimulation();
  readonly probe = new HeightProbe(this.ocean);
  readonly waterOptics = createWaterOpticsUniforms(DEFAULT_WATER_OPTICS);
  readonly oceanSurface: OceanSurface;
  conditions: Conditions;
  private lastMs = performance.now();
  private readonly sunDir = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    private readonly container: HTMLElement,
    initial: Moment,
  ) {
    this.input = new Input(renderer.domElement);
    this.scene.add(this.sky.dome);
    this.oceanSurface = new OceanSurface(this.ocean, this.sky, this.waterOptics);
    this.scene.add(this.oceanSurface.mesh);
    this.picture = new PicturePipeline(renderer, this.scene, this.camera);
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
    this.ocean.setConditions(this.conditions);
    this.clock.setTime(m.simTime);
    this.clock.paused = m.paused;
    this.rig.setPose(m.camera, this.waterHeightAtCamera());
  }

  currentMoment(): Moment {
    return { conditions: cloneConditions(this.conditions), camera: this.rig.getPose(), simTime: this.clock.simTime, paused: this.clock.paused };
  }

  /** Latest GPU-sampled water height under the lineup camera (holds while a readback is in flight). */
  protected waterHeightAtCamera(): number {
    return this.probe.heightAt(0) ?? 0;
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
    const simDt = this.clock.tick(realDt);
    this.rig.update(realDt, this.input, this.waterHeightAtCamera());
    const sun = sunForConditions(this.conditions);
    this.sunDir.set(...sun.direction);
    this.sky.update(this.renderer, this.sunDir, this.camera.position.y);
    this.sky.followCamera(this.camera.position);
    this.ocean.update(this.renderer, this.clock.simTime, simDt);
    const probeXZ = this.rig.probeXZ;
    this.probe.setProbe(0, probeXZ.x, probeXZ.z);
    this.probe.update(this.renderer);
    this.oceanSurface.update(this.camera.position, this.ocean);
    this.picture.setSunElevation(sun.elevationDeg);
    this.picture.render();
  };
}
