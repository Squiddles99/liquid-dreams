import * as THREE from 'three/webgpu';
import { PI, cameraPosition, clamp, float, length, max, mx_noise_float, positionLocal, positionWorld, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { EARTH_RADIUS_M } from '../ocean/OceanSurface';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
import type { Sky } from '../sky/Sky';
import { BOMBIE_X, BOMBIE_Z, BURST_GROW_S, BURST_LIFE_S, MOUND_HALF_X_M, ROLL_DIR, ROLL_SPEED_MS } from './bombieModel';

type N = any;

export const BOMBIE_GRID = { x0: -350, z0: 250, sizeM: 180, cells: 64 } as const;
const FOAM_ALBEDO = 0.8;

/**
 * The Bombie's white water (spec §3.3): a grid that rides the sea exactly as the ocean sheet's own vertices do (the same
 * displacement, distance fades, tide and curvature; lifted 5 cm), drawn transparent over it only during a burst: the burst
 * over the reef, the band rolling shoreward, the fade by 40 s.
 */
export class BombieMesh {
  readonly mesh: THREE.Mesh;
  private readonly age = uniform(0);
  private readonly width = uniform(30);
  private readonly model: WaterSurfaceModel;

  constructor(model: WaterSurfaceModel, sky: Sky, sunVisibility?: (xz: N) => N) {
    this.model = model;
    const n = BOMBIE_GRID.cells, s = BOMBIE_GRID.sizeM;
    const g = new THREE.PlaneGeometry(s, s, n, n);
    g.rotateX(-Math.PI / 2); // y-up, local x ∈ [−s/2, s/2], z ∈ [−s/2, s/2]; normals up, front faces up
    g.translate(BOMBIE_GRID.x0 + s / 2, 0, BOMBIE_GRID.z0 + s / 2);
    const m = new THREE.MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.side = THREE.FrontSide;
    const xz: N = positionLocal.xz;
    m.positionNode = vec3(xz.x, 0.0, xz.y).add(this.surfaceOffsetNode(xz));

    // Coverage in the burst's frame: u along the roll (east-north-east), v across (along the crests).
    const p: N = positionWorld.xz;
    const d = p.sub(vec2(BOMBIE_X, BOMBIE_Z));
    const u = d.x.mul(ROLL_DIR[0]).add(d.y.mul(ROLL_DIR[1]));
    const v = d.x.mul(-ROLL_DIR[1]).add(d.y.mul(ROLL_DIR[0]));
    const age = this.age, half = this.width.mul(0.5);
    const grow = smoothstep(0.0, BURST_GROW_S, age);
    // 1. The burst: an oval over the reef, full width in 3 s, then thinning to a patch that fades by 25 s.
    const burstR = length(vec2(u.div(max(half.mul(0.8).mul(grow), 0.5)), v.div(max(half.mul(grow), 0.5))));
    const burst = float(1.0).sub(smoothstep(0.7, 1.0, burstR)).mul(float(1.0).sub(smoothstep(BURST_GROW_S, 25.0, age).mul(0.8)));
    // 2. The roll: a band from the reef's inshore edge moving shoreward at 4 m/s, widening slightly, thinning and breaking up.
    const front = float(MOUND_HALF_X_M).add(max(age.sub(BURST_GROW_S), 0.0).mul(ROLL_SPEED_MS));
    const bandW = float(10.0).add(age.mul(0.3));
    const band = float(1.0).sub(smoothstep(0.0, bandW, u.sub(front).abs())).mul(float(1.0).sub(smoothstep(half.mul(1.1), half.mul(1.4), v.abs())));
    const roll = band.mul(smoothstep(BURST_GROW_S * 0.5, BURST_GROW_S, age)).mul(float(1.0).sub(smoothstep(10.0, BURST_LIFE_S, age)).mul(0.9));
    // 3. Break-up: two noise scales, the coarse one thinning the white water as it ages.
    const coarse = mx_noise_float(vec3(p.x.div(9.0), p.y.div(9.0), 3.7)).mul(0.5).add(0.5);
    const fine = mx_noise_float(vec3(p.x.div(2.2), p.y.div(2.2), 8.1)).mul(0.5).add(0.5);
    const breakup = smoothstep(age.div(BURST_LIFE_S).mul(0.6).add(0.2), age.div(BURST_LIFE_S).mul(0.6).add(0.45), coarse).mul(fine.mul(0.5).add(0.6));
    const cover = clamp(max(burst, roll).mul(breakup), 0.0, 1.0);

    const l = sky.sunDirection;
    const vis = sunVisibility ? sunVisibility(p) : float(1.0);
    const toCam = cameraPosition.sub(positionWorld), dist = length(toCam);
    const lit = sky.sunIlluminance.mul(vis).mul(max(l.y, 0.0)).add(sky.skyIrradiance).mul(FOAM_ALBEDO).div(PI);
    m.colorNode = sky.applyAerialPerspective(lit, dist, toCam.div(max(dist, 1e-3)).negate());
    m.opacityNode = cover.mul(0.95);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // after the sea (0) and the ribbon
    this.mesh.visible = false;
  }

  /**
   * The ocean sheet's own vertex offset at undisplaced world xz (OceanSurface: displacement, fades, tide, curvature) + 5 cm,
   * about a camera at camXZ (the render's camera; the self-test passes its own, a compute pass has none).
   */
  private surfaceOffsetNode(xz: N, camXZ: N = cameraPosition.xz): N {
    const radial = length(xz.sub(camXZ));
    const disp: N = this.model.displacement(xz, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry));
    return vec3(disp.x, this.model.seabed.tide.add(disp.y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)).add(0.05), disp.z);
  }

  /** The sheet's height at undisplaced xz (the self-test compares it with the ocean's). */
  surfaceYNode(xz: N, camXZ?: N): N {
    return this.surfaceOffsetNode(xz, camXZ).y.sub(0.05);
  }

  show(burst: { ageS: number; widthM: number } | null): void {
    this.mesh.visible = burst !== null;
    if (burst) { this.age.value = burst.ageS; this.width.value = burst.widthM; }
  }
}
