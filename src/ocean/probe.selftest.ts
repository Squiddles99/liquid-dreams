import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { registerSelfTest } from '../dev/selfTest';
import { HeightProbe } from './HeightProbe';
import { OceanSimulation } from './OceanSimulation';

registerSelfTest({
  name: 'probe: flat calm reads zero everywhere',
  async run(renderer) {
    const calm = cloneConditions(DEFAULT_CONDITIONS);
    calm.swell.sizeFt = 0;
    calm.wind.speedMs = 0;
    const sim = new OceanSimulation();
    sim.setConditions(calm);
    sim.update(renderer, 5, 1 / 60);
    const probe = new HeightProbe(sim);
    [[0, 0], [-15, 0], [123.4, -987.6]].forEach(([x, z], i) => probe.setProbe(i, x, z));
    const out = await probe.readNow(renderer);
    const worst = Math.max(Math.abs(out[0]), Math.abs(out[4]), Math.abs(out[8]));
    return { pass: worst < 1e-4, detail: `max |h| ${worst.toExponential(2)}` };
  },
});

registerSelfTest({
  name: 'probe: live sea is finite, bounded and moving',
  async run(renderer) {
    const sim = new OceanSimulation();
    sim.setConditions(DEFAULT_CONDITIONS);
    const probe = new HeightProbe(sim);
    for (let i = 0; i < 8; i++) probe.setProbe(i, -15 + i * 7, i * 3);
    sim.update(renderer, 10, 1 / 60);
    const a = await probe.readNow(renderer);
    sim.update(renderer, 13, 1 / 60);
    const b = await probe.readNow(renderer);
    const heightsA = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => a[i * 4]);
    const heightsB = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => b[i * 4]);
    const finite = [...heightsA, ...heightsB].every(Number.isFinite);
    const bounded = [...heightsA, ...heightsB].every((h) => Math.abs(h) < 2 * sim.hsTotal);
    const moving = heightsA.some((h, i) => Math.abs(h - heightsB[i]) > 0.01);
    return { pass: finite && bounded && moving, detail: `t=10 ${heightsA.map((h) => h.toFixed(2)).join(',')}; t=13 ${heightsB.map((h) => h.toFixed(2)).join(',')}` };
  },
});
