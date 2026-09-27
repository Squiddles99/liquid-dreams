import type * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { FoamSchedule } from './foamStep';
import { SprayParticles } from './SprayParticles';
import { SPRAY_POOL, type SprayBirth, sprayReplayTicks } from './sprayEmitters';
import { SprayPool, birthInto, liveSlots, stepPool } from './sprayStep';

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

registerSelfTest({
  name: 'spray: the GPU birth and step match the CPU reference over a replay',
  async run(renderer) {
    const spray = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    spray.setWind(...WIND);
    const t = 12;
    spray.advance(renderer, t, birthsAt);
    const g = await read(renderer, spray);
    const cpu = new SprayPool();
    const plan = new FoamSchedule().planTicks(t, sprayReplayTicks(2));
    for (const k of plan.ticks) { birthInto(cpu, k, birthsAt(k)); stepPool(cpu, ...WIND); }
    const live = liveSlots(cpu);
    let worst = 0, liveGpu = 0;
    for (let s = 0; s < SPRAY_POOL; s++) if (g.pos[s * 4 + 3] < g.vel[s * 4 + 3]) liveGpu++;
    for (const s of live) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(g.pos[s * 4 + c] - cpu.posAge[s * 4 + c]), Math.abs(g.vel[s * 4 + c] - cpu.velLife[s * 4 + c]));
    return { pass: worst < 1e-3 && liveGpu === live.length && live.length > 50, detail: `${live.length} live (GPU ${liveGpu}); worst |GPU − CPU| ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'spray: a GPU replay matches GPU live stepping exactly (fixed slots per tick)',
  async run(renderer) {
    const live = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
    live.setWind(...WIND);
    for (let f = 0; f <= 240; f++) live.advance(renderer, 6 + f / 60, birthsAt);
    const a = await read(renderer, live);
    const replay = new SprayParticles(new Sky(DEFAULT_ATMOSPHERE));
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
