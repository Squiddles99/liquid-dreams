import type { Point3 } from './hits';
import type { SoundFrame } from './soundModel';
import { type SoundParams, masterGain } from './soundParams';
import { LoopVoice, type NoiseBuffers, makeNoiseBuffers, makeRng, playHit, playPlip, playThunder } from './voices';

/**
 * The Web Audio graph (Phase 5 spec §3.1):
 * - waves, ambience and near water → the muffle (underwater low-pass and −6 dB) → the effects fade (pause, hidden) → master;
 * - the underwater hum → the effects fade;
 * - the music → master;
 * - the UI → master (never muffled or paused: the front end and pause menus speak over everything);
 * - master → a gentle limiter → out.
 * Works on an OfflineAudioContext too (the self-tests).
 */

export type SoundGroup = 'waves' | 'ambience' | 'nearWater' | 'music' | 'ui';
export const UNDERWATER_CUTOFF_HZ = 400;
export const UNDERWATER_GAIN = 0.5;
/** Time constant (s) of the underwater glide: settled in about 0.15 s. */
export const UNDERWATER_GLIDE_S = 0.05;
/** Time constant (s) of the pause fade: silent in about 0.3 s. */
export const PAUSE_FADE_S = 0.1;
export const HUM_LEVEL = 0.12;

export class AudioEngine {
  readonly master: GainNode;
  readonly groups: Record<SoundGroup, GainNode>;
  /** Hits handed to the graph so far (dev readout). */
  hitsPlayed = 0;
  private readonly fx: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly muffleGain: GainNode;
  private readonly hum: GainNode;
  private readonly noise: NoiseBuffers;
  private readonly roar: LoopVoice;
  private readonly wash: LoopVoice;
  private readonly rumble: LoopVoice;
  private readonly wind: LoopVoice;
  /** The rain's hiss (weather W2). */
  private readonly rain: LoopVoice;
  private readonly scrub: LoopVoice;
  private readonly flutter: GainNode;
  private readonly swash: LoopVoice;
  private readonly rng = makeRng(99);
  private nextPlip = 0;
  private nextClick = 0;

  constructor(readonly ctx: BaseAudioContext) {
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
    limiter.connect(ctx.destination);
    this.master = new GainNode(ctx, { gain: 0.8 });
    this.master.connect(limiter);
    this.fx = new GainNode(ctx, { gain: 1 });
    this.fx.connect(this.master);
    this.muffleGain = new GainNode(ctx, { gain: 1 });
    this.muffleGain.connect(this.fx);
    this.muffle = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0.5 });
    this.muffle.connect(this.muffleGain);
    const group = (dest: AudioNode): GainNode => {
      const g = new GainNode(ctx, { gain: 1 });
      g.connect(dest);
      return g;
    };
    this.groups = { waves: group(this.muffle), ambience: group(this.muffle), nearWater: group(this.muffle), music: group(this.master), ui: group(this.master) };

    this.noise = makeNoiseBuffers(ctx);
    const n = this.noise, g = this.groups;
    this.roar = new LoopVoice(ctx, n.brown, g.waves, { type: 'lowpass', freq: 1500, refDistance: 20, offsetS: 0.3 });
    this.wash = new LoopVoice(ctx, n.pink, g.waves, { type: 'lowpass', freq: 1500, refDistance: 30, offsetS: 1.1 });
    this.rumble = new LoopVoice(ctx, n.brown, g.waves, { type: 'lowpass', freq: 250, refDistance: 60, offsetS: 2.3 });
    this.wind = new LoopVoice(ctx, n.pink, g.ambience, { type: 'bandpass', freq: 600, q: 0.6, offsetS: 3.7 });
    this.rain = new LoopVoice(ctx, n.white, g.ambience, { type: 'highpass', freq: 1200, offsetS: 2.9 });
    this.scrub = new LoopVoice(ctx, n.white, g.ambience, { type: 'highpass', freq: 3500, offsetS: 0.9 });
    // The leaves' flutter: slow brown noise modulating the scrub's gain.
    const flutterSrc = new AudioBufferSourceNode(ctx, { buffer: n.brown, loop: true, playbackRate: 4 });
    this.flutter = new GainNode(ctx, { gain: 0 });
    flutterSrc.connect(this.flutter).connect(this.scrub.gain.gain);
    flutterSrc.start(0, 1.7);
    this.swash = new LoopVoice(ctx, n.white, g.nearWater, { type: 'bandpass', freq: 1800, q: 0.7, offsetS: 4.4 });

    this.hum = new GainNode(ctx, { gain: 0 });
    this.hum.connect(this.fx);
    const osc = new OscillatorNode(ctx, { frequency: 55 });
    osc.connect(new GainNode(ctx, { gain: 0.5 })).connect(this.hum);
    osc.start();
    new LoopVoice(ctx, n.brown, this.hum, { type: 'lowpass', freq: 120, offsetS: 5 }).set(0.6, 120, 0);
  }

  setVolumes(p: SoundParams): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(masterGain(p), t, 0.05);
    this.groups.waves.gain.setTargetAtTime(p.waves, t, 0.05);
    this.groups.ambience.gain.setTargetAtTime(p.ambience, t, 0.05);
    this.groups.nearWater.gain.setTargetAtTime(p.nearWater, t, 0.05);
    this.groups.music.gain.setTargetAtTime(p.music, t, 0.05);
  }

  setListener(pos: Point3, forward: Point3, up: Point3): void {
    const L = this.ctx.listener, t = this.ctx.currentTime, k = 0.02;
    L.positionX.setTargetAtTime(pos.x, t, k);
    L.positionY.setTargetAtTime(pos.y, t, k);
    L.positionZ.setTargetAtTime(pos.z, t, k);
    L.forwardX.setTargetAtTime(forward.x, t, k);
    L.forwardY.setTargetAtTime(forward.y, t, k);
    L.forwardZ.setTargetAtTime(forward.z, t, k);
    L.upX.setTargetAtTime(up.x, t, k);
    L.upY.setTargetAtTime(up.y, t, k);
    L.upZ.setTargetAtTime(up.z, t, k);
  }

  /** Fade the effects out (pause, a hidden tab) or back in; the music is untouched. */
  setEffectsOn(on: boolean): void {
    this.fx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, PAUSE_FADE_S);
  }

  apply(f: SoundFrame): void {
    const t = this.ctx.currentTime;
    this.setEffectsOn(f.effectsOn);
    this.muffle.frequency.setTargetAtTime(f.underwater ? UNDERWATER_CUTOFF_HZ : 20000, t, UNDERWATER_GLIDE_S);
    this.muffleGain.gain.setTargetAtTime(f.underwater ? UNDERWATER_GAIN : 1, t, UNDERWATER_GLIDE_S);
    this.hum.gain.setTargetAtTime(f.underwater ? HUM_LEVEL : 0, t, UNDERWATER_GLIDE_S);
    for (const h of f.hits) {
      playHit(this.ctx, this.noise, this.groups.waves, h, t + h.delayS);
      this.hitsPlayed++;
    }
    this.roar.set(0.9 * f.roar.level, Math.min(f.roar.cutoffHz, 300 + 3700 * f.roar.brightness), t);
    this.roar.place(f.roar, t);
    this.wash.set(0.8 * f.wash.level, Math.min(f.wash.cutoffHz, 1500), t, 0.15);
    this.wash.place(f.wash, t);
    this.rumble.set(1.2 * f.rumble.level, Math.min(f.rumble.cutoffHz, 250), t, 0.2);
    this.rumble.place(f.rumble, t);
    this.wind.set(0.35 * f.wind.level, (300 + 900 * f.wind.brightness) * (1 + 0.3 * Math.sin(t * 0.4)), t, 0.3);
    this.scrub.set(0.25 * f.scrub, 3500, t, 0.2);
    this.rain.set(0.4 * f.rain.level, 900 + 1500 * f.rain.brightness, t, 0.5);
    for (const th of f.thunder) playThunder(this.ctx, this.noise, this.groups.ambience, th, t + th.delayS, this.rng);
    this.flutter.gain.setTargetAtTime(0.2 * f.scrub, t, 0.2);
    const back = f.swash.level > 0 ? f.swash.drawBack / f.swash.level : 0;
    this.swash.set(0.5 * f.swash.level, 1800 + 2200 * back, t, 0.1);
    this.schedulePlips(f.lapping, t);
    this.scheduleClicks(f.swash.pebbles, t);
  }

  /** Lapping plips, scheduled 0.1 s ahead at the model's rate. */
  private schedulePlips(l: { level: number; rate: number }, t: number): void {
    if (l.level <= 0.01 || l.rate <= 0) {
      this.nextPlip = t;
      return;
    }
    this.nextPlip = Math.max(this.nextPlip, t);
    while (this.nextPlip < t + 0.1) {
      playPlip(this.ctx, this.noise, this.groups.nearWater, this.nextPlip, 300 + 600 * this.rng(), 0.04 + 0.08 * this.rng(), 0.4 * l.level);
      this.nextPlip += (0.5 + this.rng()) / l.rate;
    }
  }

  /** The pebbles' clatter in the draw-back. */
  private scheduleClicks(level: number, t: number): void {
    if (level <= 0.01) {
      this.nextClick = t;
      return;
    }
    this.nextClick = Math.max(this.nextClick, t);
    while (this.nextClick < t + 0.1) {
      playPlip(this.ctx, this.noise, this.groups.nearWater, this.nextClick, 3000 + 3000 * this.rng(), 0.008 + 0.012 * this.rng(), 0.3 * level);
      this.nextClick += (0.5 + this.rng()) / 25;
    }
  }
}
