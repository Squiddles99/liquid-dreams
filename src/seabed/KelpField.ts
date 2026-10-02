import * as THREE from 'three/webgpu';
import { Fn, If, float, instanceIndex, instancedArray, textureStore, uniform, uvec2, vec2, vec4 } from 'three/tsl';
import type { ReefFlow } from '../breaker/flowNodes';
import { FOAM_TICK_S, FoamSchedule, tickIndex, tickTime } from '../whitewater/foamStep';
import { KELP_CELL_M, KELP_FLOW_Y_M, KELP_GRID_N, KELP_REPLAY_S, kelpWindowMin } from './kelp';
import type { KelpMap } from './KelpMap';
import { kelpStepNode, kelpSteadyLeanNode } from './kelpNodes';

type N = any;
const COUNT = KELP_GRID_N * KELP_GRID_N;

/**
 * Steps the kelp's lean (spec §4.2–4.3) at the foam's 20 Hz sim-time ticks: per slot, the world cell it holds in the
 * current window, the flow there KELP_FLOW_Y_M above the bed, one spring step (kelpStepNode) — or, for a cell new to the
 * window or after a jump, the steady lean at rest — into the state buffer, and (prev ← cur, cur ← lean) into the map's
 * display texture.
 */
export class KelpField {
  private readonly state = instancedArray(COUNT, 'vec4');
  private readonly schedule = new FoamSchedule();
  private readonly prevMin = uniform(new THREE.Vector2(1e9, 1e9));
  private readonly fresh = uniform(1);
  private readonly dt = uniform(FOAM_TICK_S);
  private readonly pass: THREE.ComputeNode;
  private enabled = true;
  private lastMin: [number, number] | null = null;

  constructor(private readonly map: KelpMap, flow: ReefFlow) {
    const n = KELP_GRID_N;
    const posMod = (a: N): N => a.mod(n).add(n).mod(n);
    this.pass = Fn(() => {
      const sx = instanceIndex.mod(n), sz = instanceIndex.div(n);
      const minC = map.windowMin;
      const wx = minC.x.add(posMod(float(sx).sub(minC.x))), wz = minC.y.add(posMod(float(sz).sub(minC.y)));
      const centre = vec2(wx.add(0.5), wz.add(0.5)).mul(KELP_CELL_M);
      const p = this.prevMin;
      const known = wx.greaterThanEqual(p.x).and(wx.lessThan(p.x.add(n))).and(wz.greaterThanEqual(p.y)).and(wz.lessThan(p.y.add(n))).and(this.fresh.lessThan(0.5));
      const u = flow.flowNode(centre, KELP_FLOW_Y_M);
      const old = this.state.element(instanceIndex).toVar();
      const display = vec4(0.0).toVar();
      If(known, () => {
        const next = kelpStepNode(old, u, this.dt);
        this.state.element(instanceIndex).assign(next);
        display.assign(vec4(next.xy, old.xy));
      }).Else(() => {
        const steady = kelpSteadyLeanNode(u);
        this.state.element(instanceIndex).assign(vec4(steady, 0.0, 0.0));
        display.assign(vec4(steady, steady));
      });
      textureStore(map.texture, uvec2(sx, sz), display);
    })().compute(COUNT) as THREE.ComputeNode;
  }

  /** The next advance replays KELP_REPLAY_S, every cell starting at its steady lean (a jump, new conditions, a new field). */
  invalidate(): void {
    this.schedule.invalidate();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.map.on.value = on ? 1 : 0;
    this.map.show.value = on ? 1 : 0;
    if (on) this.invalidate();
  }

  /** Runs this frame's ticks; `prepare(t)` points the set waves at tick time t (App.pointFoamSourceAt). Returns the ticks run. */
  advance(renderer: THREE.WebGPURenderer, simTime: number, camX: number, camZ: number, prepare: (t: number) => void): number {
    if (!this.enabled) return 0;
    const [mx, mz] = kelpWindowMin(camX, camZ);
    const plan = this.schedule.planTicks(simTime, Math.ceil(KELP_REPLAY_S / FOAM_TICK_S));
    this.map.setWindow(mx, mz);
    this.map.on.value = 1;
    let first = plan.clear;
    for (const k of plan.ticks) {
      prepare(tickTime(k));
      this.fresh.value = first ? 1 : 0;
      const [px, pz] = this.lastMin ?? [1e9, 1e9];
      this.prevMin.value.set(px, pz);
      renderer.compute(this.pass);
      this.lastMin = [mx, mz];
      first = false;
    }
    // The shading reads the window the texture was last written for, not the camera's: on a frame with no tick (paused,
    // or 2 frames in 3 at 60 fps) a moved camera would otherwise see wrapped cells 128 m away (final review I2).
    if (this.lastMin) this.map.setWindow(this.lastMin[0], this.lastMin[1]);
    else this.map.on.value = 0;
    this.map.alpha.value = Math.min(1, Math.max(0, (simTime - tickTime(tickIndex(simTime))) / FOAM_TICK_S));
    this.map.time.value = simTime;
    return plan.ticks.length;
  }
}
