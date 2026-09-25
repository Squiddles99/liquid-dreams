export const TRANSMITTANCE_LUT = { width: 256, height: 64 } as const;
export const MULTI_SCATTERING_LUT = { width: 32, height: 32 } as const;
export const SKY_VIEW_LUT = { width: 192, height: 108 } as const;

export interface AtmosphereRadii {
  groundRadiusKm: number;
  topRadiusKm: number;
}

const horizonDistance = (a: AtmosphereRadii) => Math.sqrt(a.topRadiusKm ** 2 - a.groundRadiusKm ** 2);

/** Bruneton/Hillaire transmittance parameterisation. Covers every ray that does not hit the ground. */
export function transmittanceUvToRMu(u: number, v: number, a: AtmosphereRadii): { r: number; mu: number } {
  const H = horizonDistance(a);
  const rho = H * v;
  const r = Math.sqrt(rho * rho + a.groundRadiusKm ** 2);
  const dMin = a.topRadiusKm - r;
  const dMax = rho + H;
  const d = dMin + u * (dMax - dMin);
  const mu = d < 1e-6 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d);
  return { r, mu: Math.max(-1, Math.min(1, mu)) };
}

export function transmittanceRMuToUv(r: number, mu: number, a: AtmosphereRadii): { u: number; v: number } {
  const H = horizonDistance(a);
  const rho = Math.sqrt(Math.max(0, r * r - a.groundRadiusKm ** 2));
  const disc = r * r * (mu * mu - 1) + a.topRadiusKm ** 2;
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)));
  const dMin = a.topRadiusKm - r;
  const dMax = rho + H;
  return { u: (d - dMin) / (dMax - dMin), v: rho / H };
}

/** u = azimuth from the sun / 2π; v concentrates texels near the horizon (v = 0.5). */
export function skyViewAnglesToUv(elevation: number, azimuth: number): { u: number; v: number } {
  const turns = azimuth / (2 * Math.PI);
  const s = Math.sign(elevation) * Math.sqrt(Math.abs(elevation) / (Math.PI / 2));
  return { u: turns - Math.floor(turns), v: 0.5 + 0.5 * s };
}

export function skyViewUvToAngles(u: number, v: number): { elevation: number; azimuth: number } {
  const s = 2 * v - 1;
  return { elevation: Math.sign(s) * s * s * (Math.PI / 2), azimuth: u * 2 * Math.PI };
}
