import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { restingFace } from './faceControl';
import { renderCloseUp } from './faceRender';
import { PRESETS } from './presets';
import { Surfer } from './Surfer';

/**
 * Dry hair at the select screen's distance (dune select spec §13.1): Shazza front-on at 0.6 m, as Andrew saw her on the
 * dune. Only the hair is measured: the pixels the hair draws, against a render without it.
 */
const SIZE = 160;

async function frontOfHead(renderer: THREE.WebGPURenderer, opts: { hairAtlas?: boolean; size?: number; distM?: number; fovDeg?: number } = {}): Promise<{ withHair: Float32Array; without: Float32Array }> {
  const size = opts.size ?? SIZE;
  const dist = opts.distM ?? 0.6, fov = opts.fovDeg ?? 34;
  const sky = new Sky(DEFAULT_ATMOSPHERE);
  sky.update(renderer, new THREE.Vector3(-0.5, 0.6, 0.3).normalize(), 2); // a morning sun off her right shoulder
  const s = await Surfer.load(PRESETS.female, sky, undefined, { hairAtlas: opts.hairAtlas ?? true });
  s.setOutfit('bikini');
  s.setOnLand(true); // dry hair
  s.setFace(restingFace());
  const L = s.landmarks!;
  const eyes = new THREE.Vector3(...L.eyes[0]).add(new THREE.Vector3(...L.eyes[1])).multiplyScalar(0.5);
  const look = eyes.clone().add(new THREE.Vector3(0, -0.02, 0));
  const from = look.clone().add(new THREE.Vector3(0, 0, dist));
  const hair: THREE.Object3D[] = [];
  s.group.traverse((o) => { if (o.name.endsWith('_hairDry')) hair.push(o); });
  const withHair = await renderCloseUp(renderer, s, look, from, fov, size);
  for (const h of hair) h.visible = false;
  const without = await renderCloseUp(renderer, s, look, from, fov, size);
  for (const h of hair) h.visible = true;
  return { withHair, without };
}

/** The pixels the hair changes (any channel or coverage), as indices into the image. */
function hairPixels(a: Float32Array, b: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > 0.01 || Math.abs(a[i + 1] - b[i + 1]) > 0.01 || Math.abs(a[i + 2] - b[i + 2]) > 0.01 || Math.abs(a[i + 3] - b[i + 3]) > 0.05) out.push(i);
  }
  return out;
}

registerSelfTest({
  name: "hair: Shazza's dry hair reads blond, not sky-blue, at 0.6 m (dune select spec §13.1)",
  async run(renderer) {
    const { withHair, without } = await frontOfHead(renderer);
    const px = hairPixels(withHair, without).filter((i) => withHair[i + 3] > 0.5);
    // Blond hair is red-leaning in every light the dune sees; blue over red is the sky's mirror, not hair.
    const blue = px.filter((i) => withHair[i + 2] > withHair[i] * 1.02).length;
    const frac = blue / Math.max(1, px.length);
    return { pass: px.length > 3000 && frac < 0.05, detail: `${blue} of ${px.length} hair px bluer than red (${(100 * frac).toFixed(1)}%)` };
  },
});

registerSelfTest({
  name: "hair: Shazza's dry hair edges are soft, not stippled, at 0.6 m (dune select spec §13.1)",
  async run(renderer) {
    const { withHair, without } = await frontOfHead(renderer);
    // Where the hair is over the sky (nothing else drew there), its coverage is the hair's alpha. An alpha-tested,
    // dithered edge is all or nothing (nothing under the 0.5 test survives); a soft edge fades through partial coverage.
    const overSky = hairPixels(withHair, without).filter((i) => without[i + 3] === 0);
    const partial = overSky.filter((i) => withHair[i + 3] > 0.05 && withHair[i + 3] < 0.5).length;
    const frac = partial / Math.max(1, overSky.length);
    // Dithered: exactly 0%. Two-pass at this distance: about 2.7% (most over-sky hair is several cards deep).
    return { pass: overSky.length > 500 && frac > 0.02, detail: `${partial} of ${overSky.length} hair px over the sky partly covered (${(100 * frac).toFixed(1)}%)` };
  },
});

registerSelfTest({
  name: "hair: Shazza's dry hair glows on its shade side, never black, at 0.6 m (dune select spec §13.1)",
  async run(renderer) {
    const { withHair, without } = await frontOfHead(renderer);
    // The sun is off her right shoulder (image left is her right): the image's right half of the hair is the shade side.
    const lum = (i: number): number => 0.2126 * withHair[i] + 0.7152 * withHair[i + 1] + 0.0722 * withHair[i + 2];
    const half = (right: boolean): number[] => hairPixels(withHair, without).filter((i) => withHair[i + 3] > 0.5 && ((i / 4) % SIZE >= SIZE / 2) === right).map(lum).sort((a, b) => a - b);
    const median = (a: number[]): number => a[a.length >> 1] ?? 0;
    const lit = median(half(false)), shade = median(half(true));
    return { pass: shade > 0.25 * lit, detail: `median hair luminance: lit side ${lit.toFixed(3)}, shade side ${shade.toFixed(3)} (${((100 * shade) / Math.max(lit, 1e-6)).toFixed(0)}%)` };
  },
});

registerSelfTest({
  name: "hair: Shazza's dry hair shows its strands at 0.6 m (the strand atlas; dune select spec §13.2)",
  async run(renderer) {
    const size = 1024; // the head about as large as at 0.6 m in a 1080p frame
    // Strands read as direction: the falling hair beside the face varies strongly across its strands (left–right)
    // and little along them (up–down), where procedural noise varies alike both ways. Measured over the solidly
    // covered hair in the image's lower half (the fall), as mean |∂L/∂x| over mean |∂L/∂y|.
    const detail = (r: { withHair: Float32Array; without: Float32Array }): number => {
      const hair = new Set(hairPixels(r.withHair, r.without).filter((i) => r.withHair[i + 3] > 0.9).map((i) => i / 4));
      const L = (p: number): number => 0.2126 * r.withHair[4 * p] + 0.7152 * r.withHair[4 * p + 1] + 0.0722 * r.withHair[4 * p + 2];
      let gx = 0, gy = 0, n = 0;
      for (const p of hair) {
        const x = p % size, y = (p - x) / size;
        if (y < size / 2 || y === size - 1 || x === 0 || x === size - 1 || !hair.has(p + 1) || !hair.has(p + size)) continue; // row 0 is the top
        gx += Math.abs(L(p + 1) - L(p));
        gy += Math.abs(L(p + size) - L(p));
        n++;
      }
      return n > 2000 ? gx / Math.max(gy, 1e-6) : 0;
    };
    const ra = await frontOfHead(renderer, { hairAtlas: true, size }), rp = await frontOfHead(renderer, { hairAtlas: false, size });
    const atlas = detail(ra);
    const plain = detail(rp);
    return { pass: atlas > 1.2 * plain && plain > 0, detail: `the fall's strand direction (|∂x| / |∂y|): ${plain.toFixed(2)} without the atlas → ${atlas.toFixed(2)} with it` };
  },
});

registerSelfTest({
  name: "hair: at 10 m the strand atlas doesn't thin Shazza's hair (mipmaps; dune select spec §13.2)",
  async run(renderer) {
    // 10 m away in a 1080p frame at 34°, the head is ~40 px tall. The close-up camera stops at 5 m, so it stands at 4.5 m
    // with the field of view that gives the head the same size on screen (tan(3°)·10 m = tan(6.65°)·4.5 m): the same
    // footprint, so the same mipmaps.
    const covered = async (hairAtlas: boolean): Promise<number> => {
      const r = await frontOfHead(renderer, { hairAtlas, size: 96, distM: 4.5, fovDeg: 13.3 });
      return hairPixels(r.withHair, r.without).filter((i) => r.withHair[i + 3] > 0.5).length;
    };
    const plain = await covered(false), atlas = await covered(true);
    return { pass: plain > 200 && atlas > 0.8 * plain, detail: `hair px at 10 m: ${plain} without the atlas, ${atlas} with it` };
  },
});
