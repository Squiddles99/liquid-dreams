import type { Rock } from '../beach/rocks';
import type { Plant } from '../heath/plants';
import { AudioEngine } from './AudioEngine';
import type { Point3 } from './hits';
import { NearbyCache } from './levels';
import { MUSIC_FILES } from './musicFiles';
import { MusicPlayer, type Track, buildPlaylist, mediaDeck, musicStatusText } from './musicPlayer';
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

/**
 * The game's sound (Phase 5): starts on the first click or key press (browsers allow audio only after a gesture), then
 * each frame runs the model, feeds the engine and ticks the music. A hidden tab fades the effects at once: the frame
 * loop stops there, but the audio thread doesn't (Review Focus 1).
 */
export class SoundSystem {
  readonly status = { track: 'click for sound' };
  /** Dev readouts: the last frame's sound and the update's CPU time (ms). */
  lastFrame: SoundFrame | null = null;
  lastUpdateMs = 0;
  private engine: AudioEngine | null = null;
  private music: MusicPlayer | null = null;
  private readonly model = new SoundModel();
  private readonly nearby = new NearbyCache();
  private hint: HTMLElement | null = null;
  private realTime = 0;

  constructor(private readonly params: SoundParams, private readonly playlist: readonly Track[] = buildPlaylist(MUSIC_FILES)) {}

  get started(): boolean {
    return this.engine !== null;
  }

  /** Show the hint and wait for the first gesture. */
  arm(): void {
    const el = document.createElement('div');
    el.textContent = 'Click or press a key for sound';
    Object.assign(el.style, {
      position: 'fixed', left: '12px', bottom: '12px', padding: '4px 8px', font: '12px system-ui, sans-serif', color: '#fff',
      background: 'rgba(0, 0, 0, 0.45)', borderRadius: '4px', pointerEvents: 'none', zIndex: '10',
    });
    document.body.appendChild(el);
    this.hint = el;
    window.addEventListener('pointerdown', this.start, true);
    window.addEventListener('keydown', this.start, true);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private start = (): void => {
    if (this.engine) return;
    window.removeEventListener('pointerdown', this.start, true);
    window.removeEventListener('keydown', this.start, true);
    this.hint?.remove();
    this.hint = null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const engine = new AudioEngine(ctx);
    this.engine = engine;
    this.music = new MusicPlayer(this.playlist, (url) => mediaDeck(ctx, engine.groups.music, url));
    this.applyParams();
    void ctx.resume();
    this.music.play();
    this.syncStatus();
  };

  private onVisibility = (): void => {
    this.engine?.setEffectsOn(document.visibilityState === 'visible');
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
    if (!this.engine) return;
    const t0 = performance.now();
    const { plants, rocks, ...rest } = scene;
    const near = this.nearby.get(plants, rocks, scene.camera.x, scene.camera.z);
    const frame = this.model.step({ ...rest, realTime: this.realTime, hidden: document.visibilityState === 'hidden', plantDensity: near.plantDensity, nearRocks: near.nearRocks });
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
