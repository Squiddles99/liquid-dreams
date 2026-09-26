import * as THREE from 'three/webgpu';
import { cameraPosition, float, length, max, normalize, positionLocal, positionWorld, uniform, varying, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { buildPolarGrid } from './polarGrid';
import { type WaterOpticsUniforms, shadeWater } from './waterShading';
import type { WaterSurfaceModel } from './waterSurface';

type N = any;

export const EARTH_RADIUS_M = 6_371_000;

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  /** The grid is centred here each frame; waves are sampled in world space so they never slide. */
  readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];
  private readonly hsTotal = uniform(0);

  constructor(readonly model: WaterSurfaceModel, sky: Sky, optics: WaterOpticsUniforms) {
    const sim = model.sim;
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    const grid = buildPolarGrid();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));

    const material = new THREE.MeshBasicNodeMaterial();

    // Vertex: world-anchored sampling, distance-faded cascades, the tide, Earth curvature.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    const displacement = model.displacement(baseXZ, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry));
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), model.seabed.tide.add(displacement.y).sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);
    const vHeight = varying(displacement.y);

    // Fragment: FFT normals and foam (long swell faded over shallow water) plus the set waves' slopes.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const fft = model.fftSlopes(vBaseXZ, distance, this.slopeVariance);
    const setSlope = model.sets.slopeNode(vBaseXZ);
    // The Jxz cross term is knowingly dropped: the derivatives texture has no channel for it.
    const normal = normalize(vec3(
      fft.sx.negate().div(max(float(1.0).add(fft.jxx), 0.1)).sub(setSlope.x),
      1.0,
      fft.sz.negate().div(max(float(1.0).add(fft.jzz), 0.1)).sub(setSlope.y),
    ));

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam: fft.foam, crestHeight: vHeight, unresolvedSlopeVariance: fft.lostSlopeVariance, hsTotal: this.hsTotal },
      sky,
      optics,
    );

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(cameraPos: THREE.Vector3, sim: OceanSimulation): void {
    this.cameraXZ.value.set(cameraPos.x, cameraPos.z);
    sim.slopeVariance.forEach((v, c) => { this.slopeVariance[c].value = v; });
    this.hsTotal.value = sim.hsTotal;
  }
}
