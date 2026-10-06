// The select screens' painted ground over the live sea (lookout backdrop spec): Andrew's painting, cover-cropped, warped
// by his animation's measured motion and the game's wind, relit by the game's sun and sky every frame.
import * as THREE from 'three/webgpu';
import { PI, clamp, float, floor, mix, mod, screenUV, sin, step, texture, uniform, vec2 } from 'three/tsl';
import type { SceneOverlay } from '../../render/PicturePipeline';
import type { Sky } from '../../sky/Sky';
import { PLATE_ASPECT, windDrive } from './backdropMath';
import { DEFAULT_LOOKOUT_LIGHT, type LookoutLight } from './backdropLight';

type N = any;

export interface BackdropInput {
  fade: number;
  aspect: number;
  windMs: number;
  windFromDeg: number;
  cameraYawDeg: number;
}

const FRAMES = 80, TILES = [10, 8] as const, GRID = [240, 135] as const;
/** The lean and squash at full strength, in 1920-px pixels at the tips (the preview's feel at 25 kn). */
const LEAN_PX = 5, SQUASH_PX = 1.5;

/**
 * A 1×1 stand-in until the art arrives (`ready` keeps it unseen). An image texture, not a DataTexture: the loaded
 * picture replaces its image later, and a DataTexture would upload that picture as raw data (writeTexture fails).
 */
const placeholder = (): THREE.Texture => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  return t;
};

export class LookoutBackdrop {
  readonly light: LookoutLight = { ...DEFAULT_LOOKOUT_LIGHT };
  private readonly u = {
    ready: uniform(0), fade: uniform(0), aspect: uniform(PLATE_ASPECT),
    phase: uniform(0), mix2: uniform(0), lean: uniform(0), squash: uniform(0), gust: uniform(0), gustClock: uniform(0),
    sunShare: uniform(DEFAULT_LOOKOUT_LIGHT.sunShare), exposure: uniform(DEFAULT_LOOKOUT_LIGHT.exposure),
  };
  private readonly plateTex = placeholder();
  private readonly swayTex = placeholder();
  private readonly flowTex = placeholder();
  private loopS = 3.95;
  private clock = 0;
  private gustT = 0;

  /** `base` is the site root (import.meta.env.BASE_URL); `wide` loads the 3840 px painting; `plate` names the art. */
  constructor(base: string, wide: boolean, plate = 'conditions') {
    const loader = new THREE.TextureLoader();
    const at = (name: string): string => `${base}lookout/${plate}-${name}`;
    void Promise.all([
      loader.loadAsync(at(wide ? 'ground-3840.webp' : 'ground-1920.webp')),
      loader.loadAsync(at('sway.png')),
      loader.loadAsync(at('flow.png')),
      fetch(at('flow.json')).then((r) => r.json() as Promise<{ loopS: number }>),
    ]).then(([plateImg, sway, flow, meta]) => {
      const adopt = (dst: THREE.Texture, src: THREE.Texture, srgb: boolean): void => {
        // The GPU texture was made at the stand-in's 1×1 and a new image of another size doesn't remake it: dispose first.
        dst.dispose();
        dst.image = src.image;
        dst.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        dst.flipY = false;
        dst.generateMipmaps = false;
        dst.minFilter = dst.magFilter = THREE.LinearFilter;
        dst.wrapS = dst.wrapT = THREE.ClampToEdgeWrapping;
        dst.needsUpdate = true;
      };
      adopt(this.plateTex, plateImg, true);
      adopt(this.swayTex, sway, false);
      adopt(this.flowTex, flow, false);
      this.loopS = meta.loopS;
      this.u.ready.value = 1;
    }).catch((e) => console.warn('[lookout] art failed to load; Conditions shows the plain scene', e));
  }

  /** The TSL layer for PicturePipeline: the painting over the scene's light, relit by the sky. */
  overlay(sky: Sky): SceneOverlay {
    const u = this.u, size = vec2(1920, 1080);
    // Cover crop anchored bottom-right (backdropMath.coverUV, mirrored here).
    const coverUVNode = (): N => {
      const wide = step(float(PLATE_ASPECT), u.aspect);
      const sh = float(PLATE_ASPECT).div(u.aspect), sw = u.aspect.div(PLATE_ASPECT);
      const wideUV = vec2(screenUV.x, float(1).sub(sh).add(screenUV.y.mul(sh)));
      const tallUV = vec2(float(1).sub(sw).add(screenUV.x.mul(sw)), screenUV.y);
      return mix(tallUV, wideUV, wide);
    };
    // The measured motion at frame f (atlas tile), in 1920-px pixels.
    const flowAt = (uv: N, f: N): N => {
      const tx = mod(f, TILES[0]), ty = floor(f.div(TILES[0]));
      const inTile = clamp(uv, vec2(0.5 / GRID[0], 0.5 / GRID[1]), vec2(1 - 0.5 / GRID[0], 1 - 0.5 / GRID[1]));
      const at = vec2(tx.add(inTile.x).div(TILES[0]), ty.add(inTile.y).div(TILES[1]));
      return texture(this.flowTex, at).rg.mul(255).sub(128).div(16);
    };
    const motion = (uv: N, phase: N): N => {
      const f0 = floor(phase), f1 = mod(f0.add(1), FRAMES), k = phase.sub(f0);
      return mix(flowAt(uv, f0), flowAt(uv, f1), k);
    };
    return (scene: N): N => {
      const uv: N = coverUVNode();
      const sway = texture(this.swayTex, uv).r;
      // Two readings half a loop apart, blended slowly, so the 4 s cycle doesn't show.
      const flowPx = mix(motion(uv, u.phase), motion(uv, mod(u.phase.add(FRAMES / 2), FRAMES)), u.mix2);
      const gustWave = sin(uv.x.mul(5).sub(u.gustClock)).mul(0.5).add(0.5);
      const push = float(0.35).add(gustWave.mul(gustWave).mul(u.gust).mul(0.65));
      const leanPx = vec2(u.lean.mul(LEAN_PX), u.squash.mul(SQUASH_PX)).mul(push).mul(sway);
      const sampleUV = uv.add(flowPx.sub(leanPx).div(size));
      const plate = texture(this.plateTex, sampleUV);
      const light = sky.skyIrradiance.mul(0.75).add(sky.sunIlluminance.mul(u.sunShare)).div(PI).mul(u.exposure);
      const lit = plate.rgb.mul(light);
      return mix(scene, lit, plate.a.mul(u.fade).mul(u.ready));
    };
  }

  update(dtS: number, i: BackdropInput): void {
    const d = windDrive(i.windMs, i.windFromDeg, i.cameraYawDeg);
    this.gustT += dtS * (0.5 + 0.6 * d.gust);
    const gustNow = 0.5 + 0.5 * Math.sin(this.gustT * 0.9 + Math.sin(this.gustT * 0.23) * 2);
    this.clock += dtS * d.rate * (0.85 + 0.3 * gustNow * d.gust);
    this.u.phase.value = ((this.clock / this.loopS) * FRAMES) % FRAMES;
    this.u.mix2.value = 0.25 * (1 + Math.sin(this.clock * 0.37));
    this.u.lean.value = d.lean;
    this.u.squash.value = d.squash;
    this.u.gust.value = d.gust;
    this.u.gustClock.value = this.gustT;
    this.u.fade.value = i.fade;
    this.u.aspect.value = i.aspect;
    this.u.sunShare.value = this.light.sunShare;
    this.u.exposure.value = this.light.exposure;
  }
}
