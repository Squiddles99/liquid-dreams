import { type Builder, type MeshArrays, PART, extrudePolygon, finish, newBuilder } from './boardGeometry';

const RING = 14;
const SECTIONS = 16;

/** A point on the rounded (superellipse) section at angle a: half-width w, from y = bot to top. */
function section(a: number, w: number, bot: number, top: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a), e = 0.6;
  return [w * Math.sign(c) * Math.abs(c) ** e, (bot + top) / 2 + ((top - bot) / 2) * Math.sign(s) * Math.abs(s) ** e];
}

/** The rubber foot pocket: a closed shell lofted from behind the heel to past the toes, capped at both ends. */
function pocket(b: Builder, heelZ: number, tipZ: number, halfW: number): void {
  const push = (x: number, y: number, z: number): number => {
    b.p.push(x, y, z);
    b.uv.push(0, 0);
    b.part.push(PART.fin);
    return b.p.length / 3 - 1;
  };
  const rings: number[][] = [];
  for (let i = 0; i <= SECTIONS; i++) {
    const s = i / SECTIONS, z = heelZ + s * (tipZ - heelZ);
    // Narrow at the heel, widest across the ball of the foot, rounded shut at both ends.
    let k = 0.72 + 0.28 * Math.sin((Math.PI / 2) * Math.min(1, s / 0.62));
    if (s > 0.8) k *= Math.sqrt(Math.max(0.02, 1 - ((s - 0.8) / 0.2) ** 2));
    if (s < 0.1) k *= Math.sqrt(Math.max(0.02, 1 - ((0.1 - s) / 0.1) ** 2));
    // Up the back of the heel, highest over the instep, low over the toes.
    const top = s < 0.3 ? 0.055 + (0.09 - 0.055) * (s / 0.3) : 0.09 - (0.09 - 0.032) * Math.min(1, (s - 0.3) / 0.6);
    const bot = -0.012, h = bot + (top - bot) * Math.max(0.15, k);
    rings.push(Array.from({ length: RING }, (_, j) => push(...section((2 * Math.PI * j) / RING, halfW * k, bot, h), z)));
  }
  for (let i = 0; i < SECTIONS; i++)
    for (let j = 0; j < RING; j++) {
      const j1 = (j + 1) % RING, a = rings[i][j], c = rings[i][j1], d = rings[i + 1][j], e = rings[i + 1][j1];
      b.idx.push(a, c, d, c, e, d);
    }
  const cap = (ring: number[], z: number, flip: boolean): void => {
    const y = ring.reduce((s, v) => s + b.p[3 * v + 1], 0) / RING, m = push(0, y, z);
    for (let j = 0; j < RING; j++) {
      const j1 = (j + 1) % RING;
      if (flip) b.idx.push(m, ring[j1], ring[j]);
      else b.idx.push(m, ring[j], ring[j1]);
    }
  };
  cap(rings[0], heelZ, true);
  cap(rings[SECTIONS], tipZ, false);
}

/**
 * A bodyboarder's swim fin (spec §4.3), in the character's rest frame with the ankle above the origin and the sole on
 * y = 0, pointing +z: a rubber pocket the whole foot sits in, heel to toes (gate 2, Andrew: "his toes should be inside
 * the fins"), and a flat blade from under the ball of the foot to 22 cm past the toes. `toeTip` is how far the toes
 * reach ahead of the ankle.
 */
export function buildSwimFin(toeTip = 0.2): MeshArrays {
  const b = newBuilder();
  const heelZ = -(0.34 * toeTip + 0.012), tipZ = toeTip + 0.03, halfW = 0.25 * toeTip + 0.014;
  pocket(b, heelZ, tipZ, halfW);
  const start = 0.5 * toeTip, end = toeTip + 0.22;
  const outline: [number, number][] = [[-0.9 * halfW, start], [0.9 * halfW, start], [0.095, end], [-0.095, end]];
  // Polygon in (x, forward); a +90° turn about x lays it flat: (x, y, z) → (x, -z, y), 6 mm either side of y = -6 mm.
  extrudePolygon(b, outline, 0.006, PART.fin, (x, y, z) => [x, -z - 0.006, y]);
  return finish(b);
}
