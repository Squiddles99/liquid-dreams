import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { surferFeetToHs } from '../conditions/units';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { decodeMoment, encodeMoment } from './momentLink';
import { DEFAULT_MOMENT_NAME, REFERENCE_MOMENTS, defaultMoment, findReferenceMoment, referenceKind } from './referenceMoments';

describe('reference moments', () => {
  it('have unique names', () => {
    const names = REFERENCE_MOMENTS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('include every moment named in the spec', () => {
    expect(REFERENCE_MOMENTS.map((r) => r.name)).toEqual([
      'pre-dawn', 'first-sun', 'morning-offshore', 'late-morning', 'noon-deep-blue',
      'autumn-glass', 'golden-hour', 'sunset', 'overview',
      'set-arriving', 'set-on-the-reef', 'low-tide-set', 'high-tide-set', 'looking-down', 'reef-overhead',
      'barrel-peeling', 'closeout-right', 'the-drain',
    ]);
  });
  it('round-trip through moment links', () => {
    for (const r of REFERENCE_MOMENTS) expect(decodeMoment(encodeMoment(r.moment))).toEqual(r.moment);
  });
  it('are paused for reproducible screenshots', () => {
    for (const r of REFERENCE_MOMENTS) expect(r.moment.paused).toBe(true);
  });
  it('default moment uses the default conditions', () => {
    expect(DEFAULT_MOMENT_NAME).toBe('morning-offshore');
    expect(defaultMoment().conditions).toEqual(DEFAULT_CONDITIONS);
    expect(defaultMoment().paused).toBe(false);
  });
  it('autumn-glass has no wind', () => {
    expect(findReferenceMoment('autumn-glass')?.conditions.wind.speedMs).toBe(0);
  });
  it('findReferenceMoment returns independent copies', () => {
    const a = findReferenceMoment('sunset');
    a!.conditions.swell.sizeFt = 11;
    expect(findReferenceMoment('sunset')!.conditions.swell.sizeFt).toBe(4);
  });
});

describe('reference moment kinds', () => {
  it('every moment has a kind', () => {
    for (const r of REFERENCE_MOMENTS) expect(['time', 'view', 'set']).toContain(r.kind);
  });
  it('the set and tide moments are set-kind', () => {
    for (const name of ['set-arriving', 'set-on-the-reef', 'low-tide-set', 'high-tide-set']) {
      expect(REFERENCE_MOMENTS.find((r) => r.name === name)!.kind).toBe('set');
      expect(referenceKind(name)).toBe('set');
    }
  });
  it('overview, reef-overhead and looking-down are view-kind', () => {
    for (const name of ['overview', 'reef-overhead', 'looking-down']) {
      expect(REFERENCE_MOMENTS.find((r) => r.name === name)!.kind).toBe('view');
      expect(referenceKind(name)).toBe('view');
    }
  });
  it('the rest are time-kind', () => {
    const viewOrSet = new Set([
      'set-arriving', 'set-on-the-reef', 'low-tide-set', 'high-tide-set', 'overview', 'reef-overhead', 'looking-down',
      'barrel-peeling', 'closeout-right', 'the-drain',
    ]);
    for (const r of REFERENCE_MOMENTS.filter((m) => !viewOrSet.has(m.name))) {
      expect(r.kind).toBe('time');
      expect(referenceKind(r.name)).toBe('time');
    }
  });
  it('falls back to time for an unrecognised name', () => {
    expect(referenceKind('not-a-moment')).toBe('time');
  });
});

describe('set and reef moments', () => {
  it('lands on a real set: arriving before the biggest wave reaches the ledge', () => {
    const arriving = findReferenceMoment('set-arriving')!, onReef = findReferenceMoment('set-on-the-reef')!;
    expect(arriving.simTime).toBeGreaterThan(0);
    expect(onReef.simTime).toBeGreaterThan(arriving.simTime);
    expect(onReef.paused).toBe(true);
  });
  it('compares the same wave at low and high tide, from the same drone camera as set-on-the-reef', () => {
    const onReef = findReferenceMoment('set-on-the-reef')!;
    const low = findReferenceMoment('low-tide-set')!, high = findReferenceMoment('high-tide-set')!;
    expect(low.conditions.tideM).toBe(-0.5);
    expect(high.conditions.tideM).toBe(0.5);
    expect(low.simTime).toBe(high.simTime);
    expect(low.simTime).toBe(onReef.simTime);
    // set-on-the-reef, low-tide-set and high-tide-set all share one free, drone-height camera.
    for (const m of [onReef, low, high]) {
      expect(m.camera.mode).toBe('free');
      expect(m.camera.position[1]).toBeGreaterThan(10);
      expect(m.camera).toEqual(onReef.camera);
    }
  });
  it('puts the overhead view in free flight above the reef', () => {
    const m = findReferenceMoment('reef-overhead')!;
    expect(m.camera.mode).toBe('free');
    expect(m.camera.position[1]).toBeGreaterThan(40);
  });
});

describe('breaking moments', () => {
  const refSet = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
  const biggest = refSet.reduce((a, b) => (b.heightM > a.heightM ? b : a));
  it('are set moments timed from the reference set’s biggest wave', () => {
    for (const name of ['barrel-peeling', 'closeout-right', 'the-drain']) expect(referenceKind(name)).toBe('set');
    expect(findReferenceMoment('the-drain')!.simTime).toBeCloseTo(biggest.arrivalS, 9);
    expect(findReferenceMoment('closeout-right')!.simTime).toBeCloseTo(biggest.arrivalS + 0.5, 9);
    expect(findReferenceMoment('barrel-peeling')!.simTime).toBeCloseTo(biggest.arrivalS + 2, 9);
  });
  it('barrel-peeling is shot at 5 ft: the same set on the same timeline, its biggest wave at the top set factor for 4 ft', () => {
    const m = findReferenceMoment('barrel-peeling')!;
    expect(m.conditions.swell.sizeFt).toBe(5);
    const at5 = wavesOfSet(1, m.conditions, DEFAULT_SET_PARAMS);
    expect(at5.map((w) => w.arrivalS)).toEqual(refSet.map((w) => w.arrivalS));
    expect(Math.max(...at5.map((w) => w.heightM))).toBeGreaterThanOrEqual(1.8 * surferFeetToHs(4));
  });
  it('the drone shots fly; the drain is seen from the water', () => {
    expect(findReferenceMoment('barrel-peeling')!.camera.mode).toBe('free');
    expect(findReferenceMoment('closeout-right')!.camera.mode).toBe('free');
    expect(findReferenceMoment('the-drain')!.camera.mode).toBe('lineup');
  });
});
