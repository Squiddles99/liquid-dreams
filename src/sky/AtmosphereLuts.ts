import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, PI, cos, dot, exp, float, fract, instanceIndex, length, max, min, normalize, saturate, select, sin,
  smoothstep, sqrt, storage, texture, textureStore, uint, uniform, uvec2, vec2, vec3, vec4,
} from 'three/tsl';
import {
  type AtmosphereUniforms, anglesFromSkyViewUv, medium, miePhase, multiScatteringUv, nightFloorRadiance, raySphere, rayleighPhase,
  rMuFromTransmittanceUv, skyViewUvFromAngles, transmittanceUvFromRMu,
} from './atmosphereNodes';
import { MULTI_SCATTERING_LUT, SKY_VIEW_LUT, TRANSMITTANCE_LUT } from './lutMapping';

type N = any;
// three typings gap: LoopNode reads a `name` for the loop variable at runtime, but @types/three omits it,
// so Loop range objects below are cast `as N`.

const TRANSMITTANCE_STEPS = 40;
const MS_DIRECTIONS_SQRT = 8;
const MS_STEPS = 20;
const SKY_VIEW_STEPS = 32;
const IRRADIANCE_ELEVATION_SAMPLES = 16;
const IRRADIANCE_AZIMUTH_SAMPLES = 32;

/** What the sky-light integration needs to see the clouds: the small sky map and the sun's world azimuth. */
export interface SkyLightClouds {
  map: THREE.Texture;
  /** atan2(sun.z, sun.x): the sky-view LUT's azimuths are measured from it, the sky map's from world +x. */
  sunAzimuth: N;
}

function lutTexture(width: number, height: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping): THREE.StorageTexture {
  const t = new THREE.StorageTexture(width, height);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = wrapS;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

export class AtmosphereLuts {
  readonly transmittance = lutTexture(TRANSMITTANCE_LUT.width, TRANSMITTANCE_LUT.height);
  readonly multiScattering = lutTexture(MULTI_SCATTERING_LUT.width, MULTI_SCATTERING_LUT.height);
  readonly skyView = lutTexture(SKY_VIEW_LUT.width, SKY_VIEW_LUT.height, THREE.RepeatWrapping);
  /**
   * [0] = sky irradiance on a horizontal surface, through the clouds; [1] = sun illuminance at the surface (above the
   * clouds: their shadow is the sunlight map's); [2] = the clear sky's irradiance (what lights the clouds). RGB in .xyz.
   */
  readonly skyLightAttr = new THREE.StorageBufferAttribute(new Float32Array(12), 4);
  readonly skyLightRead = storage(this.skyLightAttr, 'vec4', 3).toReadOnly();
  /** Sun elevation in radians. The sky-view LUT is built in a frame where the sun has azimuth 0. */
  readonly sunElevation = uniform(0.3);
  readonly cameraHeightKm = uniform(0.002);
  private readonly staticPasses: THREE.ComputeNode[];
  private readonly dynamicPasses: THREE.ComputeNode[];
  private readonly skyLightPass: THREE.ComputeNode;

  constructor(private readonly u: AtmosphereUniforms, private readonly clouds?: SkyLightClouds) {
    this.staticPasses = [this.buildTransmittancePass(), this.buildMultiScatteringPass()];
    this.skyLightPass = this.buildSkyLightPass();
    this.dynamicPasses = [this.buildSkyViewPass(), this.skyLightPass];
  }

  /** Its compute passes, for App.prewarm to build while the game loads (built on the first frame, they froze it). */
  get computePasses(): THREE.ComputeNode[] {
    return [...this.staticPasses, ...this.dynamicPasses];
  }

  /** Re-integrate the sky light alone (the clouds changed, the sun did not). */
  renderSkyLight(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.skyLightPass);
  }

  renderStatic(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.staticPasses);
  }

  renderDynamic(renderer: THREE.WebGPURenderer): void {
    renderer.compute(this.dynamicPasses);
  }

  transmittanceAt(r: N, mu: N): N {
    return texture(this.transmittance, transmittanceUvFromRMu(this.u, r, mu)).level(float(0)).rgb;
  }

  multiScatteringAt(r: N, muS: N): N {
    return texture(this.multiScattering, multiScatteringUv(this.u, r, muS)).level(float(0)).rgb;
  }

  private buildTransmittancePass(): THREE.ComputeNode {
    const { width, height } = TRANSMITTANCE_LUT;
    const u = this.u;
    const med = medium(u);
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const rMu = rMuFromTransmittanceUv(u, uv);
      const ro = vec3(0.0, rMu.x, 0.0);
      const rd = vec3(sqrt(max(float(1.0).sub(rMu.y.mul(rMu.y)), 0.0)), rMu.y, 0.0);
      const dt = max(raySphere(ro, rd, u.topRadius), 0.0).div(TRANSMITTANCE_STEPS);
      const depth = vec3(0.0).toVar();
      Loop({ start: 0, end: TRANSMITTANCE_STEPS, name: 'i' } as N, ({ i }: N) => {
        const h = length(ro.add(rd.mul(float(i).add(0.5).mul(dt)))).sub(u.groundRadius);
        depth.addAssign(med.extinction(h).mul(dt));
      });
      textureStore(this.transmittance, uvec2(x, y), vec4(exp(depth.negate()), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildMultiScatteringPass(): THREE.ComputeNode {
    const { width, height } = MULTI_SCATTERING_LUT;
    const u = this.u;
    const med = medium(u);
    const dirCount = MS_DIRECTIONS_SQRT * MS_DIRECTIONS_SQRT;
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const muS = uv.x.mul(2.0).sub(1.0);
      const r = u.groundRadius.add(uv.y.mul(u.topRadius.sub(u.groundRadius)));
      const ro = vec3(0.0, r, 0.0);
      const sunDir = vec3(0.0, muS, sqrt(max(float(1.0).sub(muS.mul(muS)), 0.0)));
      const lumTotal = vec3(0.0).toVar();
      const fmsTotal = vec3(0.0).toVar();
      Loop({ start: 0, end: MS_DIRECTIONS_SQRT, name: 'i' } as N, { start: 0, end: MS_DIRECTIONS_SQRT, name: 'j' } as N, ({ i, j }: N) => {
        const cosTheta = float(1.0).sub(float(i).add(0.5).mul(2.0 / MS_DIRECTIONS_SQRT));
        const sinTheta = sqrt(max(float(1.0).sub(cosTheta.mul(cosTheta)), 0.0));
        const phi = float(j).add(0.5).mul((2.0 * Math.PI) / MS_DIRECTIONS_SQRT);
        const rd = vec3(sinTheta.mul(cos(phi)), cosTheta, sinTheta.mul(sin(phi)));
        const tGround = raySphere(ro, rd, u.groundRadius);
        const hitsGround = tGround.greaterThan(0.0);
        const tMax = select(hitsGround, tGround, max(raySphere(ro, rd, u.topRadius), 0.0));
        const dt = tMax.div(MS_STEPS);
        const throughput = vec3(1.0).toVar();
        const lum = vec3(0.0).toVar();
        const fms = vec3(0.0).toVar();
        Loop({ start: 0, end: MS_STEPS, name: 's' } as N, ({ s }: N) => {
          const p = ro.add(rd.mul(float(s).add(0.5).mul(dt)));
          const pr = length(p);
          const h = pr.sub(u.groundRadius);
          const muSun = dot(p.div(pr), sunDir);
          const shadow = select(raySphere(p, sunDir, u.groundRadius).greaterThan(0.0), float(0.0), float(1.0));
          const scattering = med.rayleigh(h).add(med.mie(h));
          const extinction = max(med.extinction(h), vec3(1e-6));
          const sampleT = exp(extinction.negate().mul(dt));
          const sIso = scattering.mul(this.transmittanceAt(pr, muSun)).mul(shadow).mul(1.0 / (4.0 * Math.PI));
          lum.addAssign(throughput.mul(sIso.sub(sIso.mul(sampleT)).div(extinction)));
          fms.addAssign(throughput.mul(scattering.sub(scattering.mul(sampleT)).div(extinction)));
          throughput.mulAssign(sampleT);
        });
        If(hitsGround, () => {
          const pg = ro.add(rd.mul(tGround));
          const n = normalize(pg);
          const sunAtGround = this.transmittanceAt(length(pg), dot(n, sunDir));
          lum.addAssign(throughput.mul(sunAtGround).mul(saturate(dot(n, sunDir))).mul(u.groundAlbedo).div(PI));
        });
        lumTotal.addAssign(lum);
        fmsTotal.addAssign(fms);
      });
      const l2 = lumTotal.div(dirCount);
      const fmsAvg = min(fmsTotal.div(dirCount), vec3(0.99));
      textureStore(this.multiScattering, uvec2(x, y), vec4(l2.div(vec3(1.0).sub(fmsAvg)), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildSkyViewPass(): THREE.ComputeNode {
    const { width, height } = SKY_VIEW_LUT;
    const u = this.u;
    const med = medium(u);
    return Fn(() => {
      const x = instanceIndex.mod(uint(width));
      const y = instanceIndex.div(uint(width));
      const uv = vec2(float(x).add(0.5).div(width), float(y).add(0.5).div(height));
      const angles = anglesFromSkyViewUv(uv);
      const rd = vec3(cos(angles.x).mul(cos(angles.y)), sin(angles.x), cos(angles.x).mul(sin(angles.y)));
      const sunDir = vec3(cos(this.sunElevation), sin(this.sunElevation), 0.0);
      const ro = vec3(0.0, u.groundRadius.add(this.cameraHeightKm), 0.0);
      const tGround = raySphere(ro, rd, u.groundRadius);
      const tMax = select(tGround.greaterThan(0.0), tGround, max(raySphere(ro, rd, u.topRadius), 0.0));
      const dt = tMax.div(SKY_VIEW_STEPS);
      const cosT = dot(rd, sunDir);
      const phR = rayleighPhase(cosT);
      const phM = miePhase(cosT, u.mieG);
      const throughput = vec3(1.0).toVar();
      const lum = vec3(0.0).toVar();
      Loop({ start: 0, end: SKY_VIEW_STEPS, name: 's' } as N, ({ s }: N) => {
        const p = ro.add(rd.mul(float(s).add(0.5).mul(dt)));
        const pr = length(p);
        const h = pr.sub(u.groundRadius);
        const muSun = dot(p.div(pr), sunDir);
        const shadow = select(raySphere(p, sunDir, u.groundRadius).greaterThan(0.0), float(0.0), float(1.0));
        const rayleigh = med.rayleigh(h);
        const mie = med.mie(h);
        const extinction = max(med.extinction(h), vec3(1e-6));
        const sampleT = exp(extinction.negate().mul(dt));
        const single = rayleigh.mul(phR).add(mie.mul(phM)).mul(this.transmittanceAt(pr, muSun)).mul(shadow);
        const multi = rayleigh.add(mie).mul(this.multiScatteringAt(pr, muSun));
        const S = single.add(multi);
        lum.addAssign(throughput.mul(S.sub(S.mul(sampleT)).div(extinction)));
        throughput.mulAssign(sampleT);
      });
      textureStore(this.skyView, uvec2(x, y), vec4(lum.mul(u.sunIlluminance), 1.0));
    })().compute(width * height) as THREE.ComputeNode;
  }

  private buildSkyLightPass(): THREE.ComputeNode {
    const u = this.u;
    const skyLight = storage(this.skyLightAttr, 'vec4', 3);
    const clouds = this.clouds;
    const dEl = Math.PI / 2 / IRRADIANCE_ELEVATION_SAMPLES;
    const dAz = (2 * Math.PI) / IRRADIANCE_AZIMUTH_SAMPLES;
    return Fn(() => {
      const irradiance = vec3(0.0).toVar();
      const clearIrradiance = vec3(0.0).toVar();
      Loop({ start: 0, end: IRRADIANCE_ELEVATION_SAMPLES, name: 'i' } as N, { start: 0, end: IRRADIANCE_AZIMUTH_SAMPLES, name: 'j' } as N, ({ i, j }: N) => {
        const e = float(i).add(0.5).mul(dEl);
        const a = float(j).add(0.5).mul(dAz);
        const radiance = texture(this.skyView, skyViewUvFromAngles(e, a)).level(float(0)).rgb;
        const w = sin(e).mul(cos(e)).mul(dEl * dAz);
        clearIrradiance.addAssign(radiance.mul(w));
        if (clouds) {
          // The clouds in front of this part of the sky (Sky.radiance's composite): what the sea and land actually see.
          const uv = vec2(fract(a.add(clouds.sunAzimuth).div(2 * Math.PI)), sqrt(e.div(Math.PI / 2)));
          const c = texture(clouds.map, uv).level(float(0));
          irradiance.addAssign(radiance.mul(float(1.0).sub(c.a)).add(c.rgb).mul(w));
        } else {
          irradiance.addAssign(radiance.mul(w));
        }
      });
      // The faint night floor, outside the loop as it always was (so a clear sky's light is exactly unchanged).
      irradiance.addAssign(nightFloorRadiance(u).mul(PI));
      clearIrradiance.addAssign(nightFloorRadiance(u).mul(PI));
      const muSun = sin(this.sunElevation);
      const visible = smoothstep(-0.0093, 0.0093, muSun); // sun disk crossing the horizon (±0.53°)
      const sun = this.transmittanceAt(u.groundRadius.add(this.cameraHeightKm), muSun).mul(u.sunIlluminance).mul(visible);
      skyLight.element(0).assign(vec4(irradiance, 1.0));
      skyLight.element(1).assign(vec4(sun, 1.0));
      skyLight.element(2).assign(vec4(clearIrradiance, 1.0));
    })().compute(1, [1]) as THREE.ComputeNode;
  }
}
