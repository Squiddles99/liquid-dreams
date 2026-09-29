import * as THREE from 'three/webgpu';
import {
  Fn, If, cameraPosition, clamp, float, floor, int, ivec2, length, max, mix, mx_noise_float, mx_worley_noise_vec2, normalize, positionLocal, positionWorld, saturate, smoothstep, sqrt,
  textureLoad, uniform, varying, varyingProperty, vec2, vec3,
} from 'three/tsl';
import { seabedTerms } from '../seabed/seabedShading';
import type { Sky } from '../sky/Sky';
import { CASCADE_FADES, fadeWeightNode } from './cascadeFades';
import type { OceanSimulation } from './OceanSimulation';
import { buildPolarGrid } from './polarGrid';
import { reefInFrontNode, waterVolumeColourNode } from './WaterVolume';
import { churnSlopeNode } from '../whitewater/pileChurn';
import { type WaterOpticsUniforms, shadeWater, shadeWaterFromBelow } from './waterShading';
import type { WaterSurfaceModel } from './waterSurface';
import type { SunlightSource } from '../land/SunlightMap';
import type { SkylineTable } from '../land/SkylineTable';
import type { CoastalSurf } from '../surf/CoastalSurf';

type N = any;

export const EARTH_RADIUS_M = 6_371_000;

/**
 * The set-wave foam broken into whitewater (fragment stage, math only: no texture fetch). `foam` is the model's weight,
 * `frame` the pattern's coordinates in metres (x along travel, y across), `time` churns it slowly. Real foam is a lace:
 * cells of dark water rimmed with foam, fine threads where it is old and thin, the holes closing as it thickens, and
 * solid, clumpy white where the whitewater is fresh. So: Worley cells (FOAM_CELL_M, warped by noise so they are
 * irregular and drift), rimmed by bands whose width grows with the weight (the old threshold of 7 m noise blobs gave
 * hard-edged camouflage patches over the wave's back, Andrew's references show lace and solid whitewater). The weight
 * is varied by a large, slow noise (±40% where it is thin, none at full weight), so thinning foam gathers in patches
 * and streaks along travel while fresh whitewater (weight ≳ 0.75) is solid. Coverage reaches SET_FOAM_MAX_COVER (fresh whitewater is all but opaque) and goes to 0 with the weight
 * (× saturate(4·foam): no hard edge where clearing foam ends).
 * Returns vec2(coverage, brightness): brightness 0.62–1.07, the clumps bright and the creases between them in the
 * clumps' shadow (shadeWater); 1.07 (plain lit foam) where there is no set foam (coverage 0, skipped).
 */
export const SET_FOAM_MAX_COVER = 0.95;
/** The lace's cells, along travel and across it (m). */
export const FOAM_CELL_M: readonly [number, number] = [2.8, 2.0];

export function setFoamPattern(foam: N, frame: N, time: N): N {
  return Fn(() => {
    const out = vec2(0.0, 1.07).toVar();
    If(foam.greaterThan(1e-3), () => {
      const n1 = mx_noise_float(vec3(frame.x.mul(0.15), frame.y.mul(0.35), time.mul(0.12)));
      const n2 = mx_noise_float(vec3(frame.x.mul(0.9).add(19.7), frame.y.mul(0.9), time.mul(0.3)));
      const n3 = mx_noise_float(vec3(frame.x.mul(0.9), frame.y.mul(0.9).add(41.3), time.mul(0.3)));
      // The variation fades out toward full weight: fresh whitewater is solid, only thinning foam gathers in patches.
      const w = saturate(saturate(foam).mul(n1.mul(0.4).mul(float(1.0).sub(saturate(foam))).add(1.0)));
      const q = vec2(frame.x.div(FOAM_CELL_M[0]), frame.y.div(FOAM_CELL_M[1])).add(vec2(n2, n3).mul(0.35));
      // F1, F2 (squared, in cells): the rims are where the two nearest cell centres are equally far.
      const f = sqrt(mx_worley_noise_vec2(q, 0.9));
      const edge = f.y.sub(f.x);
      // Solid from a weight of ~0.75 (the rims' band covers the widest cells), lace below, threads at the thinnest.
      const width = w.pow(1.3).mul(1.2).add(0.18);
      const lace = float(1.0).sub(smoothstep(width.mul(0.5), width, edge));
      const cover = lace.mul(SET_FOAM_MAX_COVER).mul(saturate(foam.mul(4.0)));
      // The clumps: bright over each cell's middle, and a finer mottle of bubble clusters (~0.5 m) over them.
      const fine = mx_noise_float(vec3(frame.x.mul(2.2).add(5.3), frame.y.mul(2.2), time.mul(0.6)));
      // Three scales mixed, so no one cell size repeats as spots: the cells, the bubble clusters, and the ~1 m mottle.
      const clump = float(1.0).sub(smoothstep(0.05, 0.6, f.x)).mul(0.3).add(smoothstep(-0.35, 0.35, fine).mul(0.45)).add(smoothstep(-0.4, 0.4, n2).mul(0.25));
      out.assign(vec2(cover, saturate(clump).mul(0.45).add(0.62)));
    });
    return out;
  })();
}

/**
 * The foam pattern's water-anchored coordinates (spec 2026-09-27-foam-field-design.md §3.2): base xz in the mean
 * swell frame, vec2(metres along travel, metres across it). Crests pass through it; foam stays where the water put
 * it, and the pattern keeps its streaks along the crests (setFoamPattern's x is its long axis). CPU mirror below.
 */
export function waterFoamFrame(xz: N, travel: N): N {
  return vec2(xz.x.mul(travel.x).add(xz.y.mul(travel.y)), xz.y.mul(travel.x).sub(xz.x.mul(travel.y)));
}

export function waterFoamFrameCpu(x: number, z: number, travelX: number, travelZ: number): [number, number] {
  return [x * travelX + z * travelZ, z * travelX - x * travelZ];
}

/** The breaking foam map (FoamField), sampled at the undisplaced base xz. */
export interface SheetFoamMap {
  sampleNode(xz: N): { density: N; inside: N };
}

/**
 * The foam weight a surface point uses: the map inside its box, the Phase 2 placeholder outside, blended over the edge
 * band. Takes one sample (sampleNode's result, or null without a map) so each material binds the map once.
 */
export function sheetFoamWeight(placeholder: N, sample: { density: N; inside: N } | null): N {
  // max with the frame's own breaking foam: the map holds the source at its last 20 Hz tick on 1 m texels, so on its
  // own the bore's front would lag, step every third frame and blur; the map adds what lingers (final review, I2).
  return sample ? mix(placeholder, max(sample.density, placeholder), sample.inside) : placeholder;
}

/**
 * The sheet's shading normal: the FFT slopes, Jacobian-corrected (the Jxz cross term is knowingly dropped: the
 * derivatives texture has no channel for it), plus the set waves' analytic slope. The breaking ribbon shades with this
 * wherever it is the sheet's own shape, so the two meshes match there.
 */
export function sheetNormal(fft: { sx: N; sz: N; jxx: N; jzz: N }, setSlope: N): N {
  const fsx = fft.sx.div(max(float(1.0).add(fft.jxx), 0.1));
  const fsz = fft.sz.div(max(float(1.0).add(fft.jzz), 0.1));
  return normalize(vec3(fsx.negate().sub(setSlope.x), 1.0, fsz.negate().sub(setSlope.y)));
}

/** Dev-panel debug lines drawn on the water. */
export interface DebugOverlays {
  /** White lines every 1 m of still-water depth. */
  depthContours: boolean;
  /** Gold set-wave crest lines, every 2 s of arrival time τ. */
  crestLines: boolean;
  /** The breaking ribbon mixed 40% with magenta, to see where it starts and ends. */
  ribbonTint: boolean;
  /** The foam map: its box tinted faintly and its density in cyan, to see foam build up and clear. */
  foamMap: boolean;
  /** The spray puffs coloured by age (green at birth, red at death). */
  sprayTint: boolean;
  /** The land's cover in false colours (wet sand blue, sand yellow, rock red, heath green). */
  coverMap: boolean;
  /** The land's shadow in blue, on the land and the water. */
  sunlightMap: boolean;
}

export const DEFAULT_DEBUG_OVERLAYS: Readonly<DebugOverlays> = { depthContours: false, crestLines: false, ribbonTint: false, foamMap: false, sprayTint: false, coverMap: false, sunlightMap: false };

/**
 * The breaking ribbon's footprint mask (BreakingRibbon.footprint): an R8 texture of `size` texels, `cellM` m each,
 * texel (0, 0)'s corner at world xz `origin`, texel row = z. The sheet discards its pixels where the mask is set.
 */
export interface SheetFootprint {
  texture: THREE.Texture;
  origin: THREE.Vector2;
  cellM: number;
  size: THREE.Vector2;
}

export interface OceanSurfaceOptions {
  footprint?: SheetFootprint;
  /** The breaking foam map (spec 2026-09-27-foam-field-design.md); without it the sheet shows Phase 2's placeholder. */
  foamMap?: SheetFoamMap;
  /** The land's shadow (Phase 4a spec §4.8); without it the sun reaches everywhere. */
  sunlight?: SunlightSource;
  /** The land in the water's reflections (Phase 4a spec §4.9). */
  skyline?: SkylineTable;
  /** The coastal surf (Phase 4b spec 2026-09-28-the-waterline-design.md): the swash lift, the surf foam, the swash lace. */
  surf?: CoastalSurf;
}

/** True where the sheet draws: outside the footprint grid, or on a texel the mask leaves clear (≤ 0.5). */
function footprintClear(fp: SheetFootprint, xz: N): N {
  const origin = uniform(fp.origin), size = uniform(fp.size);
  const g = xz.sub(origin).div(fp.cellM).toVar();
  const inside = g.x.greaterThanEqual(0.0).and(g.y.greaterThanEqual(0.0)).and(g.x.lessThan(size.x)).and(g.y.lessThan(size.y));
  const texel = ivec2(clamp(floor(g), vec2(0.0), size.sub(1.0)));
  return inside.not().or(textureLoad(fp.texture, texel, int(0)).x.lessThanEqual(0.5));
}

/** The sheet's material for the eye's side of the surface (two built once; crossing the surface only swaps them). */
export function pickSheetMaterial<M>(underwater: boolean, above: M, below: M): M {
  return underwater ? below : above;
}

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  /** Seen from above: today's sheet, never touched by the underwater view. */
  readonly aboveMaterial: THREE.MeshBasicNodeMaterial;
  /**
   * Seen from below (underwater): the same surface, back faces, shaded by shadeWaterFromBelow. No footprint mask: the
   * ribbon is hidden underwater (it is single-sided), and a cut-out sheet would show a hole from below.
   */
  readonly belowMaterial: THREE.MeshBasicNodeMaterial;
  /** The grid is centred here each frame; waves are sampled in world space so they never slide. */
  readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];
  private readonly overlayDepth = uniform(0);
  private readonly overlayCrest = uniform(0);
  private readonly overlayFoam = uniform(0);
  private readonly overlaySun = uniform(0);

  constructor(readonly model: WaterSurfaceModel, sky: Sky, optics: WaterOpticsUniforms, options: OceanSurfaceOptions = {}) {
    const sim = model.sim;
    this.slopeVariance = sim.sizes.map(() => uniform(0));
    const grid = buildPolarGrid();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));

    const material = new THREE.MeshBasicNodeMaterial();
    // Single-sided: the sheet is one single-valued surface (the breaking ribbon draws the curl).
    material.side = THREE.FrontSide;

    // Vertex: world-anchored sampling, distance-faded cascades, the tide, Earth curvature. The set waves are summed
    // once per vertex; their analytic slope, foam and foam frame reach the fragment as varyings, so the fragment stage
    // adds no texture fetch for them.
    const baseXZ = positionLocal.xz.add(this.cameraXZ);
    const radial = length(positionLocal.xz);
    const setSlope = varyingProperty('vec2', 'vSetSlope');
    const setFoam = varyingProperty('float', 'vSetFoam');
    const setFoamFrame = varyingProperty('vec2', 'vSetFoamFrame');
    const setPile = varyingProperty('float', 'vSetPile');
    const displacement = model.displacementWithSetFoam(
      baseXZ, (c) => fadeWeightNode(radial, CASCADE_FADES[c].geometry), { slope: setSlope, foam: setFoam, foamFrame: setFoamFrame, pile: setPile },
    );
    const curvatureDrop = radial.mul(radial).div(2 * EARTH_RADIUS_M);
    // The swash (Phase 4b §3.3): near the shore the sheet is lifted by the swash level, so the waterline climbs the sand.
    const swashLift = options.surf ? options.surf.liftNode(baseXZ, model.seabed) : float(0.0);
    material.positionNode = vec3(baseXZ.x.add(displacement.x), model.seabed.tide.add(displacement.y).add(swashLift).sub(curvatureDrop), baseXZ.y.add(displacement.z));
    const vBaseXZ = varying(baseXZ);

    // Fragment: FFT normals and foam (long swell faded over shallow water) plus the set waves' slope (interpolated), as
    // Phase 1; the set waves' foam broken up by setFoamPattern.
    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const fft = model.fftSlopes(vBaseXZ, distance, this.slopeVariance);
    // The pile's churn tilts the shading (its height is in the vertex stage, SetWaves.displacementWithSetFoamNode).
    const churnSlope = churnSlopeNode(setPile, setFoamFrame, model.sets.meanTravel, model.sets.time, model.sets.churn);
    const normal = sheetNormal(fft, setSlope.add(churnSlope));
    const sunVis = options.sunlight ? options.sunlight.visibilityNode(vBaseXZ) : undefined;
    const seabed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics, sunVis);
    // The foam map inside its box, Phase 2's placeholder outside (spec 2026-09-27-foam-field-design.md §3.2); the
    // pattern rides the water. setFoamFrame (the crest frame) is the churn's.
    // One sample, shared by the weight and the overlay (one texture binding).
    const foamOverlay = options.foamMap ? options.foamMap.sampleNode(vBaseXZ) : null;
        const surfFoam = options.surf ? options.surf.foamNode(vBaseXZ, model.seabed, viewDir.y) : float(0.0);
        // The swash's edge (Phase 4b §3.3): lifted water under 0.1 m deep over the beach near the shore shows a foam lace.
        const swashLace = options.surf
          ? float(1.0).sub(smoothstep(0.02, 0.1, positionWorld.y.sub(model.seabed.bedHeightNode(vBaseXZ))))
            .mul(float(1.0).sub(smoothstep(0.0, 10.0, options.surf.dEdgeNode(vBaseXZ, model.seabed))))
            .mul(smoothstep(0.01, 0.05, options.surf.swashLevelNode(vBaseXZ.y))).mul(0.8)
          : float(0.0);
    const foamWeight = max(sheetFoamWeight(setFoam, foamOverlay), max(surfFoam, swashLace));
    const setFoamLook = setFoamPattern(foamWeight, waterFoamFrame(vBaseXZ, model.sets.meanTravel), model.sim.time);

    material.colorNode = shadeWater(
      { normal, viewDir, distance, foam: max(fft.foam, setFoamLook.x), foamShade: setFoamLook.y,
        unresolvedSlopeVariance: fft.lostSlopeVariance, seabed, sunVisibility: sunVis,
        landReflection: options.skyline ? (r: N) => options.skyline!.reflectionNode(positionWorld, r, sky) : undefined,
        overlay: { depth: model.seabed.waterDepthNode(vBaseXZ), tau: model.sets.tauNode(vBaseXZ), depthOn: this.overlayDepth, crestOn: this.overlayCrest,
          foamMap: (foamOverlay ? foamOverlay.density.add(foamOverlay.inside.mul(0.15)) : float(0.0)).add(surfFoam.mul(0.5)), foamOn: this.overlayFoam, sunOn: this.overlaySun } },
      sky,
      optics,
    );

    // The ribbon's footprint (spec §7.2): the sheet steps aside where the breaking ribbon draws the wave, sampled at the
    // displaced position as the footprint pass rasterises the ribbon's. Outside the mask's grid it never discards.
    if (options.footprint) material.maskNode = footprintClear(options.footprint, positionWorld.xz);

    // The view from below shares the vertex stage and the fragment's normal, foam and distance.
    const below = new THREE.MeshBasicNodeMaterial();
    below.side = THREE.BackSide;
    below.positionNode = material.positionNode;
    // A reef between the eye and the surface point hides it (the sheet is drawn over everything the dome shows).
    const fromBelow = shadeWaterFromBelow(
      {
        normal, viewDir, distance, foam: max(fft.foam, setFoamLook.x), surfaceY: positionWorld.y, tide: model.seabed.tide,
        reflected: (dir: N) => waterVolumeColourNode(positionWorld, dir, model.seabed, sky, optics),
      },
      sky, optics,
    );
    below.colorNode = reefInFrontNode(cameraPosition, viewDir.negate(), distance, fromBelow, model.seabed, sky, optics);
    this.aboveMaterial = material;
    this.belowMaterial = below;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  /** Swaps in the sheet's material for the eye's side of the surface. */
  setUnderwater(on: boolean): void {
    this.mesh.material = pickSheetMaterial(on, this.aboveMaterial, this.belowMaterial);
  }

  setOverlays(o: DebugOverlays): void {
    this.overlayDepth.value = o.depthContours ? 1 : 0;
    this.overlayCrest.value = o.crestLines ? 1 : 0;
    this.overlayFoam.value = o.foamMap ? 1 : 0;
    this.overlaySun.value = o.sunlightMap ? 1 : 0;
  }

  update(cameraPos: THREE.Vector3, sim: OceanSimulation): void {
    this.cameraXZ.value.set(cameraPos.x, cameraPos.z);
    sim.slopeVariance.forEach((v, c) => { this.slopeVariance[c].value = v; });
  }
}
