import { describe, expect, it } from 'vitest';
import { ONSET_LEVELS, ONSET_LEVEL_Q, ONSET_RECORD_LENGTH, ONSET_SIZE_OFFSET } from './breaking';
import { smoothOnsetSizes } from './reefField';

// womb-story Task 1 (STOP 0 ruling: the line's size): the record's size smoothed along the crest over SIZE_SMOOTHING_M on
// the ridden band. Womb-realism's carried bar: Hb varies <= 0.3 m over any 20 m (main: 5.7 -> 4.8 -> 4.9 in the first 20 m).
describe('smoothOnsetSizes', () => {
  // A crest along z (travel +x), 1 m cells, every level broken; the size 5.7 to z 0, 4.8 at 10, 4.9 from 20 (m, H 1).
  const nx = 3, nz = 141, z0 = -60, R = ONSET_RECORD_LENGTH;
  const sizeAt = (z: number) => (z <= 0 ? 5.7 : z <= 10 ? 5.7 - 0.09 * z : z <= 20 ? 4.8 + 0.01 * (z - 10) : 4.9);
  const make = () => {
    const onset = new Float32Array(nx * nz * R);
    for (let i = 0; i < nx * nz; i++) {
      onset[i * R] = 2 * ONSET_LEVEL_Q[ONSET_LEVELS - 1];
      for (let k = 0; k < ONSET_LEVELS; k++) onset[i * R + ONSET_SIZE_OFFSET + k] = sizeAt(z0 + Math.floor(i / nx));
    }
    return { grid: { x0: 0, z0, cellM: 1, nx, nz }, onset, dirX: new Float32Array(nx * nz).fill(1), dirZ: new Float32Array(nx * nz) };
  };
  const spread20 = (f: ReturnType<typeof make>) => {
    const s = Array.from({ length: nz }, (_, r) => f.onset[(r * nx + 1) * R + ONSET_SIZE_OFFSET]);
    let worst = 0;
    for (let r = 30; r + 20 < nz - 30; r++) worst = Math.max(worst, Math.max(...s.slice(r, r + 21)) - Math.min(...s.slice(r, r + 21)));
    return worst;
  };
  // A Gaussian of σ 20 m passes 0.38 of a sharp step over a centred 20 m window; this one (0.9 m over 10 m) keeps 0.34 of
  // it (0.31 m). The 0.3 m bar is the field's, measured on the bake (_storyTable, Task 1 Step 3), whose sizes do not step.
  it('on the band: a 0.9 m step over 10 m keeps at most 0.35 of itself over any 20 m', () => {
    const f = make(), raw = spread20(f);
    expect(raw).toBeGreaterThan(0.85);
    smoothOnsetSizes(f, new Float32Array(nx * nz).fill(1));
    expect(spread20(f)).toBeLessThanOrEqual(0.35 * raw);
  });
  it('off the band: unchanged', () => {
    const f = make(), before = f.onset.slice();
    smoothOnsetSizes(f, new Float32Array(nx * nz));
    expect(f.onset).toEqual(before);
  });
});
