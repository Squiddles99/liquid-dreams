import { PLANT_CELL_M } from './plants';

/**
 * The bands (dune-up-close §3.1): near 0–10 m, mid 10–40 m, far beyond, each boundary cross-faded over 3 m. (The spec's
 * 12 m near band came in at 10 m in the GPU budget pass: L0 is the costliest per plant.)
 */
export const NEAR_M = 10;
export const MID_M = 40;
export const BAND_FADE_M = 3;
/** A ring move's adds within this distance go ahead of its drops. */
const NEAR_FIRST_M = 50;

export interface CellChange {
  key: number;
  ci: number;
  cj: number;
  add: boolean;
}

/**
 * The CPU time a frame may spend laying cells (dune-up-close §5): 2 ms while walking; a fresh fill (the land's arrival,
 * a jump, a slider edit: over FILL_CELLS waiting) 8 ms, about 30 frames for the ~8,000 cells within 200 m at ~30 µs a
 * new cell (measured in the game, 2026-10-02).
 */
export const LAY_BUDGET_MS = 2;
export const FILL_CELLS = 1000;
export const FILL_BUDGET_MS = 8;
export const layBudgetMs = (queued: number): number => (queued > FILL_CELLS ? FILL_BUDGET_MS : LAY_BUDGET_MS);

export const cellKey = (ci: number, cj: number): number => (ci + 0x8000) * 0x10000 + (cj + 0x8000);

/**
 * The 4 m plant cells whose centres lie between `innerM` (less a cell's diagonal, so no plant inside the ring is
 * missed) and `radiusM` of the camera, diffed move by move: only the cells that enter or leave are laid or dropped
 * (spec §4.5; the whole field was relaid every 3 m, at 3.1 ms).
 */
export class PlantRing {
  private held = new Map<number, [number, number]>();

  constructor(private readonly radiusM: number, private readonly innerM = 0) {}

  move(x: number, z: number): CellChange[] {
    const want = new Map<number, [number, number]>(), n = Math.ceil(this.radiusM / PLANT_CELL_M) + 1;
    const inner = Math.max(0, this.innerM - PLANT_CELL_M * Math.SQRT2);
    const ci0 = Math.floor(x / PLANT_CELL_M), cj0 = Math.floor(z / PLANT_CELL_M);
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const ci = ci0 + di, cj = cj0 + dj;
        const d = Math.hypot((ci + 0.5) * PLANT_CELL_M - x, (cj + 0.5) * PLANT_CELL_M - z);
        if (d <= this.radiusM && d >= inner) want.set(cellKey(ci, cj), [ci, cj]);
      }
    }
    const drops: CellChange[] = [], adds: CellChange[] = [];
    for (const [k, [ci, cj]] of this.held) if (!want.has(k)) drops.push({ key: k, ci, cj, add: false });
    for (const [k, [ci, cj]] of want) if (!this.held.has(k)) adds.push({ key: k, ci, cj, add: true });
    this.held = want;
    // The adds within NEAR_FIRST_M first, nearest first (the cells about to be seen); then the drops (cheap, and they free
    // their meshes' slots before the bulk of a fill); then the rest of the adds, nearer first. A cell left behind by a
    // jump is shrunk to nothing beyond 200 m by the shader until it's dropped.
    const d = (c: CellChange): number => Math.hypot((c.ci + 0.5) * PLANT_CELL_M - x, (c.cj + 0.5) * PLANT_CELL_M - z);
    adds.sort((a, b) => d(a) - d(b));
    const k = adds.findIndex((c) => d(c) > NEAR_FIRST_M);
    const first = k < 0 ? adds : adds.slice(0, k), rest = k < 0 ? [] : adds.slice(k);
    return [...first, ...drops, ...rest];
  }

  /** Whether cell `key` is in the ring (as of the last move). */
  has(key: number): boolean {
    return this.held.has(key);
  }

  /** Forget every cell: the next move adds them all again. */
  reset(): void {
    this.held.clear();
  }
}

/**
 * The cells waiting to be laid or dropped, one change per cell: a later push for a cell replaces its change but keeps its
 * place in line (a re-seat or a level-of-detail crossing never piles up behind the first fill).
 */
export class CellQueue {
  private readonly items = new Map<number, CellChange>();

  push(...changes: CellChange[]): void {
    for (const c of changes) this.items.set(c.key, c);
  }

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  drain(run: (c: CellChange) => void, budgetMs: number, now: () => number = () => performance.now()): number {
    const t0 = now();
    for (const [key, c] of this.items) {
      this.items.delete(key);
      run(c);
      if (now() - t0 >= budgetMs) break;
    }
    return this.items.size;
  }
}

/** Work spread over frames: each drain runs items until its budget is spent (at least one). */
export class WorkQueue<T> {
  private items: T[] = [];

  push(...items: T[]): void {
    for (const t of items) this.items.push(t);
  }

  get length(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  drain(run: (t: T) => void, budgetMs: number, now: () => number = () => performance.now()): number {
    const t0 = now();
    let i = 0;
    while (i < this.items.length) {
      run(this.items[i++]);
      if (now() - t0 >= budgetMs) break;
    }
    this.items = this.items.slice(i);
    return this.items.length;
  }
}
