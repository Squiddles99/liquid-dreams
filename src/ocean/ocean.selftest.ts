import type * as THREE from 'three/webgpu';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { OceanSimulation } from './OceanSimulation';

async function readA(renderer: THREE.WebGPURenderer, sim: OceanSimulation): Promise<Float32Array> {
  return new Float32Array(await renderer.getArrayBufferAsync(sim.fftAAttr));
}

registerSelfTest({
  name: 'ocean: realised Hs matches the spectrum (±35%)',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.setConditions(DEFAULT_CONDITIONS);
    sim.update(renderer, 20, 1 / 60);
    const a = await readA(renderer, sim);
    const n = sim.n;
    let variance = 0;
    for (let c = 0; c < sim.sizes.length; c++) {
      let sum = 0, sumSq = 0;
      for (let m = 0; m < n; m++) for (let x = 0; x < n; x++) {
        const sign = (x + m) % 2 === 0 ? 1 : -1;
        const h = a[((c * n + m) * n + x) * 4 + 1] * sign;
        sum += h; sumSq += h * h;
      }
      const mean = sum / (n * n);
      variance += sumSq / (n * n) - mean * mean;
    }
    const hs = 4 * Math.sqrt(variance);
    return { pass: Math.abs(hs - sim.hsTotal) / sim.hsTotal < 0.35, detail: `realised Hs ${hs.toFixed(3)} m vs spectrum ${sim.hsTotal.toFixed(3)} m` };
  },
});

registerSelfTest({
  name: 'ocean: glass-off (zero wind) and extremes stay finite',
  async run(renderer) {
    const glass = cloneConditions(DEFAULT_CONDITIONS);
    glass.wind.speedMs = 0;
    const extreme = cloneConditions(DEFAULT_CONDITIONS);
    extreme.swell = { sizeFt: 12, periodS: 25, directionDeg: 200 };
    extreme.wind = { speedMs: 30, directionDeg: 225 };
    for (const c of [glass, extreme]) {
      const sim = new OceanSimulation();
      sim.setConditions(c);
      sim.update(renderer, 7.5, 1 / 60);
      const a = await readA(renderer, sim);
      if (!a.every(Number.isFinite)) return { pass: false, detail: `non-finite values for ${JSON.stringify(c.wind)}` };
    }
    return { pass: true, detail: 'all values finite' };
  },
});

registerSelfTest({
  name: 'ocean: same seed and time, same sea',
  async run(renderer) {
    const run = async () => {
      const sim = new OceanSimulation();
      sim.setConditions(DEFAULT_CONDITIONS);
      sim.update(renderer, 12.5, 1 / 60);
      return readA(renderer, sim);
    };
    const [a, b] = [await run(), await run()];
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    return { pass: diff === 0, detail: `max difference ${diff}` };
  },
});
