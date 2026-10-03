// src/frontend/frontEndCore.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
import { DEFAULT_CHOICES } from './frontSettings';
import { type FrontEndHost, FrontEndCore } from './frontEndCore';

function fakeHost(landReady = true) {
  const calls = { applied: 0, staged: 0, stagedNull: 0, paddled: [] as unknown[] };
  let ready = landReady;
  const host: FrontEndHost = {
    standSpot: () => (ready ? { x: 300, z: 50, headingDeg: 90 } : null),
    groundAt: (x) => (ready ? 20 + 0.01 * x : null),
    baseConditions: () => DEFAULT_CONDITIONS,
    applyConditions: () => { calls.applied++; },
    stage: (s) => { calls.staged++; if (!s) calls.stagedNull++; },
    paddleOut: (c) => { calls.paddled.push(c); },
  };
  return { host, calls, makeReady: () => { ready = true; } };
}
const opts = { today: new Date('2026-07-10T09:00:00+08:00'), seed: 1, calm: false, storage: null };

describe('the front end\'s core (spec §3, §6.10)', () => {
  it('holds a still frame, never throws, while the land and tracks aren\'t ready, then stages (Review Focus 3)', () => {
    const { host, calls, makeReady } = fakeHost(false);
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    expect(() => { for (let t = 0; t < 1000; t += 16) core.update(0.016, t); }).not.toThrow();
    expect(calls.staged - calls.stagedNull).toBe(0);
    makeReady();
    core.update(0.016, 1016);
    expect(calls.staged - calls.stagedNull).toBeGreaterThan(0);
  });
  it('applies the world\'s conditions once for a held Swell, after the release (Review Focus 4)', () => {
    const { host, calls } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    for (let k = 0; k < 5; k++) core.act('down', 0);
    const before = calls.applied;
    for (let t = 0; t <= 2000; t += 16) {
      if (t % 80 === 0) core.act('right', t);
      core.update(0.016, t);
    }
    expect(calls.applied - before).toBe(0);
    for (let t = 2016; t <= 2400; t += 16) core.update(0.016, t);
    expect(calls.applied - before).toBe(1);
  });
  it('puts the shown conditions into the world as it opens (the panel and the sky agree from the first frame)', () => {
    const { host, calls } = fakeHost();
    new FrontEndCore(host, DEFAULT_CHOICES, opts);
    expect(calls.applied).toBe(1);
  });
  it('paddles out on START with every remaining choice at its default', () => {
    const { host, calls } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    core.act('start', 0);
    for (let t = 0; t < 3000; t += 16) core.update(0.016, t);
    expect(calls.paddled.length).toBe(1);
    expect(calls.paddled[0]).toMatchObject({ rider: 'female' });
  });
  it('cues a focus tick, a value tick, the swing on a move, a line on a value change, and the haptic on confirm', () => {
    const { host } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, opts);
    expect(core.act('down', 0).sounds).toContain('focus');
    const v = core.act('right', 10);
    expect(v.sounds).toContain('value');
    expect(v.line?.text.length).toBeGreaterThan(3);
    const c = core.act('confirm', 20);
    expect(c.sounds).toContain('swing');
    expect(c.haptic).toBe(true);
  });
  it('remembers the choices on paddle out', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    const { host } = fakeHost();
    const core = new FrontEndCore(host, DEFAULT_CHOICES, { ...opts, storage });
    core.act('start', 0);
    for (let t = 0; t < 3000; t += 16) core.update(0.016, t);
    expect(store.get('liquid-dreams.front-choices.v1')).toContain('"rider":"female"');
  });
  it('sends every Conditions row to the world: month, time, sky, wind, swell, period, from and tide each change what the ocean, sky and light are built from (Andrew)', () => {
    const field: Record<string, (c: Conditions) => unknown> = {
      month: (c) => c.date, time: (c) => c.timeOfDay, sky: (c) => JSON.stringify(c.weather), wind: (c) => JSON.stringify(c.wind),
      swell: (c) => c.swell.sizeFt, period: (c) => c.swell.periodS, from: (c) => c.swell.directionDeg, tide: (c) => c.tideM,
    };
    for (const row of Object.keys(field)) {
      let last: Conditions | null = null;
      const { host } = fakeHost();
      const core = new FrontEndCore({ ...host, applyConditions: (c) => { last = c; } }, DEFAULT_CHOICES, opts);
      if (row === 'period') core.act('details', 0);
      for (let k = 0; k < 12 && core.state.rowFocus !== row; k++) core.act('down', 0);
      expect(core.state.rowFocus, row).toBe(row);
      const before = field[row](last!);
      const end = core.act('right', 10).events.some((e) => e.kind === 'end');
      if (end) core.act('left', 20);
      for (let t = 30; t <= 600; t += 16) core.update(0.016, t);
      expect(field[row](last!), `${row} reaches the world`).not.toEqual(before);
    }
  });
});
