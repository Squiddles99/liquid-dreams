import { describe, expect, it } from 'vitest';
import { TrackNetwork, routeTracks } from '../land/tracks';
import { testLand } from '../land/testLand';
import { SCATTER_CELL_M, ScatterField, type ScatterContext, type ScatterItem, TUFT_RANGE_M, cellScatter } from './nearScatter';

const route = testLand();
const net = new TrackNetwork(routeTracks(route, [-300, 300]));
/** The test land with its tracks; crowns over a checkerboard of 3 m squares; limestone in a band 60–66 m inland. */
function context(density = 1): ScatterContext {
  return {
    land: { heightAt: (x, z) => route.baseHeightAt(x, z) - net.sinkAt(x, z), waterlineAt: (z) => route.waterlineAt(z), profile: route.profile, trackNetwork: net },
    plants: (x, z) => {
      const under = !net.onTrack(x, z) && (Math.floor(x / 3) + Math.floor(z / 3)) % 2 === 0 && x - 190 > 60;
      return { underCrown: under, crownKind: under ? 'daisy' : null };
    },
    surfaceAt: (x, z) => route.baseHeightAt(x, z) - net.sinkAt(x, z),
    density,
    rockNear: (x) => x - 190 > 60 && x - 190 < 66,
  };
}
/** The cells over the beach path and the clearing, and a stretch of heath beside the Cape to Cape. */
function cells(): [number, number][] {
  const out = new Map<string, [number, number]>();
  const add = (x: number, z: number): void => {
    const ci = Math.floor(x / SCATTER_CELL_M), cj = Math.floor(z / SCATTER_CELL_M);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) out.set(`${ci + a},${cj + b}`, [ci + a, cj + b]);
  };
  for (const [x, z] of net.data.pieces[1].points.filter((_, i) => i % 3 === 0)) add(x, z);
  for (const [x, z] of net.data.pieces[0].points.filter((_, i) => i % 3 === 0 && i > 500 && i < 560)) add(x, z);
  return [...out.values()];
}
const all = (ctx: ScatterContext): ScatterItem[] => cells().flatMap(([ci, cj]) => cellScatter(ci, cj, ctx));

describe('cellScatter (dune-up-close §4.4)', () => {
  const ctx = context();
  const items = all(ctx);
  it('lays a fair amount of each kind somewhere', () => {
    for (const k of ['tuft_clubrush', 'tuft_swordsedge', 'tuft_tussock', 'item_twig', 'item_stone', 'item_leaves_daisy', 'item_shell']) {
      expect(items.some((i) => i.kind === k), k).toBe(true);
    }
  });
  it('grows tussock-grass only on sand by the beach, and lays shells only within 60 m of the water', () => {
    const toe = route.profile.wetWidthM + route.profile.dryWidthM + route.profile.toeWidthM;
    for (const it of items.filter((i) => i.kind === 'tuft_tussock')) expect(it.x - 190).toBeLessThanOrEqual(toe + 2);
    for (const it of items.filter((i) => i.kind === 'item_shell')) expect(it.x - 190).toBeLessThanOrEqual(60);
  });
  it('grows no tuft on the beach below its back (none in the swash, even by the boulders there)', () => {
    const dryEnd = route.profile.wetWidthM + route.profile.dryWidthM;
    const wetRocks: ScatterContext = { ...context(), rockNear: (x) => x - route.waterlineAt(0) < 12 || (x - 190 > 60 && x - 190 < 66) };
    const tufts = all(wetRocks).filter((i) => i.kind.startsWith('tuft_'));
    expect(tufts.length).toBeGreaterThan(0);
    for (const it of tufts) expect(it.x - route.waterlineAt(it.z), it.kind).toBeGreaterThanOrEqual(dryEnd - 4);
  });
  it('grows sword-sedge only by limestone', () => {
    for (const it of items.filter((i) => i.kind === 'tuft_swordsedge')) expect(ctx.rockNear(it.x, it.z)).toBe(true);
  });
  it('keeps track centres all but bare (one item per 10 m at most) and grows no tufts on a track', () => {
    const onCentre = items.filter((i) => net.nearest(i.x, i.z).d < 0.2 && !net.inClearing(i.x, i.z));
    const length = net.data.pieces[1].points.length;
    expect(onCentre.length).toBeLessThanOrEqual(Math.ceil(length / 10) + 2);
    for (const it of items.filter((i) => i.kind.startsWith('tuft_'))) expect(net.onTrack(it.x, it.z)).toBe(false);
  });
  it('sits each item on the ground, sunk 1–2 cm', () => {
    for (const it of items.slice(0, 400)) {
      const g = ctx.surfaceAt(it.x, it.z);
      expect(g - it.y).toBeGreaterThanOrEqual(0.01 - 1e-6);
      expect(g - it.y).toBeLessThanOrEqual(0.02 + 1e-6);
    }
  });
  it("tilts each item onto the ground's normal, tufts half as much", () => {
    let sloped = 0;
    for (const it of items) {
      const sx = (ctx.surfaceAt(it.x + 0.25, it.z) - ctx.surfaceAt(it.x - 0.25, it.z)) / 0.5, sz = (ctx.surfaceAt(it.x, it.z + 0.25) - ctx.surfaceAt(it.x, it.z - 0.25)) / 0.5;
      const lean = it.kind.startsWith('tuft_') ? 0.5 : 1;
      expect(it.upX).toBeCloseTo(-sx * lean, 6);
      expect(it.upZ).toBeCloseTo(-sz * lean, 6);
      if (Math.hypot(sx, sz) > 0.1) sloped++;
    }
    expect(sloped).toBeGreaterThan(20);
  });
  it('lays the same items for a cell whatever else is asked', () => {
    const [ci, cj] = cells()[40];
    expect(cellScatter(ci, cj, ctx)).toEqual(cellScatter(ci, cj, context()));
  });
  it('with plant density 0 keeps the stones and twigs and grows no tufts (Review Focus 2)', () => {
    const none = all(context(0));
    expect(none.some((i) => i.kind.startsWith('tuft_'))).toBe(false);
    expect(none.some((i) => i.kind === 'item_stone')).toBe(true);
  });
});

describe('ScatterField (dune-up-close §4.4, §5: a share per frame)', () => {
  // A clock that moves 0.25 ms each time it's read: the field reads it after each cell it lays.
  const clock = (): (() => number) => {
    let t = 0;
    return () => (t += 0.25);
  };
  const [x0, z0] = net.data.pieces[1].points[30];
  it('lays the missing cells nearest first, a budget a frame, until the ring is whole', () => {
    const f = new ScatterField(1, clock());
    let pending = f.gather(x0, z0, context());
    const first = f.near.length;
    expect(pending).toBeGreaterThan(300);
    const laid = f.cellCount;
    expect(laid).toBeLessThanOrEqual(5);
    // Nearest first: every cell laid is at least as near as any still to come.
    expect(f.farthestLaidM()).toBeLessThanOrEqual(f.nearestPendingM() + 1e-9);
    let frames = 1;
    while (pending > 0 && frames < 500) {
      pending = f.gather(x0, z0, context());
      frames++;
    }
    expect(pending).toBe(0);
    expect(f.near.length).toBeGreaterThan(first);
    // The whole ring, as laying every cell at once gives.
    const n = Math.ceil(TUFT_RANGE_M / SCATTER_CELL_M), ci0 = Math.floor(x0 / SCATTER_CELL_M), cj0 = Math.floor(z0 / SCATTER_CELL_M);
    let want = 0;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const ci = ci0 + di, cj = cj0 + dj;
      if (Math.hypot((ci + 0.5) * SCATTER_CELL_M - x0, (cj + 0.5) * SCATTER_CELL_M - z0) <= TUFT_RANGE_M + 2) want += cellScatter(ci, cj, context()).length;
    }
    expect(f.near.length).toBe(want);
  });
  it('keeps its cache to the cells near the camera (trimmed by distance, never wiped)', () => {
    const f = new ScatterField(1e9);
    f.gather(x0, z0, context());
    const before = f.cellCount;
    f.gather(x0 + 120, z0, context());
    expect(f.maxCellDistanceM(x0 + 120, z0)).toBeLessThanOrEqual(TUFT_RANGE_M + 32);
    // Walking back a metre lays nothing new near the camera: its cells are still there.
    const kept = f.cellCount;
    f.gather(x0 + 121, z0, context());
    expect(f.cellCount - kept).toBeLessThan(40);
    expect(before).toBeGreaterThan(300);
  });
});

