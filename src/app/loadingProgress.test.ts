import { describe, expect, it } from 'vitest';
import { BarFollower, BootProgress, STAGES, bootReady, creep } from './loadingProgress';

describe('STAGES', () => {
  it('runs gpu, world, reef, heath, crew, with weights summing to 1', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['gpu', 'world', 'reef', 'heath', 'crew']);
    expect(STAGES.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 9);
    expect(STAGES.map((s) => s.line)).toEqual(['Waking the GPU…', 'Swell rolling in…', 'Laying the reef…', 'Growing the heath…', 'Waking the crew…']);
  });
});

describe('creep', () => {
  it('starts at 0, reaches about 90% at the expected duration, never reaches the end', () => {
    expect(creep(0, 1000)).toBe(0);
    expect(creep(1000, 1000)).toBeGreaterThan(0.88);
    expect(creep(1000, 1000)).toBeLessThan(0.92);
    expect(creep(1e9, 1000)).toBeLessThan(0.951);
  });
});

describe('BootProgress', () => {
  it('creeps within the current stage but never passes its mark before it ends', () => {
    const p = new BootProgress(0), gpu = STAGES[0].weight;
    expect(p.target(0)).toBe(0);
    expect(p.target(STAGES[0].expectedMs)).toBeGreaterThan(0.85 * gpu);
    expect(p.target(1e9)).toBeLessThan(gpu);
  });
  it('jumps to the mark when a stage ends, and the next stage creeps from there', () => {
    const p = new BootProgress(0), gpu = STAGES[0].weight;
    p.done('gpu', 300);
    expect(p.target(300)).toBeCloseTo(gpu, 9);
    expect(p.current?.id).toBe('world');
    expect(p.target(800)).toBeGreaterThan(gpu);
  });
  it('adds up stages that finish out of order (the land and the crew load alongside)', () => {
    const p = new BootProgress(0);
    p.done('heath', 100);
    const heath = STAGES.find((s) => s.id === 'heath')!.weight;
    expect(p.target(100)).toBeGreaterThanOrEqual(heath);
    expect(p.current?.id).toBe('gpu');
    for (const s of STAGES) p.done(s.id, 200);
    expect(p.allDone).toBe(true);
    expect(p.current).toBeNull();
    expect(p.target(200)).toBeCloseTo(1, 9);
  });
  it('never goes down as time passes and stages end', () => {
    const p = new BootProgress(0);
    let last = 0;
    for (let t = 0; t < 12000; t += 16) {
      if (t === 400) p.done('gpu', t);
      if (t === 2000) p.done('world', t);
      if (t === 2496) p.done('heath', t);
      if (t === 5008) p.done('reef', t);
      if (t === 8992) p.done('crew', t);
      const v = p.target(t);
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      last = v;
    }
  });
  it('ignores a stage reported done twice', () => {
    const p = new BootProgress(0);
    p.done('gpu', 100);
    p.done('gpu', 900);
    expect(p.target(100)).toBeCloseTo(STAGES[0].weight, 9);
  });
});

describe('BarFollower', () => {
  it('catches up to a jump within 250 ms', () => {
    const f = new BarFollower();
    for (let t = 0; t < 250; t += 16) f.step(0.6, 16);
    expect(f.shown).toBeGreaterThan(0.59);
  });
  it('never moves backwards', () => {
    const f = new BarFollower();
    f.step(0.5, 1000);
    const before = f.shown;
    f.step(0.2, 16);
    expect(f.shown).toBe(before);
  });
});

describe('bootReady', () => {
  const base = { land: true, kit: true, layers: true, frontEnd: true, landUsable: true, crewIn: false };
  it('the heath waits for the land, the kit and the ground layers', () => {
    expect(bootReady({ ...base, kit: false }).heath).toBe(false);
    expect(bootReady(base).heath).toBe(true);
  });
  it('the crew waits for the heath and the crew on the stand spot', () => {
    expect(bootReady(base).crew).toBe(false);
    expect(bootReady({ ...base, crewIn: true }).crew).toBe(true);
    expect(bootReady({ ...base, crewIn: true, layers: false }).crew).toBe(false);
  });
  it('nothing waits for a crew when there is no front end (a moment link, ?frontend=off)', () => {
    expect(bootReady({ ...base, frontEnd: false }).crew).toBe(true);
  });
  it('nothing waits for a crew that cannot appear: the land failed, so there is no stand spot (the bar never hangs)', () => {
    expect(bootReady({ ...base, landUsable: false }).crew).toBe(true);
  });
});
