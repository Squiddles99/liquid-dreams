import * as THREE from 'three/webgpu';
import {
  cameraPosition, clamp, cross, dot, faceDirection, float, length, max, positionLocal, positionWorld, select, uniform, varying, varyingProperty, vec3,
} from 'three/tsl';
import { seabedTerms } from '../seabed/seabedShading';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { DEFAULT_POLAR_GRID, buildPolarGrid } from './polarGrid';
import { type WaterOpticsUniforms, shadeWater } from './waterShading';
import type { WaterSurfaceModel } from './waterSurface';

type N = any;

export const EARTH_RADIUS_M = 6_371_000;

/** normalize() that stays finite at zero: the interpolated set-wave normal passes near zero across the lip's fold. */
const safeNormalize = (v: N): N => v.div(max(length(v), 1e-6));

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
    // Double-sided. With consistent winding the thrown lip's top and the tube's inside are both front faces: at the fold
    // the finite-difference normal and the triangle winding reverse together. Back faces show only where the surface
    // self-intersects (a lip landing through the face), along the fold line itself, and at FFT folds (choppiness can
    // drive the FFT Jacobian below 0); culled, those would be holes.
    material.side = THREE.DoubleSide;

    // Vertex: world-anchored sampling, distance-faded cascades, the tide, Earth curvature. The set waves are summed
    // once per vertex, with two finite-difference neighbours (spec R3); their normal, foam and lip reach the fragment as
    // varyings, so the fragment stage adds no texture fetch for them.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    const setNormal = varyingProperty('vec3', 'vSetNormal');
    const setFoam = varyingProperty('float', 'vSetFoam');
    const setLip = varyingProperty('float', 'vSetLip');
    // Half a polar-grid cell: the cells are radial·2π/segments across (1.6 m at 100 m).
    const eps = clamp(radial.mul(Math.PI / DEFAULT_POLAR_GRID.segments), 0.05, 4.0);
    const displacement = model.displacementWithSetBreak(
      baseXZ, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry), eps, { normal: setNormal, foam: setFoam, lip: setLip },
    );
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), model.seabed.tide.add(displacement.y).sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);

    // Fragment: the set waves' finite-difference normal (interpolated), tilted by the FFT detail normals; foam from both.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const fft = model.fftSlopes(vBaseXZ, distance, this.slopeVariance);
    // FFT slopes, Jacobian-corrected (the Jxz cross term is knowingly dropped: the derivatives texture has no channel for it).
    const fsx = fft.sx.div(max(float(1.0).add(fft.jxx), 0.1));
    const fsz = fft.sz.div(max(float(1.0).add(fft.jzz), 0.1));
    // The FFT detail tilts the set-wave normal in its own tangent plane, in an orthonormal frame seeded from the
    // along-crest axis (horizontal, perpendicular to the mean swell's travel). A breaking profile curls in the travel
    // plane, so that axis stays tangent to it everywhere, under the lip included; the second tangent, nSet × crest,
    // follows the curl. The FFT slopes are rotated into (crest, travel) to match. On flat water the frame is the world's
    // (crest, travel) pair and the normal is exactly Phase 0's (−fsx, 1, −fsz). The frame degenerates only where nSet
    // points horizontally along the mean crest, which a set wave curling in (nearly) its travel plane never does.
    const nSet = safeNormalize(setNormal);
    const travel = model.sets.meanTravel;
    const crestAxis = vec3(travel.y.negate(), 0.0, travel.x);
    const tCrest = safeNormalize(crestAxis.sub(nSet.mul(dot(crestAxis, nSet))));
    const tTravel = cross(nSet, tCrest);
    const slopeCrest = fsx.mul(crestAxis.x).add(fsz.mul(crestAxis.z));
    const slopeTravel = fsx.mul(travel.x).add(fsz.mul(travel.y));
    // Back faces (see the material note above): where the set normal also faces away from the camera (a lip landing
    // through the face, the fold line) the normal is flipped to the side you see. An FFT-fold back face keeps its set
    // normal, which still faces the camera, and shades like the water around it. The tube's inside is a front face and
    // is found from the set normal (the underside weight below), never from the face direction.
    const setTurnedOver = faceDirection.lessThan(0.0).and(dot(nSet, viewDir).lessThan(0.0));
    // safeNormalize: across the lip's fold the interpolated normal and the FFT tilt can all but cancel.
    const normal = safeNormalize(nSet.sub(tCrest.mul(slopeCrest)).sub(tTravel.mul(slopeTravel))).mul(select(setTurnedOver, float(-1.0), float(1.0)));
    const seabed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics);

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam: max(fft.foam, setFoam), lip: setLip, unresolvedSlopeVariance: fft.lostSlopeVariance, seabed,
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
  }
}
