import { registerSelfTest } from '../dev/selfTest';
import { AudioEngine } from './AudioEngine';
import type { SoundFrame } from './soundModel';
import { DEFAULT_SOUND_PARAMS } from './soundParams';

const RATE = 48000;
const AT = { x: 20, y: 0, z: 0, cutoffHz: 12000 };

function frame(over: Partial<SoundFrame> = {}): SoundFrame {
  return {
    hits: [], roar: { ...AT, level: 0, brightness: 1 }, wash: { ...AT, level: 0 }, rumble: { ...AT, level: 0 },
    wind: { level: 0, brightness: 0.5 }, scrub: 0, lapping: { level: 0, rate: 6 }, swash: { level: 0, drawBack: 0, pebbles: 0 },
    underwater: false, effectsOn: true, rain: { level: 0, brightness: 0 }, thunder: [], ...over,
  };
}

async function render(f: SoundFrame, seconds = 1.5): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(2, Math.floor(RATE * seconds), RATE);
  const e = new AudioEngine(ctx);
  e.setVolumes({ ...DEFAULT_SOUND_PARAMS, master: 1 });
  e.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
  e.apply(f);
  // The game applies a frame every frame; the plips and clicks are scheduled only 0.1 s ahead. Re-apply the continuous
  // part every 50 ms of the render (the hits only once).
  for (let t = 0.05; t < seconds - 0.05; t += 0.05) {
    void ctx.suspend(t).then(() => {
      e.apply({ ...f, hits: [], thunder: [] });
      void ctx.resume();
    });
  }
  return (await ctx.startRendering()).getChannelData(0);
}

const rms = (x: Float32Array, from = 0): number => {
  let s = 0;
  for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length - from));
};
const hf = (x: Float32Array, from: number): number => {
  let s = 0;
  for (let i = from + 1; i < x.length; i++) s += (x[i] - x[i - 1]) ** 2;
  return s / (x.length - from);
};
const HIT = { x: 20, y: 0, z: 0, gain: 1, thumpHz: 70, cutoffHz: 12000, delayS: 0.1, bombie: false };

registerSelfTest({
  name: 'sound: every voice renders finite, audible audio',
  async run() {
    const voices: [string, Partial<SoundFrame>][] = [
      ['roar', { roar: { ...AT, level: 1, brightness: 1 } }],
      ['wash', { wash: { ...AT, level: 1 } }],
      ['rumble', { rumble: { ...AT, level: 1 } }],
      ['wind', { wind: { level: 1, brightness: 0.5 } }],
      ['scrub', { scrub: 1 }],
      ['lapping', { lapping: { level: 1, rate: 8 } }],
      ['swash', { swash: { level: 1, drawBack: 1, pebbles: 1 } }],
      ['hum', { underwater: true }],
      ['hit', { hits: [HIT] }],
      ['rain', { rain: { level: 1, brightness: 0.8 } }],
    ];
    let pass = true;
    const out: string[] = [];
    for (const [name, f] of voices) {
      const x = await render(frame(f));
      const finite = x.every(Number.isFinite), r = rms(x, Math.floor(RATE * 0.3));
      pass &&= finite && r > 1e-3;
      out.push(`${name} ${r.toExponential(1)}${finite ? '' : ' NaN'}`);
    }
    return { pass, detail: out.join(', ') };
  },
});

registerSelfTest({
  name: 'sound: underwater cuts the highs by 10 dB or more',
  async run() {
    const loud = { wind: { level: 1, brightness: 1 }, swash: { level: 1, drawBack: 1, pebbles: 0 } };
    const from = Math.floor(RATE * 0.4);
    const dry = hf(await render(frame(loud)), from), wet = hf(await render(frame({ ...loud, underwater: true })), from);
    const db = 10 * Math.log10(wet / dry);
    return { pass: db <= -10, detail: `high-frequency energy ${db.toFixed(1)} dB underwater` };
  },
});

registerSelfTest({
  name: 'sound: a hit is heard after its delay',
  async run() {
    const x = await render(frame({ hits: [{ ...HIT, delayS: 0.5 }] }));
    const first = x.findIndex((v) => Math.abs(v) > 1e-3) / RATE;
    return { pass: first >= 0.49 && first <= 0.56, detail: `first sound at ${first.toFixed(3)} s (hit at 0.5 s)` };
  },
});

registerSelfTest({
  name: 'sound: a frame with a hit costs the main thread under 1 ms',
  async run() {
    // A live context (suspended without a gesture): building nodes costs more there than offline, as in the game.
    const ctx = new AudioContext();
    try {
      const e = new AudioEngine(ctx);
      // The median of 41 frames: a mean picks up garbage collection and scheduling noise on a laptop.
      const times: number[] = [];
      for (let i = 0; i < 41; i++) {
        const t0 = performance.now();
        e.apply(frame({ hits: [{ ...HIT, x: 10 + i, z: -i, delayS: 0.01 * i }] }));
        times.push(performance.now() - t0);
      }
      const ms = times.sort((p, q) => p - q)[20];
      return { pass: ms < 1, detail: `median ${ms.toFixed(3)} ms per frame with one hit (live context; in play: 0.3 ms)` };
    } finally {
      void ctx.close();
    }
  },
});

registerSelfTest({
  name: "sound: thunder is silent until the flash's sound arrives, then rumbles",
  async run() {
    // A strike 686 m away: heard 2 s after the flash.
    const th = { delayS: 686 / 343, x: -800, y: 200, z: 0, level: 1, cutoffHz: 1500, crack: true };
    const a = await render(frame({ thunder: [th] }), 4);
    const before = rms(a.subarray(0, Math.floor(RATE * 1.8))), after = rms(a, Math.floor(RATE * 2.05));
    return { pass: before < 1e-4 && after > 1e-3 && a.every(Number.isFinite), detail: `rms before ${before.toExponential(2)}, after ${after.toExponential(2)}` };
  },
});
