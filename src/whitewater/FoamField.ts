import * as THREE from 'three/webgpu';
import { Fn, clamp, float, floor, instanceIndex, int, ivec2, max, min, mix, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import { DEFAULT_FOAM_PARAMS, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, type FoamGrid, type FoamParams, FoamSchedule, normalizeFoamParams, tickTime } from './foamStep';

type N = any;

/** What the foam map is made from (each called inside the step's Fn, at a texel centre's base xz). */
export interface FoamSourceNodes {
  /** The breaking foam weight [0, 1] at the time the last prepare() set (App: SetWaves.breakingFoamNode). */
  foamNode(xz: N): N;
  /** The unit wave travel direction at xz, zero where unknown (App: the reef field's ray direction). */
  dirNode(xz: N): N;
}

function mapTexture(g: FoamGrid): THREE.StorageTexture {
  const t = new THREE.StorageTexture(g.nx, g.nz);
  t.type = THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

/**
 * The foam field on the GPU (spec 2026-09-27-foam-field-design.md §3; CPU reference foamStep.ts). `texture` is the
 * published map every material samples; each tick steps it into a scratch texture (drift by a manual bilinear, plan
 * ruling R4; linear clear; max-inject the source; clamp) and a copy pass publishes the result, so the materials' texture
 * bindings never change. advance() runs the ticks the schedule plans for this frame: none while paused, a replay after
 * invalidate() or a jump.
 */
export class FoamField {
  readonly texture: THREE.StorageTexture;
  private readonly scratch: THREE.StorageTexture;
  private readonly schedule = new FoamSchedule();
  private readonly decay = uniform(FOAM_TICK_S / DEFAULT_FOAM_PARAMS.clearTimeS);
  private readonly reach = uniform(DEFAULT_FOAM_PARAMS.driftMps * FOAM_TICK_S);
  private readonly origin: N;
  private readonly params: FoamParams = { ...DEFAULT_FOAM_PARAMS };
  private readonly stepPass: THREE.ComputeNode;
  private readonly copyPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;

  constructor(source: FoamSourceNodes, readonly grid: FoamGrid = FOAM_GRID) {
    const g = grid, count = g.nx * g.nz;
    this.texture = mapTexture(g);
    this.scratch = mapTexture(g);
    this.origin = uniform(new THREE.Vector2(g.x0, g.z0));
    const maxIndex = vec2(g.nx - 1, g.nz - 1);
    const texel = (i: N): N => uvec2(i.mod(g.nx), i.div(g.nx));
    const centre = (i: N): N => vec2(float(i.mod(g.nx)).add(0.5), float(i.div(g.nx)).add(0.5)).mul(g.cellM).add(this.origin);
    // foamStep.bilinearFoam: between texel centres, clamped to the edge texels, exact f32 weights.
    const bilinear = (xz: N): N => {
      const f = clamp(xz.sub(this.origin).div(g.cellM).sub(0.5), vec2(0.0), maxIndex);
      const base = min(floor(f), maxIndex.sub(1.0));
      const t = f.sub(base);
      const i0 = ivec2(base);
      const load = (dx: number, dz: number): N => textureLoad(this.texture, i0.add(ivec2(dx, dz)), int(0)).x;
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
    };
    this.stepPass = Fn(() => {
      const xz = centre(instanceIndex).toVar();
      const adv = bilinear(xz.sub(source.dirNode(xz).mul(this.reach)));
      const next = clamp(max(adv.sub(this.decay), source.foamNode(xz)), 0.0, 1.0);
      textureStore(this.scratch, texel(instanceIndex), vec4(next, 0.0, 0.0, 1.0));
    })().compute(count) as THREE.ComputeNode;
    this.copyPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), textureLoad(this.scratch, ivec2(texel(instanceIndex)), int(0)));
    })().compute(count) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      textureStore(this.texture, texel(instanceIndex), vec4(0.0, 0.0, 0.0, 1.0));
    })().compute(count) as THREE.ComputeNode;
  }

  /** Copies the params in (normalized). The caller decides when the map replays (App debounces slider edits). */
  setParams(p: FoamParams): void {
    Object.assign(this.params, p);
    normalizeFoamParams(this.params);
    this.decay.value = FOAM_TICK_S / this.params.clearTimeS;
    this.reach.value = this.params.driftMps * FOAM_TICK_S;
  }

  /** Its compute passes, for App.prewarm to build while the game loads (built on the first frame, they froze it). */
  get computePasses(): THREE.ComputeNode[] {
    return [this.stepPass, this.copyPass, this.clearPass];
  }

  /** The next advance() clears the map and replays clearTime + 2 s. */
  invalidate(): void {
    this.schedule.invalidate();
  }

  /**
   * Runs this frame's ticks (FoamSchedule.plan). Before each tick `prepare(tₖ)` points the source at that time (App:
   * the ocean's time uniform and SetWaves' events); the caller restores its own state afterwards. Returns the steps run.
   */
  advance(renderer: THREE.WebGPURenderer, simTime: number, prepare: (t: number) => void): number {
    const plan = this.schedule.plan(simTime, this.params.clearTimeS);
    if (plan.clear) renderer.compute(this.clearPass);
    // One submission per tick (the step and the copy together). Measured: a replay's cost was the number of submissions,
    // not the passes' GPU work (~0.03 ms a tick): two per tick took 160–1900 ms in the pane, one per tick ~57 ms.
    const tick = [this.stepPass, this.copyPass];
    for (const k of plan.ticks) {
      prepare(tickTime(k));
      renderer.compute(tick);
    }
    return plan.ticks.length;
  }

  /**
   * The map at base xz for the materials (any stage): density [0, 1] (hardware-filtered), and `inside`: how much the map
   * rather than the placeholder decides the foam (foamStep.boxWeight: 0 outside the box, 1 from FOAM_EDGE_BAND_M in).
   */
  sampleNode(xz: N): { density: N; inside: N } {
    const g = this.grid;
    const local = xz.sub(this.origin);
    const size = vec2(g.nx * g.cellM, g.nz * g.cellM);
    const edge = min(min(local.x, size.x.sub(local.x)), min(local.y, size.y.sub(local.y)));
    const inside = clamp(edge.div(FOAM_EDGE_BAND_M), 0.0, 1.0);
    const density = texture(this.texture, local.div(size)).level(float(0)).x; // three typings gap: level() wants a node
    return { density, inside };
  }
}
