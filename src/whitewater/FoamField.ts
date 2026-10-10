import * as THREE from 'three/webgpu';
import { Fn, Loop, clamp, exp, float, floor, instanceIndex, int, ivec2, length, log, max, min, mix, normalize, select, smoothstep, texture, textureLoad, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import {
  BORE_PUSH, COARSE_SOURCE_SAMPLES, COARSE_TICKS, DEFAULT_FOAM_PARAMS, FOAM_EDGE_BAND_M, FOAM_GRID, FOAM_TICK_S, FRESH_SOURCE, type FoamGrid, type FoamParams, FoamSchedule, LACE_LEVEL,
  PATTERN_WIND_MS, WIND_DRIFT_SHARE, normalizeFoamParams, tickTime,
} from './foamStep';
import { MIST_DECAY_S, MIST_WIND_SHARE, mistSourceNode } from './mistSlab';

type N = any;

/** What the foam map is made from (each called inside the step's Fn, at a texel centre's base xz). */
export interface FoamSourceNodes {
  /** The breaking foam weight [0, 1] at the time the last prepare() set (App: SetWaves.breakingFoamNode). */
  foamNode(xz: N): N;
  /** The unit wave travel direction at xz, zero where unknown (App: the reef field's ray direction). */
  dirNode(xz: N): N;
  /** The foam weight and the bore's push on it (m/s) from one sum (App: SetWaves.breakingFoamPushNode); in place of
   * foamNode when given, `timeShift` s before the prepared time (a coarse step's samples). Absent: no push, and a coarse
   * step samples foamNode once. `land` and `lip` (SetWaves' sum: the landing's and the throwing lip's foam) feed the
   * mist channel (mistSlab.mistSource); absent, no mist. */
  foamPushNode?(xz: N, timeShift?: N | null): { foam: N; push: N; land?: N; lip?: N };
}

/** The published map the materials sample (hardware-filtered half floats): (density, age, mist, 1). */
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

/** The step's own state (full floats, read with textureLoad only): the lace's linear decay is 1.7e-4 a tick, under a half
 * float's step near 0.25, so the state the step reads back is never the half-float copy. */
function stateTexture(g: FoamGrid): THREE.StorageTexture {
  const t = new THREE.StorageTexture(g.nx, g.nz);
  t.type = THREE.FloatType;
  t.format = THREE.RGBAFormat;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

/**
 * The foam field on the GPU (spec 2026-09-27-foam-field-design.md §3, whitewater §5; CPU reference foamStep.ts). `texture`
 * is the published map every material samples; each tick steps the full-float state into a scratch texture (the drift's
 * midpoint backtrace by a manual bilinear, plan ruling R4; decayFoam's two lives; max-inject the source; the age) and a
 * copy pass writes the result back to the state and publishes it, so the materials' texture bindings never change.
 * advance() runs the ticks the schedule plans for this frame: none while paused, a replay after invalidate() or a jump
 * (its oldest part in coarse 0.5 s steps).
 */
export class FoamField {
  readonly texture: THREE.StorageTexture;
  private readonly state: THREE.StorageTexture;
  private readonly scratch: THREE.StorageTexture;
  private readonly schedule = new FoamSchedule();
  private readonly dtS = uniform(FOAM_TICK_S);
  /** How many times a step samples its source (1; COARSE_SOURCE_SAMPLES on a coarse step). */
  private readonly samples = uniform(1, 'int');
  private coarseSamples = 0;
  private readonly expK = uniform(Math.log(1 / LACE_LEVEL) / DEFAULT_FOAM_PARAMS.clearTimeS);
  private readonly laceSlope = uniform(LACE_LEVEL / DEFAULT_FOAM_PARAMS.laceLifeS);
  private readonly driftMps = uniform(DEFAULT_FOAM_PARAMS.driftMps);
  /** The foam volume's exposure (FoamParams.volumeExposure), for the materials. */
  readonly volumeExposure = uniform(DEFAULT_FOAM_PARAMS.volumeExposure);
  /** The wind vector (m/s, toward), set by the App (setWind). */
  private readonly wind = uniform(new THREE.Vector2(0, 0));
  private readonly origin: N;
  private readonly params: FoamParams = { ...DEFAULT_FOAM_PARAMS };
  private readonly stepPass: THREE.ComputeNode;
  private readonly copyPass: THREE.ComputeNode;
  private readonly clearPass: THREE.ComputeNode;

  constructor(source: FoamSourceNodes, readonly grid: FoamGrid = FOAM_GRID) {
    const g = grid, count = g.nx * g.nz;
    this.texture = mapTexture(g);
    this.state = stateTexture(g);
    this.scratch = stateTexture(g);
    this.origin = uniform(new THREE.Vector2(g.x0, g.z0));
    const maxIndex = vec2(g.nx - 1, g.nz - 1);
    const texel = (i: N): N => uvec2(i.mod(g.nx), i.div(g.nx));
    const centre = (i: N): N => vec2(float(i.mod(g.nx)).add(0.5), float(i.div(g.nx)).add(0.5)).mul(g.cellM).add(this.origin);
    // foamStep.bilinearFoam: between texel centres, clamped to the edge texels, exact f32 weights; (density, age).
    const bilinear = (xz: N): N => {
      const f = clamp(xz.sub(this.origin).div(g.cellM).sub(0.5), vec2(0.0), maxIndex);
      const base = min(floor(f), maxIndex.sub(1.0));
      const t = f.sub(base);
      const i0 = ivec2(base);
      const load = (dx: number, dz: number): N => textureLoad(this.state, i0.add(ivec2(dx, dz)), int(0)).xy;
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
    };
    // The same bilinear on the mist channel (.z).
    const bilinearMist = (xz: N): N => {
      const f = clamp(xz.sub(this.origin).div(g.cellM).sub(0.5), vec2(0.0), maxIndex);
      const base = min(floor(f), maxIndex.sub(1.0));
      const t = f.sub(base);
      const i0 = ivec2(base);
      const load = (dx: number, dz: number): N => textureLoad(this.state, i0.add(ivec2(dx, dz)), int(0)).z;
      return mix(mix(load(0, 0), load(1, 0), t.x), mix(load(0, 1), load(1, 1), t.x), t.y);
    };
    // foamStep.driftVector.
    const drift = (dir: N, c: N, density: N): N =>
      dir.mul(this.driftMps.add(c.mul(BORE_PUSH).mul(smoothstep(0.5, 0.9, density)))).add(this.wind.mul(WIND_DRIFT_SHARE));
    // foamStep.decayDensity: exponential to LACE_LEVEL, then linear, exactly over t.
    const decay = (d: N, t: N): N => {
      const k = this.expK;
      const toLace = log(max(d, LACE_LEVEL).div(LACE_LEVEL)).div(k);
      const expo = d.mul(exp(k.negate().mul(t)));
      const above = select(t.lessThanEqual(toLace), expo, max(float(LACE_LEVEL).sub(max(t.sub(toLace), 0.0).mul(this.laceSlope)), 0.0));
      return select(d.greaterThan(LACE_LEVEL), above, max(d.sub(t.mul(this.laceSlope)), 0.0));
    };
    const sourceAt = (xz: N, shift: N | null): { foam: N; push: N; land?: N; lip?: N } =>
      source.foamPushNode ? source.foamPushNode(xz, shift) : { foam: source.foamNode(xz), push: float(0.0) };
    // foamStep.stepFoam; on a coarse step (`samples` COARSE_SOURCE_SAMPLES) the source across the step too, each sample
    // decayed to its end. One pipeline with a uniform loop count: a second pipeline over SetWaves' buffers (a coarse step
    // pass of its own) made every live tick ~3x slower (measured: 200 ticks 580 ms against main's 130).
    this.stepPass = Fn(() => {
      const i = instanceIndex;
      const xz = centre(i).toVar();
      const src = sourceAt(xz, null);
      const S = float(src.foam).toVar(), c = float(src.push).toVar();
      const dir = vec2(source.dirNode(xz)).toVar();
      // mistSlab.stepMist: carried by MIST_WIND_SHARE of the wind, decayed, injected.
      const mistSrc = src.land !== undefined && src.lip !== undefined ? mistSourceNode(src.land, src.lip, dir, this.wind) : float(0.0);
      const mist = max(bilinearMist(xz.sub(this.wind.mul(MIST_WIND_SHARE).mul(this.dtS))).mul(exp(this.dtS.div(-MIST_DECAY_S))), mistSrc).toVar();
      // The midpoint backtrace.
      const own = textureLoad(this.state, ivec2(texel(i)), int(0)).x;
      const mid = xz.sub(drift(dir, c, own).mul(this.dtS.mul(0.5)));
      const up = bilinear(xz.sub(drift(dir, c, bilinear(mid).x).mul(this.dtS))).toVar();
      const next = max(decay(up.x, this.dtS), S).toVar();
      const age = select(S.greaterThanEqual(FRESH_SOURCE), float(0.0), min(up.y.add(this.dtS), 1e4)).toVar();
      Loop({ start: int(1), end: this.samples, type: 'int' }, ({ i: j }: N) => {
        const back = this.dtS.mul(float(j)).div(float(this.samples)).toVar();
        const Sj = float(sourceAt(xz, back).foam).toVar();
        next.assign(max(next, decay(Sj, back)));
        age.assign(select(Sj.greaterThanEqual(FRESH_SOURCE), min(age, back), age));
      });
      textureStore(this.scratch, texel(i), vec4(clamp(next, 0.0, 1.0), age, clamp(mist, 0.0, 1.0), 1.0));
    })().compute(count) as THREE.ComputeNode;
    this.copyPass = Fn(() => {
      const v = textureLoad(this.scratch, ivec2(texel(instanceIndex)), int(0)).toVar();
      textureStore(this.state, texel(instanceIndex), v);
      textureStore(this.texture, texel(instanceIndex), v);
    })().compute(count) as THREE.ComputeNode;
    this.clearPass = Fn(() => {
      textureStore(this.state, texel(instanceIndex), vec4(0.0, 0.0, 0.0, 1.0));
      textureStore(this.texture, texel(instanceIndex), vec4(0.0, 0.0, 0.0, 1.0));
    })().compute(count) as THREE.ComputeNode;
  }

  /** How long dense foam takes to become lace (s): the materials draw older map foam as threads. */
  get clearTimeS(): number {
    return this.params.clearTimeS;
  }

  /** Copies the params in (normalized). The caller decides when the map replays (App debounces slider edits). */
  setParams(p: FoamParams): void {
    Object.assign(this.params, p);
    normalizeFoamParams(this.params);
    this.expK.value = Math.log(1 / LACE_LEVEL) / this.params.clearTimeS;
    this.laceSlope.value = LACE_LEVEL / this.params.laceLifeS;
    this.driftMps.value = this.params.driftMps;
    this.volumeExposure.value = this.params.volumeExposure;
  }

  /** The wind vector the foam drifts with (m/s, the way it blows; foamStep.WIND_DRIFT_SHARE of it). */
  setWind(x: number, z: number): void {
    this.wind.value.set(x, z);
  }

  /** foamStep.foamPatternAxis in TSL: the lace pattern's long axis from the swell's travel (a node), the drift and the wind. */
  patternAxisNode(travel: N): N {
    const w = length(this.wind);
    const gate = smoothstep(PATTERN_WIND_MS[0], PATTERN_WIND_MS[1], w);
    const v = travel.mul(this.driftMps).add(this.wind.mul(WIND_DRIFT_SHARE).mul(gate));
    return select(gate.greaterThan(0.0).and(length(v).greaterThan(1e-9)), normalize(v), travel);
  }

  /** Its compute passes, for App.prewarm to build while the game loads (built on the first frame, they froze it). */
  get computePasses(): THREE.ComputeNode[] {
    return [this.stepPass, this.copyPass, this.clearPass];
  }

  /** The next advance() clears the map and replays the foam's history (clearTime + laceLife + 2 s). */
  invalidate(): void {
    this.schedule.invalidate();
  }

  /** How many source samples the last replay's coarse steps took (COARSE_SOURCE_SAMPLES covered, 1 not). */
  get lastCoarseSamples(): number {
    return this.coarseSamples;
  }

  /**
   * Runs this frame's ticks (FoamSchedule.plan): the coarse ones with dt = COARSE_TICKS × FOAM_TICK_S, then the fine.
   * `covered` (Fable's Task 4 ruling): a replay behind a cover (boot, a moment link, conditions from the select screen,
   * anything showing the loading cover) samples each coarse step's source COARSE_SOURCE_SAMPLES times (exact, ~370 ms
   * at the game's box); without one (the FOAM_JUMP_S safety net on a stalled frame, a dev-panel jump) once (~150 ms:
   * lace older than FINE_REPLAY_S may show stripes, a hitch would be worse).
   * Before each tick `prepare(tₖ)` points the source at that time (App: the ocean's time uniform and SetWaves' events);
   * the caller restores its own state afterwards. Returns the steps run.
   */
  advance(renderer: THREE.WebGPURenderer, simTime: number, prepare: (t: number) => void, covered: boolean): number {
    const plan = this.schedule.plan(simTime, this.params.clearTimeS + this.params.laceLifeS);
    if (plan.clear) renderer.compute(this.clearPass);
    // One submission per tick (the step and the copy together). Measured: a replay's cost was the number of submissions,
    // not the passes' GPU work (~0.03 ms a tick): two per tick took 160–1900 ms in the pane, one per tick ~57 ms.
    const tick = [this.stepPass, this.copyPass];
    // dtS and samples are set only around a coarse run (live ticks never change them).
    if (plan.coarse.length > 0) {
      this.dtS.value = COARSE_TICKS * FOAM_TICK_S;
      this.coarseSamples = covered ? COARSE_SOURCE_SAMPLES : 1;
      this.samples.value = this.coarseSamples;
      for (const k of plan.coarse) {
        prepare(tickTime(k));
        renderer.compute(tick);
      }
      this.dtS.value = FOAM_TICK_S;
      this.samples.value = 1;
    }
    for (const k of plan.ticks) {
      prepare(tickTime(k));
      renderer.compute(tick);
    }
    return plan.coarse.length + plan.ticks.length;
  }

  /**
   * The map at base xz for the materials (any stage): density [0, 1], age (s since fresh) and mist [0, 1] (the mist
   * slab's density, mistSlab.ts; hardware-filtered), and
   * `inside`: how much the map rather than the placeholder decides the foam (foamStep.boxWeight: 0 outside the box, 1
   * from FOAM_EDGE_BAND_M in).
   */
  sampleNode(xz: N): { density: N; age: N; mist: N; inside: N } {
    const g = this.grid;
    const local = xz.sub(this.origin);
    const size = vec2(g.nx * g.cellM, g.nz * g.cellM);
    const edge = min(min(local.x, size.x.sub(local.x)), min(local.y, size.y.sub(local.y)));
    const inside = clamp(edge.div(FOAM_EDGE_BAND_M), 0.0, 1.0);
    const m = texture(this.texture, local.div(size)).level(float(0)); // three typings gap: level() wants a node
    return { density: m.x, age: m.y, mist: m.z, inside };
  }
}
