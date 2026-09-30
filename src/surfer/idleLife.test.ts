import { describe, expect, it } from 'vitest';
import { FACE_CHANNELS, type FaceState, IdleLife, type IdleContext, MOODS } from './idleLife';

const DT = 1 / 60;
const REST: IdleContext = { still: true, exertionTarget: 0, onLand: false, sunFacing: 0 };

function run(life: IdleLife, seconds: number, ctx: IdleContext = REST): FaceState[] {
  const out: FaceState[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) out.push(life.tick(DT, ctx));
  return out;
}

/** Each run of frames where f(state) holds, as [start frame, length]. */
function spans(states: FaceState[], f: (s: FaceState) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  states.forEach((s, i) => {
    if (f(s) && start < 0) start = i;
    if (!f(s) && start >= 0) {
      out.push([start, i - start]);
      start = -1;
    }
  });
  return out;
}

describe('IdleLife', () => {
  it('blinks every 2–6 s (a few doubles), each closure brief, both eyes together', () => {
    const states = run(new IdleLife(7, MOODS.female), 600);
    const closures = spans(states, (s) => s.blinkL > 0.5);
    expect(closures.length).toBeGreaterThan(600 / 6);
    expect(closures.length).toBeLessThan((600 / 2) * 1.2);
    for (const [, n] of closures) {
      expect(n * DT).toBeGreaterThan(0.03);
      expect(n * DT).toBeLessThan(0.2);
    }
    for (const s of states) expect(s.blinkL).toBe(s.blinkR);
  });

  it('is repeatable: the same seed gives the same face', () => {
    const a = run(new IdleLife(3, MOODS.male), 30), b = run(new IdleLife(3, MOODS.male), 30);
    expect(a).toEqual(b);
    const c = run(new IdleLife(4, MOODS.male), 30);
    expect(c).not.toEqual(a);
  });

  it('keeps the eyes near the look target and the head still unless the pose is still', () => {
    const life = new IdleLife(11, MOODS.grommet);
    for (const s of run(life, 120)) {
      expect(Math.abs(s.gazeYawDeg)).toBeLessThanOrEqual(8 + 1e-9);
      expect(Math.abs(s.gazePitchDeg)).toBeLessThanOrEqual(5 + 1e-9);
      expect(Math.abs(s.headYawDeg)).toBeLessThanOrEqual(20 + 1e-9);
      expect(Math.abs(s.headPitchDeg)).toBeLessThanOrEqual(8 + 1e-9);
    }
    const riding = run(life, 20, { ...REST, still: false });
    for (const s of riding) {
      expect(s.headYawDeg).toBe(0);
      expect(s.headPitchDeg).toBe(0);
    }
    // Still, the head does look around.
    const sitting = run(new IdleLife(11, MOODS.grommet), 60);
    expect(Math.max(...sitting.map((s) => Math.abs(s.headYawDeg)))).toBeGreaterThan(3);
  });

  it('breathes ~14 a minute at rest, faster and deeper after exertion, and recovers', () => {
    const breaths = (states: FaceState[]): number => spans(states, (s) => s.breathe > 0.25).length;
    const life = new IdleLife(5, MOODS.female);
    run(life, 30);
    const rest = run(life, 60);
    expect(breaths(rest)).toBeGreaterThanOrEqual(12);
    expect(breaths(rest)).toBeLessThanOrEqual(16);
    run(life, 30, { ...REST, still: false, exertionTarget: 1 });
    const hard = run(life, 60, { ...REST, still: false, exertionTarget: 1 });
    expect(breaths(hard)).toBeGreaterThanOrEqual(24);
    expect(Math.max(...hard.map((s) => s.breathe))).toBeGreaterThan(Math.max(...rest.map((s) => s.breathe)));
    expect(Math.max(...hard.map((s) => s.jawOpen))).toBeGreaterThan(Math.max(...rest.map((s) => s.jawOpen)));
    run(life, 40);
    expect(life.exertion).toBeLessThan(0.3);
  });

  it('keeps every channel in [0, 1], smiles by mood, squints into the sun', () => {
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const smiles: Record<string, number> = {};
    for (const name of ['female', 'male', 'grommet'] as const) {
      const states = run(new IdleLife(9, MOODS[name]), 120);
      for (const s of states) for (const c of FACE_CHANNELS) {
        expect(s[c]).toBeGreaterThanOrEqual(0);
        expect(s[c]).toBeLessThanOrEqual(1);
      }
      smiles[name] = mean(states.map((s) => s.smile));
    }
    expect(smiles.grommet).toBeGreaterThan(smiles.female);
    expect(smiles.female).toBeGreaterThan(smiles.male);
    const shade = mean(run(new IdleLife(2, MOODS.female), 5).map((s) => s.squint));
    const glare = mean(run(new IdleLife(2, MOODS.female), 5, { ...REST, sunFacing: 1 }).map((s) => s.squint));
    expect(glare).toBeGreaterThan(shade + 0.3);
  });
});
