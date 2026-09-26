import * as THREE from 'three/webgpu';
import { asin, atan, clamp, exp, max, normalize, texture, uniform, vec3 } from 'three/tsl';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, extinctionPerKm } from './atmosphereParams';
import { type AtmosphereUniforms, createAtmosphereUniforms, nightFloorRadiance, skyViewUvFromAngles, updateAtmosphereUniforms } from './atmosphereNodes';
import { AtmosphereLuts } from './AtmosphereLuts';
import { createSkyDome } from './SkyDome';

type N = any;

export const SUN_ANGULAR_RADIUS_RAD = 0.00465;
const MIN_SUN_CHANGE_RAD = (0.25 * Math.PI) / 180;

export class Sky {
  readonly uniforms: AtmosphereUniforms;
  readonly luts: AtmosphereLuts;
  readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  /** atan2(sun.z, sun.x) in world XZ: rotates world azimuths into the sky-view LUT frame. */
  readonly sunAzimuthAngle = uniform(0);
  /** Sea-level extinction per km (RGB), for aerial perspective. */
  readonly seaLevelExtinction = uniform(new THREE.Vector3());
  readonly aerialScale = uniform(1);
  readonly dome: THREE.Mesh;
  private params: AtmosphereParams;
  private readonly lastSun = new THREE.Vector3(0, -2, 0);
  private staticDirty = true;
  private dynamicDirty = true;

  constructor(params: AtmosphereParams = DEFAULT_ATMOSPHERE) {
    this.params = { ...params };
    this.uniforms = createAtmosphereUniforms(this.params);
    this.luts = new AtmosphereLuts(this.uniforms);
    this.seaLevelExtinction.value.set(...extinctionPerKm(0, this.params));
    this.dome = createSkyDome(this);
  }

  /** Sun illuminance reaching the surface (RGB node). */
  get sunIlluminance(): N {
    return this.luts.skyLightRead.element(1).xyz;
  }

  /** Sky irradiance on a horizontal surface (RGB node). */
  get skyIrradiance(): N {
    return this.luts.skyLightRead.element(0).xyz;
  }

  setParams(p: AtmosphereParams): void {
    this.params = { ...p };
    updateAtmosphereUniforms(this.uniforms, this.params);
    this.seaLevelExtinction.value.set(...extinctionPerKm(0, this.params));
    this.staticDirty = true;
  }

  update(renderer: THREE.WebGPURenderer, sunDir: THREE.Vector3, cameraHeightM: number): void {
    this.luts.cameraHeightKm.value = Math.max(cameraHeightM, 1) / 1000;
    if (this.lastSun.angleTo(sunDir) > MIN_SUN_CHANGE_RAD) this.dynamicDirty = true;
    if (this.staticDirty) {
      this.luts.renderStatic(renderer);
      this.staticDirty = false;
      this.dynamicDirty = true;
    }
    if (this.dynamicDirty) {
      this.sunDirection.value.copy(sunDir);
      this.luts.sunElevation.value = Math.asin(Math.max(-1, Math.min(1, sunDir.y)));
      this.sunAzimuthAngle.value = Math.atan2(sunDir.z, sunDir.x);
      this.luts.renderDynamic(renderer);
      this.lastSun.copy(sunDir);
      this.dynamicDirty = false;
    }
  }

  /** Sky radiance along a world-space direction (node). */
  radiance(dir: N): N {
    const elevation = asin(clamp(dir.y, -1.0, 1.0));
    const azimuth = atan(dir.z, dir.x).sub(this.sunAzimuthAngle);
    return texture(this.luts.skyView, skyViewUvFromAngles(elevation, azimuth)).rgb
      .add(nightFloorRadiance(this.uniforms));
  }

  /** Near-sea-level aerial perspective along a ray from the camera. */
  applyAerialPerspective(color: N, distanceM: N, rayDir: N): N {
    const transmittance = exp(this.seaLevelExtinction.mul(distanceM.mul(0.001).mul(this.aerialScale)).negate());
    const horizonDir = normalize(vec3(rayDir.x, max(rayDir.y, 0.02), rayDir.z));
    return color.mul(transmittance).add(this.radiance(horizonDir).mul(vec3(1.0).sub(transmittance)));
  }

  followCamera(position: THREE.Vector3): void {
    this.dome.position.copy(position);
  }
}
