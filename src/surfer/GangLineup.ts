import * as THREE from 'three/webgpu';
import type { HeightProbe } from '../ocean/HeightProbe';
import type { Sky } from '../sky/Sky';
import { type GangPlace, gangPlaces } from './gang';
import { PRESETS, boardsFor } from './presets';
import type { SurferParams } from './surferParams';
import { SurferStand } from './SurferStand';

type N = any;

/**
 * The gang mockup (walking spec §6): all three on land at the stand's spot (Grommet there, Shazza on his left, T-Bone on
 * his right), in their walking clothes, carrying their boards; the panel's face settings apply to all three.
 */
export class GangLineup {
  readonly group = new THREE.Group();
  private readonly stands: SurferStand[];
  private places: GangPlace[] = [];

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    this.stands = [0, 1, 2].map(() => new SurferStand(sky, sunVisibility));
    for (const s of this.stands) this.group.add(s.group);
    this.group.visible = false;
  }

  update(p: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number, ground?: (x: number, z: number) => number | null): void {
    this.group.visible = p.gang;
    if (!p.gang) return;
    this.places = gangPlaces({ x: p.x, z: p.z, headingDeg: p.headingDeg });
    this.places.forEach((g, i) => {
      const preset = PRESETS[g.preset];
      this.stands[i].update({
        ...p, enabled: true, preset: g.preset, stance: preset.defaultStance, board: boardsFor(preset)[0],
        x: g.x, z: g.z, headingDeg: g.headingDeg, onLand: true, outfit: 'walking', pose: 'carry', carrySide: g.carrySide,
      }, simTime, dateISO, seed, probe, tideM, ground);
    });
  }

  /** Where the riders stand (for the heath's clearings). */
  get spots(): readonly GangPlace[] {
    return this.places;
  }

  /** Each loaded rider's name anchor on screen (px): 30 cm over the top of the head. */
  heads(camera: THREE.Camera, w: number, h: number): { nickname: string; realName: string; x: number; y: number }[] {
    const out: { nickname: string; realName: string; x: number; y: number }[] = [];
    for (const s of this.stands) {
      const rider = s.rider;
      if (!rider) continue;
      const p = rider.boneWorldPosition('head', new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)).project(camera);
      out.push({ nickname: rider.preset.nickname.toUpperCase(), realName: rider.preset.realName, x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h });
    }
    return out;
  }
}
