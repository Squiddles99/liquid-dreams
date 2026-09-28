import * as THREE from 'three/webgpu';
import { PI, abs, attribute, cameraPosition, cos, dot, float, length, max, min, mix, mx_noise_float, normalize, positionWorld, reflect, saturate, select, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { PATCH_HOLE_INSET_M } from '../beach/groundPatch';
import { schlickWater } from '../ocean/waterShading';
import type { Sky } from '../sky/Sky';

type N = any;

/** Albedos (linear), set by eye against reference/place/ (spec §4.6). */
const DRY_SAND = vec3(0.62, 0.55, 0.42);
const WET_SAND = vec3(0.3, 0.26, 0.2);
const ROCK_RUST = vec3(0.3, 0.2, 0.13);
const ROCK_GREY = vec3(0.42, 0.4, 0.36);
/** The shore platform's weed-covered limestone at the waterline (Andrew's aerial: olive green). */
const ROCK_WEED = vec3(0.1, 0.13, 0.05);
const HEATH_OLIVE = vec3(0.11, 0.14, 0.065);
const HEATH_SILVER = vec3(0.2, 0.215, 0.185);
const PIGFACE = vec3(0.15, 0.19, 0.07);
const PIGFACE_TIPS = vec3(0.45, 0.22, 0.06);
const RICE_PINK = vec3(0.55, 0.36, 0.4);
const HEATH_GAP = vec3(0.03, 0.035, 0.025);
/** What the mottled heath averages to at a distance (the fade target, so 2 km of heath doesn't alias). */
const HEATH_AVG = vec3(0.12, 0.14, 0.085);

export interface LandLookUniforms {
  sandBrightness: THREE.UniformNode<'float', number>;
  heathBrightness: THREE.UniformNode<'float', number>;
  heathSilver: THREE.UniformNode<'float', number>;
  heathOrange: THREE.UniformNode<'float', number>;
  coverOn: THREE.UniformNode<'float', number>;
  sunlightOn: THREE.UniformNode<'float', number>;
}

export function createLandLookUniforms(): LandLookUniforms {
  return { sandBrightness: uniform(1), heathBrightness: uniform(1), heathSilver: uniform(0.35), heathOrange: uniform(0.12), coverOn: uniform(0), sunlightOn: uniform(0) };
}

/** The fine ground patch's square (Phase 4c-1 §3.2), where the coarse land doesn't draw while `on` is 1. */
export interface PatchHole {
  centre: THREE.UniformNode<'vec2', THREE.Vector2>;
  half: THREE.UniformNode<'float', number>;
  on: THREE.UniformNode<'float', number>;
}

/** True where the coarse land draws: everywhere but the patch's square less PATCH_HOLE_INSET_M (while the patch shows). */
export function patchHoleMaskNode(xz: N, h: PatchHole): N {
  const d: N = abs(xz.sub(h.centre));
  const edge = h.half.sub(PATCH_HOLE_INSET_M);
  const inside = d.x.lessThan(edge).and(d.y.lessThan(edge));
  return inside.and(h.on.greaterThan(0.5)).not();
}

export interface LandMaterialOptions {
  sunVisibility?: (xz: N) => N;
  wetHeight?: (xz: N) => N;
  /** In place of the mesh's attributes (the patch reads them from textures): normal vec3, cover vec4, detail vec3, zones vec4. */
  inputs?: { normal?: N; cover?: N; detail?: N; zones?: N };
  /** The patch's square, cut out of the coarse land. */
  hole?: PatchHole;
  /** The patch's own terms: the rocks' grounding shadows (vec2: sun shadow, contact ring) and the sand's fine detail. */
  patch?: { shadow: (xz: N) => N };
}

/**
 * The land's material (spec §4.6–4.7): the cover's albedos with world-space detail (faded to averages with distance), lit
 * by the sun (× the sunlight map, × the heath canopy's self-shading) and the sky (× the baked sky view), a faint sky sheen
 * on wet sand, then aerial perspective.
 */
export function createLandMaterial(sky: Sky, u: LandLookUniforms, opts: LandMaterialOptions = {}): THREE.MeshBasicNodeMaterial {
  const sunVisibility = opts.sunVisibility;
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.FrontSide;
  const p = positionWorld;
  const inputs = opts.inputs ?? {};
  const n0 = normalize(inputs.normal ?? attribute('normal', 'vec3'));
  const cover = inputs.cover ?? attribute('cover', 'vec4');
  const det = inputs.detail ?? attribute('detail', 'vec3');
  const toCam = cameraPosition.sub(p);
  const dist = length(toCam);
  const v = toCam.div(max(dist, 1e-3));
  const l = sky.sunDirection;
  const fade = float(1.0).sub(smoothstep(300.0, 1500.0, dist));
  const n1 = mx_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 3.1)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(p.x.mul(0.25), p.z.mul(0.25), 7.3)).mul(0.5).add(0.5);
  const n3 = mx_noise_float(vec3(p.x.mul(0.12), p.z.mul(0.12), 1.7)).mul(0.5).add(0.5);
  const n4 = mx_noise_float(vec3(p.x.mul(2.6), p.z.mul(2.6), 9.9)).mul(0.5).add(0.5);

  const ripple = mx_noise_float(vec3(p.x.mul(1.3), p.z.mul(0.35), 5.0)).mul(0.08).mul(fade);
  // The patch's sand up close (Phase 4c-1 §3.2): fine grit and sparse shell flecks, faded out by 20 m (finer than a pixel
  // beyond; the coarse land never gets them).
  const near = float(1.0).sub(smoothstep(8.0, 20.0, dist));
  const grit = opts.patch ? mx_noise_float(vec3(p.x.mul(60.0), p.z.mul(60.0), 3.3)).mul(0.04).mul(near) : float(0.0);
  const flecks = opts.patch ? smoothstep(0.93, 0.97, mx_noise_float(vec3(p.x.mul(25.0), p.z.mul(25.0), 6.1)).mul(0.5).add(0.5)).mul(0.25).mul(near) : float(0.0);
  const dry = DRY_SAND.mul(ripple.add(0.97).add(grit).add(flecks)).mul(u.sandBrightness);
  const wet = WET_SAND.mul(n1.sub(0.5).mul(0.1).mul(fade).add(1.0)).mul(u.sandBrightness);
  const rock = mix(mix(ROCK_RUST, ROCK_GREY, det.y), ROCK_WEED, det.z).mul(mix(float(0.85), n1.mul(0.35).add(0.7), fade));
  const base = mix(HEATH_OLIVE, HEATH_SILVER, smoothstep(0.55, 0.8, n2.add(u.heathSilver).sub(0.35)).mul(0.85));
  const pig = mix(PIGFACE, PIGFACE_TIPS, smoothstep(0.55, 0.8, n1));
  const withPig = mix(base, pig, smoothstep(0.66, 0.74, n3.add(u.heathOrange).sub(0.12)));
  const withPink = mix(withPig, RICE_PINK, smoothstep(0.9, 0.95, n4).mul(0.8));
  const heathNear = mix(withPink, HEATH_GAP, smoothstep(0.35, 0.2, n1).mul(0.7));
  const heath = mix(HEATH_AVG, heathNear, fade).mul(u.heathBrightness);
  // The cover is per vertex (2–64 m apart), so noise-drawn clumps would come out as the mesh's squares. Near the camera
  // the toe's rock clumps and the dune rise's bushes and boulders are drawn per pixel instead, inside the bands the mesh
  // carries, replacing the per-vertex parts (Andrew's aerial review, 2026-09-28); far away the per-vertex cover stands.
  const zones = inputs.zones ?? attribute('zones', 'vec4');
  const px = (sx: number, seed: number): N => mx_noise_float(vec3(p.x.div(sx), p.z.div(sx), seed)).mul(0.5).add(0.5);
  const clumpsPx = zones.x.mul(smoothstep(0.43, 0.5, px(9.0, 4.24)));
  const bushPx = zones.y.mul(smoothstep(0.52, 0.57, px(7.0, 4.25)));
  const boulderPx = zones.y.mul(float(1.0).sub(bushPx)).mul(smoothstep(0.63, 0.67, px(5.0, 4.26)));
  const rF0 = max(cover.z.sub(zones.z).add(clumpsPx).add(boulderPx), 0.0);
  const hF0 = max(cover.w.sub(zones.w).add(bushPx), 0.0);
  const rF1 = mix(cover.z, rF0, fade), hF1 = mix(cover.w, hF0, fade);
  const scale = min(float(1.0), float(1.0).div(max(rF1.add(hF1), 1e-4)));
  const hF = hF1.mul(scale), rF = rF1.mul(scale);
  const rest = max(float(1.0).sub(hF).sub(rF), 0.0);
  const sandPair = cover.x.add(cover.y);
  const wetShare = select(sandPair.lessThan(1e-3), float(0.0), cover.x.div(max(sandPair, 1e-3)));
  // The wet line (Phase 4b §3.4): sand below the recent runup is wet; the intertidal band (the cover's wet share) stays damp
  // whatever the swash, so a low tide's exposed flat reads wet (final review I2). Without the surf, the cover's share alone.
  const wetH = opts.wetHeight ? opts.wetHeight(p.xz) : null;
  const wetness = wetH ? max(float(1.0).sub(smoothstep(wetH.sub(0.02), wetH.add(0.12), p.y)), wetShare.mul(0.8)) : wetShare;
  // The dry sand's wind ripples in the patch's shading normal: 12 cm apart, up to 0.8 cm crest to trough, crests along the beach
  // (north–south), wavering with noise, flattened where the sand is wet; faded out by 30 m (they'd alias beyond).
  let n: N = n0;
  if (opts.patch) {
    const phase = p.x.add(mx_noise_float(vec3(p.x.div(3.0), p.z.div(3.0), 8.8)).mul(0.6)).mul((2 * Math.PI) / 0.12);
    // Strength varies in patches (the wind leaves some sand smooth): 0.2–0.8 cm crest to trough.
    const patchy = mx_noise_float(vec3(p.x.div(6.0), p.z.div(6.0), 9.4)).mul(0.5).add(0.5).mul(0.6).add(0.2);
    const slope = cos(phase).mul(patchy).mul(0.004 * ((2 * Math.PI) / 0.12)).mul(float(1.0).sub(wetness)).mul(rest).mul(float(1.0).sub(smoothstep(12.0, 30.0, dist)));
    n = normalize(n0.sub(vec3(slope, 0.0, 0.0)));
  }
  const albedo = wet.mul(wetness.mul(rest)).add(dry.mul(float(1.0).sub(wetness).mul(rest))).add(rock.mul(rF)).add(heath.mul(hF));

  const vis = sunVisibility ? sunVisibility(p.xz) : float(1.0);
  const back = saturate(dot(v.negate(), l));
  const canopy = float(1.0).sub(hF.mul(0.55).mul(back).mul(float(1.0).sub(max(l.y, 0.0))));
  const shade = opts.patch ? opts.patch.shadow(p.xz) : null;
  const sunE = sky.sunIlluminance.mul(vis).mul(max(dot(n, l), 0.0)).mul(canopy).mul(step(0.0, l.y)).mul(shade ? float(1.0).sub(shade.x) : float(1.0));
  const skyE = sky.skyIrradiance.mul(det.x).mul(n.y.mul(0.5).add(0.5)).mul(shade ? float(1.0).sub(shade.y.mul(0.5)) : float(1.0));
  const r: N = reflect(v.negate(), n);
  const sheen = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z))).mul(schlickWater(max(dot(n, v), 0.0))).mul(wetness.mul(rest)).mul(0.6);
  const lit = albedo.mul(sunE.add(skyE)).div(PI).add(sheen);
  // Overlays: the cover map in false colours (wet blue, sand yellow, rock red, heath green); the sunlight map (shade blue).
  const white = sky.skyIrradiance.add(sky.sunIlluminance.mul(max(l.y, 0.0))).div(PI);
  const falseColour = vec3(0.1, 0.3, 1.0).mul(cover.x).add(vec3(1.0, 0.9, 0.3).mul(cover.y)).add(vec3(1.0, 0.2, 0.1).mul(cover.z)).add(vec3(0.2, 0.9, 0.2).mul(cover.w));
  const withCover = mix(lit, white.mul(falseColour).mul(0.6), u.coverOn);
  const withSun = mix(withCover, mix(withCover, white.mul(vec3(0.1, 0.2, 1.0)).mul(0.6), float(1.0).sub(vis).mul(0.7)), u.sunlightOn);
  m.colorNode = sky.applyAerialPerspective(withSun, dist, v.negate());
  if (opts.hole) m.maskNode = patchHoleMaskNode(p.xz, opts.hole);
  return m;
}
