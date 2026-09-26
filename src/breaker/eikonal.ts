/**
 * Fast sweeping (Zhao 2005) for |∇τ| = s(x) on a regular grid (index = row·nx + col). Cells with `fixed` set keep
 * their τ (sources); every other cell must start at Infinity. Four alternating sweep orders per cycle; stops when a
 * cycle changes no cell by more than `tol` seconds. Godunov upwind update, exact for plane waves.
 */
export function solveEikonal(
  tau: Float64Array, fixed: Uint8Array, slowness: Float32Array, nx: number, nz: number, cellM: number, maxCycles = 8, tol = 1e-7,
): number {
  let maxChange = 0;
  const update = (i: number, col: number, row: number): void => {
    if (fixed[i]) return;
    const a = Math.min(col > 0 ? tau[i - 1] : Infinity, col < nx - 1 ? tau[i + 1] : Infinity);
    const b = Math.min(row > 0 ? tau[i - nx] : Infinity, row < nz - 1 ? tau[i + nx] : Infinity);
    if (a === Infinity && b === Infinity) return;
    const f = slowness[i] * cellM;
    const t = Math.abs(a - b) >= f ? Math.min(a, b) + f : 0.5 * (a + b + Math.sqrt(2 * f * f - (a - b) * (a - b)));
    if (t < tau[i]) {
      const change = tau[i] === Infinity ? Infinity : tau[i] - t;
      if (change > maxChange) maxChange = change;
      tau[i] = t;
    }
  };
  let cycle = 0;
  for (; cycle < maxCycles; cycle++) {
    maxChange = 0;
    for (let row = 0; row < nz; row++) for (let col = 0; col < nx; col++) update(row * nx + col, col, row);
    for (let row = 0; row < nz; row++) for (let col = nx - 1; col >= 0; col--) update(row * nx + col, col, row);
    for (let row = nz - 1; row >= 0; row--) for (let col = nx - 1; col >= 0; col--) update(row * nx + col, col, row);
    for (let row = nz - 1; row >= 0; row--) for (let col = 0; col < nx; col++) update(row * nx + col, col, row);
    if (maxChange < tol) return cycle + 1;
  }
  return cycle;
}
