import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toGeometry } from '../board/BoardMesh';
import { buildSwimFin } from '../board/swimFinGeometry';
import type { Sky } from '../sky/Sky';
import type { Outfit, SurferPreset } from './presets';
import { BONES, type BoneName, FINGER_BONES, type FingerBone, type SkeletonRest, type SurferManifest, assertManifest, restFromManifest } from './rig';
import { fingerDeltas, fingerLocals, fingerRestFromManifest, relaxedFingerDeltas } from './fingers';
import type { SolvedPose } from './solvePose';
import { type Cloth, type OutfitUniforms, bodyMaterial, clothMaterial, eyesMaterial, fabricMaterial, hairMaterial, lashesMaterial, lensMaterial, outfitUniforms, plasticMaterial, teethMaterial } from './surferShading';
import { FACE_CHANNELS, type FaceState, IdleLife, MOODS } from './idleLife';

/** A hand's baked shape (dune select Gate A). */
export type HandShape = 'relaxed' | 'grip' | 'flat';
import { skinZones } from './skinDetail';
import { SOLE_M } from './placement';
import { bodyOutfit, hairShown, landLook, outfitMasks, showsBoardies, wearsClothes } from './wardrobe';

type N = any;
const DEG = Math.PI / 180;

/** One loaded surfer (spec §3.2): the skinned body, its materials, and the pose applied to its bones. */
/**
 * The hair strand atlas (dune select spec §13.2), loaded once and shared by every rider. Data, not colour: no colour
 * space, rows top-down (the tiles' roots at the top). A failed load leaves the hair on its procedural strands (a warning,
 * never missing hair).
 */
let hairAtlas: Promise<THREE.Texture | null> | null = null;
export function loadHairAtlas(): Promise<THREE.Texture | null> {
  hairAtlas ??= new THREE.TextureLoader()
    .loadAsync(import.meta.env.BASE_URL + 'surfer/hairAtlas.png')
    .then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8;
      t.needsUpdate = true;
      return t;
    })
    .catch((e: unknown) => {
      console.warn('The hair atlas did not load; the hair draws without it.', e);
      return null;
    });
  return hairAtlas;
}

export class Surfer {
  readonly group = new THREE.Group();
  readonly rest: SkeletonRest;
  private readonly bones = {} as Record<BoneName, THREE.Bone>;
  /** The finger bones (clip slice spec §2), when this build has them: posed by a clip, or curled relaxed. */
  private readonly fingerBones = {} as Partial<Record<FingerBone, THREE.Bone>>;
  private fingerRestQ: Record<FingerBone, THREE.Quaternion> | null = null;
  private relaxed: Record<FingerBone, THREE.Quaternion> | null = null;
  private readonly outfit: OutfitUniforms = outfitUniforms();
  /** The head's centre in the world, for lighting the hair as one volume (surferShading.hairMaterial). */
  private readonly headCentre = uniform(new THREE.Vector3());
  private readonly fins: THREE.Mesh[] = [];
  private boardies: THREE.Object3D | null = null;
  /** 0 dry … 1 wet: darkens and glosses the skin and hair, and tightens Grommet's curls (grommet spec §3). */
  readonly wet = uniform(1);
  /** Every mesh by the build's material name (the walking self-tests colour parts by it). */
  private readonly byMaterial = new Map<string, THREE.Mesh[]>();
  /** The walking clothes, hats, packs and thongs (walking spec §3): shown only in the walking outfit. */
  private readonly walking: THREE.Object3D[] = [];
  /** Grommet's glasses (the frame and the lenses), shown only on land. */
  private readonly glasses: THREE.Object3D[] = [];
  /** The wet hair (in the water) and the dry style (on land, where the build made one; closeup spec §4.1). */
  private readonly hairWet: THREE.Object3D[] = [];
  private readonly hairDry: THREE.Object3D[] = [];
  /** The hair pressed under the hat (walking spec §3), shown only walking in it. */
  private readonly hairHat: THREE.Object3D[] = [];
  /** Where the eyes look, in radians off the head's look (yaw, pitch; closeup spec §5.1): the eye shader draws the iris
   * toward it. */
  readonly gaze = uniform(new THREE.Vector2());
  /** Each mesh's hand morph slots (dune select Gate A): the rail grip and the open hand, per hand; -1 absent. */
  private readonly grips: { mesh: THREE.Mesh; gripL: number; gripR: number; flatL: number; flatR: number }[] = [];
  /** Each hand's shape from setHands: a shaped hand's finger bones stay at rest under its morph. */
  private handShapes: Record<'l' | 'r', HandShape> = { l: 'relaxed', r: 'relaxed' };
  /** Each morphing mesh's slot for each face channel, by its own morph dictionary (Review Focus 1). */
  private readonly morphs: { mesh: THREE.Mesh; slots: [channel: number, morph: number][] }[] = [];
  /** This rider's idle face (closeup spec §5.1), seeded per rider. */
  readonly idle: IdleLife;
  /** 1 pores on, 0 off (the pores self-test compares). */
  readonly pores = uniform(1);
  /** Grommet's lenses: on with his glasses, and the head's turn from rest (closeup spec §4.2). */
  private readonly lensOn = uniform(0);
  private readonly headTurn = uniform(new THREE.Matrix3());
  /** The face's landmarks from the build (glTF axes, metres, rest pose; all three riders since step 2). */
  readonly landmarks: SurferManifest['landmarks'];

  /** `hairAtlas: false` draws the hair without the strand atlas (the self-tests compare the two). */
  static async load(preset: SurferPreset, sky: Sky, sunVisibility?: (xz: N) => N, opts: { hairAtlas?: boolean } = {}): Promise<Surfer> {
    const base = import.meta.env.BASE_URL;
    const [gltf, manifest, atlas] = await Promise.all([
      new GLTFLoader().loadAsync(base + preset.glbUrl),
      fetch(base + preset.manifestUrl).then((r) => {
        if (!r.ok) throw new Error(`${preset.manifestUrl}: HTTP ${r.status}`);
        return r.json() as Promise<SurferManifest>;
      }),
      opts.hairAtlas === false ? Promise.resolve(null) : loadHairAtlas(),
    ]);
    assertManifest(manifest, preset.manifestUrl);
    return new Surfer(gltf.scene, manifest, preset, sky, sunVisibility, atlas);
  }

  private constructor(scene: THREE.Object3D, manifest: SurferManifest, readonly preset: SurferPreset, sky: Sky, sv?: (xz: N) => N, atlas: THREE.Texture | null = null) {
    this.landmarks = manifest.landmarks;
    this.idle = new IdleLife({ female: 101, male: 202, grommet: 303 }[preset.name], MOODS[preset.name]);
    this.group.add(scene);
    this.group.updateMatrixWorld(true);
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && (BONES as readonly string[]).includes(o.name)) this.bones[o.name as BoneName] = o as THREE.Bone;
      if ((o as THREE.Bone).isBone && (FINGER_BONES as readonly string[]).includes(o.name)) this.fingerBones[o.name as FingerBone] = o as THREE.Bone;
    });
    const missing = BONES.filter((b) => !this.bones[b]);
    if (missing.length) throw new Error(`${preset.glbUrl} lacks bones ${missing.join(', ')}`);
    const restQ = {} as Record<BoneName, THREE.Quaternion>;
    for (const b of BONES) restQ[b] = this.bones[b].getWorldQuaternion(new THREE.Quaternion());
    this.rest = restFromManifest(manifest, restQ);
    // Fingers only when the build has them all (a 23-bone build from before the clip slice poses without them).
    const fingerRest = fingerRestFromManifest(manifest);
    if (fingerRest && FINGER_BONES.every((f) => this.fingerBones[f])) {
      this.fingerRestQ = Object.fromEntries(FINGER_BONES.map((f) => [f, this.fingerBones[f]!.getWorldQuaternion(new THREE.Quaternion())])) as Record<FingerBone, THREE.Quaternion>;
      this.relaxed = relaxedFingerDeltas(fingerRest);
    }
    // The head's centre at rest (as applyPose places it), so nothing renders with a centre at the origin before the
    // first pose: the wet curls' pull would drag the hair toward the feet.
    this.headCentre.value.copy(this.rest.joint.head).add(new THREE.Vector3(0, 0.09, 0.01));
    const zones = skinZones(manifest);
    const lens = preset.name === 'grommet' && zones ? { eyes: zones.eyes, eyeRadius: zones.eyeRadius, on: this.lensOn, turn: this.headTurn } : null;
    let hasAo = false;
    scene.traverse((o) => {
      // Builds since step 2 pack the body's occlusion with the scalp in COLOR_0.r (tools/surfer/face.py).
      if ((o as THREE.Mesh).isMesh && manifest.headTriangles !== undefined) hasAo = true;
    });
    const materials: Record<string, (mesh: THREE.Mesh) => THREE.Material> = {
      body: () => bodyMaterial(sky, preset, this.outfit, sv, { zones, wet: this.wet, pores: this.pores, lens, ao: hasAo }),
      hair: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas),
      hairDry: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas),
      eyes: () => eyesMaterial(sky, preset, sv, { zones, gaze: this.gaze, lens }),
      boardies: () => fabricMaterial(sky, preset.boardies, sv),
      glasses: () => plasticMaterial(sky, [0.012, 0.012, 0.014], sv), // black plastic
      lens: () => lensMaterial(sky, sv),
      teeth: () => teethMaterial(sky, sv),
      lashes: () => lashesMaterial(sky, sv, lens),
      // Shazza's hair elastics (dune select spec §13.2): dark navy plastic.
      hairTie: () => plasticMaterial(sky, [0.02, 0.03, 0.09], sv),
      // The braids' solid plait strands (§13.2), wet and dry.
      hairBraid: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas, true),
      hairDryBraid: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas, true),
      // Grommet's ringlets (grommet spec §3): solid coiled tubes, in the water and under his hat.
      hairCurl: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas, true),
      hairHatCurl: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas, true),
    };
    // The walking parts (walking spec §3): each material's colour and cloth; a missing colour is grey, never a throw.
    const walk = preset.walking.colors, grey: [number, number, number] = [0.3, 0.3, 0.3];
    const cloth = (color: [number, number, number] | undefined, kind: Cloth) => (mesh: THREE.Mesh): THREE.Material =>
      clothMaterial(sky, color ?? grey, kind, sv, mesh.geometry.hasAttribute('color'));
    const WALKING: Record<string, (mesh: THREE.Mesh) => THREE.Material> = {
      tee: cloth(walk.tee, 'cotton'),
      denim: cloth(walk.shorts, 'denim'),
      straps: cloth(walk.straps ?? preset.fabric, 'cotton'),
      thongs: cloth(walk.thongs, 'rubber'),
      cap: cloth(walk.hat, 'cotton'),
      capFront: cloth(walk.hatTrim, 'cotton'),
      bucketHat: cloth(walk.hat, 'cotton'),
      pack: cloth(walk.pack, 'canvas'),
      packTrim: cloth(walk.packTrim, 'canvas'),
      towel: cloth(walk.towel, 'towel'),
      neoprene: cloth(walk.neoprene, 'neoprene'),
      fins: cloth(walk.fins, 'rubber'),
    };
    materials.hairHat = () => hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'core', atlas);
    Object.assign(materials, WALKING);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // GLTFLoader gives a two-material mesh as a group of one-material meshes, but take an array too.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const made = mats.map((mt) => {
        const make = materials[mt.name];
        if (!make) throw new Error(`${preset.glbUrl}: unexpected material "${mt.name}"`);
        const made = make(mesh);
        made.name = mt.name;
        return made;
      });
      for (const mt of mats) {
        const list = this.byMaterial.get(mt.name) ?? [];
        list.push(mesh);
        this.byMaterial.set(mt.name, list);
      }
      mesh.material = Array.isArray(mesh.material) ? made : made[0];
      mesh.frustumCulled = false;
      if (mats.some((mt) => mt.name === 'boardies')) this.boardies = mesh;
      if (mats.some((mt) => mt.name in WALKING)) {
        this.walking.push(mesh);
        mesh.visible = false; // until the walking outfit is chosen
      }
      if (mats.some((mt) => mt.name === 'glasses' || mt.name === 'lens')) this.glasses.push(mesh);
      if (mats.some((mt) => mt.name === 'hair')) this.hairWet.push(mesh);
      if (mats.some((mt) => mt.name === 'hairDry')) this.hairDry.push(mesh);
      // The braids' elastics show and hide with their hair: the dry hair's (…_hairDryTies) or the wet's (…_hairTies).
      if (mats.some((mt) => mt.name === 'hairTie')) (mesh.name.includes('hairDry') ? this.hairDry : this.hairWet).push(mesh);
      if (mats.some((mt) => mt.name === 'hairBraid')) this.hairWet.push(mesh);
      if (mats.some((mt) => mt.name === 'hairDryBraid')) this.hairDry.push(mesh);
      if (mats.some((mt) => mt.name === 'hairHat' || mt.name === 'hairHatCurl')) this.hairHat.push(mesh);
      if (mats.some((mt) => mt.name === 'hairCurl')) this.hairWet.push(mesh);
      const dict = mesh.morphTargetDictionary;
      if (dict) {
        const slots: [number, number][] = [];
        FACE_CHANNELS.forEach((c, i) => {
          if (dict[c] !== undefined) slots.push([i, dict[c]]);
        });
        if (slots.length) this.morphs.push({ mesh, slots });
        if (dict.gripL !== undefined || dict.gripR !== undefined) {
          this.grips.push({ mesh, gripL: dict.gripL ?? -1, gripR: dict.gripR ?? -1, flatL: dict.flatL ?? -1, flatR: dict.flatR ?? -1 });
        }
      }
    });
    // The hair's soft edges (dune select spec §13.1): each hair mesh drawn a second time, blended over its opaque core.
    // Same geometry, skeleton and name, so it shows, hides and skins with the core.
    for (const [list, name] of [[this.hairWet, 'hair'], [this.hairDry, 'hairDry'], [this.hairHat, 'hairHat']] as const) {
      for (const mesh of [...list]) {
        if (((mesh as THREE.Mesh).material as THREE.Material).name !== name) continue; // not the elastics
        const edges = mesh.clone() as THREE.Mesh;
        edges.material = hairMaterial(sky, preset, this.headCentre, sv, this.wet, 'edges', atlas);
        edges.material.name = name;
        edges.renderOrder = 1;
        edges.frustumCulled = false;
        mesh.parent!.add(edges);
        list.push(edges);
      }
    }
    // Swim fins ride the feet: placed in the rest pose at the sole, then held in each foot bone's frame. The pocket fits
    // this body's foot: the toes reach ~1.58× the ankle-to-toe-joint distance ahead of the ankle (both built bodies).
    const toeJoint = this.rest.joint.toe_l.clone().sub(this.rest.joint.foot_l);
    const finGeo = toGeometry(buildSwimFin(1.58 * Math.hypot(toeJoint.x, toeJoint.z)));
    const finMat = fabricMaterial(sky, [0.03, 0.03, 0.035], sv);
    for (const s of ['l', 'r'] as const) {
      const foot = this.bones[`foot_${s}`];
      const ankle = this.rest.joint[`foot_${s}`];
      const fin = new THREE.Mesh(finGeo, finMat);
      const world = new THREE.Matrix4().makeTranslation(ankle.x, 0, ankle.z);
      fin.matrix.copy(foot.matrixWorld.clone().invert().multiply(world));
      fin.matrixAutoUpdate = false;
      fin.visible = false;
      fin.frustumCulled = false;
      foot.add(fin);
      this.fins.push(fin);
    }
    this.setOnLand(false);
  }

  /** The outfit worn, for the land look (glasses, hair) set after it. */
  private wearing: Outfit = 'boardies';

  /** The meshes carrying the build's material `name` (empty when this build has none). */
  meshesWith(name: string): readonly THREE.Mesh[] {
    return this.byMaterial.get(name) ?? [];
  }

  /** How far the soles lift the feet: the thongs, worn with the walking clothes. */
  get walkingLift(): number {
    return wearsClothes(this.wearing) && this.walking.length > 0 ? SOLE_M : 0;
  }

  setOutfit(o: Outfit): void {
    this.wearing = o;
    for (const w of this.walking) w.visible = wearsClothes(o);
    const under = bodyOutfit(this.preset, o), m = outfitMasks(under);
    for (const k of Object.keys(m) as (keyof typeof m)[]) this.outfit[k].value = m[k];
    if (this.boardies) this.boardies.visible = showsBoardies(under);
  }

  /** On land or in clothes: hair and skin dry; the glasses (only Grommet has any) only with the walking clothes; in the
   * water: wet (grommet spec §6, walking spec §4). Set after the outfit. */
  setOnLand(on: boolean): void {
    const look = landLook(on, this.wearing);
    this.wet.value = look.wet;
    for (const g of this.glasses) g.visible = look.glasses;
    this.lensOn.value = look.glasses && this.glasses.length > 0 ? 1 : 0;
    const shown = hairShown(on, this.wearing, { dry: this.hairDry.length > 0, hat: this.hairHat.length > 0 });
    for (const h of this.hairWet) h.visible = shown === 'wet';
    for (const h of this.hairDry) h.visible = shown === 'dry';
    for (const h of this.hairHat) h.visible = shown === 'hat';
  }

  /** The face's morph weights on every mesh that has them, and the gaze for the eyes (closeup spec §5.2). */
  setFace(f: FaceState): void {
    for (const { mesh, slots } of this.morphs) {
      const w = mesh.morphTargetInfluences!;
      for (const [c, m] of slots) w[m] = f[FACE_CHANNELS[c]];
    }
    this.gaze.value.set(f.gazeYawDeg * DEG, f.gazePitchDeg * DEG);
  }

  /** Each hand's shape: relaxed (the rest hand), gripping a rail, or open flat on a board's face (a bodyboard's). */
  setHands(l: HandShape, r: HandShape): void {
    this.handShapes = { l, r };
    for (const g of this.grips) {
      const w = g.mesh.morphTargetInfluences!;
      const put = (i: number, on: boolean): void => {
        if (i >= 0) w[i] = on ? 1 : 0;
      };
      put(g.gripL, l === 'grip');
      put(g.flatL, l === 'flat');
      put(g.gripR, r === 'grip');
      put(g.flatR, r === 'flat');
    }
  }

  setSwimFins(on: boolean): void {
    for (const f of this.fins) f.visible = on;
  }

  /** The solver's rotations onto the bones; the pelvis also moves (its parent, root, stays at rest at the origin). */
  applyPose(p: SolvedPose, fingers?: Partial<Record<FingerBone, THREE.Quaternion>>): void {
    // The head's centre: 9 cm up and 1 cm forward of the head joint, turned with the head (its world rotation over rest).
    const turn = p.world.head.clone().multiply(this.rest.restQ.head.clone().invert());
    this.headTurn.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(turn));
    this.headCentre.value.copy(p.joint.head).add(new THREE.Vector3(0, 0.09, 0.01).applyQuaternion(turn));
    for (const b of BONES) if (b !== 'root') this.bones[b].quaternion.copy(p.local[b]);
    this.bones.pelvis.position.copy(p.pelvisWorld.clone().sub(p.joint.root).applyQuaternion(p.world.root.clone().invert()));
    // The fingers (clip slice spec §2): the clip's where given, else the relaxed curl carried by each hand.
    if (this.relaxed && this.fingerRestQ) {
      const handD = {
        l: p.world.hand_l.clone().multiply(this.rest.restQ.hand_l.clone().invert()),
        r: p.world.hand_r.clone().multiply(this.rest.restQ.hand_r.clone().invert()),
      };
      const D = fingerDeltas(handD, this.relaxed, fingers);
      // A gripping or open hand (dune select Gate A) is shaped by its morph, baked from the fingers at rest: they stay so.
      for (const f of FINGER_BONES) {
        const side = f.slice(-1) as 'l' | 'r';
        if (this.handShapes[side] !== 'relaxed') D[f] = handD[side].clone();
      }
      const local = fingerLocals({ l: p.world.hand_l, r: p.world.hand_r }, D, this.fingerRestQ);
      for (const f of FINGER_BONES) this.fingerBones[f]!.quaternion.copy(local[f]);
    }
  }

  boneWorldPosition(b: BoneName, out: THREE.Vector3): THREE.Vector3 {
    return this.bones[b].getWorldPosition(out);
  }
}
