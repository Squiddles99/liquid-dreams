import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { glbFloats, glbJson, glbValues } from './glbData';
import { FACE_CHANNELS } from './idleLife';
import { PRESETS } from './presets';
import { BONES, FINGER_BONES, type SurferManifest, manifestProblems } from './rig';

/** The share of a primitive's vertices that sit on another's point with a normal more than 8° off it: flat-shaded
 * facets split every corner (most of them); a smooth surface none, bar where two tubes happen to cross. */
function normalSplit(path: string, gltf: any, prim: any): number {
  const pos = glbValues(path, gltf, prim.attributes.POSITION), nor = glbValues(path, gltf, prim.attributes.NORMAL);
  const seen = new Map<string, number>();
  let split = 0;
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${Math.round(pos[3 * i] * 2e4)},${Math.round(pos[3 * i + 1] * 2e4)},${Math.round(pos[3 * i + 2] * 2e4)}`;
    const j = seen.get(key);
    if (j === undefined) { seen.set(key, i); continue; }
    if (nor[3 * i] * nor[3 * j] + nor[3 * i + 1] * nor[3 * j + 1] + nor[3 * i + 2] * nor[3 * j + 2] < 0.99) split++;
  }
  return split / (pos.length / 3);
}

for (const name of ['female', 'male', 'grommet'] as const) {
  describe(`the ${name} surfer build`, () => {
    const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
    const gltf = glbJson(`public/surfer/${name}.glb`);
    it('keeps the skeleton contract (names, parents, lengths, legs down)', () => expect(manifestProblems(man)).toEqual([]));
    it('is the preset’s height (±1 cm)', () => expect(Math.abs(man.heightM - PRESETS[name].heightM)).toBeLessThan(0.01));
    it('skins to the contract bones and the fingers (clip slice §2)', () => {
      expect(gltf.skins.length).toBe(1);
      expect(gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name).sort()).toEqual([...BONES, ...FINGER_BONES].sort());
    });
    it('weights every finger to part of its hand (clip slice §2: fingers no longer merged into the hand)', () => {
      const path = `public/surfer/${name}.glb`, joints: string[] = gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name);
      const used = new Set<string>();
      for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
        if (gltf.materials[prim.material].name !== 'body' || prim.attributes.JOINTS_0 === undefined) continue;
        const J = glbValues(path, gltf, prim.attributes.JOINTS_0), W = glbValues(path, gltf, prim.attributes.WEIGHTS_0);
        for (let i = 0; i < J.length; i++) if (W[i] > 0.3) used.add(joints[J[i]]);
      }
      expect(FINGER_BONES.filter((f) => !used.has(f))).toEqual([]);
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
    it('paints the inside of the mouth only inside it, not the chin under the lip (closeup spec §4.2)', () => {
      // COLOR_0: B the lips, B and A together the mouth's dark inside. Grommet's lower lip juts over his chin, and two
      // chin vertices tucked under it were painted inside (a ray along their normals hit the lip's underside): two dark
      // dots under his lip (T-Bone had the same pair, smaller). Below the lower lip's edge the mouth's inside is the
      // pocket behind the lip, with the lip in front of it; the chin has open air in front of it.
      const path = `public/surfer/${name}.glb`;
      const ray = new THREE.Raycaster();
      ray.far = 0.03;
      const outside: number[][] = [];
      for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
        if (gltf.materials[prim.material].name !== 'body') continue;
        const pos = glbValues(path, gltf, prim.attributes.POSITION), col = glbValues(path, gltf, prim.attributes.COLOR_0);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setIndex(Array.from(glbValues(path, gltf, prim.indices)));
        const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        let lipBottom = Infinity;
        for (let i = 0; i < pos.length / 3; i++) if (col[4 * i + 2] >= 0.5 && col[4 * i + 3] < 0.5) lipBottom = Math.min(lipBottom, pos[3 * i + 1]);
        for (let i = 0; i < pos.length / 3; i++) {
          if (col[4 * i + 2] < 0.5 || col[4 * i + 3] < 0.5 || pos[3 * i + 1] >= lipBottom) continue;
          ray.set(new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2] + 0.0005), new THREE.Vector3(0, 0, 1));
          if (ray.intersectObject(face).length === 0) outside.push([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]].map((v) => +v.toFixed(4)));
        }
      }
      expect(outside, 'mouth-inside vertices on the chin').toEqual([]);
    });
    it('carries the nine face morphs and the four hand morphs on every body primitive, by name (closeup spec §4.1; Gate A)', () => {
      const MORPHS = [...FACE_CHANNELS, 'gripL', 'gripR', 'flatL', 'flatR'];
      const body = gltf.meshes.find((m: any) => m.primitives.some((p: any) => gltf.materials[p.material].name === 'body'));
      expect(body.extras?.targetNames).toEqual(MORPHS);
      for (const p of body.primitives) expect(p.targets?.length).toBe(MORPHS.length);
      // At rest, every morph is off: a default weight of 1 had her resting with every expression on at once.
      expect((body.weights ?? []).every((w: number) => w === 0)).toBe(true);
      expect(man.meshes.find((m) => m.materials.includes('body'))!.morphs).toEqual(MORPHS);
    });
    it('records both hands curled round a rail and open flat, for the carry tests (Gate A)', () => {
      for (const side of ['l', 'r'] as const) for (const shape of ['rest', 'grip', 'flat'] as const) {
        expect(man.grip?.[side][shape]?.length, `${side} ${shape}`).toBe(5);
        for (const finger of man.grip![side][shape]!) expect(finger.length).toBe(4);
      }
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
  it('dry: the locks turn from the scalp into the fall at their own heights, not along one line (dune select spec §13.1)', () => {
    // The build's record: the spread (cm) of where each lock starts to fall, and how far the turn is blended (cm).
    expect(man.checks!.hairTurnSpreadCm).toBeGreaterThan(1.2);
    expect(man.checks!.hairTurnBlendCm).toBeGreaterThanOrEqual(4);
  });
  it('dry: the hairline comes down the temples into a sideburn, not flat at the brows (dune select spec §13.1)', () => {
    // How far above the eyes the sideburn's roots come down in front of the ear, less their inset (cm). The old rule
    // stopped the side hair on one flat line 2.5 cm above the eyes: the straight cut Andrew saw.
    expect(man.checks!.sideburnAboveEyeCm).toBeLessThanOrEqual(1.0);
  });
  it('wears two low pigtail braids, dry and wet: ends on the upper chest, in front of the shoulders, ties on (dune select spec §13.2)', () => {
    const c = man.checks!;
    expect([c.braidsDry, c.braidsWet]).toEqual([2, 2]);
    // How far each braid's end hangs below its clavicle's head (cm), dry and wet, left and right.
    for (const drop of c.braidEndDropCm!) {
      expect(drop).toBeGreaterThan(4);
      expect(drop).toBeLessThan(22);
    }
    expect(c.braidEndsInFront).toBe(true);
    expect(c.braidsOutside).toBe(true);
    expect(man.meshes.flatMap((m) => m.materials)).toContain('hairTie');
  });
  it('the braids hang smoothly: no kink in the line, no flip in the weave, strands curving round each other (dune select spec §13.2)', () => {
    // The worst turn between neighbouring points, in degrees, over both braids dry and wet, sampled every STEP
    // (1.5 mm). Round 1 (3.3 mm steps): the line bent 63–74° where it rode over the collar and the strap, the weave's
    // sideways axis flipped 105–165° (taken from whichever surface was nearest), and the strands turned 150°: the kink
    // Andrew saw, and blocky lobes. A smooth plait: the line under 5°, the weave under 4°, a strand under 15° a step
    // (the tightest real curve, 3.7°, is the dry right braid arching over the pack's strap at the nape: a 2.3 cm radius).
    const c = man.checks!;
    expect(c.braidPathTurnDeg).toBeLessThan(5);
    expect(c.braidTwistDeg).toBeLessThan(4);
    expect(c.braidStrandTurnDeg).toBeLessThan(15);
    // And a strand never bends tighter than its tube is thick (round 1: 0.6, folding into creases that read as blocks).
    expect(c.braidBendRatio).toBeGreaterThanOrEqual(1);
  });
  it('the braid strands are smooth round tubes: one normal at each point of the surface, not 12 flat facets (dune select spec §13.2)', () => {
    for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
      const mat = gltf.materials[prim.material].name as string;
      if (!mat.endsWith('Braid')) continue;
      // Flat shading splits every corner into four vertices with their faces' normals (~30° apart round a 12-sided tube).
      expect(normalSplit('public/surfer/female.glb', gltf, prim), `${mat}: the share of split normals`).toBeLessThan(0.001);
    }
  });
  it('her upper lip is thinned by the build: at least a fifth shorter than MPFB leaves it (dune select spec §13.1)', () => {
    expect(man.checks!.upperLipSculptedMm).toBeLessThanOrEqual(0.8 * man.checks!.upperLipMm!);
  });
  it('dry: the locks beside her face turn to face forward, not edge-on to the camera (dune select spec §13.1)', () => {
    // The mean |forward · card normal| of the fall's cards in front of her ears: 0.37 lying flat to the body (measured on the step-3 build), 0.69 turned.
    expect(man.checks!.hairFaceFrontness).toBeGreaterThan(0.45);
  });
});

describe("the boys' boardies hang loose, not belled or briefs under them (Andrew: shorts under his shorts)", () => {
  for (const name of ['male', 'grommet'] as const) {
    it(`${name}: the legs stand at most 13 cm (at 1.78 m) from the thigh's axis, 0.3–0.6 of the way down`, () => {
      // Round 1 flared to 14.6 cm, bells his wrists went through, over briefs-tight hips: two pairs of shorts.
      const path = `public/surfer/${name}.glb`, gltf = glbJson(path);
      const man: SurferManifest = JSON.parse(readFileSync(`public/surfer/${name}.manifest.json`, 'utf8'));
      const bone = (n: string): number[] => man.bones.find((b) => b.name === n)!.head;
      const a = bone('thigh_l'), b = bone('shin_l'), ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      let worst = 0;
      for (const v of skinned(path, gltf, 'boardies')) {
        if (v.pos[0] < a[0] - 0.02) continue; // the left leg (and not across the crotch)
        const q = [v.pos[0] - a[0], v.pos[1] - a[1], v.pos[2] - a[2]], u = (q[0] * ab[0] + q[1] * ab[1] + q[2] * ab[2]) / L2;
        if (u < 0.3 || u > 0.6) continue;
        worst = Math.max(worst, Math.hypot(q[0] - u * ab[0], q[1] - u * ab[1], q[2] - u * ab[2]));
      }
      expect(worst).toBeLessThanOrEqual(0.13 * man.heightM / 1.78);
    });
  }
});

describe("T-Bone's hairline (dune select spec §13.1; Andrew: like a wig)", () => {
  const man: SurferManifest = JSON.parse(readFileSync('public/surfer/male.manifest.json', 'utf8'));
  it('covers his scalp right to the hairline all round, wet and dry: the temples, the sideburns, the nape', () => {
    // The share of the scalp from 5 mm to 2.5 cm inside the hairline under hair, worst 10° sector. Round 1, wet: the
    // forehead 10–15% (combed straight back off it from roots 8 mm in, over a near-black painted strip). Card hair has
    // gaps between its strands: a back of the head that looks full scores 57–100%, and a sector swings ±0.15 with the
    // cards' random layout, so the floor catches a bare patch, not a thin one (judged by eye at the gate).
    expect(man.checks!.hairCoverWet).toBeGreaterThanOrEqual(0.35);
    expect(man.checks!.hairCoverDry).toBeGreaterThanOrEqual(0.35);
  });
});

describe("Grommet's mop (grommet spec §3)", () => {
  const gltf = glbJson('public/surfer/grommet.glb');
  // The mop in the water: the ringlets (hairCurl) over the short under-layer and the frizz (hair).
  const prims = gltf.meshes.flatMap((m: any) => m.primitives).filter((p: any) => ['hair', 'hairCurl'].includes(gltf.materials[p.material].name));
  const bounds = prims.map((p: any) => gltf.accessors[p.attributes.POSITION]);
  const pos = { min: [0, 1, 2].map((k) => Math.min(...bounds.map((b: any) => b.min[k]))), max: [0, 1, 2].map((k) => Math.max(...bounds.map((b: any) => b.max[k]))) };
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
  it('grows round ringlets, in the water and under his hat: solid coiled tubes, never folding (Andrew: wood shavings)', () => {
    // Round 1's curls were flat cards 11–14 mm wide wound round a 2 cm spiral: they read as wood shavings. Now each
    // ringlet is a smooth tube coiled round its own axis; its tightest bend over its own radius stays at 1 or more.
    const mats = gltf.materials.map((m: any) => m.name);
    expect(mats).toContain('hairCurl');
    expect(mats).toContain('hairHatCurl');
    expect(man.checks!.curlBendRatio).toBeGreaterThanOrEqual(1);
    for (const mesh of gltf.meshes) for (const prim of mesh.primitives) {
      const mat = gltf.materials[prim.material].name as string;
      if (mat.endsWith('Curl')) expect(normalSplit('public/surfer/grommet.glb', gltf, prim), `${mat}: the share of split normals`).toBeLessThan(0.001);
    }
  });
  it('frizzes in short wisps that curl back, not long straight spikes (Andrew: the hedgehog)', () => {
    // Round 1: 300 straight wisps 1.5–3 cm long, out from the head's centre, dark at the root against the sky.
    // Now each wisp is under 1.5 cm, and curls: its ends no further apart than 0.8 of its length.
    expect(man.checks!.frizzMaxCm).toBeLessThanOrEqual(1.5);
    expect(man.checks!.frizzChordRatio).toBeLessThanOrEqual(0.8);
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

/** Each vertex of a material's primitives: its rest position and its skin weights by bone. */
function weighted(path: string, gltf: any, material: string): { pos: number[]; w: Record<string, number> }[] {
  const joints: string[] = gltf.skins[0].joints.map((i: number) => gltf.nodes[i].name);
  const out: { pos: number[]; w: Record<string, number> }[] = [];
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    if (gltf.materials[p.material].name !== material) continue;
    const pos = glbFloats(path, gltf, p.attributes.POSITION), j = glbValues(path, gltf, p.attributes.JOINTS_0), w = glbValues(path, gltf, p.attributes.WEIGHTS_0);
    for (let i = 0; i < pos.length / 3; i++) {
      const ws: Record<string, number> = {};
      for (let k = 0; k < 4; k++) if (w[4 * i + k] > 0) ws[joints[j[4 * i + k]]] = (ws[joints[j[4 * i + k]]] ?? 0) + w[4 * i + k];
      out.push({ pos: [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], w: ws });
    }
  }
  return out;
}
const dist2 = (a: number[], b: number[]): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

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
        // Big by its length and how it hangs, not blown up off him (Andrew: too puffy): the sleeves' and the chest's
        // median gap to the body. Round 1: 3.5 and 2.6 cm (Shazza's oversized tee 1.8 and 1.6).
        const body = skinned(path, gltf, 'body').map((v) => v.pos);
        const gap = (q: number[]): number => Math.sqrt(Math.min(...body.map((p) => dist2(p, q))));
        const med = (a: number[]): number => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
        const all = skinned(path, gltf, 'tee');
        expect(med(all.filter((v) => v.bones.some((b) => b.startsWith('upperarm'))).map((v) => gap(v.pos))), 'sleeves').toBeLessThan(0.022);
        expect(med(all.filter((v) => v.bones.includes('spine_03')).map((v) => gap(v.pos))), 'chest').toBeLessThan(0.02);
      } else expect(lowest).toBeLessThan(bone('pelvis')[1] - (name === 'female' ? 0.04 * H : 0)); // her oversized tee longer
      const front = (lo: number, hi: number): number => Math.max(...tee.filter((p) => p[1] > lo * H && p[1] < hi * H && Math.abs(p[0]) < 0.08).map((p) => p[2]));
      expect(front(0.56, 0.62), 'the front at the waist vs the chest').toBeGreaterThan(front(0.69, 0.74) - 0.01);
    });
    it("rides the pack's shoulder straps on the tee: each strap's front skinned as the tee under it (Andrew: the strap vanished)", () => {
      // The straps were skinned to the spine and clavicles while the tee's shoulders follow the upper arms: lifting the
      // arm to carry the board, the tee rose over the strap and swallowed it. In front of the spine (the straps over the
      // shoulders and down the chest; glTF's +z is forward), each strap vertex's weights match the nearest tee vertex's
      // within 0.25 (L1).
      const tee = weighted(path, gltf, 'tee'), spineZ = bone('spine_03')[2];
      const straps = weighted(path, gltf, 'packTrim').filter((v) => v.pos[2] > spineZ + 0.02 && v.pos[1] > 0.6 * H);
      expect(straps.length).toBeGreaterThan(50);
      let off = 0;
      for (const v of straps) {
        let best = tee[0];
        for (const t of tee) if (dist2(t.pos, v.pos) < dist2(best.pos, v.pos)) best = t;
        const bones = new Set([...Object.keys(v.w), ...Object.keys(best.w)]);
        const l1 = [...bones].reduce((s, b) => s + Math.abs((v.w[b] ?? 0) - (best.w[b] ?? 0)), 0);
        if (l1 > 0.25) off++;
      }
      expect(off / straps.length, 'share of strap vertices not skinned as the tee').toBeLessThan(0.05);
    });
    it('puts 12 mm thong soles under the feet', () => {
      const y = Math.min(...skinned(path, gltf, 'thongs').map((v) => v.pos[1]));
      expect(Math.abs(y + 0.012)).toBeLessThan(0.002);
    });
    const hats = name === 'male' ? ['cap', 'capFront'] : name === 'grommet' ? ['bucketHat'] : [];
    it('wears his hat over hair pressed under it (T-Bone a trucker cap, Grommet a bucket hat; Shazza none)', () => {
      for (const m of ['cap', 'capFront', 'bucketHat']) expect(mats.includes(m), m).toBe(hats.includes(m));
      expect(mats.includes('hairHat')).toBe(hats.length > 0);
      if (!hats.length) return;
      expect(man.checks).toMatchObject({ hatHairUnder: true });
      for (const m of [...hats, 'hairHat']) expect([...new Set(skinned(path, gltf, m).flatMap((v) => v.bones))], m).toEqual(['head']);
      const hat = hats.flatMap((m) => skinned(path, gltf, m).map((v) => v.pos)), hair = skinned(path, gltf, 'hairHat').map((v) => v.pos);
      const eyes = man.landmarks!.eyes, eyeY = (eyes[0][1] + eyes[1][1]) / 2, eyeZ = (eyes[0][2] + eyes[1][2]) / 2;
      // Over the face, the hat (crown, peak or brim) stays above the eyes and the glasses.
      const overFace = hat.filter((p) => Math.abs(p[0]) < 0.04 && p[2] > eyeZ - 0.01);
      expect(overFace.length).toBeGreaterThan(0);
      expect(Math.min(...overFace.map((p) => p[1]))).toBeGreaterThan(eyeY + 0.015);
      expect(Math.max(...hair.map((p) => p[1]))).toBeLessThan(Math.max(...hat.map((p) => p[1])));
    });
    const extra = { female: 'towel', male: 'neoprene', grommet: 'fins' }[name];
    it(`carries the pack on the back, straps over the shoulders, with the ${extra} (walking spec §2, §3)`, () => {
      for (const m of ['pack', 'packTrim', extra]) expect(mats, m).toContain(m);
      for (const m of ['pack', 'packTrim', extra]) {
        // The straps (packTrim) ride on the tee, so they take its bones; the bag and what's on it, the spine's.
        const ok = m === 'packTrim' ? ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck', ...side(['clavicle', 'upperarm', 'forearm'])] : ['spine_03', 'clavicle_l', 'clavicle_r'];
        const bad = skinned(path, gltf, m).flatMap((v) => v.bones).filter((b) => !ok.includes(b));
        expect([...new Set(bad)], m).toEqual([]);
      }
      const spine = bone('spine_03'), pack = skinned(path, gltf, 'pack').map((v) => v.pos);
      // Behind the back (glTF +z is the front): its face to the body is behind the spine, and it sits up the back.
      expect(Math.max(...pack.map((p) => p[2]))).toBeLessThan(spine[2] - 0.04 * H);
      expect(Math.max(...pack.map((p) => p[1]))).toBeGreaterThan(spine[1]);
      // The straps come over the shoulders to the front of the chest.
      expect(Math.max(...skinned(path, gltf, 'packTrim').map((v) => v.pos[2]))).toBeGreaterThan(spine[2] + 0.06);
    });
  });
}
