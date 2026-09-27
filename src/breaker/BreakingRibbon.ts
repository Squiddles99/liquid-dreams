import * as THREE from 'three/webgpu';
import {
  Break, Fn, If, Loop, attribute, cameraPosition, cross, dot, float, instanceIndex, int, length, max, mix, positionWorld, saturate, select, smoothstep,
  storage, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { type DebugOverlays, EARTH_RADIUS_M, type SheetFootprint, setFoamPattern } from '../ocean/OceanSurface';
import { type WaterOpticsUniforms, shadeWater } from '../ocean/waterShading';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
import { seabedTerms } from '../seabed/seabedShading';
import { REEF_GRID } from '../seabed/wombReef';
import type { Sky } from '../sky/Sky';
import type { BreakParams } from './breaking';
import { MAX_STATIONS, type Station, type StationEntry } from './crestTrace';
import { PROFILE_SAMPLES } from './lipProfile';
import {
  FRAME_PROFILE_VEC4S, FRAME_VEC4S, createLipUniforms, encodeTb, packFrameNodes, profileFrameNode, profilePointNode, sampleHomeNode, unpackFrameNodes, updateLipUniforms,
} from './lipProfileNodes';

type N = any;

/**
 * The breaking ribbon on the GPU (breaking-ribbon spec §5–6): the breaking part of each set wave as its own fine mesh,
 * one row of VERTS_PER_STATION vertices per crest station (crestTrace), each row the station's cross-section
 * (lipProfile, mirrored in lipProfileNodes) placed in the world. Three compute passes per frame: the frame (one
 * invocation per station), the vertices and the normals (one per vertex). The mesh draws the buffers with the water
 * shading (spec §7.3), and the footprint pass marks where the sheet steps aside (spec §7.2).
 */

/** A TSL function of undisplaced world xz (vec2) → the sheet's vec3 displacement there (relative to the tide). */
export type BaseSurfaceNode = (xz: N) => N;
export interface RibbonSurface {
  /** The sheet without cascade 2 (the profile's construction base) and cascade 2 alone (the chop), both with the
   * render's distance fades at the given camera distance. Production: from WaterSurfaceModel; self-tests: SetWaves
   * only (no FFT), so the GPU can be compared with the CPU model. */
  smooth: BaseSurfaceNode;
  chop: BaseSurfaceNode;
  /** Called by BreakingRibbon.setStations with the frame's camera (the fades' distance is measured from it). */
  setCamera?(camera: THREE.Vector3): void;
}

export const SKIRT_DEPTH_M = 0.3;
/** PROFILE_SAMPLES plus one skirt vertex at each end (index 0: under the front edge; last: under the back edge). */
export const VERTS_PER_STATION = PROFILE_SAMPLES + 2;
/** vec4s per station in the stations buffer: [x, z, nx, nz], [H, c, r, tb], [gap, 0, 0, 0]. */
export const STATION_VEC4S = 3;
/** A sample whose home is more than this inside both edges is `inner` (the footprint's 1 m shrink, spec R9). */
export const INNER_MARGIN_M = 1;
/**
 * A profile difference whose part across the crest (in the station's (n, y) plane: the difference less its component
 * along t̂) is shorter than this (m) is dead: the collapsed, unthrown lip, whose samples differ only by the lateral
 * displacement carried along t̂, so ∂P/∂j is parallel to ∂P/∂station and their cross product is f32 noise. 1 mm keeps
 * f32 position noise (≈ 1e-5 m at 100 m) to ~1% of any live difference, so the GPU and a CPU mirror agree on it…
 */
export const MIN_PROFILE_STEP_M = 1e-3;
/** …and the vertex takes the normal of the nearest live sample within this many along the profile (else straight up). */
export const NORMAL_SEARCH = 8;
/** The FFT cascade that is the chop (35 m patch): it fades out over the lip (spec R6). */
export const CHOP_CASCADE = 2;

/** A vertex whose interpolated dead flag exceeds this is discarded: gap rows and the triangles touching them (Q10). */
export const DEAD_EPSILON = 1e-4;
/** The footprint marks only stations at least this far into the ribbon (ρ): where ρ → 0 the ribbon is the sheet. */
export const FOOTPRINT_MIN_RHO = 0.01;
/**
 * The footprint mask's grid (spec §7.2): 0.5 m texels over the reef grid (the reef field's extent), texel centres on
 * the grid's points; texel row = z. `origin` is texel (0, 0)'s corner.
 */
export const FOOTPRINT_GRID: Readonly<Omit<SheetFootprint, 'texture'>> = {
  origin: new THREE.Vector2(REEF_GRID.x0 - REEF_GRID.cellM / 2, REEF_GRID.z0 - REEF_GRID.cellM / 2),
  cellM: REEF_GRID.cellM,
  size: new THREE.Vector2(REEF_GRID.nx, REEF_GRID.nz),
};
/** The `ribbon tint` overlay mixes this much magenta (at the colour's own luminance) into the ribbon. */
export const TINT_MIX = 0.4;

const V = VERTS_PER_STATION;
const LAST = PROFILE_SAMPLES - 1;

/**
 * The ribbon's fixed index buffer over MAX_STATIONS × VERTS_PER_STATION vertices (vertex i·V + l: station row i, local
 * sample l, skirts included): the quad of rows i, i + 1 and samples l, l + 1 is triangles (a, a + 1, a + V) and
 * (a + 1, a + V + 1, a + V), a = i·V + l, quads row by row. Their face normal is ∂P/∂l × ∂P/∂station: crestTrace orders
 * the stations along +t̂ and the profile runs front → back, so that is the side the normal pass orients the normals to
 * (its back-edge flip), out of the water: the front faces are the water's outside (the tube's inside under the lip).
 */
export function ribbonIndices(): Uint32Array {
  const out = new Uint32Array((MAX_STATIONS - 1) * (V - 1) * 6);
  let k = 0;
  for (let i = 0; i + 1 < MAX_STATIONS; i++) {
    for (let l = 0; l + 1 < V; l++) {
      const a = i * V + l;
      out[k++] = a; out[k++] = a + 1; out[k++] = a + V;
      out[k++] = a + 1; out[k++] = a + V + 1; out[k++] = a + V;
    }
  }
  return out;
}

/** The indices drawn for `stationCount` live rows: every quad between consecutive rows (none below two rows). */
export function ribbonDrawCount(stationCount: number): number {
  return stationCount < 2 ? 0 : (stationCount - 1) * (V - 1) * 6;
}

/** What the ribbon's material shades with: the water model (FFT detail, set foam, seabed, tide), the sky and the optics. */
export interface RibbonShading {
  model: WaterSurfaceModel;
  sky: Sky;
  optics: WaterOpticsUniforms;
}

/**
 * Packs the stations for the GPU (STATION_VEC4S × 4 floats each) into `out`, and returns how many rows are in use (at
 * most MAX_STATIONS). tb is encoded (encodeTb). A gap entry is a copy of the previous live station with gap = 1 (Q10),
 * so its vertices land on that station's and its triangles have zero width; a gap before any live station copies the
 * first live one. With no live station at all, nothing is in use (0).
 */
export function packStations(entries: readonly StationEntry[], out: Float32Array): number {
  const n = Math.min(entries.length, MAX_STATIONS);
  let prev = entries.slice(0, n).find((e): e is Station => !e.gap);
  if (!prev) return 0;
  for (let i = 0; i < n; i++) {
    const e = entries[i];
    if (!e.gap) prev = e;
    const s: Station = prev;
    out.set([s.x, s.z, s.nx, s.nz, s.H, s.c, s.r, encodeTb(s.tb), e.gap ? 1 : 0, 0, 0, 0], i * STATION_VEC4S * 4);
  }
  return n;
}

/** The production surface: WaterSurfaceModel with the render's per-cascade distance fades, measured from the camera. */
export interface ModelRibbonSurface extends RibbonSurface {
  /** The camera's xz (setCamera writes it). */
  readonly cameraXZ: THREE.UniformNode<'vec2', THREE.Vector2>;
  /** The sheet's lod at xz: cascade c's geometry fade at the horizontal distance from the camera to xz (OceanSurface's). */
  lod(xz: N): (cascade: number) => N;
}

/**
 * RibbonSurface from the water model (R6): smooth = the sheet with cascade 2's lod 0, chop = cascade 2 alone, each
 * cascade faded as the sheet's render fades it at that xz. So where lipness is 0, smooth + chop is the sheet exactly
 * (except where WaterSurfaceModel's total-surface seabed clamp engages: smooth is clamped without the chop there).
 */
export function modelRibbonSurface(model: WaterSurfaceModel): ModelRibbonSurface {
  const cameraXZ = uniform(new THREE.Vector2());
  const lod = (xz: N) => {
    const radial = length(xz.sub(cameraXZ));
    return (c: number): N => fadeWeightNode(radial, CASCADE_FADES[c].geometry);
  };
  return {
    cameraXZ,
    lod,
    smooth: (xz) => {
      const l = lod(xz);
      return model.displacement(xz, (c) => (c === CHOP_CASCADE ? float(0.0) : l(c)));
    },
    chop: (xz) => model.fftCascadeDisplacement(xz, CHOP_CASCADE, lod(xz)(CHOP_CASCADE)),
    setCamera: (c) => { cameraXZ.value.set(c.x, c.z); },
  };
}

const safeNormalize3 = (v: N): N => {
  const l = length(v);
  return select(l.greaterThan(1e-12), v.div(max(l, 1e-30)), vec3(0.0, 1.0, 0.0));
};

export class BreakingRibbon {
  /** Per vertex (MAX_STATIONS × VERTS_PER_STATION): position.xyz (world xz; y relative to the tide) + dead flag (the station's gap). */
  readonly positions: THREE.StorageBufferAttribute;
  /** Per vertex: normal.xyz (unit, out of the water) + inner (1 when the home is more than INNER_MARGIN_M inside both edges). */
  readonly normals: THREE.StorageBufferAttribute;
  /** Per vertex: vec4(thickness, lipness, curlFoam, rho). */
  readonly extras: THREE.StorageBufferAttribute;
  /** Per vertex: vec4(home world x, home world z, along-crest tangent x, tangent z) (the tangent is t̂ = (−n.z, n.x)). */
  readonly homes: THREE.StorageBufferAttribute;
  /** Per station: the frame as FRAME_VEC4S vec4s, lipProfileNodes.FRAME_LAYOUT order then the base samples Fb and the
   * landing guess (FRAME_BASE_OFFSET) (self-tests and diagnostics). */
  readonly frames: THREE.StorageBufferAttribute;
  /** How many station rows are live this frame (the draw range covers these). */
  stationCount = 0;
  /** The camera uploaded with the stations (world). */
  readonly camera = new THREE.Vector3();
  private readonly stationsAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * STATION_VEC4S * 4), 4);
  /** stationCount on the GPU: the normal pass's runs end at it. */
  private readonly rows = uniform(0);
  private readonly lip;
  private readonly framePass: THREE.ComputeNode;
  private readonly vertexPass: THREE.ComputeNode;
  private readonly normalPass: THREE.ComputeNode;
  /**
   * The ribbon drawn with the water shading (a plain magenta placeholder without RibbonShading: the self-tests never
   * draw it). It reads the vertex buffers as geometry attributes; the draw range covers the live rows.
   */
  readonly mesh: THREE.Mesh;
  /** The footprint mask (R8, FOOTPRINT_GRID): 1 where the sheet steps aside. renderFootprint fills it each frame. */
  readonly footprint: THREE.Texture;
  private readonly geometry: THREE.BufferGeometry;
  /** The footprint's render target (its texture is `footprint`); public for the self-tests' readback. */
  readonly footprintTarget: THREE.RenderTarget;
  private readonly footprintScene = new THREE.Scene();
  /** renderer.render needs a camera; the footprint material writes its clip position itself (buildFootprintMaterial). */
  private readonly footprintCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** Whether the mask may hold marks (so an empty frame must clear it once). */
  private footprintDirty = true;
  private readonly savedClearColor = new THREE.Color();
  /** The camera's xz (setStations): the Earth-curvature drop is measured from it, as the sheet's. */
  private readonly cameraXZ = uniform(new THREE.Vector2());
  private readonly tint = uniform(0);
  /** The FFT cascades' slope variances (the unresolved roughness), copied from the simulation each frame. */
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];

  constructor(private readonly surface: RibbonSurface, params: BreakParams, private readonly shading?: RibbonShading) {
    const vertexCount = MAX_STATIONS * V;
    this.positions = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.normals = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.extras = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.homes = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.frames = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * FRAME_VEC4S * 4), 4);
    this.lip = createLipUniforms(params);
    this.framePass = this.buildFramePass();
    this.vertexPass = this.buildVertexPass();
    this.normalPass = this.buildNormalPass();
    this.slopeVariance = (shading?.model.sim.sizes ?? []).map(() => uniform(0));

    // One geometry for both draws: the compute buffers are its attributes (a StorageBufferAttribute used as a geometry
    // attribute is created as a storage and vertex buffer), so nothing is copied. 'position' is the positions buffer
    // itself (vec4: xyz + the dead flag).
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.positions);
    this.geometry.setAttribute('ribbonNormal', this.normals);
    this.geometry.setAttribute('ribbonExtra', this.extras);
    this.geometry.setAttribute('ribbonHome', this.homes);
    this.geometry.setIndex(new THREE.BufferAttribute(ribbonIndices(), 1));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, this.buildMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    const { size } = FOOTPRINT_GRID;
    this.footprintTarget = new THREE.RenderTarget(size.x, size.y, {
      format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.footprint = this.footprintTarget.texture;
    const footprintMesh = new THREE.Mesh(this.geometry, this.buildFootprintMaterial());
    footprintMesh.frustumCulled = false;
    this.footprintScene.add(footprintMesh);
  }

  setParams(p: BreakParams): void {
    updateLipUniforms(this.lip, p);
  }

  setOverlays(o: DebugOverlays): void {
    this.tint.value = o.ribbonTint ? 1 : 0;
  }

  /** Uploads this frame's stations (≤ MAX_STATIONS; gaps included) and the camera position. */
  setStations(entries: readonly StationEntry[], camera: THREE.Vector3): void {
    this.camera.copy(camera);
    this.cameraXZ.value.set(camera.x, camera.z);
    this.surface.setCamera?.(camera);
    this.shading?.model.sim.slopeVariance.forEach((v, c) => { this.slopeVariance[c].value = v; });
    const n = packStations(entries, this.stationsAttr.array as Float32Array);
    this.stationCount = n;
    this.rows.value = n;
    this.geometry.setDrawRange(0, ribbonDrawCount(n));
    this.mesh.visible = n >= 2;
    if (n > 0) {
      this.stationsAttr.clearUpdateRanges();
      this.stationsAttr.addUpdateRange(0, n * STATION_VEC4S * 4);
      this.stationsAttr.needsUpdate = true;
    }
  }

  /** Runs the frame, vertex and normal compute passes (no-op with no stations). */
  compute(renderer: THREE.WebGPURenderer): void {
    if (this.stationCount === 0) return;
    this.framePass.count = this.stationCount;
    this.vertexPass.count = this.stationCount * V;
    this.normalPass.count = this.stationCount * V;
    renderer.compute([this.framePass, this.vertexPass, this.normalPass]);
  }

  /**
   * Renders the footprint mask: cleared to 0, then the live rows' inner strip (samples more than INNER_MARGIN_M inside
   * both edges, ρ ≥ FOOTPRINT_MIN_RHO, not dead) marked 1. With fewer than two rows nothing is drawn and the mask is left
   * cleared (the clear itself is skipped once it is clear). Call after compute(), before the frame's render.
   */
  renderFootprint(renderer: THREE.WebGPURenderer): void {
    const draw = this.stationCount >= 2;
    if (!draw && !this.footprintDirty) return;
    const target = renderer.getRenderTarget(), autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.savedClearColor);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.footprintTarget);
    renderer.clear(true, false, false);
    if (draw) {
      renderer.autoClear = false;
      renderer.render(this.footprintScene, this.footprintCamera);
    }
    renderer.setRenderTarget(target);
    renderer.autoClear = autoClear;
    renderer.setClearColor(this.savedClearColor, alpha);
    this.footprintDirty = draw;
  }

  /**
   * The ribbon's material (spec §7.3): the sheet's water shading (shadeWater, seabedTerms, setFoamPattern) on the
   * ribbon's own normal, tilted by the FFT detail (cascades 0–1 whole, the chop × (1 − lipness)) read at the vertex's
   * undisplaced home; the turquoise lip keyed by the real thickness; the sheet's foam at the home (vertex stage) with
   * the curl's foam. Gap rows are discarded (Q10).
   */
  private buildMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    material.side = THREE.FrontSide;
    const pos: N = attribute('position', 'vec4');
    const dead: N = varying(pos.w);
    material.maskNode = dead.lessThanEqual(DEAD_EPSILON);
    const shading = this.shading;
    if (!shading) {
      material.positionNode = pos.xyz;
      material.colorNode = vec3(1.0, 0.0, 1.0);
      return material;
    }
    const { model, sky, optics } = shading;
    // Vertex: y is relative to the tide; the Earth's curvature drops it as it drops the sheet (measured at the home,
    // the undisplaced point, as the sheet measures its undisplaced grid).
    const home: N = attribute('ribbonHome', 'vec4');
    const radial = length(home.xy.sub(this.cameraXZ));
    material.positionNode = vec3(pos.x, model.seabed.tide.add(pos.y).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)), pos.z);
    const vNormal: N = varying(attribute('ribbonNormal', 'vec4').xyz);
    const vExtra: N = varying(attribute('ribbonExtra', 'vec4'));
    const vHome: N = varying(home);
    // The sheet's set-wave foam weight and foam frame at the home, once per vertex (the sheet's own vertex-stage sum).
    const vSetFoam: N = varying(Fn(() => {
      const b = model.sets.breakSampleNode(home.xy);
      return vec3(b.foam, b.foamFrame);
    })());

    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const n0 = safeNormalize3(vNormal).toVar();
    const thickness = vExtra.x, lipness = saturate(vExtra.y), curlFoam = vExtra.z;
    const fft = model.fftSlopes(vHome.xy, distance, this.slopeVariance, (c) => (c === CHOP_CASCADE ? float(1.0).sub(lipness) : float(1.0)));
    // FFT slopes, Jacobian-corrected as the sheet's, split along the crest (t̂) and across it (d = (t̂.z, −t̂.x), the
    // travel direction), then applied in the ribbon normal's tangent frame: T = t̂ made perpendicular to n, B = n × T
    // (= d where n is up, so there this is the sheet's normalize(−sx, 1, −sz) exactly).
    const fsx = fft.sx.div(max(float(1.0).add(fft.jxx), 0.1));
    const fsz = fft.sz.div(max(float(1.0).add(fft.jzz), 0.1));
    const tHat = vec3(vHome.z, 0.0, vHome.w).toVar();
    const tAlong = tHat.sub(n0.mul(dot(n0, tHat))).toVar();
    const tLen = length(tAlong);
    const T = select(tLen.greaterThan(1e-4), tAlong.div(max(tLen, 1e-8)), tHat).toVar();
    const B = cross(n0, T);
    const sT = fsx.mul(tHat.x).add(fsz.mul(tHat.z));
    const sD = fsx.mul(tHat.z).sub(fsz.mul(tHat.x));
    const normal = safeNormalize3(n0.sub(T.mul(sT)).sub(B.mul(sD))).toVar();
    const underside = float(1.0).sub(smoothstep(-0.3, 0.3, n0.y));
    const lip = float(1.0).sub(smoothstep(0.05, 0.6, thickness)).mul(lipness);
    const foamLook = setFoamPattern(max(vSetFoam.x, curlFoam), vSetFoam.yz, model.sim.time);
    const seabed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics);
    const colour = shadeWater(
      { normal, viewDir, distance, foam: max(fft.foam, foamLook.x), foamShade: foamLook.y, lip, underside,
        unresolvedSlopeVariance: fft.lostSlopeVariance, seabed },
      sky,
      optics,
    ).toVar();
    // The ribbon tint: magenta at the colour's own luminance (the colour is HDR radiance, so a plain magenta would read black).
    const magenta = vec3(1.0, 0.0, 1.0).mul(dot(colour, vec3(0.2126, 0.7152, 0.0722)).div(0.2848));
    material.colorNode = mix(colour, magenta, this.tint.mul(TINT_MIX));
    return material;
  }

  /**
   * The footprint pass's material: each vertex goes straight to clip space over FOOTPRINT_GRID (x → NDC x, z → NDC −y;
   * WebGPU's framebuffer rows and texture rows both start at NDC +y, so texel row r holds z = origin.z + (r + ½)·cellM),
   * so no camera convention is involved. Writes 1 on the live inner strip and discards elsewhere, leaving the clear's
   * 0: order-independent where the curl overlaps itself in plan view.
   */
  private buildFootprintMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    material.side = THREE.DoubleSide;
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    material.fog = false;
    const { origin, cellM, size } = FOOTPRINT_GRID;
    const pos: N = attribute('position', 'vec4');
    const u = pos.x.sub(origin.x).div(size.x * cellM);
    const v = pos.z.sub(origin.y).div(size.y * cellM);
    material.vertexNode = vec4(u.mul(2.0).sub(1.0), float(1.0).sub(v.mul(2.0)), 0.5, 1.0);
    const inner: N = varying(attribute('ribbonNormal', 'vec4').w);
    const rho: N = varying(attribute('ribbonExtra', 'vec4').w);
    const dead: N = varying(pos.w);
    material.maskNode = dead.lessThanEqual(DEAD_EPSILON).and(rho.greaterThanEqual(FOOTPRINT_MIN_RHO)).and(inner.greaterThan(0.5));
    material.colorNode = vec4(1.0);
    return material;
  }

  private stationsNode(): N {
    return storage(this.stationsAttr, 'vec4', MAX_STATIONS * STATION_VEC4S).toReadOnly();
  }

  /** profileFrame per station, from four samples of the smooth base along the station's normal. */
  private buildFramePass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * FRAME_VEC4S);
    return Fn(() => {
      const i: N = int(instanceIndex).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const b = stations.element(i.mul(STATION_VEC4S).add(1)).toVar();
      const S = a.xy, n = a.zw;
      // base(u) = (d·n + u, d.y) with d the smooth sheet at S + n·u: the displaced point's component along n.
      const baseAt = (u: N): N => {
        const uu = float(u).toVar();
        const xz = S.add(n.mul(uu)).toVar();
        const d = vec3(this.surface.smooth(xz)).toVar();
        return vec2(dot(d.xz, n).add(uu), d.y);
      };
      const f = profileFrameNode(baseAt, { H: b.x, c: b.y, r: b.z, tb: b.w }, this.lip);
      packFrameNodes(f).forEach((v, k) => frames.element(i.mul(FRAME_VEC4S).add(k)).assign(v));
    })().compute(MAX_STATIONS) as THREE.ComputeNode;
  }

  /** Each vertex: its home, the smooth base there, the profile point, placed in the world, plus the chop off the lip. */
  private buildVertexPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * FRAME_VEC4S).toReadOnly();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V);
    const normals = storage(this.normals, 'vec4', MAX_STATIONS * V);
    const extras = storage(this.extras, 'vec4', MAX_STATIONS * V);
    const homes = storage(this.homes, 'vec4', MAX_STATIONS * V);
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const i: N = idx.div(V).toVar();
      const local: N = idx.sub(i.mul(V)).toVar();
      // Profile sample j = local − 1; the skirts (local 0 and V − 1) compute their edge sample and are lowered.
      const j = local.sub(1).clamp(int(0), int(LAST)).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const gap = stations.element(i.mul(STATION_VEC4S).add(2)).x.toVar();
      const fv = Array.from({ length: FRAME_PROFILE_VEC4S }, (_, k) => frames.element(i.mul(FRAME_VEC4S).add(k)).toVar());
      const f = unpackFrameNodes(fv);
      const S = a.xy, n = a.zw;
      const tHat = vec2(n.y.negate(), n.x).toVar();
      const home = sampleHomeNode(j, f).toVar();
      const xzHome = S.add(n.mul(home)).toVar();
      const d = vec3(this.surface.smooth(xzHome)).toVar();
      const baseHome = vec2(home.add(dot(d.xz, n)), d.y);
      const p = profilePointNode(j, f, baseHome, home);
      const pos = vec2(p.pos).toVar();
      const lipness = float(p.lipness).toVar();
      // The profile's u along n; the lateral displacement at home carried unchanged along t̂.
      const xz = S.add(n.mul(pos.x)).add(tHat.mul(dot(d.xz, tHat)));
      const chop = vec3(this.surface.chop(xzHome)).mul(float(1.0).sub(lipness)).toVar();
      const skirt = select(local.equal(int(0)).or(local.equal(int(V - 1))), float(SKIRT_DEPTH_M), float(0.0));
      positions.element(idx).assign(vec4(xz.x.add(chop.x), pos.y.add(chop.y).sub(skirt), xz.y.add(chop.z), gap));
      const inner = select(f.uFront.sub(home).greaterThan(INNER_MARGIN_M).and(home.sub(f.uBack).greaterThan(INNER_MARGIN_M)), float(1.0), float(0.0));
      // The normal pass fills xyz.
      normals.element(idx).assign(vec4(0.0, 1.0, 0.0, inner));
      extras.element(idx).assign(vec4(p.thickness, lipness, p.curlFoam, f.rho));
      homes.element(idx).assign(vec4(xzHome, tHat));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }

  /**
   * Each vertex's normal: cross(∂P/∂station, ∂P/∂j) from central differences (one-sided at the profile's ends, and
   * along the stations next to a gap or the end of the rows; a station alone in its run uses its tangent t̂), flipped
   * for the whole station if it points down at the back edge (the water is below and behind). A vertex whose profile
   * difference is dead (MIN_PROFILE_STEP_M across the crest) takes the normal of the nearest live sample within
   * NORMAL_SEARCH (else straight up). Skirts take their edge vertex's normal.
   */
  private buildNormalPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V).toReadOnly();
    const normals = storage(this.normals, 'vec4', MAX_STATIONS * V);
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const i: N = idx.div(V).toVar();
      const local: N = idx.sub(i.mul(V)).toVar();
      const j = local.sub(1).clamp(int(0), int(LAST)).toVar();
      const rows: N = int(this.rows);
      const gapAt = (row: N): N => stations.element(row.mul(STATION_VEC4S).add(2)).x;
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const tangent = vec3(a.w.negate(), 0.0, a.z).toVar();
      const live = gapAt(i).lessThan(0.5).toVar();
      const iPrev: N = i.sub(1).max(int(0)).toVar();
      const iNext = i.add(1).min(rows.sub(1)).toVar();
      const hasPrev = live.and(i.greaterThan(int(0))).and(gapAt(iPrev).lessThan(0.5)).toVar();
      const hasNext = live.and(i.add(1).lessThan(rows)).and(gapAt(iNext).lessThan(0.5)).toVar();
      /** Profile sample jj (clamped into the profile) of station row. */
      const P = (row: N, jj: N): N => positions.element(row.mul(V).add(jj.clamp(int(0), int(LAST))).add(1)).xyz;
      const dStation = (jj: N): N => select(hasPrev.and(hasNext), P(iNext, jj).sub(P(iPrev, jj)),
        select(hasNext, P(iNext, jj).sub(P(i, jj)), select(hasPrev, P(i, jj).sub(P(iPrev, jj)), tangent)));
      const dProfile = (jj: N): N => select(jj.equal(int(0)), P(i, jj.add(1)).sub(P(i, jj)),
        select(jj.equal(int(LAST)), P(i, jj).sub(P(i, jj.sub(1))), P(i, jj.add(1)).sub(P(i, jj.sub(1)))));
      const isLive = (jj: N): N => {
        const dj = dProfile(jj).toVar();
        const across = dj.sub(tangent.mul(dot(dj, tangent)));
        return dot(across, across).greaterThanEqual(MIN_PROFILE_STEP_M * MIN_PROFILE_STEP_M);
      };
      // The nearest sample with a live profile difference.
      const jn = j.toVar();
      If(isLive(j).not(), () => {
        Loop({ start: 1, end: NORMAL_SEARCH + 1, name: 'k' } as N, ({ k }: N) => {
          If(j.sub(k).greaterThanEqual(int(0)).and(isLive(j.sub(k))), () => {
            jn.assign(j.sub(k));
            Break();
          });
          If(j.add(k).lessThanEqual(int(LAST)).and(isLive(j.add(k))), () => {
            jn.assign(j.add(k));
            Break();
          });
        });
      });
      const nrm = cross(dStation(jn), dProfile(jn)).toVar();
      // The station's orientation, from its back edge: that normal must point up.
      const back = cross(dStation(int(LAST)), dProfile(int(LAST)));
      const oriented = select(back.y.lessThan(0.0), nrm.negate(), nrm);
      // No live difference within the search: the vertex sits in a collapsed cluster (its triangles have no area).
      const normal = select(isLive(jn), safeNormalize3(oriented), vec3(0.0, 1.0, 0.0));
      normals.element(idx).assign(vec4(normal, normals.element(idx).w));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }
}
