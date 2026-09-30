import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toGeometry } from '../board/BoardMesh';
import { buildSwimFin } from '../board/swimFinGeometry';
import type { Sky } from '../sky/Sky';
import type { Outfit, SurferPreset } from './presets';
import { BONES, type BoneName, type SkeletonRest, type SurferManifest, assertManifest, restFromManifest } from './rig';
import type { SolvedPose } from './solvePose';
import { type OutfitUniforms, bodyMaterial, eyesMaterial, fabricMaterial, hairMaterial, lensMaterial, outfitUniforms, teethMaterial } from './surferShading';
import { skinZones } from './skinDetail';
import { landLook, outfitMasks, showsBoardies } from './wardrobe';

type N = any;

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
  /** Grommet's glasses (the frame and the lenses), shown only on land. */
  private readonly glasses: THREE.Object3D[] = [];

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
    const materials: Record<string, () => THREE.Material> = {
      body: () => bodyMaterial(sky, preset, this.outfit, sv, { zones: skinZones(manifest), wet: this.wet }),
      hair: () => hairMaterial(sky, preset, this.headCentre, sv, this.wet),
      eyes: () => eyesMaterial(sky, preset, sv),
      boardies: () => fabricMaterial(sky, preset.boardies, sv),
      glasses: () => fabricMaterial(sky, [0.012, 0.012, 0.014], sv), // black plastic
      lens: () => lensMaterial(sky, sv),
      teeth: () => teethMaterial(sky, sv),
    };
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
      if (mats.some((mt) => mt.name === 'glasses' || mt.name === 'lens')) this.glasses.push(mesh);
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

  setOutfit(o: Outfit): void {
    const m = outfitMasks(o);
    for (const k of Object.keys(m) as (keyof typeof m)[]) this.outfit[k].value = m[k];
    if (this.boardies) this.boardies.visible = showsBoardies(o);
  }

  /** On land: glasses on (only Grommet has any), hair and skin dry; in the water: wet, glasses off (grommet spec §6). */
  setOnLand(on: boolean): void {
    const look = landLook(on);
    this.wet.value = look.wet;
    for (const g of this.glasses) g.visible = look.glasses;
  }

  setSwimFins(on: boolean): void {
    for (const f of this.fins) f.visible = on;
  }

  /** The solver's rotations onto the bones; the pelvis also moves (its parent, root, stays at rest at the origin). */
  applyPose(p: SolvedPose): void {
    // The head's centre: 9 cm up and 1 cm forward of the head joint, turned with the head (its world rotation over rest).
    const turn = p.world.head.clone().multiply(this.rest.restQ.head.clone().invert());
    this.headCentre.value.copy(p.joint.head).add(new THREE.Vector3(0, 0.09, 0.01).applyQuaternion(turn));
    for (const b of BONES) if (b !== 'root') this.bones[b].quaternion.copy(p.local[b]);
    this.bones.pelvis.position.copy(p.pelvisWorld.clone().sub(p.joint.root).applyQuaternion(p.world.root.clone().invert()));
  }

  boneWorldPosition(b: BoneName, out: THREE.Vector3): THREE.Vector3 {
    return this.bones[b].getWorldPosition(out);
  }
}
