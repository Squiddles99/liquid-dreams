import type { Rock } from '../beach/rocks';
import type { Plant } from '../heath/plants';
import { AudioEngine } from './AudioEngine';
import type { Point3 } from './hits';
import { NearbyCache } from './levels';
import { MUSIC_FILES } from './musicFiles';
import { type Deck, MusicPlayer, type Track, buildPlaylist, mediaDeck, musicStatusText } from './musicPlayer';
import { type SoundFrame, type SoundInput, SoundModel } from './soundModel';
import type { SoundParams } from './soundParams';

/** What the App hands over each frame: the model's input less what the sound system works out itself. */
export type SoundScene = Omit<SoundInput, 'realTime' | 'hidden' | 'plantDensity' | 'nearRocks'> & {
  plants: readonly Plant[];
  rocks: readonly Rock[];
};

export interface Listener {
  position: Point3;
  forward: Point3;
  up: Point3;
}

/** The audio pieces SoundSystem builds (the browser's by default; fakes in the tests). */
export interface SoundAudio {
  context(): Pick<AudioContext, 'state' | 'resume'> & { addEventListener(type: 'statechange', cb: () => void): void };
  engine(ctx: unknown): Pick<AudioEngine, 'apply' | 'setListener' | 'setVolumes' | 'setEffectsOn'> & { groups: { music: AudioNode } };
  deck(ctx: unknown, dest: AudioNode, url: string): Deck;
}

const BROWSER_AUDIO: SoundAudio = {
  context: () => new AudioContext({ latencyHint: 'interactive' }),
  engine: (ctx) => new AudioEngine(ctx as AudioContext),
  deck: (ctx, dest, url) => mediaDeck(ctx as AudioContext, dest, url),
};

const hidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * The game's sound (Phase 5): starts on the first click or key press (browsers allow audio only after a gesture), then
 * each frame runs the model, feeds the engine and ticks the music. A hidden tab fades the effects at once: the frame
 * loop stops there, but the audio thread doesn't (Review Focus 1).
 *
 * A key the browser doesn't count as a gesture (Alt, Esc, a lone modifier) leaves the context suspended (final review
 * I1): the hint and the listeners stay, every gesture retries, and nothing is scheduled or played until it runs.
 */
export class SoundSystem {
  readonly status = { track: 'click for sound' };
  /** Dev readouts: the last frame's sound and the update's CPU time (ms). */
  lastFrame: SoundFrame | null = null;
  lastUpdateMs = 0;
  private ctx: ReturnType<SoundAudio['context']> | null = null;
  private engine: ReturnType<SoundAudio['engine']> | null = null;
  private music: MusicPlayer | null = null;
  private running = false;
  private readonly model = new SoundModel();
  private readonly nearby = new NearbyCache();
  private disarm: (() => void) | null = null;
  private realTime = 0;

  constructor(
    private readonly params: SoundParams,
    private readonly playlist: readonly Track[] = buildPlaylist(MUSIC_FILES),
    private readonly audio: SoundAudio = BROWSER_AUDIO,
  ) {}

  /** The audio is actually running (not merely created and still suspended by the browser). */
  get started(): boolean {
    return this.running;
  }

  /** Show the hint and wait for a gesture the browser accepts. */
  arm(): void {
    const el = document.createElement('div');
    el.textContent = 'Click or press a key for sound';
    Object.assign(el.style, {
      position: 'fixed', left: '12px', bottom: '12px', padding: '4px 8px', font: '12px system-ui, sans-serif', color: '#fff',
      background: 'rgba(0, 0, 0, 0.45)', borderRadius: '4px', pointerEvents: 'none', zIndex: '10',
    });
    document.body.appendChild(el);
    const kinds = ['pointerdown', 'pointerup', 'click', 'keydown'] as const;
    for (const k of kinds) window.addEventListener(k, this.gesture, true);
    this.disarm = () => {
      for (const k of kinds) window.removeEventListener(k, this.gesture, true);
      el.remove();
    };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** A click or key press: create the audio on the first, then ask the browser to run it (again, until it does). */
  gesture = (): void => {
    if (this.running) return;
    if (!this.ctx) {
      const ctx = this.audio.context();
      const engine = this.audio.engine(ctx);
      this.ctx = ctx;
      this.engine = engine;
      this.music = new MusicPlayer(this.playlist, (url) => this.audio.deck(ctx, engine.groups.music, url));
      this.applyParams();
      ctx.addEventListener('statechange', () => this.checkRunning());
    }
    this.ctx.resume().then(() => this.checkRunning(), () => {});
    this.checkRunning();
  };

  private checkRunning(): void {
    if (this.running || this.ctx?.state !== 'running') return;
    this.running = true;
    this.disarm?.();
    this.disarm = null;
    this.engine?.setEffectsOn(!hidden());
    this.music?.play();
    this.syncStatus();
  }

  private onVisibility = (): void => {
    this.engine?.setEffectsOn(!hidden());
  };

  applyParams(): void {
    this.engine?.setVolumes(this.params);
  }

  toggleMute(): void {
    this.params.muted = !this.params.muted;
    this.applyParams();
  }

  toggleMusic(): void {
    this.music?.toggle();
    this.syncStatus();
  }

  nextTrack(): void {
    this.music?.next();
    this.syncStatus();
  }

  update(scene: SoundScene, listener: Listener, realDtS: number): void {
    this.realTime += realDtS;
    // Nothing is scheduled on a suspended context: its clock is frozen, so hits would pile up there unplayed.
    if (!this.running || !this.engine) return;
    const t0 = performance.now();
    const { plants, rocks, ...rest } = scene;
    const near = this.nearby.get(plants, rocks, scene.camera.x, scene.camera.z);
    const frame = this.model.step({ ...rest, realTime: this.realTime, hidden: hidden(), plantDensity: near.plantDensity, nearRocks: near.nearRocks });
    this.engine.setListener(listener.position, listener.forward, listener.up);
    this.engine.apply(frame);
    this.music?.update(realDtS);
    this.syncStatus();
    this.lastFrame = frame;
    this.lastUpdateMs = performance.now() - t0;
  }

  private syncStatus(): void {
    if (this.music) this.status.track = musicStatusText(this.music.status, this.music.trackIndex, this.playlist.length, this.music.trackTitle);
  }
}
