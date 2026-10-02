import { hash3 } from '../beach/procedural';
import { coverAt } from '../land/landCover';
import type { BeachProfile } from '../land/landHeight';
import type { TrackNetwork } from '../land/tracks';

/** The near scatter's kinds (dune-up-close §4.4): the grasses and sedges, and the heath's own fallen debris. */
export type ScatterKind = 'tuft_clubrush' | 'tuft_swordsedge' | 'tuft_tussock' | 'item_twig' | 'item_leaves_daisy' | 'item_leaves_tall' | 'item_shell' | 'item_stone';
export const SCATTER_VARIANTS: Record<ScatterKind, number> = {
  tuft_clubrush: 4, tuft_swordsedge: 4, tuft_tussock: 4, item_twig: 6, item_leaves_daisy: 4, item_leaves_tall: 4, item_shell: 6, item_stone: 6,
};

export interface ScatterItem {
  kind: ScatterKind;
  variant: number;
  x: number;
  z: number;
  /** The base, sunk 1–2 cm into the surface. */
  y: number;
  yaw: number;
  /**
   * The item's up, (upX, 1, upZ) normalised: the ground's normal (−∂y/∂x, 1, −∂y/∂z), its lean halved for tufts (they
   * stand up). The yaw turns the item about it.
   */
  upX: number;
  upZ: number;
  scale: number;
  seed: number;
}

/** What placing the scatter needs of the world. */
export interface ScatterContext {
  land: { heightAt(x: number, z: number): number; waterlineAt(z: number): number; profile: BeachProfile; trackNetwork: TrackNetwork | null };
  /** Whether (x, z) is under a shrub's crown, and that shrub's kind. */
  plants(x: number, z: number): { underCrown: boolean; crownKind: string | null };
  /** The patch's surface (groundHeights.patchSurfaceAt) where items sit. */
  surfaceAt(x: number, z: number): number;
  /** The Land folder's bush density (0 grows no tufts; the debris stays). */
  density: number;
  /** Whether limestone shows within 2 m (the gully, the outcrops). */
  rockNear(x: number, z: number): boolean;
}

/** Cells of 2 m; tufts within 20 m of the camera, the ground items within 12 m. */
export const SCATTER_CELL_M = 2;
export const TUFT_RANGE_M = 20;
export const ITEM_RANGE_M = 12;
const CANDIDATES = 24;

/** The scatter of cell (ci, cj): the same whatever the camera (each candidate hashed from the cell and its index). */
export function cellScatter(ci: number, cj: number, ctx: ScatterContext): ScatterItem[] {
  const out: ScatterItem[] = [];
  const { land } = ctx, tracks = land.trackNetwork, p = land.profile;
  const dryEnd = p.wetWidthM + p.dryWidthM, toeEnd = dryEnd + p.toeWidthM;
  for (let k = 0; k < CANDIDATES; k++) {
    const r = (q: number): number => hash3(ci * 7919 + 13, cj * 104729 + 17, k * 31 + q);
    const x = (ci + r(0)) * SCATTER_CELL_M, z = (cj + r(1)) * SCATTER_CELL_M;
    const d = x - land.waterlineAt(z);
    if (d < 0) continue;
    const roll = r(2);
    const worn = tracks ? tracks.wornAt(x, z) : 0, inClearing = tracks ? tracks.inClearing(x, z) : false;
    let kind: ScatterKind | null = null;
    if (inClearing) {
      if (roll < 0.03) kind = 'item_stone';
    } else if (worn > 0.95) {
      kind = roll < 0.008 ? 'item_stone' : roll < 0.016 ? 'item_twig' : null;
    } else if (worn > 0.3) {
      const crown = ctx.plants(x, z).crownKind;
      kind = roll < 0.25 ? 'item_twig' : roll < 0.45 ? (crown === 'tall' ? 'item_leaves_tall' : 'item_leaves_daisy') : roll < 0.5 ? 'item_stone' : null;
    } else {
      const h = land.heightAt(x, z);
      const gx = (land.heightAt(x + 1, z) - land.heightAt(x - 1, z)) / 2, gz = (land.heightAt(x, z + 1) - land.heightAt(x, z - 1)) / 2;
      const c = coverAt(d, 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz), x, z, h, p);
      const under = ctx.plants(x, z);
      if (d <= toeEnd + 2 && c.sand + c.wet > 0.5) {
        // Sand: the foredune's tussock-grass by the back of the beach; shell fragments nearer the water.
        if (d >= dryEnd - 4 && roll < 0.06 * ctx.density) kind = 'tuft_tussock';
        else if (d <= 60 && roll > 0.96) kind = 'item_shell';
      } else if (ctx.rockNear(x, z)) {
        kind = roll < 0.2 * ctx.density ? 'tuft_swordsedge' : roll < 0.35 ? 'item_stone' : null;
      } else if (under.underCrown) {
        kind = roll < 0.45 ? (under.crownKind === 'tall' ? 'item_leaves_tall' : 'item_leaves_daisy') : roll < 0.7 ? 'item_twig' : null;
      } else if (c.heath > 0.5) {
        kind = roll < 0.18 * ctx.density ? 'tuft_clubrush' : roll < 0.26 ? 'item_twig' : roll < 0.29 ? 'item_stone' : null;
      } else if (d <= 60 && roll > 0.97) {
        kind = 'item_shell';
      }
    }
    if (!kind) continue;
    if (kind.startsWith('tuft_') && tracks?.onTrack(x, z)) continue;
    // Nothing grows on the open beach or in the swash, even by the boulders there (gate 2: sedges stood in the water).
    if (kind.startsWith('tuft_') && d < dryEnd - 4) continue;
    const s = ctx.surfaceAt(x, z);
    const sx = (ctx.surfaceAt(x + 0.25, z) - ctx.surfaceAt(x - 0.25, z)) / 0.5, sz = (ctx.surfaceAt(x, z + 0.25) - ctx.surfaceAt(x, z - 0.25)) / 0.5;
    const lean = kind.startsWith('tuft_') ? 0.5 : 1;
    out.push({
      kind, variant: Math.floor(r(3) * SCATTER_VARIANTS[kind]) % SCATTER_VARIANTS[kind], x, z,
      y: s - (0.01 + 0.01 * r(4)), yaw: r(5) * Math.PI * 2, upX: -sx * lean, upZ: -sz * lean,
      scale: 0.8 + 0.4 * r(6), seed: r(7),
    });
  }
  return out;
}

/** Cached cells farther than this beyond the tuft range from the camera are dropped. */
const CACHE_SLACK_M = 30;

/**
 * The near scatter's cells around the camera (spec §4.4, §5): each laid once by cellScatter and cached; missing cells
 * laid nearest first within a time budget a frame (a jump, a recentre or a Land edit would otherwise lay the whole
 * 20 m ring, about 370 cells, in one frame); the cache trimmed by distance, never wiped.
 */
export class ScatterField {
  /** The items within reach, from the cells laid so far. */
  near: ScatterItem[] = [];
  private readonly cells = new Map<number, { ci: number; cj: number; items: ScatterItem[] }>();
  private at: [number, number] = [0, 0];
  private pending: { ci: number; cj: number; d: number }[] = [];

  constructor(private readonly budgetMs = 1, private readonly now: () => number = () => performance.now()) {}

  /**
   * Gathers the cells within reach of (x, z): those cached at once, then the missing ones nearest first until the
   * budget is spent (at least one). Returns the cells still to lay (call again next frame while it's above 0).
   */
  gather(x: number, z: number, ctx: ScatterContext): number {
    this.at = [x, z];
    const n = Math.ceil(TUFT_RANGE_M / SCATTER_CELL_M), ci0 = Math.floor(x / SCATTER_CELL_M), cj0 = Math.floor(z / SCATTER_CELL_M);
    const ring: { ci: number; cj: number; d: number }[] = [];
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const ci = ci0 + di, cj = cj0 + dj;
        const d = Math.hypot((ci + 0.5) * SCATTER_CELL_M - x, (cj + 0.5) * SCATTER_CELL_M - z);
        if (d <= TUFT_RANGE_M + 2) ring.push({ ci, cj, d });
      }
    }
    const missing = ring.filter((c) => !this.cells.has(cellKey(c.ci, c.cj))).sort((a, b) => a.d - b.d);
    const t0 = this.now();
    let laid = 0;
    for (const c of missing) {
      this.cells.set(cellKey(c.ci, c.cj), { ci: c.ci, cj: c.cj, items: cellScatter(c.ci, c.cj, ctx) });
      laid++;
      if (this.now() - t0 >= this.budgetMs) break;
    }
    this.pending = missing.slice(laid);
    const near: ScatterItem[] = [];
    for (const c of ring) for (const it of this.cells.get(cellKey(c.ci, c.cj))?.items ?? []) near.push(it);
    this.near = near;
    for (const [k, c] of this.cells) if (this.distanceM(c, x, z) > TUFT_RANGE_M + CACHE_SLACK_M) this.cells.delete(k);
    return this.pending.length;
  }

  /** Forgets every cell (the land, the tracks or the Land folder changed). */
  clear(): void {
    this.cells.clear();
    this.near = [];
    this.pending = [];
  }

  get cellCount(): number {
    return this.cells.size;
  }

  /** The farthest cached cell from the last gather's spot, the nearest still to lay, and the farthest from (x, z). */
  farthestLaidM(): number {
    let m = 0;
    for (const c of this.cells.values()) m = Math.max(m, this.distanceM(c, this.at[0], this.at[1]));
    return m;
  }

  nearestPendingM(): number {
    return this.pending.length ? this.pending[0].d : Infinity;
  }

  maxCellDistanceM(x: number, z: number): number {
    let m = 0;
    for (const c of this.cells.values()) m = Math.max(m, this.distanceM(c, x, z));
    return m;
  }

  private distanceM(c: { ci: number; cj: number }, x: number, z: number): number {
    return Math.hypot((c.ci + 0.5) * SCATTER_CELL_M - x, (c.cj + 0.5) * SCATTER_CELL_M - z);
  }
}

function cellKey(ci: number, cj: number): number {
  return (ci + 0x8000) * 0x10000 + (cj + 0x8000);
}

