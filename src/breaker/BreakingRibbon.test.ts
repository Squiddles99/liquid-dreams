import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { DEFAULT_DEBUG_OVERLAYS } from '../ocean/OceanSurface';
import { OceanSimulation } from '../ocean/OceanSimulation';
import { DEFAULT_WATER_OPTICS } from '../ocean/waterOptics';
import { createWaterOpticsUniforms } from '../ocean/waterShading';
import { WaterSurfaceModel } from '../ocean/waterSurface';
import { Seabed } from '../seabed/Seabed';
import { DEFAULT_ATMOSPHERE } from '../sky/atmosphereParams';
import { PSI_NORMAL } from './overturn';
import { Sky } from '../sky/Sky';
import {
  BreakingRibbon, FOOTPRINT_END_MARGIN_M, FOOTPRINT_GRID, STATION_VEC4S, VERTS_PER_STATION, developedU, modelRibbonSurface, packStations,
  ribbonDrawCount, ribbonIndices, runEndFlags,
} from './BreakingRibbon';
import { DEFAULT_BREAK_PARAMS } from './breaking';
import { SetWaves } from './SetWaves';
import { MAX_STATIONS, type Station, type StationEntry } from './crestTrace';
import { PROFILE_SAMPLES } from './BreakingRibbon';
import { type P2, profileSamples } from './wombProfile';
import { wombSection } from './wombSection';
import { TB_INFINITY, TB_NULL } from './lipProfileNodes';
import { REEF_GRID } from '../seabed/wombReef';

const station = (x: number, tb: number | null): Station => ({ gap: false, wave: 0, x, z: -x, arc: x, nx: 0.6, nz: 0.8, H: 2 + x, c: 9, r: 1.2, tb, psi: PSI_NORMAL, lipH: null });
const GAP: StationEntry = { gap: true };
const ROW = STATION_VEC4S * 4;
const row = (d: Float32Array, i: number): number[] => Array.from(d.subarray(i * ROW, (i + 1) * ROW));

describe('BreakingRibbon stations', () => {
  it('has a skirt vertex at each end of the profile', () => {
    expect(VERTS_PER_STATION).toBe(PROFILE_SAMPLES + 2);
  });

  it('packs [x, z, nx, nz], [H, c, r, tb], [gap, runEnd, psi, 0] with tb encoded, and a gap as a dead copy of the previous live station', () => {
    const d = new Float32Array(MAX_STATIONS * ROW);
    const n = packStations([station(1, 0.25), station(2, null), GAP, station(3, Infinity)], d);
    expect(n).toBe(4);
    // Every live station here is within FOOTPRINT_END_MARGIN_M of its run's end (runs 1–2 m and 3 m of arc): runEnd 1.
    expect(row(d, 0)).toEqual([1, -1, 0.6, 0.8, 3, 9, 1.2, 0.25, 0, 1, PSI_NORMAL, 0].map(Math.fround));
    expect(row(d, 1)[7]).toBe(TB_NULL);
    expect(row(d, 2)).toEqual([...row(d, 1).slice(0, 8), 1, 0, Math.fround(PSI_NORMAL), 0]);
    expect(row(d, 3)[7]).toBe(TB_INFINITY);
    expect(row(d, 3)[8]).toBe(0);
  });

  it('a gap before any live station copies the first live one; nothing live packs nothing; at most MAX_STATIONS rows', () => {
    const d = new Float32Array(MAX_STATIONS * ROW);
    expect(packStations([GAP, station(5, 0.1)], d)).toBe(2);
    expect(row(d, 0)).toEqual([...row(d, 1).slice(0, 8), 1, 0, Math.fround(PSI_NORMAL), 0]);
    expect(packStations([], d)).toBe(0);
    expect(packStations([GAP, GAP], d)).toBe(0);
    const many = Array.from({ length: MAX_STATIONS + 5 }, (_, i) => station(i * 0.01, 0.2));
    expect(packStations(many, d)).toBe(MAX_STATIONS);
  });
});

describe('BreakingRibbon run ends', () => {
  it('flags the live stations within FOOTPRINT_END_MARGIN_M of arc of their run\u2019s ends (gaps, the rows\u2019 ends, truncation)', () => {
    const run = (from: number, count: number, step: number): Station[] => Array.from({ length: count }, (_, i) => ({ ...station(0, 0.2), arc: from + i * step }));
    const entries: StationEntry[] = [...run(0, 11, 0.3), GAP, ...run(-4, 3, 2)];
    const flags = runEndFlags(entries);
    // Run 1: arcs 0 … 3 m: the stations under 1 m from either end are flagged, the middle ones not.
    expect(flags.slice(0, 11)).toEqual(run(0, 11, 0.3).map((s) => s.arc < FOOTPRINT_END_MARGIN_M || 3 - s.arc < FOOTPRINT_END_MARGIN_M - 1e-9));
    expect(flags[11]).toBe(false); // the gap
    expect(flags.slice(12)).toEqual([true, false, true]); // arcs −4, −2, 0: 2 m from each end in the middle
    // Truncated to the first 5 rows: those are a run of their own, ending at row 4.
    expect(runEndFlags(entries, 5)).toEqual([true, true, true, true, true]);
    expect(runEndFlags(entries, 9)).toEqual([true, true, true, true, false, true, true, true, true]);
  });
});

describe('BreakingRibbon detail coordinate (developed u)', () => {
  type Vec2 = P2;
  const flat = (from: number, to: number): Vec2[] => Array.from({ length: PROFILE_SAMPLES }, (_, j) => [from + ((to - from) * j) / (PROFILE_SAMPLES - 1), 0]);
  /** The blend's span on these synthetic profiles. */
  const BETWEEN: readonly [number, number] = [60, 100];
  /** A thrown lip on a flat sea: the section's points (front → back), its homes (A × the profile's u) and its floor and crest samples. */
  const thrown = () => {
    const input = { H: 3.9, r: 1.3, tb: 0.45, psi: 0.09, periodS: 15 };
    const sec = wombSection(input, (u) => [u, 0], { ribbonOnset: 0.6 });
    const { A, phase, hollow } = sec.numbers, n = PROFILE_SAMPLES;
    const { curve, marks } = profileSamples(phase, hollow);
    const homes = curve.map(([u]) => A * u).reverse();
    const between: [number, number] = [n - 1 - marks.floor, n - 1 - marks.crest];
    return { sec, homes, between, uFront: homes[0], uBack: homes[n - 1] };
  };

  it('is the home itself on a flat profile, and exactly uFront and uBack at the edges', () => {
    const pts = flat(10, -5);
    const dev = developedU(pts, 10, -5, BETWEEN);
    expect(dev[0]).toBe(10);
    expect(dev[PROFILE_SAMPLES - 1]).toBe(-5);
    dev.forEach((u, j) => expect(u).toBeCloseTo(pts[j][0], 9));
  });

  it('advances with the curve\u2019s own length up a vertical face (a full face of detail, not one column)', () => {
    // Flat from u = 10 to 6 over the front, then straight up 4 m at u = 6, then flat back.
    const pts: Vec2[] = Array.from({ length: PROFILE_SAMPLES }, (_, j): Vec2 => {
      if (j <= 20) return [10 - (4 * j) / 20, 0];
      if (j <= BETWEEN[0]) return [6, (4 * (j - 20)) / (BETWEEN[0] - 20)];
      return [6 - (11 * (j - BETWEEN[0])) / (PROFILE_SAMPLES - 1 - BETWEEN[0]), 4];
    });
    const dev = developedU(pts, 10, -5, BETWEEN);
    // Up the vertical stretch (all before the blend) the coordinate moves by the 4 m climbed, 0.1 m per sample.
    expect(dev[20] - dev[BETWEEN[0]]).toBeCloseTo(4, 9);
    for (let j = 21; j <= BETWEEN[0]; j++) expect(dev[j - 1] - dev[j]).toBeCloseTo(4 / (BETWEEN[0] - 20), 9);
  });

  it('is continuous along a thrown lip\u2019s profile, edges exact', () => {
    const { sec, homes, between, uFront, uBack } = thrown();
    expect(sec.numbers.rho).toBe(1);
    const dev = developedU(sec.points, uFront, uBack, between);
    expect(dev[0]).toBe(homes[0]);
    expect(dev[PROFILE_SAMPLES - 1]).toBe(homes[PROFILE_SAMPLES - 1]);
    let maxJump = 0;
    for (let j = 1; j < PROFILE_SAMPLES; j++) {
      const step = Math.hypot(sec.points[j][0] - sec.points[j - 1][0], sec.points[j][1] - sec.points[j - 1][1]);
      maxJump = Math.max(maxJump, Math.abs(dev[j] - dev[j - 1]) - step);
    }
    // Beyond each sample's own step, the blend adds at most (its ends' disagreement) × (smoothstep's steepest step): a few
    // metres of disagreement over the ~40 samples from the floor to the crest, under 0.15 A a sample.
    expect(maxJump).toBeLessThan(0.15 * sec.numbers.A);
  });

  it('blends toward the home by the station\u2019s weight: the home at weight 0, the developed u at weight 1, edges exact', () => {
    const { sec, homes, between, uFront, uBack } = thrown();
    const dev = developedU(sec.points, uFront, uBack, between);
    // The developed coordinate really departs from the home here (else the blend proves nothing).
    expect(Math.max(...dev.map((u, j) => Math.abs(u - homes[j])))).toBeGreaterThan(0.5);
    const at0 = developedU(sec.points, uFront, uBack, between, { homes, weight: 0 });
    at0.forEach((u, j) => expect(Math.abs(u - homes[j])).toBeLessThanOrEqual(1e-9));
    const at1 = developedU(sec.points, uFront, uBack, between, { homes, weight: 1 });
    at1.forEach((u, j) => expect(Math.abs(u - dev[j])).toBeLessThanOrEqual(1e-9));
    const half = developedU(sec.points, uFront, uBack, between, { homes, weight: 0.3 });
    half.forEach((u, j) => expect(u).toBeCloseTo(0.7 * homes[j] + 0.3 * dev[j], 9));
    expect(half[0]).toBe(homes[0]);
    expect(half[PROFILE_SAMPLES - 1]).toBe(homes[PROFILE_SAMPLES - 1]);
  });
});

describe('BreakingRibbon tint overlay', () => {
  it('flips the uniform the drawn material mixes magenta by', () => {
    const sim = new OceanSimulation();
    const sets = new SetWaves(sim.time);
    // A tiny flat bed: the graph is what matters here, not the reef.
    const grid = { x0: 0, z0: 0, cellM: 1, nx: 4, nz: 4 };
    const bed = { grid, bed: new Float32Array(16).fill(-10), sand: new Float32Array(16), weed: new Float32Array(16) };
    const model = new WaterSurfaceModel(sim, new Seabed(bed), sets);
    const ribbon = new BreakingRibbon(modelRibbonSurface(model), DEFAULT_BREAK_PARAMS, {
      model, sky: new Sky(DEFAULT_ATMOSPHERE), optics: createWaterOpticsUniforms(DEFAULT_WATER_OPTICS),
    });
    // Walk the colour graph once per node (it shares subgraphs heavily, so Node.traverse would revisit them).
    const seen = new Set<THREE.Node>();
    const stack = [(ribbon.mesh.material as THREE.MeshBasicNodeMaterial).colorNode as THREE.Node];
    while (stack.length > 0) {
      const n = stack.pop() as THREE.Node;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const c of n.getChildren()) stack.push(c);
    }
    expect(seen.has(ribbon.tint)).toBe(true);
    expect(ribbon.tint.value).toBe(0);
    ribbon.setOverlays({ ...DEFAULT_DEBUG_OVERLAYS, ribbonTint: true });
    expect(ribbon.tint.value).toBe(1);
    ribbon.setOverlays(DEFAULT_DEBUG_OVERLAYS);
    expect(ribbon.tint.value).toBe(0);
  });
});

describe('BreakingRibbon ahead of the first break', () => {
  it('compiles its six compute passes and the footprint (into the footprint target), then restores the render target', async () => {
    const sim = new OceanSimulation();
    const grid = { x0: 0, z0: 0, cellM: 1, nx: 4, nz: 4 };
    const bed = { grid, bed: new Float32Array(16).fill(-10), sand: new Float32Array(16), weed: new Float32Array(16) };
    const ribbon = new BreakingRibbon(modelRibbonSurface(new WaterSurfaceModel(sim, new Seabed(bed), new SetWaves(sim.time))), DEFAULT_BREAK_PARAMS);
    const outer = {} as THREE.RenderTarget;
    let target: THREE.RenderTarget | null = outer;
    const computes: unknown[][] = [];
    const scenes: { scene: THREE.Object3D; target: THREE.RenderTarget | null }[] = [];
    const renderer = {
      compileComputeAsync: async (n: unknown[]) => { computes.push(n); },
      compileAsync: async (scene: THREE.Object3D) => { scenes.push({ scene, target }); },
      getRenderTarget: () => target,
      setRenderTarget: (t: THREE.RenderTarget | null) => { target = t; },
    } as unknown as THREE.WebGPURenderer;
    await ribbon.compileAsync(renderer);
    expect(computes.length).toBe(1);
    expect(computes[0].length).toBe(6);
    expect(scenes.length).toBe(1);
    expect((scenes[0].scene as THREE.Scene).isScene).toBe(true);
    expect(scenes[0].target).toBe(ribbon.footprintTarget);
    expect(target).toBe(outer);
  });
});

describe('BreakingRibbon mesh', () => {
  const V = VERTS_PER_STATION;
  it('indexes two triangles per quad over every station row pair, row by row', () => {
    const idx = ribbonIndices();
    expect(idx.length).toBe((MAX_STATIONS - 1) * (V - 1) * 6);
    expect(Array.from(idx.subarray(0, 6))).toEqual([0, 1, V, 1, V + 1, V]);
    // The quad of station row i and sample j starts at ((i·(V − 1)) + j)·6.
    const q = (5 * (V - 1) + 7) * 6, a = 5 * V + 7;
    expect(Array.from(idx.subarray(q, q + 6))).toEqual([a, a + 1, a + V, a + 1, a + V + 1, a + V]);
    let max = 0;
    for (const k of idx) max = Math.max(max, k);
    expect(max).toBe(MAX_STATIONS * V - 1);
  });

  it('winds the triangles so they face out of the water (dProfile × dStation, as the normal pass orients them)', () => {
    // crestTrace orders stations along +t̂ and the profile runs front → back (along −n): a flat strip with n = +x,
    // t̂ = (−n.z, n.x) = +z. Both triangles of a quad must face up.
    const P = (k: number): number[] => { const i = Math.floor(k / V), j = k % V; return [-j, 0, i]; };
    const idx = ribbonIndices();
    for (let t = 0; t < 12; t += 3) {
      const [a, b, c] = [P(idx[t]), P(idx[t + 1]), P(idx[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
    }
  });

  it('draws (stationCount − 1) × (VERTS_PER_STATION − 1) × 6 indices, none below two rows', () => {
    expect(ribbonDrawCount(0)).toBe(0);
    expect(ribbonDrawCount(1)).toBe(0);
    expect(ribbonDrawCount(2)).toBe((V - 1) * 6);
    expect(ribbonDrawCount(MAX_STATIONS)).toBe(ribbonIndices().length);
  });

  it('lays the footprint texels (0.5 m) over the reef grid, texel centres on its points', () => {
    expect(FOOTPRINT_GRID.cellM).toBe(0.5);
    expect([FOOTPRINT_GRID.size.x, FOOTPRINT_GRID.size.y]).toEqual([1300, 1500]);
    expect(FOOTPRINT_GRID.origin.x + FOOTPRINT_GRID.cellM / 2).toBe(REEF_GRID.x0);
    expect(FOOTPRINT_GRID.origin.y + FOOTPRINT_GRID.cellM / 2).toBe(REEF_GRID.z0);
    expect(FOOTPRINT_GRID.size.x * FOOTPRINT_GRID.cellM).toBe(REEF_GRID.nx * REEF_GRID.cellM);
    expect(FOOTPRINT_GRID.size.y * FOOTPRINT_GRID.cellM).toBe(REEF_GRID.nz * REEF_GRID.cellM);
  });
});

describe('packStations and ψ (barrel from the maths)', () => {
  it('packStations puts the ψ in the third vec4', () => {
    const s: Station = { gap: false, wave: 0, x: 1, z: 2, arc: 0, nx: 1, nz: 0, H: 3, c: 9, r: 1.2, tb: 0.4, psi: 1.37, lipH: null };
    const out = new Float32Array(12);
    packStations([s], out);
    expect(out[10]).toBeCloseTo(1.37, 6);
  });
  it('packStations puts the throw height (lipH) last in the third vec4, 0 before breaking', () => {
    const s: Station = { gap: false, wave: 0, x: 1, z: 2, arc: 0, nx: 1, nz: 0, H: 3, c: 9, r: 1.2, tb: 0.4, psi: 0.07, lipH: 3.6 };
    const out = new Float32Array(24);
    packStations([s, { ...s, tb: null, lipH: null }], out);
    expect(out[11]).toBeCloseTo(3.6, 6);
    expect(out[23]).toBe(0);
  });
});
