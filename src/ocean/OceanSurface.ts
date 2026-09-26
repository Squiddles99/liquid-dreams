import * as THREE from 'three/webgpu';
import { cameraPosition, float, length, max, normalize, positionLocal, positionWorld, uniform, varying, varyingProperty, vec3 } from 'three/tsl';
import { seabedTerms } from '../seabed/seabedShading';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { buildPolarGrid } from './polarGrid';
import { type WaterOpticsUniforms, shadeWater } from './waterShading';
import type { WaterSurfaceModel } from './waterSurface';

export const EARTH_RADIUS_M = 6_371_000;

/** Dev-panel debug lines drawn on the water. */
export interface DebugOverlays {
  /** White lines every 1 m of still-water depth. */
  depthContours: boolean;
  /** Gold set-wave crest lines, every 2 s of arrival time τ. */
  crestLines: boolean;
}

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  /** The grid is centred here each frame; waves are sampled in world space so they never slide. */
  readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];
  private readonly hsTotal = uniform(0);
  private readonly overlayDepth = uniform(0);
  private readonly overlayCrest = uniform(0);

  constructor(readonly model: WaterSurfaceModel, sky: Sky, optics: WaterOpticsUniforms) {
    const sim = model.sim;
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    const grid = buildPolarGrid();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));

    const material = new THREE.MeshBasicNodeMaterial();

    // Vertex: world-anchored sampling, distance-faded cascades, the tide, Earth curvature. The set waves are summed
    // once per vertex, for both the displacement and their slope; the slope reaches the fragment as a varying.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    const setSlope = varyingProperty('vec2', 'vSetSlope');
    const displacement = model.displacementWithSetSlope(baseXZ, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry), setSlope);
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), model.seabed.tide.add(displacement.y).sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);
    const vHeight = varying(displacement.y);

    // Fragment: FFT normals and foam (long swell faded over shallow water) plus the set waves' slopes (interpolated).
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const fft = model.fftSlopes(vBaseXZ, distance, this.slopeVariance);
    // The Jxz cross term is knowingly dropped: the derivatives texture has no channel for it.
    const normal = normalize(vec3(
      fft.sx.negate().div(max(float(1.0).add(fft.jxx), 0.1)).sub(setSlope.x),
      1.0,
      fft.sz.negate().div(max(float(1.0).add(fft.jzz), 0.1)).sub(setSlope.y),
    ));
    const seabed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics);

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam: fft.foam, crestHeight: vHeight, unresolvedSlopeVariance: fft.lostSlopeVariance, hsTotal: this.hsTotal, seabed,
        overlay: { depth: model.seabed.waterDepthNode(vBaseXZ), tau: model.sets.tauNode(vBaseXZ), depthOn: this.overlayDepth, crestOn: this.overlayCrest } },
      sky,
      optics,
    );

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  setOverlays(o: DebugOverlays): void {
    this.overlayDepth.value = o.depthContours ? 1 : 0;
    this.overlayCrest.value = o.crestLines ? 1 : 0;
  }

  update(cameraPos: THREE.Vector3, sim: OceanSimulation): void {
    this.cameraXZ.value.set(cameraPos.x, cameraPos.z);
    sim.slopeVariance.forEach((v, c) => { this.slopeVariance[c].value = v; });
    this.hsTotal.value = sim.hsTotal;
  }
}
