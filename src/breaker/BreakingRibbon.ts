import { churnHeightNode, churnSlopeNode } from '../whitewater/pileChurn';
import * as THREE from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, atan, attribute, floor, cameraPosition, clamp, cross, dot, float, instanceIndex, int, length, max, min, mix, normalize, positionWorld, saturate, select, smoothstep,
  storage, uniform, varying, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { smoothstep as smoothstepCpu } from '../math/smoothstep';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import { type DebugOverlays, EARTH_RADIUS_M, type SheetFoamMap, type SheetFootprint, setFoamPattern, sheetFoamWeight, sheetNormal, waterFoamFrame } from '../ocean/OceanSurface';
import { type WaterOpticsUniforms, shadeWater } from '../ocean/waterShading';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
import { seabedTerms } from '../seabed/seabedShading';
import { REEF_GRID } from '../seabed/wombReef';
import type { Sky } from '../sky/Sky';
import type { SunlightSource } from '../land/SunlightMap';
import type { SkylineTable } from '../land/SkylineTable';
import type { BreakParams } from './breaking';
import { MAX_STATIONS, type Station, type StationEntry } from './crestTrace';
import { TUBE_TIP_CLEAR_M } from './lipProfile';
import { encodeTb, tubeLightAtNode } from './lipProfileNodes';
import { CURVE_SAMPLES } from './wombProfile';
import { EDGE_OUTER_UNITS } from './wombSection';
import { WOMB_FRAME_VEC4S, WOMB_KNOT_VEC4S, createKeyTable, interiorWeightNode, sectionNumbersNode, wombFrameNode } from './wombSectionNodes';

type N = any;

/** The samples in a station's cross-section (wombProfile.CURVE_SAMPLES), front edge (the beach side) to back edge. */
export const PROFILE_SAMPLES = CURVE_SAMPLES;

/**
 * The breaking ribbon on the GPU (breaking-ribbon spec §5–6; spec 2026-10-05-womb-profile-design §4): the breaking part
 * of each set wave as its own fine mesh, one row of VERTS_PER_STATION vertices per crest station (crestTrace), each row
 * the station's cross-section (wombSection, mirrored in wombSectionNodes) placed in the world. Three compute passes per frame: the frame (one
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
  /** The smooth sheet without the whitewater pile: the frame (where the lip lands, when, how fast it throws) is measured
   * on it (lipProfile.buildProfile's frameBase). Absent: `smooth`. */
  frameBase?: BaseSurfaceNode;
  /** Called by BreakingRibbon.setStations with the frame's camera (the fades' distance is measured from it). */
  setCamera?(camera: THREE.Vector3): void;
}

export const SKIRT_DEPTH_M = 0.3;
/** PROFILE_SAMPLES plus one skirt vertex at each end (index 0: under the front edge; last: under the back edge). */
export const VERTS_PER_STATION = PROFILE_SAMPLES + 2;
/** vec4s per station in the stations buffer: [x, z, nx, nz], [H, c, r, tb], [gap, runEnd, ψ, lipH (0: none)] (packStations). */
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
/**
 * …and the vertex takes the normal of the nearest live sample within this many along the profile: the whole profile,
 * so a dead vertex always takes a normal oriented as its own surface (the face's winding side), never a guess. Only a
 * station with no live difference at all (no area anywhere) falls back to straight up.
 */
export const NORMAL_SEARCH = PROFILE_SAMPLES - 1;
/** The FFT cascade that is the chop (35 m patch): it fades out over the lip (spec R6). */
export const CHOP_CASCADE = 2;

/**
 * WebGPU's baseline maxStorageBuffersPerShaderStage (the game asks the device for no more: it runs on unknown hardware).
 * Every compute pass here stays within it; BreakingRibbon.limits.test.ts builds each pass's WGSL and counts. Inventory
 * (buffers each pass binds):
 * - frame: stations, frames, SetWaves' waves (in the smooth base) = 3;
 * - vertex: stations, frames, lipProfileNodes' sample table, waves, positions, normals, extras, details = 8 (at the limit:
 *   it writes the home xz into details, and the develop pass moves it into homes);
 * - develop: stations, frames, positions, details, homes = 5;
 * - light: stations, frames, positions, lights = 4;
 * - chop: positions, extras, details = 3 (+ nothing from the FFT: textures);
 * - normal: stations, positions, normals = 3.
 */
export const MAX_STORAGE_BUFFERS_PER_STAGE = 8;

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
/** A station within this much crest (m, of arc) of its run's first or last station marks no footprint (packStations'
 * runEnd): the texels round the ribbon's along-crest end can never discard sheet beyond it. */
export const FOOTPRINT_END_MARGIN_M = 1;
/**
 * The ribbon shades as the sheet where its shape is the sheet's (the front and back segments, and wherever the
 * constructed curve's weight → 0: before it steepens, and from the collapse's end on), and with its own normal where it
 * departs: the per-vertex `constructed` weight is smoothstep(SHEET_BLEND_M) of the profile point's distance from the
 * sheet's point at its home (m, in the station's plane, before the chop).
 */
export const SHEET_BLEND_M: readonly [number, number] = [0.01, 0.05];
/** The `ribbon tint` overlay mixes this much magenta into the ribbon… */
export const TINT_MIX = 0.4;
/** …a magenta this bright after the picture's exposure (so it reads the same at any exposure, before tone mapping). */
export const TINT_EXPOSED = 0.8;
/**
 * The ribbon's depth bias toward the camera (reversed-Z Depth32Float: +1 unit = one float step at the triangle's
 * depth, ≈ distance × 1.2e-7 m), so it wins over the sheet where the two draw the same surface (the footprint's overlap
 * strip and the along-crest ends): about distance × 2.4e-4 (1.2 cm at 50 m), plus two slope units at grazing angles.
 */
export const RIBBON_DEPTH_BIAS_UNITS = 2000;
export const RIBBON_DEPTH_BIAS_SLOPE = 2;

/**
 * The developed u of each profile sample (spec R6, controller ruling): where the ribbon reads its FFT detail and chop,
 * so a steep or overhanging stretch gets detail in proportion to its own length rather than one column of the sheet's.
 * From the front edge, uFront − (the curve's arc length from the front edge); from the back edge, uBack + (its arc
 * length from the back edge); blended by a smoothstep over `between` (sample indices: the station's floor and crest
 * samples, so the blend runs across the lip, where the chop is faded out whenever the lip is drawn). Exactly uFront and
 * uBack at the edges (the sheet's own homes there), continuous along the profile. `points` are the chop-free profile
 * samples (u along n, y), front to back. With `blend` (the ribbon's detail coordinate): mix(home, developed u, weight) per
 * sample, so a station whose profile is the sheet's own (weight → 0) reads its detail at the sheet's home exactly,
 * continuous across stations; the home itself at both edges. The GPU's develop pass mirrors this in f32.
 */
export function developedU(
  points: readonly (readonly [number, number])[], uFront: number, uBack: number, between: readonly [number, number],
  blend?: { readonly homes: readonly number[]; readonly weight: number },
): number[] {
  const arc = [0];
  for (let j = 1; j < points.length; j++) arc.push(arc[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));
  const total = arc[arc.length - 1];
  const last = arc.length - 1;
  const lo = Math.min(between[0], between[1]), hi = Math.max(between[0], between[1]) + 1;
  return arc.map((a, j) => {
    const fromFront = uFront - a, fromBack = uBack + (total - a);
    const wFront = 1 - smoothstepCpu(lo, hi, j);
    const dev = fromFront * wFront + fromBack * (1 - wFront); // exactly each edge's own at its end
    if (!blend) return dev;
    const home = blend.homes[j];
    return j === 0 || j === last ? home : home * (1 - blend.weight) + dev * blend.weight;
  });
}

/** Per entry: whether it is a live station within FOOTPRINT_END_MARGIN_M of arc of its run's first or last station (a run:
 * consecutive live stations between gaps or the ends of the (≤ MAX_STATIONS) rows). */
export function runEndFlags(entries: readonly StationEntry[], n = Math.min(entries.length, MAX_STATIONS)): boolean[] {
  const flags = new Array<boolean>(n).fill(false);
  for (let a = 0; a < n;) {
    if (entries[a].gap) { a++; continue; }
    let b = a;
    while (b + 1 < n && !entries[b + 1].gap) b++;
    const first = (entries[a] as Station).arc, last = (entries[b] as Station).arc;
    for (let i = a; i <= b; i++) {
      const arc = (entries[i] as Station).arc;
      flags[i] = Math.abs(arc - first) < FOOTPRINT_END_MARGIN_M || Math.abs(last - arc) < FOOTPRINT_END_MARGIN_M;
    }
    a = b + 1;
  }
  return flags;
}

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
  /** The breaking foam map (spec 2026-09-27-foam-field-design.md), read at each vertex's home; absent: the placeholder. */
  foamMap?: SheetFoamMap;
  /** The land's shadow (Phase 4a spec §4.8); absent: the sun reaches everywhere. */
  sunlight?: SunlightSource;
  /** The land in the water's reflections (Phase 4a spec §4.9). */
  skyline?: SkylineTable;
}

/**
 * Packs the stations for the GPU (STATION_VEC4S × 4 floats each) into `out`, and returns how many rows are in use (at
 * most MAX_STATIONS). tb is encoded (encodeTb). A gap entry is a copy of the previous live station with gap = 1 (Q10),
 * so its vertices land on that station's and its triangles have zero width; a gap before any live station copies the
 * first live one. With no live station at all, nothing is in use (0). runEnd is 1 on a live station near its run's
 * end (runEndFlags), 0 otherwise (gap rows too: they are dead anyway).
 */
export function packStations(entries: readonly StationEntry[], out: Float32Array): number {
  const n = Math.min(entries.length, MAX_STATIONS);
  let prev = entries.slice(0, n).find((e): e is Station => !e.gap);
  if (!prev) return 0;
  const ends = runEndFlags(entries, n);
  for (let i = 0; i < n; i++) {
    const e = entries[i];
    if (!e.gap) prev = e;
    const s: Station = prev;
    out.set([s.x, s.z, s.nx, s.nz, s.H, s.c, s.r, encodeTb(s.tb), e.gap ? 1 : 0, ends[i] ? 1 : 0, s.psi, s.lipH ?? 0], i * STATION_VEC4S * 4);
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
    frameBase: (xz) => {
      const l = lod(xz);
      return model.displacement(xz, (c) => (c === CHOP_CASCADE ? float(0.0) : l(c)), false);
    },
    setCamera: (c) => { cameraXZ.value.set(c.x, c.z); },
  };
}

const safeNormalize3 = (v: N): N => {
  const l = length(v);
  return select(l.greaterThan(1e-12), v.div(max(l, 1e-30)), vec3(0.0, 1.0, 0.0));
};

/** Unit n reflected into the hemisphere facing the unit view direction v: n − 2·min(n·v, 0)·v (n where it already faces v). */
const towardViewer = (n: N, v: N): N => safeNormalize3(n.sub(v.mul(min(dot(n, v), 0.0).mul(2.0))));

/**
 * The ribbon's shading normal (the material, and ribbon.selftest.ts in a compute pass). `geometric` is the ribbon's own
 * (interpolated) normal, `tangent` t̂ (vec3), `fft` the FFT slopes read at the detail coordinate (WaterSurfaceModel.
 * fftSlopes), `setSlope` the sheet's analytic set-wave slope at the home, `constructed` the SHEET_BLEND_M weight, `viewDir`
 * toward the camera.
 * - The sheet's normal: sheetNormal(fft, setSlope), exactly as OceanSurface shades.
 * - The ribbon's own: the geometric normal bent into the viewer's hemisphere, tilted by the same FFT slopes in its
 *   tangent frame (T = t̂ made perpendicular to n, B = n × T: = the travel direction where n is up, so there it is the
 *   sheet's FFT tilt), bent again.
 * - The result is the sheet's normal exactly where constructed is 0 (the edges, the hand-back), the ribbon's where it is
 *   1, and their normalised blend, bent into view, between. `geometric` is the bent geometric normal (for `underside`).
 */
export function ribbonShadingNormal(i: { geometric: N; tangent: N; fft: { sx: N; sz: N; jxx: N; jzz: N }; setSlope: N; constructed: N; viewDir: N }): { normal: N; geometric: N } {
  // In an Fn, so every input (the FFT fetches above all) is evaluated once, in order, before the final select: outside
  // one, TSL would emit each var at its first use, inside the select's branches.
  const normal = Fn(() => ribbonNormalBody(i))();
  return { normal, geometric: towardViewer(safeNormalize3(i.geometric), i.viewDir) };
}

function ribbonNormalBody(i: { geometric: N; tangent: N; fft: { sx: N; sz: N; jxx: N; jzz: N }; setSlope: N; constructed: N; viewDir: N }): N {
  const sheet = sheetNormal(i.fft, i.setSlope).toVar();
  const n0 = towardViewer(safeNormalize3(i.geometric), i.viewDir).toVar();
  const fsx = i.fft.sx.div(max(float(1.0).add(i.fft.jxx), 0.1));
  const fsz = i.fft.sz.div(max(float(1.0).add(i.fft.jzz), 0.1));
  const tHat = vec3(i.tangent).toVar();
  const tAlong = tHat.sub(n0.mul(dot(n0, tHat))).toVar();
  const tLen = length(tAlong);
  const T = select(tLen.greaterThan(1e-4), tAlong.div(max(tLen, 1e-8)), tHat).toVar();
  const B = cross(n0, T);
  const sT = fsx.mul(tHat.x).add(fsz.mul(tHat.z));
  const sD = fsx.mul(tHat.z).sub(fsz.mul(tHat.x));
  const own = towardViewer(safeNormalize3(n0.sub(T.mul(sT)).sub(B.mul(sD))), i.viewDir).toVar();
  const w = saturate(i.constructed).toVar();
  const blended = towardViewer(safeNormalize3(mix(sheet, own, w)), i.viewDir).toVar();
  return select(w.greaterThan(0.0), blended, sheet);
}

export class BreakingRibbon {
  /** Per vertex (MAX_STATIONS × VERTS_PER_STATION): position.xyz (world xz; y relative to the tide) + dead flag (the station's gap). */
  readonly positions: THREE.StorageBufferAttribute;
  /** Per vertex: normal.xyz (unit, out of the water) + inner (1 when the home is more than INNER_MARGIN_M inside both edges). */
  readonly normals: THREE.StorageBufferAttribute;
  /** Per vertex: vec4(thickness, lipness, curlFoam, rho). */
  readonly extras: THREE.StorageBufferAttribute;
  /** Per vertex: vec4(home world x, home world z, along-crest tangent x, tangent z) (the tangent is t̂ = (−n.z, n.x)). */
  readonly homes: THREE.StorageBufferAttribute;
  /**
   * Per vertex: vec4(detail world x, detail world z, detail u, constructed): where the vertex reads its FFT detail and
   * chop, S + n·mix(home u, developed u, frame weight) (developedU with its blend), the home exactly at both edges and
   * wherever the frame's weight is 0; and the SHEET_BLEND_M weight of its departure
   * from the sheet (0 on the front and back segments). Skirts take their edge's.
   */
  readonly details: THREE.StorageBufferAttribute;
  /** Per vertex: vec4(sLip, o, tLip, sBody), the tube's light (lipProfile.tubeLight; spec 2026-10-03 lip-and-tube-look §5). */
  readonly lights: THREE.StorageBufferAttribute;
  /** Per station: WOMB_FRAME_VEC4S vec4s, [A, phase, hollow, ρ], [tip, crest, floor samples (front → back), tip life],
   * [tip u, y, crest u, y] (units of A) (wombSectionNodes.wombFrameNode). */
  readonly frames: THREE.StorageBufferAttribute;
  /** Per station: its CURVE_SAMPLES profile samples, vec4(u, y, 0, 0) in units of A, front edge to back edge. */
  readonly sections: THREE.StorageBufferAttribute;
  /** Per station: the rounded knots (the frame pass's scratch). */
  private readonly knots: THREE.StorageBufferAttribute;
  /** The profile family's keyframes (wombProfile.keyTable), read-only. */
  private readonly keys = createKeyTable();
  /** How many station rows are live this frame (the draw range covers these). */
  stationCount = 0;
  /** The camera uploaded with the stations (world). */
  readonly camera = new THREE.Vector3();
  private readonly stationsAttr = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * STATION_VEC4S * 4), 4);
  /** stationCount on the GPU: the normal pass's runs end at it. */
  private readonly rows = uniform(0);
  /** The ribbon's onset ratio (BreakParams.ribbonOnset) and the swell's period (s): setParams, setPeriod. */
  private readonly ribbonOnset = uniform(0.6);
  private readonly periodS = uniform(15);
  /** The wind's offshore speed (m/s): setOffshore. */
  private readonly offshoreMs = uniform(0);
  /** The sun's direction (world, unit, toward the sun): setSun. */
  private readonly sun = uniform(new THREE.Vector3(0, 1, 0));
  private readonly lightPass: THREE.ComputeNode;
  private readonly framePass: THREE.ComputeNode;
  private readonly vertexPass: THREE.ComputeNode;
  private readonly developPass: THREE.ComputeNode;
  private readonly chopPass: THREE.ComputeNode;
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
  /** The `ribbon tint` overlay's switch (0/1; setOverlays), public for inspection. */
  readonly tint = uniform(0);
  /** 1 / the picture's exposure (setDisplayExposure): the tint's magenta is TINT_EXPOSED after exposure. */
  private readonly inverseExposure = uniform(1);
  /** The FFT cascades' slope variances (the unresolved roughness), copied from the simulation each frame. */
  private readonly slopeVariance: THREE.UniformNode<'float', number>[];

  constructor(private readonly surface: RibbonSurface, params: BreakParams, private readonly shading?: RibbonShading) {
    const vertexCount = MAX_STATIONS * V;
    this.positions = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.normals = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.extras = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.homes = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.details = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.lights = new THREE.StorageBufferAttribute(new Float32Array(vertexCount * 4), 4);
    this.frames = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * WOMB_FRAME_VEC4S * 4), 4);
    this.sections = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * PROFILE_SAMPLES * 4), 4);
    this.knots = new THREE.StorageBufferAttribute(new Float32Array(MAX_STATIONS * WOMB_KNOT_VEC4S * 4), 4);
    this.ribbonOnset.value = params.ribbonOnset;
    this.framePass = this.buildFramePass();
    this.vertexPass = this.buildVertexPass();
    this.developPass = this.buildDevelopPass();
    this.lightPass = this.buildLightPass();
    this.chopPass = this.buildChopPass();
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
    this.geometry.setAttribute('ribbonDetail', this.details);
    this.geometry.setAttribute('ribbonLight', this.lights);
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
    this.ribbonOnset.value = p.ribbonOnset;
  }

  /** The swell's period (s): the tube's hold and collapse grow with it (wombSection.tubeHold). */
  setPeriod(periodS: number): void {
    if (Number.isFinite(periodS) && periodS > 0) this.periodS.value = periodS;
  }

  /** The wind's offshore speed (m/s, overturn.offshoreSpeed): the tube's wind factors (Feddersen et al. 2023). */
  setOffshore(ms: number): void {
    this.offshoreMs.value = Number.isFinite(ms) ? ms : 0;
  }

  /** The sun's direction (world, unit, toward the sun), for the tube's light. */
  setSun(dir: THREE.Vector3): void {
    this.sun.value.copy(dir);
  }

  setOverlays(o: DebugOverlays): void {
    this.tint.value = o.ribbonTint ? 1 : 0;
  }

  /** The picture's current exposure (PicturePipeline.exposureValue), so the tint reads the same at any exposure. */
  setDisplayExposure(exposure: number): void {
    this.inverseExposure.value = 1 / Math.max(exposure, 1e-12);
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

  /**
   * Builds the compute passes and the footprint's material while the game loads (App.prewarm builds the mesh itself).
   * Built on the first breaking wave instead, they froze that frame (the frame pass alone took 0.4–1.7 s).
   */
  async compileAsync(renderer: THREE.WebGPURenderer): Promise<void> {
    await renderer.compileComputeAsync([this.framePass, this.vertexPass, this.developPass, this.lightPass, this.chopPass, this.normalPass]);
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.footprintTarget);
    try {
      await renderer.compileAsync(this.footprintScene, this.footprintCamera);
    } finally {
      renderer.setRenderTarget(target);
    }
  }

  /** Runs the frame, vertex, develop, light, chop and normal compute passes (no-op with no stations). */
  compute(renderer: THREE.WebGPURenderer): void {
    if (this.stationCount === 0) return;
    this.framePass.count = this.stationCount;
    this.vertexPass.count = this.stationCount * V;
    this.developPass.count = this.stationCount;
    this.lightPass.count = this.stationCount * V;
    this.chopPass.count = this.stationCount * V;
    this.normalPass.count = this.stationCount * V;
    renderer.compute([this.framePass, this.vertexPass, this.developPass, this.lightPass, this.chopPass, this.normalPass]);
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
   * ribbonShadingNormal: the sheet's own normal (its analytic set-wave slope at the home + the FFT detail) where the
   * ribbon is the sheet's shape, the ribbon's own normal tilted by the FFT detail where it departs, blended by the
   * per-vertex constructed weight; the FFT detail (cascades 0–1 whole, the chop × (1 − lipness)) is read at the detail
   * coordinate (the developed profile: `details`, the home at the edges). The turquoise lip keyed by the real thickness;
   * the sheet's foam at the home (vertex stage) with the curl's foam × ρ. The ribbon's own normal is bent into the
   * viewer's hemisphere (a normal facing away, as where a triangle spans the lip's tip and interpolates opposite normals,
   * would otherwise read as a mirror: Fresnel → 1 and sun glitter at its cap). Gap rows are discarded (Q10). A depth bias
   * toward the camera makes the ribbon win where it and the sheet draw the same surface.
   */
  private buildMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial();
    material.side = THREE.FrontSide;
    material.polygonOffset = true;
    material.polygonOffsetUnits = RIBBON_DEPTH_BIAS_UNITS;
    material.polygonOffsetFactor = RIBBON_DEPTH_BIAS_SLOPE;
    const pos: N = attribute('position', 'vec4');
    const dead: N = varying(pos.w);
    material.maskNode = dead.lessThanEqual(DEAD_EPSILON);
    const shading = this.shading;
    if (!shading) {
      material.positionNode = pos.xyz;
      material.colorNode = this.tinted(vec3(0.5));
      return material;
    }
    const { model, sky, optics, foamMap } = shading;
    // Vertex: y is relative to the tide; the Earth's curvature drops it as it drops the sheet (measured at the home,
    // the undisplaced point, as the sheet measures its undisplaced grid).
    const home: N = attribute('ribbonHome', 'vec4');
    const radial = length(home.xy.sub(this.cameraXZ));
    const vNormal: N = varying(attribute('ribbonNormal', 'vec4').xyz);
    const vExtra: N = varying(attribute('ribbonExtra', 'vec4'));
    const vHome: N = varying(home);
    const vDetail: N = varying(attribute('ribbonDetail', 'vec4').xy);
    const vConstructed: N = varying(attribute('ribbonDetail', 'vec4').w);
    const vLight: N = varying(attribute('ribbonLight', 'vec4'));
    // The sheet at the home, from one set-wave sum per vertex (the sheet's own vertex-stage sum): its foam, foam frame,
    // analytic slope and pile reach the fragment through varying properties, and the pile's churn lifts the vertex as it
    // lifts the sheet there, so the ribbon's edges stay on the sheet.
    const vSetSlope: N = varyingProperty('vec2', 'vRibbonSetSlope');
    const vSetFoam: N = varyingProperty('float', 'vRibbonSetFoam');
    const vPile: N = varyingProperty('float', 'vRibbonPile');
    const vFrame: N = varyingProperty('vec2', 'vRibbonFrame');
    const churn = Fn(() => {
      const b = model.sets.breakSampleNode(home.xy);
      vSetSlope.assign(b.slope);
      vSetFoam.assign(sheetFoamWeight(b.foam, foamMap ? foamMap.sampleNode(home.xy) : null));
      vPile.assign(b.pile);
      vFrame.assign(b.foamFrame);
      return churnHeightNode(b.pile, b.foamFrame, model.sets.time, model.sets.churn);
    })();
    material.positionNode = vec3(pos.x, model.seabed.tide.add(pos.y).add(churn).sub(radial.mul(radial).div(2 * EARTH_RADIUS_M)), pos.z);

    const toCamera = cameraPosition.sub(positionWorld);
    const distance = length(toCamera);
    const viewDir = toCamera.div(max(distance, 1e-4));
    const thickness = vExtra.x, lipness = saturate(vExtra.y), curlFoam = vExtra.z, rho = vExtra.w;
    const fft = model.fftSlopes(vDetail, distance, this.slopeVariance, (c) => (c === CHOP_CASCADE ? float(1.0).sub(lipness) : float(1.0)));
    const shadingNormal = ribbonShadingNormal({
      geometric: vNormal, tangent: vec3(vHome.z, 0.0, vHome.w), fft,
      setSlope: vSetSlope.add(churnSlopeNode(vPile, vFrame, model.sets.meanTravel, model.sets.time, model.sets.churn)), constructed: vConstructed, viewDir,
    });
    const normal = shadingNormal.normal.toVar();
    // The tube's ceiling only where the curve departs from the sheet (the sheet has none).
    const underside = float(1.0).sub(smoothstep(-0.3, 0.3, shadingNormal.geometric.y)).mul(saturate(vConstructed));
    // The whole lip transmits (spec 2026-09-29 §3.3): its colour comes from its thickness (shadeWater's lipThickness), so
    // the thick root glows deeper blue-green, not dark: keyed to thin lips only, a thick lip read as opaque plastic.
    const lip = lipness;
    // The curl's foam is signed (lipProfile.ProfilePoint.curlFoam): its own foam by max, and the clean tube (< 0) hiding the
    // sheet's foam by that share; both fade with ρ, so by the hand-back the foam is the sheet's.
    const curlOwn = saturate(curlFoam).mul(rho), clean = saturate(curlFoam.negate()).mul(rho);
    // Read at the developed coordinate (as the chop is): at the home the whole thrown lip maps onto a strip of the sheet a
    // few metres wide, and the pattern smeared into bands down the lip. At the edges the two are the same point.
    const foamLook = setFoamPattern(max(vSetFoam.mul(float(1.0).sub(clean)), curlOwn), waterFoamFrame(vDetail, model.sets.meanTravel), model.sim.time);
    // The lip is a sheet of water thrown over air: a ray refracted into it leaves through its underside into the tube, so
    // no seabed shows through it (the sheet's look-through, applied to the lip, tinted it the reef's brown).
    const sunVis = shading.sunlight ? shading.sunlight.visibilityNode(positionWorld.xz) : undefined;
    const bed = seabedTerms({ surfacePos: positionWorld, normal, viewDir }, model.seabed, sky, optics, sunVis);
    const seabed = { radiance: bed.radiance, transmittance: bed.transmittance.mul(float(1.0).sub(lipness)) };
    const colour = shadeWater(
      { normal, viewDir, distance, foam: max(fft.foam, foamLook.x), foamShade: foamLook.y, lip, lipThickness: thickness, underside,
        tube: { sunLip: vLight.x, sunBody: vLight.w, skyOpen: vLight.y, lipThickness: vLight.z },
        bodyLightNormal: normalize(mix(vec3(0.0, 1.0, 0.0), normal, saturate(vConstructed))),
        unresolvedSlopeVariance: fft.lostSlopeVariance, seabed, sunVisibility: sunVis,
        landReflection: shading.skyline ? (r: N) => shading.skyline!.reflectionNode(positionWorld, r, sky) : undefined },
      sky,
      optics,
    ).toVar();
    material.colorNode = this.tinted(colour);
    return material;
  }

  /** The `ribbon tint` overlay: `colour` mixed TINT_MIX with a saturated magenta that is TINT_EXPOSED after the picture's
   * exposure (the colour is HDR radiance), so it is unmistakable at any exposure. */
  private tinted(colour: N): N {
    const magenta = vec3(1.0, 0.0, 1.0).mul(this.inverseExposure.mul(TINT_EXPOSED));
    return mix(colour, magenta, this.tint.mul(TINT_MIX));
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

  /**
   * A surface read as one WGSL function, called from each site: inlined, every call site of the frame pass (about a
   * dozen, the tube's impact search and the face's join among them) carried the whole displacement, and its shader
   * grew to ~850 kB.
   */
  private surfaceFn(surface: (xz: N) => N, name: string): (xz: N) => N {
    const fn = Fn(([xz]: N[]) => vec3(surface(xz))).setLayout({ name, type: 'vec3', inputs: [{ name: 'xz', type: 'vec2' }] });
    return (xz: N) => fn(xz);
  }

  private stationsNode(): N {
    return storage(this.stationsAttr, 'vec4', MAX_STATIONS * STATION_VEC4S).toReadOnly();
  }

  /** Per station: its numbers and its profile samples (wombSectionNodes.wombFrameNode); no sheet here (the vertex pass
   * blends each sample into it). */
  private buildFramePass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const keys = storage(this.keys, 'vec4', this.keys.count).toReadOnly();
    const knots = storage(this.knots, 'vec4', MAX_STATIONS * WOMB_KNOT_VEC4S);
    const sections = storage(this.sections, 'vec4', MAX_STATIONS * PROFILE_SAMPLES);
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * WOMB_FRAME_VEC4S);
    return Fn(() => {
      const i: N = int(instanceIndex).toVar();
      const b = stations.element(i.mul(STATION_VEC4S).add(1)).toVar();
      const cS = stations.element(i.mul(STATION_VEC4S).add(2)).toVar();
      const nums = sectionNumbersNode({ H: b.x, r: b.z, tb: b.w, psi: cS.z }, { periodS: this.periodS, ribbonOnset: this.ribbonOnset });
      const f = wombFrameNode(nums, keys, (k: N) => knots.element(i.mul(WOMB_KNOT_VEC4S).add(k)),
        (j: N, v: N) => { sections.element(i.mul(PROFILE_SAMPLES).add(j)).assign(v); });
      frames.element(i.mul(WOMB_FRAME_VEC4S)).assign(vec4(f.A, f.phase, f.hollow, f.rho));
      frames.element(i.mul(WOMB_FRAME_VEC4S).add(1)).assign(vec4(f.tip, f.crest, f.floor, f.life));
      frames.element(i.mul(WOMB_FRAME_VEC4S).add(2)).assign(vec4(f.tipKnot, f.crestKnot));
    })().compute(MAX_STATIONS) as THREE.ComputeNode;
  }

  /**
   * Each vertex: its profile sample at the station's scale (u along n, y), blended into the sheet by ρ and toward the
   * profile's ends (wombSection.wombSection), placed in the world; the sheet's lateral displacement there carried along t̂
   * (the chop comes later, at the developed coordinate: buildChopPass).
   */
  private buildVertexPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * WOMB_FRAME_VEC4S).toReadOnly();
    const sections = storage(this.sections, 'vec4', MAX_STATIONS * PROFILE_SAMPLES).toReadOnly();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V);
    const normals = storage(this.normals, 'vec4', MAX_STATIONS * V);
    const extras = storage(this.extras, 'vec4', MAX_STATIONS * V);
    // No homes buffer here (it would be the 9th): the home xz goes into details, and the develop pass moves it.
    const details = storage(this.details, 'vec4', MAX_STATIONS * V);
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const i: N = idx.div(V).toVar();
      const local: N = idx.sub(i.mul(V)).toVar();
      // Profile sample j = local − 1; the skirts (local 0 and V − 1) compute their edge sample and are lowered.
      const j = local.sub(1).clamp(int(0), int(LAST)).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const gap = stations.element(i.mul(STATION_VEC4S).add(2)).x.toVar();
      const f0: N = frames.element(i.mul(WOMB_FRAME_VEC4S)).toVar(), f1: N = frames.element(i.mul(WOMB_FRAME_VEC4S).add(1)).toVar();
      const A: N = f0.x, phase: N = f0.y, rho: N = f0.w, tip: N = f1.x, crest: N = f1.y;
      const S = a.xy, n = a.zw;
      const tHat = vec2(n.y.negate(), n.x).toVar();
      const q: N = sections.element(i.mul(PROFILE_SAMPLES).add(j)).xy.toVar();
      const home = q.x.mul(A).toVar();
      const xzHome = S.add(n.mul(home)).toVar();
      const smooth = this.surfaceFn(this.surface.smooth, 'ribbonSmooth');
      const d = vec3(smooth(xzHome)).toVar();
      const base = vec2(home.add(dot(d.xz, n)), d.y).toVar();
      const w = rho.mul(interiorWeightNode(q.x)).toVar();
      const pos = mix(base, q.mul(A), w).toVar();
      // The profile's u along n; the lateral displacement at home carried unchanged along t̂.
      const xz = S.add(n.mul(pos.x)).add(tHat.mul(dot(d.xz, tHat)));
      const skirt = select(local.equal(int(0)).or(local.equal(int(V - 1))), float(SKIRT_DEPTH_M), float(0.0));
      positions.element(idx).assign(vec4(xz.x, pos.y.sub(skirt), xz.y, gap));
      // Inner: more than INNER_MARGIN_M inside the profile's ends, and the station not within FOOTPRINT_END_MARGIN_M of
      // its run's end.
      const runEnd = stations.element(i.mul(STATION_VEC4S).add(2)).y;
      const inside = A.mul(EDGE_OUTER_UNITS).sub(abs(home)).greaterThan(INNER_MARGIN_M);
      const inner = select(inside.and(runEnd.lessThan(0.5)), float(1.0), float(0.0));
      // The normal pass fills xyz.
      normals.element(idx).assign(vec4(0.0, 1.0, 0.0, inner));
      // The lip: the samples either side of the tip out to the crest's distance from it, while the lip is thrown; its
      // thickness the distance to the sample mirrored about the tip (the lip's other face).
      const reach = max(crest.sub(tip), 1.0);
      const off = abs(float(j).sub(tip));
      const thrown = smoothstep(0.4, 0.55, phase).mul(float(1.0).sub(smoothstep(1.2, 1.45, phase)));
      const lipness = float(1.0).sub(smoothstep(0.6, 1.0, off.div(reach))).mul(thrown).mul(w);
      const jm = (int(floor(tip.mul(2.0).sub(float(j)).add(0.5))) as N).clamp(int(0), int(LAST));
      const thickness = length(q.sub(sections.element(i.mul(PROFILE_SAMPLES).add(jm)).xy)).mul(A);
      extras.element(idx).assign(vec4(thickness as N, lipness as N, 0.0, rho));
      // The home xz, and how far the curve departs from the sheet here: the develop pass moves the home into homes and
      // writes the detail coordinate over it, keeping w.
      const constructed = smoothstep(SHEET_BLEND_M[0], SHEET_BLEND_M[1], length(pos.sub(base)));
      details.element(idx).assign(vec4(xzHome, home, constructed));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }

  /**
   * One invocation per station: the developed u of each profile sample (developedU, in f32) from the chop-free
   * positions' (u along n, y), blended toward the home u by the frame's weight, written as the detail coordinate
   * S + n·mix(home u, developed u, weight) (the home itself at the edges); the skirts take their edge's. It
   * also writes homes (the home xz the vertex pass left in details, and t̂).
   */
  private buildDevelopPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * WOMB_FRAME_VEC4S).toReadOnly();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V).toReadOnly();
    const details = storage(this.details, 'vec4', MAX_STATIONS * V);
    const homes = storage(this.homes, 'vec4', MAX_STATIONS * V);
    return Fn(() => {
      const i: N = int(instanceIndex).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const S = a.xy, n = a.zw;
      const tHat = vec2(n.y.negate(), n.x).toVar();
      const f0: N = frames.element(i.mul(WOMB_FRAME_VEC4S)).toVar(), f1: N = frames.element(i.mul(WOMB_FRAME_VEC4S).add(1)).toVar();
      const weight = float(f0.w).toVar();
      // The blend runs across the lip, from the floor's sample to the crest's (developedU's `between`).
      const lo = min(f1.z, f1.y).toVar(), hi = max(f1.z, f1.y).add(1.0).toVar();
      /** Profile sample jj's (u along n, y), chop-free. */
      const UY = (jj: N): N => {
        const p = positions.element(i.mul(V).add(jj).add(1));
        return vec2(dot(p.xz.sub(S), n), p.y);
      };
      // The edges' homes: the front's and the back's (the vertex pass left them in details).
      const uFront = details.element(i.mul(V).add(1)).z.toVar(), uBack = details.element(i.mul(V).add(LAST + 1)).z.toVar();
      // The total arc length, then each sample's arc from the front edge, accumulated in the same order both times.
      const total = float(0.0).toVar();
      const prev = vec2(UY(int(0))).toVar();
      Loop({ start: 1, end: PROFILE_SAMPLES, name: 'j' } as N, ({ j }: N) => {
        const q = vec2(UY(j)).toVar();
        total.addAssign(length(q.sub(prev)));
        prev.assign(q);
      });
      const arc = float(0.0).toVar();
      prev.assign(UY(int(0)));
      Loop({ start: 0, end: PROFILE_SAMPLES, name: 'j' } as N, ({ j }: N) => {
        const q = vec2(UY(j)).toVar();
        If(j.greaterThan(int(0)), () => { arc.addAssign(length(q.sub(prev))); });
        prev.assign(q);
        const fromFront = uFront.sub(arc), fromBack = uBack.add(total.sub(arc));
        const wFront = float(1.0).sub(smoothstep(lo, hi, float(j)));
        const developed = fromFront.mul(wFront).add(fromBack.mul(float(1.0).sub(wFront)));
        const k = i.mul(V).add(j).add(1).toVar();
        const left = details.element(k).toVar(); // (home xz, home u, constructed) from the vertex pass
        // Blended toward the home by the station's weight (the sheet's own coordinate where the profile is the sheet's);
        // exactly the home at the edges.
        const edge = j.equal(int(0)).or(j.equal(int(LAST)));
        const dev = select(edge, left.z, mix(left.z, developed, weight)).toVar();
        const h = vec4(left.xy, tHat).toVar();
        const v = vec4(S.add(n.mul(dev)), dev, left.w).toVar();
        homes.element(k).assign(h);
        details.element(k).assign(v);
        If(j.equal(int(0)), () => {
          homes.element(i.mul(V)).assign(h);
          details.element(i.mul(V)).assign(v);
        });
        If(j.equal(int(LAST)), () => {
          homes.element(i.mul(V).add(V - 1)).assign(h);
          details.element(i.mul(V).add(V - 1)).assign(v);
        });
      });
    })().compute(MAX_STATIONS) as THREE.ComputeNode;
  }

  /**
   * Each vertex's tube light (lipProfile.tubeLight): from the chop-free positions, the angles from the sample to the tip
   * (TUBE_TIP_SAMPLE) and the lip's root (TUBE_ROOT_SAMPLE) in the station's plane against the sun's; only the tube's
   * inside (face, wall) by the frame's weight, faded out within TUBE_TIP_CLEAR_M of the tip; everything else open. Skirts
   * take their edge sample's (open).
   */
  private buildLightPass(): THREE.ComputeNode {
    const stations = this.stationsNode();
    const frames = storage(this.frames, 'vec4', MAX_STATIONS * WOMB_FRAME_VEC4S).toReadOnly();
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V).toReadOnly();
    const extras = storage(this.extras, 'vec4', MAX_STATIONS * V).toReadOnly();
    const lights = storage(this.lights, 'vec4', MAX_STATIONS * V);
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const i: N = idx.div(V).toVar();
      const local: N = idx.sub(i.mul(V)).toVar();
      const j = local.sub(1).clamp(int(0), int(LAST)).toVar();
      const a = stations.element(i.mul(STATION_VEC4S)).toVar();
      const S = a.xy, n = a.zw;
      const f0: N = frames.element(i.mul(WOMB_FRAME_VEC4S)).toVar(), f1: N = frames.element(i.mul(WOMB_FRAME_VEC4S).add(1)).toVar();
      const tipJ = int(f1.x).toVar(), crestJ = int(f1.y).toVar(), floorJ = int(f1.z).toVar();
      /** Profile sample jj's (u along n, y). */
      const UY = (jj: N): N => {
        const p = positions.element(i.mul(V).add(jj).add(1));
        return vec2(dot(p.xz.sub(S), n), p.y);
      };
      const q = vec2(UY(j)).toVar(), T = vec2(UY(tipJ)).toVar();
      const l = tubeLightAtNode(q, T, vec2(UY(crestJ)).toVar(), atan(this.sun.y, dot(this.sun.xz, n)));
      // The tube's inside: from the floor up the back wall to the tip (the ceiling is the lip's own underside).
      const inside = j.greaterThanEqual(min(floorJ as N, tipJ as N)).and(j.lessThan(max(floorJ as N, tipJ as N)));
      const w = select(inside, clamp(f0.w, 0.0, 1.0).mul(smoothstep(0.0, TUBE_TIP_CLEAR_M, length(q.sub(T)))), float(0.0));
      // Open written exactly where the weight is 0, not multiplied by it: at the tip vertex itself (q = T) the angle is
      // atan2(0, 0), which WGSL leaves undefined (NaN on some drivers), and NaN × 0 is NaN.
      // The lip's thickness halfway from the tip to the crest (the vertex pass's mirrored thickness there).
      const mid = (int(floor(f1.x.add(f1.y).mul(0.5))) as N).clamp(int(0), int(LAST));
      const tLip = extras.element(i.mul(V).add(mid).add(1)).x;
      lights.element(idx).assign(select(w.greaterThan(0.0),
        vec4(l.sLip.mul(w), float(1.0).sub(float(1.0).sub(l.o).mul(w)), tLip, l.sBody.mul(w)), vec4(0.0, 1.0, tLip, 0.0)));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }

  /** Each vertex: the chop (the FFT's cascade 2) read at its detail coordinate, faded out over the lip, added to its position. */
  private buildChopPass(): THREE.ComputeNode {
    const positions = storage(this.positions, 'vec4', MAX_STATIONS * V);
    const extras = storage(this.extras, 'vec4', MAX_STATIONS * V).toReadOnly();
    const details = storage(this.details, 'vec4', MAX_STATIONS * V).toReadOnly();
    return Fn(() => {
      const idx: N = int(instanceIndex).toVar();
      const xz = details.element(idx).xy.toVar();
      const chop = vec3(this.surface.chop(xz)).mul(float(1.0).sub(extras.element(idx).y)).toVar();
      const p = positions.element(idx).toVar();
      positions.element(idx).assign(vec4(p.xyz.add(chop), p.w));
    })().compute(MAX_STATIONS * V) as THREE.ComputeNode;
  }

  /**
   * Each vertex's normal: cross(∂P/∂station, ∂P/∂j) from central differences (one-sided at the profile's ends, and
   * along the stations next to a gap or the end of the rows; a station alone in its run uses its tangent t̂), flipped
   * for the whole station if it points down at the back edge (the water is below and behind). A vertex whose profile
   * difference is dead (MIN_PROFILE_STEP_M across the crest) takes the normal of the nearest live sample anywhere along
   * the profile (NORMAL_SEARCH), so it is oriented as the surface around it (up only where the whole station has no
   * area). Skirts take their edge vertex's normal.
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
