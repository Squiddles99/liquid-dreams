import { describe, expect, it } from 'vitest';
import { SoundSystem } from './SoundSystem';
import { DEFAULT_SOUND_PARAMS } from './soundParams';

const scene = {
  simTime: 1, paused: false, camera: { x: 0, y: 1, z: 0, mode: 'lineup' as const }, underwater: false, windSpeedMs: 3, tideM: 0,
  ticks: [], bursts: [], bombieSize: 1, surf: null, waterlineX: 190, waterY: 0, plants: [], rocks: [],
};
const listener = { position: { x: 0, y: 1, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };

describe('SoundSystem before the first gesture', () => {
  it('stays silent without throwing, and says how to start it', () => {
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, []);
    expect(() => s.update(scene, listener, 0.016)).not.toThrow();
    expect(s.started).toBe(false);
    expect(s.lastFrame).toBeNull();
    expect(s.status.track).toBe('click for sound');
  });
  it('M still toggles the saved mute', () => {
    const p = { ...DEFAULT_SOUND_PARAMS };
    const s = new SoundSystem(p, []);
    s.toggleMute();
    expect(p.muted).toBe(true);
    s.toggleMute();
    expect(p.muted).toBe(false);
  });
});
