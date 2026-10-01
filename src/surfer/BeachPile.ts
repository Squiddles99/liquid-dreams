import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Sky } from '../sky/Sky';
import { pileMaterial, PILE_PARTS } from './pile';
import { groundFrame } from './placement';
import { PRESETS } from './presets';
import { boardQuaternion } from './solvePose';
import { clothMaterial, lensMaterial, plasticMaterial } from './surferShading';
import type { SurferParams } from './surferParams';

type N = any;
const URL = 'surfer/beachPile.glb';

/**
 * The beach pile (walking spec §5): the crew's tees, cutoffs, hats, packs, towels and thongs, and Grommet's glasses on
 * his school bag, dropped on the sand where they changed. Each part is shaded as the rider wears it.
 */
export class BeachPile {
  readonly group = new THREE.Group();

  static async load(sky: Sky, sv?: (xz: N) => N): Promise<BeachPile> {
    const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + URL);
    return new BeachPile(gltf.scene, sky, sv);
  }

  private constructor(scene: THREE.Object3D, sky: Sky, sv?: (xz: N) => N) {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const made = mats.map((mt) => {
        const what = pileMaterial(mt.name);
        if (!what) throw new Error(`${URL}: unexpected material "${mt.name}"`);
        if (what.part === 'glasses') return plasticMaterial(sky, [0.012, 0.012, 0.014], sv);
        if (what.part === 'lens') return lensMaterial(sky, sv);
        const { cloth, color } = PILE_PARTS[what.part];
        return clothMaterial(sky, PRESETS[what.preset].walking.colors[color] ?? [0.3, 0.3, 0.3], cloth, sv, mesh.geometry.hasAttribute('color'));
      });
      mesh.material = Array.isArray(mesh.material) ? made : made[0];
    });
    this.group.add(scene);
    this.group.visible = false;
  }

  /** Shown when the panel asks, on the sand at its spot and heading (the land's height, or the tide while it loads). */
  update(p: SurferParams, tideM: number, ground?: (x: number, z: number) => number | null): void {
    this.group.visible = p.pile;
    if (!p.pile) return;
    const f = groundFrame({ x: p.pileX, z: p.pileZ, headingDeg: p.pileHeadingDeg, heightNudgeM: 0, pitchNudgeDeg: 0 }, ground?.(p.pileX, p.pileZ) ?? null, tideM, 0);
    this.group.position.copy(f.position);
    this.group.quaternion.copy(boardQuaternion(f));
  }
}
