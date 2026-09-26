import type * as THREE from 'three/webgpu';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import type { Conditions } from '../conditions/types';
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

/** Compass bearing (0 = north = −Z, clockwise, +X east) of a world-XZ vector. */
function bearingOfWorldXZ(x: number, z: number): number {
  return ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
}

const angleDiffDeg = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/** Bearing the sea travels toward: Σ(−∂η/∂t)·∇η over every cascade (∂η/∂t = −c·d·∇η for a wave moving along d). */
async function travelBearing(renderer: THREE.WebGPURenderer, c: Conditions): Promise<number> {
  const sim = new OceanSimulation();
  sim.setConditions(c);
  const n = sim.n, t = 20, dt = 0.05;
  sim.update(renderer, t, dt);
  const a0 = await readA(renderer, sim);
  sim.update(renderer, t + dt, dt);
  const a1 = await readA(renderer, sim);
  const height = (a: Float32Array, cascade: number, x: number, m: number): number => {
    const xi = (x + n) % n, mi = (m + n) % n;
    return a[((cascade * n + mi) * n + xi) * 4 + 1] * ((xi + mi) % 2 === 0 ? 1 : -1);
  };
  let sx = 0, sz = 0;
  sim.sizes.forEach((size, cascade) => {
    const cell = size / n;
    for (let m = 0; m < n; m++) for (let x = 0; x < n; x++) {
      const gx = (height(a0, cascade, x + 1, m) - height(a0, cascade, x - 1, m)) / (2 * cell);
      const gz = (height(a0, cascade, x, m + 1) - height(a0, cascade, x, m - 1)) / (2 * cell);
      const minusDhDt = -(height(a1, cascade, x, m) - height(a0, cascade, x, m)) / dt;
      sx += minusDhDt * gx;
      sz += minusDhDt * gz;
    }
  });
  return bearingOfWorldXZ(sx, sz);
}

registerSelfTest({
  name: 'ocean: swell and wind sea travel the way they blow (±10°)',
  async run(renderer) {
    const swell = cloneConditions(DEFAULT_CONDITIONS);
    swell.swell.directionDeg = 225;
    swell.wind.speedMs = 0;
    const wind = cloneConditions(DEFAULT_CONDITIONS);
    wind.swell.sizeFt = 0;
    wind.wind = { speedMs: 8, directionDeg: 80 };
    const swellBearing = await travelBearing(renderer, swell);
    const windBearing = await travelBearing(renderer, wind);
    const pass = angleDiffDeg(swellBearing, 45) <= 10 && angleDiffDeg(windBearing, 260) <= 10;
    return {
      pass,
      detail: `swell from 225° travels toward ${swellBearing.toFixed(1)}° (want 45°), wind sea from 80° toward ${windBearing.toFixed(1)}° (want 260°)`,
    };
  },
});
