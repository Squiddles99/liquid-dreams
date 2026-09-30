import { PI, cameraPosition, dot, float, length, max, mix, normalize, positionWorld, pow, step } from 'three/tsl';
import type { Sky } from '../sky/Sky';

type N = any;

/** A lit, wet or glossy surface under the real sky (the rocks' lighting plus a sun highlight and a sky sheen). */
export interface SurfaceLook {
  albedo: N;
  normal: N;
  /** Reflectance at normal incidence (0.02–0.05 for skin, water films, resin and neoprene). */
  specular: N;
  /** Blinn–Phong exponent: higher is tighter and wetter. */
  shininess: N;
  /** Wrap lighting for soft, skin-like terminators (0 = none). */
  wrap?: N;
  /**
   * Per-channel reach of the wrapped light past the terminator (skin: red reaches furthest; closeup spec §4.2). Without
   * it every channel wraps alike, as before.
   */
  scatter?: N;
  /** Extra sunlit radiance factor (vec3), added with the sun's highlight: the hair's anisotropic highlights. */
  sunExtra?: N;
}

/** Light bounced up off the sea onto undersides (the sea's albedo). */
const SEA_BOUNCE = 0.06;

export function litColor(sky: Sky, look: SurfaceLook, sunVisibility?: (xz: N) => N): N {
  const n = normalize(look.normal);
  const l = sky.sunDirection;
  const up = step(0.0, l.y);
  const vis = sunVisibility ? sunVisibility(positionWorld.xz) : float(1.0);
  const wrap = look.wrap ?? float(0.0);
  const wrapped = max(dot(n, l).add(wrap).div(wrap.add(1.0)), 0.0);
  const diffuse = look.scatter ? mix(max(dot(n, l), 0.0), wrapped, look.scatter) : wrapped;
  const sunE = sky.sunIlluminance.mul(vis).mul(diffuse).mul(up);
  const skyE = sky.skyIrradiance.mul(n.y.mul(0.5).add(0.5));
  const bounce = sky.sunIlluminance.mul(max(l.y, 0.0)).add(sky.skyIrradiance).mul(SEA_BOUNCE).mul(float(0.5).sub(n.y.mul(0.5)));
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const v = toCam.div(max(dist, 1e-3));
  const h = normalize(l.add(v));
  const fresnel = look.specular.add(float(1.0).sub(look.specular).mul(pow(float(1.0).sub(max(dot(n, v), 0.0)), 5.0)));
  const norm = look.shininess.add(2.0).div(8.0 * Math.PI);
  const sunSpec = sky.sunIlluminance.mul(vis).mul(up).mul(fresnel).mul(norm).mul(pow(max(dot(n, h), 0.0), look.shininess)).mul(max(dot(n, l), 0.0));
  const skySheen = sky.skyIrradiance.div(PI).mul(fresnel).mul(0.5);
  let color = look.albedo.mul(sunE.add(skyE).add(bounce)).div(PI).add(sunSpec).add(skySheen);
  if (look.sunExtra) color = color.add(sky.sunIlluminance.mul(vis).mul(up).mul(look.sunExtra));
  return sky.applyAerialPerspective(color, dist, v.negate());
}
