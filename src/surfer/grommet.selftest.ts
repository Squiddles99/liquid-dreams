import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { PRESETS } from './presets';
import { Surfer } from './Surfer';

/** The luminance spread across a close-up of the cheek: freckles make it speckled (grommet spec §7). */
async function cheekSpread(renderer: THREE.WebGPURenderer, s: Surfer): Promise<{ spread: number; px: number }> {
  const scene = new THREE.Scene();
  scene.add(s.group);
  s.group.updateMatrixWorld(true);
  // His left cheek, below the eye and out from the nose (Grommet's eye is ~4.5 cm above and 8 cm ahead of the head
  // joint): the eye, brows and nostrils stay out of the central 32 × 32 px read (~2.5 cm across).
  const cheek = s.rest.joint.head.clone().add(new THREE.Vector3(0.045, 0.012, 0.08));
  const cam = new THREE.PerspectiveCamera(12, 1, 0.01, 5);
  cam.position.copy(cheek.clone().add(new THREE.Vector3(0.05, 0, 0.35)));
  cam.lookAt(cheek);
  const target = new THREE.RenderTarget(96, 96);
  const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clear);
  renderer.setClearColor(0x000000, 0); // only the face's pixels count
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const px = await renderer.readRenderTargetPixelsAsync(target, 32, 32, 32, 32);
  target.dispose();
  const lum: number[] = [];
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / Math.max(1, lum.length);
  return { spread: Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, lum.length)), px: lum.length };
}

registerSelfTest({
  name: "grommet: his cheek is freckled and Shazza's isn't",
  async run(renderer) {
    const sky = new Sky(DEFAULT_ATMOSPHERE);
    sky.update(renderer, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), 2); // a morning sun ahead of him and high: the face lit
    const g = await Surfer.load(PRESETS.grommet, sky), f = await Surfer.load(PRESETS.female, sky);
    const [cg, cf] = [await cheekSpread(renderer, g), await cheekSpread(renderer, f)];
    const [sg, sf] = [cg.spread, cf.spread];
    return {
      pass: sg > 1.6 * sf && sg > 4 && cg.px > 900 && cf.px > 900,
      detail: `cheek luminance spread: grommet ${sg.toFixed(1)}, shazza ${sf.toFixed(1)} (0–255), over ${cg.px}/${cf.px} of 1024 px`,
    };
  },
});
