import { uniform } from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS } from '../conditions/defaults';
import { DEFAULT_SET_PARAMS, MAX_ACTIVE_WAVES, wavesOfSet } from '../swell/sets';
import { SetWaves } from './SetWaves';

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
