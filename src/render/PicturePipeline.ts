import * as THREE from 'three/webgpu';
import { agxToneMapping, dot, float, max, min, mix, neutralToneMapping, pass, pow, renderOutput, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { computeExposure } from './exposure';

type N = any;

/** Ceiling on exposed scene radiance: finite in half float (max 65504) so bloom and tone mapping never see Infinity. */
export const HDR_MAX = 60000.0;

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
  /** AgX's filmic look instead of Khronos PBR Neutral (kept for comparison: AgX greys a clear sky). */
  agx: boolean;
}

export const DEFAULT_PICTURE: PictureParams = {
  autoExposure: true,
  baseExposure: 0.5,
  evOffset: 0,
  bloomStrength: 0.04,
  bloomRadius: 0.35,
  bloomThreshold: 1.0,
  lift: 0,
  gamma: 1,
  gain: 1,
  saturation: 1.0,
  agx: false,
};

/**
 * HDR scene → exposure → bloom → tone map → lift/gamma/gain/saturation → sRGB.
 * Khronos PBR Neutral keeps mid-tone hue and saturation (a clear sky stays blue) and only compresses highlights.
 */
export class PicturePipeline {
  params: PictureParams;
  private readonly pipeline: THREE.RenderPipeline;
  private readonly exposure = uniform(1);
  private readonly lift = uniform(0);
  private readonly gamma = uniform(1);
  private readonly gain = uniform(1);
  private readonly saturation = uniform(1);
  private readonly agxWeight = uniform(0);
  // three typings gap: BloomNode's uniform members are not typed.
  private readonly bloomNode: any;
  private sunElevationDeg = 45;
  private forwardDotSun = -1;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, params: PictureParams = DEFAULT_PICTURE) {
    this.params = { ...params };
    const scenePass = pass(scene, camera);
    // Clamped below the half-float maximum (65504): the scene is finite, but exposure > ~2 could push the sun
    // disk past it, overflowing bloom's HalfFloat targets, and PBR Neutral turns Infinity into NaN.
    const exposed = min(scenePass.getTextureNode('output').rgb.mul(this.exposure), vec3(HDR_MAX));
    this.bloomNode = bloom(vec4(exposed, 1.0), params.bloomStrength, params.bloomRadius, params.bloomThreshold);
    const hdr: N = exposed.add(this.bloomNode.rgb);
    // three typings gap: the tone-mapping Fns return an untyped Node, which mix() rejects.
    const neutral: N = neutralToneMapping(hdr, float(1.0));
    const agx: N = agxToneMapping(hdr, float(1.0));
    const mapped: N = mix(neutral, agx, this.agxWeight);
    const lifted = mapped.add(this.lift.mul(vec3(1.0).sub(mapped))).mul(this.gain);
    const gammaed = pow(max(lifted, vec3(0.0)), vec3(float(1.0).div(this.gamma)));
    const luma = dot(gammaed, vec3(0.2126, 0.7152, 0.0722));
    // Saturation > 1 extrapolates away from grey and can push a channel negative, which the sRGB OETF's pow turns into NaN.
    const graded = max(mix(vec3(luma), gammaed, this.saturation), vec3(0.0));
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
    this.agxWeight.value = p.agx ? 1 : 0;
    this.updateExposure();
  }

  /** Sun elevation and the cosine between the camera's view direction and the sun, for auto-exposure. */
  setSun(elevationDeg: number, forwardDotSun: number): void {
    this.sunElevationDeg = elevationDeg;
    this.forwardDotSun = forwardDotSun;
    this.updateExposure();
  }

  render(): void {
    this.pipeline.render();
  }

  private updateExposure(): void {
    this.exposure.value = computeExposure(
      this.sunElevationDeg, this.params.baseExposure, this.params.evOffset, this.params.autoExposure, this.forwardDotSun,
    );
  }
}
