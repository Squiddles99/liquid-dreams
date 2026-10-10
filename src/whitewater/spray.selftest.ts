import type * as THREE from 'three/webgpu';
import { type ComputeNode, StorageBufferAttribute, Vector3 } from 'three/webgpu';
import { Fn, float, storage, vec3, vec4 } from 'three/tsl';
import { mistLightCpu, mistLightNode } from './mistLight';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { FoamSchedule } from './foamStep';
import { SprayParticles, sprayPhaseNode } from './SprayParticles';
import { sprayPhase } from './sprayLook';
import { PLUME_LIFE_S, SPRAY_POOL, type SprayBirth, replayTicksForMaxLife, sprayReplayTicks } from './sprayEmitters';
import { SprayPool, birthInto, liveSlots, stepPool } from './sprayStep';
import { IMPACT_KIND, PARTICLE_KINDS, type ParticleKind, SPRAY_KIND, kindIndexOf } from './particleKinds';

/** A synthetic source: a line of puffs every tick, varying with the tick (no reef needed). */
const birthsAt = (k: number): SprayBirth[] =>
  Array.from({ length: 5 + (((k % 7) + 7) % 7) }, (_, i) => ({ x: i * 1.5, y: 1 + 0.1 * i, z: k * 0.01, vx: 2, vy: 2 + (i % 3), vz: -1, life: 1 + (i % 4) * 0.4, strength: 0.8 }));
const WIND: [number, number] = [-5, 3];

async function read(renderer: THREE.WebGPURenderer, spray: SprayParticles): Promise<{ pos: Float32Array; vel: Float32Array }> {
  return {
    pos: new Float32Array(await renderer.getArrayBufferAsync(spray.posAgeAttr)),
    vel: new Float32Array(await renderer.getArrayBufferAsync(spray.velLifeAttr)),
  };
}

const KINDS: [string, ParticleKind, boolean][] = [['spray', SPRAY_KIND, false], ['impact', IMPACT_KIND, false], ['mixed (all four kinds in the spray pool)', SPRAY_KIND, true]];
/** The mixed case's births: every kind in turn (whitewater §4.1: one pool draws every kind). */
const mixedAt = (k: number): SprayBirth[] => birthsAt(k).map((b, i) => ({ ...b, kind: i % PARTICLE_KINDS.length, yWater: 0.2 * i }));

registerSelfTest({
  name: 'spray: the GPU birth and step match the CPU reference over a replay (spray, impact, and all four kinds mixed in one pool)',
  async run(renderer) {
    const notes: string[] = [];
    let ok = true;
    for (const [label, kind, mixed] of KINDS) {
      const at = mixed ? mixedAt : birthsAt;
      const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE), kind);
      spray.setWind(...WIND);
      const t = 12;
      spray.advance(renderer, t, at);
      const g = await read(renderer, spray);
      const cpu = new SprayPool(SPRAY_POOL, kindIndexOf(kind));
      // The spray's pool replays the plume's longest life (it shares the pool); the impact's its own default.
      const plan = new FoamSchedule().planTicks(t, kind === SPRAY_KIND ? replayTicksForMaxLife(Math.max(1.2 * 2, PLUME_LIFE_S[1])) : sprayReplayTicks(2));
      for (const k of plan.ticks) { birthInto(cpu, k, at(k)); stepPool(cpu, ...WIND); }
      const live = liveSlots(cpu);
      let worst = 0, liveGpu = 0;
      for (let s = 0; s < SPRAY_POOL; s++) if (g.pos[s * 4 + 3] < g.vel[s * 4 + 3]) liveGpu++;
      for (const s of live) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(g.pos[s * 4 + c] - cpu.posAge[s * 4 + c]), Math.abs(g.vel[s * 4 + c] - cpu.velLife[s * 4 + c]));
      ok &&= worst < 1e-3 && liveGpu === live.length && live.length > 50;
      notes.push(`${label}: ${live.length} live (GPU ${liveGpu}); worst |GPU − CPU| ${worst.toExponential(2)}`);
    }
    return { pass: ok, detail: notes.join('; ') };
  },
});

registerSelfTest({
  name: 'spray: a GPU replay matches GPU live stepping exactly (fixed slots per tick; the impact kind)',
  async run(renderer) {
    const live = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE), IMPACT_KIND);
    live.setWind(...WIND);
    for (let f = 0; f <= 240; f++) live.advance(renderer, 6 + f / 60, birthsAt);
    const a = await read(renderer, live);
    const replay = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE), IMPACT_KIND);
    replay.setWind(...WIND);
    replay.advance(renderer, 10, birthsAt);
    const b = await read(renderer, replay);
    let worst = 0, n = 0;
    for (let s = 0; s < SPRAY_POOL; s++) {
      const la = a.pos[s * 4 + 3] < a.vel[s * 4 + 3], lb = b.pos[s * 4 + 3] < b.vel[s * 4 + 3];
      if (la !== lb) worst = Infinity;
      if (!la) continue;
      n++;
      for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(a.pos[s * 4 + c] - b.pos[s * 4 + c]), Math.abs(a.vel[s * 4 + c] - b.vel[s * 4 + c]));
    }
    return { pass: worst === 0 && n > 50, detail: `${n} live; worst |live − replay| ${worst}` };
  },
});

registerSelfTest({
  name: 'spray: the TSL phase function matches sprayLook.sprayPhase (backlit glow, white side-on)',
  async run(renderer) {
    const cs = [-1, -0.5, 0, 0.5, 0.9, 0.99, 1];
    const outAttr = new StorageBufferAttribute(new Float32Array(cs.length * 4), 4);
    const out = storage(outAttr, 'vec4', cs.length);
    const pass = Fn(() => {
      cs.forEach((c, i) => out.element(i).assign(vec4(sprayPhaseNode(float(c)), 0.0, 0.0, 0.0)));
    })().compute(1) as ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    const worst = cs.reduce((m, c, i) => Math.max(m, Math.abs(g[i * 4] - sprayPhase(c)) / sprayPhase(c)), 0);
    return { pass: worst < 1e-4, detail: `worst relative error ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'spray: the TSL mist light matches mistLight.mistLightCpu (the sky\'s sun and irradiance read back)',
  async run(renderer) {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new Vector3(0.4, 0.7, 0.3).normalize(), 2); // a mid-morning sun: the LUTs' sun and sky are lit
    const cases = [
      { cosView: 0.99, nDotL: 0.5, sunVisibility: 1, isotropic: 0.3, ground: [0.05, 0.2, 0.18] },
      { cosView: 0, nDotL: -0.2, sunVisibility: 1, isotropic: 0.6, ground: [0, 0, 0] },
      { cosView: -0.7, nDotL: 1, sunVisibility: 0.3, isotropic: 0.5, ground: [0.1, 0.1, 0.1] },
    ];
    const outAttr = new StorageBufferAttribute(new Float32Array((cases.length + 2) * 4), 4);
    const out = storage(outAttr, 'vec4', cases.length + 2);
    const pass = Fn(() => {
      out.element(0).assign(vec4(sky.sunIlluminance, 0.0));
      out.element(1).assign(vec4(sky.skyIrradiance, 0.0));
      cases.forEach((c, i) => out.element(i + 2).assign(vec4(mistLightNode({ cosView: float(c.cosView), nDotL: float(c.nDotL), sunVisibility: float(c.sunVisibility), isotropic: float(c.isotropic), groundColour: vec3(...c.ground) }, sky), 0.0)));
    })().compute(1) as ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(outAttr));
    let worst = 0;
    cases.forEach((c, i) => {
      for (let ch = 0; ch < 3; ch++) {
        const cpu = mistLightCpu({ sunIlluminance: g[ch], skyIrradiance: g[4 + ch], cosView: c.cosView, nDotL: c.nDotL, sunVisibility: c.sunVisibility, isotropic: c.isotropic, groundTint: c.ground as [number, number, number] })[ch];
        worst = Math.max(worst, Math.abs(g[(i + 2) * 4 + ch] - cpu) / Math.max(Math.abs(cpu), 1e-6));
      }
    });
    return { pass: worst < 1e-4 && g[0] > 0 && g[4] > 0, detail: `worst relative error ${worst.toExponential(2)} (sun ${g[0].toFixed(3)}, sky ${g[4].toFixed(3)}: both lit)` };
  },
});
