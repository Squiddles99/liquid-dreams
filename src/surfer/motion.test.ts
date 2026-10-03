import { describe, expect, it } from 'vitest';
import { syntheticRiderClips } from './clipFixture';
import { chooseMotion, clipTime } from './motion';
import { referenceSkeleton } from './rig';

const rc = syntheticRiderClips(referenceSkeleton(1.7));

describe('code or clip (clip slice spec §4.2)', () => {
  it('uses the code pose unless asked, and says why when a clip can’t play', () => {
    expect(chooseMotion('code', 'trim', { clips: rc }, 'regular')).toMatchObject({ use: 'code', status: 'code' });
    expect(chooseMotion('clip', 'trim', null, 'regular')).toMatchObject({ use: 'code', status: 'clip: loading' });
    expect(chooseMotion('clip', 'trim', { clips: null }, 'regular')).toMatchObject({ use: 'code', status: 'clip: not built' });
    expect(chooseMotion('clip', 'paddle', { clips: rc }, 'regular')).toMatchObject({ use: 'code', status: 'clip: none for this pose' });
  });
  it('plays the stance’s clip when one is loaded for the pose', () => {
    const r = chooseMotion('clip', 'trim', { clips: rc }, 'goofy');
    expect(r.use).toBe('clip');
    expect(r.status).toBe('clip: ready');
    expect(r.clip!.noseSide).toBe('right');
    expect(r.rc).toBe(rc);
  });
  it('runs on the sim clock when playing, else from the phase slider (a paused capture holds still)', () => {
    expect(clipTime(true, 12.5, 0.3, 2)).toBe(12.5);
    expect(clipTime(false, 12.5, 0.3, 2)).toBeCloseTo(0.6, 12);
  });
});
