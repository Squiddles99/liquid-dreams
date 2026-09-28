import { HIT_DURATION_S, type HitEvent, type Point3 } from './hits';

/** The synthesised voices (Phase 5 spec §3.3): seeded noise loops, filters, oscillators and envelopes. No samples. */

/** mulberry32: small and seeded, so the noise (and a self-test's render) is the same every run. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NoiseColour = 'white' | 'pink' | 'brown';

/** A noise loop `length` samples long: no DC, peak 1, its start crossfaded from the samples past its end, so it loops cleanly. */
export function noiseLoop(colour: NoiseColour, length: number, seed: number): Float32Array<ArrayBuffer> {
  const fade = Math.min(2048, Math.floor(length / 4));
  const raw = new Float32Array(length + fade);
  const rnd = makeRng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    if (colour === 'white') raw[i] = w;
    else if (colour === 'pink') {
      // Paul Kellet's refined pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      brown = (brown + 0.02 * w) / 1.02;
      raw[i] = brown;
    }
  }
  let mean = 0;
  for (let i = 0; i < raw.length; i++) mean += raw[i];
  mean /= raw.length;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = raw[i] - mean;
  for (let i = 0; i < fade; i++) {
    const u = i / fade;
    out[i] = out[i] * u + (raw[length + i] - mean) * (1 - u);
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak;
  return out;
}

export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

export function makeNoiseBuffers(ctx: BaseAudioContext, seconds = 6): NoiseBuffers {
  const make = (c: NoiseColour, seed: number): AudioBuffer => {
    const b = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
    b.copyToChannel(noiseLoop(c, b.length, seed), 0);
    return b;
  };
  return { white: make('white', 11), pink: make('pink', 23), brown: make('brown', 37) };
}

/** A 3D panner: HRTF, inverse distance from refDistance (bigger for broad sources like white water and the shore). */
export function makePanner(ctx: BaseAudioContext, refDistance: number): PannerNode {
  return new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance, maxDistance: 10000, rolloffFactor: 1 });
}

/** A looping noise through a filter and a gain (and a panner, if placed); level, filter and place glide to their targets. */
export class LoopVoice {
  readonly gain: GainNode;
  readonly filter: BiquadFilterNode;
  readonly panner: PannerNode | null;

  constructor(ctx: BaseAudioContext, buffer: AudioBuffer, dest: AudioNode, o: { type: BiquadFilterType; freq: number; q?: number; refDistance?: number; rate?: number; offsetS?: number }) {
    const src = new AudioBufferSourceNode(ctx, { buffer, loop: true, playbackRate: o.rate ?? 1 });
    this.filter = new BiquadFilterNode(ctx, { type: o.type, frequency: o.freq, Q: o.q ?? 0.7 });
    this.gain = new GainNode(ctx, { gain: 0 });
    this.panner = o.refDistance ? makePanner(ctx, o.refDistance) : null;
    src.connect(this.filter).connect(this.gain);
    if (this.panner) this.gain.connect(this.panner).connect(dest);
    else this.gain.connect(dest);
    src.start(0, o.offsetS ?? 0);
  }

  set(level: number, freqHz: number, t: number, glideS = 0.08): void {
    this.gain.gain.setTargetAtTime(Math.max(0, level), t, glideS);
    this.filter.frequency.setTargetAtTime(Math.min(20000, Math.max(20, freqHz)), t, glideS);
  }

  place(at: Point3, t: number): void {
    if (!this.panner) return;
    this.panner.positionX.setTargetAtTime(at.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(at.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(at.z, t, 0.05);
  }
}

/** One hit at `when`: a 15 ms crack of band-passed noise, a sine thump sweeping down an octave, and a short brown-noise tail. */
export function playHit(ctx: BaseAudioContext, n: NoiseBuffers, dest: AudioNode, h: HitEvent, when: number): void {
  const pan = makePanner(ctx, 15);
  pan.positionX.value = h.x;
  pan.positionY.value = h.y;
  pan.positionZ.value = h.z;
  const air = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: h.cutoffHz, Q: 0.5 });
  air.connect(pan).connect(dest);
  const offset = Math.abs(h.x * 7.3 + h.z * 13.1) % 4;

  const crack = new AudioBufferSourceNode(ctx, { buffer: n.white });
  const cg = new GainNode(ctx, { gain: 0 });
  crack.connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2500, Q: 0.8 })).connect(cg).connect(air);
  cg.gain.setValueAtTime(0, when);
  cg.gain.linearRampToValueAtTime(0.6 * h.gain, when + 0.002);
  cg.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  crack.start(when, offset);
  crack.stop(when + 0.08);

  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: h.thumpHz });
  osc.frequency.setValueAtTime(h.thumpHz, when);
  osc.frequency.exponentialRampToValueAtTime(h.thumpHz * 0.5, when + 0.8);
  const tg = new GainNode(ctx, { gain: 0 });
  osc.connect(tg).connect(air);
  tg.gain.setValueAtTime(0, when);
  tg.gain.linearRampToValueAtTime(h.gain, when + 0.01);
  tg.gain.exponentialRampToValueAtTime(0.001, when + HIT_DURATION_S);
  osc.start(when);
  osc.stop(when + HIT_DURATION_S + 0.05);

  const tail = new AudioBufferSourceNode(ctx, { buffer: n.brown });
  const bg = new GainNode(ctx, { gain: 0 });
  tail.connect(bg).connect(air);
  bg.gain.setValueAtTime(0, when);
  bg.gain.linearRampToValueAtTime(0.5 * h.gain, when + 0.03);
  bg.gain.exponentialRampToValueAtTime(0.001, when + HIT_DURATION_S);
  tail.start(when, offset);
  tail.stop(when + HIT_DURATION_S + 0.05);
  osc.onended = () => { air.disconnect(); pan.disconnect(); };
}

/** One short band-passed noise burst (a lapping plip, or a pebble click) at `when`. */
export function playPlip(ctx: BaseAudioContext, n: NoiseBuffers, dest: AudioNode, when: number, freqHz: number, durS: number, level: number): void {
  const src = new AudioBufferSourceNode(ctx, { buffer: n.white });
  const g = new GainNode(ctx, { gain: 0 });
  src.connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: freqHz, Q: 3 })).connect(g).connect(dest);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(Math.max(0.001, level), when + durS * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0005, when + durS);
  src.start(when, (freqHz * 0.37) % 4);
  src.stop(when + durS + 0.01);
}
