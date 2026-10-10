// south-side (spec 2026-10-11-south-side-design.md): bedHeightAt along the lines the spec names.
// node tools/_southEdge.ts   (prints the old square's lines, the traced edge's crossings and its normals)
import { runnerImport } from 'vite';
const { buildBathymetry, bedHeightAt } = (await runnerImport<typeof import('../src/seabed/bathymetry')>('/src/seabed/bathymetry.ts')).module;
const b = buildBathymetry();
const h = (x: number, z: number) => bedHeightAt(b, x, z).toFixed(1).padStart(6);
const line = (label: string, pts: [number, number][]) => {
  console.log(`\n${label}`);
  for (const [x, z] of pts) console.log(`  (${x.toFixed(1).padStart(7)}, ${z.toFixed(1).padStart(6)})  ${h(x, z)}`);
};
const range = (a: number, c: number, s: number) => Array.from({ length: Math.floor((c - a) / s) + 1 }, (_, i) => a + i * s);
line('z 200, x -200 -> -100 (the old square west wall)', range(-200, -100, 5).map((x) => [x, 200]));
line('x -120, z 200 -> 280 (the old square south leg)', range(200, 280, 5).map((z) => [-120, z]));
for (const x of [-100, -40, 20]) line(`x ${x}, z 0 -> 80 (across the traced south edge)`, range(0, 80, 5).map((z) => [x, z]));
// The traced edge (spec table, world frame) and its normal at three points, -30 m (shelf) -> +30 m (seaward).
const TRACE: [number, number][] = [[-130, 0], [-131, 14], [-83, 17], [-35, 22], [-12, 30], [9, 40], [64, 46]];
for (const x of [-100, -40, 20]) {
  const j = TRACE.findIndex((p, i) => i > 0 && TRACE[i - 1][0] <= x && p[0] >= x);
  const [a, c] = [TRACE[j - 1], TRACE[j]], t = (x - a[0]) / (c[0] - a[0]), z = a[1] + t * (c[1] - a[1]);
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]), n: [number, number] = [-(c[1] - a[1]) / len, (c[0] - a[0]) / len];
  line(`normal at the trace's (${x}, ${z.toFixed(1)}), n = (${n[0].toFixed(2)}, ${n[1].toFixed(2)}), s -30 -> 30`, range(-30, 30, 5).map((s) => [x + s * n[0], z + s * n[1]]));
}
