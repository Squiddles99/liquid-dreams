import { type MeshArrays, PART, extrudePolygon, finish, newBuilder } from './boardGeometry';

/**
 * A bodyboarder's swim fin (spec §4.3), in the character's rest frame at the ankle: a foot pocket from the heel
 * (6 cm behind the ankle) to the toes, and a blade 22 cm past them; thickness along y, pointing +z.
 */
export function buildSwimFin(): MeshArrays {
  const b = newBuilder();
  const outline: [number, number][] = [[-0.05, -0.06], [0.05, -0.06], [0.055, 0.2], [0.095, 0.42], [-0.095, 0.42], [-0.055, 0.2]];
  // Polygon in (x, forward); a +90° turn about x lays it flat: (x, y, z) → (x, -z, y).
  extrudePolygon(b, outline, 0.012, PART.fin, (x, y, z) => [x, -z, y]);
  return finish(b);
}
