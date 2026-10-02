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

registerSelfTest({
  name: "face: Grommet's minus lenses make his eyes look smaller (closeup spec §4.2, ruling 3)",
  async run(renderer) {
    const s = await Surfer.load(PRESETS.grommet, litSky(renderer));
    s.setFace(restingFace());
    const glasses = s.group.getObjectByProperty('name', 'grommet_glasses')!;
    s.setOnLand(false);
    const bare = await eyePixels(renderer, s);
    // His glasses come with the walking clothes (walking spec §4); the hat and the rest aren't what's measured.
    s.setOutfit('walking');
    s.setOnLand(true);
    glasses.visible = false; // the frames and lenses themselves aren't counted, only what the eye looks like
    for (const m of ['bucketHat', 'hairHat']) for (const mesh of s.meshesWith(m)) mesh.visible = false;
    const behind = await eyePixels(renderer, s);
    s.setOutfit('rashieAndBoardies');
    s.setOnLand(false);
    return { pass: bare > 400 && behind < 0.9 * bare, detail: `his eye ${bare} px bare → ${behind} px behind the lens (${((100 * behind) / bare).toFixed(0)}%)` };
  },
});

registerSelfTest({
  name: "face: Grommet's grin shows his buck teeth (closeup spec §3, §5.1)",
  async run(renderer) {
    const s = await Surfer.load(PRESETS.grommet, litSky(renderer));
    s.setOnLand(false);
    const mouth = v3(s.landmarks!.lipFront);
    const from = mouth.clone().add(new THREE.Vector3(0, 0, 0.3));
    const teeth = s.group.getObjectByProperty('name', 'grommet_teeth')!;
    const shown = async (): Promise<number> => {
      const a = await renderCloseUp(renderer, s, mouth, from, 12);
      teeth.visible = false;
      const b = await renderCloseUp(renderer, s, mouth, from, 12);
      teeth.visible = true;
      return changedPixels(a, b);
    };
    s.setFace({ ...restingFace(), smile: 0.5 });
    const grin = await shown();
    return { pass: grin > 80, detail: `${grin} teeth px at his resting grin` };
  },
});

registerSelfTest({
  name: "hair: Shazza's dry crown is solid at the roots (the cards' root → tip read the right way round)",
  async run(renderer) {
    const s = await Surfer.load(PRESETS.female, litSky(renderer));
    s.setOnLand(true);
    const body = s.group.getObjectByProperty('name', 'female_body')!;
    const eyes = s.group.getObjectByProperty('name', 'female_eyes')!;
    body.visible = false;
    eyes.visible = false;
    // From the front, just inside the crown's outline, where only a layer or two of cards (their roots) cover it:
    // from above, ten layers hide any holes.
    const crown = s.rest.joint.head.clone().add(new THREE.Vector3(0, 0.1, 0.0));
    const size = 96;
    const px = await renderCloseUp(renderer, s, crown, crown.clone().add(new THREE.Vector3(0, 0.02, 0.6)), 22, size);
    body.visible = true;
    eyes.visible = true;
    let solid = 0, n = 0;
    for (let x = 30; x < 66; x++) {
      // Not the part (the image's middle columns): a centre part shows a line of scalp between the combed-apart halves,
      // and with the body hidden that line is see-through (dune select spec §13.1). What this measures is the roots'
      // fade read the right way round, either side of it.
      if (Math.abs(x - size / 2) < 3) continue;
      let top = -1;
      for (let y = size - 1; y >= 0; y--) if (px[4 * (y * size + x) + 3] > 0.5) { top = y; break; }
      if (top < 8) continue;
      for (let y = top - 2; y > top - 8; y--) {
        n++;
        if (px[4 * (y * size + x) + 3] > 0.5) solid++;
      }
    }
    return { pass: n > 100 && solid / n > 0.97, detail: `${((100 * solid) / Math.max(1, n)).toFixed(1)}% of ${n} px just inside the crown's outline covered by hair` };
  },
});

/**
 * The lashes alone, straight on at the left eye, 128 px across 4.7 cm: in the columns between the lashes' ends, the
 * share that meet lash at least 60% opaque (a solid line at the lid), and of the lash pixels the share partly covered
 * (soft edges, not an alpha-tested comb).
 */
async function lashRead(renderer: THREE.WebGPURenderer, s: Surfer): Promise<{ line: number; soft: number; px: number }> {
  const eye = v3(s.landmarks!.eyes[0]);
  const hidden: THREE.Object3D[] = [];
  s.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name !== 'lashes' && mesh.visible) { mesh.visible = false; hidden.push(mesh); }
  });
  const n = 128;
  const px = await renderCloseUp(renderer, s, eye, eye.clone().add(new THREE.Vector3(0, 0, 0.3)), 9, n);
  for (const o of hidden) o.visible = true;
  const colMax = new Array(n).fill(0);
  let lash = 0, partial = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = px[4 * (y * n + x) + 3];
    if (a <= 0.02) continue;
    lash++;
    if (a > 0.1 && a < 0.9) partial++;
    colMax[x] = Math.max(colMax[x], a);
  }
  const cols = colMax.map((a, x) => (a > 0.02 ? x : -1)).filter((x) => x >= 0);
  const span = cols.length ? colMax.slice(cols[0], cols[cols.length - 1] + 1) : [];
  return { line: span.length ? span.filter((a) => a >= 0.6).length / span.length : 0, soft: lash ? partial / lash : 0, px: lash };
}

registerSelfTest({
  name: 'face: the lashes are a soft dark line at the lid, not a comb, for all three (Andrew)',
  async run(renderer) {
    const sky = litSky(renderer);
    const out: string[] = [];
    let pass = true;
    for (const name of ['female', 'male', 'grommet'] as const) {
      const s = await Surfer.load(PRESETS[name], sky);
      s.setOnLand(false);
      s.setFace(restingFace());
      const r = await lashRead(renderer, s);
      pass &&= r.line >= 0.9 && r.soft >= 0.15 && r.px > 150;
      out.push(`${name}: solid line ${Math.round(100 * r.line)}% of the lid's columns, soft ${Math.round(100 * r.soft)}% of ${r.px} lash px`);
    }
    return { pass, detail: `${out.join('; ')} (line ≥ 90%, soft ≥ 15%)` };
  },
});
