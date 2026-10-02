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

async function frontOfHead(renderer: THREE.WebGPURenderer): Promise<{ withHair: Float32Array; without: Float32Array }> {
  const sky = new Sky(DEFAULT_ATMOSPHERE);
  sky.update(renderer, new THREE.Vector3(-0.5, 0.6, 0.3).normalize(), 2); // a morning sun off her right shoulder
  const s = await Surfer.load(PRESETS.female, sky);
  s.setOutfit('bikini');
  s.setOnLand(true); // dry hair
  s.setFace(restingFace());
  const L = s.landmarks!;
  const eyes = new THREE.Vector3(...L.eyes[0]).add(new THREE.Vector3(...L.eyes[1])).multiplyScalar(0.5);
  const look = eyes.clone().add(new THREE.Vector3(0, -0.02, 0));
  const from = look.clone().add(new THREE.Vector3(0, 0, 0.6));
  const hair: THREE.Object3D[] = [];
  s.group.traverse((o) => { if (o.name.endsWith('_hairDry')) hair.push(o); });
  const withHair = await renderCloseUp(renderer, s, look, from, 34, SIZE);
  for (const h of hair) h.visible = false;
  const without = await renderCloseUp(renderer, s, look, from, 34, SIZE);
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
    const changed = new Set(hairPixels(withHair, without).map((i) => i / 4));
    // A stippled edge is coverage flickering pixel to pixel: a hair pixel whose coverage (alpha over ½) disagrees with
    // at least three of its four neighbours. A soft or solid edge has almost none.
    const on = (x: number, y: number): boolean => withHair[4 * (y * SIZE + x) + 3] > 0.5;
    let isolated = 0;
    for (const p of changed) {
      const x = p % SIZE, y = (p - x) / SIZE;
      if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) continue;
      const c = on(x, y);
      const differ = Number(on(x - 1, y) !== c) + Number(on(x + 1, y) !== c) + Number(on(x, y - 1) !== c) + Number(on(x, y + 1) !== c);
      if (differ >= 3) isolated++;
    }
    const frac = isolated / Math.max(1, changed.size);
    return { pass: changed.size > 3000 && frac < 0.01, detail: `${isolated} isolated of ${changed.size} hair px (${(100 * frac).toFixed(2)}%)` };
  },
});
