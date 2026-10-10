import * as THREE from 'three/webgpu';
import {
  Fn, If, atan, cameraPosition, cameraViewMatrix, clamp, dot, float, instanceIndex, length, max, mix, mx_noise_float, pow, select, smoothstep,
  storage, uint, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { Sky } from '../sky/Sky';
import type { SunlightSource } from '../land/SunlightMap';
import { FOAM_TICK_S, FoamSchedule, tickIndex, tickTime } from './foamStep';
import {
  DEFAULT_SPRAY_PARAMS, PLUME_LIFE_S, SPRAY_BIRTH_CAP, SPRAY_POOL, type SprayBirth, type SprayParams, normalizeSprayParams, replayTicksForMaxLife,
} from './sprayEmitters';
import { NEAR_FADE_M, SPRAY_PHASE_G, SPRAY_PHASE_ISOTROPIC, SPRAY_SKY_SCALE } from './sprayLook';
import { KIND_INDEX, PARTICLE_KINDS, type ParticleKind, SPRAY_KIND, kindIndexOf } from './particleKinds';
import { NO_WATER, SOFT_FADE_M, birthSeed, slotBase } from './sprayStep';

type N = any;

/** Screen-space stretch along the velocity: 1 + this × |v_view| (m/s), at most MAX_STRETCH. */
const STRETCH_PER_MS = 0.4;
const MAX_STRETCH = 3;

/** sprayLook.sprayPhase in TSL: the forward-peaked HG mixed with an isotropic part (multiple scattering). `isotropic` may
 * be a node (a particle's kind's). */
export function sprayPhaseNode(cosT: N, isotropic: N | number = SPRAY_PHASE_ISOTROPIC): N {
  const g = SPRAY_PHASE_G, g2 = g * g;
  const hg = float((1 - g2) / (4 * Math.PI)).div(pow(max(float(1 + g2).sub(cosT.mul(2 * g)), 1e-4), 1.5));
  const iso = float(isotropic);
  return hg.mul(float(1.0).sub(iso)).add(iso.div(4 * Math.PI));
}

/** A kind's number for a particle: PARTICLE_KINDS[kind] picked by its index (meta.y) through a select chain. */
export function kindValueNode(kind: N, pick: (k: ParticleKind) => number): N {
  let out: N = float(pick(PARTICLE_KINDS[0]));
  for (let i = 1; i < PARTICLE_KINDS.length; i++) out = select(kind.greaterThan(i - 0.5), float(pick(PARTICLE_KINDS[i])), out);
  return out;
}

/** Plume and spit puffs dissolve by an animated noise threshold with age (whitewater §4.1), not a uniform fade. */
export const ERODING_KINDS: readonly number[] = [KIND_INDEX.plume, KIND_INDEX.spit];

/**
 * Offshore spray on the GPU (spec 2026-09-27-offshore-spray-design.md §3.2–3.3; CPU reference sprayStep.ts): a pool of
 * SPRAY_POOL puffs, born into their tick's own slots (plan S2) and stepped at 20 Hz of sim time (birth + step in one
 * submission per tick), drawn as velocity-stretched soft sprites lit by single scattering from the sky's sun and sky.
 */
export class SprayParticles {
  readonly mesh: THREE.Sprite;
  readonly posAgeAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  readonly velLifeAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  readonly metaAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_POOL * 4), 4);
  /** Births: 3 vec4s each, (x, y, z, life) (vx, vy, vz, strength) (kind, yWater, seed, 0). */
  private readonly birthAttr = new THREE.StorageBufferAttribute(new Float32Array(SPRAY_BIRTH_CAP * 12), 4);
  /** This pool's kind (KIND_INDEX): its births' default. */
  private readonly defaultKind: number;
  private readonly birthCount = uniform(0);
  private readonly birthBase = uniform(0);
  private readonly wind = uniform(new THREE.Vector2());
  private readonly sinceTick = uniform(0);
  private readonly tint = uniform(0);
  private readonly inverseExposure = uniform(1);
  private readonly schedule = new FoamSchedule();
  private readonly params: SprayParams = { ...DEFAULT_SPRAY_PARAMS };
  /** The longest life (s) a puff can have: a replay covers it (plan P2). */
  private maxLifeS = Math.max(1.2 * DEFAULT_SPRAY_PARAMS.lifeS, PLUME_LIFE_S[1]);
  private readonly birthPass: THREE.ComputeNode;
  private readonly stepPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;

  constructor(sky: Sky, readonly kind: ParticleKind = SPRAY_KIND, sunlight?: SunlightSource) {
    const posAge = storage(this.posAgeAttr, 'vec4', SPRAY_POOL);
    const velLife = storage(this.velLifeAttr, 'vec4', SPRAY_POOL);
    const meta = storage(this.metaAttr, 'vec4', SPRAY_POOL);
    this.defaultKind = kindIndexOf(kind);
    const births = storage(this.birthAttr, 'vec4', SPRAY_BIRTH_CAP * 3).toReadOnly();
    this.birthPass = Fn(() => {
      const i = instanceIndex;
      If(float(i).lessThan(this.birthCount), () => {
        const slot = uint(this.birthBase).add(i);
        const a = births.element(i.mul(3)), b = births.element(i.mul(3).add(1)), c = births.element(i.mul(3).add(2));
        posAge.element(slot).assign(vec4(a.xyz, 0.0));
        velLife.element(slot).assign(vec4(b.xyz, a.w));
        meta.element(slot).assign(vec4(b.w, c.x, c.y, c.z));
      });
    })().compute(SPRAY_BIRTH_CAP) as THREE.ComputeNode;
    // sprayStep.stepPool, in f32: each slot with its own kind's drag and settling (meta.y).
    this.stepPass = Fn(() => {
      const i = instanceIndex;
      const pa = posAge.element(i).toVar(), vl = velLife.element(i).toVar();
      If(pa.w.lessThan(vl.w), () => {
        const kd = meta.element(i).y;
        const k = kindValueNode(kd, (q) => Math.min(1, FOAM_TICK_S / q.dragTauS)), settle = kindValueNode(kd, (q) => q.gravityMs2 * FOAM_TICK_S);
        const v = vl.xyz.add(vec3(this.wind.x, 0.0, this.wind.y).sub(vl.xyz).mul(k)).sub(vec3(0.0, settle, 0.0)).toVar();
        posAge.element(i).assign(vec4(pa.xyz.add(v.mul(FOAM_TICK_S)), pa.w.add(FOAM_TICK_S)));
        velLife.element(i).assign(vec4(v, vl.w));
      });
    })().compute(SPRAY_POOL) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      const i = instanceIndex;
      posAge.element(i).assign(vec4(0.0));
      velLife.element(i).assign(vec4(0.0));
      meta.element(i).assign(vec4(0.0));
    })().compute(SPRAY_POOL) as THREE.ComputeNode;
    this.mesh = new THREE.Sprite(this.buildMaterial(sky, sunlight));
    this.mesh.count = SPRAY_POOL;
    this.mesh.frustumCulled = false;
  }

  /** The sprite (spec §3.3): stretched along the screen velocity, growing, fading; single scattering; aerial perspective. */
  private buildMaterial(sky: Sky, sunlight?: SunlightSource): THREE.SpriteNodeMaterial {
    const m = new THREE.SpriteNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.NormalBlending;
    const pa: N = storage(this.posAgeAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const vl: N = storage(this.velLifeAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const mt: N = storage(this.metaAttr, 'vec4', SPRAY_POOL).toReadOnly().element(instanceIndex);
    const alive = pa.w.lessThan(vl.w);
    const ageFrac = clamp(pa.w.div(max(vl.w, 1e-3)), 0.0, 1.0);
    const centre = pa.xyz.add(vl.xyz.mul(this.sinceTick));
    m.positionNode = centre;
    const vView = cameraViewMatrix.mul(vec4(vl.xyz, 0.0)).xy;
    const stretch = clamp(length(vView).mul(STRETCH_PER_MS).add(1.0), 1.0, MAX_STRETCH);
    const kd: N = mt.y;
    const size = mix(kindValueNode(kd, (q) => q.sizeM[0]), kindValueNode(kd, (q) => q.sizeM[1]), ageFrac).mul(select(alive, float(1.0), float(0.0)));
    m.scaleNode = vec2(size.mul(stretch), size);
    m.rotationNode = atan(vView.y, vView.x);
    const vAgeFrac: N = varying(ageFrac), vAgeS: N = varying(pa.w), vStrength: N = varying(mt.x);
    const vSeed: N = varying(float(instanceIndex));
    const vOpacity: N = varying(kindValueNode(kd, (q) => q.opacity));
    const vEroding: N = varying(select(kd.greaterThan(0.5).and(kd.lessThan(1.5)).or(kd.greaterThan(2.5)), float(1.0), float(0.0)));
    const vBirthSeed: N = varying(mt.w);
    // Shape: a soft round puff broken by one octave of noise seeded per slot.
    const q = uv().sub(0.5);
    const shape0 = float(1.0).sub(smoothstep(0.3, 1.0, length(q).mul(2.0))).mul(mx_noise_float(vec3(uv().mul(3.0), vSeed.mul(0.137))).mul(0.5).add(0.75));
    // Plume and spit dissolve by a noise threshold rising with age (whitewater §4.1): ragged, not a uniform fade.
    const th = vAgeFrac.mul(0.8);
    const erosion = smoothstep(th, th.add(0.2), mx_noise_float(vec3(uv().mul(2.0), vBirthSeed.mul(17.0))).mul(0.5).add(0.5));
    const shape = shape0.mul(mix(float(1.0), erosion, vEroding));
    const fades = smoothstep(0.0, 0.1, vAgeS).mul(float(1.0).sub(smoothstep(0.6, 1.0, vAgeFrac)));
    // Single scattering: the sun through a forward-peaked phase function, the sky isotropically; then the haze. All of it
    // depends only on the puff's centre, so it runs once per vertex (a varying), not per pixel: per pixel it cost ~5 ms
    // for a close veil (sky LUT reads under heavy overdraw).
    const toP = centre.sub(cameraPosition);
    const dist = length(toP);
    const viewDir = toP.div(max(dist, 1e-3));
    // × the land's shadow at the puff's centre (Phase 4a §4.8).
        const vis = sunlight ? sunlight.visibilityNode(centre.xz) : float(1.0);
        const radiance = sky.sunIlluminance.mul(vis).mul(sprayPhaseNode(dot(viewDir, sky.sunDirection), kindValueNode(kd, (q) => q.isotropic))).add(sky.skyIrradiance.mul(SPRAY_SKY_SCALE));
    // sprayLook.nearCameraFade: puffs within a few metres of the eye fade out.
    const vNear: N = varying(smoothstep(NEAR_FADE_M[0], NEAR_FADE_M[1], dist));
    // The puffs are in the mist too (whitewater §6.1), at their centres.
    const colour: N = varying(sky.applyAerialPerspective(sky.mist ? sky.mist(radiance, centre, vis) : radiance, dist, viewDir));
    // Soft particles without depth (whitewater §6.2): a puff fades in over its first SOFT_FADE_M above the water it was born
    // over (meta.z; NO_WATER: no fade).
    const vSoft: N = varying(smoothstep(0.0, SOFT_FADE_M, centre.y.sub(mt.z)));
    const ageColour = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vAgeFrac).mul(this.inverseExposure.mul(0.5));
    m.colorNode = mix(colour, ageColour, this.tint.mul(0.8));
    m.opacityNode = clamp(shape.mul(fades).mul(vStrength).mul(vNear).mul(vOpacity).mul(vSoft), 0.0, 1.0);
    return m;
  }

  setParams(p: SprayParams): void {
    Object.assign(this.params, p);
    normalizeSprayParams(this.params);
    // The plume shares the spray's pool and lives longest (whitewater §4.1).
    this.maxLifeS = Math.max(1.2 * this.params.lifeS, this.kind === SPRAY_KIND ? PLUME_LIFE_S[1] : 0);
  }

  /** The longest life a puff of this system can have (s): a replay covers it (the explosion's puffs live at most 1.6 s). */
  setMaxLifeS(s: number): void {
    this.maxLifeS = s;
  }

  /** The wind (m/s, world xz) the puffs are dragged toward. */
  setWind(windX: number, windZ: number): void {
    this.wind.value.set(windX, windZ);
  }

  /** The passes, for App.prewarm to build while the game loads: the birth pass first runs when a lip first throws, mid-game. */
  get computePasses(): THREE.ComputeNode[] {
    return [this.birthPass, this.stepPass, this.clearPass];
  }

  /** The next advance() clears the pool and replays the longest life. */
  invalidate(): void {
    this.schedule.invalidate();
  }

  /**
   * Runs this frame's ticks (FoamSchedule.planTicks). For each tick k, `birthsAt(k)` gives its births (App: the emitters
   * at tₖ); birth and step go as one submission. Returns the ticks run. The sprites draw at p + v·(t − tₖ).
   */
  advance(renderer: THREE.WebGPURenderer, simTime: number, birthsAt: (tick: number) => SprayBirth[]): number {
    const plan = this.schedule.planTicks(simTime, replayTicksForMaxLife(this.maxLifeS));
    if (plan.clear) renderer.compute(this.clearPass);
    const data = this.birthAttr.array as Float32Array;
    for (const k of plan.ticks) {
      const births = birthsAt(k).slice(0, SPRAY_BIRTH_CAP);
      births.forEach((b, i) => {
        data.set([b.x, b.y, b.z, b.life, b.vx, b.vy, b.vz, b.strength, b.kind ?? this.defaultKind, b.yWater ?? NO_WATER, birthSeed(k, i), 0], i * 12);
      });
      this.birthAttr.needsUpdate = true;
      this.birthCount.value = births.length;
      this.birthBase.value = slotBase(k);
      renderer.compute(births.length > 0 ? [this.birthPass, this.stepPass] : [this.stepPass]);
    }
    this.sinceTick.value = simTime - tickTime(tickIndex(simTime));
    return plan.ticks.length;
  }

  setOverlays(o: { sprayTint: boolean }): void {
    this.tint.value = o.sprayTint ? 1 : 0;
  }

  /** The picture's exposure, so the tint overlay reads the same at any exposure. */
  setDisplayExposure(ev: number): void {
    this.inverseExposure.value = ev > 0 ? 1 / ev : 1;
  }
}
