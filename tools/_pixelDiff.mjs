// whitewater Task 3: how two PNGs differ: the count of pixels whose RGBA differs by more than --tol (0: any), and the
// bounding box of those pixels. Electron's nativeImage decodes (no PNG dependency).
// npx electron tools/_pixelDiff.mjs <a.png> <b.png> [--tol=0] [--out=<mask.png>] (the differing pixels white over a dimmed a)
import { app, nativeImage } from 'electron';
import { writeFileSync } from 'node:fs';
const [a, b] = process.argv.filter((x) => /\.png$/i.test(x));
const tol = Number(process.argv.find((x) => x.startsWith('--tol='))?.slice(6) ?? 0);
app.whenReady().then(() => {
  const A = nativeImage.createFromPath(a), B = nativeImage.createFromPath(b);
  const sa = A.getSize(), sb = B.getSize();
  if (sa.width !== sb.width || sa.height !== sb.height) { console.log(`size differs: ${sa.width}x${sa.height} vs ${sb.width}x${sb.height}`); app.exit(2); return; }
  const pa = A.toBitmap(), pb = B.toBitmap();
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, worst = 0;
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]), Math.abs(pa[i + 3] - pb[i + 3]));
    worst = Math.max(worst, d);
    if (d > tol) { n++; const p = i / 4, x = p % sa.width, y = Math.floor(p / sa.width); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const out = process.argv.find((x) => x.startsWith('--out='))?.slice(6);
  if (out) {
    const m = Buffer.from(pa);
    for (let i = 0; i < m.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      if (d > tol) { m[i] = 0; m[i + 1] = 0; m[i + 2] = 255; } else { m[i] >>= 2; m[i + 1] >>= 2; m[i + 2] >>= 2; }
    }
    writeFileSync(out, nativeImage.createFromBitmap(m, sa).toPNG());
  }
  console.log(`${sa.width}x${sa.height}: ${n} pixels differ by > ${tol} (worst ${worst})${n ? `, bbox (${x0}, ${y0})–(${x1}, ${y1})` : ''}`);
  app.exit(0);
});
