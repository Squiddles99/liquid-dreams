import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { PRESETS } from './presets';
import { Surfer } from './Surfer';

/**
 * How speckled a close-up of the cheek is: each pixel's luminance against the mean of its four neighbours, averaged and
 * taken over the mean luminance, in %. Local, so the smooth light falling off across the cheek doesn't count; freckles
 * (1–4 mm, ~1–5 px here) do. Rendered in float (an 8-bit target blew the lit cheek out to white) and relative, so the
 * exposure doesn't matter.
 */
async function cheekSpeckle(renderer: THREE.WebGPURenderer, s: Surfer, hair: boolean): Promise<{ cv: number; px: number }> {
  const scene = new THREE.Scene();
  scene.add(s.group);
  s.group.traverse((o) => {
    if (o.name.endsWith('_hair')) o.visible = hair;
  });
  s.group.updateMatrixWorld(true);
  // His left cheek, below the eye and out from the nose (Grommet's eye is ~4.5 cm above and 8 cm ahead of the head
  // joint): the eye, brows and nostrils stay out of the central 32 × 32 px read (~2.5 cm across).
  const cheek = s.rest.joint.head.clone().add(new THREE.Vector3(0.045, 0.012, 0.08));
  const cam = new THREE.PerspectiveCamera(12, 1, 0.01, 5);
  cam.position.copy(cheek.clone().add(new THREE.Vector3(0.05, 0, 0.35)));
  cam.lookAt(cheek);
  const target = new THREE.RenderTarget(96, 96, { type: THREE.FloatType });
  const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clear);
  renderer.setClearColor(0x000000, 0); // only the face's pixels count
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const px = (await renderer.readRenderTargetPixelsAsync(target, 32, 32, 32, 32)) as Float32Array;
  target.dispose();
  const N = 32, L = (x: number, y: number): number => {
    const i = 4 * (y * N + x);
    return px[i + 3] > 0 ? 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2] : Number.NaN;
  };
  let covered = 0, sum = 0, detail = 0, n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = L(x, y);
    if (Number.isNaN(c)) continue;
    covered++;
    sum += c;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) continue;
    const around = (L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1)) / 4;
    if (Number.isNaN(around)) continue;
    detail += Math.abs(c - around);
    n++;
  }
  const mean = sum / Math.max(1, covered);
  return { cv: mean > 0 && n > 0 ? (100 * detail) / n / mean : 0, px: covered };
}

registerSelfTest({
  name: "grommet: his cheek is freckled and Shazza's isn't",
  async run(renderer) {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), 2); // a morning sun ahead of him and high: the face lit
    const g = await Surfer.load(PRESETS.grommet, sky), f = await Surfer.load(PRESETS.female, sky);
    // The freckles are judged on bare skin (hair hidden); with his hair shown, the cheek must read the same: before any
    // pose, nothing (the wet curls' pull) may smear hair across his face.
    const bare = await cheekSpeckle(renderer, g, false), withHair = await cheekSpeckle(renderer, g, true), shazza = await cheekSpeckle(renderer, f, false);
    const pass = bare.cv > 1.6 * shazza.cv && bare.cv > 0.5 && Math.abs(withHair.cv - bare.cv) < 0.25 * bare.cv && bare.px > 900 && shazza.px > 900;
    return {
      pass,
      detail: `cheek speckle (local luminance contrast / mean): grommet ${bare.cv.toFixed(1)}% bare, ${withHair.cv.toFixed(1)}% with his hair; shazza ${shazza.cv.toFixed(1)}%; over ${bare.px}/${shazza.px} of 1024 px`,
    };
  },
});
