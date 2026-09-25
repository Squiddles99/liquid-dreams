const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunAngles {
  /** Clockwise from true north, [0, 360). */
  azimuthDeg: number;
  /** Geometric elevation (no atmospheric refraction). */
  elevationDeg: number;
}

/** NOAA solar position algorithm (Meeus-based), accurate to ~0.01° for 1900–2100. */
export function sunPosition(latDeg: number, lonDeg: number, utc: Date): SunAngles {
  const jd = utc.getTime() / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;

  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * DEG) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG));

  const y = Math.tan((eps / 2) * DEG) ** 2;
  const eqTimeMin =
    4 * RAD *
    (y * Math.sin(2 * l0 * DEG) -
      2 * e * Math.sin(m * DEG) +
      4 * e * y * Math.sin(m * DEG) * Math.cos(2 * l0 * DEG) -
      0.5 * y * y * Math.sin(4 * l0 * DEG) -
      1.25 * e * e * Math.sin(2 * m * DEG));

  const minutesUtc = utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60 + utc.getUTCMilliseconds() / 60000;
  const trueSolarTime = (((minutesUtc + eqTimeMin + 4 * lonDeg) % 1440) + 1440) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const lat = latDeg * DEG;
  const ha = hourAngle * DEG;
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)));
  const elevationDeg = 90 - Math.acos(cosZenith) * RAD;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) * RAD + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, elevationDeg };
}

/** World-space unit vector toward the sun (+X east, +Y up, +Z south). */
export function sunDirectionWorld(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
