import * as THREE from 'three/webgpu';
import { agxToneMapping, dot, float, max, mix, pass, pow, renderOutput, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { computeExposure } from './exposure';

type N = any;

export interface PictureParams {
  autoExposure: boolean;
  baseExposure: number;
  evOffset: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  lift: number;
  gamma: number;
  gain: number;
  saturation: number;
}

export const DEFAULT_PICTURE: PictureParams = {
  autoExposure: true,
  baseExposure: 0.35,
  evOffset: 0,
  bloomStrength: 0.12,
  bloomRadius: 0.35,
  bloomThreshold: 1.0,
  lift: 0,
  gamma: 1,
  gain: 1,
  saturation: 1.05,
};

/** HDR scene → exposure → bloom → AgX → lift/gamma/gain/saturation → sRGB. */
export class PicturePipeline {
  params: PictureParams;
  private readonly pipeline: THREE.RenderPipeline;
  private readonly exposure = uniform(1);
  private readonly lift = uniform(0);
  private readonly gamma = uniform(1);
  private readonly gain = uniform(1);
  private readonly saturation = uniform(1);
  // three typings gap: BloomNode's uniform members are not typed.
  private readonly bloomNode: any;
  private sunElevationDeg = 45;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, params: PictureParams = DEFAULT_PICTURE) {
    this.params = { ...params };
    const scenePass = pass(scene, camera);
    const exposed = scenePass.getTextureNode('output').rgb.mul(this.exposure);
    this.bloomNode = bloom(vec4(exposed, 1.0), params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    const mapped: N = agxToneMapping(exposed.add(this.bloomNode.rgb), float(1.0));
    const lifted = mapped.add(this.lift.mul(vec3(1.0).sub(mapped))).mul(this.gain);
    const gammaed = pow(max(lifted, vec3(0.0)), vec3(float(1.0).div(this.gamma)));
    const luma = dot(gammaed, vec3(0.2126, 0.7152, 0.0722));
    const graded = mix(vec3(luma), gammaed, this.saturation);
    this.pipeline = new THREE.RenderPipeline(renderer, renderOutput(vec4(graded, 1.0), THREE.NoToneMapping, THREE.SRGBColorSpace));
    this.pipeline.outputColorTransform = false;
    this.setParams(this.params);
  }

  setParams(p: PictureParams): void {
    this.params = { ...p };
    this.bloomNode.strength.value = p.bloomStrength;
    this.bloomNode.radius.value = p.bloomRadius;
    this.bloomNode.threshold.value = p.bloomThreshold;
    this.lift.value = p.lift;
    this.gamma.value = Math.max(0.1, p.gamma);
    this.gain.value = p.gain;
    this.saturation.value = p.saturation;
    this.updateExposure();
  }

  setSunElevation(elevationDeg: number): void {
    this.sunElevationDeg = elevationDeg;
    this.updateExposure();
  }

  render(): void {
    this.pipeline.render();
  }

  private updateExposure(): void {
    this.exposure.value = computeExposure(this.sunElevationDeg, this.params.baseExposure, this.params.evOffset, this.params.autoExposure);
  }
}
