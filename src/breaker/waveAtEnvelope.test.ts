import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import {
  type ActiveWave, type BreakOptions, type WaveContext, beyondEnvelope, breakOptions, crestAt, phaseXi, toActiveWave, waveAt,
  waveAtCrest,
} from './setWaveModel';
import { DEFAULT_CONDITIONS, cloneConditions } from '../conditions/defaults';
import { buildBathymetry, downsample } from '../seabed/bathymetry';
import { DEFAULT_SET_PARAMS, wavesOfSet } from '../swell/sets';
import { computeReefField, sampleField } from './reefField';

// Plan 2026-10-07 ride-framerate Task 1: waveAt skips the crest lookup for a wave beyond its envelope (waveAtCrest
// returns zero there whatever the crest), so it must equal the composition everywhere, and look up fewer crests.
describe('waveAt beyond the envelope (exact)', () => {
  const field = computeReefField({ bed: downsample(buildBathymetry(), 2), periodS: 15, fromDeg: 225, tideM: 0 });
  const ctx: WaveContext = { omega: field.omega, travelX: field.far.dirX, travelZ: field.far.dirZ };
  const c = cloneConditions(DEFAULT_CONDITIONS); c.swell.sizeFt = 6;
  const base = toActiveWave(wavesOfSet(1, c, DEFAULT_SET_PARAMS)[0]);
  const waves: ActiveWave[] = [[0, 1.5], [15, 2], [30, 2.5]].map(([arrivalS, heightM]) => ({ ...base, arrivalS, heightM }));
  const g = field.grid;
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  it('equals waveAtCrest(…, crestAt(…)) at 200 random points and times, every field', () => {
    const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
    let beyond = 0, inside = 0;
    for (let i = 0; i < 200; i++) {
      const x = g.x0 + rand() * (g.nx - 1) * g.cellM, z = g.z0 + rand() * (g.nz - 1) * g.cellM, t = -20 + rand() * 80;
      const f = sampleField(field, x, z);
      for (const w of waves) {
        if (beyondEnvelope(phaseXi(x, z, t, f, w, ctx), w)) beyond++; else inside++;
        expect(waveAt(x, z, t, f, w, ctx, o)).toEqual(waveAtCrest(x, z, t, f, w, ctx, crestAt(x, z, t, f, w, ctx, o), o));
      }
    }
    // Both paths are exercised.
    expect(beyond).toBeGreaterThan(50);
    expect(inside).toBeGreaterThan(50);
  });

  it('looks up the crest only for waves inside the envelope', () => {
    const counting = (): { o: BreakOptions; n: () => number } => {
      const o = breakOptions(field, DEFAULT_BREAK_PARAMS);
      let n = 0;
      const sample = o.sample;
      return { o: { ...o, sample: (x, z) => { n++; return sample(x, z); } }, n: () => n };
    };
    const x = 100, z = g.z0 + 0.5 * (g.nz - 1) * g.cellM, f = sampleField(field, x, z);
    const t = waves[2].arrivalS + f.tau + 10; // the third wave 10 s past; the others 25 and 40 s past (cutoff ~16 s)
    expect(waves.map((w) => beyondEnvelope(phaseXi(x, z, t, f, w, ctx), w))).toEqual([true, true, false]);
    const all = counting();
    for (const w of waves) waveAt(x, z, t, f, w, ctx, all.o);
    const one = counting();
    crestAt(x, z, t, f, waves[2], ctx, one.o);
    expect(one.n()).toBeGreaterThan(0);
    expect(all.n()).toBe(one.n());
  });
});
