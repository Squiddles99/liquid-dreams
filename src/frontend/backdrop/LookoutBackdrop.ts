// The select screens' painted ground over the live sea (lookout backdrop spec): Andrew's paintings, cover-cropped, warped
// by their animations' measured motion (and, for plants, the game's wind), relit by the game's sun and sky every frame.
// Layers stack back to front: the ground, then the crew standing on it.
import * as THREE from 'three/webgpu';
import { PI, clamp, float, floor, mix, mod, screenUV, sin, step, texture, uniform, vec2 } from 'three/tsl';
import type { SceneOverlay } from '../../render/PicturePipeline';
import type { Sky } from '../../sky/Sky';
import { CREW_RECT, type LayerRect, PLATE_ASPECT, easeToward, windDrive } from './backdropMath';
import { DEFAULT_LOOKOUT_LIGHT, type LookoutLight } from './backdropLight';

type N = any;

export interface BackdropInput {
  fade: number;
  aspect: number;
  windMs: number;
  windFromDeg: number;
  cameraYawDeg: number;
  /** 0…1: how much of the sun gets through the cloud (App's cloud meter); the painting has no sun under a storm. */
  sunVisible: number;
}

/** One painting in the stack. */
export interface LayerSpec {
  /** The art's name in public/lookout/ (tools/plateArt.py's folder name). */
  plate: string;
  /** Where it sits on the ground painting; absent: it is the ground (fills the cover crop). */
  rect?: LayerRect;
  /** Plants: the game's wind sets its pace and leans its tips. People: their own pace, no lean. */
  wind: boolean;
}

/** Conditions (Andrew 2026-10-07): the heath crest, and the crew from behind looking out at the break. */
export const CONDITIONS_LAYERS: readonly LayerSpec[] = [
  { plate: 'conditions', wind: true },
  { plate: 'conditions-crew', rect: CREW_RECT, wind: false },
];

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

class Layer {
  readonly plateTex = placeholder();
  readonly swayTex = placeholder();
  readonly flowTex = placeholder();
  readonly ready = uniform(0);
  readonly phase = uniform(0);
  loopS = 4;
  clock = 0;

  constructor(readonly spec: LayerSpec, base: string, wide: boolean) {
    const loader = new THREE.TextureLoader();
    const at = (name: string): string => `${base}lookout/${spec.plate}-${name}`;
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
      this.ready.value = 1;
    }).catch((e) => console.warn(`[lookout] ${spec.plate} failed to load; it stays hidden`, e));
  }
}

export class LookoutBackdrop {
  readonly light: LookoutLight = { ...DEFAULT_LOOKOUT_LIGHT };
  private readonly u = {
    fade: uniform(0), aspect: uniform(PLATE_ASPECT),
    mix2: uniform(0), lean: uniform(0), squash: uniform(0), gust: uniform(0), gustClock: uniform(0),
    sunShare: uniform(DEFAULT_LOOKOUT_LIGHT.sunShare), sunVisible: uniform(1), exposure: uniform(DEFAULT_LOOKOUT_LIGHT.exposure),
  };
  private readonly layers: Layer[];
  private gustT = 0;
  /** The cloud meter's sun visibility, eased: it reads every 0.25 s, and a raw step would pop the painted ground. */
  private sunVis = 1;

  /** `base` is the site root (import.meta.env.BASE_URL); `wide` loads the 3840 px paintings. */
  constructor(base: string, wide: boolean, specs: readonly LayerSpec[] = CONDITIONS_LAYERS) {
    this.layers = specs.map((s) => new Layer(s, base, wide));
  }

  /** The TSL layer for PicturePipeline: the paintings over the scene's light, relit by the sky. */
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
    // The measured motion at frame f (atlas tile), in 1920-px pixels of the layer's own picture.
    const flowAt = (tex: THREE.Texture, uv: N, f: N): N => {
      const tx = mod(f, TILES[0]), ty = floor(f.div(TILES[0]));
      const inTile = clamp(uv, vec2(0.5 / GRID[0], 0.5 / GRID[1]), vec2(1 - 0.5 / GRID[0], 1 - 0.5 / GRID[1]));
      const at = vec2(tx.add(inTile.x).div(TILES[0]), ty.add(inTile.y).div(TILES[1]));
      return texture(tex, at).rg.mul(255).sub(128).div(16);
    };
    const motion = (tex: THREE.Texture, uv: N, phase: N): N => {
      const f0 = floor(phase), f1 = mod(f0.add(1), FRAMES), k = phase.sub(f0);
      return mix(flowAt(tex, uv, f0), flowAt(tex, uv, f1), k);
    };
    // One layer's colour and alpha at ground uv `g`.
    const sample = (L: Layer, g: N): { rgb: N; a: N } => {
      const r = L.spec.rect;
      const uv: N = r ? g.sub(vec2(r.x, r.y)).div(r.scale) : g;
      // Inside the layer's own picture (a placed layer is transparent beyond its edges).
      const inside: N = r ? step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1)) : float(1);
      let flowPx: N;
      if (L.spec.wind) {
        // Two readings half a loop apart, blended slowly, so the 4 s cycle doesn't show.
        flowPx = mix(motion(L.flowTex, uv, L.phase), motion(L.flowTex, uv, mod(L.phase.add(FRAMES / 2), FRAMES)), u.mix2);
        const sway = texture(L.swayTex, uv).r;
        const gustWave = sin(uv.x.mul(5).sub(u.gustClock)).mul(0.5).add(0.5);
        const push = float(0.35).add(gustWave.mul(gustWave).mul(u.gust).mul(0.65));
        flowPx = flowPx.sub(vec2(u.lean.mul(LEAN_PX), u.squash.mul(SQUASH_PX)).mul(push).mul(sway));
      } else {
        flowPx = motion(L.flowTex, uv, L.phase);
      }
      const plate = texture(L.plateTex, uv.add(flowPx.div(size)));
      return { rgb: plate.rgb, a: plate.a.mul(inside).mul(L.ready) };
    };
    return (scene: N): N => {
      const g: N = coverUVNode();
      // The full sky light, as the game's own flat ground gets it (n.y = 1): the paintings are lit flat, shadowless.
      const light = sky.skyIrradiance.add(sky.sunIlluminance.mul(u.sunShare).mul(u.sunVisible)).div(PI).mul(u.exposure);
      let out: N = scene;
      for (const L of this.layers) {
        const s = sample(L, g);
        out = mix(out, s.rgb.mul(light), s.a.mul(u.fade));
      }
      return out;
    };
  }

  update(dtS: number, i: BackdropInput): void {
    const d = windDrive(i.windMs, i.windFromDeg, i.cameraYawDeg);
    this.gustT += dtS * (0.5 + 0.6 * d.gust);
    const gustNow = 0.5 + 0.5 * Math.sin(this.gustT * 0.9 + Math.sin(this.gustT * 0.23) * 2);
    for (const L of this.layers) {
      // Plants keep the wind's pace; people their own.
      L.clock += dtS * (L.spec.wind ? d.rate * (0.85 + 0.3 * gustNow * d.gust) : 1);
      L.phase.value = ((L.clock / L.loopS) * FRAMES) % FRAMES;
    }
    const plants = this.layers.find((L) => L.spec.wind);
    this.u.mix2.value = 0.25 * (1 + Math.sin((plants?.clock ?? 0) * 0.37));
    this.u.lean.value = d.lean;
    this.u.squash.value = d.squash;
    this.u.gust.value = d.gust;
    this.u.gustClock.value = this.gustT;
    this.u.fade.value = i.fade;
    this.u.aspect.value = i.aspect;
    this.u.sunShare.value = this.light.sunShare;
    this.sunVis = easeToward(this.sunVis, i.sunVisible, dtS, 0.4);
    this.u.sunVisible.value = this.sunVis;
    this.u.exposure.value = this.light.exposure;
  }
}
