import { describe, expect, it } from 'vitest';
import { SURF_NZ, buildHeights, waterEdgeOffset } from '../surf/surfModel';
import type { ImpactEmitter } from '../whitewater/sprayEmitters';
import { type SoundInput, SoundModel } from './soundModel';

const imp = (waveId: number, arc: number, x: number, z: number, H = 2.5): ImpactEmitter => ({ x, y: 0, z, vx: 0, vz: 0, nx: 1, nz: 0, H, strength: 1, lip: 1, waveId, arc });
const base = (over: Partial<SoundInput> = {}): SoundInput => ({
  simTime: 0, realTime: 0, paused: false, hidden: false, camera: { x: 0, y: 1, z: 0, mode: 'lineup' }, underwater: false,
  windSpeedMs: 3, tideM: 0, ticks: [], bursts: [], bombieSize: 1, surf: null, waterlineX: 190, waterY: 0, plantDensity: 0, nearRocks: false, ...over,
});

describe('SoundModel', () => {
  it('a landing lip: one hit, and a roar on it that holds between ticks and hisses away over about 6 s', () => {
    const m = new SoundModel();
    const lip = [imp(1, 0, 30, 10), imp(1, 1, 33, 10)];
    let hits = 0;
    let f = m.step(base());
    for (let j = 0; j <= 60; j++) {
      const t = j / 60;
      f = m.step(base({ simTime: t, realTime: t, ticks: j % 3 === 0 ? [{ k: j / 3, t, impact: lip }] : [] }));
      hits += f.hits.length;
    }
    expect(hits).toBe(1);
    const peak = f.roar.level;
    expect(peak).toBeGreaterThan(0.8);
    expect(f.roar.x).toBeCloseTo(31.5, 1);
    for (let j = 1; j <= 360; j++) {
      const t = 1 + j / 60;
      f = m.step(base({ simTime: t, realTime: t, ticks: j % 3 === 0 ? [{ k: 20 + j / 3, t, impact: [] }] : [] }));
      if (j === 60) expect(f.roar.level).toBeGreaterThan(0.3 * peak);
    }
    expect(f.roar.level).toBeLessThan(0.1 * peak);
    expect(f.roar.brightness).toBeLessThan(0.2);
  });
  it('the lineup laps (livelier as the water moves); the beach swashes instead', () => {
    const m = new SoundModel();
    m.step(base({ simTime: 0, waterY: 0 }));
    const moving = m.step(base({ simTime: 0.1, waterY: 0.08 }));
    expect(moving.lapping.level).toBeGreaterThan(0.5);
    expect(moving.swash.level).toBe(0);
    const s = { tau: new Float32Array(SURF_NZ), table: buildHeights({ lo: 0, hi: 200 }, 10, 1.5, [], 1), periodS: 10, enabled: true, edgeM: waterEdgeOffset(0) };
    const beach = new SoundModel();
    let most = 0;
    for (let t = 40; t < 50; t += 0.1) {
      const f = beach.step(base({ simTime: t, camera: { x: 192, y: 2, z: 0, mode: 'walk' }, surf: s, waterY: 0 }));
      expect(f.lapping.level).toBe(0);
      most = Math.max(most, f.swash.level);
    }
    expect(most).toBeGreaterThan(0.2);
  });
  it('paused or hidden: the effects go off; underwater passes through', () => {
    const m = new SoundModel();
    expect(m.step(base()).effectsOn).toBe(true);
    expect(m.step(base({ paused: true })).effectsOn).toBe(false);
    expect(m.step(base({ hidden: true })).effectsOn).toBe(false);
    expect(m.step(base({ underwater: true })).underwater).toBe(true);
  });
  it('wind is silent when calm; scrub only on foot among plants', () => {
    const m = new SoundModel();
    expect(m.step(base({ windSpeedMs: 0 })).wind.level).toBe(0);
    expect(m.step(base({ windSpeedMs: 10, plantDensity: 1 })).scrub).toBe(0);
    expect(m.step(base({ windSpeedMs: 10, plantDensity: 1, camera: { x: 250, y: 20, z: 0, mode: 'walk' } })).scrub).toBeGreaterThan(0.2);
  });
  it('costs well under 0.2 ms a step on a busy frame', () => {
    const m = new SoundModel();
    const s = { tau: new Float32Array(SURF_NZ), table: buildHeights({ lo: 0, hi: 200 }, 10, 1.5, [], 1), periodS: 10, enabled: true, edgeM: waterEdgeOffset(0) };
    const lip = Array.from({ length: 30 }, (_, a) => imp(1, a, 3 * a, 0));
    const steps = 2000, t0 = performance.now();
    for (let j = 0; j < steps; j++) {
      const t = j / 60;
      m.step(base({ simTime: t, realTime: t, surf: s, camera: { x: 192, y: 2, z: 0, mode: 'walk' }, ticks: [{ k: j, t, impact: lip }], bursts: [{ n: 1, ageS: 3, heightM: 3 }] }));
    }
    expect((performance.now() - t0) / steps).toBeLessThan(0.2);
  });
});
