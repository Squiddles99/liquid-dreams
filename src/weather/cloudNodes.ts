import * as THREE from 'three/webgpu';
import {
  Break, If, Loop, PI, dot, exp, float, max, min, mix, pow, saturate, select, smoothstep, sqrt, texture, texture3D,
  uniform, vec2, vec3, vec4,
} from 'three/tsl';
import type { AtmosphereLuts } from '../sky/AtmosphereLuts';
import type { AtmosphereUniforms } from '../sky/atmosphereNodes';
import { DENSITY_GAIN, DETAIL_EROSION, EARTH_RADIUS_M, TOWER_TAPER, WEAK_CELL_HEIGHT } from './cloudModel';
import { COAST_RISE_M, COAST_X_M, SEA_RAIN } from './rainModel';
import { type CloudTextures, DETAIL_TILE_M, SHAPE_TILE_M, WEATHER_TILE_M } from './CloudTextures';

type N = any;

/** The mid layer's shell (spec §4.2): an altostratus / altocumulus sheet. */
export const MID_BASE_M = 3500;
export const MID_TOP_M = 4200;
/** The high layer's sheet: cirrus / cirrostratus. */
export const HIGH_M = 9000;
/** Beyond this the march stops (the atmosphere's haze has swallowed the cloud long before). */
export const MAX_CLOUD_DISTANCE_M = 150_000;
export const LOW_STEPS = 96;
/** The low march's longest step: through a tall, dense cloud longer steps turn all-or-nothing (grain). */
export const MAX_STEP_M = 100;
export const MID_STEPS = 12;
/** Rain shafts under the cloud base. */
export const SHAFT_STEPS = 16;
/** The sun's cone march: steps of 40·2^k m, 2.5 km in all. */
export const LIGHT_STEPS = 6;

export function createCloudUniforms() {
  return {
    lowCover: uniform(0),
    convection: uniform(0.4),
    lowBase: uniform(900),
    lowTop: uniform(2400),
    midCover: uniform(0),
    highCover: uniform(0),
    /** How far (m, world xz) the clouds have drifted downwind. */
    drift: uniform(new THREE.Vector2()),
    /** The wind aloft's travel direction (world xz, unit): the cirrus streaks lie along it. */
    windDir: uniform(new THREE.Vector2(1, 0)),
    /** Sim time (s): the detail noise flows with it, so the edges boil. */
    evolve: uniform(0),
    /** The sky map's centre: the camera when it was last marched. */
    camera: uniform(new THREE.Vector3()),
    sun: uniform(new THREE.Vector3(0, 1, 0)),
    /** Extinction coefficient (per m) in the densest low cloud, and in the mid sheet. */
    sigmaLow: uniform(0.1),
    sigmaMid: uniform(0.012),
    /** Air extinction (per m, RGB) at cloud heights: distant cloud fades into the haze. */
    airExtinction: uniform(new THREE.Vector3(1e-5, 1.5e-5, 3e-5)),
    /** Self-test hook: 1 replaces the noise with the flat values below, so the GPU density can be checked on the CPU. */
    flatNoise: uniform(0),
    flatCoverage: uniform(0.5),
    flatShape: uniform(0.5),
    flatDetail: uniform(0),
    flatRainCell: uniform(0.5),
    /** The preset's rain rate under its rain cells (0 dry: nothing below changes). */
    rain: uniform(0),
  };
}
export type CloudUniforms = ReturnType<typeof createCloudUniforms>;

/** cloudModel.heightProfile, term by term. */
export function heightProfileNode(h: N, convection: N): N {
  const strat = smoothstep(0.0, 0.15, h).mul(float(1.0).sub(smoothstep(0.6, 1.0, h)));
  const cum = smoothstep(0.0, 0.07, h).mul(float(1.0).sub(smoothstep(0.25, 1.0, h)));
  const anvil = smoothstep(0.7, 0.85, h).mul(float(1.0).sub(smoothstep(0.92, 1.0, h))).mul(smoothstep(0.85, 1.0, convection));
  const v = saturate(mix(strat, cum, smoothstep(0.1, 0.4, convection)).add(anvil.mul(0.8)));
  return select(h.greaterThan(0.0).and(h.lessThan(1.0)), v, float(0.0));
}

/** cloudModel.coverageDensity. */
export const coverageDensityNode = (n: N, cover: N): N => saturate(n.sub(1.0).add(cover.mul(1.5)).div(0.5));

/** cloudModel.cloudDensity. */
export function cloudDensityNode(hFrac: N, convection: N, coverageNoise: N, shapeNoise: N, detailNoise: N, cover: N): N {
  const wc = coverageDensityNode(coverageNoise, cover);
  const profile = heightProfileNode(hFrac.div(wc.mul(1 - WEAK_CELL_HEIGHT).add(WEAK_CELL_HEIGHT)), convection);
  const cut = float(1.0).sub(wc).add(hFrac.mul(convection).mul(TOWER_TAPER));
  const shaped = saturate(shapeNoise.mul(profile).sub(cut).div(max(wc, 1e-4))).mul(wc);
  const e = detailNoise.mul(DETAIL_EROSION);
  return saturate(shaped.sub(e).mul(DENSITY_GAIN).div(float(1.0).sub(e)));
}

/** cloudModel.heightAlong: height above the sea t along a ray from `camH`, over the curved earth. */
export const heightAlongNode = (camH: N, dirY: N, t: N): N =>
  camH.add(dirY.mul(t)).add(t.mul(t).mul(float(1.0).sub(dirY.mul(dirY))).div(2 * EARTH_RADIUS_M));

/** Distance along the ray at which it reaches heightM (cloudModel.reachDistance). */
export function reachNode(camH: N, dirY: N, heightM: N): N {
  const k = float(1.0).sub(dirY.mul(dirY)).div(2 * EARTH_RADIUS_M);
  const rise = heightM.sub(camH);
  return rise.mul(2.0).div(dirY.add(sqrt(max(dirY.mul(dirY).add(k.mul(4.0).mul(rise)), 0.0))));
}

const henyeyGreenstein = (cosT: N, g: number | N): N => {
  const gg = float(g);
  const d = float(1.0).add(gg.mul(gg)).sub(gg.mul(cosT).mul(2.0));
  return float(1.0).sub(gg.mul(gg)).div(PI.mul(4.0).mul(pow(max(d, 1e-4), 1.5)));
};

/** The share of sunlight a thick cloud sends back out as diffuse light, per steradian-ish (tuned by eye, spec §4.2). */
export const DIFFUSE_SCATTER = 0.25;
/** Two-stream diffusion through a cloud of asymmetry g = 0.85: transmission ≈ 1 / (1 + 0.75 (1 − g) τ). */
const DIFFUSION_K = 0.75 * (1 - 0.85);

/**
 * Light scattered toward the eye from a sun seen through optical depth tau. Single scattering takes the two-lobed
 * phase (a strong forward lobe: the silver lining around the sun; a weak back lobe) through Beer's law. The many
 * orders after it diffuse: two-stream theory gives 1 / (1 + 0.75(1 − g)τ) rather than an exponential, which is what
 * keeps a sunlit cumulus white deep into its body and its base grey rather than black.
 */
export function multiScatterNode(tau: N, cosT: N): N {
  const phase = mix(henyeyGreenstein(cosT, -0.2), henyeyGreenstein(cosT, 0.8), 0.7);
  const single = exp(tau.negate()).mul(phase);
  const diffuse = float(DIFFUSE_SCATTER).div(tau.mul(DIFFUSION_K).add(1.0));
  return single.add(diffuse);
}

export interface CloudField {
  /** Low-cloud density (0..1) at world xz and height h; detail false skips the detail noise (the light march). */
  low(xz: N, h: N, detail: boolean): N;
  /** Mid-sheet density (0..1). */
  mid(xz: N, h: N): N;
  /** The high sheet's optical depth where a ray meets it at world xz. */
  highDepth(xz: N): N;
  /** The rain rate (0..1) falling at world xz (rainModel.rainRate). */
  rainRate(xz: N): N;
}

/** rainModel.rainExtinctionPerM. */
export const rainExtinctionNode = (rate: N): N => select(rate.greaterThan(0.0), pow(max(rate, 1e-6), 0.6).mul(2e-3), float(0.0));

/** The three layers' density, sampled from the noise and weather textures (or the flat self-test values). */
export function cloudField(u: CloudUniforms, tex: CloudTextures): CloudField {
  const flat = u.flatNoise.greaterThan(0.5);
  const weatherAt = (xz: N): N => texture(tex.weather, xz.sub(u.drift).div(WEATHER_TILE_M)).level(float(0));
  const shapeAt = (xz: N, h: N): N => {
    // The shape rides with the weather map, rising slowly as it goes (cumulus towers grow and fade).
    // Vertically 2× finer than across: a tower bubbles as it rises rather than streaking into columns.
    const p = vec3(xz.x.sub(u.drift.x), h.sub(u.evolve.mul(0.4)).mul(2.0), xz.y.sub(u.drift.y));
    return select(flat, u.flatShape, texture3D(tex.shape, p.div(SHAPE_TILE_M), float(0)).x);
  };
  const detailAt = (xz: N, h: N): N => {
    // The detail flows faster and on its own heading, so the fringes churn against the body.
    const p = vec3(xz.x.sub(u.drift.x.mul(1.3)), h.sub(u.evolve.mul(1.5)), xz.y.sub(u.drift.y.mul(1.3)).add(u.evolve.mul(2.0)));
    return select(flat, u.flatDetail, texture3D(tex.detail, p.div(DETAIL_TILE_M), float(0)).x);
  };
  return {
    low(xz, h, detail) {
      const w = weatherAt(xz);
      const kind = select(flat, float(0.5), w.y);
      const conv = saturate(u.convection.add(kind.sub(0.5).mul(0.25)));
      const hFrac = h.sub(u.lowBase).div(u.lowTop.sub(u.lowBase));
      const coverage = select(flat, u.flatCoverage, w.x);
      return cloudDensityNode(hFrac, conv, coverage, shapeAt(xz, h), detail ? detailAt(xz, h) : float(0.0), u.lowCover);
    },
    mid(xz, h) {
      const w = weatherAt(xz);
      const hFrac = h.sub(MID_BASE_M).div(MID_TOP_M - MID_BASE_M);
      // A broad, flat sheet: the shape noise stretched 3× wider than the low cloud's.
      const shape = select(flat, u.flatShape, texture3D(tex.shape, vec3(xz.x.sub(u.drift.x), h, xz.y.sub(u.drift.y)).div(SHAPE_TILE_M * 3), float(0)).x);
      // Ragged, thin-edged patches (altocumulus / altostratus), not cut-outs: the detail noise eats the edges.
      const detail = select(flat, u.flatDetail, texture3D(tex.detail, vec3(xz.x.sub(u.drift.x), h, xz.y.sub(u.drift.y)).div(DETAIL_TILE_M * 4), float(0)).x);
      return cloudDensityNode(hFrac, float(0.0), select(flat, u.flatCoverage, w.w), shape, detail.mul(2.5), u.midCover);
    },
    rainRate(xz) {
      // rainModel.rainRate: cells or broad patches of the weather map's rain noise, under the low cloud's coverage,
      // times the coast (Andrew: the rain mostly falls once the clouds cross the coast).
      const w = weatherAt(xz);
      const coverage = coverageDensityNode(select(flat, u.flatCoverage, w.x), u.lowCover);
      const cell = select(flat, u.flatRainCell, w.z);
      const convective = smoothstep(0.35, 0.65, u.convection);
      const mask = mix(smoothstep(0.3, 0.7, cell), smoothstep(0.55, 0.9, cell), convective).mul(saturate(coverage));
      const coast = mix(float(SEA_RAIN), float(1.0), smoothstep(COAST_X_M + COAST_RISE_M[0], COAST_X_M + COAST_RISE_M[1], xz.x));
      return u.rain.mul(mask).mul(coast);
    },
    highDepth(xz) {
      // Cirrus streaks lie along the wind aloft: noise stretched 5× along it.
      const along = dot(xz.sub(u.drift), u.windDir), across = dot(xz.sub(u.drift), vec2(u.windDir.y.negate(), u.windDir.x));
      const q = vec3(along.div(40_000), 0.37, across.div(8_000));
      const streak = texture3D(tex.shape, q, float(0)).y;
      const wisp = texture3D(tex.detail, vec3(along.div(3_000), 0.61, across.div(1_500)), float(0)).x;
      const n = streak.mul(0.75).add(wisp.mul(0.25));
      // A narrow ramp so the streaks stand out against clear sky between them; thickened toward a veil as cover rises.
      return saturate(n.sub(float(1.0).sub(u.highCover)).div(0.2)).mul(u.highCover).mul(1.2);
    },
  };
}

export interface CloudLight {
  /** Sunlight (RGB) reaching height h from above the atmosphere, 0 once the earth shades it. */
  sunAt(h: N): N;
  /** Skylight (RGB radiance) on the cloud at fraction hFrac through its layer: bases darker than tops. */
  ambientAt(hFrac: N): N;
}

export function cloudLight(u: CloudUniforms, luts: AtmosphereLuts, atm: AtmosphereUniforms, skyIrradiance: N): CloudLight {
  return {
    sunAt(h) {
      const hKm = h.mul(0.001);
      const r = atm.groundRadius.add(hKm);
      // The sun sets later for a cloud than for the sea: its horizon dips by acos(R / (R + h)).
      const dip = sqrt(max(float(1.0).sub(atm.groundRadius.div(r).pow(2.0)), 0.0));
      const lit = smoothstep(dip.negate().sub(0.004), dip.negate().add(0.004), u.sun.y);
      return luts.transmittanceAt(r, u.sun.y).mul(atm.sunIlluminance).mul(lit);
    },
    ambientAt(hFrac) {
      return skyIrradiance.div(PI).mul(mix(0.5, 1.2, saturate(hFrac)));
    },
  };
}

/** Optical depth toward the sun from (xz, h) through the low cloud: the cone march (no detail noise). */
export function sunDepthNode(u: CloudUniforms, field: CloudField, xz: N, h: N): N {
  const tau = float(0.0).toVar();
  let s = 0;
  for (let k = 0; k < LIGHT_STEPS; k++) {
    const len = 40 * 2 ** k;
    const mid = s + len * 0.5;
    const p = xz.add(u.sun.xz.mul(mid));
    tau.addAssign(field.low(p, h.add(u.sun.y.mul(mid)), false).mul(u.sigmaLow).mul(len));
    s += len;
  }
  return tau;
}

export interface LayerResult {
  /** In-scattered light (RGB), faded by the air in front of the cloud. */
  light: N;
  /** Transmittance through the layer. */
  trans: N;
  /** Transmittance-weighted distance to the cloud (m), for the fade. */
  depth: N;
}

/**
 * March one layer between enter and exit along dir from the camera: energy-conserving in-scatter (Hillaire 2016),
 * the sun through the cone march with the multiple-scattering octaves, and ambient skylight.
 */
function marchLayer(
  u: CloudUniforms, field: CloudField, light: CloudLight, dir: N, enter: N, exit: N, steps: number, jitter: N,
  kind: 'low' | 'mid',
): LayerResult {
  const L = vec3(0.0).toVar();
  const T = float(1.0).toVar();
  const depthSum = float(0.0).toVar();
  // At most MAX_STEP_M a step, but never more than `steps` of them; the march stops at the layer's far side.
  const span = exit.sub(enter);
  const dt = kind === 'low' ? max(span.div(steps), min(span.div(steps / 2), MAX_STEP_M)) : span.div(steps);
  const cosT = dot(dir, u.sun);
  const base = kind === 'low' ? u.lowBase : float(MID_BASE_M);
  const top = kind === 'low' ? u.lowTop : float(MID_TOP_M);
  const sigma = kind === 'low' ? u.sigmaLow : u.sigmaMid;
  Loop(steps, ({ i }: N) => {
    const t = enter.add(float(i).add(jitter).mul(dt));
    If(t.greaterThan(exit), () => { Break(); });
    const xz = u.camera.xz.add(dir.xz.mul(t));
    const h = heightAlongNode(u.camera.y, dir.y, t);
    const d = kind === 'low' ? field.low(xz, h, true) : field.mid(xz, h);
    If(d.greaterThan(1e-3), () => {
      const ext = d.mul(sigma);
      const stepT = exp(ext.mul(dt).negate());
      const tau = kind === 'low' ? sunDepthNode(u, field, xz, h) : ext.mul(300.0);
      const hFrac = h.sub(base).div(top.sub(base));
      const sunLight = light.sunAt(h).mul(multiScatterNode(tau, cosT));
      const inScatter = sunLight.add(light.ambientAt(hFrac));
      L.addAssign(inScatter.mul(T).mul(float(1.0).sub(stepT)));
      depthSum.addAssign(t.mul(T).mul(float(1.0).sub(stepT)));
      T.mulAssign(stepT);
    });
    If(T.lessThan(0.01), () => { Break(); });
  });
  return { light: L, trans: T, depth: depthSum.div(max(float(1.0).sub(T), 1e-4)) };
}

/**
 * The clouds along one direction from the sky map's centre: rgb, the cloud light faded by the air in front of it;
 * a, how much of the atmosphere behind it is hidden (1 − A, stored so that a zeroed texture reads as a clear sky).
 * Composite: sky = atmosphere · (1 − a) + rgb.
 */
export function marchSkyNode(u: CloudUniforms, field: CloudField, light: CloudLight, dir: N, jitter: N): N {
  const out = vec4(0.0, 0.0, 0.0, 0.0).toVar();
  const camH = u.camera.y;
  // Front to back: low, mid, high. Each layer's A = T + (1 − T)(1 − fade): a faded cloud shows the sky again.
  const fadeOf = (depth: N): { rgb: N; lum: N } => {
    const rgb = exp(u.airExtinction.mul(depth).negate());
    return { rgb, lum: dot(rgb, vec3(0.2126, 0.7152, 0.0722)) };
  };
  const rgb = vec3(0.0).toVar();
  const A = float(1.0).toVar();
  If(dir.y.greaterThan(-0.001), () => {
    // Rain shafts: the grey curtains under the rain cells, between the eye and the cloud base (nearest first). Steps
    // stretch with distance (t ∝ s²): the near shafts get the detail, the far ones on the horizon still show.
    If(u.rain.greaterThan(0.0), () => {
      const end = min(reachNode(camH, dir.y, u.lowBase), MAX_CLOUD_DISTANCE_M);
      const T = float(1.0).toVar();
      const L = vec3(0.0).toVar();
      const depthSum = float(0.0).toVar();
      const inScatter = light.ambientAt(float(0.0)).mul(1.2);
      Loop(SHAFT_STEPS, ({ i }: N) => {
        // Midpoints, not the per-texel jitter: over km-long steps the jitter showed as grain on the clouds behind.
        const a0 = float(i).div(SHAFT_STEPS), a = float(i).add(0.5).div(SHAFT_STEPS), b = float(i).add(1.0).div(SHAFT_STEPS);
        const t = a.mul(a).mul(end), dt = b.mul(b).sub(a0.mul(a0)).mul(end);
        const ext = rainExtinctionNode(field.rainRate(u.camera.xz.add(dir.xz.mul(t))));
        const stepT = exp(ext.mul(dt).negate());
        L.addAssign(inScatter.mul(T).mul(float(1.0).sub(stepT)));
        depthSum.addAssign(t.mul(T).mul(float(1.0).sub(stepT)));
        T.mulAssign(stepT);
      });
      const f = fadeOf(depthSum.div(max(float(1.0).sub(T), 1e-4)));
      rgb.addAssign(L.mul(f.rgb));
      A.mulAssign(T.add(float(1.0).sub(T).mul(float(1.0).sub(f.lum))));
    });
    If(u.lowCover.greaterThan(0.0), () => {
      const enter = reachNode(camH, dir.y, u.lowBase);
      const exit = min(reachNode(camH, dir.y, u.lowTop), MAX_CLOUD_DISTANCE_M);
      If(enter.lessThan(MAX_CLOUD_DISTANCE_M), () => {
        const r = marchLayer(u, field, light, dir, enter, exit, LOW_STEPS, jitter, 'low');
        const f = fadeOf(r.depth);
        rgb.addAssign(r.light.mul(f.rgb).mul(A));
        A.mulAssign(r.trans.add(float(1.0).sub(r.trans).mul(float(1.0).sub(f.lum))));
      });
    });
    If(u.midCover.greaterThan(0.0).and(A.greaterThan(0.01)), () => {
      const enter = reachNode(camH, dir.y, float(MID_BASE_M));
      const exit = min(reachNode(camH, dir.y, float(MID_TOP_M)), MAX_CLOUD_DISTANCE_M);
      If(enter.lessThan(MAX_CLOUD_DISTANCE_M), () => {
        const r = marchLayer(u, field, light, dir, enter, exit, MID_STEPS, jitter, 'mid');
        const f = fadeOf(r.depth);
        rgb.addAssign(r.light.mul(f.rgb).mul(A));
        A.mulAssign(r.trans.add(float(1.0).sub(r.trans).mul(float(1.0).sub(f.lum))));
      });
    });
    If(u.highCover.greaterThan(0.0).and(A.greaterThan(0.01)), () => {
      const t = reachNode(camH, dir.y, float(HIGH_M));
      If(t.lessThan(MAX_CLOUD_DISTANCE_M * 1.5), () => {
        const xz = u.camera.xz.add(dir.xz.mul(t));
        const tau = field.highDepth(xz);
        const T = exp(tau.negate());
        // Ice crystals: a strong forward lobe (the milky glow around the sun), little multiple scattering.
        const lightHigh = light.sunAt(float(HIGH_M)).mul(mix(henyeyGreenstein(dot(dir, u.sun), -0.1), henyeyGreenstein(dot(dir, u.sun), 0.75), 0.75))
          .add(light.ambientAt(float(1.0)).mul(0.7)).mul(float(1.0).sub(T));
        const f = fadeOf(t);
        rgb.addAssign(lightHigh.mul(f.rgb).mul(A));
        A.mulAssign(T.add(float(1.0).sub(T).mul(float(1.0).sub(f.lum))));
      });
    });
  });
  out.assign(vec4(rgb, float(1.0).sub(A)));
  return out;
}

/** Sun transmittance through all three layers from the camera (the sun disk, the exposure meter). */
export function sunTransmittanceNode(u: CloudUniforms, field: CloudField): N {
  const tau = float(0.0).toVar();
  const camH = u.camera.y;
  const dir = u.sun;
  If(dir.y.greaterThan(-0.001), () => {
    If(u.lowCover.greaterThan(0.0), () => {
      const enter = reachNode(camH, dir.y, u.lowBase);
      const exit = min(reachNode(camH, dir.y, u.lowTop), MAX_CLOUD_DISTANCE_M);
      const dt = exit.sub(enter).div(48);
      Loop(48, ({ i }: N) => {
        const t = enter.add(float(i).add(0.5).mul(dt));
        tau.addAssign(field.low(u.camera.xz.add(dir.xz.mul(t)), heightAlongNode(camH, dir.y, t), true).mul(u.sigmaLow).mul(dt));
      });
    });
    If(u.midCover.greaterThan(0.0), () => {
      const enter = reachNode(camH, dir.y, float(MID_BASE_M));
      const exit = min(reachNode(camH, dir.y, float(MID_TOP_M)), MAX_CLOUD_DISTANCE_M);
      const dt = exit.sub(enter).div(16);
      Loop(16, ({ i }: N) => {
        const t = enter.add(float(i).add(0.5).mul(dt));
        tau.addAssign(field.mid(u.camera.xz.add(dir.xz.mul(t)), heightAlongNode(camH, dir.y, t)).mul(u.sigmaMid).mul(dt));
      });
    });
    If(u.highCover.greaterThan(0.0), () => {
      tau.addAssign(field.highDepth(u.camera.xz.add(dir.xz.mul(reachNode(camH, dir.y, float(HIGH_M))))));
    });
  });
  return exp(tau.negate());
}


