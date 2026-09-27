import { uniform } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, MAX_ACTIVE_WAVES, wavesOfSet } from '../swell/sets';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { computeReefField } from './reefField';
import { SetWaves } from './SetWaves';
import { fieldBreakingHeight } from './setWaveModel';

describe('SetWaves active-wave count (the GPU skips all set-wave work at 0)', () => {
  const set = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);

  it('is 0 when constructed and in a lull', () => {
    const sets = new SetWaves(uniform(0));
    expect(sets.activeCount.value).toBe(0);
    sets.setEvents(set);
    sets.setEvents([]);
    expect(sets.activeCount.value).toBe(0);
  });

  it('counts the filled slots, capped at MAX_ACTIVE_WAVES', () => {
    expect(set.length).toBeGreaterThan(0);
    const sets = new SetWaves(uniform(0));
    sets.setEvents(set.slice(0, 1));
    expect(sets.activeCount.value).toBe(1);
    const many = Array.from({ length: MAX_ACTIVE_WAVES + 3 }, (_, i) => set[i % set.length]);
    sets.setEvents(many);
    expect(sets.activeCount.value).toBe(MAX_ACTIVE_WAVES);
  });
});

describe('SetWaves "can break" flags (the GPU skips the crest search and breaking for a flagged-0 wave)', () => {
  it('flags a wave above 0.98 × the field breaking height, and follows the field and the params', { timeout: 30_000 }, () => {
    const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
    const hb = fieldBreakingHeight(field, DEFAULT_BREAK_PARAMS);
    const set = wavesOfSet(1, DEFAULT_CONDITIONS, DEFAULT_SET_PARAMS);
    const big = { ...set[0], heightM: 1.5 * hb }, small = { ...set[0], heightM: 0.95 * hb };
    const sets = new SetWaves(uniform(0));
    sets.setEvents([big, small]);
    expect([sets.canBreakFlag(0), sets.canBreakFlag(1)]).toEqual([0, 0]); // no field yet: nothing breaks
    sets.setField(field);
    expect([sets.canBreakFlag(0), sets.canBreakFlag(1), sets.canBreakFlag(2)]).toEqual([1, 0, 0]);
    // A lower breaker index lowers the field's breaking height: the smaller wave can break too.
    sets.setBreakParams({ ...DEFAULT_BREAK_PARAMS, gamma: 0.5 });
    expect([sets.canBreakFlag(0), sets.canBreakFlag(1)]).toEqual([1, 1]);
  });
});
