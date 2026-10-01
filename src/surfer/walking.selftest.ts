import * as THREE from 'three/webgpu';
import { registerSelfTest } from '../dev/selfTest';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { Sky } from '../sky/Sky';
import { type Outfit, PRESETS, type PresetName } from './presets';
import { Surfer } from './Surfer';

/** Flat colours by part, so a render says which part covers which pixel. */
const ROLES: [readonly string[], THREE.Color][] = [
  [['tee'], new THREE.Color(1, 0, 0)],
  [['body'], new THREE.Color(0, 0, 1)],
  [['hair', 'hairDry', 'hairHat'], new THREE.Color(0, 1, 0)],
  [['cap', 'capFront', 'bucketHat'], new THREE.Color(1, 1, 0)],
  [['boardies'], new THREE.Color(0, 1, 1)],
];
type Part = 'tee' | 'body' | 'hair' | 'hat' | 'boardies' | 'other' | 'none';
const PARTS: Part[] = ['tee', 'body', 'hair', 'hat', 'boardies'];

const surfers = new Map<PresetName, Promise<Surfer>>();
function surfer(name: PresetName, sky: Sky): Promise<Surfer> {
  if (!surfers.has(name)) surfers.set(name, Surfer.load(PRESETS[name], sky));
  return surfers.get(name)!;
}

/**
 * What fraction of the central `n`×`n` px (a multiple of 16: float rows are padded to 256 bytes) of a 96 px orthographic view, `widthM` across, looking from `from` to `at`,
 * each part covers; every mesh drawn in its part's flat colour (the rest black), as the outfit shows them.
 */
async function coverage(renderer: THREE.WebGPURenderer, s: Surfer, outfit: Outfit, at: THREE.Vector3, from: THREE.Vector3, widthM: number, n = 32): Promise<Record<Part, number>> {
  s.setOutfit(outfit);
  s.setOnLand(true);
  const scene = new THREE.Scene();
  scene.add(s.group);
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const flat = new Map<string, THREE.Material>();
  s.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    swapped.push([mesh, mesh.material]);
    const black = new THREE.MeshBasicNodeMaterial({ color: 0x000000 });
    mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(() => black)[0];
  });
  for (const [names, color] of ROLES) for (const name of names) for (const mesh of s.meshesWith(name)) {
    const key = color.getHexString();
    if (!flat.has(key)) flat.set(key, new THREE.MeshBasicNodeMaterial({ color }));
    mesh.material = flat.get(key)!;
  }
  s.group.updateMatrixWorld(true);
  const cam = new THREE.OrthographicCamera(-widthM / 2, widthM / 2, widthM / 2, -widthM / 2, 0.01, 10);
  cam.position.copy(from);
  if (from.y > at.y + 0.5) cam.up.set(0, 0, -1); // looking down: the face toward the top of the image
  cam.lookAt(at);
  const target = new THREE.RenderTarget(96, 96, { type: THREE.FloatType });
  const clear = new THREE.Color(), alpha = renderer.getClearAlpha();
  renderer.getClearColor(clear);
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, alpha);
  const o = (96 - n) / 2;
  const px = (await renderer.readRenderTargetPixelsAsync(target, o, o, n, n)) as Float32Array;
  target.dispose();
  for (const [mesh, mat] of swapped) mesh.material = mat;
  const out = { tee: 0, body: 0, hair: 0, hat: 0, boardies: 0, other: 0, none: 0 } as Record<Part, number>;
  const palette = ROLES.map(([, c]) => c);
  for (let i = 0; i < n * n; i++) {
    const r = px[4 * i], g = px[4 * i + 1], b = px[4 * i + 2], a = px[4 * i + 3];
    if (a < 0.5) { out.none++; continue; }
    if (r + g + b < 0.3) { out.other++; continue; }
    let best = 0, d = Infinity;
    palette.forEach((c, k) => {
      const e = (c.r - Math.min(1, r)) ** 2 + (c.g - Math.min(1, g)) ** 2 + (c.b - Math.min(1, b)) ** 2;
      if (e < d) { d = e; best = k; }
    });
    out[PARTS[best]]++;
  }
  for (const k of Object.keys(out) as Part[]) out[k] /= n * n;
  return out;
}

const pct = (v: number): string => `${Math.round(100 * v)}%`;
const sternum = (s: Surfer): THREE.Vector3 => s.rest.joint.spine_03.clone().lerp(s.rest.joint.neck, 0.35);
const NAMES: PresetName[] = ['female', 'male', 'grommet'];
const SURF: Record<PresetName, Outfit> = { female: 'bikini', male: 'boardies', grommet: 'rashieAndBoardies' };

function sky(renderer: THREE.WebGPURenderer): Sky {
  const s = new Sky(DEFAULT_ATMOSPHERE);
  s.update(renderer, new THREE.Vector3(0.3, 0.8, 0.5).normalize(), 2);
  return s;
}

registerSelfTest({
  name: 'walking: the tee covers the torso',
  async run(renderer) {
    const sk = sky(renderer), notes: string[] = [];
    let pass = true;
    for (const name of NAMES) {
      const s = await surfer(name, sk), at = sternum(s);
      const c = await coverage(renderer, s, 'walking', at, at.clone().add(new THREE.Vector3(0, 0, 2)), 0.4);
      pass &&= c.tee >= 0.95;
      notes.push(`${name} tee ${pct(c.tee)}`);
    }
    return { pass, detail: `the sternum's 32 px, front view, walking: ${notes.join(', ')} (≥ 95%)` };
  },
});

registerSelfTest({
  name: 'walking: in surf gear the tee is gone and the swimwear shows',
  async run(renderer) {
    const sk = sky(renderer), notes: string[] = [];
    let pass = true;
    for (const name of NAMES) {
      const s = await surfer(name, sk), at = sternum(s);
      const c = await coverage(renderer, s, SURF[name], at, at.clone().add(new THREE.Vector3(0, 0, 2)), 0.3);
      pass &&= c.tee === 0;
      notes.push(`${name} tee ${pct(c.tee)}`);
    }
    const t = await surfer('male', sk), hips = t.rest.joint.pelvis.clone().add(new THREE.Vector3(0, -0.04, 0));
    const b = await coverage(renderer, t, 'boardies', hips, hips.clone().add(new THREE.Vector3(0, 0, 2)), 0.3, 16);
    pass &&= b.boardies >= 0.8;
    return { pass, detail: `${notes.join(', ')} at the sternum (0%); T-Bone's boardies at the hips ${pct(b.boardies)} (≥ 80%)` };
  },
});

registerSelfTest({
  name: "walking: the hat hides the crown's hair",
  async run(renderer) {
    const sk = sky(renderer), notes: string[] = [];
    let pass = true;
    for (const name of ['male', 'grommet'] as PresetName[]) {
      const s = await surfer(name, sk), top = s.rest.joint.head.clone().add(new THREE.Vector3(0, 0.12, 0.01));
      const c = await coverage(renderer, s, 'walking', top, top.clone().add(new THREE.Vector3(0, 2, 0)), 0.3);
      pass &&= c.hair <= 0.01 && c.hat >= 0.9;
      notes.push(`${name} hat ${pct(c.hat)}, hair ${pct(c.hair)}`);
    }
    return { pass, detail: `the crown's 32 px from above, walking: ${notes.join('; ')} (hat ≥ 90%, hair ≤ 1%)` };
  },
});
