import * as THREE from 'three/webgpu';
import { PI, asin, atan, clamp, exp, float, fract, max, normalize, select, sqrt, storage, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { type AtmosphereParams, DEFAULT_ATMOSPHERE, extinctionPerKm } from './atmosphereParams';
import { type AtmosphereUniforms, createAtmosphereUniforms, nightFloorRadiance, skyViewUvFromAngles, updateAtmosphereUniforms } from './atmosphereNodes';
import { AtmosphereLuts } from './AtmosphereLuts';
import { createSkyDome } from './SkyDome';
import { SKY_MAP, SKY_MAP_SMALL } from '../weather/skyMapLayout';

type N = any;

export const SUN_ANGULAR_RADIUS_RAD = 0.00465;

function skyMapTexture(width: number, height: number): THREE.StorageTexture {
  const t = new THREE.StorageTexture(width, height);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}
const MIN_SUN_CHANGE_RAD = (0.25 * Math.PI) / 180;

export class Sky {
  /**
   * The clouds around the camera (spec 2026-09-30 §4.4), written by weather/Clouds: rgb, their light; a, how much of the
   * atmosphere behind them they hide. A zeroed texture (no clouds yet, or none at all) reads as the clear sky.
   */
  readonly skyMap = skyMapTexture(SKY_MAP.width, SKY_MAP.height);
  /** The 4× smaller copy that reflections and the sky light read. */
  readonly skyMapSmall = skyMapTexture(SKY_MAP_SMALL.width, SKY_MAP_SMALL.height);
  readonly uniforms: AtmosphereUniforms;
  readonly luts: AtmosphereLuts;
  readonly sunDirection = uniform(new THREE.Vector3(0, 1, 0));
  /** atan2(sun.z, sun.x) in world XZ: rotates world azimuths into the sky-view LUT frame. */
  readonly sunAzimuthAngle = uniform(0);
  /** Sea-level extinction per km (RGB), for aerial perspective. */
  readonly seaLevelExtinction = uniform(new THREE.Vector3());
  readonly aerialScale = uniform(1);
  readonly dome: THREE.Mesh;
  /** [0].x: the sun's transmittance through the clouds from the camera (the sun disk, the exposure meter). */
  readonly cloudSunAttr = new THREE.StorageBufferAttribute(new Float32Array([1, 1, 1, 1]), 4);
  readonly cloudSun = storage(this.cloudSunAttr, 'vec4', 1).toReadOnly();
  private params: AtmosphereParams;
  private readonly lastSun = new THREE.Vector3(0, -2, 0);
  private staticDirty = true;
  private dynamicDirty = true;

  constructor(params: AtmosphereParams = DEFAULT_ATMOSPHERE) {
    this.params = { ...params };
    this.uniforms = createAtmosphereUniforms(this.params);
    this.luts = new AtmosphereLuts(this.uniforms, { map: this.skyMapSmall, sunAzimuth: this.sunAzimuthAngle });
    this.seaLevelExtinction.value.set(...extinctionPerKm(0, this.params));
    this.dome = createSkyDome(this);
  }

  /** Sun illuminance reaching the surface (RGB node). */
  get sunIlluminance(): N {
    return this.luts.skyLightRead.element(1).xyz;
  }

  /** Sky irradiance on a horizontal surface, through the clouds (RGB node). */
  get skyIrradiance(): N {
    return this.luts.skyLightRead.element(0).xyz;
  }

  /** The clear sky's irradiance, above the clouds (RGB node): what lights the clouds themselves. */
  get clearSkyIrradiance(): N {
    return this.luts.skyLightRead.element(2).xyz;
  }

  /** Re-integrate the sky light after the clouds changed (the sun did not). */
  refreshSkyLight(renderer: THREE.WebGPURenderer): void {
    this.luts.renderSkyLight(renderer);
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

  /** The clear atmosphere's radiance along a world-space direction (node). */
  atmosphereRadiance(dir: N): N {
    const elevation = asin(clamp(dir.y, -1.0, 1.0));
    const azimuth = atan(dir.z, dir.x).sub(this.sunAzimuthAngle);
    return texture(this.luts.skyView, skyViewUvFromAngles(elevation, azimuth)).rgb
      .add(nightFloorRadiance(this.uniforms));
  }

  /**
   * Sky radiance along a world-space direction (node): the atmosphere behind the clouds, plus their light. `sharp`
   * reads the full sky map (the dome); otherwise the small one (reflections, the sky light), which rough water's
   * many normals would alias on.
   */
  radiance(dir: N, sharp = false): N {
    const elevation = asin(clamp(dir.y, 0.0, 1.0));
    const uv = vec2(fract(atan(dir.z, dir.x).div(PI.mul(2.0))), sqrt(elevation.div(PI.mul(0.5))));
    const c = texture(sharp ? this.skyMap : this.skyMapSmall, uv).level(float(0));
    // Below the horizon no cloud stands between the eye and the (dome's) atmosphere.
    const clouds = select(dir.y.greaterThanEqual(0.0), c, vec4(0.0));
    return this.atmosphereRadiance(dir).mul(float(1.0).sub(clouds.a)).add(clouds.rgb);
  }

  /** The sun's transmittance through the clouds from the camera (node). */
  get cloudSunTransmittance(): N {
    return this.cloudSun.element(0).x;
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
