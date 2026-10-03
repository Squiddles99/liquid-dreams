// src/frontend/conditionsGate.test.ts
import { describe, expect, it } from 'vitest';
import { ConditionsGate } from './conditionsGate';

describe('the conditions gate (spec §6.10; Review Focus 4: a held key repeating)', () => {
  it('applies 200 ms after the last change, once', () => {
    const g = new ConditionsGate();
    g.edit(0);
    expect(g.due(150)).toBe(false);
    expect(g.due(200)).toBe(true);
    expect(g.due(400)).toBe(false);
  });
  it('never applies once per repeat: a key held 3 s at 80 ms repeats applies once, after the release', () => {
    const g = new ConditionsGate();
    let applies = 0;
    for (let t = 0; t <= 3000; t += 16) {
      if (t % 80 === 0) g.edit(t);
      if (g.due(t)) applies++;
    }
    expect(applies).toBe(0);
    for (let t = 3016; t <= 3400; t += 16) if (g.due(t)) applies++;
    expect(applies).toBe(1);
  });
  it('waits while the key is still pushing at the end of the range, and a lone end bump applies nothing', () => {
    const g = new ConditionsGate();
    g.edit(0);
    g.hold(150);
    expect(g.due(250)).toBe(false);
    expect(g.due(350)).toBe(true);
    g.hold(400);
    expect(g.due(800)).toBe(false);
  });
  it('keeps two applies at least 200 ms apart', () => {
    const g = new ConditionsGate();
    const at: number[] = [];
    for (const e of [0, 250, 460, 900]) {
      g.edit(e);
      for (let t = e; t < e + 400; t += 10) if (g.due(t)) { at.push(t); break; }
    }
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(200);
  });
});
