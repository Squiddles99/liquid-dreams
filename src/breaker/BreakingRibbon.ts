import * as THREE from 'three/webgpu';
import { Break, Fn, If, Loop, cross, dot, float, instanceIndex, int, length, max, select, storage, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { CASCADE_FADES, fadeWeightNode } from '../ocean/cascadeFades';
import type { WaterSurfaceModel } from '../ocean/waterSurface';
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
 * invocation per station), the vertices and the normals (one per vertex). Task 6 draws the buffers.
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

const V = VERTS_PER_STATION;
const LAST = PROFILE_SAMPLES - 1;

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

  constructor(private readonly surface: RibbonSurface, params: BreakParams) {
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
  }

  setParams(p: BreakParams): void {
    updateLipUniforms(this.lip, p);
  }

  /** Uploads this frame's stations (≤ MAX_STATIONS; gaps included) and the camera position. */
  setStations(entries: readonly StationEntry[], camera: THREE.Vector3): void {
    this.camera.copy(camera);
    this.surface.setCamera?.(camera);
    const n = packStations(entries, this.stationsAttr.array as Float32Array);
    this.stationCount = n;
    this.rows.value = n;
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
