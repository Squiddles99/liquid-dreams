import { type Strike, strikesBetween } from './rainModel';

/**
 * Lightning (weather W2 Task 6): the storm's strikes (rainModel.strikesBetween) as flashes. A flash is two or three
 * return strokes in half a second; what shows at any sim time comes straight from the schedule, so a paused or linked
 * moment shows the same flash, and each strike fires (for the thunder) exactly once as the clock runs.
 */
export const FLASH_LENGTH_S = 0.6;
/** Return strokes: when after the first (s) and how bright. */
const STROKES: ReadonlyArray<readonly [number, number]> = [[0, 1], [0.07, 0.6], [0.19, 0.85], [0.33, 0.35]];
const STROKE_DECAY_S = 0.03;
/** A strike this close lights the sky fully; farther ones fade with distance^1.5 (to a floor: a far flash still shows). */
const FULL_FLASH_M = 6000;

export function flashEnvelope(dtS: number): number {
  if (!(dtS >= 0) || dtS > FLASH_LENGTH_S) return 0;
  let v = 0;
  for (const [at, amp] of STROKES) if (dtS >= at) v += amp * Math.exp(-(dtS - at) / STROKE_DECAY_S);
  return Math.min(1, v);
}

export function flashFalloff(distanceM: number): number {
  return Math.min(1, Math.max(0.05, (FULL_FLASH_M / distanceM) ** 1.5));
}

export interface LightningFrame {
  /** Strikes that happened since the last frame (for the thunder). */
  fired: Strike[];
  /** How bright the brightest flash is now (0..1, with the distance falloff), and which strike it is. */
  flash: number;
  strike: Strike | null;
}

/** Frame steps longer than this are jumps (a scrub, a link): no backlog of strikes fires across them. */
const MAX_STEP_S = 1;

export class LightningClock {
  private last: number | null = null;

  update(seed: number, storm: number, simTimeS: number): LightningFrame {
    const last = this.last;
    this.last = simTimeS;
    const fired = last !== null && simTimeS > last && simTimeS - last <= MAX_STEP_S ? strikesBetween(seed, storm, last, simTimeS) : [];
    let flash = 0, strike: Strike | null = null;
    for (const s of strikesBetween(seed, storm, simTimeS - FLASH_LENGTH_S, simTimeS + 1e-9)) {
      const f = flashEnvelope(simTimeS - s.t) * flashFalloff(s.distanceM);
      if (f > flash) { flash = f; strike = s; }
    }
    return { fired, flash, strike };
  }
}

/** mulberry32: a small seeded generator. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cloud-to-ground bolt's path, local to its foot (m): from the cloud base straight down, zig-zagging a few tens of
 * metres a step, the same for the same seed.
 */
export function boltPath(seed: number, baseM: number, segments = 24): [number, number, number][] {
  const r = rng(seed);
  const pts: [number, number, number][] = [];
  let x = 0, z = 0;
  const step = baseM / segments;
  for (let i = 0; i <= segments; i++) {
    pts.push([x, baseM - i * step, z]);
    x += (r() - 0.5) * step * 1.4;
    z += (r() - 0.5) * step * 1.4;
  }
  // The foot lands where the strike is: shift the whole path so its last point is at (0, 0, 0).
  const [fx, , fz] = pts[pts.length - 1];
  return pts.map(([px, py, pz]) => [px - fx, py, pz - fz]);
}
