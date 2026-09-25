import * as THREE from 'three/webgpu';
import { PI, abs, clamp, dot, exp, float, fract, max, pow, select, sign, sqrt, uniform, vec2 } from 'three/tsl';
import type { AtmosphereParams } from './atmosphereParams';

// TSL graphs are dynamically typed; N keeps signatures readable without fighting @types/three generics.
type N = any;

export function createAtmosphereUniforms(p: AtmosphereParams) {
  return {
    groundRadius: uniform(p.groundRadiusKm),
    topRadius: uniform(p.topRadiusKm),
    rayleighScattering: uniform(new THREE.Vector3(...p.rayleighScatteringPerKm)),
    rayleighScaleHeight: uniform(p.rayleighScaleHeightKm),
    mieScattering: uniform(p.mieScatteringPerKm * p.hazeFactor),
    mieExtinction: uniform(p.mieExtinctionPerKm * p.hazeFactor),
    mieScaleHeight: uniform(p.mieScaleHeightKm),
    mieG: uniform(p.mieG),
    ozoneAbsorption: uniform(new THREE.Vector3(...p.ozoneAbsorptionPerKm)),
    ozoneCenter: uniform(p.ozoneCenterKm),
    ozoneHalfWidth: uniform(p.ozoneHalfWidthKm),
    groundAlbedo: uniform(p.groundAlbedo),
    sunIlluminance: uniform(p.sunIlluminance),
    nightFloor: uniform(p.nightFloor),
  };
}

export type AtmosphereUniforms = ReturnType<typeof createAtmosphereUniforms>;

export function updateAtmosphereUniforms(u: AtmosphereUniforms, p: AtmosphereParams): void {
  u.groundRadius.value = p.groundRadiusKm;
  u.topRadius.value = p.topRadiusKm;
  u.rayleighScattering.value.set(...p.rayleighScatteringPerKm);
  u.rayleighScaleHeight.value = p.rayleighScaleHeightKm;
  u.mieScattering.value = p.mieScatteringPerKm * p.hazeFactor;
  u.mieExtinction.value = p.mieExtinctionPerKm * p.hazeFactor;
  u.mieScaleHeight.value = p.mieScaleHeightKm;
  u.mieG.value = p.mieG;
  u.ozoneAbsorption.value.set(...p.ozoneAbsorptionPerKm);
  u.ozoneCenter.value = p.ozoneCenterKm;
  u.ozoneHalfWidth.value = p.ozoneHalfWidthKm;
  u.groundAlbedo.value = p.groundAlbedo;
  u.sunIlluminance.value = p.sunIlluminance;
  u.nightFloor.value = p.nightFloor;
}

/** Nearest positive distance along rd from ro to a sphere centred at the origin; -1 if missed. */
export function raySphere(ro: N, rd: N, radius: N): N {
  const b = dot(ro, rd);
  const c = dot(ro, ro).sub(radius.mul(radius));
  const disc = b.mul(b).sub(c);
  const s = sqrt(max(disc, 0.0));
  const t0 = b.negate().sub(s);
  const t1 = b.negate().add(s);
  const t = select(t0.greaterThan(0.0), t0, t1);
  return select(disc.lessThan(0.0).or(t1.lessThan(0.0)), float(-1.0), t);
}

/** Scattering/extinction per km at altitude h (km). Rayleigh is RGB, Mie is grey. */
export function medium(u: AtmosphereUniforms) {
  const rayleighDensity = (h: N) => exp(h.negate().div(u.rayleighScaleHeight));
  const mieDensity = (h: N) => exp(h.negate().div(u.mieScaleHeight));
  const ozoneDensity = (h: N) => max(0.0, float(1.0).sub(abs(h.sub(u.ozoneCenter)).div(u.ozoneHalfWidth)));
  return {
    rayleigh: (h: N): N => u.rayleighScattering.mul(rayleighDensity(h)),
    mie: (h: N): N => u.mieScattering.mul(mieDensity(h)),
    extinction: (h: N): N =>
      u.rayleighScattering.mul(rayleighDensity(h)).add(u.mieExtinction.mul(mieDensity(h))).add(u.ozoneAbsorption.mul(ozoneDensity(h))),
  };
}

export const rayleighPhase = (cosT: N): N => float(3.0).div(PI.mul(16.0)).mul(cosT.mul(cosT).add(1.0));

/** Cornette–Shanks phase function. */
export function miePhase(cosT: N, g: N): N {
  const g2 = g.mul(g);
  const num = float(1.0).sub(g2).mul(cosT.mul(cosT).add(1.0)).mul(3.0);
  const den = PI.mul(8.0).mul(g2.add(2.0)).mul(pow(g2.add(1.0).sub(g.mul(cosT).mul(2.0)), 1.5));
  return num.div(den);
}

export function transmittanceUvFromRMu(u: AtmosphereUniforms, r: N, mu: N): N {
  const H = sqrt(u.topRadius.mul(u.topRadius).sub(u.groundRadius.mul(u.groundRadius)));
  const rho = sqrt(max(r.mul(r).sub(u.groundRadius.mul(u.groundRadius)), 0.0));
  const disc = r.mul(r).mul(mu.mul(mu).sub(1.0)).add(u.topRadius.mul(u.topRadius));
  const d = max(0.0, r.negate().mul(mu).add(sqrt(max(disc, 0.0))));
  const dMin = u.topRadius.sub(r);
  const dMax = rho.add(H);
  return vec2(d.sub(dMin).div(dMax.sub(dMin)), rho.div(H));
}

/** Returns vec2(r, mu). */
export function rMuFromTransmittanceUv(u: AtmosphereUniforms, uv: N): N {
  const H = sqrt(u.topRadius.mul(u.topRadius).sub(u.groundRadius.mul(u.groundRadius)));
  const rho: N = H.mul(uv.y); // N: an 'any' operand resolves @types/three overloads to vec3
  const r = sqrt(rho.mul(rho).add(u.groundRadius.mul(u.groundRadius)));
  const dMin = u.topRadius.sub(r);
  const dMax = rho.add(H);
  const d = dMin.add(uv.x.mul(dMax.sub(dMin)));
  const mu = select(d.lessThan(1e-6), float(1.0), H.mul(H).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2.0)));
  return vec2(r, clamp(mu, -1.0, 1.0));
}

export function skyViewUvFromAngles(elevation: N, azimuth: N): N {
  const s = sign(elevation).mul(sqrt(abs(elevation).div(PI.mul(0.5))));
  return vec2(fract(azimuth.div(PI.mul(2.0))), s.mul(0.5).add(0.5));
}

/** Returns vec2(elevation, azimuth). */
export function anglesFromSkyViewUv(uv: N): N {
  const s = uv.y.mul(2.0).sub(1.0);
  const elevation: N = sign(s).mul(s).mul(s).mul(PI.mul(0.5)); // N: see rMuFromTransmittanceUv
  return vec2(elevation, uv.x.mul(PI.mul(2.0)));
}

export function multiScatteringUv(u: AtmosphereUniforms, r: N, muS: N): N {
  return vec2(muS.mul(0.5).add(0.5), clamp(r.sub(u.groundRadius).div(u.topRadius.sub(u.groundRadius)), 0.0, 1.0));
}
