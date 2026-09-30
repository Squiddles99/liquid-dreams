import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glbFloats } from './glbData';
import { PRESETS } from './presets';
import { BONES, type SurferManifest, manifestProblems } from './rig';

/** The JSON chunk of a .glb (the binary glTF container: 12-byte header, then a JSON chunk). */
export function glbJson(path: string): any {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  if (v.getUint32(16, true) !== 0x4e4f534a) throw new Error(`${path}: the first chunk is not JSON`);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + v.getUint32(12, true))));
}

for (const name of ['female', 'male', 'grommet'] as const) {
  describe(`the ${name} surfer build`, () => {
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
    const gltf = glbJson(`public/surfer/${name}.glb`);
    it('keeps the skeleton contract (names, parents, lengths, legs down)', () => expect(manifestProblems(man)).toEqual([]));
    it('is the preset’s height (±1 cm)', () => expect(Math.abs(man.heightM - PRESETS[name].heightM)).toBeLessThan(0.01));
    it('skins to exactly the contract bones', () => {
      expect(gltf.skins.length).toBe(1);
      expect(gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name).sort()).toEqual([...BONES].sort());
    });
    it('keeps the body within budget (≤ 24k triangles, ≤ 4 materials; ≤ 40k in all)', () => {
      const body = man.meshes.find((m) => m.materials.includes('body'))!;
      expect(body.triangles).toBeLessThanOrEqual(24000);
      expect(body.materials.length).toBeLessThanOrEqual(4);
      expect(man.meshes.reduce((s, m) => s + m.triangles, 0)).toBeLessThanOrEqual(40000);
    });
    it('carries the wardrobe masks on the body (TEXCOORD_1–3), and hair and eyes', () => {
      const matName = (i: number): string => gltf.materials[i].name;
      const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => matName(p.material) === 'body'));
      for (const p of body.primitives) for (const a of ['TEXCOORD_1', 'TEXCOORD_2', 'TEXCOORD_3']) expect(p.attributes[a], a).toBeDefined();
      const all = gltf.meshes.flatMap((m: any) => m.primitives.map((p: any) => matName(p.material)));
      for (const m of ['hair', 'eyes']) expect(all).toContain(m);
      expect(all.includes('boardies')).toBe(name !== 'female');
    });
    it('carries the face paint on the body and the iris on the eyes (COLOR_0; gate 2)', () => {
      const matName = (i: number): string => gltf.materials[i].name;
      for (const m of ['body', 'eyes']) {
        const mesh = gltf.meshes.find((x: any) => x.primitives.some((p: any) => matName(p.material) === m));
        for (const p of mesh.primitives) expect(p.attributes.COLOR_0, m).toBeDefined();
      }
    });
  });
}

describe('the grommet build (grommet spec §2, §5, §7)', () => {
  const man: SurferManifest = JSON.parse(readFileSync('public/surfer/grommet.manifest.json', 'utf8'));
  const gltf = glbJson('public/surfer/grommet.glb');
  it('writes his landmarks: eyes level either side of the midline, ears wider than the eyes, the nose ahead of them', () => {
    const L = man.landmarks!;
    expect(L.eyes[0][0]).toBeGreaterThan(0.02);
    expect(L.eyes[1][0]).toBeLessThan(-0.02);
    expect(Math.abs(L.eyes[0][1] - L.eyes[1][1])).toBeLessThan(0.005);
    expect(L.ears[0][0]).toBeGreaterThan(L.eyes[0][0] + 0.02);
    expect(L.nose[2]).toBeGreaterThan(L.eyes[0][2] + 0.01);
    expect(L.lipFront[2]).toBeGreaterThan(L.mouth[2]);
  });
  it('carries about 8 pimples on his face, each 1.5–2.5 mm', () => {
    const P = man.skin!.pimples;
    expect(P.length).toBe(8);
    for (const [, y, , r] of P) {
      expect(y).toBeGreaterThan(man.landmarks!.mouth[1] - 0.06);
      expect(r).toBeGreaterThanOrEqual(0.0015);
      expect(r).toBeLessThanOrEqual(0.0025);
    }
  });
  it('is built in the game’s space: identity nodes, feet on 0, the top of his head at his height', () => {
    for (const n of gltf.nodes) if (n.mesh !== undefined || /armature/.test(n.name)) expect([n.translation, n.rotation, n.scale].every((v) => v === undefined), n.name).toBe(true);
    const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'body'));
    const pos = gltf.accessors[body.primitives[0].attributes.POSITION];
    expect(pos.min[1]).toBeCloseTo(0, 2);
    expect(pos.max[1]).toBeCloseTo(1.52, 2);
  });
});

describe("Grommet's mop (grommet spec §3)", () => {
  const gltf = glbJson('public/surfer/grommet.glb');
  const hair = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'hair'));
  const pos = gltf.accessors[hair.primitives[0].attributes.POSITION];
  const man: SurferManifest = JSON.parse(readFileSync('public/surfer/grommet.manifest.json', 'utf8'));
  it('stands well out from his head: wider than his ears by 5 cm or more, up to 7 cm or more above the head joint', () => {
    const ears = man.landmarks!.ears, head = man.bones.find((b) => b.name === 'head')!;
    expect(pos.max[0] - ears[0][0]).toBeGreaterThan(0.05);
    expect(ears[1][0] - pos.min[0]).toBeGreaterThan(0.05);
    expect(pos.max[1] - head.head[1]).toBeGreaterThan(0.07 + 0.17);
  });
  it('keeps the curls above his glasses in front', () => {
    const lowFront = pos.min[1];
    expect(lowFront).toBeGreaterThan(man.landmarks!.nose[1] - 0.2);
  });
});

describe("Grommet's glasses and teeth (grommet spec §4)", () => {
  const path = 'public/surfer/grommet.glb', gltf = glbJson(path);
  const man: SurferManifest = JSON.parse(readFileSync('public/surfer/grommet.manifest.json', 'utf8'));
  const L = man.landmarks!;
  const meshNamed = (n: string): any => gltf.meshes[gltf.nodes.find((x: any) => x.name === n).mesh];
  const pointsOf = (mesh: any, material: string): number[][] => mesh.primitives.filter((p: any) => gltf.materials[p.material].name === material).flatMap((p: any) => {
    const f = glbFloats(path, gltf, p.attributes.POSITION), out: number[][] = [];
    for (let i = 0; i < f.length; i += 3) out.push([f[i], f[i + 1], f[i + 2]]);
    return out;
  });
  it('centres a lens 5 cm across in front of each eye (within 1 cm of its axis)', () => {
    const lens = pointsOf(meshNamed('grommet_glasses'), 'lens');
    for (const eye of L.eyes) {
      const mine = lens.filter((p) => Math.sign(p[0]) === Math.sign(eye[0]));
      const c = [0, 1, 2].map((k) => mine.reduce((s, p) => s + p[k], 0) / mine.length);
      expect(Math.hypot(c[0] - eye[0], c[1] - eye[1])).toBeLessThan(0.01);
      expect(c[2]).toBeGreaterThan(eye[2] + 0.015);
      const span = Math.max(...mine.map((p) => p[0])) - Math.min(...mine.map((p) => p[0]));
      expect(span).toBeGreaterThan(0.045);
      expect(span).toBeLessThan(0.055);
    }
  });
  it('runs the arms back to his ears', () => {
    const frame = pointsOf(meshNamed('grommet_glasses'), 'glasses');
    for (const ear of L.ears) {
      const reach = Math.min(...frame.map((p) => Math.hypot(p[0] - ear[0], p[1] - ear[1], p[2] - ear[2])));
      expect(reach).toBeLessThan(0.025);
    }
  });
  it('puts the buck teeth in his mouth: behind the lip’s front, ahead of the mouth’s centre', () => {
    const teeth = pointsOf(meshNamed('grommet_teeth'), 'teeth');
    const front = Math.max(...teeth.map((p) => p[2]));
    expect(front).toBeLessThan(L.lipFront[2] - 0.0005);
    expect(front).toBeGreaterThan(L.mouth[2]);
  });
  it('skins the glasses and teeth only to the head', () => {
    const head = gltf.skins[0].joints.findIndex((j: number) => gltf.nodes[j].name === 'head');
    for (const n of ['grommet_glasses', 'grommet_teeth']) {
      for (const p of meshNamed(n).primitives) {
        const j = glbFloats(path, gltf, p.attributes.WEIGHTS_0);
        const idx = gltf.accessors[p.attributes.JOINTS_0];
        expect(idx, n).toBeDefined();
        for (let i = 0; i < j.length; i += 4) expect(j[i], n).toBeCloseTo(1, 3);
      }
    }
    expect(head).toBeGreaterThanOrEqual(0);
  });
});
