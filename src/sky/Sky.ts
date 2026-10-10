import * as THREE from 'three/webgpu';
import { PI, abs, asin, atan, cameraPosition, clamp, dot, exp, float, fract, max, mix, normalize, pow, select, sqrt, storage, texture, uniform, vec2, vec3, vec4 } from 'three/tsl';
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
  /** The weather's haze (spec 2026-09-30 §4.7): sea-level extinction (per m) beyond the clear air's, and its depth (m). */
  readonly fogSigma0 = uniform(0);
  readonly fogTopM = uniform(1500);
  /** Falling rain's extinction (per m) at world xz, from the clouds' rain field (weather/Clouds attaches it). */
  private rainExtinctionAt: ((xz: N) => N) | null = null;
  /** 1 while the weather has rain: the rain along a view path is only sampled then. */
  readonly rainOn = uniform(0);
  /** A lightning flash (weather/LightningView): toward where it lights the cloud, its glow's radiance (RGB), its angular
   * spread (1 − cos of its radius), and the lift it gives the sky light. All zero between flashes. */
  readonly flashDir = uniform(new THREE.Vector3(0, 1, 0));
  readonly flashRadiance = uniform(new THREE.Vector3());
  readonly flashSpread = uniform(0.01);
  readonly flashIrradiance = uniform(new THREE.Vector3());
  readonly dome: THREE.Mesh;
  /** [0].x: the sun's transmittance through the clouds from the camera (the sun disk, the exposure meter); .y: the rain
   * rate falling at the camera. */
  readonly cloudSunAttr = new THREE.StorageBufferAttribute(new Float32Array([1, 0, 0, 1]), 4);
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

  /** Sky irradiance on a horizontal surface, through the clouds, plus a lightning flash's lift (RGB node). */
  get skyIrradiance(): N {
    return this.luts.skyLightRead.element(0).xyz.add(this.flashIrradiance);
  }

  /**
   * The light haze and rain scatter from the sky around them (RGB radiance node): the cloudy sky light, so the rain
   * haze over the land and the rain curtains in the sky read as one (W2 review I3).
   */
  get hazeLight(): N {
    return this.skyIrradiance.div(PI).mul(0.9);
  }

  /** The clear sky's irradiance, above the clouds (RGB node): what lights the clouds themselves. */
  get clearSkyIrradiance(): N {
    return this.luts.skyLightRead.element(2).xyz;
  }

  /** The weather's haze: extra sea-level extinction (per m, weather/fog.fogExtinctionPerM) and how deep it lies (m). */
  setFog(sigma0: number, topM: number): void {
    this.fogSigma0.value = sigma0;
    this.fogTopM.value = topM;
  }

  /** The haze's optical depth from the camera along a ray rising dirY per metre, over distanceM (fog.fogOpticalDepth). */
  /** The rain field (per-m extinction at world xz). Attach before any material is built (Clouds' constructor does). */
  attachRain(extinctionAt: (xz: N) => N): void {
    this.rainExtinctionAt = extinctionAt;
  }

  /**
   * The falling rain's optical depth along a view path from the eye (four samples of the rain field): rain over the
   * dunes greys them from the lineup even when none falls where you float. The sky's own rain is its shafts.
   */
  rainDepth(distanceM: N, rayDir: N): N {
    const at = this.rainExtinctionAt;
    if (!at) return float(0.0);
    const n = 4;
    let sum: N = float(0.0);
    for (let k = 0; k < n; k++) sum = sum.add(at(cameraPosition.xz.add(rayDir.xz.mul(distanceM.mul((k + 0.5) / n)))));
    return select(this.rainOn.greaterThan(0.5), sum.mul(distanceM.div(n)), float(0.0));
  }

  fogDepth(dirY: N, distanceM: N): N {
    const H = this.fogTopM.div(3.0);
    const camH = this.luts.cameraHeightKm.mul(1000.0);
    const base = this.fogSigma0.mul(exp(camH.div(H).negate()));
    // Clamped so a long ray down toward the sea can't overflow exp; the series keeps a level ray exact in float32.
    const x = max(dirY.mul(distanceM).div(H), -60.0);
    const shape = select(abs(x).lessThan(1e-4), float(1.0).sub(x.mul(0.5)), float(1.0).sub(exp(x.negate())).div(x));
    return base.mul(distanceM).mul(shape);
  }

  /**
   * The light the haze itself scatters toward the eye along dir: the (cloudy) sky's light, and the sun through the
   * clouds and the haze above, strongly forward (the glow around a sun in mist).
   */
  fogRadiance(dir: N): N {
    const cosT = dot(dir, this.sunDirection);
    const g = 0.6;
    const phase = float((1 - g * g) / (4 * Math.PI)).div(pow(max(float(1 + g * g).sub(cosT.mul(2 * g)), 1e-4), 1.5));
    const sunThrough = this.cloudSunTransmittance.mul(exp(this.fogDepth(max(this.sunDirection.y, 0.0), float(1e6)).negate()));
    return this.hazeLight.add(this.sunIlluminance.mul(sunThrough).mul(phase));
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
    // A lightning flash lights the cloud from inside around the strike (only where there is cloud to light).
    const flash = this.flashRadiance.mul(clouds.a).mul(exp(float(1.0).sub(dot(dir, this.flashDir)).div(this.flashSpread).negate()));
    const sky = this.atmosphereRadiance(dir).mul(float(1.0).sub(clouds.a)).add(clouds.rgb).add(flash);
    // The haze between the eye and the sky (none when the weather adds none: mix(fog, sky, 1) is exactly the sky).
    return mix(this.fogRadiance(dir), sky, exp(this.fogDepth(max(dir.y, 0.0), float(1e5)).negate()));
  }

  /** The sun's transmittance through the clouds from the camera (node). */
  get cloudSunTransmittance(): N {
    return this.cloudSun.element(0).x;
  }

  /**
   * The whitewater's mist slab (whitewater §6.1; mistSlab.MistSlab.apply), when the App has one: the near-water materials
   * (the sheet, the ribbon, the rider and board, the spray, the Bombie) fog their lit colour at their world position
   * through it before the aerial perspective. Set before any of them is built.
   */
  mist: ((colour: N, worldPos: N, sunVisibility?: N) => N) | null = null;

  /** Near-sea-level aerial perspective along a ray from the camera. */
  applyAerialPerspective(color: N, distanceM: N, rayDir: N): N {
    const transmittance = exp(this.seaLevelExtinction.mul(distanceM.mul(0.001).mul(this.aerialScale)).negate());
    const horizonDir = normalize(vec3(rayDir.x, max(rayDir.y, 0.02), rayDir.z));
    const aerial = color.mul(transmittance).add(this.radiance(horizonDir).mul(vec3(1.0).sub(transmittance)));
    return mix(this.fogRadiance(rayDir), aerial, exp(this.fogDepth(rayDir.y, distanceM).add(this.rainDepth(distanceM, rayDir)).negate()));
  }

  followCamera(position: THREE.Vector3): void {
    this.dome.position.copy(position);
  }
}
