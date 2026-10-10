// src/frontend/uiSounds.ts: the front end's sounds, synthesised in WebAudio (spec §12: licence-clean, no samples).
import type { FrontEvent } from './frontEnd';

export type UiSound = 'focus' | 'value' | 'end' | 'confirm' | 'back' | 'swing' | 'pick';
export const UI_SOUND_MS: Record<UiSound, number> = { focus: 40, value: 40, end: 90, confirm: 250, back: 150, swing: 1600, pick: 250 };

export const valuePitchHz = (step: number): number => 660 * 2 ** (step / 12);
export const focusDetune = (r: number): number => Math.round((r * 2 - 1) * 100);

export function soundFor(e: FrontEvent): UiSound | null {
  switch (e.kind) {
    case 'focus': case 'riderFocus': case 'pinFocus': case 'hubTab': return 'focus';
    case 'value': case 'roll': case 'details': case 'breakDetails': case 'libraryOpen': return 'value';
    case 'end': return 'end';
    case 'move': return 'swing';
    case 'pick': return 'pick';
    case 'back': return 'back';
    // Surf here: the confirm (its move event already swings).
    case 'chosen': case 'paddleOut': case 'surfHere': return 'confirm';
    case 'title': return 'back';
    default: return null;
  }
}

/** −12 dB under the confirm (spec §12). */
const FOCUS_GAIN = 10 ** (-12 / 20);

/** The riders' recorded lines by id (spec §12's VO hook). None ship this step. */
export const VOICE_FILES: Readonly<Record<string, string>> = {};

export class UiSounds {
  private readonly noise: AudioBuffer;
  private valueStep = 0;

  constructor(private readonly ctx: BaseAudioContext, private readonly out: AudioNode, private readonly rng: () => number = Math.random) {
    this.noise = new AudioBuffer({ length: ctx.sampleRate, sampleRate: ctx.sampleRate, numberOfChannels: 1 });
    const d = this.noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
  }

  /** Plays a rider's recorded line if one exists (none ship this step); true when it played. */
  voice(lineId: string): boolean {
    const url = VOICE_FILES[lineId];
    if (!url) return false;
    const el = new Audio(url);
    void el.play().catch(() => {});
    return true;
  }

  play(s: UiSound, opts: { step?: number; durS?: number; at?: number } = {}): void {
    const t = opts.at ?? this.ctx.currentTime;
    if (s === 'focus') this.click(t, 1800, focusDetune(this.rng()), FOCUS_GAIN * 0.5, 0.04);
    else if (s === 'value') this.click(t, valuePitchHz(opts.step ?? (this.valueStep = (this.valueStep + 1) % 12)), 0, FOCUS_GAIN * 0.6, 0.04);
    else if (s === 'end') this.thud(t);
    else if (s === 'confirm' || s === 'pick') this.knock(t, s === 'pick' ? 0.6 : 1);
    else if (s === 'back') this.fall(t);
    else this.whoosh(t, opts.durS ?? 1.6);
  }

  /** A soft wooden click: a short sine blip through a resonant band-pass. */
  private click(t: number, hz: number, cents: number, gain: number, len: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'triangle', frequency: hz, detune: cents });
    const bp = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: hz, Q: 6 });
    const g = new GainNode(this.ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(bp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.01);
  }

  /** End of range: a dull, low thud. */
  private thud(t: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'sine', frequency: 140 });
    const g = new GainNode(this.ctx, { gain: 0 });
    o.frequency.exponentialRampToValueAtTime(80, t + 0.09);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  /** Confirm: a warm board-knock (a low resonant body and a short bright tap) with a wax-scrape tail. */
  private knock(t: number, level: number): void {
    const body = new OscillatorNode(this.ctx, { type: 'sine', frequency: 190 });
    const bg = new GainNode(this.ctx, { gain: 0 });
    body.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.5 * level, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    body.connect(bg).connect(this.out);
    body.start(t);
    body.stop(t + 0.22);
    this.click(t, 2400, 0, 0.25 * level, 0.03);
    const n = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    const hp = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency: 3200, Q: 0.8 });
    const ng = new GainNode(this.ctx, { gain: 0 });
    ng.gain.setValueAtTime(0, t + 0.05);
    ng.gain.linearRampToValueAtTime(0.06 * level, t + 0.09);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(hp).connect(ng).connect(this.out);
    n.start(t + 0.05);
    n.stop(t + 0.26);
  }

  /** Back: lower, falling. */
  private fall(t: number): void {
    const o = new OscillatorNode(this.ctx, { type: 'triangle', frequency: 520 });
    const g = new GainNode(this.ctx, { gain: 0 });
    o.frequency.exponentialRampToValueAtTime(260, t + 0.15);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** The camera swing: a soft wind-and-swell whoosh over the move. */
  private whoosh(t: number, dur: number): void {
    const n = new AudioBufferSourceNode(this.ctx, { buffer: this.noise, loop: true });
    const lp = new BiquadFilterNode(this.ctx, { type: 'lowpass', frequency: 400, Q: 0.7 });
    const g = new GainNode(this.ctx, { gain: 0 });
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(lp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + dur + 0.02);
  }
}

/** One 40 ms light pulse on confirm (spec §12), on every connected pad that supports it. Nothing on focus moves. */
export function hapticPulse(): void {
  for (const p of navigator.getGamepads?.() ?? []) {
    const a = (p as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    void a?.playEffect?.('dual-rumble', { duration: 40, weakMagnitude: 0.35, strongMagnitude: 0 }).catch(() => {});
  }
}
