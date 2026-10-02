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
  /** Tilts (radians) about x and z, following the ground's slope (half of it for tufts: they stand up). */
  tiltX: number;
  tiltZ: number;
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
    const tx = (ctx.surfaceAt(x, z + 0.25) - ctx.surfaceAt(x, z - 0.25)) / 0.5, tz = (ctx.surfaceAt(x + 0.25, z) - ctx.surfaceAt(x - 0.25, z)) / 0.5;
    const lean = kind.startsWith('tuft_') ? 0.5 : 1;
    out.push({
      kind, variant: Math.floor(r(3) * SCATTER_VARIANTS[kind]) % SCATTER_VARIANTS[kind], x, z,
      y: s - (0.01 + 0.01 * r(4)), yaw: r(5) * Math.PI * 2, tiltX: Math.atan(tx) * lean, tiltZ: -Math.atan(tz) * lean,
      scale: 0.8 + 0.4 * r(6), seed: r(7),
    });
  }
  return out;
}
