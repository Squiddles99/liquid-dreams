// whitewater 7b S3: the billow field's autocorrelation lengths along x, y and the diagonal (the isotropy test's numbers),
// and the same for a field stretched 2:1 along x (what the test must reject). npx tsx tools/_billowIso.ts
import { billowAt } from '../src/whitewater/billow';
function corrLength(dx: number, dy: number, dz = 0, sx = 1): number {
  const step = 0.05, lags = 160, lines = 60, n = 400, acc = new Float64Array(lags);
  for (let l = 0; l < lines; l++) {
    const ox = 37.1 * l + 3.3, oy = -21.7 * l + 11.9;
    const v = Array.from({ length: n + lags }, (_, i) => billowAt((ox + dx * i * step) / sx, oy + dy * i * step, 5.3 * l + dz * i * step, 0).h);
    const m = v.reduce((a, b) => a + b, 0) / v.length, c = v.map((x) => x - m), v0 = c.reduce((a, b) => a + b * b, 0) / c.length;
    for (let k = 0; k < lags; k++) { let s = 0; for (let i = 0; i < n; i++) s += c[i] * c[i + k]; acc[k] += s / n / v0; }
  }
  for (let k = 0; k < lags; k++) if (acc[k] / lines < 1 / Math.E) return k * step;
  return lags * step;
}
console.log(`isotropic: x ${corrLength(1, 0).toFixed(2)} m, y (up) ${corrLength(0, 1).toFixed(2)} m, z ${corrLength(0, 0, 1).toFixed(2)} m, xy diagonal ${corrLength(Math.SQRT1_2, Math.SQRT1_2).toFixed(2)} m`);
console.log(`stretched 2:1 along x: x ${corrLength(1, 0, 0, 2).toFixed(2)} m, y ${corrLength(0, 1, 0, 2).toFixed(2)} m`);
