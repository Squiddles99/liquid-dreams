import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, dot, float, length, max, positionWorld, pow, saturate, smoothstep, texture, uniform, varying, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { mistLightNode } from './mistLight';
import { noiseAtlasTexture } from './noiseAtlas';
import type { FeatherEmitter } from './sprayEmitters';

type N = any;

/**
 * The crest strip (breaking-look item 5a): offshore feathering as one draw, a quad strip along each wave's stood and
 * throwing crest, rooted on the crest knot (the feather emitters' points: the drawn crest near the curl, the throwing lip's
 * crest knot), leaning downwind, its height = featherStrength (the wind table, unchanged) × STRIP_HEIGHT_A × A × the wind's
 * share of 20 kn; lit by mistLight; its alpha the noise atlas's fibres scrolled back and up with the wind, fading with
 * height. Born on the lip (the 10-13 birth law), carried up and back (today's plume): Fable's ruling 3, both by the wind.
 * 100 m+ of feathering in one draw where the puffs it replaces (L4: FEATHER_RATE cut to 30 %) were sub-pixel from a drone.
 */
/** The strip's height at full strength and 20 kn offshore, × the section's A (Andrew picks 1 / 1.5 / 2 at STOP C). */
export const STRIP_HEIGHT_A = 1.5;
/** The wind the height is quoted at (m/s): 20 kn. Below it the height scales with the offshore speed. */
export const STRIP_FULL_WIND_MS = 20 * 0.5144;
/** The lean: the top sits this × the height downwind (back over the wave) at 20 kn. */
export const STRIP_LEAN = 0.8;
/** The strip's peak opacity (× the emitter's strength). */
export const STRIP_ALPHA = 0.55;
/** Two emitters join into one strip when their arcs (SPRAY_SPACING_M steps) are at most this far apart. */
const JOIN_ARC = 2;
/** Most strip columns (two vertices each). */
export const STRIP_MAX_COLUMNS = 512;

export interface StripColumn { x: number; y: number; z: number; tx: number; ty: number; tz: number; s: number; arcM: number; strength: number }

/** The strip's top over a crest point: up by the height, back (−n) by the lean. */
export function stripHeight(strength: number, A: number, wOff: number, heightA = STRIP_HEIGHT_A): number {
  return Math.max(0, strength) * heightA * A * Math.min(1, Math.max(0, wOff) / STRIP_FULL_WIND_MS);
}

/**
 * The strip's columns from a tick's feather emitters, positions eased from tick k (`a`) to k + 1 (`b`) by `frac` where an
 * emitter is in both (by wave and arc): runs of consecutive arcs per wave, in arc order; a run of one emitter draws
 * nothing. Each column: the crest point, the top, the run's break flag (s = 0 starts a run), the arc (m) and strength.
 */
export function stripColumns(a: readonly FeatherEmitter[], b: readonly FeatherEmitter[], frac: number, spacingM: number, heightA = STRIP_HEIGHT_A): StripColumn[] {
  const next = new Map<string, FeatherEmitter>();
  for (const e of b) next.set(`${e.waveId}:${e.arc}`, e);
  const sorted = a.slice().sort((p, q) => p.waveId - q.waveId || p.arc - q.arc);
  const out: StripColumn[] = [];
  let prev: FeatherEmitter | null = null;
  for (const e0 of sorted) {
    const e1 = next.get(`${e0.waveId}:${e0.arc}`);
    const l = (u: number, v: number | undefined) => (v === undefined ? u : u + (v - u) * frac);
    const x = l(e0.x, e1?.x), y = l(e0.y, e1?.y), z = l(e0.z, e1?.z), strength = l(e0.strength, e1?.strength);
    const h = stripHeight(strength, e0.A, e0.wOff, heightA), lean = STRIP_LEAN * h * Math.min(1, Math.max(0, e0.wOff) / STRIP_FULL_WIND_MS);
    const start = !prev || prev.waveId !== e0.waveId || e0.arc - prev.arc > JOIN_ARC;
    out.push({ x, y, z, tx: x - e0.nx * lean, ty: y + h, tz: z - e0.nz * lean, s: start ? 0 : 1, arcM: e0.arc * spacingM, strength });
    prev = e0;
  }
  // A lone column (its run has no neighbour) draws nothing: zero its height.
  for (let i = 0; i < out.length; i++) if (out[i].s === 0 && (i + 1 >= out.length || out[i + 1].s === 0)) { out[i].tx = out[i].x; out[i].ty = out[i].y; out[i].tz = out[i].z; }
  return out.slice(0, STRIP_MAX_COLUMNS);
}

export class CrestStrip {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(STRIP_MAX_COLUMNS * 2 * 3);
  /** Per vertex: (arc m, 0 base / 1 top, strength, 0). */
  private readonly aux = new Float32Array(STRIP_MAX_COLUMNS * 2 * 4);
  private readonly index = new Uint32Array((STRIP_MAX_COLUMNS - 1) * 6);
  private readonly time = uniform(0);
  private readonly windAlong = uniform(0);
  /** The strip's height at 20 kn (× A): Andrew's STOP C pick (1 / 1.5 / 2), a dev dial. */
  heightA = STRIP_HEIGHT_A;

  constructor(sky: Sky) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('stripAux', new THREE.BufferAttribute(this.aux, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(this.index, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, this.buildMaterial(sky));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  private buildMaterial(sky: Sky): THREE.MeshBasicNodeMaterial {
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.blending = THREE.NormalBlending;
    const aux: N = varying(attribute('stripAux', 'vec4'));
    const arc = aux.x, v = aux.y, strength = aux.z;
    // The fibres: the atlas's B channel (stretched along u), u along the crest, v up the strip; scrolled up and back.
    const atlas = noiseAtlasTexture();
    const fib = texture(atlas, vec2(arc.div(24.0).add(this.windAlong), v.mul(0.35).sub(this.time.mul(0.12)))).z;
    const fib2 = texture(atlas, vec2(arc.div(9.0).sub(this.time.mul(0.03)), v.mul(0.8).sub(this.time.mul(0.3)))).w;
    const body = smoothstep(0.35, 0.85, fib.mul(0.65).add(fib2.mul(0.35)));
    // Thin at the root (it is born on the lip), densest low, thinning with height.
    const profile = smoothstep(0.0, 0.08, v).mul(pow(float(1.0).sub(v), 1.6));
    const toP = positionWorld.sub(cameraPosition), dist = length(toP), viewDir = toP.div(max(dist, 1e-3));
    const light = mistLightNode({ cosView: dot(viewDir, sky.sunDirection), nDotL: float(0.3), sunVisibility: float(1.0), isotropic: float(0.5), groundColour: vec3(0.02, 0.06, 0.07) }, sky);
    const lit = sky.mist ? sky.mist(light, positionWorld, float(1.0)) : light;
    m.colorNode = sky.applyAerialPerspective(lit, dist, viewDir);
    // Near the eye it fades (as the sprites' nearCameraFade): the strip is a distant read.
    m.opacityNode = saturate(body.mul(profile).mul(saturate(strength)).mul(STRIP_ALPHA).mul(smoothstep(4.0, 12.0, dist)));
    return m;
  }

  /** This frame's strip from the feather emitters of ticks k and k + 1, `frac` of the way between. */
  update(a: readonly FeatherEmitter[], b: readonly FeatherEmitter[], frac: number, spacingM: number, simTime: number, windSpeedMs: number): void {
    const cols = stripColumns(a, b, frac, spacingM, this.heightA);
    let tri = 0;
    cols.forEach((c, i) => {
      this.pos.set([c.x, c.y, c.z, c.tx, c.ty, c.tz], i * 6);
      this.aux.set([c.arcM, 0, c.strength, 0, c.arcM, 1, c.strength, 0], i * 8);
      if (i > 0 && c.s === 1) {
        const p = (i - 1) * 2, q = i * 2;
        this.index.set([p, q, p + 1, p + 1, q, q + 1], tri * 6);
        tri++;
      }
    });
    this.geometry.setDrawRange(0, tri * 6);
    this.mesh.visible = tri > 0;
    const posA = this.geometry.getAttribute('position') as THREE.BufferAttribute, auxA = this.geometry.getAttribute('stripAux') as THREE.BufferAttribute;
    posA.needsUpdate = true; auxA.needsUpdate = true; this.geometry.index!.needsUpdate = true;
    this.time.value = simTime;
    this.windAlong.value = (simTime * windSpeedMs * 0.02) % 1;
  }
}
