import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toGeometry } from '../board/BoardMesh';
import { buildSwimFin } from '../board/swimFinGeometry';
import type { Sky } from '../sky/Sky';
import type { Outfit, SurferPreset } from './presets';
import { BONES, type BoneName, type SkeletonRest, type SurferManifest, assertManifest, restFromManifest } from './rig';
import type { SolvedPose } from './solvePose';
import { type OutfitUniforms, bodyMaterial, eyesMaterial, fabricMaterial, hairMaterial, lashesMaterial, lensMaterial, outfitUniforms, plasticMaterial, teethMaterial } from './surferShading';
import { FACE_CHANNELS, type FaceState, IdleLife, MOODS } from './idleLife';
import { skinZones } from './skinDetail';
import { bodyOutfit, hairShown, landLook, outfitMasks, showsBoardies, wearsClothes } from './wardrobe';

type N = any;
const DEG = Math.PI / 180;

/** One loaded surfer (spec §3.2): the skinned body, its materials, and the pose applied to its bones. */
export class Surfer {
  readonly group = new THREE.Group();
  readonly rest: SkeletonRest;
  private readonly bones = {} as Record<BoneName, THREE.Bone>;
  private readonly outfit: OutfitUniforms = outfitUniforms();
  /** The head's centre in the world, for lighting the hair as one volume (surferShading.hairMaterial). */
  private readonly headCentre = uniform(new THREE.Vector3());
  private readonly fins: THREE.Mesh[] = [];
  private boardies: THREE.Object3D | null = null;
  /** 0 dry … 1 wet: darkens and glosses the skin and hair, and tightens Grommet's curls (grommet spec §3). */
  readonly wet = uniform(1);
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

  static async load(preset: SurferPreset, sky: Sky, sunVisibility?: (xz: N) => N): Promise<Surfer> {
    const base = import.meta.env.BASE_URL;
    const [gltf, manifest] = await Promise.all([
      new GLTFLoader().loadAsync(base + preset.glbUrl),
      fetch(base + preset.manifestUrl).then((r) => {
        if (!r.ok) throw new Error(`${preset.manifestUrl}: HTTP ${r.status}`);
        return r.json() as Promise<SurferManifest>;
      }),
    ]);
    assertManifest(manifest, preset.manifestUrl);
    return new Surfer(gltf.scene, manifest, preset, sky, sunVisibility);
  }

  private constructor(scene: THREE.Object3D, manifest: SurferManifest, readonly preset: SurferPreset, sky: Sky, sv?: (xz: N) => N) {
    this.landmarks = manifest.landmarks;
    this.idle = new IdleLife({ female: 101, male: 202, grommet: 303 }[preset.name], MOODS[preset.name]);
    this.group.add(scene);
    this.group.updateMatrixWorld(true);
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone && (BONES as readonly string[]).includes(o.name)) this.bones[o.name as BoneName] = o as THREE.Bone;
    });
    const missing = BONES.filter((b) => !this.bones[b]);
    if (missing.length) throw new Error(`${preset.glbUrl} lacks bones ${missing.join(', ')}`);
    const restQ = {} as Record<BoneName, THREE.Quaternion>;
    for (const b of BONES) restQ[b] = this.bones[b].getWorldQuaternion(new THREE.Quaternion());
    this.rest = restFromManifest(manifest, restQ);
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
    const materials: Record<string, () => THREE.Material> = {
      body: () => bodyMaterial(sky, preset, this.outfit, sv, { zones, wet: this.wet, pores: this.pores, lens, ao: hasAo }),
      hair: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet),
      hairDry: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet),
      eyes: () => eyesMaterial(sky, preset, sv, { zones, gaze: this.gaze, lens }),
      boardies: () => fabricMaterial(sky, preset.boardies, sv),
      glasses: () => plasticMaterial(sky, [0.012, 0.012, 0.014], sv), // black plastic
      lens: () => lensMaterial(sky, sv),
      teeth: () => teethMaterial(sky, sv),
      lashes: () => lashesMaterial(sky, sv, lens),
    };
    // The walking parts (walking spec §3); the cloth's own shading lands with the stand's land path (plan Task 7).
    const walk = preset.walking.colors, grey: [number, number, number] = [0.3, 0.3, 0.3];
    const WALKING: Record<string, () => THREE.Material> = {
      tee: () => fabricMaterial(sky, walk.tee ?? grey, sv),
      denim: () => fabricMaterial(sky, walk.shorts ?? grey, sv),
      straps: () => fabricMaterial(sky, walk.straps ?? preset.fabric, sv),
      thongs: () => fabricMaterial(sky, walk.thongs ?? grey, sv),
      cap: () => fabricMaterial(sky, walk.hat ?? grey, sv),
      capFront: () => fabricMaterial(sky, walk.hatTrim ?? grey, sv),
      bucketHat: () => fabricMaterial(sky, walk.hat ?? grey, sv),
    };
    materials.hairHat = () => hairMaterial(sky, preset, this.headCentre, sv, this.wet);
    Object.assign(materials, WALKING);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // GLTFLoader gives a two-material mesh as a group of one-material meshes, but take an array too.
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const made = mats.map((mt) => {
        const make = materials[mt.name];
        if (!make) throw new Error(`${preset.glbUrl}: unexpected material "${mt.name}"`);
        return make();
      });
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
      if (mats.some((mt) => mt.name === 'hairHat')) this.hairHat.push(mesh);
      const dict = mesh.morphTargetDictionary;
      if (dict) {
        const slots: [number, number][] = [];
        FACE_CHANNELS.forEach((c, i) => {
          if (dict[c] !== undefined) slots.push([i, dict[c]]);
        });
        if (slots.length) this.morphs.push({ mesh, slots });
      }
    });
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

  setSwimFins(on: boolean): void {
    for (const f of this.fins) f.visible = on;
  }

  /** The solver's rotations onto the bones; the pelvis also moves (its parent, root, stays at rest at the origin). */
  applyPose(p: SolvedPose): void {
    // The head's centre: 9 cm up and 1 cm forward of the head joint, turned with the head (its world rotation over rest).
    const turn = p.world.head.clone().multiply(this.rest.restQ.head.clone().invert());
    this.headTurn.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(turn));
    this.headCentre.value.copy(p.joint.head).add(new THREE.Vector3(0, 0.09, 0.01).applyQuaternion(turn));
    for (const b of BONES) if (b !== 'root') this.bones[b].quaternion.copy(p.local[b]);
    this.bones.pelvis.position.copy(p.pelvisWorld.clone().sub(p.joint.root).applyQuaternion(p.world.root.clone().invert()));
  }

  boneWorldPosition(b: BoneName, out: THREE.Vector3): THREE.Vector3 {
    return this.bones[b].getWorldPosition(out);
  }
}
