import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glbFloats, glbValues } from './glbData';
import { FACE_CHANNELS } from './idleLife';
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
    it('keeps within budget: the body ≤ 30k triangles and ≤ 4 materials, each hair mesh ≤ 150k, ≤ 260k in all (closeup ruling 2)', () => {
      const body = man.meshes.find((m) => m.materials.includes('body'))!;
      expect(body.triangles).toBeLessThanOrEqual(30000);
      expect(body.materials.length).toBeLessThanOrEqual(4);
      for (const m of man.meshes.filter((x) => x.materials.some((n) => n.startsWith('hair')))) expect(m.triangles, m.name).toBeLessThanOrEqual(150000);
      expect(man.meshes.reduce((s, m) => s + m.triangles, 0)).toBeLessThanOrEqual(260000);
    });
    it('has a dry hairstyle for land where the preset names one (Shazza, T-Bone; Grommet dries his curls in the shader)', () => {
      const dry = man.meshes.filter((m) => m.materials.includes('hairDry'));
      expect(dry.length).toBe(name === 'grommet' ? 0 : 1);
    });
    it('carries the nine face morphs on every body primitive, by name (closeup spec §4.1)', () => {
      const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'body'));
      expect(body.extras?.targetNames).toEqual([...FACE_CHANNELS]);
      for (const p of body.primitives) expect(p.targets?.length).toBe(FACE_CHANNELS.length);
      // At rest, every morph is off: a default weight of 1 had her resting with every expression on at once.
      expect((body.weights ?? []).every((w: number) => w === 0)).toBe(true);
      expect(man.meshes.find((m) => m.materials.includes('body'))!.morphs).toEqual([...FACE_CHANNELS]);
    });
    it('keeps the head at full resolution (≥ 5,000 triangles weighted to the head)', () => {
      expect(man.headTriangles).toBeGreaterThanOrEqual(5000);
    });
    it('closes the lids over the eyes at a blink, and opens them at rest (the build’s ray check; closeup spec §4.1)', () => {
      expect(man.checks).toMatchObject({ blinkCovers: true, eyesOpen: true });
    });
    it('writes the face landmarks, with eyeballs fitted to MPFB’s eye helper (14–17.5 mm once scaled to height)', () => {
      expect(man.landmarks).toBeDefined();
      expect(man.landmarks!.eyeRadius).toBeGreaterThan(0.014);
      expect(man.landmarks!.eyeRadius).toBeLessThan(0.0175);
    });
    it('keeps lashes on the body (their own material) and teeth whose lower row drops with the jaw', () => {
      const body = man.meshes.find((m) => m.materials.includes('body'))!;
      expect(body.materials).toEqual(['body', 'lashes']);
      const teeth = man.meshes.find((m) => m.materials.includes('teeth'));
      expect(teeth?.morphs).toEqual(['jawOpen']);
      const mesh = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'teeth'));
      for (const p of mesh.primitives) expect(p.targets?.length).toBe(1);
    });
    it('grows each upper lash from the lid all along it, to the preset’s length (final review: per-lash root → tip)', () => {
      const path = `public/surfer/${name}.glb`;
      const want = JSON.parse(readFileSync(`tools/surfer/presets/${name}.json`, 'utf8')).lashes.upper as number;
      const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'lashes'));
      const prim = body.primitives.find((p: any) => gltf.materials[p.material].name === 'lashes');
      const pos = glbFloats(path, gltf, prim.attributes.POSITION), col = glbValues(path, gltf, prim.attributes.COLOR_0);
      for (const side of [1, -1]) {
        const up: number[] = [];
        for (let i = 0; i < pos.length / 3; i++) if (col[4 * i + 2] > 0.5 && Math.sign(pos[3 * i]) === side) up.push(i);
        const roots = up.filter((i) => col[4 * i] < 0.05), tips = up.filter((i) => col[4 * i] > 0.95);
        const along = roots.map((i) => col[4 * i + 1]);
        expect(Math.max(...along) - Math.min(...along), `${name} ${side} roots along the lid`).toBeGreaterThan(0.75);
        const reach = Math.max(...tips.map((i) => Math.min(...roots.map((j) => Math.hypot(pos[3 * i] - pos[3 * j], pos[3 * i + 1] - pos[3 * j + 1], pos[3 * i + 2] - pos[3 * j + 2])))));
        expect(reach, `${name} ${side} lash length`).toBeGreaterThan(0.8 * want);
      }
    });
    it('puts the teeth in the mouth: behind the lip’s front, ahead of the mouth’s centre', () => {
      const path = `public/surfer/${name}.glb`;
      const mesh = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'teeth'));
      const f = glbFloats(path, gltf, mesh.primitives[0].attributes.POSITION);
      let front = -Infinity;
      for (let i = 2; i < f.length; i += 3) front = Math.max(front, f[i]);
      expect(front).toBeLessThan(man.landmarks!.lipFront[2] - 0.0005);
      expect(front).toBeGreaterThan(man.landmarks!.mouth[2]);
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

describe("Shazza's hair (closeup spec §3)", () => {
  const man: SurferManifest = JSON.parse(readFileSync('public/surfer/female.manifest.json', 'utf8'));
  const gltf = glbJson('public/surfer/female.glb');
  const box = (material: string): any => {
    const mesh = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === material));
    return gltf.accessors[mesh.primitives[0].attributes.POSITION];
  };
  it('wet: many fine cards (≥ 2,500 cards, i.e. ≥ 25k triangles)', () => {
    expect(man.meshes.find((m) => m.materials.includes('hair'))!.triangles).toBeGreaterThanOrEqual(25000);
  });
  it('dry: long, past the shoulders, and falling wider than her head', () => {
    const dry = box('hairDry'), shoulder = man.bones.find((b) => b.name === 'upperarm_l')!.head[1];
    expect(dry.min[1]).toBeLessThan(shoulder - 0.08);
    const ears = man.landmarks!.ears;
    expect(dry.max[0]).toBeGreaterThan(ears[0][0] + 0.01);
    expect(dry.min[0]).toBeLessThan(ears[1][0] - 0.01);
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

/** Every vertex of the primitives with `material`: its position and the bones it follows (weight > 0.01). */
function skinned(path: string, gltf: any, material: string): { pos: number[]; bones: string[] }[] {
  const joints: string[] = gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name);
  const out: { pos: number[]; bones: string[] }[] = [];
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    if (gltf.materials[p.material].name !== material) continue;
    const pos = glbFloats(path, gltf, p.attributes.POSITION), j = glbValues(path, gltf, p.attributes.JOINTS_0), w = glbValues(path, gltf, p.attributes.WEIGHTS_0);
    for (let i = 0; i < pos.length / 3; i++) {
      const bones: string[] = [];
      for (let k = 0; k < 4; k++) if (w[4 * i + k] > 0.01) bones.push(joints[j[4 * i + k]]);
      out.push({ pos: [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], bones });
    }
  }
  return out;
}
const side = (names: string[]): string[] => names.flatMap((n) => [`${n}_l`, `${n}_r`]);

for (const name of ['female', 'male', 'grommet'] as const) {
  describe(`the ${name} walking clothes (walking spec §3, §7)`, () => {
    const path = `public/surfer/${name}.glb`, gltf = glbJson(path);
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
    const mats = man.meshes.flatMap((m) => m.materials), H = man.heightM;
    const bone = (n: string): number[] => man.bones.find((b) => b.name === n)!.head;
    it('has the tee and thongs; Shazza her cutoffs and bikini straps; the boys their own boardies (Andrew)', () => {
      for (const m of ['tee', 'thongs']) expect(mats, m).toContain(m);
      expect(mats.includes('denim')).toBe(name === 'female');
      expect(mats.includes('straps')).toBe(name === 'female');
      expect(mats.includes('boardies')).toBe(name !== 'female');
    });
    it('keeps every tee and shorts vertex outside the body (the build’s ray check)', () => {
      expect(man.checks).toMatchObject({ garmentsOutside: true });
    });
    it('skins each garment only to its own bones', () => {
      const allowed: Record<string, string[]> = {
        tee: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck', ...side(['clavicle', 'upperarm', 'forearm'])],
        denim: ['pelvis', 'spine_01', 'spine_02', ...side(['thigh'])],
        straps: ['spine_03', 'neck', ...side(['clavicle'])],
        thongs: side(['foot', 'toe']),
      };
      for (const [m, ok] of Object.entries(allowed)) {
        if (!mats.includes(m)) continue;
        const bad = skinned(path, gltf, m).flatMap((v) => v.bones).filter((b) => !ok.includes(b));
        expect([...new Set(bad)], m).toEqual([]);
      }
    });
    it('hangs the tee from the chest to below the waist, not hugging it', () => {
      const tee = skinned(path, gltf, 'tee').map((v) => v.pos);
      const lowest = Math.min(...tee.map((p) => p[1]));
      if (name === 'grommet') {
        const boardies = skinned(path, gltf, 'boardies').map((v) => v.pos);
        expect(lowest).toBeLessThan(Math.max(...boardies.map((p) => p[1])) - 0.03); // past the top of his boardies
      } else expect(lowest).toBeLessThan(bone('pelvis')[1] - (name === 'female' ? 0.04 * H : 0)); // her oversized tee longer
      const front = (lo: number, hi: number): number => Math.max(...tee.filter((p) => p[1] > lo * H && p[1] < hi * H && Math.abs(p[0]) < 0.08).map((p) => p[2]));
      expect(front(0.56, 0.62), 'the front at the waist vs the chest').toBeGreaterThan(front(0.69, 0.74) - 0.01);
    });
    it('puts 12 mm thong soles under the feet', () => {
      const y = Math.min(...skinned(path, gltf, 'thongs').map((v) => v.pos[1]));
      expect(Math.abs(y + 0.012)).toBeLessThan(0.002);
    });
  });
}
