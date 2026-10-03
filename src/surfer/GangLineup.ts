import * as THREE from 'three/webgpu';
import type { HeightProbe } from '../ocean/HeightProbe';
import type { Sky } from '../sky/Sky';
import { type GangPlace, gangPlaces } from './gang';
import { PRESETS, boardsFor } from './presets';
import type { GangStaging } from '../frontend/staging';
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
  private staging: GangStaging | null = null;

  constructor(sky: Sky, sunVisibility?: (xz: N) => N) {
    this.stands = [0, 1, 2].map(() => new SurferStand(sky, sunVisibility));
    for (const s of this.stands) this.group.add(s.group);
    this.group.visible = false;
  }

  /** A rider's stand (dev checks: the front end's face ray). */
  standOf(preset: 'female' | 'grommet' | 'male'): SurferStand {
    return this.stands[(['female', 'grommet', 'male'] as const).indexOf(preset)];
  }

  /** The front end's staging (dune select spec §4); null for the plain lineup. */
  stage(s: GangStaging | null): void {
    this.staging = s;
  }

  update(p: SurferParams, simTime: number, dateISO: string, seed: number, probe: HeightProbe, tideM: number, ground?: (x: number, z: number) => number | null): void {
    const st = this.staging;
    this.group.visible = p.gang || st !== null;
    if (!this.group.visible) return;
    this.places = st
      ? (['female', 'grommet', 'male'] as const).map((n) => ({ preset: n, x: st[n].x, z: st[n].z, headingDeg: st[n].headingDeg, carrySide: PRESETS[n].walking.carrySide }))
      : gangPlaces({ x: p.x, z: p.z, headingDeg: p.headingDeg });
    this.places.forEach((g, i) => {
      const preset = PRESETS[g.preset], r = st?.[g.preset];
      this.stands[i].update({
        ...p, enabled: r ? r.visible : true, preset: g.preset, stance: preset.defaultStance, board: r?.board ?? boardsFor(preset)[0],
        x: g.x, z: g.z, headingDeg: g.headingDeg, onLand: true, outfit: r?.outfit ?? 'walking', pose: r?.pose ?? 'carry', carrySide: g.carrySide,
        expression: r?.expression ?? 'none', reach: r?.reach ?? 0, heightNudgeM: r?.heightNudgeM ?? 0, play: true,
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
