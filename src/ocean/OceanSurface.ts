import * as THREE from 'three/webgpu';
import { cameraPosition, float, length, max, normalize, positionLocal, positionWorld, texture, uniform, varying, vec3 } from 'three/tsl';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { buildPolarGrid } from './polarGrid';
import { type WaterOpticsUniforms, shadeWater } from './waterShading';

type N = any;

export const EARTH_RADIUS_M = 6_371_000;

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  /** The grid is centred here each frame; waves are sampled in world space so they never slide. */
  readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];
  private readonly hsTotal = uniform(0);

  constructor(sim: OceanSimulation, sky: Sky, optics: WaterOpticsUniforms) {
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    const grid = buildPolarGrid();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));

    const material = new THREE.MeshBasicNodeMaterial();

    // Vertex: world-anchored sampling, distance-faded cascades, Earth curvature.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    let displacement: N = vec3(0.0);
    sim.sizes.forEach((size, c) => {
      const d = texture(sim.displacement[c], baseXZ.div(size)).level(float(0)).xyz; // three typings gap: level() wants a node
      displacement = displacement.add(d.mul(fadeWeightNode(radial, CASCADE_FADES[c].geometry)));
    });
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), displacement.y.sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);
    const vHeight = varying(displacement.y);

    // Fragment: normals and foam from the derivative/displacement textures at the undisplaced position.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    let sx: N = float(0.0), sz: N = float(0.0), jxx: N = float(0.0), jzz: N = float(0.0);
    let foam: N = float(0.0), lostSlopeVariance: N = float(0.0);
    sim.sizes.forEach((size, c) => {
      const w = fadeWeightNode(distance, CASCADE_FADES[c].normals);
      const d = texture(sim.derivatives[c], vBaseXZ.div(size));
      sx = sx.add(d.x.mul(w));
      sz = sz.add(d.y.mul(w));
      jxx = jxx.add(d.z.mul(w));
      jzz = jzz.add(d.w.mul(w));
      foam = max(foam, texture(sim.displacement[c], vBaseXZ.div(size)).w.mul(w));
      lostSlopeVariance = lostSlopeVariance.add(float(1.0).sub(w).mul(this.slopeVariance[c]));
    });
    const normal = normalize(vec3(
      sx.negate().div(max(float(1.0).add(jxx), 0.1)),
      1.0,
      sz.negate().div(max(float(1.0).add(jzz), 0.1)),
    ));

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam, crestHeight: vHeight, unresolvedSlopeVariance: lostSlopeVariance, hsTotal: this.hsTotal },
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
