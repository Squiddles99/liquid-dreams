// breaking-look item 3 + L2: the foam pattern's far LOD returns its fitted spatial mean (foamPatternMean): the full pattern's
// spatial mean over 4096 points (a 400 m patch, lod 0) against the LOD path's value (lod 1), at five weight/age pairs and
// both tear states; and the whole fitting grid printed (FOAM_MEAN_TABLE is fitted from it).
import { type ComputeNode, StorageBufferAttribute } from 'three/webgpu';
import { Fn, float, instanceIndex, storage, vec2, vec4 } from 'three/tsl';
import { registerSelfTest } from '../dev/selfTest';
import { FOAM_MEAN_THIN, FOAM_MEAN_W, setFoamPattern } from './OceanSurface';

const N = 4096;
async function means(renderer: Parameters<Parameters<typeof registerSelfTest>[0]['run']>[0], w: number, thin: number, tear: number, young: number, lod: number): Promise<[number, number]> {
  const attr = new StorageBufferAttribute(new Float32Array(N * 4), 4);
  const out = storage(attr, 'vec4', N);
  const pass = Fn(() => {
    const i = float(instanceIndex);
    const frame = vec2(i.mul(0.6180339).fract().mul(400.0), i.mul(0.7548776).fract().mul(400.0));
    const r = setFoamPattern(float(w), frame, float(37.0), float(thin), float(tear), float(young), float(lod));
    out.element(instanceIndex).assign(vec4(r.x, r.y, 0.0, 0.0));
  })().compute(N) as ComputeNode;
  renderer.compute(pass);
  const g = new Float32Array(await renderer.getArrayBufferAsync(attr));
  let c = 0, b = 0;
  for (let k = 0; k < N; k++) { c += g[k * 4]; b += g[k * 4] * g[k * 4 + 1]; }
  return [c / N, c > 0 ? b / c : 0];
}

registerSelfTest({
  name: 'foam pattern: L2 far LOD = the full pattern\'s spatial mean within 5 % (five weight/age pairs, torn and not) + the fitting grid',
  async run(renderer) {
    const grid: string[] = [];
    for (const tear of [0, 1]) for (const thin of FOAM_MEAN_THIN) {
      const row: string[] = [];
      for (const w of FOAM_MEAN_W) { const [c, b] = await means(renderer, w, thin, tear, 0, 0); row.push(`${c.toFixed(4)}/${b.toFixed(3)}`); }
      grid.push(`tear ${tear} thin ${thin}: ${row.join(' ')}`);
    }
    const pairs: [number, number, number][] = [[0.2, 0, 1], [0.5, 0, 1], [0.8, 0.5, 1], [0.35, 1, 1], [0.6, 0, 0]];
    let worst = 0;
    const notes: string[] = [];
    for (const [w, thin, tear] of pairs) {
      const [cf] = await means(renderer, w, thin, tear, 0, 0), [cl] = await means(renderer, w, thin, tear, 0, 1);
      const rel = Math.abs(cl - cf) / Math.max(cf, 1e-3);
      worst = Math.max(worst, rel);
      notes.push(`w ${w} thin ${thin} tear ${tear}: full ${cf.toFixed(4)} lod ${cl.toFixed(4)}`);
    }
    return { pass: worst <= 0.05, detail: `worst ${(worst * 100).toFixed(1)} %; ${notes.join('; ')} || grid (cover/brightness by w ${FOAM_MEAN_W.map((v) => v.toFixed(3)).join(',')}): ${grid.join(' | ')}` };
  },
});

registerSelfTest({
  name: 'foam pattern (item 3): old foam (age > 10 s) never covers > 0.9; at 30 s its streaks run >= 3 : 1 along the drift',
  async run(renderer) {
    const n = 256, step = 0.25;
    const attr = new StorageBufferAttribute(new Float32Array(n * n * 4), 4);
    const out = storage(attr, 'vec4', n * n);
    // thin 1 (past the clear time + 5 s), young 1, torn (breaking foam), weight 0.6, a 64 m square at 0.25 m.
    const pass = Fn(() => {
      const i = float(instanceIndex);
      const frame = vec2(i.mod(n).mul(step), i.div(n).floor().mul(step));
      const r = setFoamPattern(float(0.6), frame, float(30.0), float(1.0), float(1.0), float(1.0), float(0.0));
      out.element(instanceIndex).assign(vec4(r.x, 0.0, 0.0, 0.0));
    })().compute(n * n) as ComputeNode;
    renderer.compute(pass);
    const g = new Float32Array(await renderer.getArrayBufferAsync(attr));
    const c = (x: number, y: number) => g[(y * n + x) * 4];
    let over = 0, mean = 0;
    for (let k = 0; k < n * n; k++) { if (g[k * 4] > 0.9) over++; mean += g[k * 4]; }
    mean /= n * n;
    const corr = (dx: number, dy: number) => {
      let v0 = 0;
      for (let k = 0; k < n * n; k++) v0 += (g[k * 4] - mean) ** 2;
      for (let lag = 1; lag < 120; lag++) {
        let s = 0;
        for (let y = 0; y < n - lag * dy; y++) for (let x = 0; x < n - lag * dx; x++) s += (c(x, y) - mean) * (c(x + lag * dx, y + lag * dy) - mean);
        if (s / ((n - lag * dx) * (n - lag * dy)) / (v0 / (n * n)) < 1 / Math.E) return lag * step;
      }
      return 120 * step;
    };
    const along = corr(1, 0), across = corr(0, 1);
    return { pass: over === 0 && along / across >= 3, detail: `cover > 0.9: ${over} of ${n * n} samples (64 m square); correlation length along ${along.toFixed(2)} m, across ${across.toFixed(2)} m (${(along / across).toFixed(2)} : 1)` };
  },
});
