export type Vec2XZ = { x: number; z: number };

const DEG = Math.PI / 180;

/** Unit vector in world XZ pointing along a compass bearing (+X east, +Z south). */
export function bearingToWorldXZ(bearingDeg: number): Vec2XZ {
  const r = bearingDeg * DEG;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** Swell/wind given as "coming from" travels the opposite way. */
export function travelDirectionXZ(fromDeg: number): Vec2XZ {
  return bearingToWorldXZ(fromDeg + 180);
}
