import * as THREE from 'three/webgpu';
import { PI, cameraPosition, clamp, dot, float, length, max, mx_noise_float, normalFlat, normalize, cameraViewMatrix, positionLocal, positionWorld, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { EARTH_RADIUS_M } from '../ocean/OceanSurface';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
import type { Sky } from '../sky/Sky';
import { BOMBIE_X, BOMBIE_Z, BURST_GROW_S, BURST_LIFE_S, ROLL_DIR, ROLL_SPEED_MS } from './bombieModel';

type N = any;

/** The white water's grid: 50 m seaward and 90 m along the crest either side of the Bombie, 130 m along the roll. */
export const BOMBIE_GRID = { x0: BOMBIE_X - 50, z0: BOMBIE_Z - 90, sizeM: 180, cells: 64 } as const;
const FOAM_ALBEDO = 0.8;
/**
 * The white water floats this far above the sea (aerated foam is that thick). At 5 cm the flat parts dipped under the
 * sheet: its polar-grid vertices and this grid's interpolate the short waves differently by tens of centimetres (captures).
 */
const FOAM_FLOAT_M = 0.3;

/**
 * The Bombie's white water (spec §3.3): a grid that rides the sea exactly as the ocean sheet's own vertices do (the same
 * displacement, distance fades, tide and curvature; lifted FOAM_FLOAT_M), drawn transparent over it only during a burst: the burst
 * over the reef, the band rolling shoreward, the fade by 40 s.
 */
interface Slot {
  age: THREE.UniformNode<'float', number>;
  width: THREE.UniformNode<'float', number>;
  height: THREE.UniformNode<'float', number>;
}

/** An idle slot's age: every term is gated to 0 beyond BURST_LIFE_S. */
const IDLE_AGE_S = 1e4;

export class BombieMesh {
  readonly mesh: THREE.Mesh;
  /** The latest two bursts (final review I4: a new break no longer wipes the last one's roll). */
  private readonly slots: Slot[] = [0, 1].map(() => ({ age: uniform(IDLE_AGE_S), width: uniform(30), height: uniform(2) }));
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
    // The white water stands up (4c-3 ruling from captures: a flat sheet is hidden behind the swell from the lineup): a
    // plume at the burst's start, a foam pile over the reef, and a low bore on the roll.
    m.positionNode = vec3(xz.x, max(this.liftNode(xz, this.slots[0]), this.liftNode(xz, this.slots[1])), xz.y).add(this.surfaceOffsetNode(xz));

    const p: N = positionWorld.xz;
    const coarse = mx_noise_float(vec3(p.x.div(9.0), p.y.div(9.0), 3.7)).mul(0.5).add(0.5);
    const fine = mx_noise_float(vec3(p.x.div(2.2), p.y.div(2.2), 8.1)).mul(0.5).add(0.5);
    // Break-up: shape and noise add, so the edges fray into patches and holes, more as each burst ages.
    const foamN = coarse.mul(0.6).add(fine.mul(0.4));
    const shape = max(this.shapeNode(p, this.slots[0], coarse, fine), this.shapeNode(p, this.slots[1], coarse, fine));
    const cover = clamp(shape.add(foamN.mul(0.6)).sub(0.35), 0.0, 1.0);

    const l = sky.sunDirection;
    const vis = sunVisibility ? sunVisibility(p) : float(1.0);
    const toCam = cameraPosition.sub(positionWorld), dist = length(toCam);
    // The pile's own facing (the lifted mesh keeps flat vertex normals): its screen-space derivative normal, in world space,
    // lit with a wrapped diffuse (foam scatters round its lumps), so a low sun still lights the white water's sunward face.
    const nWorld = normalize(cameraViewMatrix.transpose().mul(vec4(normalFlat, 0.0)).xyz);
    const wrap = max(dot(nWorld, l).add(0.5).div(1.5), 0.0);
    const lit = sky.sunIlluminance.mul(vis).mul(wrap).add(sky.skyIrradiance).mul(FOAM_ALBEDO).div(PI);
    m.colorNode = sky.applyAerialPerspective(sky.mist ? sky.mist(lit, positionWorld, vis) : lit, dist, toCam.div(max(dist, 1e-3)).negate());
    // Crisp white water with ragged edges, not a soft veil.
    m.opacityNode = smoothstep(0.1, 0.25, cover).mul(0.97);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // after the sea (0) and the ribbon
    this.mesh.visible = false;
  }

  /** One burst's frame at world xz: u along the roll (east-north-east), v across (along the crests), and its growth. */
  private frame(xz: N, slot: Slot): { u: N; v: N; age: N; half: N; grow: N; life: N } {
    const d = xz.sub(vec2(BOMBIE_X, BOMBIE_Z));
    const age: N = slot.age;
    return {
      u: d.x.mul(ROLL_DIR[0]).add(d.y.mul(ROLL_DIR[1])),
      v: d.x.mul(-ROLL_DIR[1]).add(d.y.mul(ROLL_DIR[0])),
      age,
      half: slot.width.mul(0.5),
      // It bursts out at 40% of its width and spreads to full width in BURST_GROW_S (a narrow start made the plume a spike).
      grow: float(0.4).add(smoothstep(0.0, BURST_GROW_S, age).mul(0.6)),
      life: float(1.0).sub(smoothstep(BURST_LIFE_S - 2, BURST_LIFE_S, age)),
    };
  }

  /** One burst's white-water shape (before the break-up noise): the burst over the reef and the roll with its trail. */
  private shapeNode(p: N, slot: Slot, coarse: N, fine: N): N {
    const { u, v, age, half, grow, life } = this.frame(p, slot);
    // 1. The burst: an oval over the reef, its outline roughened by the noise, thinning to a patch that fades by 25 s.
    const burstR = length(vec2(u.div(max(half.mul(0.8).mul(grow), 0.5)), v.div(max(half.mul(grow), 0.5)))).mul(coarse.add(0.5).add(fine.sub(0.5).mul(0.4)));
    const burst = float(1.0).sub(smoothstep(0.7, 1.0, burstR)).mul(float(1.0).sub(smoothstep(BURST_GROW_S, 25.0, age).mul(0.8)));
    // 2. The roll: a band leaving from the burst's own shoreward edge at ROLL_SPEED_MS, widening slightly, with a thinner
    // trail of foam behind it back to the burst.
    const front = half.mul(0.8).mul(grow).add(max(age.sub(BURST_GROW_S), 0.0).mul(ROLL_SPEED_MS));
    const across = float(1.0).sub(smoothstep(half.mul(1.1), half.mul(1.4), v.abs()));
    const band = float(1.0).sub(smoothstep(0.0, float(10.0).add(age.mul(0.3)), u.sub(front).abs())).mul(across);
    const trail = smoothstep(-2.0, 2.0, u.sub(half.mul(0.8).mul(grow))).sub(smoothstep(-2.0, 2.0, u.sub(front))).mul(across).mul(0.6).mul(float(1.0).sub(smoothstep(8.0, 30.0, age)));
    const roll = max(band, trail).mul(smoothstep(BURST_GROW_S * 0.5, BURST_GROW_S, age)).mul(float(1.0).sub(smoothstep(10.0, BURST_LIFE_S, age)).mul(0.9));
    // Thinning with age, so it frays before it fades.
    return max(burst, roll).mul(0.7).sub(age.div(BURST_LIFE_S).mul(0.3)).mul(life);
  }

  /**
   * The ocean sheet's own vertex offset at undisplaced world xz (OceanSurface: displacement, fades, tide, curvature) + FOAM_FLOAT_M,
   * about a camera at camXZ (the render's camera; the self-test passes its own, a compute pass has none).
   */
  private surfaceOffsetNode(xz: N, camXZ: N = cameraPosition.xz): N {
    const radial = length(xz.sub(camXZ));
    const disp: N = this.model.displacement(xz, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry));
    return vec3(disp.x, this.model.seabed.tide.add(disp.y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)).add(FOAM_FLOAT_M), disp.z);
  }

  /** How far one burst's white water stands above the sea at world xz (the plume and pile, the roll's bore). */
  private liftNode(xz: N, slot: Slot): N {
    const { u, v, age, half, grow, life } = this.frame(xz, slot);
    const h: N = slot.height;
    const burstR = length(vec2(u.div(max(half.mul(0.8).mul(grow), 0.5)), v.div(max(half.mul(grow), 0.5))));
    const shape = float(1.0).sub(smoothstep(0.0, 1.0, burstR));
    const lumps = mx_noise_float(vec3(xz.x.div(5.0), xz.y.div(5.0), age.mul(0.4))).mul(0.6).add(1.0).add(mx_noise_float(vec3(xz.x.div(1.8), xz.y.div(1.8), age.mul(0.9))).mul(0.25));
    const pulse = smoothstep(0.0, 0.6, age).mul(float(1.0).sub(smoothstep(1.0, 5.0, age)));
    const plume = shape.mul(h).mul(2.5).mul(pulse).mul(lumps);
    const pile = shape.mul(h).mul(0.5).mul(float(1.0).sub(smoothstep(BURST_GROW_S, 20.0, age))).mul(lumps);
    const front = half.mul(0.8).mul(grow).add(max(age.sub(BURST_GROW_S), 0.0).mul(ROLL_SPEED_MS));
    const band = float(1.0).sub(smoothstep(0.0, float(8.0).add(age.mul(0.3)), u.sub(front).abs())).mul(float(1.0).sub(smoothstep(half.mul(1.1), half.mul(1.4), v.abs())));
    const bore = band.mul(h).mul(0.35).mul(smoothstep(BURST_GROW_S * 0.5, BURST_GROW_S, age)).mul(float(1.0).sub(smoothstep(10.0, BURST_LIFE_S, age))).mul(lumps);
    return max(max(plume, pile), bore).mul(life);
  }

  /** The sheet's height at undisplaced xz (the self-test compares it with the ocean's). */
  surfaceYNode(xz: N, camXZ?: N): N {
    return this.surfaceOffsetNode(xz, camXZ).y.sub(FOAM_FLOAT_M);
  }

  /** The latest bursts, newest first (up to two; the rest are ignored), or none. */
  show(bursts: readonly { ageS: number; widthM: number; heightM: number }[]): void {
    this.mesh.visible = bursts.length > 0;
    this.slots.forEach((slot, k) => {
      const b = bursts[k];
      slot.age.value = b ? b.ageS : IDLE_AGE_S;
      if (b) { slot.width.value = b.widthM; slot.height.value = b.heightM; }
    });
  }
}
