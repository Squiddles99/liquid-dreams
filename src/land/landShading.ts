import * as THREE from 'three/webgpu';
import { PI, attribute, cameraPosition, dot, float, length, max, mix, mx_noise_float, normalize, positionWorld, reflect, saturate, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { schlickWater } from '../ocean/waterShading';
import type { Sky } from '../sky/Sky';

type N = any;

/** Albedos (linear), set by eye against reference/place/ (spec §4.6). */
const DRY_SAND = vec3(0.62, 0.55, 0.42);
const WET_SAND = vec3(0.3, 0.26, 0.2);
const ROCK_RUST = vec3(0.3, 0.2, 0.13);
const ROCK_GREY = vec3(0.42, 0.4, 0.36);
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

/**
 * The land's material (spec §4.6–4.7): the cover's albedos with world-space detail (faded to averages with distance), lit
 * by the sun (× the sunlight map, × the heath canopy's self-shading) and the sky (× the baked sky view), a faint sky sheen
 * on wet sand, then aerial perspective.
 */
export function createLandMaterial(sky: Sky, u: LandLookUniforms, sunVisibility?: (xz: N) => N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.side = THREE.FrontSide;
  const p = positionWorld;
  const n = normalize(attribute('normal', 'vec3'));
  const cover = attribute('cover', 'vec4');
  const det = attribute('detail', 'vec2');
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
  const dry = DRY_SAND.mul(ripple.add(0.97)).mul(u.sandBrightness);
  const wet = WET_SAND.mul(n1.sub(0.5).mul(0.1).mul(fade).add(1.0)).mul(u.sandBrightness);
  const rock = mix(ROCK_RUST, ROCK_GREY, det.y).mul(mix(float(0.85), n1.mul(0.35).add(0.7), fade));
  const base = mix(HEATH_OLIVE, HEATH_SILVER, smoothstep(0.55, 0.8, n2.add(u.heathSilver).sub(0.35)).mul(0.85));
  const pig = mix(PIGFACE, PIGFACE_TIPS, smoothstep(0.55, 0.8, n1));
  const withPig = mix(base, pig, smoothstep(0.66, 0.74, n3.add(u.heathOrange).sub(0.12)));
  const withPink = mix(withPig, RICE_PINK, smoothstep(0.9, 0.95, n4).mul(0.8));
  const heathNear = mix(withPink, HEATH_GAP, smoothstep(0.35, 0.2, n1).mul(0.7));
  const heath = mix(HEATH_AVG, heathNear, fade).mul(u.heathBrightness);
  const albedo = wet.mul(cover.x).add(dry.mul(cover.y)).add(rock.mul(cover.z)).add(heath.mul(cover.w));

  const vis = sunVisibility ? sunVisibility(p.xz) : float(1.0);
  const back = saturate(dot(v.negate(), l));
  const canopy = float(1.0).sub(cover.w.mul(0.55).mul(back).mul(float(1.0).sub(max(l.y, 0.0))));
  const sunE = sky.sunIlluminance.mul(vis).mul(max(dot(n, l), 0.0)).mul(canopy).mul(step(0.0, l.y));
  const skyE = sky.skyIrradiance.mul(det.x).mul(n.y.mul(0.5).add(0.5));
  const r: N = reflect(v.negate(), n);
  const sheen = sky.radiance(normalize(vec3(r.x, max(r.y, 0.01), r.z))).mul(schlickWater(max(dot(n, v), 0.0))).mul(cover.x).mul(0.6);
  const lit = albedo.mul(sunE.add(skyE)).div(PI).add(sheen);
  // Overlays: the cover map in false colours (wet blue, sand yellow, rock red, heath green); the sunlight map (shade blue).
  const white = sky.skyIrradiance.add(sky.sunIlluminance.mul(max(l.y, 0.0))).div(PI);
  const falseColour = vec3(0.1, 0.3, 1.0).mul(cover.x).add(vec3(1.0, 0.9, 0.3).mul(cover.y)).add(vec3(1.0, 0.2, 0.1).mul(cover.z)).add(vec3(0.2, 0.9, 0.2).mul(cover.w));
  const withCover = mix(lit, white.mul(falseColour).mul(0.6), u.coverOn);
  const withSun = mix(withCover, mix(withCover, white.mul(vec3(0.1, 0.2, 1.0)).mul(0.6), float(1.0).sub(vis).mul(0.7)), u.sunlightOn);
  m.colorNode = sky.applyAerialPerspective(withSun, dist, v.negate());
  return m;
}
