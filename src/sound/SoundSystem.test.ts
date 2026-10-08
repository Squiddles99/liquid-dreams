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

/** A context the browser keeps suspended until `allow()` (a key it doesn't count as a gesture, then a real one). */
class FakeContext {
  state: AudioContextState = 'suspended';
  resumes = 0;
  private readonly listeners: (() => void)[] = [];
  resume(): Promise<void> { this.resumes++; return Promise.resolve(); }
  addEventListener(_type: 'statechange', cb: () => void): void { this.listeners.push(cb); }
  allow(): void { this.state = 'running'; this.listeners.forEach((f) => f()); }
}

function fakeAudio() {
  const ctx = new FakeContext();
  const applied: unknown[] = [];
  const decks: string[] = [];
  const audio = {
    context: () => ctx,
    engine: () => ({ apply: (f: unknown) => { applied.push(f); }, setListener: () => {}, setVolumes: () => {}, setEffectsOn: () => {}, groups: { music: {} as AudioNode, ui: {} as AudioNode } }),
    deck: (_ctx: unknown, _dest: AudioNode, url: string) => {
      decks.push(url);
      return { play: () => Promise.resolve(), pause: () => {}, fade: () => {}, remainingS: () => 200, onEnded: () => {}, onError: () => {}, dispose: () => {} };
    },
  };
  return { ctx, applied, decks, audio };
}

describe('SoundSystem and the browser’s autoplay rule (final review I1)', () => {
  const tracks = [{ album: 'a', number: 1, title: 'One', url: 'u1' }];
  it('a gesture the browser does not count leaves it waiting: nothing applied, no music, still asking for a click', () => {
    const { ctx, applied, decks, audio } = fakeAudio();
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, tracks, audio);
    s.gesture();
    s.update(scene, listener, 0.016);
    expect(ctx.state).toBe('suspended');
    expect(s.started).toBe(false);
    expect(applied).toHaveLength(0);
    expect(decks).toHaveLength(0);
    expect(s.status.track).toBe('click for sound');
  });
  it('the next gesture retries on the same context, and once it runs the sound and the album start', () => {
    const { ctx, applied, decks, audio } = fakeAudio();
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, tracks, audio);
    s.gesture();
    s.gesture();
    expect(ctx.resumes).toBe(2);
    ctx.allow();
    expect(s.started).toBe(true);
    s.update(scene, listener, 0.016);
    expect(applied).toHaveLength(1);
    expect(decks).toEqual(['u1']);
    expect(s.status.track).toBe('▶ 1/1 One');
  });
});

describe('the front end\'s music slot (spec §12)', () => {
  it('pauses the playlist while the front end is open (no front-end track ships), and plays it again after', () => {
    const { ctx, audio } = fakeAudio();
    const tracks = [{ album: 'a', number: 1, title: 'One', url: 'u1' }];
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, tracks, audio);
    s.gesture();
    ctx.allow();
    s.update(scene, listener, 0.016);
    s.setFrontEndMusic(true);
    expect(s.status.track).not.toBe('click for sound');
    expect((s as unknown as { frontEndMusic: boolean }).frontEndMusic).toBe(true);
    s.setFrontEndMusic(false);
    expect((s as unknown as { frontEndMusic: boolean }).frontEndMusic).toBe(false);
  });
  it('plays its own song on the menus, even when the sound starts there, and the album once they close', () => {
    const { ctx, audio } = fakeAudio(), playing = new Map<string, boolean>();
    const deck = audio.deck;
    audio.deck = (c, d, url) => {
      const k = deck(c, d, url);
      return { ...k, play: () => { playing.set(url, true); return Promise.resolve(); }, pause: () => { playing.set(url, false); } };
    };
    const album = [{ album: 'a', number: 1, title: 'One', url: 'album' }], menus = [{ album: 'front-end', number: null, title: 'Ambient Dreamtime', url: 'menus' }];
    const s = new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, album, audio, menus);
    s.setFrontEndMusic(true); // the game boots into the menus, before the first click
    s.gesture();
    ctx.allow();
    expect(playing.get('menus')).toBe(true);
    expect(playing.get('album')).toBeUndefined();
    s.setFrontEndMusic(false); // paddling out
    expect(playing.get('menus')).toBe(false);
    expect(playing.get('album')).toBe(true);
    s.setFrontEndMusic(true); // back to the dune
    expect(playing.get('menus')).toBe(true);
  });
  it('has no UI output until the audio runs', () => {
    expect(new SoundSystem({ ...DEFAULT_SOUND_PARAMS }, []).uiOut()).toBeNull();
  });
});
