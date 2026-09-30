import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { restingFace } from './faceControl';
import { changedPixels, renderCloseUp, speckle } from './faceRender';
import { PRESETS } from './presets';
import { Surfer } from './Surfer';

const litSky = (renderer: THREE.WebGPURenderer): Sky => {
  const sky = new Sky(DEFAULT_ATMOSPHERE);
  sky.update(renderer, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), 2); // a morning sun ahead of the face and high
  return sky;
};
const v3 = (a: readonly number[]): THREE.Vector3 => new THREE.Vector3(a[0], a[1], a[2]);

/** Pixels where the eyeballs show: the render with them against the render without. */
async function eyePixels(renderer: THREE.WebGPURenderer, s: Surfer): Promise<number> {
  const eye = v3(s.landmarks!.eyes[0]);
  const from = eye.clone().add(new THREE.Vector3(0, 0, 0.3));
  const eyes = s.group.getObjectByProperty('name', `${s.preset.name}_eyes`)!;
  const shown = await renderCloseUp(renderer, s, eye, from, 9);
  eyes.visible = false;
  const hidden = await renderCloseUp(renderer, s, eye, from, 9);
  eyes.visible = true;
  return changedPixels(shown, hidden);
}

registerSelfTest({
  name: 'face: a blink closes the lids over the eyes, for all three (closeup spec §6)',
  async run(renderer) {
    const sky = litSky(renderer);
    const out: string[] = [];
    let pass = true;
    for (const name of ['female', 'male', 'grommet'] as const) {
      const s = await Surfer.load(PRESETS[name], sky);
      s.setOnLand(false);
      s.setFace(restingFace());
      const open = await eyePixels(renderer, s);
      s.setFace({ ...restingFace(), blinkL: 1, blinkR: 1 });
      const shut = await eyePixels(renderer, s);
      pass &&= open > 400 && shut < 0.05 * open;
      out.push(`${name} ${open} → ${shut} eye px`);
    }
    return { pass, detail: out.join('; ') };
  },
});

registerSelfTest({
  name: "face: pores add fine local contrast to Shazza's cheek (closeup spec §4.2)",
  async run(renderer) {
    const s = await Surfer.load(PRESETS.female, litSky(renderer));
    s.setFace(restingFace());
    for (const o of s.group.children) o.traverse((m) => { if (m.name.endsWith('_hair') || m.name.endsWith('_hairDry')) m.visible = false; });
    const L = s.landmarks!;
    const cheek = v3(L.eyes[0]).add(new THREE.Vector3(0.012, -0.03, 0.012));
    const from = cheek.clone().add(new THREE.Vector3(0.03, 0, 0.18));
    s.pores.value = 0;
    const off = speckle(await renderCloseUp(renderer, s, cheek, from, 6, 128), 128, 48);
    s.pores.value = 1;
    const on = speckle(await renderCloseUp(renderer, s, cheek, from, 6, 128), 128, 48);
    return {
      pass: on.cv > 1.3 * off.cv && on.cv > 0.25 && on.px > 2000,
      detail: `cheek local contrast ${off.cv.toFixed(2)}% without pores → ${on.cv.toFixed(2)}% with, over ${on.px} px`,
    };
  },
});
