import { describe, expect, it } from 'vitest';
import { NO_KEYS } from './movement';
import { LINEUP, initialLineupState, stepLineup } from './lineup';

describe('lineup camera', () => {
  it('starts at eye height above the water', () => {
    expect(initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0.5).height.value).toBeCloseTo(0.5 + LINEUP.eyeHeightM);
  });
  it('rides up and down with the water', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    for (let i = 0; i < 240; i++) s = stepLineup(s, NO_KEYS, 1.2, 1 / 60);
    expect(s.height.value).toBeCloseTo(1.2 + LINEUP.eyeHeightM, 2);
  });
  it('holding Space rises for a better view', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    for (let i = 0; i < 240; i++) s = stepLineup(s, { ...NO_KEYS, rise: true }, 0, 1 / 60);
    expect(s.height.value).toBeCloseTo(LINEUP.eyeHeightM + LINEUP.riseHeightM, 2);
  });
  it('drifts slowly at paddling pace', () => {
    let s = initialLineupState(0, 0, { yawDeg: 270, pitchDeg: 0 }, 0);
    s = stepLineup(s, { ...NO_KEYS, forward: true }, 0, 1);
    expect(s.x).toBeCloseTo(-LINEUP.driftSpeedMs);
    expect(s.z).toBeCloseTo(0);
  });
});
